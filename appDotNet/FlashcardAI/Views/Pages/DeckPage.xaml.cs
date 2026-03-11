using System;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using FlashcardAI.Helpers;
using FlashcardAI.Models;
using FlashcardAI.Services;
using FlashcardAI.Views.Dialogs;

namespace FlashcardAI.Views.Pages;

public partial class DeckPage : Page
{
    private readonly MainWindow _app;
    private Deck _deck;
    private int _loadedCount = 0;
    private const int CardsPerPage = 50;

    public DeckPage(MainWindow app, Deck deck)
    {
        InitializeComponent();
        _app = app;
        _deck = deck;
        LoadDeck();
    }

    private void LoadDeck()
    {
        TitleLbl.Text = $"📚  {_deck.Name}";
        UpdateStats();
        RefreshCards();
    }

    private void UpdateStats()
    {
        int mc = _deck.Cards.Count(c => c.QuestionType == QuestionType.MultipleChoice);
        StatsLbl.Text = $"{_deck.CardCount} cards  ·  {mc} multi-answer  ·  {_deck.CardCount - mc} single";

        ProgressPanel.Children.Clear();
        if (_deck.CardCount == 0) return;

        int green = _deck.Cards.Count(c => c.Status == 2);
        int orange = _deck.Cards.Count(c => c.Status == 1);
        int gray = _deck.Cards.Count(c => c.Status == 0);

        if (green > 0 || orange > 0)
        {
            var resetBtn = new Button { Content = "🔄 Reset", Style = (Style)FindResource("SubtleBtn"),
                Padding = new Thickness(8,4,8,4), FontSize = 11, Margin = new Thickness(0,0,10,0) };
            resetBtn.Click += (_, _) =>
            {
                if (MessageBox.Show("Reset all card progress?", "Confirm", MessageBoxButton.YesNo) == MessageBoxResult.Yes)
                { foreach (var c in _deck.Cards) c.Status = 0; StorageService.SaveDecks(_app.Decks); LoadDeck(); }
            };
            ProgressPanel.Children.Add(resetBtn);
        }

        // Bar
        var barGrid = new Grid { Width = 150, Height = 12, ClipToBounds = true };
        barGrid.Children.Add(new Border { Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E2E8F0")), CornerRadius = new CornerRadius(6) });
        var barPanel = new StackPanel { Orientation = Orientation.Horizontal };
        int wG = (int)((double)green / _deck.CardCount * 150);
        int wO = (int)((double)orange / _deck.CardCount * 150);
        if (wG > 0) barPanel.Children.Add(new Border { Width = wG, Background = (Brush)FindResource("SuccessBrush") });
        if (wO > 0) barPanel.Children.Add(new Border { Width = wO, Background = (Brush)FindResource("WarningBrush") });
        barGrid.Children.Add(barPanel);
        ProgressPanel.Children.Add(barGrid);

        ProgressPanel.Children.Add(new TextBlock { Text = $"  ✅{green}  ❌{orange}  ⚪{gray}",
            FontSize = 11, Foreground = (Brush)FindResource("TextDimBrush"), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(10,0,0,0) });
    }

    private void RefreshCards()
    {
        CardList.Children.Clear();
        _loadedCount = 0;
        LoadMoreCards();
    }

    private void LoadMoreCards()
    {
        // Remove old "load more" button
        for (int i = CardList.Children.Count - 1; i >= 0; i--)
            if (CardList.Children[i] is Button b && b.Tag?.ToString() == "loadmore")
                CardList.Children.RemoveAt(i);

        int start = _loadedCount;
        int end = Math.Min(start + CardsPerPage, _deck.Cards.Count);
        for (int i = start; i < end; i++)
            CardList.Children.Add(CreateCardRow(i, _deck.Cards[i]));
        _loadedCount = end;

        if (_loadedCount < _deck.Cards.Count)
        {
            int remaining = _deck.Cards.Count - _loadedCount;
            var loadBtn = new Button {
                Content = $"⇩  Load {Math.Min(CardsPerPage, remaining)} more  ({remaining} remaining)",
                Style = (Style)FindResource("SubtleBtn"), Height = 36, Margin = new Thickness(0,8,0,8), Tag = "loadmore" };
            loadBtn.Click += (_, _) => LoadMoreCards();
            CardList.Children.Add(loadBtn);
        }
    }

    private Border CreateCardRow(int idx, Flashcard card)
    {
        var row = new Border { Background = (Brush)FindResource("SurfaceBrush"), CornerRadius = new CornerRadius(10), Margin = new Thickness(0,4,0,4) };
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(40) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        // Badge
        var statusColor = card.Status switch { 1 => ThemeColors.Warning, 2 => ThemeColors.Success, _ => "#9CA3AF" };
        var badge = new Border { Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(statusColor)),
            CornerRadius = new CornerRadius(8), Margin = new Thickness(8), Width = 40 };
        badge.Child = new TextBlock { Text = (idx + 1).ToString(), FontSize = 13, FontWeight = FontWeights.Bold,
            Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        Grid.SetColumn(badge, 0);
        grid.Children.Add(badge);

        // Content
        var content = new StackPanel { Margin = new Thickness(5,8,5,8) };
        var typeColor = card.QuestionType == QuestionType.MultipleChoice ? ThemeColors.Warning : ThemeColors.Success;
        var typeText = card.QuestionType == QuestionType.MultipleChoice ? "Multi-answer" : "Single";
        content.Children.Add(new TextBlock { Text = $"[{typeText}]", FontSize = 11,
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(typeColor)) });
        content.Children.Add(new TextBlock { Text = card.Question, FontSize = 13,
            Foreground = (Brush)FindResource("TextBrush"), TextWrapping = TextWrapping.Wrap, MaxWidth = 550 });

        var optsShort = string.Join("  ", card.Options.Take(4));
        if (card.Options.Count > 4) optsShort += $"  (+{card.Options.Count - 4} more)";
        content.Children.Add(new TextBlock { Text = optsShort, FontSize = 11,
            Foreground = (Brush)FindResource("TextDimBrush"), Margin = new Thickness(0,2,0,0), TextWrapping = TextWrapping.Wrap, MaxWidth = 550 });

        content.Children.Add(new TextBlock { Text = $"✓ {string.Join(" | ", card.CorrectAnswers)}", FontSize = 12,
            Foreground = (Brush)FindResource("SuccessBrush") });
        Grid.SetColumn(content, 1);
        grid.Children.Add(content);

        // Delete
        var delBtn = new Button { Content = "✕", Style = (Style)FindResource("DangerBtn"), Padding = new Thickness(6,4,6,4),
            VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0,0,8,0) };
        var capturedIdx = idx;
        delBtn.Click += (_, _) => { _deck.Cards.RemoveAt(capturedIdx); StorageService.SaveDecks(_app.Decks); LoadDeck(); };
        Grid.SetColumn(delBtn, 2);
        grid.Children.Add(delBtn);

        row.Child = grid;
        return row;
    }

