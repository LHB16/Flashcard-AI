"""
ui/dialogs/scan_assign_dialog.py - ScanAssignDialog: select API keys and start scan.
"""
from tkinter import messagebox
import customtkinter as ctk

from ui.theme import (
    ACCENT, ACCENT_HOVER, SUCCESS, WARNING, CARD_BG, SURFACE, SURFACE2, TEXT, TEXT_DIM,
    center_window, win_toast
)


class ScanAssignDialog(ctk.CTkToplevel):
    def __init__(self, parent, app, image_files, deck_name, video_file=None):
        super().__init__(parent)
        self.app = app
        self.image_files = image_files
        self.deck_name = deck_name
        self.video_file = video_file
        self.selected_keys = []
        self.title("Assign API Keys for Scan")
        self.geometry("500x480")
        self.resizable(False, False)
        self.grab_set()
        self.configure(fg_color=CARD_BG)
        center_window(self, 500, 480)
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

        # Parallel mode toggle
        parallel_frame = ctk.CTkFrame(self, fg_color="transparent")
        parallel_frame.pack(fill="x", padx=20, pady=(5, 0))
        self._parallel_var = ctk.BooleanVar(value=False)
        ctk.CTkSwitch(
            parallel_frame, text="⚡ Parallel (1 thread/key)",
            variable=self._parallel_var,
            onvalue=True, offvalue=False,
            font=ctk.CTkFont(size=13, weight="bold"),
            text_color=TEXT,
            fg_color=SURFACE2, progress_color=ACCENT,
        ).pack(side="left", padx=5)
        ctk.CTkLabel(
            parallel_frame, text="~Nx Faster",
            font=ctk.CTkFont(size=11), text_color=TEXT_DIM
        ).pack(side="left", padx=(8, 0))

        btns = ctk.CTkFrame(self, fg_color="transparent")
        btns.pack(pady=15)
        ctk.CTkButton(btns, text="Cancel", width=100, height=36,
                      fg_color=SURFACE, hover_color=SURFACE2, text_color=TEXT,
                      command=self.destroy).pack(side="left", padx=10)
        ctk.CTkButton(btns, text="▶ Start Scan", width=120, height=36,
                      fg_color=SUCCESS, hover_color="#059669", text_color="white",
                      font=ctk.CTkFont(weight="bold"),
                      command=self._on_start).pack(side="left", padx=10)

    def _on_start(self):
        from ui.background_scan import BackgroundScan
        selected = [k for k, v in self._check_vars.items() if v.get()]
        if not selected:
            messagebox.showerror("Error", "You must select at least one API key to start the scan.")
            return

        parallel = self._parallel_var.get()
        # Start background scan
        scan = BackgroundScan(self.app, self.image_files, self.deck_name, selected, parallel=parallel, video_file=self.video_file)
        self.app.active_scans.append(scan)
        scan.start()

        mode_str = "⚡ parallel" if parallel else "sequential"
        win_toast("Scan Started 🚀", f"Scanning '{self.deck_name}' ({mode_str}).")
        self.app.show_frame("home")
        self.app.frames["scan"].reset()
        self.destroy()
