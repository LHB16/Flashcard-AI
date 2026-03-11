"""
ui/dialogs/api_key_dialog.py - APIKeyDialog: manages Gemini API keys.
"""
import threading
import customtkinter as ctk

from ui.theme import (
    ACCENT, ACCENT_HOVER, SUCCESS, WARNING, DANGER,
    CARD_BG, SURFACE, SURFACE2, TEXT, TEXT_DIM,
    center_window
)
from services.gemini_service import GeminiService


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
