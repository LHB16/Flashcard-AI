"""
app.py - Main application entry point and UI
Flashcard App with Gemini AI - Windows Desktop
"""
import os
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox
import customtkinter as ctk
from PIL import Image, ImageTk
import uuid
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from models.flashcard import Deck, Flashcard, QuestionType, QuizSession
from services.gemini_service import GeminiService
from services.storage_service import (
    load_decks, save_decks, load_settings, save_settings,
    load_quiz_sessions, save_quiz_session, delete_quiz_session,
)
from services.export_service import export_to_quizlet, get_quizlet_preview
from services.dedup_service import find_duplicate_questions


# ─────────────────────────────────────────────
# Theme — Light Mode (soothing)
# ─────────────────────────────────────────────
ACCENT       = "#5B4FCF"   # indigo
ACCENT_HOVER = "#4A40B8"
SUCCESS      = "#0B9E6E"   # teal-green
WARNING      = "#B45309"   # amber-brown
DANGER       = "#DC2626"   # red
CARD_BG      = "#F2F4F8"   # light blue-gray page
SURFACE      = "#FFFFFF"   # white panels
SURFACE2     = "#E8EAF0"   # slightly darker panel
TEXT         = "#1A1A2E"   # near-black
TEXT_DIM     = "#5A6070"   # muted gray

ctk.set_appearance_mode("light")
ctk.set_default_color_theme("blue")


def center_window(win, w: int, h: int):
    """Center a Toplevel window on screen."""
    win.update_idletasks()
    sw = win.winfo_screenwidth()
    sh = win.winfo_screenheight()
    x = (sw - w) // 2
    y = (sh - h) // 2
    win.geometry(f"{w}x{h}+{x}+{y}")


def win_toast(title: str, message: str):
    """Show a Windows balloon toast notification (non-blocking)."""
    try:
        safe_title = title.replace("'", "")
        safe_msg   = message.replace("'", "")
        script = (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$n = New-Object System.Windows.Forms.NotifyIcon; "
            "$n.Icon = [System.Drawing.SystemIcons]::Information; "
            f"$n.BalloonTipTitle = '{safe_title}'; "
            f"$n.BalloonTipText = '{safe_msg}'; "
            "$n.Visible = $True; "
            "$n.ShowBalloonTip(5000); "
            "Start-Sleep -Seconds 6; "
            "$n.Dispose()"
        )
        subprocess.Popen(
            ["powershell", "-WindowStyle", "Hidden", "-Command", script],
            creationflags=0x08000000
        )
    except Exception:
        pass



# ─────────────────────────────────────────────
# Helper: Image-related utilities
# ─────────────────────────────────────────────
def get_image_files(folder: str):
    exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
    files = []
    for f in os.listdir(folder):
        if os.path.splitext(f)[1].lower() in exts:
            files.append(os.path.join(folder, f))
    return sorted(files)  # Sort alphabetically


# ─────────────────────────────────────────────
# SCREEN: API Key Manager (popup)
# ─────────────────────────────────────────────
class APIKeyDialog(ctk.CTkToplevel):
    def __init__(self, parent, settings: dict, on_save):
        super().__init__(parent)
        self.app_parent = parent
        self.title("API Key Manager")
        self.resizable(True, True)
        self.minsize(660, 600)
        self.grab_set()
        self.settings = settings
        self.on_save = on_save
        self.gemini = GeminiService()
        self._check_vars: dict = {}   # key -> BooleanVar
        self._status_lbls: dict = {}  # key -> label
        self._build_ui()
        center_window(self, 700, 660)

    def _build_ui(self):
        self.configure(fg_color=CARD_BG)

        ctk.CTkLabel(self, text="🔑  Gemini API Keys",
                     font=ctk.CTkFont(size=20, weight="bold"),
                     text_color=TEXT).pack(pady=(20, 5))
        ctk.CTkLabel(self, text="Keys rotate round-robin. On quota error, next key is used automatically.",
                     font=ctk.CTkFont(size=12), text_color=TEXT_DIM).pack(pady=(0, 15))

        # Entry row
        entry_row = ctk.CTkFrame(self, fg_color="transparent")
        entry_row.pack(fill="x", padx=20)
        self.key_entry = ctk.CTkEntry(entry_row, placeholder_text="Paste API key here...",
                                      font=ctk.CTkFont(size=13), height=38, show="•")
        self.key_entry.pack(side="left", fill="x", expand=True, padx=(0, 6))
        ctk.CTkButton(entry_row, text="Add", width=68, height=38,
                      fg_color=ACCENT, hover_color=ACCENT_HOVER, text_color="white",
                      command=self._add_key).pack(side="left", padx=(0, 4))
        ctk.CTkButton(entry_row, text="👁", width=38, height=38,
                      fg_color=SURFACE2, hover_color=SURFACE, text_color=TEXT,
                      command=self._toggle_show).pack(side="left", padx=(0, 4))
        ctk.CTkButton(entry_row, text="Test All", width=80, height=38,
                      fg_color=WARNING, hover_color="#92400E", text_color="white",
                      command=self._test_all).pack(side="left")

        # Keys list
        list_frame = ctk.CTkScrollableFrame(self, fg_color=SURFACE,
                                            height=380, corner_radius=10)
        list_frame.pack(fill="both", expand=True, padx=20, pady=12)
        self.list_frame = list_frame
        self._refresh_list()

        # Status
        self.status_lbl = ctk.CTkLabel(self, text="", font=ctk.CTkFont(size=12), text_color=TEXT_DIM)
        self.status_lbl.pack(pady=(4, 0))

        ctk.CTkButton(self, text="Save & Close", height=40,
                      fg_color=SUCCESS, hover_color="#059669", text_color="white",
                      command=self._save_and_close).pack(pady=(6, 20))

    def _toggle_show(self):
        self.key_entry.configure(show="" if self.key_entry.cget("show") == "•" else "•")

    def _add_key(self):
        key = self.key_entry.get().strip()
        if not key:
            return
        keys = self.settings.get("api_keys", [])
        if key in keys:
            self.status_lbl.configure(text="Key already exists.", text_color=WARNING)
            return
        keys.append(key)
        self.settings["api_keys"] = keys
        self.key_entry.delete(0, "end")
        self._refresh_list()
        self.status_lbl.configure(text="Key added.", text_color=SUCCESS)

    def _refresh_list(self):
        for w in self.list_frame.winfo_children():
            w.destroy()
        self._check_vars.clear()
        self._status_lbls.clear()
        keys = self.settings.get("api_keys", [])
        active_set = set(self.settings.get("active_keys", keys))
        
        used_keys = set()
        if hasattr(self.app_parent, "get_used_keys"):
            used_keys = self.app_parent.get_used_keys()

        if not keys:
            ctk.CTkLabel(self.list_frame, text="No keys yet. Add your first key above.",
                         text_color=TEXT_DIM).pack(pady=20)
            return

        for i, key in enumerate(keys):
            row = ctk.CTkFrame(self.list_frame, fg_color=SURFACE2, corner_radius=8)
            row.pack(fill="x", pady=3, padx=4)
            masked = f"...{key[-8:]}" if len(key) > 8 else "****"
            in_use = key in used_keys
            
            # Checkbox
            var = ctk.BooleanVar(value=(key in active_set))
            self._check_vars[key] = var
            cb = ctk.CTkCheckBox(row, text="", variable=var,
                                 width=28, checkbox_width=20, checkbox_height=20,
                                 checkmark_color="white",
                                 fg_color=ACCENT, hover_color=ACCENT_HOVER)
            cb.pack(side="left", padx=(8, 2), pady=8)
            
            # Label
            lbl_color = TEXT_DIM if in_use else TEXT
            ctk.CTkLabel(row, text=f"Key {i+1}: {masked}",
                         font=ctk.CTkFont(size=13), text_color=lbl_color
                         ).pack(side="left", padx=8, pady=8)
            
            if in_use:
                cb.configure(state="disabled")
                ctk.CTkLabel(row, text="[In Use]", font=ctk.CTkFont(size=11, weight="bold"),
                             text_color=WARNING).pack(side="left", padx=(0, 8))

            # Inline status
            slbl = ctk.CTkLabel(row, text="", font=ctk.CTkFont(size=11), width=58)
            slbl.pack(side="right", padx=(0, 6), pady=6)
            self._status_lbls[key] = slbl
            
            ctk.CTkButton(row, text="Test", width=50, height=28,
                          fg_color=ACCENT, hover_color=ACCENT_HOVER, text_color="white",
                          command=lambda k=key, lbl=slbl: self._test_key(k, lbl)
                          ).pack(side="right", padx=(0, 2), pady=6)
            
            ctk.CTkButton(row, text="📋", width=30, height=28,
                          fg_color=SURFACE, hover_color=SURFACE2, text_color=TEXT,
                          command=lambda k=key: self._copy_key(k)
                          ).pack(side="right", padx=(0, 2), pady=6)
            
            del_btn = ctk.CTkButton(row, text="✕", width=30, height=28,
                                    fg_color=DANGER, hover_color="#DC2626", text_color="white",
                                    command=lambda idx=i: self._remove_key(idx))
            del_btn.pack(side="right", padx=(0, 2), pady=6)
            
            if in_use:
                del_btn.configure(state="disabled")

    def _copy_key(self, key):
        self.clipboard_clear()
        self.clipboard_append(key)
        self.update()
        self.status_lbl.configure(text="Key copied to clipboard!", text_color=SUCCESS)


    def _remove_key(self, idx):
        keys = self.settings.get("api_keys", [])
        removed = keys[idx]
        keys.pop(idx)
        self.settings["api_keys"] = keys
        active = set(self.settings.get("active_keys", []))
        active.discard(removed)
        self.settings["active_keys"] = list(active)
        self._refresh_list()

    def _test_key(self, key, lbl):
        lbl.configure(text="...", text_color=TEXT_DIM)
        def do_test():
            ok, _ = self.gemini.validate_key(key)
            lbl.configure(text="🟢 Live" if ok else "🔴 Die",
                          text_color=SUCCESS if ok else DANGER)
        threading.Thread(target=do_test, daemon=True).start()

    def _test_all(self):
        keys = self.settings.get("api_keys", [])
        if not keys:
            return
        self.status_lbl.configure(text=f"Testing {len(keys)} keys...", text_color=TEXT_DIM)
        for k in keys:
            lbl = self._status_lbls.get(k)
            if lbl:
                lbl.configure(text="...", text_color=TEXT_DIM)
        def run_all():
            threads = [threading.Thread(
                target=self._test_key,
                args=(k, self._status_lbls[k]),
                daemon=True
            ) for k in keys if k in self._status_lbls]
            for t in threads: t.start()
            for t in threads: t.join()
            self.status_lbl.configure(text="All tests done.", text_color=SUCCESS)
        threading.Thread(target=run_all, daemon=True).start()

    def _save_and_close(self):
        keys = self.settings.get("api_keys", [])
        active = [k for k in keys if self._check_vars.get(k, ctk.BooleanVar(value=True)).get()]
        self.settings["active_keys"] = active
        self.on_save(self.settings)
        self.destroy()


