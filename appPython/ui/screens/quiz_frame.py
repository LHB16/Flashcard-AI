"""
ui/screens/quiz_frame.py - QuizFrame: quiz/test mode with multiple choice questions.
"""
import customtkinter as ctk

from ui.theme import (
    ACCENT, ACCENT_HOVER, SUCCESS, WARNING, DANGER, CARD_BG, SURFACE, SURFACE2, TEXT, TEXT_DIM
)
from models.flashcard import Deck, Flashcard, QuestionType, QuizSession
from services.storage_service import save_decks, save_quiz_session, delete_quiz_session


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
        ctk.CTkButton(hdr_right, text="Exit & Save", width=110, height=32,
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
        ctk.CTkLabel(q_zoom, text="Question:",
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
        ctk.CTkLabel(ans_zoom_row, text="Answers:",
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

        self.confirm_btn = ctk.CTkButton(self.footer, text="✔  Confirm", width=160, height=42,
                                          fg_color=ACCENT, hover_color=ACCENT_HOVER, text_color="white",
                                          font=ctk.CTkFont(size=14, weight="bold"),
                                          command=self._confirm)
        self.confirm_btn.pack(side="left", padx=(20, 8), pady=11)

        self.next_btn = ctk.CTkButton(self.footer, text="Next →", width=150, height=42,
                                       fg_color=SUCCESS, hover_color="#059669", text_color="white",
                                       font=ctk.CTkFont(size=14, weight="bold"),
                                       state="disabled",
                                       command=self._next_question)
        self.next_btn.pack(side="left", padx=4, pady=11)

        self.restart_btn = ctk.CTkButton(self.footer, text="🔄 Restart", width=130, height=42,
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
        self.prog_lbl.configure(text=f"Question {cur} / {n}")
        self.prog_bar.set(self.session.progress_frac)

        card = self._current_card()
        is_multi = (card.question_type == QuestionType.MULTIPLE_CHOICE)

        if is_multi:
            self.type_badge.configure(text="🔵 Multiple Choice", text_color=WARNING)
        else:
            self.type_badge.configure(text="🟢 Single Choice", text_color=SUCCESS)

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
            self.feedback_lbl.configure(text="⚠ You haven't selected an answer!", text_color=WARNING)
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

        # Score and Status
        if chosen == correct:
            self.session.correct_count += 1
            card.status = 2  # Green (Mastered/Correct)
            self.feedback_lbl.configure(text="✅ Correct!", text_color=SUCCESS)
            self.correct_lbl.configure(text="")
        else:
            self.session.wrong_count += 1
            card.status = 1  # Orange (Learning/Wrong)
            self.feedback_lbl.configure(text="❌ Wrong!", text_color=DANGER)
            correct_text = card.get_correct_answer_text()
            self.correct_lbl.configure(text=f"Correct answer: {correct_text}")

        # Save deck progress
        save_decks(self.app.decks)

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
        self.prog_lbl.configure(text=f"Completed {n}/{n}")

        # Results panel
        panel = ctk.CTkFrame(self.options_frame, fg_color=SURFACE, corner_radius=12)
        panel.pack(fill="x", pady=20)

        if pct >= 70:
            emoji, color = "🎉", SUCCESS
        elif pct >= 50:
            emoji, color = "😐", WARNING
        else:
            emoji, color = "😓", DANGER

        ctk.CTkLabel(panel, text=f"{emoji}  Quiz Results",
                     font=ctk.CTkFont(size=22, weight="bold"), text_color=TEXT).pack(pady=(20, 5))
        ctk.CTkLabel(panel, text=f"{pct}%",
                     font=ctk.CTkFont(size=48, weight="bold"), text_color=color).pack(pady=5)
        ctk.CTkLabel(panel,
                     text=f"✅ Correct: {self.session.correct_count}   ❌ Wrong: {self.session.wrong_count}   📋 Total: {n}",
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
