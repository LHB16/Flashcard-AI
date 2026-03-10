"""
services/gemini_service.py - Gemini API integration with round-robin key rotation
Uses google-genai SDK — updated for Gemini 2.5 (stable, 2026)
Supports: single image, image batch, PDF batch scan — with detailed logging
"""
import io
import json
import random
import re
import threading
import time
from pathlib import Path
from typing import List, Optional, Callable

from google import genai
from google.genai import types
from PIL import Image as PILImage

from models.flashcard import Flashcard, QuestionType


EXTRACTION_PROMPT = """You are extracting a multiple-choice question from an exam image.

=== WHAT TO IGNORE ===
- Logos, watermarks, school/course names, page numbers, headers, footers
- Any decorative elements not part of the question or options

=== WHAT TO EXTRACT ===
The question stem and ALL answer options. Note:
- Options may be 2, 3, 4, 5 or more (not always A B C D)
- May require single OR multiple correct answers
- Options may be labeled with letters (A, B, C...) or numbers (1, 2, 3...)

=== SPECIAL CONTENT HANDLING ===
- Code snippets, programming syntax, math formulas: preserve EXACTLY as written,
  including indentation, operators (==, !=, >=, &&, ||), and special characters
- Greek letters, arrows, symbols (λ, Σ, →, ≥, ≠): preserve exactly
- If an option is partially cut off or unclear, include visible text and append '[...]'

=== FINDING THE CORRECT ANSWER ===
First, look for EXPLICIT clues to identify the correct answer:
- Highlighted, bold, underlined, or circled options
- A checkmark, star, or tick mark next to an option
- A solution/explanation section below the question (use it to identify the answer,
  but do NOT include the explanation text in the options list)
- A filled bubble or checkbox next to an option

If NO explicit clues are visible, you MUST reason and infer the most likely correct answer(s):
- Use your knowledge of the subject matter to determine which option(s) are correct
- For factual questions: apply your domain knowledge
- For definition/concept questions: match the option that best fits the term
- For "multiple_choice" (select all that apply): include all options you believe are correct
- Set "inferred": true in your output when you guessed the answer
- NEVER return ["Unknown"] — always provide your best reasoned answer

=== WHEN TO RETURN NOT_A_QUESTION ===
Set question to "NOT_A_QUESTION" if the image:
- Contains only a diagram, chart, or figure with no question
- Is a blank or mostly blank page
- Contains only a logo, title page, or course header
- Contains only an answer explanation without a question stem
- Has no discernible question text

=== OUTPUT FORMAT ===
Return ONLY valid JSON, no markdown, no extra text:
{
  "question": "the question text (without question number prefix)",
  "options": ["A. option text", "B. option text", "C. option text"],
  "correct_answers": ["A"],
  "type": "single_choice",
  "inferred": false
}

- "type": "single_choice" if one answer, "multiple_choice" if multiple answers required
- "correct_answers": e.g. ["A"] or ["A", "C"] for multiple correct
- "inferred": true if you guessed/reasoned the answer (no explicit clue in image), false if clue was visible
"""

PDF_BATCH_PROMPT = """You are extracting multiple-choice questions from a PDF exam.
Each PAGE contains ONE question. Process EVERY page in order.

=== WHAT TO IGNORE (on every page) ===
- Logos, watermarks, school/course names, page numbers, headers, footers
- Decorative elements not part of the question or options

=== WHAT TO EXTRACT ===
For each page: the question stem and ALL answer options. Note:
- Options may be 2, 3, 4, 5 or more (not always A B C D)
- May require single OR multiple correct answers
- Options labeled with letters (A, B, C...) or numbers (1, 2, 3...)

=== SPECIAL CONTENT HANDLING ===
- Code, math formulas, special symbols: preserve EXACTLY as written
- Partially cut-off options: include visible text + '[...]'

=== FINDING THE CORRECT ANSWER ===
First look for EXPLICIT clues: highlighted/bold/underlined/circled options, checkmarks,
filled bubbles, or a solution/explanation section below the question.
Do NOT include explanation text in the options.

If NO explicit clues are visible on a page, you MUST reason and infer the most likely
correct answer(s) based on your subject knowledge:
- For factual/concept questions: apply domain knowledge to select the best option(s)
- For "multiple_choice" questions: include all options you believe are correct
- Set "inferred": true for that page when you guessed the answer
- NEVER use ["Unknown"] — always provide your best reasoned answer

=== WHEN A PAGE HAS NO QUESTION ===
Set question to "NOT_A_QUESTION" for pages that are:
- Diagram/chart only, blank, title/logo only, or explanation-only pages

=== OUTPUT FORMAT ===
Return ONLY a valid JSON array, one object per page, no markdown:
[
  {
    "question": "question text (without question number prefix)",
    "options": ["A. text", "B. text", "C. text"],
    "correct_answers": ["A"],
    "type": "single_choice",
    "inferred": false
  },
  ...
]

- Include ALL pages in order, even NOT_A_QUESTION ones
- "type": "single_choice" or "multiple_choice"
- "inferred": true if you reasoned/guessed the answer, false if a clue was visible
"""

