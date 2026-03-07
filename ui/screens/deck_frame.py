"""
ui/screens/deck_frame.py - DeckFrame: view and manage flashcards in a deck.
"""
import threading
from tkinter import messagebox
import customtkinter as ctk

from ui.theme import (
    ACCENT, ACCENT_HOVER, SUCCESS, WARNING, DANGER, CARD_BG, SURFACE, SURFACE2, TEXT, TEXT_DIM
)
from models.flashcard import Deck, Flashcard, QuestionType
from services.storage_service import save_decks
from services.dedup_service import find_duplicate_questions


class DeckFrame(ctk.CTkFrame):
    CARDS_PER_PAGE = 50

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
        self._dedup_btn = ctk.CTkButton(btn_row, text="🔍 Deduplicate", width=120, height=32,
                      fg_color="#7C3AED", hover_color="#6D28D9", text_color="white",
                      command=self._dedup_questions)
        self._dedup_btn.pack(side="left", padx=3)

        # Stats bar + Progress
        self.stats_bar = ctk.CTkFrame(self, fg_color=SURFACE2, height=36, corner_radius=0)
        self.stats_bar.pack(fill="x")
        self.stats_bar.pack_propagate(False)

        # Progress visualizer
        self.progress_frame = ctk.CTkFrame(self.stats_bar, fg_color="transparent")
        self.progress_frame.pack(side="right", padx=15, fill="y", pady=4)

        self.stats_lbl = ctk.CTkLabel(self.stats_bar, text="",
                                      font=ctk.CTkFont(size=12), text_color=TEXT_DIM)
        self.stats_lbl.pack(side="left", padx=15)

        # Cards list
        self.scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.scroll.pack(fill="both", expand=True, padx=15, pady=10)

    def load_deck(self, deck: Deck):
        self.deck = deck
        self._loaded_count = 0
        self.title_lbl.configure(text=f"📚  {deck.name}")
        self._update_stats_and_progress()
        self._refresh_cards()

    def _update_stats_and_progress(self):
        # Update text stats
        mc = sum(1 for c in self.deck.cards if c.question_type == QuestionType.MULTIPLE_CHOICE)
        self.stats_lbl.configure(
            text=f"{self.deck.card_count} cards  ·  {mc} multi-answer  ·  {self.deck.card_count - mc} single"
        )

        # Clear old progress UI
        for w in self.progress_frame.winfo_children():
            w.destroy()

        if self.deck.card_count == 0:
            return

        # Calculate progress stats
        green = sum(1 for c in self.deck.cards if c.status == 2)
        orange = sum(1 for c in self.deck.cards if c.status == 1)
        gray = sum(1 for c in self.deck.cards if c.status == 0)

        # Reset button
        if green > 0 or orange > 0:
            ctk.CTkButton(self.progress_frame, text="🔄 Reset", width=60, height=24,
                          fg_color="transparent", hover_color=SURFACE, text_color=TEXT_DIM,
                          font=ctk.CTkFont(size=11), command=self._reset_progress).pack(side="left", padx=(0, 10))

        # Progress bar blocks
        bar_w = 150
        bar = ctk.CTkFrame(self.progress_frame, width=bar_w, height=12, corner_radius=6, fg_color="#E2E8F0")
        bar.pack(side="left", pady=8)
        bar.pack_propagate(False)

        w_g = int((green / self.deck.card_count) * bar_w)
        w_o = int((orange / self.deck.card_count) * bar_w)

        if w_g > 0:
            ctk.CTkFrame(bar, width=w_g, fg_color=SUCCESS, corner_radius=6).pack(side="left", fill="y")
        if w_o > 0:
            # no rounded left corner if green exists
            cr = 0 if w_g > 0 else 6
            ctk.CTkFrame(bar, width=w_o, fg_color=WARNING, corner_radius=cr).pack(side="left", fill="y")

        # Progress labels separated to prevent emoji overlapping
        stats_frame = ctk.CTkFrame(self.progress_frame, fg_color="transparent")
        stats_frame.pack(side="left", padx=(10, 0))

        ctk.CTkLabel(stats_frame, text="✅", font=ctk.CTkFont(size=11)).pack(side="left", padx=(0, 3))
        ctk.CTkLabel(stats_frame, text=str(green), font=ctk.CTkFont(size=11, weight="bold"), text_color=TEXT_DIM).pack(side="left", padx=(0, 10))

        ctk.CTkLabel(stats_frame, text="❌", font=ctk.CTkFont(size=11)).pack(side="left", padx=(0, 3))
        ctk.CTkLabel(stats_frame, text=str(orange), font=ctk.CTkFont(size=11, weight="bold"), text_color=TEXT_DIM).pack(side="left", padx=(0, 10))

        ctk.CTkLabel(stats_frame, text="⚪", font=ctk.CTkFont(size=11)).pack(side="left", padx=(0, 3))
        ctk.CTkLabel(stats_frame, text=str(gray), font=ctk.CTkFont(size=11, weight="bold"), text_color=TEXT_DIM).pack(side="left")

    def _reset_progress(self):
        if messagebox.askyesno("Confirm", "Are you sure you want to reset progress for this deck? (All cards will be marked as Unseen)"):
            for c in self.deck.cards:
                c.status = 0
            save_decks(self.app.decks)
            self._update_stats_and_progress()
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

        # Status indicator color logic
        status_color = "#9CA3AF"  # Gray (0)
        if card.status == 1:
            status_color = WARNING  # Orange (1)
        elif card.status == 2:
            status_color = SUCCESS  # Green (2)

        badge.configure(fg_color=status_color)

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
        from ui.dialogs.export_dialog import ExportDialog
        ExportDialog(self, self.app, self.deck)

    def _dedup_questions(self):
        if not self.deck or not self.deck.cards:
            return
        # Prevent spam: disable button and show loading state immediately
        if hasattr(self, '_dedup_btn') and self._dedup_btn.winfo_exists():
            self._dedup_btn.configure(text="⏳ Deduplicating...", state="disabled", fg_color="#9CA3AF")

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
            self._dedup_btn.configure(text="🔍 Deduplicate", state="normal", fg_color="#7C3AED")
        if not dupes:
            messagebox.showinfo("Result",
                                f"No duplicate cards found "
                                f"(out of {len(self.deck.cards)} cards)! 🎉")
            return
        from ui.dialogs.question_dedup_dialog import QuestionDedupDialog
        QuestionDedupDialog(self, self.deck, dupes, self._apply_question_dedup)

    def _apply_question_dedup(self, removed_count):
        save_decks(self.app.decks)
        self.load_deck(self.deck)  # refresh stats + card list
        if removed_count > 0:
            messagebox.showinfo("✅ Completed", f"Removed {removed_count} duplicate cards.")
