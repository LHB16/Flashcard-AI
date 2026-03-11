"""
app.py - Main application entry point.
Flashcard App with Gemini AI - Windows Desktop

All UI screens and dialogs have been refactored into the ui/ package:
  ui/theme.py            - Color constants and helpers
  ui/background_scan.py  - BackgroundScan worker
  ui/dialogs/            - APIKeyDialog, ExportDialog, QuestionDedupDialog, ScanAssignDialog
  ui/screens/            - ScanFrame, HomeFrame, DeckFrame, StudyFrame, QuizFrame
"""
import os
import sys
from tkinter import messagebox
import customtkinter as ctk

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from models.flashcard import Deck, QuizSession
from services.gemini_service import GeminiService
from services.storage_service import (
    load_decks, save_decks, load_settings, save_settings,
    load_quiz_sessions, save_quiz_session, delete_quiz_session,
)
from ui.theme import CARD_BG
from ui.screens.scan_frame import ScanFrame
from ui.screens.home_frame import HomeFrame
from ui.screens.deck_frame import DeckFrame
from ui.screens.study_frame import StudyFrame
from ui.screens.quiz_frame import QuizFrame
from ui.dialogs.api_key_dialog import APIKeyDialog


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
            self.home_frame.update_idletasks()

    def show_deck(self, deck: Deck):
        self.deck_frame.load_deck(deck)
        self.show_frame("deck")

    def show_study(self, deck: Deck):
        if not deck.cards:
            messagebox.showinfo("Empty Deck", "This deck has no cards to study.")
            return
        # Auto-resume if there's a saved session for the same deck
        saved = getattr(self.study_frame, '_saved_session', {})
        if saved.get('deck_id') == deck.deck_id and saved.get('index', 0) < len(saved.get('cards', [])):
            self.study_frame.load_deck(deck, resume=True)
        else:
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
                "Resume Quiz?",
                f"You have an unfinished quiz for '{deck.name}'\n"
                f"Progress: {answered}/{n} questions\n\n"
                f"Select 'Yes' to continue, 'No' to start over."
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