# ─────────────────────────────────────────────
# SCREEN: Scan (process images)
# ─────────────────────────────────────────────
class ScanFrame(ctk.CTkFrame):
    def __init__(self, parent, app):
        super().__init__(parent, fg_color=CARD_BG)
        self.app = app
        self.folder_path = ""
        self.image_files = []
        self._build_ui()

    def _build_ui(self):
        # Header
        hdr = ctk.CTkFrame(self, fg_color=SURFACE, height=60, corner_radius=0)
        hdr.pack(fill="x")
        hdr.pack_propagate(False)
        ctk.CTkLabel(hdr, text="📂  Scan Images → Create Deck",
                     font=ctk.CTkFont(size=18, weight="bold"), text_color=TEXT).pack(side="left", padx=20)
        ctk.CTkButton(hdr, text="← Home", width=90, height=34,
                      fg_color=SURFACE2, hover_color=SURFACE, text_color=TEXT,
                      command=lambda: self.app.show_frame("home")).pack(side="right", padx=15)

        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=20, pady=15)

        # Center form
        form = ctk.CTkFrame(body, fg_color=SURFACE, corner_radius=12, width=400)
        form.pack(pady=40, ipadx=20, ipady=20)
        
        ctk.CTkLabel(form, text="Create New Deck", font=ctk.CTkFont(size=20, weight="bold"),
                     text_color=TEXT).pack(pady=(10, 20))

        ctk.CTkLabel(form, text="Deck Name", font=ctk.CTkFont(size=13, weight="bold"),
                     text_color=TEXT_DIM).pack(anchor="w", padx=15, pady=(5, 3))
        self.deck_name_entry = ctk.CTkEntry(form, placeholder_text="e.g. IoT Semester 4",
                                            height=36, font=ctk.CTkFont(size=13))
        self.deck_name_entry.pack(fill="x", padx=15)

        ctk.CTkLabel(form, text="Image Folder", font=ctk.CTkFont(size=13, weight="bold"),
                     text_color=TEXT_DIM).pack(anchor="w", padx=15, pady=(20, 3))
        
        folder_row = ctk.CTkFrame(form, fg_color="transparent")
        folder_row.pack(fill="x", padx=15)
        self.folder_lbl = ctk.CTkLabel(folder_row, text="No folder selected",
                                       font=ctk.CTkFont(size=13), text_color=TEXT_DIM,
                                       wraplength=250, anchor="w")
        self.folder_lbl.pack(side="left", fill="x", expand=True)
        ctk.CTkButton(folder_row, text="Browse", width=80, height=32,
                      fg_color=ACCENT, hover_color=ACCENT_HOVER, text_color="white",
                      command=self._browse_folder).pack(side="right")

        self.file_count_lbl = ctk.CTkLabel(form, text="",
                                           font=ctk.CTkFont(size=13), text_color=TEXT_DIM)
        self.file_count_lbl.pack(anchor="w", padx=15, pady=(5, 0))

        ctk.CTkFrame(form, fg_color=SURFACE2, height=1).pack(fill="x", padx=15, pady=25)

        self.start_btn = ctk.CTkButton(form, text="▶  Select API Keys & Start", height=42,
                                       fg_color=SUCCESS, hover_color="#059669", text_color="white",
                                       font=ctk.CTkFont(size=14, weight="bold"),
                                       command=self._start_scan)
        self.start_btn.pack(fill="x", padx=15, pady=(0, 10))

    def _browse_folder(self):
        folder = filedialog.askdirectory(title="Select Image Folder")
        if folder:
            self.folder_path = folder
            self.image_files = get_image_files(folder)
            short = os.path.basename(folder)
            self.folder_lbl.configure(text=short)
            self.file_count_lbl.configure(
                text=f"Found {len(self.image_files)} images",
                text_color=SUCCESS if self.image_files else DANGER
            )
            # Auto-fill deck name
            if not self.deck_name_entry.get():
                self.deck_name_entry.insert(0, short)

    def _start_scan(self):
        if not self.image_files:
            messagebox.showerror("Error", "Please select a folder with images first.")
            return

        deck_name = self.deck_name_entry.get().strip() or "Untitled Deck"
        ScanAssignDialog(self, self.app, self.image_files, deck_name)

    def reset(self):
        """Call when returning to this frame."""
        self.folder_path = ""
        self.image_files = []
        self.folder_lbl.configure(text="No folder selected", text_color=TEXT_DIM)
        self.file_count_lbl.configure(text="")
        self.deck_name_entry.delete(0, "end")

