"""
ui/background_scan.py - BackgroundScan: manages a background image-scanning thread.
"""
import threading
import uuid
from datetime import datetime

from ui.theme import SUCCESS, DANGER, WARNING, TEXT_DIM
from services.gemini_service import GeminiService
from services.storage_service import save_decks
from models.flashcard import Deck
from ui.theme import win_toast


class BackgroundScan:
    def __init__(self, app, image_files, deck_name, keys, parallel=False, video_file=None):
        self.app = app
        self.id = str(uuid.uuid4())
        self.image_files = image_files
        self.deck_name = deck_name
        self.keys = keys
        self.parallel = parallel
        self.video_file = video_file

        self.gemini_service = GeminiService()
        self.stop_event = threading.Event()
        self.pause_event = threading.Event()
        self.gemini_service.set_stop_event(self.stop_event)

        self.status = "Starting..."
        self.status_color = TEXT_DIM
        self.progress_text = "0 / 0"
        self.progress_frac = 0.0
        self.success = 0
        self.failed = 0
        self.results = []
        self.is_finished = False
        self.log_lines = []   # recent activity lines (max 80)

    def _log(self, msg: str):
        ts = datetime.now().strftime("%H:%M:%S")
        self.log_lines.append(f"[{ts}] {msg}")
        if len(self.log_lines) > 80:
            self.log_lines = self.log_lines[-80:]

    def start(self):
        threading.Thread(target=self._run, daemon=True).start()

    def _notify_home(self, full_rebuild=False):
        """Thread-safe home update. Use full_rebuild=True for state changes (stop/finish)."""
        home = self.app.frames.get("home")
        if home is None:
            return
        if full_rebuild:
            self.app.after(0, home.refresh)
        else:
            home._schedule_scan_update()

    def _run(self):
        # Step 1: validate
        self.status = "Validating keys..."
        self._log(f"🔑 Validating {len(self.keys)} key(s)...")
        self._notify_home()
        alive_keys = self.gemini_service.validate_keys_parallel(self.keys)

        if not alive_keys:
            self.status = "Failed: No alive keys"
            self.status_color = DANGER
            self.is_finished = True
            self._log("❌ No alive API keys found. Aborted.")
            self._notify_home(full_rebuild=True)
            return

        self._log(f"✅ {len(alive_keys)} key(s) alive. Starting scan...")
        self.gemini_service.set_keys(alive_keys)
        
        # Extract frames if video_file is provided
        if self.video_file:
            self.status = "Extracting frames..."
            self._log(f"🎬 Extracting frames from video...")
            self._notify_home()
            
            from services.video_service import VideoService
            import tempfile
            
            self.temp_dir = tempfile.mkdtemp(prefix="flashcard_frames_")
            
            try:
                def on_extract_progress(count):
                    self.status = f"Extracted {count} frames..."
                    # Only notify home occasionally to avoid flooding UI
                    if count % 10 == 0:
                        self._notify_home()
                    
                self.image_files = VideoService.extract_frames(
                    self.video_file, 
                    self.temp_dir, 
                    fps=1.0, 
                    on_progress=on_extract_progress
                )
                self._log(f"✅ Extracted {len(self.image_files)} frames to temp directory.")
            except Exception as e:
                self.status = "Extraction Failed"
                self.status_color = DANGER
                self.is_finished = True
                self._log(f"❌ Video extraction failed: {e}")
                self._notify_home(full_rebuild=True)
                return

        self.status = "Scanning"
        self.status_color = SUCCESS

        total = len(self.image_files)
        mode_label = "⚡ PARALLEL" if self.parallel else "📁 Sequential"
        n_batches = (total + 49) // 50
        self._log(f"{mode_label}: {total} images → {n_batches} PDF batch(es)")

        last_batch_logged = -1

        def on_progress(idx, tot, card):
            nonlocal last_batch_logged
            self.progress_frac = idx / tot
            self.progress_text = f"{idx} / {tot}"
            batch_idx = (idx - 1) // 50
            if batch_idx != last_batch_logged:
                last_batch_logged = batch_idx
                self._log(f"📦 Batch {batch_idx + 1}/{n_batches} — images {batch_idx*50+1}–{min((batch_idx+1)*50, tot)}")
            if card:
                self.success += 1
                self.results.append(card)
                self._log(f"  ✓ Image {idx}: {len(card.options)} options extracted")
            else:
                self.failed += 1
                self._log(f"  ✗ Image {idx}: no card extracted")
            if not self.stop_event.is_set() and not self.pause_event.is_set():
                self.status = f"✓ {self.success}  ✗ {self.failed}"
            self._notify_home()

        def on_error(idx, path, msg):
            pass

        if self.parallel and len(alive_keys) > 1:
            self.gemini_service.process_images_parallel(
                self.image_files,
                keys=alive_keys,
                on_progress=on_progress,
                on_error=on_error,
                stop_event=self.stop_event,
                pause_event=self.pause_event
            )
        else:
            self.gemini_service.process_images_as_pdf_batches(
                self.image_files,
                on_progress=on_progress,
                on_error=on_error,
                stop_event=self.stop_event,
                pause_event=self.pause_event
            )

        if self.stop_event.is_set():
            self.status = "Stopped"
            self.status_color = DANGER
        else:
            self.status = "Finished ✅"
            self.status_color = SUCCESS

            if self.results:
                deck = Deck(
                    name=self.deck_name,
                    cards=self.results,
                    source_folder="",
                    created_at=datetime.now().isoformat()
                )
                self.app.decks.append(deck)
                save_decks(self.app.decks)
                win_toast("Scan Complete ✅", f"{len(self.results)} cards extracted — '{self.deck_name}'")
            else:
                win_toast("Scan Finished", "No cards extracted. Check your images or API keys.")

        # Cleanup temporary frames if used
        if getattr(self, "temp_dir", None):
            self._log("🧹 Cleaning up temporary frames...")
            import shutil
            try:
                shutil.rmtree(self.temp_dir)
            except Exception as e:
                self._log(f"⚠ Failed to clean up temp dir: {e}")

        self.is_finished = True
        self._notify_home(full_rebuild=True)

        # Auto-remove from list after 8 seconds if finished/stopped
        def _remove_self():
            import time
            time.sleep(8)
            if self in self.app.active_scans:
                self.app.active_scans.remove(self)
                self._notify_home(full_rebuild=True)
        threading.Thread(target=_remove_self, daemon=True).start()

    def pause(self):
        self.pause_event.set()
        self.status = "Paused ⏸"
        self.status_color = WARNING
        self.app.after(0, self.app.frames["home"].refresh)

    def resume(self):
        self.pause_event.clear()
        self.status = "Scanning"
        self.status_color = SUCCESS
        self.app.after(0, self.app.frames["home"].refresh)

    def stop(self):
        self.stop_event.set()
        self.pause_event.clear()
        self.status = "Stopping..."
        self.status_color = DANGER
        self.app.after(0, self.app.frames["home"].refresh)
