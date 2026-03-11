using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Text.Json;
using System.Windows;
using FlashcardAI.Helpers;
using FlashcardAI.Models;
using FlashcardAI.Services;
using FlashcardAI.Views.Pages;

namespace FlashcardAI;

public partial class MainWindow : Window
{
    public static MainWindow? Instance { get; private set; }

    // Shared app data
    public List<Deck> Decks { get; set; } = new();
    public Dictionary<string, JsonElement> Settings { get; set; } = new();
    public GeminiService GeminiService { get; } = new();
    public AuthService AuthService { get; } = new();
    public SyncService SyncService { get; private set; } = null!;
    public ObservableCollection<BackgroundScan> ActiveScans { get; } = new();

    // Pages (cached)
    private HomePage? _homePage;
    private ScanPage? _scanPage;
    private DeckPage? _deckPage;
    private StudyPage? _studyPage;
    private QuizPage? _quizPage;

    public MainWindow()
    {
        InitializeComponent();
        Instance = this;
        SyncService = new SyncService(AuthService);

        // Load data
        Settings = StorageService.LoadSettingsRaw();
        Decks = StorageService.LoadDecks();

        var apiKeys = StorageService.GetApiKeys(Settings);
        if (apiKeys.Count > 0)
            GeminiService.SetKeys(apiKeys);

        ShowHome();
    }

    public void ShowHome()
    {
        _homePage ??= new HomePage(this);
        _homePage.Refresh();
        MainFrame.Navigate(_homePage);
    }

    public void ShowScan()
    {
        _scanPage = new ScanPage(this);
        MainFrame.Navigate(_scanPage);
    }

    public void ShowDeck(Deck deck)
    {
        _deckPage = new DeckPage(this, deck);
        MainFrame.Navigate(_deckPage);
    }

    public void ShowStudy(Deck deck)
    {
        if (deck.Cards.Count == 0)
        {
            MessageBox.Show("This deck has no cards to study.", "Empty Deck", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        _studyPage = new StudyPage(this, deck);
        MainFrame.Navigate(_studyPage);
    }

    public void ShowQuiz(Deck deck)
    {
        if (deck.Cards.Count == 0)
        {
            MessageBox.Show("This deck has no cards to start a quiz.", "Empty Deck", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var sessions = StorageService.LoadQuizSessions();
        if (sessions.TryGetValue(deck.DeckId, out var saved) && !saved.IsComplete)
        {
            int n = saved.QuestionOrder.Count;
            int answered = saved.CurrentIndex;
            var result = MessageBox.Show(
                $"You have an unfinished quiz for '{deck.Name}'\n" +
                $"Progress: {answered}/{n} questions\n\n" +
                $"Select 'Yes' to continue, 'No' to start over.",
                "Resume Quiz?", MessageBoxButton.YesNo, MessageBoxImage.Question);

            if (result == MessageBoxResult.Yes)
            {
                _quizPage = new QuizPage(this, deck, saved);
                MainFrame.Navigate(_quizPage);
                return;
            }
            else
            {
                StorageService.DeleteQuizSession(deck.DeckId);
            }
        }

        _quizPage = new QuizPage(this, deck);
        MainFrame.Navigate(_quizPage);
    }

    public HashSet<string> GetUsedKeys()
    {
        var used = new HashSet<string>();
        foreach (var scan in ActiveScans)
        {
            if (!scan.IsFinished)
                foreach (var k in scan.Keys)
                    used.Add(k);
        }
        return used;
    }

    public void SaveSettings()
    {
        var dict = new Dictionary<string, object?>();
        foreach (var kv in Settings)
        {
            dict[kv.Key] = kv.Value.ValueKind switch
            {
                JsonValueKind.String => kv.Value.GetString(),
                JsonValueKind.Number => kv.Value.GetInt32(),
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Array => kv.Value.EnumerateArray().Select(e => e.GetString()).ToList(),
                _ => kv.Value.GetRawText()
            };
        }
        StorageService.SaveSettings(dict);
    }
}