# ─────────────────────────────────────────────
# DIALOG: Question Deduplication
# ─────────────────────────────────────────────
class QuestionDedupDialog(ctk.CTkToplevel):
    def __init__(self, parent, deck, duplicates, on_apply):
        super().__init__(parent)
        self.deck = deck
        self.duplicates = duplicates  # [(idx_a, idx_b, ratio), ...]
        self.on_apply = on_apply
        self.title("🔍 Lọc câu hỏi trùng")
        self.geometry("820x680")
        self.resizable(True, True)
        self.grab_set()
        self.configure(fg_color=CARD_BG)
        center_window(self, 820, 680)

        # Separate into exact and similar
        exact = [(a, b, r) for a, b, r in duplicates if r >= 0.99]
        similar = [(a, b, r) for a, b, r in duplicates if r < 0.99]

        # Header
        ctk.CTkLabel(self,
                     text=f"🔍 Tìm thấy {len(exact)} giống 100%  ·  {len(similar)} tương tự",
                     font=ctk.CTkFont(size=17, weight="bold"), text_color=TEXT).pack(pady=(15, 3))
        ctk.CTkLabel(self,
                     text="Đại trà các thẻ học có nội dung tương tự. Đánh dấu ☑ để xóa (mặc định chọn thẻ xuất hiện sau).",
                     font=ctk.CTkFont(size=12), text_color=TEXT_DIM).pack(pady=(0, 8))

        scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        scroll.pack(fill="both", expand=True, padx=15, pady=5)

        self._delete_vars = {}    # (pair_key, slot) -> BooleanVar
        self._exact_b_keys = []   # keys for exact-group 'b' cards only
        self._key_to_idx = {}     # (pair_key, slot) -> actual card index (int)

        def _ans_text(c):
            opts = getattr(c, 'options', []) or []
            correct = getattr(c, 'correct_answers', []) or []
            if not correct:
                return "Đáp án: (không có)"
            correct_set = {x.strip().upper() for x in correct}
            matched = [opt for opt in opts if opt.strip() and opt.strip()[0].upper() in correct_set]
            if matched:
                return "Đáp án: " + " | ".join(matched)
            return "Đáp án: " + ", ".join(correct)

        def _build_section(title, color, items, default_checked_b):
            if not items:
                return
            sec_lbl = ctk.CTkLabel(scroll, text=title,
                                   font=ctk.CTkFont(size=14, weight="bold"),
                                   text_color=color)
            sec_lbl.pack(anchor="w", pady=(12, 4))
            for i, (idx_a, idx_b, ratio) in enumerate(items):
                self._build_pair(scroll, idx_a, idx_b, ratio, _ans_text, default_checked_b, f"{color}_{i}")

        # Section 1: Exact (100%) — auto-check second card for deletion
        _build_section(f"✅ Giống 100%  ({len(exact)} cặp) — nên xóa bớt", DANGER, exact, True)
        # Section 2: Similar (<100%) — nothing pre-checked, user reviews manually
        _build_section(f"🔍 Tương tự  ({len(similar)} cặp) — kiểm tra trước khi xóa", "#7C3AED", similar, False)

        # Bottom buttons
        btns = ctk.CTkFrame(self, fg_color="transparent")
        btns.pack(pady=12)
        ctk.CTkButton(btns, text="Hủy", width=90, height=36,
                      fg_color=SURFACE, hover_color=SURFACE2, text_color=TEXT,
                      command=self.destroy).pack(side="left", padx=8)
        # Toggle button only affects exact pairs
        self._toggle_btn = ctk.CTkButton(btns, text="☒ Chọn tất cả (100%)", width=170, height=36,
                      fg_color="#B91C1C", hover_color="#991B1B", text_color="white",
                      command=self._toggle_exact)
        self._toggle_btn.pack(side="left", padx=8)
        ctk.CTkButton(btns, text="🗑 Xóa thẻ đã chọn", width=160, height=36,
                      fg_color=DANGER, hover_color="#DC2626", text_color="white",
                      font=ctk.CTkFont(weight="bold"),
                      command=self._apply).pack(side="left", padx=8)

    def _build_pair(self, parent, idx_a, idx_b, ratio, ans_fn, default_checked_b=False, pair_key=None):
        if pair_key is None:
            pair_key = f"{idx_a}_{idx_b}"
        pct = int(ratio * 100)
        pair_frame = ctk.CTkFrame(parent, fg_color=SURFACE, corner_radius=8)
        pair_frame.pack(fill="x", pady=4)

        ctk.CTkLabel(pair_frame, text=f"🔗 {pct}% giống",
                     font=ctk.CTkFont(size=12, weight="bold"),
                     text_color="#6D28D9").pack(anchor="w", padx=12, pady=(7, 2))

        card_a = self.deck.cards[idx_a]
        card_b = self.deck.cards[idx_b]

        # Two-column side-by-side layout
        cols = ctk.CTkFrame(pair_frame, fg_color="transparent")
        cols.pack(fill="x", padx=8, pady=(0, 6))
        cols.columnconfigure(0, weight=1)
        cols.columnconfigure(1, weight=1)

        for col_i, (idx, card, slot, default_checked) in enumerate(
            [(idx_a, card_a, 'a', False), (idx_b, card_b, 'b', default_checked_b)]
        ):
            key = (pair_key, slot)
            # Each pair/slot gets its OWN BooleanVar (no sharing between groups)
            self._delete_vars[key] = ctk.BooleanVar(value=default_checked)
            if slot == 'b' and default_checked_b:
                # Track for exact toggle
                self._exact_b_keys.append(key)

            # Track real card index for _apply
            self._key_to_idx[key] = idx


            cell = ctk.CTkFrame(cols, fg_color="transparent")
            cell.grid(row=0, column=col_i, sticky="nsew", padx=4)

            # Checkbox + header row
            hdr = ctk.CTkFrame(cell, fg_color="transparent")
            hdr.pack(fill="x")
            ctk.CTkCheckBox(hdr, text=f"#{idx+1} — Xóa?",
                            variable=self._delete_vars[key],
                            width=24, checkbox_width=18, checkbox_height=18,
                            fg_color=DANGER, hover_color="#DC2626",
                            checkmark_color="white",
                            font=ctk.CTkFont(size=12, weight="bold"),
                            text_color=TEXT).pack(side="left", padx=4)

            q = card.question[:160] + ("..." if len(card.question) > 160 else "")
            ctk.CTkLabel(cell, text=q,
                         font=ctk.CTkFont(size=11), text_color=TEXT,
                         wraplength=320, anchor="w", justify="left").pack(anchor="w", padx=6, pady=(2, 0))
            ctk.CTkLabel(cell, text=ans_fn(card),
                         font=ctk.CTkFont(size=11), text_color=SUCCESS,
                         wraplength=320, anchor="w", justify="left").pack(anchor="w", padx=6)

        ctk.CTkFrame(pair_frame, height=1, fg_color=SURFACE2).pack(fill="x", padx=10, pady=(4, 5))

    def _toggle_exact(self):
        """Toggle: if all exact-pair 'b' cards are checked → uncheck all; otherwise → check all."""
        if not self._exact_b_keys:
            return
        all_checked = all(self._delete_vars[k].get() for k in self._exact_b_keys)
        new_state = not all_checked  # flip
        for k in self._exact_b_keys:
            self._delete_vars[k].set(new_state)
        self._toggle_btn.configure(
            text=("☒ Bỏ chọn tất cả (100%)" if new_state else "☑ Chọn tất cả (100%)")
        )

    def _apply(self):
        # Collect unique card indices marked for deletion
        indices_to_delete = sorted(
            {self._key_to_idx[k] for k, var in self._delete_vars.items() if var.get()},
            reverse=True
        )
        for idx in indices_to_delete:
            if 0 <= idx < len(self.deck.cards):
                self.deck.cards.pop(idx)
        self.on_apply(len(indices_to_delete))
        self.destroy()


class ScanAssignDialog(ctk.CTkToplevel):
    def __init__(self, parent, app, image_files, deck_name):
        super().__init__(parent)
        self.app = app
        self.image_files = image_files
        self.deck_name = deck_name
        self.selected_keys = []
        self.title("Assign API Keys for Scan")
        self.geometry("500x400")
        self.resizable(False, False)
        self.grab_set()
        self.configure(fg_color=CARD_BG)
        center_window(self, 500, 400)
        self._build_ui()

    def _build_ui(self):
        ctk.CTkLabel(self, text="🔑 Assign API Keys",
                     font=ctk.CTkFont(size=20, weight="bold"), text_color=TEXT).pack(pady=(20, 5))
        ctk.CTkLabel(self, text="Select which API keys to use for this specific scan.",
                     font=ctk.CTkFont(size=12), text_color=TEXT_DIM).pack(pady=(0, 15))

        list_frame = ctk.CTkScrollableFrame(self, fg_color="transparent")
        list_frame.pack(fill="both", expand=True, padx=20, pady=10)

        all_keys = self.app.settings.get("api_keys", [])
        active_settings_keys = set(self.app.settings.get("active_keys", all_keys))
        used_keys = self.app.get_used_keys()

        self._check_vars = {}
        for i, key in enumerate(all_keys):
            row = ctk.CTkFrame(list_frame, fg_color=SURFACE2, corner_radius=8)
            row.pack(fill="x", pady=3)
            masked = f"...{key[-8:]}" if len(key) > 8 else "****"
            in_use = key in used_keys
            
            # Default to checked if it's active in settings AND not currently in use
            var = ctk.BooleanVar(value=(key in active_settings_keys and not in_use))
            self._check_vars[key] = var
            
            cb = ctk.CTkCheckBox(row, text=f"Key {i+1}: {masked}", variable=var,
                                 width=28, checkbox_width=20, checkbox_height=20,
                                 checkmark_color="white", fg_color=ACCENT, hover_color=ACCENT_HOVER,
                                 text_color=TEXT_DIM if in_use else TEXT)
            cb.pack(side="left", padx=10, pady=10)
            if in_use:
                cb.configure(state="disabled")
                ctk.CTkLabel(row, text="[In Use]", font=ctk.CTkFont(size=11, weight="bold"),
                             text_color=WARNING).pack(side="right", padx=10)

        btns = ctk.CTkFrame(self, fg_color="transparent")
        btns.pack(pady=20)
        ctk.CTkButton(btns, text="Cancel", width=100, height=36,
                      fg_color=SURFACE, hover_color=SURFACE2, text_color=TEXT,
                      command=self.destroy).pack(side="left", padx=10)
        ctk.CTkButton(btns, text="▶ Start Scan", width=120, height=36,
                      fg_color=SUCCESS, hover_color="#059669", text_color="white",
                      font=ctk.CTkFont(weight="bold"),
                      command=self._on_start).pack(side="left", padx=10)

    def _on_start(self):
        selected = [k for k, v in self._check_vars.items() if v.get()]
        if not selected:
            messagebox.showerror("Error", "You must select at least one API key to start the scan.")
            return
        
        # Start background scan
        scan = BackgroundScan(self.app, self.image_files, self.deck_name, selected)
        self.app.active_scans.append(scan)
        scan.start()
        
        win_toast("Scan Started 🚀", f"Scanning '{self.deck_name}' in the background.")
        self.app.show_frame("home")
        self.app.frames["scan"].reset()
        self.destroy()


class BackgroundScan:
    def __init__(self, app, image_files, deck_name, keys):
        self.app = app
        self.id = str(uuid.uuid4())
        self.image_files = image_files
        self.deck_name = deck_name
        self.keys = keys
        
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
        self.status = "Scanning"
        self.status_color = SUCCESS
        
        total = len(self.image_files)
        n_batches = (total + 49) // 50
        self._log(f"📁 {total} images → {n_batches} PDF batch(es)")
        
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



    def _start_scan(self):
        if not self.image_files:
            messagebox.showerror("Error", "Please select a folder with images first.")
            return

        deck_name = self.deck_name_entry.get().strip() or "Untitled Deck"
        ScanAssignDialog(self, self.app, self.image_files, deck_name)

    def reset(self):
        """Call when returning to this frame."""
        self.folder_path = ""
        self.image_files = []
        self.folder_lbl.configure(text="No folder selected", text_color=TEXT_DIM)
        self.file_count_lbl.configure(text="")
        self.deck_name_entry.delete(0, "end")



