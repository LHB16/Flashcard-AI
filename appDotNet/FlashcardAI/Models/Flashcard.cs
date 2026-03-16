using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace FlashcardAI.Models;

public enum QuestionType
{
    SingleChoice,
    MultipleChoice,
    Unknown
}

public class Flashcard
{
    public string CardId { get; set; } = Guid.NewGuid().ToString();
    public string Question { get; set; } = "";
    public List<string> Options { get; set; } = new();
    public List<string> CorrectAnswers { get; set; } = new();
    public QuestionType QuestionType { get; set; } = QuestionType.SingleChoice;
    public string? ImagePath { get; set; }
    public string Notes { get; set; } = "";
    public int Status { get; set; } = 0; // 0=Gray(Unseen), 1=Orange(Learning/Wrong), 2=Green(Mastered/Correct)

    // Safe format separators
    public const string SafeTermSep = "{[(DapAn)]}";
    public const string SafeCardSep = "{[(CauHoi)]}";

    public string GetCorrectAnswerText()
    {
        var result = new List<string>();
        foreach (var answer in CorrectAnswers)
        {
            var ansTrim = answer.Trim();
            if (ansTrim.Length == 1 && char.IsLetter(ansTrim[0]))
            {
                bool found = false;
                foreach (var opt in Options)
                {
                    if (opt.StartsWith($"{ansTrim}.") || opt.StartsWith($"{ansTrim})"))
                    {
                        result.Add(opt);
                        found = true;
                        break;
                    }
                }
                if (!found) result.Add(answer);
            }
            else
            {
                result.Add(answer);
            }
        }
        return result.Count > 0 ? string.Join(" | ", result) : "Unknown";
    }

    public string ToQuizletRow(string formatType = "full")
    {
        switch (formatType)
        {
            case "simple":
                return $"{Question}\t{GetCorrectAnswerText()}";
            case "full":
            {
                var opts = string.Join(" | ", Options);
                return $"{Question}  >>  {opts}\t{GetCorrectAnswerText()}";
            }
            case "safe":
            {
                var optsLines = string.Join("\n", Options);
                var term = $"{Question}\n{optsLines}";
                return $"{SafeCardSep}{term}{SafeTermSep}{GetCorrectAnswerText()}";
            }
            default: // compact
            {
                var opts = string.Join(" | ", Options);
                var term = $"{Question} [{opts}]";
                return $"{term}\t{string.Join(", ", CorrectAnswers)}";
            }
        }
    }

    public Dictionary<string, object?> ToDict()
    {
        return new Dictionary<string, object?>
        {
            ["card_id"] = CardId,
            ["question"] = Question,
            ["options"] = Options,
            ["correct_answers"] = CorrectAnswers,
            ["question_type"] = QuestionTypeToString(QuestionType),
            ["image_path"] = ImagePath,
            ["notes"] = Notes,
            ["status"] = Status,
        };
    }

    public static Flashcard FromDict(Dictionary<string, JsonElement> data)
    {
        return new Flashcard
        {
            CardId = data.GetStringOr("card_id", Guid.NewGuid().ToString()),
            Question = data.GetStringOr("question", ""),
            Options = data.GetStringListOr("options"),
            CorrectAnswers = data.GetStringListOr("correct_answers"),
            QuestionType = ParseQuestionType(data.GetStringOr("question_type", "unknown")),
            ImagePath = data.TryGetValue("image_path", out var ip) && ip.ValueKind == JsonValueKind.String ? ip.GetString() : null,
            Notes = data.GetStringOr("notes", ""),
            Status = data.TryGetValue("status", out var s) && s.ValueKind == JsonValueKind.Number ? s.GetInt32() : 0,
        };
    }

    public static string QuestionTypeToString(QuestionType qt) => qt switch
    {
        QuestionType.SingleChoice => "single_choice",
        QuestionType.MultipleChoice => "multiple_choice",
        _ => "unknown"
    };

    public static QuestionType ParseQuestionType(string s) => s switch
    {
        "single_choice" => QuestionType.SingleChoice,
        "multiple_choice" => QuestionType.MultipleChoice,
        _ => QuestionType.Unknown
    };
}

