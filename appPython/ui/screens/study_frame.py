"""
ui/screens/study_frame.py - StudyFrame: flashcard study/flip mode.
"""
import customtkinter as ctk

from ui.theme import (
    ACCENT, ACCENT_HOVER, SUCCESS, WARNING, DANGER, CARD_BG, SURFACE, SURFACE2, TEXT, TEXT_DIM
)
from models.flashcard import Deck, QuestionType
from services.storage_service import save_decks


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
        self.history = []
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
        self.card_frame = ctk.CTkFrame(self, fg_color=SURFACE, corner_radius=18)
        self.card_frame.pack(fill="both", expand=True, padx=40, pady=25)

        # Know / Don't know buttons (created once, reused every session)
        btn_row = ctk.CTkFrame(self, fg_color="transparent")
        btn_row.pack(pady=(0, 20))

        self.undo_btn = ctk.CTkButton(
            btn_row, text="↺  Undo", width=120, height=50,
            fg_color=WARNING, hover_color="#B45309",
            text_color="white",
            font=ctk.CTkFont(size=15, weight="bold"),
            state="disabled", command=self._undo
        )
        self.undo_btn.pack(side="left", padx=10)

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

    def _build_card_ui(self):
        for w in self.card_frame.winfo_children():
            w.destroy()

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

    def load_deck(self, deck: Deck, resume: bool = False):
        self.deck = deck
        # Resume interrupted session if requested
        if resume and hasattr(self, '_saved_session') and self._saved_session.get('deck_id') == deck.deck_id:
            saved = self._saved_session
            self.cards = saved['cards']
            self.index = saved['index']
            self.known = saved['known']
            self.unknown = saved['unknown']
            self.history = saved['history']
            self.showing_answer = False
            self._saved_session = {}
        else:
            self.cards = list(deck.cards)
            self.showing_answer = False
            self.history = []
            if hasattr(self, '_saved_session'):
                self._saved_session = {}

            # If start fresh, check if deck is already 100% completed
            self.known = sum(1 for c in self.cards if c.status == 2)
            self.unknown = sum(1 for c in self.cards if c.status == 1)
            self.index = self.known + self.unknown
        self.title_lbl.configure(text=f"📖  {deck.name}")
        self._build_card_ui()
        self._bind_keys()
        self._show_card()

    def _show_card(self):
        if self.index >= len(self.cards):
            self._show_results()
            return

        self.showing_answer = False
        self.undo_btn.configure(state="normal" if self.history else "disabled")
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
        card = self.cards[self.index]
        self.history.append({'index': self.index, 'was_known': True, 'old_status': card.status})
        card.status = 2  # Green (Mastered)
        save_decks(self.app.decks)

        self.index += 1
        self._show_card()

    def _dont_know(self):
        self.unknown += 1
        card = self.cards[self.index]
        self.history.append({'index': self.index, 'was_known': False, 'old_status': card.status})
        card.status = 1  # Orange (Learning)
        save_decks(self.app.decks)

        self.index += 1
        self._show_card()

    def _undo(self):
        if not self.history:
            return
        last = self.history.pop()

        if last['was_known']:
            self.known -= 1
        else:
            self.unknown -= 1

        card = self.cards[last['index']]
        card.status = last['old_status']
        save_decks(self.app.decks)

        self.index = last['index']
        self._show_card()

    def _reset_progress_and_study(self):
        for card in self.cards:
            card.status = 0
        save_decks(self.app.decks)
        # Clear any saved session when restarting
        self._saved_session = {}
        # Auto-refresh home screen since we just wiped progress
        try:
            self.app.home_frame.refresh()
            self.app.home_frame.update_idletasks()
        except Exception:
            pass
        self.load_deck(self.deck)

    def _show_results(self):
        self._unbind_keys()
        # Auto-refresh Home Screen progress bars
        try:
            self.app.home_frame.refresh()
        except Exception:
            pass
        # Clear any saved mid-session state since session is now complete
        self._saved_session = {}
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

        ctk.CTkButton(self.card_frame, text="🔄  Study Again (Reset Progress)", width=240, height=44,
                      fg_color=ACCENT, hover_color=ACCENT_HOVER,
                      font=ctk.CTkFont(size=14, weight="bold"),
                      command=self._reset_progress_and_study).pack(pady=20)

        self.undo_btn.configure(state="disabled")
        self.know_btn.configure(state="disabled")
        self.dont_know_btn.configure(state="disabled")

    def _go_back(self):
        self._unbind_keys()
        # Save current mid-session state so user can resume later
        if self.deck and self.index < len(self.cards):
            self._saved_session = {
                'deck_id': self.deck.deck_id,
                'cards': self.cards,
                'index': self.index,
                'known': self.known,
                'unknown': self.unknown,
                'history': self.history,
            }
        else:
            self._saved_session = {}
        self.app.show_frame("home")

    def _bind_keys(self):
        top = self.winfo_toplevel()
        top.bind("<Left>", self._on_left)
        top.bind("<Right>", self._on_right)
        top.bind("<Up>", self._on_up_down)
        top.bind("<Down>", self._on_up_down)
        top.bind("<space>", self._on_up_down)

    def _unbind_keys(self):
        top = self.winfo_toplevel()
        top.unbind("<Left>")
        top.unbind("<Right>")
        top.unbind("<Up>")
        top.unbind("<Down>")
        top.unbind("<space>")

    def _on_left(self, event):
        if self.dont_know_btn.cget("state") == "normal":
            self._dont_know()

    def _on_right(self, event):
        if self.know_btn.cget("state") == "normal":
            self._know()

    def _on_up_down(self, event):
        if self.flip_btn.cget("state") == "normal":
            self._flip()
