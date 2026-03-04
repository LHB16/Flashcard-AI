"""
services/export_service.py - Export deck to Quizlet-compatible format
"""
import os
from models.flashcard import Deck, Flashcard


def export_to_quizlet(
    deck: Deck,
    output_path: str,
    format_type: str = "full",
) -> str:
    """
    Export deck to a Quizlet-importable .txt file.

    format_type options:
    - 'simple'  : Question [TAB] Answer
    - 'full'    : Question >> A | B | C [TAB] Correct answer text
    - 'compact' : Question [A | B] [TAB] Letter(s)
    - 'safe'    : {[(CauHoi)]}Question >> A / B{[(DapAn)]}Answer
                  In Quizlet: Term/Def sep = {[(DapAn)]}, Card sep = {[(CauHoi)]}
    """
    lines = []
    skipped = 0

    for card in deck.cards:
        if not card.question:
            skipped += 1
            continue
        try:
            row = card.to_quizlet_row(format_type)
            lines.append(row)
        except Exception:
            skipped += 1

    if format_type == "safe":
        # For safe mode, cards are already prefixed with {[(CauHoi)]}
        # Join WITHOUT newline — card separator IS {[(CauHoi)]}
        content = "".join(lines)
    else:
        content = "\n".join(lines)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(content)

    return f"Exported {len(lines)} cards ({skipped} skipped) to:\n{output_path}"


def get_quizlet_preview(deck: Deck, format_type: str = "full", max_rows: int = 5) -> str:
    """Return a preview of the first few rows for display."""
    preview_lines = []
    for card in deck.cards[:max_rows]:
        if card.question:
            preview_lines.append(card.to_quizlet_row(format_type))
    # For display, always join with double newline for readability
    return "\n\n".join(preview_lines)