# ─────────────────────────────────────────────
# SCREEN: Deck List (Home)
# ─────────────────────────────────────────────
class HomeFrame(ctk.CTkFrame):
    def __init__(self, parent, app):
        super().__init__(parent, fg_color=CARD_BG)
        self.app = app
        self._build_ui()

    def _build_ui(self):
        # Header
        hdr = ctk.CTkFrame(self, fg_color=SURFACE, height=65, corner_radius=0)
        hdr.pack(fill="x")
        hdr.pack_propagate(False)
        ctk.CTkLabel(hdr, text="🃏  Flashcard AI",
                     font=ctk.CTkFont(size=22, weight="bold"), text_color=TEXT).pack(side="left", padx=20)

        btn_row = ctk.CTkFrame(hdr, fg_color="transparent")
        btn_row.pack(side="right", padx=15, pady=10)
        ctk.CTkButton(btn_row, text="⚙ API Keys", width=100, height=36,
                      fg_color=SURFACE2, hover_color=SURFACE, text_color=TEXT,
                      command=self.app.open_api_keys).pack(side="left", padx=4)
        ctk.CTkButton(btn_row, text="+ New Scan", width=110, height=36,
                      fg_color=ACCENT, hover_color=ACCENT_HOVER, text_color="white",
                      font=ctk.CTkFont(weight="bold"),
                      command=lambda: self.app.show_frame("scan")).pack(side="left", padx=4)

        # Active Scans Section (updated via refresh)
        self.scans_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.scans_frame.pack(fill="x", padx=20, pady=(15, 0))

        # Search bar
        search_row = ctk.CTkFrame(self, fg_color="transparent")
        search_row.pack(fill="x", padx=20, pady=(10, 10))
        self.search_var = ctk.StringVar()
        self.search_var.trace("w", lambda *a: self.refresh())
        ctk.CTkEntry(search_row, textvariable=self.search_var,
                     placeholder_text="🔍  Search decks...",
                     height=36, font=ctk.CTkFont(size=13)).pack(fill="x")

        # Deck list
        self.scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.scroll.pack(fill="both", expand=True, padx=20, pady=(0, 15))
        self.refresh()


    def refresh(self):
        self._rebuild_scans()
        self._rebuild_decks()

    def _schedule_scan_update(self):
        """Thread-safe: schedule a UI update on the main thread (throttled)."""
        self.app.after(0, self._update_scan_widgets)

    def _rebuild_scans(self):
        """Full rebuild of scan section (called on scan add/remove or button press)."""
        for w in self.scans_frame.winfo_children():
            w.destroy()
        self._scan_widgets = {}
        
        scans = getattr(self.app, "active_scans", [])
        if not scans:
            return

        ctk.CTkLabel(self.scans_frame, text="🔄  Active Scans",
                     font=ctk.CTkFont(size=14, weight="bold"), text_color=SUCCESS).pack(anchor="w", pady=(0, 5))

        for scan in scans:
            row = ctk.CTkFrame(self.scans_frame, fg_color=SURFACE2, corner_radius=8)
            row.pack(fill="x", pady=4)

            info = ctk.CTkFrame(row, fg_color="transparent")
            info.pack(side="left", fill="x", expand=True, padx=15, pady=10)

            ctk.CTkLabel(info, text=scan.deck_name, font=ctk.CTkFont(size=14, weight="bold"),
                         text_color=TEXT).pack(anchor="w")

            status_row = ctk.CTkFrame(info, fg_color="transparent")
            status_row.pack(fill="x", pady=(4, 0))

            pb = ctk.CTkProgressBar(status_row, width=160, height=8, progress_color=ACCENT)
            pb.pack(side="left", pady=4)
            pb.set(scan.progress_frac)

            prog_lbl = ctk.CTkLabel(status_row, text=f"  {scan.progress_text}",
                                    font=ctk.CTkFont(size=11), text_color=TEXT_DIM)
            prog_lbl.pack(side="left")

            sep_lbl = ctk.CTkLabel(status_row, text="  •  ",
                                   font=ctk.CTkFont(size=11), text_color=TEXT_DIM)
            sep_lbl.pack(side="left")

            status_lbl = ctk.CTkLabel(status_row, text=scan.status,
                                      font=ctk.CTkFont(size=11, weight="bold"), text_color=scan.status_color)
            status_lbl.pack(side="left")

            # Store references so we can update in-place
            self._scan_widgets[scan.id] = {
                "row": row, "pb": pb, "prog_lbl": prog_lbl, "status_lbl": status_lbl
            }

            # Mini log panel
            log_box = ctk.CTkTextbox(
                info,
                font=ctk.CTkFont(family="Consolas", size=10),
                fg_color="#F8F9FC",
                text_color=TEXT_DIM,
                corner_radius=6,
                height=70,
                wrap="word",
                state="disabled"
            )
            log_box.pack(fill="x", pady=(6, 0))
            # Fill in existing log content
            if scan.log_lines:
                log_box.configure(state="normal")
                log_box.delete("1.0", "end")
                log_box.insert("end", "\n".join(scan.log_lines[-6:]))
                log_box.see("end")
                log_box.configure(state="disabled")
            self._scan_widgets[scan.id]["log_box"] = log_box

            acts = ctk.CTkFrame(row, fg_color="transparent")
            acts.pack(side="right", padx=15, pady=10)

            if scan.is_finished:
                ctk.CTkButton(acts, text="Dismiss", width=70, height=28,
                              fg_color=SURFACE, hover_color="#E2E8F0", text_color=TEXT,
                              command=lambda s=scan: self._dismiss_scan(s)).pack(side="right")
            else:
                if scan.pause_event.is_set():
                    ctk.CTkButton(acts, text="▶ Resume", width=80, height=28,
                                  fg_color=SUCCESS, hover_color="#059669", text_color="white",
                                  command=scan.resume).pack(side="left", padx=4)
                else:
                    ctk.CTkButton(acts, text="⏸ Pause", width=80, height=28,
                                  fg_color=WARNING, hover_color="#D97706", text_color="white",
                                  command=scan.pause).pack(side="left", padx=4)

                ctk.CTkButton(acts, text="⏹ Stop", width=70, height=28,
                              fg_color=DANGER, hover_color="#DC2626", text_color="white",
                              command=scan.stop).pack(side="left", padx=4)

    def _update_scan_widgets(self):
        """Update progress/status labels in-place WITHOUT rebuilding widgets."""
        scans = getattr(self.app, "active_scans", [])
        # Check if set of active scans has changed (add/remove) → full rebuild needed
        current_ids = set(s.id for s in scans)
        widget_ids = set(getattr(self, "_scan_widgets", {}).keys())
        if current_ids != widget_ids:
            self._rebuild_scans()
            return
        
        for scan in scans:
            w = self._scan_widgets.get(scan.id)
            if not w:
                continue
            try:
                w["pb"].set(scan.progress_frac)
                w["prog_lbl"].configure(text=f"  {scan.progress_text}")
                w["status_lbl"].configure(text=scan.status, text_color=scan.status_color)
                # Update log box in-place
                log_box = w.get("log_box")
                if log_box and scan.log_lines:
                    log_box.configure(state="normal")
                    log_box.delete("1.0", "end")
                    log_box.insert("end", "\n".join(scan.log_lines[-6:]))
                    log_box.see("end")
                    log_box.configure(state="disabled")
            except Exception:
                pass

    def _rebuild_decks(self):
        """Rebuild deck list below active scans."""
        for w in self.scroll.winfo_children():
            w.destroy()

        query = self.search_var.get().lower()
        decks = [d for d in self.app.decks if query in d.name.lower()]

        if not decks:
            ctk.CTkLabel(
                self.scroll,
                text="No decks yet.\nClick '+ New Scan' to create your first deck from images!",
                font=ctk.CTkFont(size=15), text_color=TEXT_DIM, justify="center"
            ).pack(pady=60)
            return

        for deck in reversed(decks):
            self._deck_card(deck)



    def _dismiss_scan(self, scan):
        if scan in self.app.active_scans:
            self.app.active_scans.remove(scan)
        self.refresh()

    def _deck_card(self, deck: Deck):
        card = ctk.CTkFrame(self.scroll, fg_color=SURFACE, corner_radius=12, height=90)
        card.pack(fill="x", pady=5)
        card.pack_propagate(False)

        # Left: info
        info = ctk.CTkFrame(card, fg_color="transparent")
        info.pack(side="left", fill="both", expand=True, padx=15, pady=10)

        ctk.CTkLabel(info, text=deck.name,
                     font=ctk.CTkFont(size=15, weight="bold"), text_color=TEXT,
                     anchor="w").pack(fill="x")

        date_str = deck.created_at[:10] if deck.created_at else ""
        mc = sum(1 for c in deck.cards if c.question_type == QuestionType.MULTIPLE_CHOICE)
        sub_text = f"{deck.card_count} cards  •  {mc} multi-answer  •  {date_str}"
        ctk.CTkLabel(info, text=sub_text,
                     font=ctk.CTkFont(size=12), text_color=TEXT_DIM,
                     anchor="w").pack(fill="x")

        # Right: buttons
        btns = ctk.CTkFrame(card, fg_color="transparent")
        btns.pack(side="right", padx=12, pady=10)
        ctk.CTkButton(btns, text="Study ▶", width=85, height=32,
                      fg_color=SUCCESS, hover_color="#059669", text_color="white",
                      command=lambda d=deck: self.app.show_study(d)).pack(side="left", padx=3)
        ctk.CTkButton(btns, text="Quiz 📝", width=80, height=32,
                      fg_color="#5B4FCF", hover_color="#4A40B8", text_color="white",
                      command=lambda d=deck: self.app.show_quiz(d)).pack(side="left", padx=3)
        ctk.CTkButton(btns, text="View", width=70, height=32,
                      fg_color=ACCENT, hover_color=ACCENT_HOVER, text_color="white",
                      command=lambda d=deck: self.app.show_deck(d)).pack(side="left", padx=3)
        ctk.CTkButton(btns, text="✕", width=32, height=32,
                      fg_color=DANGER, hover_color="#DC2626", text_color="white",
                      command=lambda d=deck: self._delete_deck(d)).pack(side="left", padx=3)

    def _delete_deck(self, deck: Deck):
        if messagebox.askyesno("Delete Deck", f"Delete '{deck.name}'? This cannot be undone."):
            self.app.decks = [d for d in self.app.decks if d.deck_id != deck.deck_id]
            save_decks(self.app.decks)
            self.refresh()