public class Deck
{
    public string DeckId { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = "";
    public string CreatedAt { get; set; } = DateTime.Now.ToString("o");
    public string UpdatedAt { get; set; } = DateTime.Now.ToString("o");
    public string SourceFolder { get; set; } = "";
    public string Description { get; set; } = "";
    public List<Flashcard> Cards { get; set; } = new();

    public int CardCount => Cards.Count;

    public Dictionary<string, object?> ToDict()
    {
        return new Dictionary<string, object?>
        {
            ["deck_id"] = DeckId,
            ["name"] = Name,
            ["created_at"] = CreatedAt,
            ["updated_at"] = UpdatedAt,
            ["source_folder"] = SourceFolder,
            ["description"] = Description,
            ["cards"] = Cards.Select(c => c.ToDict()).ToList(),
        };
    }

    public static Deck FromDict(Dictionary<string, JsonElement> data)
    {
        var cards = new List<Flashcard>();
        if (data.TryGetValue("cards", out var cardsEl) && cardsEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var cardEl in cardsEl.EnumerateArray())
            {
                var dict = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(cardEl.GetRawText())!;
                cards.Add(Flashcard.FromDict(dict));
            }
        }
        return new Deck
        {
            DeckId = data.GetStringOr("deck_id", Guid.NewGuid().ToString()),
            Name = data.GetStringOr("name", "Unnamed Deck"),
            CreatedAt = data.GetStringOr("created_at", DateTime.Now.ToString("o")),
            UpdatedAt = data.GetStringOr("updated_at", DateTime.Now.ToString("o")),
            SourceFolder = data.GetStringOr("source_folder", ""),
            Description = data.GetStringOr("description", ""),
            Cards = cards,
        };
    }
}

public class QuizSession
{
    public string SessionId { get; set; } = Guid.NewGuid().ToString();
    public string DeckId { get; set; } = "";
    public List<int> QuestionOrder { get; set; } = new();
    public int CurrentIndex { get; set; } = 0;
    public Dictionary<string, List<string>> Answers { get; set; } = new();
    public int CorrectCount { get; set; } = 0;
    public int WrongCount { get; set; } = 0;
    public string StartedAt { get; set; } = DateTime.Now.ToString("o");
    public string UpdatedAt { get; set; } = DateTime.Now.ToString("o");

    public bool IsComplete => CurrentIndex >= QuestionOrder.Count;

    public double ProgressFrac => QuestionOrder.Count == 0 ? 0.0 : (double)CurrentIndex / QuestionOrder.Count;

    public Dictionary<string, object?> ToDict()
    {
        return new Dictionary<string, object?>
        {
            ["session_id"] = SessionId,
            ["deck_id"] = DeckId,
            ["question_order"] = QuestionOrder,
            ["current_index"] = CurrentIndex,
            ["answers"] = Answers,
            ["correct_count"] = CorrectCount,
            ["wrong_count"] = WrongCount,
            ["started_at"] = StartedAt,
            ["updated_at"] = UpdatedAt,
        };
    }

    public static QuizSession FromDict(Dictionary<string, JsonElement> data)
    {
        var answers = new Dictionary<string, List<string>>();
        if (data.TryGetValue("answers", out var ansEl) && ansEl.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in ansEl.EnumerateObject())
            {
                var list = new List<string>();
                if (prop.Value.ValueKind == JsonValueKind.Array)
                    foreach (var item in prop.Value.EnumerateArray())
                        list.Add(item.GetString() ?? "");
                answers[prop.Name] = list;
            }
        }

        var questionOrder = new List<int>();
        if (data.TryGetValue("question_order", out var qo) && qo.ValueKind == JsonValueKind.Array)
            foreach (var item in qo.EnumerateArray())
                questionOrder.Add(item.GetInt32());

        return new QuizSession
        {
            SessionId = data.GetStringOr("session_id", Guid.NewGuid().ToString()),
            DeckId = data.GetStringOr("deck_id", ""),
            QuestionOrder = questionOrder,
            CurrentIndex = data.TryGetValue("current_index", out var ci) && ci.ValueKind == JsonValueKind.Number ? ci.GetInt32() : 0,
            Answers = answers,
            CorrectCount = data.TryGetValue("correct_count", out var cc) && cc.ValueKind == JsonValueKind.Number ? cc.GetInt32() : 0,
            WrongCount = data.TryGetValue("wrong_count", out var wc) && wc.ValueKind == JsonValueKind.Number ? wc.GetInt32() : 0,
            StartedAt = data.GetStringOr("started_at", DateTime.Now.ToString("o")),
            UpdatedAt = data.GetStringOr("updated_at", DateTime.Now.ToString("o")),
        };
    }

    public static QuizSession NewForDeck(Deck deck)
    {
        var order = Enumerable.Range(0, deck.Cards.Count).ToList();
        var rng = new Random();
        for (int i = order.Count - 1; i > 0; i--)
        {
            int j = rng.Next(i + 1);
            (order[i], order[j]) = (order[j], order[i]);
        }
        return new QuizSession { DeckId = deck.DeckId, QuestionOrder = order };
    }
}

// Extension methods for JSON dictionary parsing
public static class JsonDictExtensions
{
    public static string GetStringOr(this Dictionary<string, JsonElement> dict, string key, string defaultValue = "")
    {
        if (dict.TryGetValue(key, out var el) && el.ValueKind == JsonValueKind.String)
            return el.GetString() ?? defaultValue;
        return defaultValue;
    }

    public static List<string> GetStringListOr(this Dictionary<string, JsonElement> dict, string key)
    {
        var list = new List<string>();
        if (dict.TryGetValue(key, out var el) && el.ValueKind == JsonValueKind.Array)
            foreach (var item in el.EnumerateArray())
                list.Add(item.GetString() ?? "");
        return list;
    }
}
