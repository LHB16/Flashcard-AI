"""
services/dedup_service.py - Question deduplication logic
"""
from difflib import SequenceMatcher
from typing import List, Tuple


def find_duplicate_questions(
    cards,
    threshold: float = 0.85,
) -> List[Tuple[int, int, float]]:
    """
    Find pairs of cards with very similar questions.
    Also checks answers to prevent false positives where questions are similar
    but answers are completely different.

    Args:
        cards: list of Flashcard objects (question, options, correct_answers)
        threshold: minimum combined similarity ratio to flag as duplicate

    Returns:
        list of (index_a, index_b, similarity_ratio) sorted by ratio desc.
    """
    duplicates = []
    n = len(cards)

    for i in range(n):
        q_i = _normalize(cards[i].question)
        ans_i = _get_answers_text(cards[i])

        for j in range(i + 1, n):
            q_j = _normalize(cards[j].question)
            ans_j = _get_answers_text(cards[j])

            # Compare question similarity
            q_ratio = SequenceMatcher(None, q_i, q_j).ratio()

            # Only bother checking answers if questions are already quite similar
            if q_ratio >= threshold:
                ans_ratio = SequenceMatcher(None, ans_i, ans_j).ratio()

                # Weighted average: 60% question, 40% answers.
                # If answers are very different (ratio < 0.3), it's probably NOT a duplicate.
                combined_ratio = (q_ratio * 0.6) + (ans_ratio * 0.4)

                if combined_ratio >= threshold:
                    duplicates.append((i, j, round(combined_ratio, 3)))

    duplicates.sort(key=lambda x: x[2], reverse=True)
    return duplicates


def _get_answers_text(card) -> str:
    """Extract correct answers into a normalized string for comparison.
    
    Flashcard model:
        options: List[str]          e.g. ["A. 255", "B. 128", "C. 1024"]
        correct_answers: List[str]  e.g. ["A"] or ["A", "C"]
    """
    options = getattr(card, 'options', []) or []
    correct = getattr(card, 'correct_answers', []) or []

    if not correct:
        # Fallback: use all options text
        return _normalize(" ".join(options))

    # Map correct answer letters back to full text
    correct_set = {c.strip().upper() for c in correct}
    matched = []
    for opt in options:
        first_char = opt.strip()[0].upper() if opt.strip() else ""
        if first_char in correct_set:
            matched.append(opt)

    if matched:
        return _normalize(" | ".join(matched))

    # If can't map, just use the raw correct_answers letters
    return _normalize(" ".join(correct))


def _normalize(text: str) -> str:
    """Lowercase, strip whitespace/newlines for better comparison."""
    if not text:
        return ""
    return " ".join(text.lower().split())
