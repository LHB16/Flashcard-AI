using System.Collections.Generic;
using System.IO;
using System.Linq;
using FlashcardAI.Models;

namespace FlashcardAI.Services;

/// <summary>
/// Export deck to Quizlet-compatible formats.
/// </summary>
public static class ExportService
{
    public static string ExportToQuizlet(Deck deck, string outputPath, string formatType = "full")
    {
        var lines = new List<string>();
        int skipped = 0;

        foreach (var card in deck.Cards)
        {
            if (string.IsNullOrWhiteSpace(card.Question)) { skipped++; continue; }
            try { lines.Add(card.ToQuizletRow(formatType)); }
            catch { skipped++; }
        }

        string content = formatType == "safe"
            ? string.Concat(lines)
            : string.Join("\n", lines);

        File.WriteAllText(outputPath, content, System.Text.Encoding.UTF8);
        return $"Exported {lines.Count} cards ({skipped} skipped) to:\n{outputPath}";
    }

    public static string GetQuizletPreview(Deck deck, string formatType = "full", int maxRows = 5)
    {
        var lines = deck.Cards.Take(maxRows)
            .Where(c => !string.IsNullOrWhiteSpace(c.Question))
            .Select(c => c.ToQuizletRow(formatType))
            .ToList();
        return string.Join("\n\n", lines);
    }
}