# ─────────────────────────────────────────────
# SCREEN: Deck View (card list)
# ─────────────────────────────────────────────
class DeckFrame(ctk.CTkFrame):
    def __init__(self, parent, app):
        super().__init__(parent, fg_color=CARD_BG)
        self.app = app
        self.deck: Deck = None
        self._build_ui()

    def _build_ui(self):
        # Header
        hdr = ctk.CTkFrame(self, fg_color=SURFACE, height=60, corner_radius=0)
        hdr.pack(fill="x")
        hdr.pack_propagate(False)
        self.title_lbl = ctk.CTkLabel(hdr, text="",
                                      font=ctk.CTkFont(size=18, weight="bold"), text_color=TEXT)
        self.title_lbl.pack(side="left", padx=20)
        btn_row = ctk.CTkFrame(hdr, fg_color="transparent")
        btn_row.pack(side="right", padx=15)
        ctk.CTkButton(btn_row, text="← Home", width=85, height=32,
                      fg_color=SURFACE2, hover_color=SURFACE, text_color=TEXT,
                      command=lambda: self.app.show_frame("home")).pack(side="left", padx=3)
        ctk.CTkButton(btn_row, text="Quiz 📝", width=80, height=32,
                      fg_color="#5B4FCF", hover_color="#4A40B8", text_color="white",
                      command=lambda: self.app.show_quiz(self.deck)).pack(side="left", padx=3)
        ctk.CTkButton(btn_row, text="Study ▶", width=85, height=32,
                      fg_color=SUCCESS, hover_color="#059669", text_color="white",
                      command=lambda: self.app.show_study(self.deck)).pack(side="left", padx=3)
        ctk.CTkButton(btn_row, text="Export Quizlet", width=120, height=32,
                      fg_color=ACCENT, hover_color=ACCENT_HOVER, text_color="white",
                      command=self._export).pack(side="left", padx=3)
        self._dedup_btn = ctk.CTkButton(btn_row, text="🔍 Lọc câu trùng", width=120, height=32,
                      fg_color="#7C3AED", hover_color="#6D28D9", text_color="white",
                      command=self._dedup_questions)
        self._dedup_btn.pack(side="left", padx=3)

        # Stats bar
        self.stats_bar = ctk.CTkFrame(self, fg_color=SURFACE2, height=36, corner_radius=0)
        self.stats_bar.pack(fill="x")
        self.stats_bar.pack_propagate(False)
        self.stats_lbl = ctk.CTkLabel(self.stats_bar, text="",
                                      font=ctk.CTkFont(size=12), text_color=TEXT_DIM)
        self.stats_lbl.pack(side="left", padx=15)

        # Cards list
        self.scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.scroll.pack(fill="both", expand=True, padx=15, pady=10)

    CARDS_PER_PAGE = 50

    def load_deck(self, deck: Deck):
        self.deck = deck
        self._loaded_count = 0
        self.title_lbl.configure(text=f"📚  {deck.name}")
        mc = sum(1 for c in deck.cards if c.question_type == QuestionType.MULTIPLE_CHOICE)
        self.stats_lbl.configure(
            text=f"{deck.card_count} cards  ·  {mc} multi-answer  ·  {deck.card_count - mc} single"
        )
        self._refresh_cards()

    def _refresh_cards(self):
        for w in self.scroll.winfo_children():
            w.destroy()
        if not self.deck:
            return
        self._loaded_count = 0
        self._load_more_cards()

    def _load_more_cards(self):
        """Load next batch of CARDS_PER_PAGE (50) cards on demand."""
        if not self.deck:
            return
        # Remove old load-more button first
        for w in list(self.scroll.winfo_children()):
            if getattr(w, "_is_load_more", False):
                w.destroy()
        start = self._loaded_count
        end = min(start + self.CARDS_PER_PAGE, len(self.deck.cards))
        for i in range(start, end):
            self._card_row(i, self.deck.cards[i])
        self._loaded_count = end
        # Show load-more button if there are more cards
        if self._loaded_count < len(self.deck.cards):
            remaining = len(self.deck.cards) - self._loaded_count
            btn = ctk.CTkButton(
                self.scroll,
                text=f"⇩  Load {min(self.CARDS_PER_PAGE, remaining)} more  ({remaining} remaining)",
                height=36, fg_color=SURFACE2, hover_color=SURFACE, text_color=TEXT,
                font=ctk.CTkFont(size=12),
                command=self._load_more_cards
            )
            btn._is_load_more = True
            btn.pack(fill="x", pady=8)

    def _card_row(self, idx: int, card: Flashcard):
        row = ctk.CTkFrame(self.scroll, fg_color=SURFACE, corner_radius=10)
        row.pack(fill="x", pady=4)

        # Number badge
        badge = ctk.CTkFrame(row, fg_color=ACCENT, width=40, corner_radius=8)
        badge.pack(side="left", padx=8, pady=8, fill="y")
        badge.pack_propagate(False)
        ctk.CTkLabel(badge, text=str(idx + 1),
                     font=ctk.CTkFont(size=13, weight="bold"), text_color="white").pack(expand=True)

        # Content
        content = ctk.CTkFrame(row, fg_color="transparent")
        content.pack(side="left", fill="both", expand=True, padx=5, pady=8)

        type_color = WARNING if card.question_type == QuestionType.MULTIPLE_CHOICE else SUCCESS
        type_text = "Multi-answer" if card.question_type == QuestionType.MULTIPLE_CHOICE else "Single"
        ctk.CTkLabel(content, text=f"[{type_text}]",
                     font=ctk.CTkFont(size=11), text_color=type_color).pack(anchor="w")
        ctk.CTkLabel(content, text=card.question,
                     font=ctk.CTkFont(size=13), text_color=TEXT,
                     anchor="w", wraplength=550).pack(anchor="w")

        opts_short = "  ".join(card.options[:4])
        if len(card.options) > 4:
            opts_short += f"  (+{len(card.options)-4} more)"
        ctk.CTkLabel(content, text=opts_short,
                     font=ctk.CTkFont(size=11), text_color=TEXT_DIM,
                     anchor="w", wraplength=550).pack(anchor="w", pady=(2, 0))

        ans = " | ".join(card.correct_answers)
        ctk.CTkLabel(content, text=f"✓ {ans}",
                     font=ctk.CTkFont(size=12), text_color=SUCCESS).pack(anchor="w")

        # Delete button
        ctk.CTkButton(row, text="✕", width=28, height=28,
                      fg_color=DANGER, hover_color="#DC2626",
                      command=lambda idx=idx: self._delete_card(idx)).pack(side="right", padx=8)

    def _delete_card(self, idx):
        if not self.deck:
            return
        self.deck.cards.pop(idx)
        save_decks(self.app.decks)
        self._refresh_cards()
        mc = sum(1 for c in self.deck.cards if c.question_type == QuestionType.MULTIPLE_CHOICE)
        self.stats_lbl.configure(
            text=f"{self.deck.card_count} cards  ·  {mc} multi-answer  ·  {self.deck.card_count - mc} single"
        )

    def _export(self):
        if not self.deck:
            return
        ExportDialog(self, self.app, self.deck)

    def _dedup_questions(self):
        if not self.deck or not self.deck.cards:
            return
        # Prevent spam: disable button and show loading state immediately
        if hasattr(self, '_dedup_btn') and self._dedup_btn.winfo_exists():
            self._dedup_btn.configure(text="⏳ Đang lọc...", state="disabled", fg_color="#9CA3AF")

        def _run():
            try:
                dupes = find_duplicate_questions(self.deck.cards, threshold=0.85)
            except Exception:
                dupes = []
            # Back on main thread
            self.after(0, lambda: self._show_dedup_result(dupes))

        threading.Thread(target=_run, daemon=True).start()

    def _show_dedup_result(self, dupes):
        # Restore button
        if hasattr(self, '_dedup_btn') and self._dedup_btn.winfo_exists():
            self._dedup_btn.configure(text="🔍 Lọc câu trùng", state="normal", fg_color="#7C3AED")
        if not dupes:
            messagebox.showinfo("Kết quả",
                                f"Không tìm thấy thẻ học nào trùng nhau "
                                f"(trong tổng số {len(self.deck.cards)} thẻ)! 🎉")
            return
        QuestionDedupDialog(self, self.deck, dupes, self._apply_question_dedup)

    def _apply_question_dedup(self, removed_count):
        save_decks(self.app.decks)
        self.load_deck(self.deck)  # refresh stats + card list
        if removed_count > 0:
            messagebox.showinfo("✅ Hoàn tất", f"Đã xóa {removed_count} thẻ học trùng lặp.")


