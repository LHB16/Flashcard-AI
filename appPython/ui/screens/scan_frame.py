"""
ui/screens/scan_frame.py - ScanFrame: select folder and create new deck.
"""
from tkinter import filedialog, messagebox
import customtkinter as ctk

from ui.theme import (
    ACCENT, ACCENT_HOVER, SUCCESS, DANGER, CARD_BG, SURFACE, SURFACE2, TEXT, TEXT_DIM,
    get_image_files
)


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
            short = __import__('os').path.basename(folder)
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
        from ui.dialogs.scan_assign_dialog import ScanAssignDialog
        ScanAssignDialog(self, self.app, self.image_files, deck_name)

    def reset(self):
        """Call when returning to this frame."""
        self.folder_path = ""
        self.image_files = []
        self.folder_lbl.configure(text="No folder selected", text_color=TEXT_DIM)
        self.file_count_lbl.configure(text="")
        self.deck_name_entry.delete(0, "end")
