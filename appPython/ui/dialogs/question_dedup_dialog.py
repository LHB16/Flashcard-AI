"""
ui/dialogs/question_dedup_dialog.py - QuestionDedupDialog: review and remove duplicate flashcards.
"""
import customtkinter as ctk

from ui.theme import (
    ACCENT, ACCENT_HOVER, SUCCESS, DANGER, CARD_BG, SURFACE, SURFACE2, TEXT, TEXT_DIM,
    center_window
)
from models.flashcard import Deck


class QuestionDedupDialog(ctk.CTkToplevel):
    PAGE_SIZE = 20  # pairs per page

    def __init__(self, parent, deck, duplicates, on_apply):
        super().__init__(parent)
        self.deck = deck
        self.duplicates = duplicates  # [(idx_a, idx_b, ratio), ...]
        self.on_apply = on_apply
        self.title("🔍 Filter Duplicate Questions")
        self.geometry("820x680")
        self.resizable(True, True)
        self.grab_set()
        self.configure(fg_color=CARD_BG)
        center_window(self, 820, 680)

        # Separate into exact and similar
        self._exact = [(a, b, r) for a, b, r in duplicates if r >= 0.99]
        self._similar = [(a, b, r) for a, b, r in duplicates if r < 0.99]
        # Combined list for pagination: exact first, then similar
        self._all_pairs = self._exact + self._similar
        self._current_page = 0
        self._total_pages = max(1, (len(self._all_pairs) + self.PAGE_SIZE - 1) // self.PAGE_SIZE)

        # Pre-create all BooleanVars (lightweight) for every pair
        self._delete_vars = {}    # (pair_key, slot) -> BooleanVar
        self._exact_b_keys = []   # keys for exact-group 'b' cards only
        self._key_to_idx = {}     # (pair_key, slot) -> actual card index (int)

        for i, (idx_a, idx_b, ratio) in enumerate(self._all_pairs):
            is_exact = ratio >= 0.99
            pair_key = f"pair_{i}"
            for slot, idx, default_checked in [('a', idx_a, False), ('b', idx_b, is_exact)]:
                key = (pair_key, slot)
                self._delete_vars[key] = ctk.BooleanVar(value=default_checked)
                self._key_to_idx[key] = idx
                if slot == 'b' and is_exact:
                    self._exact_b_keys.append(key)

        # Header
        exact_n = len(self._exact)
        similar_n = len(self._similar)
        ctk.CTkLabel(self,
                     text=f"🔍 Found {exact_n} exact (100%)  ·  {similar_n} similar  ·  {len(self._all_pairs)} total",
                     font=ctk.CTkFont(size=17, weight="bold"), text_color=TEXT).pack(pady=(15, 3))
        ctk.CTkLabel(self,
                     text="Review potential duplicates. Mark ☑ to delete (auto-selected the later one).",
                     font=ctk.CTkFont(size=12), text_color=TEXT_DIM).pack(pady=(0, 8))

        # Scrollable pair list (rebuilt per page)
        self._scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self._scroll.pack(fill="both", expand=True, padx=15, pady=5)

        # Pagination bar
        self._page_frame = ctk.CTkFrame(self, fg_color="transparent")
        self._page_frame.pack(fill="x", padx=15, pady=(4, 0))

        self._prev_btn = ctk.CTkButton(self._page_frame, text="◀ Prev", width=80, height=30,
                      fg_color=SURFACE2, hover_color=SURFACE, text_color=TEXT,
                      command=self._prev_page)
        self._prev_btn.pack(side="left", padx=5)

        self._page_lbl = ctk.CTkLabel(self._page_frame, text="",
                     font=ctk.CTkFont(size=12, weight="bold"), text_color=TEXT_DIM)
        self._page_lbl.pack(side="left", expand=True)

        self._next_btn = ctk.CTkButton(self._page_frame, text="Next ▶", width=80, height=30,
                      fg_color=SURFACE2, hover_color=SURFACE, text_color=TEXT,
                      command=self._next_page)
        self._next_btn.pack(side="right", padx=5)

        # Bottom action buttons
        btns = ctk.CTkFrame(self, fg_color="transparent")
        btns.pack(pady=10)
        ctk.CTkButton(btns, text="Cancel", width=90, height=36,
                      fg_color=SURFACE, hover_color=SURFACE2, text_color=TEXT,
                      command=self.destroy).pack(side="left", padx=8)
        self._toggle_btn = ctk.CTkButton(btns, text="☒ Select All (100%)", width=170, height=36,
                      fg_color="#B91C1C", hover_color="#991B1B", text_color="white",
                      command=self._toggle_exact)
        self._toggle_btn.pack(side="left", padx=8)
        ctk.CTkButton(btns, text="🗑 Delete Selected Cards", width=180, height=36,
                      fg_color=DANGER, hover_color="#DC2626", text_color="white",
                      font=ctk.CTkFont(weight="bold"),
                      command=self._apply).pack(side="left", padx=8)

        # Build first page
        self._render_page()

    @staticmethod
    def _ans_text(c):
        opts = getattr(c, 'options', []) or []
        correct = getattr(c, 'correct_answers', []) or []
        if not correct:
            return "Answer: (none)"
        correct_set = {x.strip().upper() for x in correct}
        matched = [opt for opt in opts if opt.strip() and opt.strip()[0].upper() in correct_set]
        if matched:
            return "Answer: " + " | ".join(matched)
        return "Answer: " + ", ".join(correct)

    def _render_page(self):
        """Rebuild the scroll content for the current page only."""
        for w in self._scroll.winfo_children():
            w.destroy()

        start = self._current_page * self.PAGE_SIZE
        end = min(start + self.PAGE_SIZE, len(self._all_pairs))
        page_pairs = self._all_pairs[start:end]
        exact_boundary = len(self._exact)

        for i, (idx_a, idx_b, ratio) in enumerate(page_pairs):
            global_i = start + i
            pair_key = f"pair_{global_i}"
            pct = int(ratio * 100)

            pair_frame = ctk.CTkFrame(self._scroll, fg_color=SURFACE, corner_radius=8)
            pair_frame.pack(fill="x", pady=4)

            if global_i < exact_boundary:
                badge_text = f"✅ {pct}% exact"
                badge_color = DANGER
            else:
                badge_text = f"🔍 {pct}% similar"
                badge_color = "#6D28D9"

            ctk.CTkLabel(pair_frame, text=badge_text,
                         font=ctk.CTkFont(size=12, weight="bold"),
                         text_color=badge_color).pack(anchor="w", padx=12, pady=(7, 2))

            card_a = self.deck.cards[idx_a]
            card_b = self.deck.cards[idx_b]

            cols = ctk.CTkFrame(pair_frame, fg_color="transparent")
            cols.pack(fill="x", padx=8, pady=(0, 6))
            cols.columnconfigure(0, weight=1)
            cols.columnconfigure(1, weight=1)

            for col_i, (idx, card, slot) in enumerate(
                [(idx_a, card_a, 'a'), (idx_b, card_b, 'b')]
            ):
                key = (pair_key, slot)
                cell = ctk.CTkFrame(cols, fg_color="transparent")
                cell.grid(row=0, column=col_i, sticky="nsew", padx=4)

                hdr = ctk.CTkFrame(cell, fg_color="transparent")
                hdr.pack(fill="x")
                ctk.CTkCheckBox(hdr, text=f"#{idx+1} — Delete?",
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
                ctk.CTkLabel(cell, text=self._ans_text(card),
                             font=ctk.CTkFont(size=11), text_color=SUCCESS,
                             wraplength=320, anchor="w", justify="left").pack(anchor="w", padx=6)

            ctk.CTkFrame(pair_frame, height=1, fg_color=SURFACE2).pack(fill="x", padx=10, pady=(4, 5))

        # Update pagination UI
        self._page_lbl.configure(text=f"Page {self._current_page + 1} / {self._total_pages}")
        self._prev_btn.configure(state="normal" if self._current_page > 0 else "disabled")
        self._next_btn.configure(state="normal" if self._current_page < self._total_pages - 1 else "disabled")

    def _prev_page(self):
        if self._current_page > 0:
            self._current_page -= 1
            self._render_page()

    def _next_page(self):
        if self._current_page < self._total_pages - 1:
            self._current_page += 1
            self._render_page()

    def _toggle_exact(self):
        """Toggle: if all exact-pair 'b' cards are checked → uncheck all; otherwise → check all."""
        if not self._exact_b_keys:
            return
        all_checked = all(self._delete_vars[k].get() for k in self._exact_b_keys)
        new_state = not all_checked
        for k in self._exact_b_keys:
            self._delete_vars[k].set(new_state)
        self._toggle_btn.configure(
            text=("☒ Unselect All (100%)" if new_state else "☑ Select All (100%)")
        )
        self._render_page()

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
