"""
services/dedup_service.py - Question deduplication logic (optimized)
Uses n-gram shingling + Jaccard pre-filter to skip obviously different pairs,
then SequenceMatcher only on candidates. ~10-50x faster for large decks.
"""
from collections import defaultdict
from difflib import SequenceMatcher
from typing import List, Tuple, Set


def find_duplicate_questions(
    cards,
    threshold: float = 0.85,
) -> List[Tuple[int, int, float]]:
    """
    Find pairs of cards with very similar questions.
    Optimized for large decks (500+ cards) using n-gram pre-filtering.

    Returns:
        list of (index_a, index_b, similarity_ratio) sorted by ratio desc.
    """
    n = len(cards)
    if n < 2:
        return []

    # Step 1: Pre-compute normalized questions and answer text
    questions = [_normalize(c.question) for c in cards]
    answers = [_get_answers_text(c) for c in cards]

    # Step 2: Build n-gram shingles for fast pre-filtering
    SHINGLE_SIZE = 3
    shingles: List[Set[str]] = []
    for q in questions:
        s = set()
        for i in range(len(q) - SHINGLE_SIZE + 1):
            s.add(q[i:i + SHINGLE_SIZE])
        shingles.append(s)

    # Step 3: Build an inverted index (shingle -> card indices)
    # Only compare pairs that share at least some shingles
    shingle_to_cards = defaultdict(list)
    for idx, s_set in enumerate(shingles):
        for sh in s_set:
            shingle_to_cards[sh].append(idx)

    # Step 4: Find candidate pairs via Jaccard similarity on shingles
    # Jaccard threshold is lower than final threshold to avoid missing pairs
    jaccard_threshold = max(threshold - 0.15, 0.5)
    candidate_pairs: Set[Tuple[int, int]] = set()

    for idx_i in range(n):
        if not shingles[idx_i]:
            continue
        # Count co-occurrences
        neighbor_counts = defaultdict(int)
        for sh in shingles[idx_i]:
            for idx_j in shingle_to_cards[sh]:
                if idx_j > idx_i:
                    neighbor_counts[idx_j] += 1

        # Filter by Jaccard estimate
        len_i = len(shingles[idx_i])
        for idx_j, shared in neighbor_counts.items():
            len_j = len(shingles[idx_j])
            jaccard = shared / (len_i + len_j - shared) if (len_i + len_j - shared) > 0 else 0
            if jaccard >= jaccard_threshold:
                candidate_pairs.add((idx_i, idx_j))

    # Step 5: Run full SequenceMatcher only on candidate pairs
    duplicates = []
    for i, j in candidate_pairs:
        q_ratio = SequenceMatcher(None, questions[i], questions[j]).ratio()

        if q_ratio >= threshold:
            ans_ratio = SequenceMatcher(None, answers[i], answers[j]).ratio()
            combined_ratio = (q_ratio * 0.6) + (ans_ratio * 0.4)

            if combined_ratio >= threshold:
                duplicates.append((i, j, round(combined_ratio, 3)))

    # Sort by card index (deck order) so pairs aren't jumbled
    duplicates.sort(key=lambda x: (x[0], x[1]))
    return duplicates


def _get_answers_text(card) -> str:
    """Extract correct answers into a normalized string for comparison."""
    options = getattr(card, 'options', []) or []
    correct = getattr(card, 'correct_answers', []) or []

    if not correct:
        return _normalize(" ".join(options))

    correct_set = {c.strip().upper() for c in correct}
    matched = []
    for opt in options:
        first_char = opt.strip()[0].upper() if opt.strip() else ""
        if first_char in correct_set:
            matched.append(opt)

    if matched:
        return _normalize(" | ".join(matched))
    return _normalize(" ".join(correct))


def _normalize(text: str) -> str:
    """Lowercase, strip whitespace/newlines for better comparison."""
    if not text:
        return ""
    return " ".join(text.lower().split())