# ─────────────────────────────────────────────
# DIALOG: Export to Quizlet
# ─────────────────────────────────────────────
class ExportDialog(ctk.CTkToplevel):
    def __init__(self, parent, app, deck: Deck):
        super().__init__(parent)
        self.deck = deck
        self.app = app
        self.title("Export to Quizlet")
        self.geometry("640x500")
        self.resizable(False, False)
        self.grab_set()
        self.configure(fg_color=CARD_BG)
        self._build()

    def _build(self):
        ctk.CTkLabel(self, text="📤  Export to Quizlet",
                     font=ctk.CTkFont(size=20, weight="bold"), text_color=TEXT).pack(pady=(20, 5))
        ctk.CTkLabel(self, text="Choose format → preview → export. Import .txt to quizlet.com → New Study Set → Import.",
                     font=ctk.CTkFont(size=12), text_color=TEXT_DIM).pack(pady=(0, 5))
        self._hint_lbl = ctk.CTkLabel(self, text="",
                                      font=ctk.CTkFont(size=11), text_color=WARNING)
        self._hint_lbl.pack(pady=(0, 10))

        # Format selector
        fmt_row = ctk.CTkFrame(self, fg_color=SURFACE, corner_radius=10)
        fmt_row.pack(fill="x", padx=20, pady=(0, 10))
        ctk.CTkLabel(fmt_row, text="Format:", font=ctk.CTkFont(size=13, weight="bold"),
                     text_color=TEXT).pack(side="left", padx=12, pady=10)
        self.fmt_var = ctk.StringVar(value="full")
        for val, label in [
            ("simple",  "Simple"),
            ("full",    "Full (Recommended)"),
            ("compact", "Compact"),
            ("safe",    "Safe (code-safe)"),
        ]:
            ctk.CTkRadioButton(fmt_row, text=label, variable=self.fmt_var, value=val,
                               font=ctk.CTkFont(size=13),
                               command=self._update_preview).pack(side="left", padx=8, pady=10)

        # Preview
        ctk.CTkLabel(self, text="Preview (first 5 cards):",
                     font=ctk.CTkFont(size=13, weight="bold"), text_color=TEXT_DIM).pack(anchor="w", padx=20)
        self.preview = ctk.CTkTextbox(self, height=220, font=ctk.CTkFont(family="Consolas", size=12),
                                      fg_color=SURFACE, text_color=TEXT, wrap="word")
        self.preview.pack(fill="both", expand=True, padx=20, pady=(5, 15))
        self._update_preview()

        ctk.CTkButton(self, text="💾  Export .txt File", height=42,
                      fg_color=ACCENT, hover_color=ACCENT_HOVER, text_color="white",
                      font=ctk.CTkFont(size=14, weight="bold"),
                      command=self._do_export).pack(pady=(0, 20))

    def _update_preview(self):
        fmt = self.fmt_var.get()
        if fmt == "safe":
            self._hint_lbl.configure(
                text="⚠ Safe mode → Quizlet Import: Giữa thuật ngữ & định nghĩa = Tùy chỉnh → {[(DapAn)]}    Giữa các thẻ = Tùy chỉnh → {[(CauHoi)]}"
            )
        else:
            self._hint_lbl.configure(text="")
        preview = get_quizlet_preview(self.deck, fmt, max_rows=5)
        self.preview.configure(state="normal")
        self.preview.delete("1.0", "end")
        self.preview.insert("1.0", preview)
        self.preview.configure(state="disabled")

    def _do_export(self):
        default_name = f"{self.deck.name}_quizlet.txt".replace(" ", "_")
        path = filedialog.asksaveasfilename(
            title="Save Quizlet File",
            defaultextension=".txt",
            initialfile=default_name,
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")]
        )
        if not path:
            return
        fmt = self.fmt_var.get()
        msg = export_to_quizlet(self.deck, path, fmt)
        messagebox.showinfo("Export Complete", msg)
        self.destroy()


# ─────────────────────────────────────────────
# SCREEN: Study Mode (flip cards)
# ─────────────────────────────────────────────
class StudyFrame(ctk.CTkFrame):
    def __init__(self, parent, app):
        super().__init__(parent, fg_color=CARD_BG)
        self.app = app
        self.deck: Deck = None
        self.cards = []
        self.index = 0
        self.showing_answer = False
        self.known = 0
        self.unknown = 0
        self._build_ui()

    def _build_ui(self):
        # Header
        hdr = ctk.CTkFrame(self, fg_color=SURFACE, height=60, corner_radius=0)
        hdr.pack(fill="x")
        hdr.pack_propagate(False)
        self.title_lbl = ctk.CTkLabel(hdr, text="",
                                      font=ctk.CTkFont(size=18, weight="bold"), text_color=TEXT)
        self.title_lbl.pack(side="left", padx=20)
        ctk.CTkButton(hdr, text="← Back", width=85, height=34,
                      fg_color=SURFACE2, hover_color=SURFACE, text_color=TEXT,
                      command=self._go_back).pack(side="right", padx=15)

        # Progress
        prog_row = ctk.CTkFrame(self, fg_color=SURFACE2, height=40, corner_radius=0)
        prog_row.pack(fill="x")
        prog_row.pack_propagate(False)
        self.prog_lbl = ctk.CTkLabel(prog_row, text="",
                                     font=ctk.CTkFont(size=13), text_color=TEXT_DIM)
        self.prog_lbl.pack(side="left", padx=15)
        self.score_lbl = ctk.CTkLabel(prog_row, text="",
                                      font=ctk.CTkFont(size=13), text_color=TEXT_DIM)
        self.score_lbl.pack(side="right", padx=15)

        # Card area
        card_area = ctk.CTkFrame(self, fg_color="transparent")
        card_area.pack(fill="both", expand=True, padx=40, pady=25)

        # The flip card (question side)
        self.card_frame = ctk.CTkFrame(card_area, fg_color=SURFACE, corner_radius=18)
        self.card_frame.pack(fill="both", expand=True)

        self.type_badge = ctk.CTkLabel(self.card_frame, text="",
                                       font=ctk.CTkFont(size=12), text_color=TEXT_DIM)
        self.type_badge.pack(anchor="ne", padx=15, pady=(15, 0))

        self.question_lbl = ctk.CTkLabel(
            self.card_frame, text="", wraplength=700,
            font=ctk.CTkFont(size=17, weight="bold"), text_color=TEXT,
            justify="center"
        )
        self.question_lbl.pack(pady=(10, 15), padx=30)

        # Options container
        self.options_frame = ctk.CTkFrame(self.card_frame, fg_color="transparent")
        self.options_frame.pack(fill="x", padx=50, pady=(0, 10))

        # Answer reveal area
        self.answer_frame = ctk.CTkFrame(self.card_frame, fg_color=SURFACE2, corner_radius=12)

        self.answer_lbl = ctk.CTkLabel(self.answer_frame, text="",
                                       font=ctk.CTkFont(size=15, weight="bold"),
                                       text_color=SUCCESS, wraplength=600, justify="center")
        self.answer_lbl.pack(pady=10, padx=20)

        # Flip button
        self.flip_btn = ctk.CTkButton(
            self.card_frame, text="👆  Tap to reveal answer",
            height=42, fg_color=ACCENT, hover_color=ACCENT_HOVER,
            text_color="white", font=ctk.CTkFont(size=14, weight="bold"),
            command=self._flip
        )
        self.flip_btn.pack(pady=(5, 20), padx=40, fill="x")

        # Know / Don't know buttons
        btn_row = ctk.CTkFrame(self, fg_color="transparent")
        btn_row.pack(pady=(0, 20))
        self.dont_know_btn = ctk.CTkButton(
            btn_row, text="✗  Don't Know", width=180, height=50,
            fg_color=DANGER, hover_color="#DC2626",
            text_color="white",
            font=ctk.CTkFont(size=15, weight="bold"),
            state="disabled", command=self._dont_know
        )
        self.dont_know_btn.pack(side="left", padx=10)
        self.know_btn = ctk.CTkButton(
            btn_row, text="✓  Know It", width=180, height=50,
            fg_color=SUCCESS, hover_color="#059669",
            text_color="white",
            font=ctk.CTkFont(size=15, weight="bold"),
            state="disabled", command=self._know
        )
        self.know_btn.pack(side="left", padx=10)

    def load_deck(self, deck: Deck):
        self.deck = deck
        self.cards = list(deck.cards)
        self.index = 0
        self.showing_answer = False
        self.known = 0
        self.unknown = 0
        self.title_lbl.configure(text=f"📖  {deck.name}")
        self._show_card()

    def _show_card(self):
        if self.index >= len(self.cards):
            self._show_results()
            return

        self.showing_answer = False
        card = self.cards[self.index]

        # Progress
        self.prog_lbl.configure(text=f"Card {self.index + 1} of {len(self.cards)}")
        self.score_lbl.configure(
            text=f"✓ {self.known}  ✗ {self.unknown}",
            text_color=TEXT_DIM
        )

        # Type badge
        if card.question_type == QuestionType.MULTIPLE_CHOICE:
            self.type_badge.configure(text="🔵 Multiple Answers", text_color=WARNING)
        else:
            self.type_badge.configure(text="🟢 Single Answer", text_color=SUCCESS)

        # Question
        self.question_lbl.configure(text=card.question)

        # Options
        for w in self.options_frame.winfo_children():
            w.destroy()
        for opt in card.options:
            ctk.CTkLabel(self.options_frame, text=opt,
                         font=ctk.CTkFont(size=14), text_color=TEXT,
                         anchor="w").pack(anchor="w", pady=2)

        # Hide answer
        self.answer_frame.pack_forget()
        self.flip_btn.configure(text="👆  Tap to reveal answer", state="normal")
        self.know_btn.configure(state="disabled")
        self.dont_know_btn.configure(state="disabled")

    def _flip(self):
        if self.showing_answer:
            return
        self.showing_answer = True
        card = self.cards[self.index]

        # Get correct answer texts
        ans_texts = []
        for letter in card.correct_answers:
            for opt in card.options:
                stripped = opt.strip()
                if stripped.startswith(f"{letter}.") or stripped.startswith(f"{letter})"):
                    ans_texts.append(stripped)
                    break
            else:
                ans_texts.append(letter)

        ans_display = "\n".join(ans_texts) if ans_texts else "Unknown"
        self.answer_lbl.configure(text=f"✓ Correct Answer:\n{ans_display}")
        self.answer_frame.pack(fill="x", padx=50, pady=(0, 10))
        self.flip_btn.configure(text="Answer revealed", state="disabled")
        self.know_btn.configure(state="normal")
        self.dont_know_btn.configure(state="normal")

    def _know(self):
        self.known += 1
        self.index += 1
        self._show_card()

    def _dont_know(self):
        self.unknown += 1
        self.index += 1
        self._show_card()

    def _show_results(self):
        for w in self.card_frame.winfo_children():
            w.destroy()
        total = self.known + self.unknown
        pct = int(self.known / total * 100) if total else 0

        ctk.CTkLabel(self.card_frame, text="🎉  Session Complete!",
                     font=ctk.CTkFont(size=24, weight="bold"), text_color=TEXT).pack(pady=(30, 10))
        ctk.CTkLabel(self.card_frame,
                     text=f"Score: {self.known} / {total}  ({pct}%)",
                     font=ctk.CTkFont(size=20), text_color=SUCCESS).pack(pady=10)
        ctk.CTkLabel(self.card_frame, text=f"✓ Know: {self.known}   ✗ Don't Know: {self.unknown}",
                     font=ctk.CTkFont(size=15), text_color=TEXT_DIM).pack(pady=5)

        ctk.CTkButton(self.card_frame, text="🔄  Study Again", width=200, height=44,
                      fg_color=ACCENT, hover_color=ACCENT_HOVER,
                      font=ctk.CTkFont(size=14, weight="bold"),
                      command=lambda: self.load_deck(self.deck)).pack(pady=20)

        self.know_btn.configure(state="disabled")
        self.dont_know_btn.configure(state="disabled")

    def _go_back(self):
        self.app.show_frame("home")


