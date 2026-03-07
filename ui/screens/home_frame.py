"""
ui/screens/home_frame.py - HomeFrame: deck list home screen.
"""
from tkinter import messagebox
import customtkinter as ctk

from ui.theme import (
    ACCENT, ACCENT_HOVER, SUCCESS, WARNING, DANGER, CARD_BG, SURFACE, SURFACE2, TEXT, TEXT_DIM
)
from models.flashcard import Deck, QuestionType
from services.storage_service import save_decks


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
        self.search_row = ctk.CTkFrame(self, fg_color="transparent")
        self.search_row.pack(fill="x", padx=20, pady=(10, 10))
        self.search_var = ctk.StringVar()
        self.search_var.trace("w", lambda *a: self.refresh())
        ctk.CTkEntry(self.search_row, textvariable=self.search_var,
                     placeholder_text="🔍  Search decks...",
                     height=36, font=ctk.CTkFont(size=13)).pack(fill="x")

        # Deck list
        self.scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.scroll.pack(fill="both", expand=True, padx=20, pady=(0, 15))
        self.refresh()

    def refresh(self):
        self._rebuild_scans()
        self._rebuild_decks()
        # Force Tkinter to process layout updates immediately
        try:
            self.scroll.update_idletasks()
        except Exception:
            pass

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
            self.scans_frame.pack_forget()
            return

        # Re-pack scan frame if it was hidden
        self.scans_frame.pack(fill="x", padx=20, pady=(15, 0),
                              before=self.search_row)

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
        card = ctk.CTkFrame(self.scroll, fg_color=SURFACE, corner_radius=12, height=110)
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

        # Home screen progress indicator
        if deck.card_count > 0:
            green = sum(1 for c in deck.cards if c.status == 2)
            orange = sum(1 for c in deck.cards if c.status == 1)
            gray = sum(1 for c in deck.cards if c.status == 0)

            prog_row = ctk.CTkFrame(info, fg_color="transparent")
            prog_row.pack(fill="x", pady=(6, 0))
            ctk.CTkLabel(prog_row, text="Flashcard Progress:", font=ctk.CTkFont(size=11, weight="bold"), text_color=TEXT_DIM).pack(side="left", padx=(0, 6))

            bar_w = 120
            bar = ctk.CTkFrame(prog_row, width=bar_w, height=10, corner_radius=5, fg_color="#E2E8F0")
            bar.pack(side="left", pady=2)
            bar.pack_propagate(False)

            w_g = int((green / deck.card_count) * bar_w)
            w_o = int((orange / deck.card_count) * bar_w)

            if w_g > 0:
                ctk.CTkFrame(bar, width=w_g, fg_color=SUCCESS, corner_radius=5).pack(side="left", fill="y")
            if w_o > 0:
                cr = 0 if w_g > 0 else 5
                ctk.CTkFrame(bar, width=w_o, fg_color=WARNING, corner_radius=cr).pack(side="left", fill="y")

            stats_frame = ctk.CTkFrame(prog_row, fg_color="transparent")
            stats_frame.pack(side="left", padx=(10, 0))

            ctk.CTkLabel(stats_frame, text="✅", font=ctk.CTkFont(size=10)).pack(side="left", padx=(0, 2))
            ctk.CTkLabel(stats_frame, text=str(green), font=ctk.CTkFont(size=10), text_color=TEXT_DIM).pack(side="left", padx=(0, 8))

            ctk.CTkLabel(stats_frame, text="❌", font=ctk.CTkFont(size=10)).pack(side="left", padx=(0, 2))
            ctk.CTkLabel(stats_frame, text=str(orange), font=ctk.CTkFont(size=10), text_color=TEXT_DIM).pack(side="left", padx=(0, 8))

            ctk.CTkLabel(stats_frame, text="⚪", font=ctk.CTkFont(size=10)).pack(side="left", padx=(0, 2))
            ctk.CTkLabel(stats_frame, text=str(gray), font=ctk.CTkFont(size=10), text_color=TEXT_DIM).pack(side="left")

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
