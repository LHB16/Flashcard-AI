using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using FlashcardAI.Models;

namespace FlashcardAI.Services;

/// <summary>
/// Save/load decks, settings, quiz sessions — JSON files next to the EXE.
/// </summary>
public class StorageService
{
    private static readonly JsonSerializerOptions _jsonOpts = new()
    {
        WriteIndented = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static string GetAppRoot()
    {
        var exePath = AppContext.BaseDirectory;
        // When running from IDE (not published), use the project root
        return exePath;
    }

    public static string DecksFile => Path.Combine(GetAppRoot(), "decks.json");
    public static string SettingsFile => Path.Combine(GetAppRoot(), "settings.json");
    public static string QuizSessionsFile => Path.Combine(GetAppRoot(), "quiz_sessions.json");

    // ─────────────── Decks ───────────────
    public static List<Deck> LoadDecks()
    {
        if (!File.Exists(DecksFile)) return new List<Deck>();
        try
        {
            var json = File.ReadAllText(DecksFile);
            var array = JsonSerializer.Deserialize<List<Dictionary<string, JsonElement>>>(json);
            if (array == null) return new List<Deck>();
            return array.Select(Deck.FromDict).ToList();
        }
        catch { return new List<Deck>(); }
    }

    public static void SaveDecks(List<Deck> decks)
    {
        var now = DateTime.Now.ToString("o");
        foreach (var d in decks) d.UpdatedAt = now;
        var data = decks.Select(d => d.ToDict()).ToList();
        var json = JsonSerializer.Serialize(data, _jsonOpts);
        File.WriteAllText(DecksFile, json);
    }

    /// <summary>Save decks without bumping updated_at (used by sync).</summary>
    public static void SaveDecksRaw(List<Deck> decks)
    {
        var data = decks.Select(d => d.ToDict()).ToList();
        var json = JsonSerializer.Serialize(data, _jsonOpts);
        File.WriteAllText(DecksFile, json);
    }

    // ─────────────── Settings ───────────────
    public static Dictionary<string, JsonElement> LoadSettingsRaw()
    {
        if (!File.Exists(SettingsFile))
            return JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(
                """{"api_keys":[],"theme":"dark","quizlet_format":"full"}""")!;
        try
        {
            var json = File.ReadAllText(SettingsFile);
            return JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)
                   ?? JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(
                       """{"api_keys":[],"theme":"dark","quizlet_format":"full"}""")!;
        }
        catch
        {
            return JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(
                """{"api_keys":[],"theme":"dark","quizlet_format":"full"}""")!;
        }
    }

    public static void SaveSettings(Dictionary<string, object?> settings)
    {
        var json = JsonSerializer.Serialize(settings, _jsonOpts);
        File.WriteAllText(SettingsFile, json);
    }

    public static List<string> GetApiKeys(Dictionary<string, JsonElement> settings)
    {
        if (settings.TryGetValue("api_keys", out var el) && el.ValueKind == JsonValueKind.Array)
            return el.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => !string.IsNullOrEmpty(s)).ToList();
        return new List<string>();
    }

    public static List<string>? GetActiveKeys(Dictionary<string, JsonElement> settings)
    {
        if (settings.TryGetValue("active_keys", out var el) && el.ValueKind == JsonValueKind.Array)
            return el.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => !string.IsNullOrEmpty(s)).ToList();
        return null;
    }

    // ─────────────── Quiz Sessions ───────────────
    public static Dictionary<string, QuizSession> LoadQuizSessions()
    {
        if (!File.Exists(QuizSessionsFile)) return new Dictionary<string, QuizSession>();
        try
        {
            var json = File.ReadAllText(QuizSessionsFile);
            var dict = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, JsonElement>>>(json);
            if (dict == null) return new Dictionary<string, QuizSession>();
            return dict.ToDictionary(kv => kv.Key, kv => QuizSession.FromDict(kv.Value));
        }
        catch { return new Dictionary<string, QuizSession>(); }
    }

    public static void SaveQuizSession(QuizSession session)
    {
        session.UpdatedAt = DateTime.Now.ToString("o");
        var sessions = LoadQuizSessions();
        sessions[session.DeckId] = session;
        SaveQuizSessionsRaw(sessions);
    }

    public static void DeleteQuizSession(string deckId)
    {
        var sessions = LoadQuizSessions();
        sessions.Remove(deckId);
        SaveQuizSessionsRaw(sessions);
    }

    public static void SaveQuizSessionsRaw(Dictionary<string, QuizSession> sessions)
    {
        var data = sessions.ToDictionary(kv => kv.Key, kv => kv.Value.ToDict());
        var json = JsonSerializer.Serialize(data, _jsonOpts);
        File.WriteAllText(QuizSessionsFile, json);
    }
}
