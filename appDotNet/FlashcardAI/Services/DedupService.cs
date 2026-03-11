using System;
using System.Collections.Generic;
using System.Linq;
using FlashcardAI.Models;

namespace FlashcardAI.Services;

/// <summary>
/// Question deduplication using n-gram shingling + Jaccard pre-filter
/// then SequenceMatcher-like ratio on candidates. Port from Python.
/// </summary>
public static class DedupService
{
    public static List<(int idxA, int idxB, double ratio)> FindDuplicateQuestions(
        List<Flashcard> cards, double threshold = 0.85)
    {
        int n = cards.Count;
        if (n < 2) return new();

        // Step 1: Pre-compute normalized questions and answer text
        var questions = cards.Select(c => Normalize(c.Question)).ToList();
        var answers = cards.Select(GetAnswersText).ToList();

        // Step 2: Build n-gram shingles
        const int shingleSize = 3;
        var shingles = questions.Select(q =>
        {
            var s = new HashSet<string>();
            for (int i = 0; i <= q.Length - shingleSize; i++)
                s.Add(q.Substring(i, shingleSize));
            return s;
        }).ToList();

        // Step 3: Inverted index
        var shingleToCards = new Dictionary<string, List<int>>();
        for (int idx = 0; idx < n; idx++)
            foreach (var sh in shingles[idx])
            {
                if (!shingleToCards.ContainsKey(sh))
                    shingleToCards[sh] = new();
                shingleToCards[sh].Add(idx);
            }

        // Step 4: Candidate pairs via Jaccard
        double jaccardThreshold = Math.Max(threshold - 0.15, 0.5);
        var candidatePairs = new HashSet<(int, int)>();

        for (int idxI = 0; idxI < n; idxI++)
        {
            if (shingles[idxI].Count == 0) continue;
            var neighborCounts = new Dictionary<int, int>();
            foreach (var sh in shingles[idxI])
            {
                if (!shingleToCards.ContainsKey(sh)) continue;
                foreach (var idxJ in shingleToCards[sh])
                {
                    if (idxJ > idxI)
                    {
                        neighborCounts.TryGetValue(idxJ, out int cnt);
                        neighborCounts[idxJ] = cnt + 1;
                    }
                }
            }

            int lenI = shingles[idxI].Count;
            foreach (var (idxJ, shared) in neighborCounts)
            {
                int lenJ = shingles[idxJ].Count;
                double union = lenI + lenJ - shared;
                double jaccard = union > 0 ? shared / union : 0;
                if (jaccard >= jaccardThreshold)
                    candidatePairs.Add((idxI, idxJ));
            }
        }

        // Step 5: Full ratio on candidates
        var duplicates = new List<(int, int, double)>();
        foreach (var (i, j) in candidatePairs)
        {
            double qRatio = SimilarityRatio(questions[i], questions[j]);
            if (qRatio >= threshold)
            {
                double ansRatio = SimilarityRatio(answers[i], answers[j]);
                double combinedRatio = (qRatio * 0.6) + (ansRatio * 0.4);
                if (combinedRatio >= threshold)
                    duplicates.Add((i, j, Math.Round(combinedRatio, 3)));
            }
        }

        duplicates.Sort((a, b) => a.Item1 != b.Item1 ? a.Item1.CompareTo(b.Item1) : a.Item2.CompareTo(b.Item2));
        return duplicates;
    }

    private static string GetAnswersText(Flashcard card)
    {
        var options = card.Options ?? new();
        var correct = card.CorrectAnswers ?? new();

        if (correct.Count == 0)
            return Normalize(string.Join(" ", options));

        var correctSet = correct.Select(c => c.Trim().ToUpper()).ToHashSet();
        var matched = options.Where(opt =>
        {
            var trimmed = opt.Trim();
            return trimmed.Length > 0 && correctSet.Contains(trimmed[0].ToString().ToUpper());
        }).ToList();

        return matched.Count > 0
            ? Normalize(string.Join(" | ", matched))
            : Normalize(string.Join(" ", correct));
    }

    private static string Normalize(string text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        return string.Join(" ", text.ToLower().Split(default(char[]), StringSplitOptions.RemoveEmptyEntries));
    }

    /// <summary>SequenceMatcher-like similarity ratio (Longest Common Subsequence based).</summary>
    public static double SimilarityRatio(string a, string b)
    {
        if (string.IsNullOrEmpty(a) && string.IsNullOrEmpty(b)) return 1.0;
        if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b)) return 0.0;

        int matches = LcsLength(a, b);
        return (2.0 * matches) / (a.Length + b.Length);
    }

    private static int LcsLength(string a, string b)
    {
        int m = a.Length, n = b.Length;
        var prev = new int[n + 1];
        var curr = new int[n + 1];

        for (int i = 1; i <= m; i++)
        {
            for (int j = 1; j <= n; j++)
            {
                if (a[i - 1] == b[j - 1])
                    curr[j] = prev[j - 1] + 1;
                else
                    curr[j] = Math.Max(prev[j], curr[j - 1]);
            }
            (prev, curr) = (curr, prev);
            Array.Clear(curr, 0, curr.Length);
        }
        return prev[n];
    }
}