# ─────────────────────────────────────────────
# SCREEN: Quiz / Test Mode
# ─────────────────────────────────────────────
class QuizFrame(ctk.CTkFrame):
    def __init__(self, parent, app):
        super().__init__(parent, fg_color=CARD_BG)
        self.app = app
        self.deck: Deck = None
        self.session: QuizSession = None
        self._choice_vars = []
        self._option_btns = []
        self._revealed = False
        self._q_size = 15      # question font size
        self._a_size = 13      # answer font size
        self._build_ui()

    def _build_ui(self):
        # ── Header ────────────────────────────────────
        hdr = ctk.CTkFrame(self, fg_color=SURFACE, height=58, corner_radius=0)
        hdr.pack(fill="x")
        hdr.pack_propagate(False)

        self.title_lbl = ctk.CTkLabel(hdr, text="",
                                       font=ctk.CTkFont(size=18, weight="bold"), text_color=TEXT)
        self.title_lbl.pack(side="left", padx=20)

        hdr_right = ctk.CTkFrame(hdr, fg_color="transparent")
        hdr_right.pack(side="right", padx=15)
        self.prog_lbl = ctk.CTkLabel(hdr_right, text="",
                                     font=ctk.CTkFont(size=13), text_color=TEXT_DIM)
        self.prog_lbl.pack(side="left", padx=12)
        ctk.CTkButton(hdr_right, text="Thoát & Lưu", width=110, height=32,
                      fg_color=SURFACE2, hover_color=SURFACE, text_color=TEXT,
                      command=self._exit_save).pack(side="left", padx=4)

        # ── Progress bar ──────────────────────────────
        self.prog_bar = ctk.CTkProgressBar(self, height=8, progress_color=ACCENT, fg_color=SURFACE2)
        self.prog_bar.pack(fill="x")
        self.prog_bar.set(0)

        # ── Scrollable content area ───────────────────
        self.body = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.body.pack(fill="both", expand=True, padx=40, pady=(15, 5))

        # Question type badge + zoom row
        top_row = ctk.CTkFrame(self.body, fg_color="transparent")
        top_row.pack(fill="x", pady=(0, 4))
        self.type_badge = ctk.CTkLabel(top_row, text="",
                                       font=ctk.CTkFont(size=12, weight="bold"))
        self.type_badge.pack(side="left")

        # Question zoom controls
        q_zoom = ctk.CTkFrame(top_row, fg_color="transparent")
        q_zoom.pack(side="right")
        ctk.CTkLabel(q_zoom, text="Câu hỏi:",
                     font=ctk.CTkFont(size=11), text_color=TEXT_DIM).pack(side="left", padx=(0, 4))
        ctk.CTkButton(q_zoom, text="A-", width=32, height=26,
                      fg_color=SURFACE2, hover_color=SURFACE, text_color=TEXT,
                      font=ctk.CTkFont(size=11),
                      command=lambda: self._zoom_question(-1)).pack(side="left", padx=2)
        ctk.CTkButton(q_zoom, text="A+", width=32, height=26,
                      fg_color=SURFACE2, hover_color=SURFACE, text_color=TEXT,
                      font=ctk.CTkFont(size=11),
                      command=lambda: self._zoom_question(1)).pack(side="left", padx=2)

        # Question text
        self.question_lbl = ctk.CTkLabel(self.body, text="",
                                          font=ctk.CTkFont(size=self._q_size, weight="bold"),
                                          text_color=TEXT, wraplength=820, justify="left", anchor="w")
        self.question_lbl.pack(fill="x", pady=(4, 16))

        # Answer zoom controls
        ans_zoom_row = ctk.CTkFrame(self.body, fg_color="transparent")
        ans_zoom_row.pack(fill="x", pady=(0, 4))
        ctk.CTkLabel(ans_zoom_row, text="Đáp án:",
                     font=ctk.CTkFont(size=11), text_color=TEXT_DIM).pack(side="left", padx=(0, 4))
        ctk.CTkButton(ans_zoom_row, text="A-", width=32, height=26,
                      fg_color=SURFACE2, hover_color=SURFACE, text_color=TEXT,
                      font=ctk.CTkFont(size=11),
                      command=lambda: self._zoom_answers(-1)).pack(side="left", padx=2)
        ctk.CTkButton(ans_zoom_row, text="A+", width=32, height=26,
                      fg_color=SURFACE2, hover_color=SURFACE, text_color=TEXT,
                      font=ctk.CTkFont(size=11),
                      command=lambda: self._zoom_answers(1)).pack(side="left", padx=2)

        # Options container
        self.options_frame = ctk.CTkFrame(self.body, fg_color="transparent")
        self.options_frame.pack(fill="x", pady=(0, 6))

        # Feedback + correct answer reveal
        self.feedback_lbl = ctk.CTkLabel(self.body, text="",
                                          font=ctk.CTkFont(size=13, weight="bold"),
                                          wraplength=820, justify="left")
        self.feedback_lbl.pack(anchor="w", pady=(10, 3))

        self.correct_lbl = ctk.CTkLabel(self.body, text="",
                                         font=ctk.CTkFont(size=13), text_color=SUCCESS,
                                         wraplength=820, justify="left")
        self.correct_lbl.pack(anchor="w", pady=(0, 10))

        # ── Fixed bottom action bar ────────────────────
        self.footer = ctk.CTkFrame(self, fg_color=SURFACE, height=64, corner_radius=0)
        self.footer.pack(fill="x", side="bottom")
        self.footer.pack_propagate(False)

        self.confirm_btn = ctk.CTkButton(self.footer, text="✔  Xác nhận", width=160, height=42,
                                          fg_color=ACCENT, hover_color=ACCENT_HOVER, text_color="white",
                                          font=ctk.CTkFont(size=14, weight="bold"),
                                          command=self._confirm)
        self.confirm_btn.pack(side="left", padx=(20, 8), pady=11)

        self.next_btn = ctk.CTkButton(self.footer, text="Câu tiếp →", width=150, height=42,
                                       fg_color=SUCCESS, hover_color="#059669", text_color="white",
                                       font=ctk.CTkFont(size=14, weight="bold"),
                                       state="disabled",
                                       command=self._next_question)
        self.next_btn.pack(side="left", padx=4, pady=11)

        self.restart_btn = ctk.CTkButton(self.footer, text="🔄 Làm lại", width=130, height=42,
                                          fg_color=WARNING, hover_color="#D97706", text_color="white",
                                          font=ctk.CTkFont(size=13, weight="bold"),
                                          command=self._restart,
                                          state="disabled")
        self.restart_btn.pack(side="right", padx=20, pady=11)

    # ── Zoom helpers ──────────────────────────────────────────────────────
    def _zoom_question(self, delta: int):
        self._q_size = max(9, min(30, self._q_size + delta))
        self.question_lbl.configure(font=ctk.CTkFont(size=self._q_size, weight="bold"))

    def _zoom_answers(self, delta: int):
        self._a_size = max(9, min(28, self._a_size + delta))
        for _, (btn, _) in zip(self._choice_vars, self._option_btns):
            try:
                btn.configure(font=ctk.CTkFont(size=self._a_size))
            except Exception:
                pass



    # ─── Load ──────────────────────────────────────────────────────────────
    def load_quiz(self, deck: Deck, session: QuizSession = None):
        self.deck = deck
        self.title_lbl.configure(text=f"📝  {deck.name}")
        if session:
            self.session = session
        else:
            self.session = QuizSession.new_for_deck(deck)
        self._revealed = False
        self._show_question()

    def _current_card(self) -> Flashcard:
        idx = self.session.question_order[self.session.current_index]
        return self.deck.cards[idx]

    def _show_question(self):
        if self.session.is_complete:
            self._show_results()
            return

        self._revealed = False
        self.feedback_lbl.configure(text="")
        self.correct_lbl.configure(text="")
        self.confirm_btn.configure(state="normal")
        self.next_btn.configure(state="disabled")
        self.restart_btn.configure(state="disabled")

        n = len(self.session.question_order)
        cur = self.session.current_index + 1
        self.prog_lbl.configure(text=f"Câu {cur} / {n}")
        self.prog_bar.set(self.session.progress_frac)

        card = self._current_card()
        is_multi = (card.question_type == QuestionType.MULTIPLE_CHOICE)

        if is_multi:
            self.type_badge.configure(text="🔵 Chọn nhiều đáp án", text_color=WARNING)
        else:
            self.type_badge.configure(text="🟢 Chọn một đáp án", text_color=SUCCESS)

        self.question_lbl.configure(text=card.question)

        # Clear old options
        for w in self.options_frame.winfo_children():
            w.destroy()
        self._choice_vars = []
        self._option_btns = []

        for opt in card.options:
            if is_multi:
                var = ctk.BooleanVar(value=False)
                self._choice_vars.append(var)
                btn = ctk.CTkCheckBox(
                    self.options_frame, text=opt, variable=var,
                    font=ctk.CTkFont(size=self._a_size), text_color=TEXT,
                    fg_color=ACCENT, hover_color=ACCENT_HOVER,
                    checkmark_color="white", checkbox_width=22, checkbox_height=22
                )
            else:
                var = ctk.BooleanVar(value=False)
                self._choice_vars.append(var)
                btn = ctk.CTkCheckBox(
                    self.options_frame, text=opt, variable=var,
                    font=ctk.CTkFont(size=self._a_size), text_color=TEXT,
                    fg_color=ACCENT, hover_color=ACCENT_HOVER,
                    checkmark_color="white", checkbox_width=22, checkbox_height=22,
                    command=lambda v=var: self._single_select(v)
                )
            btn.pack(fill="x", pady=4, padx=5)
            self._option_btns.append((btn, opt))

    def _single_select(self, selected_var):
        """For single-choice: uncheck all others."""
        for var in self._choice_vars:
            if var is not selected_var:
                var.set(False)

    def _get_selected_letters(self):
        selected = []
        for var, (btn, opt_text) in zip(self._choice_vars, self._option_btns):
            if var.get():
                letter = opt_text.strip()[0]  # "A", "B", etc.
                selected.append(letter)
        return selected

    def _confirm(self):
        if self._revealed:
            return
        card = self._current_card()
        selected = self._get_selected_letters()

        if not selected:
            self.feedback_lbl.configure(text="⚠ Bạn chưa chọn đáp án!", text_color=WARNING)
            return

        self._revealed = True
        self.confirm_btn.configure(state="disabled")
        self.next_btn.configure(state="normal")

        # Save answer
        self.session.answers[card.card_id] = selected

        correct = set(card.correct_answers)
        chosen = set(selected)

        # Highlight options
        for var, (btn, opt_text) in zip(self._choice_vars, self._option_btns):
            letter = opt_text.strip()[0]
            if letter in correct:
                btn.configure(text_color=SUCCESS)
            elif letter in chosen:
                btn.configure(text_color=DANGER)

        # Score
        if chosen == correct:
            self.session.correct_count += 1
            self.feedback_lbl.configure(text="✅ Đúng!", text_color=SUCCESS)
            self.correct_lbl.configure(text="")
        else:
            self.session.wrong_count += 1
            self.feedback_lbl.configure(text="❌ Sai!", text_color=DANGER)
            correct_text = card.get_correct_answer_text()
            self.correct_lbl.configure(text=f"Đáp án đúng: {correct_text}")

    def _next_question(self):
        self.session.current_index += 1
        save_quiz_session(self.session)
        self._show_question()

    def _show_results(self):
        """Show end-of-quiz summary."""
        for w in self.options_frame.winfo_children():
            w.destroy()
        self.type_badge.configure(text="")
        self.question_lbl.configure(text="")
        self.feedback_lbl.configure(text="")
        self.correct_lbl.configure(text="")
        self.confirm_btn.configure(state="disabled")
        self.next_btn.configure(state="disabled")
        self.restart_btn.configure(state="normal")
        self.prog_bar.set(1.0)

        total = self.session.correct_count + self.session.wrong_count
        pct = int(self.session.correct_count / total * 100) if total else 0
        n = len(self.session.question_order)
        self.prog_lbl.configure(text=f"Hoàn thành {n}/{n}")

        # Results panel
        panel = ctk.CTkFrame(self.options_frame, fg_color=SURFACE, corner_radius=12)
        panel.pack(fill="x", pady=20)

        if pct >= 70:
            emoji, color = "🎉", SUCCESS
        elif pct >= 50:
            emoji, color = "😐", WARNING
        else:
            emoji, color = "😓", DANGER

        ctk.CTkLabel(panel, text=f"{emoji}  Kết Quả Bài Thi",
                     font=ctk.CTkFont(size=22, weight="bold"), text_color=TEXT).pack(pady=(20, 5))
        ctk.CTkLabel(panel, text=f"{pct}%",
                     font=ctk.CTkFont(size=48, weight="bold"), text_color=color).pack(pady=5)
        ctk.CTkLabel(panel,
                     text=f"✅ Đúng: {self.session.correct_count}   ❌ Sai: {self.session.wrong_count}   📋 Tổng: {n}",
                     font=ctk.CTkFont(size=14), text_color=TEXT_DIM).pack(pady=(0, 20))

        # Delete saved session since it's complete
        delete_quiz_session(self.deck.deck_id)

    def _restart(self):
        delete_quiz_session(self.deck.deck_id)
        new_session = QuizSession.new_for_deck(self.deck)
        self.load_quiz(self.deck, new_session)

    def _exit_save(self):
        if not self.session.is_complete:
            save_quiz_session(self.session)
        self.app.show_frame("home")


