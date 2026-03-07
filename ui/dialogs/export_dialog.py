"""
ui/dialogs/export_dialog.py - ExportDialog: export deck to Quizlet format.
"""
from tkinter import filedialog, messagebox
import customtkinter as ctk

from ui.theme import (
    ACCENT, ACCENT_HOVER, CARD_BG, TEXT, TEXT_DIM, SURFACE, WARNING
)
from services.export_service import export_to_quizlet, get_quizlet_preview
from models.flashcard import Deck


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
                text="⚠ Safe mode → Quizlet Import: Between Term & Definition = Custom → {[(DapAn)]}    Between Cards = Custom → {[(CauHoi)]}"
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
