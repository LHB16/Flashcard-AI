/**
 * dedupService.js — Port of appPython/services/dedup_service.py
 * N-gram shingling + Jaccard pre-filter → SequenceMatcher-style comparison
 * Optimized for large decks (500+ cards)
 */

/**
 * Normalize text: lowercase, collapse whitespace
 */
function normalize(text) {
  if (!text) return '';
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Extract correct answer text for comparison
 */
function getAnswersText(card) {
  const options = card.options || [];
  const correct = card.correct_answers || [];

  if (!correct.length) return normalize(options.join(' '));

  const correctSet = new Set(correct.map(c => c.trim().toUpperCase()));
  const matched = options.filter(opt => {
    const first = opt.trim()[0]?.toUpperCase() || '';
    return correctSet.has(first);
  });

  return matched.length > 0
    ? normalize(matched.join(' | '))
    : normalize(correct.join(' '));
}

/**
 * Generate n-gram shingles from a string
 */
function getShingles(text, n = 3) {
  const shingles = new Set();
  for (let i = 0; i <= text.length - n; i++) {
    shingles.add(text.substring(i, i + n));
  }
  return shingles;
}

/**
 * Compute similarity ratio between two strings (similar to Python's SequenceMatcher)
 * Uses longest common subsequence approach
 */
function similarityRatio(a, b) {
  if (a === b) return 1.0;
  if (!a.length || !b.length) return 0;

  const lenA = a.length;
  const lenB = b.length;

  // Optimization: if length difference is too big, skip
  if (Math.min(lenA, lenB) / Math.max(lenA, lenB) < 0.5) return 0;

  // LCS-based ratio (matches SequenceMatcher behavior)
  const prev = new Uint16Array(lenB + 1);
  const curr = new Uint16Array(lenB + 1);

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    prev.set(curr);
    curr.fill(0);
  }

  const lcs = prev[lenB];
  return (2 * lcs) / (lenA + lenB);
}

/**
 * Find duplicate question pairs in a card array.
 * Uses n-gram shingling + Jaccard pre-filter for speed.
 *
 * @param {Array} cards - Array of card objects with {question, options, correct_answers}
 * @param {number} threshold - Similarity threshold (0-1, default 0.85)
 * @returns {Array<{indexA: number, indexB: number, ratio: number}>}
 */
export function findDuplicateQuestions(cards, threshold = 0.85) {
  const n = cards.length;
  if (n < 2) return [];

  // Step 1: Normalize
  const questions = cards.map(c => normalize(c.question));
  const answers = cards.map(c => getAnswersText(c));

  // Step 2: Build shingles
  const SHINGLE_SIZE = 3;
  const shingles = questions.map(q => getShingles(q, SHINGLE_SIZE));

  // Step 3: Inverted index
  const shingleToCards = new Map();
  shingles.forEach((sSet, idx) => {
    sSet.forEach(sh => {
      if (!shingleToCards.has(sh)) shingleToCards.set(sh, []);
      shingleToCards.get(sh).push(idx);
    });
  });

  // Step 4: Jaccard pre-filter
  const jaccardThreshold = Math.max(threshold - 0.15, 0.5);
  const candidates = new Set();

  for (let i = 0; i < n; i++) {
    if (!shingles[i].size) continue;
    const neighborCounts = new Map();

    shingles[i].forEach(sh => {
      const cardList = shingleToCards.get(sh);
      if (cardList) {
        cardList.forEach(j => {
          if (j > i) neighborCounts.set(j, (neighborCounts.get(j) || 0) + 1);
        });
      }
    });

    const lenI = shingles[i].size;
    neighborCounts.forEach((shared, j) => {
      const lenJ = shingles[j].size;
      const jaccard = shared / (lenI + lenJ - shared);
      if (jaccard >= jaccardThreshold) {
        candidates.add(`${i}:${j}`);
      }
    });
  }

  // Step 5: Full comparison on candidates
  const duplicates = [];
  candidates.forEach(pair => {
    const [i, j] = pair.split(':').map(Number);
    const qRatio = similarityRatio(questions[i], questions[j]);

    if (qRatio >= threshold) {
      const ansRatio = similarityRatio(answers[i], answers[j]);
      const combined = qRatio * 0.6 + ansRatio * 0.4;

      if (combined >= threshold) {
        duplicates.push({
          indexA: i,
          indexB: j,
          ratio: Math.round(combined * 1000) / 1000,
        });
      }
    }
  });

  // Sort by card order
  duplicates.sort((a, b) => a.indexA - b.indexA || a.indexB - b.indexB);
  return duplicates;
}