# ─────────────────────────────────────────────
# MAIN APPLICATION
# ─────────────────────────────────────────────
class FlashcardApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Flashcard AI  —  PNG to Quizlet")
        self.configure(fg_color=CARD_BG)
        self.minsize(1100, 720)
        self.resizable(True, True)
        # Center main window on screen
        sw = self.winfo_screenwidth()
        sh = self.winfo_screenheight()
        w, h = 1100, 720
        self.geometry(f"{w}x{h}+{(sw-w)//2}+{(sh-h)//2}")

        try:
            self.iconbitmap(default="")
        except Exception:
            pass

        # Load data
        self.settings = load_settings()
        self.decks = load_decks()
        self.gemini_service = GeminiService()
        if self.settings.get("api_keys"):
            self.gemini_service.set_keys(self.settings["api_keys"])
            
        self.active_scans = []
        
        # Build frames
        self.container = ctk.CTkFrame(self, fg_color=CARD_BG)
        self.container.pack(fill="both", expand=True)

        self.frames = {}
        self.home_frame = HomeFrame(self.container, self)
        self.scan_frame = ScanFrame(self.container, self)
        self.deck_frame = DeckFrame(self.container, self)
        self.study_frame = StudyFrame(self.container, self)

        self.frames["home"] = self.home_frame
        self.frames["scan"] = self.scan_frame
        self.frames["deck"] = self.deck_frame
        self.frames["study"] = self.study_frame
        self.quiz_frame = QuizFrame(self.container, self)
        self.frames["quiz"] = self.quiz_frame

        self.show_frame("home")

    def get_used_keys(self):
        used = set()
        for scan in getattr(self, "active_scans", []):
            if not scan.is_finished:
                for k in scan.keys:
                    used.add(k)
        return used

    def show_frame(self, name: str):
        for f in self.frames.values():
            f.pack_forget()
        frame = self.frames[name]
        frame.pack(fill="both", expand=True)
        if name == "home":
            self.home_frame.refresh()

    def show_deck(self, deck: Deck):
        self.deck_frame.load_deck(deck)
        self.show_frame("deck")

    def show_study(self, deck: Deck):
        if not deck.cards:
            messagebox.showinfo("Empty Deck", "This deck has no cards to study.")
            return
        self.study_frame.load_deck(deck)
        self.show_frame("study")

    def show_quiz(self, deck: Deck):
        if not deck.cards:
            messagebox.showinfo("Empty Deck", "This deck has no cards to start a quiz.")
            return
        sessions = load_quiz_sessions()
        saved = sessions.get(deck.deck_id)
        if saved and not saved.is_complete:
            n = len(saved.question_order)
            answered = saved.current_index
            resume = messagebox.askyesno(
                "Tiếp tục bài thi?",
                f"Bạn đang làm dở bài thi '{deck.name}'\n"
                f"Tiến độ: {answered}/{n} câu\n\n"
                f"Chọn 'Yes' để tiếp tục, 'No' để làm lại từ đầu."
            )
            if resume:
                self.quiz_frame.load_quiz(deck, saved)
            else:
                delete_quiz_session(deck.deck_id)
                self.quiz_frame.load_quiz(deck)
        else:
            self.quiz_frame.load_quiz(deck)
        self.show_frame("quiz")

    def open_api_keys(self):
        def on_save(new_settings):
            self.settings = new_settings
            save_settings(self.settings)
            # Use active_keys if set, otherwise fall back to all api_keys
            keys_to_use = new_settings.get("active_keys") or new_settings.get("api_keys", [])
            self.gemini_service.set_keys(keys_to_use)
        APIKeyDialog(self, self.settings, on_save)


# ─────────────────────────────────────────────
if __name__ == "__main__":
    app = FlashcardApp()
    app.mainloop()