    private void Home_Click(object sender, RoutedEventArgs e) => _app.ShowHome();
    private void Study_Click(object sender, RoutedEventArgs e) => _app.ShowStudy(_deck);
    private void Quiz_Click(object sender, RoutedEventArgs e) => _app.ShowQuiz(_deck);

    private void Export_Click(object sender, RoutedEventArgs e)
    {
        if (_deck == null) return;
        var dlg = new ExportDialog(_app, _deck);
        dlg.Owner = _app;
        dlg.ShowDialog();
    }

    private async void Dedup_Click(object sender, RoutedEventArgs e)
    {
        if (_deck == null || _deck.Cards.Count == 0) return;
        DedupBtn.Content = "⏳ Deduplicating...";
        DedupBtn.IsEnabled = false;

        var dupes = await Task.Run(() => DedupService.FindDuplicateQuestions(_deck.Cards));

        DedupBtn.Content = "🔍 Deduplicate";
        DedupBtn.IsEnabled = true;

        if (dupes.Count == 0)
        {
            MessageBox.Show($"No duplicate cards found (out of {_deck.Cards.Count} cards)! 🎉", "Result");
            return;
        }

        var dlg = new DedupDialog(_app, _deck, dupes, removedCount =>
        {
            StorageService.SaveDecks(_app.Decks);
            LoadDeck();
            if (removedCount > 0)
                MessageBox.Show($"Removed {removedCount} duplicate cards.", "✅ Completed");
        });
        dlg.Owner = _app;
        dlg.ShowDialog();
    }
}