# Model priority (Gemini 2.5 stable recommended as of 2026)
MODEL_LIST = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
]

SAFE_RPM = 8
PDF_BATCH_PAGES = 50


def _mask_key(key: str) -> str:
    """Return masked key for display: Key●●●●abcd1234"""
    if len(key) >= 8:
        return f"...{key[-8:]}"
    return "****"


class GeminiService:
    def __init__(self):
        self._keys: List[str] = []
        self._key_index: int = 0
        self._lock = threading.Lock()
        self._active_model: str = MODEL_LIST[0]
        self._on_log: Optional[Callable[[str], None]] = None
        self._stop_event: Optional[threading.Event] = None

    def set_keys(self, keys: List[str], start_from: int = 0):
        with self._lock:
            self._keys = [k.strip() for k in keys if k.strip()]
            self._key_index = start_from % max(len(self._keys), 1)

    def set_log_callback(self, callback: Optional[Callable[[str], None]]):
        """Set a callback to receive real-time log messages."""
        self._on_log = callback

    def set_stop_event(self, event: Optional[threading.Event]):
        """Set the stop event so waits can be interrupted."""
        self._stop_event = event

    def _interruptible_sleep(self, seconds: float):
        """Sleep for `seconds` but wake up every 0.5s to check stop_event."""
        step = 0.5
        elapsed = 0.0
        while elapsed < seconds:
            chunk = min(step, seconds - elapsed)
            time.sleep(chunk)
            elapsed += chunk
            if self._stop_event and self._stop_event.is_set():
                return  # interrupted

    def _log(self, msg: str):
        if self._on_log:
            self._on_log(msg)

    @property
    def request_delay(self) -> float:
        n = max(len(self._keys), 1)
        return max(60 / SAFE_RPM / n, 1.0)

    def _get_next_key(self) -> Optional[str]:
        with self._lock:
            if not self._keys:
                return None
            key = self._keys[self._key_index % len(self._keys)]
            self._key_index = (self._key_index + 1) % len(self._keys)
            return key

    def _get_key_num(self) -> int:
        """Return 1-based index of the LAST key that was handed out."""
        with self._lock:
            n = len(self._keys)
            if n == 0:
                return 0
            return ((self._key_index - 1) % n) + 1

    # ─────────────────────────────────────
    # Parse helpers
    # ─────────────────────────────────────
    def _clean_json(self, text: str) -> str:
        text = text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```[a-z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
        return text.strip()

    def _parse_single(self, text: str, image_path: str) -> Optional[Flashcard]:
        text = self._clean_json(text)
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            m = re.search(r"\{.*\}", text, re.DOTALL)
            if not m:
                return None
            try:
                data = json.loads(m.group())
            except Exception:
                return None

        question = data.get("question", "").strip()
        if not question or question == "NOT_A_QUESTION":
            return None

        inferred = data.get("inferred", False)
        notes = "⚠ Đáp án do AI suy luận (không có đáp án rõ trong ảnh)" if inferred else ""
        return Flashcard(
            question=question,
            options=data.get("options", []),
            correct_answers=data.get("correct_answers", []),
            question_type=(
                QuestionType.MULTIPLE_CHOICE
                if data.get("type") == "multiple_choice"
                else QuestionType.SINGLE_CHOICE
            ),
            image_path=image_path,
            notes=notes,
        )

    def _parse_pdf_batch(self, text: str, image_paths: List[str]) -> List[Optional[Flashcard]]:
        text = self._clean_json(text)
        try:
            data_list = json.loads(text)
        except json.JSONDecodeError:
            m = re.search(r"\[.*\]", text, re.DOTALL)
            if not m:
                return []
            try:
                data_list = json.loads(m.group())
            except Exception:
                return []

        if not isinstance(data_list, list):
            return []

        results = []
        for i, data in enumerate(data_list):
            img_path = image_paths[i] if i < len(image_paths) else ""
            question = data.get("question", "").strip()
            if not question or question == "NOT_A_QUESTION":
                results.append(None)
                continue
            inferred = data.get("inferred", False)
            notes = "⚠ Đáp án do AI suy luận (không có đáp án rõ trong ảnh)" if inferred else ""
            results.append(Flashcard(
                question=question,
                options=data.get("options", []),
                correct_answers=data.get("correct_answers", []),
                question_type=(
                    QuestionType.MULTIPLE_CHOICE
                    if data.get("type") == "multiple_choice"
                    else QuestionType.SINGLE_CHOICE
                ),
                image_path=img_path,
                notes=notes,
            ))
        return results

    # ─────────────────────────────────────
    def _handle_error_with_log(
        self, e: Exception, attempt: int, model_idx: list, context: str = ""
    ):
        err_str = str(e).lower()
        key_num = self._get_key_num()

        if "429" in err_str or "quota" in err_str or "rate" in err_str:
            wait = min(60 * (attempt + 1), 120)
            next_key_idx = (self._key_index % max(len(self._keys), 1)) + 1
            self._log(
                f"⚠ Key {key_num} [{_mask_key(self._keys[key_num-1] if self._keys else '')}] "
                f"hit rate limit (429). Switching to Key {next_key_idx}. "
                f"Waiting {wait}s... (Stop = cancel wait)"
            )
            self._interruptible_sleep(wait)

        elif "404" in err_str or "not found" in err_str or "preview" in err_str:
            old_model = MODEL_LIST[model_idx[0] % len(MODEL_LIST)]
            model_idx[0] += 1
            new_model = MODEL_LIST[model_idx[0] % len(MODEL_LIST)]
            self._log(f"⚠ Model '{old_model}' not available. Falling back to '{new_model}'...")
            self._interruptible_sleep(1)

        elif "500" in err_str or "503" in err_str or "unavailable" in err_str:
            self._log(f"⚠ Server error (5xx) on {context}. Retrying in 5s...")
            self._interruptible_sleep(5)

        else:
            short_err = str(e)[:100]
            self._log(f"✗ Error on {context}: {short_err}. Retrying in 3s...")
            self._interruptible_sleep(3)

    # ─────────────────────────────────────
    # Single image processing
    # ─────────────────────────────────────
    def process_image(self, image_path: str, max_retries: int = 5) -> Optional[Flashcard]:
        suffix = Path(image_path).suffix.lower()
        mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                    ".png": "image/png", ".webp": "image/webp", ".bmp": "image/bmp"}
        mime_type = mime_map.get(suffix, "image/png")
        fname = Path(image_path).name

        with open(image_path, "rb") as f:
            image_bytes = f.read()

        last_error = None
        model_idx = [0]

        for attempt in range(max_retries):
            api_key = self._get_next_key()
            if not api_key:
                raise ValueError("No API keys configured.")

            key_num = self._get_key_num()
            model = MODEL_LIST[model_idx[0] % len(MODEL_LIST)]

            self._log(
                f"📤 Sending '{fname}' | Key {key_num} [{_mask_key(api_key)}] | "
                f"Model: {model}"
            )
            try:
                client = genai.Client(api_key=api_key)
                self._log(f"⏳ Waiting for response... ({fname})")
                response = client.models.generate_content(
                    model=model,
                    contents=[
                        types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                        EXTRACTION_PROMPT,
                    ],
                )
                self._active_model = model
                card = self._parse_single(response.text, image_path)
                if card:
                    self._log(f"✅ Extracted: {card.question[:60]}...")
                else:
                    self._log(f"⚪ No question found in '{fname}'")
                return card

            except Exception as e:
                last_error = e
                self._handle_error_with_log(e, attempt, model_idx, context=fname)

        raise RuntimeError(f"Failed: '{fname}' after {max_retries} attempts: {last_error}")

    # ─────────────────────────────────────
    # PDF batch processing
    # ─────────────────────────────────────
    @staticmethod
    def images_to_pdf(image_paths: List[str]) -> bytes:
        images = []
        for p in image_paths:
            img = PILImage.open(p).convert("RGB")
            images.append(img)
        if not images:
            raise ValueError("No images to merge.")
        buf = io.BytesIO()
        images[0].save(buf, format="PDF", save_all=True, append_images=images[1:])
        return buf.getvalue()

    def process_pdf_bytes(
        self,
        pdf_bytes: bytes,
        page_paths: List[str],
        batch_label: str = "",
        max_retries: int = 5,
    ) -> List[Optional[Flashcard]]:
        last_error = None
        model_idx = [0]

        for attempt in range(max_retries):
            api_key = self._get_next_key()
            if not api_key:
                raise ValueError("No API keys configured.")

            key_num = self._get_key_num()
            model = MODEL_LIST[model_idx[0] % len(MODEL_LIST)]
            size_kb = len(pdf_bytes) // 1024

            self._log(
                f"📤 Sending PDF batch {batch_label} ({len(page_paths)} pages, {size_kb}KB) | "
                f"Key {key_num} [{_mask_key(api_key)}] | Model: {model}"
            )
            try:
                client = genai.Client(api_key=api_key)
                self._log(f"⏳ Waiting for response on batch {batch_label}...")
                response = client.models.generate_content(
                    model=model,
                    contents=[
                        types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                        PDF_BATCH_PROMPT,
                    ],
                )
                self._active_model = model
                cards = self._parse_pdf_batch(response.text, page_paths)
                valid = sum(1 for c in cards if c is not None)
                self._log(
                    f"✅ Batch {batch_label} done — "
                    f"{valid}/{len(page_paths)} cards extracted"
                )
                return cards

            except Exception as e:
                last_error = e
                self._handle_error_with_log(
                    e, attempt, model_idx, context=f"batch {batch_label}"
                )

        raise RuntimeError(
            f"PDF batch {batch_label} failed after {max_retries} attempts: {last_error}"
        )

    def process_images_as_pdf_batches(
        self,
        image_paths: List[str],
        batch_size: int = PDF_BATCH_PAGES,
        on_progress: Optional[Callable] = None,
        on_error: Optional[Callable] = None,
        stop_event: Optional[threading.Event] = None,
        pause_event: Optional[threading.Event] = None,
    ) -> List[Optional[Flashcard]]:
        all_results: List[Optional[Flashcard]] = []
        total = len(image_paths)
        batches = [image_paths[i:i + batch_size] for i in range(0, total, batch_size)]
        processed = 0

        self._log(
            f"🚀 PDF Batch mode: {total} images → "
            f"{len(batches)} batch(es) of up to {batch_size} pages each"
        )

        for b_idx, batch in enumerate(batches):
            if stop_event and stop_event.is_set():
                self._log("⏹ Scan stopped by user.")
                break
            while pause_event and pause_event.is_set():
                if stop_event and stop_event.is_set():
                    break
                time.sleep(0.5)

            batch_label = f"{b_idx + 1}/{len(batches)}"
            start_img = b_idx * batch_size + 1
            end_img = start_img + len(batch) - 1
            self._log(
                f"\n── Batch {batch_label}: images {start_img}–{end_img} ──"
            )
            self._log(f"🔧 Merging {len(batch)} images into PDF...")

            try:
                pdf_bytes = self.images_to_pdf(batch)
                self._log(f"✔ PDF ready ({len(pdf_bytes)//1024}KB)")

                cards = self.process_pdf_bytes(pdf_bytes, batch, batch_label=batch_label)

                while len(cards) < len(batch):
                    cards.append(None)

                for i, card in enumerate(cards[:len(batch)]):
                    all_results.append(card)
                    processed += 1
                    if on_progress:
                        on_progress(processed, total, card)

            except Exception as e:
                self._log(f"✗ Batch {batch_label} failed: {str(e)[:120]}")
                for path in batch:
                    all_results.append(None)
                    processed += 1
                    if on_error:
                        on_error(processed - 1, path, str(e))
                    if on_progress:
                        on_progress(processed, total, None)

            if b_idx < len(batches) - 1:
                delay = self.request_delay
                self._log(
                    f"⏱ Waiting {delay:.1f}s before next batch "
                    f"(rate limit buffer)..."
                )
                elapsed = 0.0
                while elapsed < delay:
                    if stop_event and stop_event.is_set():
                        break
                    time.sleep(0.2)
                    elapsed += 0.2

        valid_total = sum(1 for c in all_results if c is not None)
        self._log(
            f"\n🏁 All done! {valid_total}/{total} cards extracted successfully."
        )
        return all_results

    # ─────────────────────────────────────
    # Parallel multi-key processing
    # ─────────────────────────────────────
    def process_images_parallel(
        self,
        image_paths: List[str],
        keys: List[str],
        batch_size: int = PDF_BATCH_PAGES,
        on_progress: Optional[Callable] = None,
        on_error: Optional[Callable] = None,
        stop_event: Optional[threading.Event] = None,
        pause_event: Optional[threading.Event] = None,
    ) -> List[Optional[Flashcard]]:
        """
        Split images into N packs (N = number of keys).
        Each pack runs on a separate thread with a dedicated API key.
        Results are merged in the original order.
        """
        total = len(image_paths)
        n_keys = len(keys)

        # Split images into N roughly-equal packs
        packs = []
        pack_size = max(1, (total + n_keys - 1) // n_keys)
        for i in range(0, total, pack_size):
            packs.append(image_paths[i:i + pack_size])

        self._log(
            f"\n⚡ PARALLEL MODE: {total} images → {len(packs)} packs "
            f"across {n_keys} API key(s)"
        )
        for i, pack in enumerate(packs):
            self._log(
                f"   Pack {i+1}: {len(pack)} images → Key {i+1} [{_mask_key(keys[i])}]"
            )

        # Shared state for progress tracking
        progress_lock = threading.Lock()
        shared_progress = {"count": 0}
        all_results: List[Optional[Flashcard]] = [None] * total

        def worker(pack_idx: int, pack_images: List[str], api_key: str):
            """Worker thread: process one pack with one dedicated key."""
            key_label = f"Key {pack_idx + 1}"
            masked = _mask_key(api_key)

            # Create a dedicated GeminiService for this thread
            worker_svc = GeminiService()
            worker_svc.set_keys([api_key])
            worker_svc.set_log_callback(
                lambda msg: self._log(f"[{key_label}] {msg}")
            )
            worker_svc.set_stop_event(stop_event)

            # Split this pack into sub-batches of `batch_size` pages
            sub_batches = [
                pack_images[j:j + batch_size]
                for j in range(0, len(pack_images), batch_size)
            ]

            self._log(
                f"[{key_label}] 🚀 Starting: {len(pack_images)} images "
                f"→ {len(sub_batches)} sub-batch(es) [{masked}]"
            )

            pack_offset = sum(len(packs[p]) for p in range(pack_idx))
            local_processed = 0

            for sb_idx, sub_batch in enumerate(sub_batches):
                if stop_event and stop_event.is_set():
                    break
                while pause_event and pause_event.is_set():
                    if stop_event and stop_event.is_set():
                        break
                    time.sleep(0.5)

                sb_label = f"{sb_idx + 1}/{len(sub_batches)}"

                try:
                    pdf_bytes = self.images_to_pdf(sub_batch)
                    cards = worker_svc.process_pdf_bytes(
                        pdf_bytes, sub_batch, batch_label=f"P{pack_idx+1}-{sb_label}"
                    )

                    while len(cards) < len(sub_batch):
                        cards.append(None)

                    for i, card in enumerate(cards[:len(sub_batch)]):
                        global_idx = pack_offset + local_processed
                        all_results[global_idx] = card
                        local_processed += 1

                        with progress_lock:
                            shared_progress["count"] += 1
                            current = shared_progress["count"]
                        if on_progress:
                            on_progress(current, total, card)

                except Exception as e:
                    self._log(
                        f"[{key_label}] ✗ Sub-batch {sb_label} failed: "
                        f"{str(e)[:120]}"
                    )
                    for img_path in sub_batch:
                        global_idx = pack_offset + local_processed
                        all_results[global_idx] = None
                        local_processed += 1

                        with progress_lock:
                            shared_progress["count"] += 1
                            current = shared_progress["count"]
                        if on_error:
                            on_error(global_idx, img_path, str(e))
                        if on_progress:
                            on_progress(current, total, None)

                # Rate limit delay between sub-batches
                if sb_idx < len(sub_batches) - 1:
                    delay = max(60 / SAFE_RPM, 1.0)
                    elapsed = 0.0
                    while elapsed < delay:
                        if stop_event and stop_event.is_set():
                            break
                        time.sleep(0.2)
                        elapsed += 0.2

            self._log(f"[{key_label}] ✔ Finished all sub-batches")

        # Launch worker threads
        threads = []
        for idx, (pack, key) in enumerate(zip(packs, keys)):
            t = threading.Thread(
                target=worker, args=(idx, pack, key), daemon=True
            )
            threads.append(t)
            t.start()

        # Wait for all threads
        for t in threads:
            t.join()

        valid_total = sum(1 for c in all_results if c is not None)
        self._log(
            f"\n🏁 PARALLEL DONE! {valid_total}/{total} cards extracted "
            f"across {len(packs)} parallel workers."
        )
        return all_results

    # ─────────────────────────────────────
    # Per-image batch (original mode)
    # ─────────────────────────────────────
    def process_images_batch(
        self,
        image_paths: List[str],
        on_progress: Optional[Callable] = None,
        on_error: Optional[Callable] = None,
        stop_event: Optional[threading.Event] = None,
        pause_event: Optional[threading.Event] = None,
    ) -> List[Optional[Flashcard]]:
        results = []
        total = len(image_paths)
        delay = self.request_delay

        self._log(
            f"🚀 Image mode: {total} images, ~{delay:.1f}s delay between each\n"
            f"   Estimated time: {total * delay / 60:.1f} min"
        )

        for i, path in enumerate(image_paths):
            if stop_event and stop_event.is_set():
                self._log("⏹ Scan stopped by user.")
                break
            while pause_event and pause_event.is_set():
                if stop_event and stop_event.is_set():
                    break
                time.sleep(0.5)

            try:
                card = self.process_image(path)
                results.append(card)
                if on_progress:
                    on_progress(i + 1, total, card)
            except Exception as e:
                results.append(None)
                if on_error:
                    on_error(i, path, str(e))
                if on_progress:
                    on_progress(i + 1, total, None)

            if i < total - 1:
                elapsed = 0.0
                while elapsed < delay:
                    if stop_event and stop_event.is_set():
                        break
                    time.sleep(0.2)
                    elapsed += 0.2

        valid = sum(1 for c in results if c is not None)
        self._log(f"\n🏁 Done! {valid}/{total} cards extracted.")
        return results

    def validate_key(self, api_key: str) -> tuple:
        for model in MODEL_LIST:
            try:
                client = genai.Client(api_key=api_key)
                response = client.models.generate_content(
                    model=model, contents=["Say OK in one word."],
                )
                return True, f"✓ Valid ({model})"
            except Exception as e:
                if "404" in str(e).lower() or "not found" in str(e).lower():
                    continue
                return False, f"Invalid: {str(e)[:80]}"
        return False, "No working model found."

    def validate_keys_parallel(
        self,
        keys: List[str],
        on_log: Optional[Callable[[str], None]] = None,
    ) -> List[str]:
        """
        Test all keys in parallel. Returns list of alive keys only.
        Stores _start_from so the scan begins after the last-tested key
        (each key gets equal recovery time before first scan request).
        """
        results: dict = {}
        finish_order: list = []
        lock = threading.Lock()

        def test_one(key: str, idx: int):
            masked = _mask_key(key)
            if on_log:
                on_log(f"🔍 Testing Key {idx} [{masked}]...")
            ok, msg = self.validate_key(key)
            with lock:
                results[key] = (ok, msg)
                if ok:
                    finish_order.append(key)
            icon = "✅" if ok else "❌"
            if on_log:
                on_log(f"{icon} Key {idx} [{masked}]: {msg}")

        threads = []
        for i, key in enumerate(keys, start=1):
            t = threading.Thread(target=test_one, args=(key, i), daemon=True)
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        alive = [k for k in keys if results.get(k, (False,))[0]]
        dead = len(keys) - len(alive)

        if on_log:
            on_log(
                f"\n📊 Key check done: {len(alive)}/{len(keys)} alive"
                + (f", {dead} dead (excluded)" if dead else "")
            )

        # Determine smart starting index for the upcoming scan.
        # Start from the key AFTER the last finished alive key so no key
        # gets two consecutive requests without recovery time.
        self._start_from = 0
        if alive and finish_order:
            last_tested = finish_order[-1]
            if last_tested in alive:
                last_idx = alive.index(last_tested)
                self._start_from = (last_idx + 1) % len(alive)
                if on_log:
                    on_log(
                        f"🔀 Scan will start from Key {self._start_from + 1} "
                        f"(rotating after health check to spread load)"
                    )

        return alive
