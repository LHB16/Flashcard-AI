using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using FlashcardAI.Helpers;
using FlashcardAI.Models;

namespace FlashcardAI.Views.Dialogs;

public partial class DedupDialog : Window
{
    private readonly MainWindow _app;
    private readonly Deck _deck;
    private readonly List<(int idxA, int idxB, double ratio)> _duplicates;
    private readonly Action<int> _onApply;

    private const int PageSize = 20;
    private int _currentPage = 0;
    private int _totalPages;

    private readonly List<(int a, int b, double r)> _exact;
    private readonly List<(int a, int b, double r)> _similar;
    private readonly List<(int a, int b, double r)> _allPairs;

    // (pairKey, slot) → CheckBox
    private readonly Dictionary<(string, string), System.Windows.Controls.CheckBox> _deleteChecks = new();
    // (pairKey, slot) → card index
    private readonly Dictionary<(string, string), int> _keyToIdx = new();
    // exact b-side keys
    private readonly List<(string, string)> _exactBKeys = new();

    public DedupDialog(MainWindow app, Deck deck, List<(int, int, double)> duplicates, Action<int> onApply)
    {
        InitializeComponent();
        _app = app;
        _deck = deck;
        _duplicates = duplicates;
        _onApply = onApply;

        _exact = duplicates.Where(d => d.Item3 >= 0.99).ToList();
        _similar = duplicates.Where(d => d.Item3 < 0.99).ToList();
        _allPairs = _exact.Concat(_similar).ToList();
        _totalPages = Math.Max(1, (_allPairs.Count + PageSize - 1) / PageSize);

        HeaderLbl.Text = $"🔍 Found {_exact.Count} exact (100%)  ·  {_similar.Count} similar  ·  {_allPairs.Count} total";
        ToggleExactBtn.Content = "☒ Select All (100%)";

        // Pre-create all check state in memory
        for (int i = 0; i < _allPairs.Count; i++)
        {
            var (a, b, r) = _allPairs[i];
            bool isExact = r >= 0.99;
            var pk = $"pair_{i}";
            _keyToIdx[(pk, "a")] = a;
            _keyToIdx[(pk, "b")] = b;
            if (isExact) _exactBKeys.Add((pk, "b"));
        }

        RenderPage();
    }

    private void RenderPage()
    {
        PairList.Children.Clear();
        _deleteChecks.Clear();

        int start = _currentPage * PageSize;
        int end = Math.Min(start + PageSize, _allPairs.Count);
        int exactBoundary = _exact.Count;

        for (int i = start; i < end; i++)
        {
            var (idxA, idxB, ratio) = _allPairs[i];
            var pk = $"pair_{i}";
            int pct = (int)(ratio * 100);
            bool isExact = i < exactBoundary;

            var pairFrame = new Border { Background = (Brush)FindResource("SurfaceBrush"),
                CornerRadius = new CornerRadius(8), Margin = new Thickness(0,4,0,4), Padding = new Thickness(10) };
            var sp = new StackPanel();

            var badgeColor = isExact ? ThemeColors.Danger : "#6D28D9";
            var badgeText = isExact ? $"✅ {pct}% exact" : $"🔍 {pct}% similar";
            sp.Children.Add(new TextBlock { Text = badgeText, FontSize = 12, FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(badgeColor)) });

            var cols = new Grid();
            cols.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            cols.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            var cardA = idxA < _deck.Cards.Count ? _deck.Cards[idxA] : null;
            var cardB = idxB < _deck.Cards.Count ? _deck.Cards[idxB] : null;

            AddCardColumn(cols, 0, pk, "a", idxA, cardA, isExact ? false : false);
            AddCardColumn(cols, 1, pk, "b", idxB, cardB, isExact);

            sp.Children.Add(cols);
            pairFrame.Child = sp;
            PairList.Children.Add(pairFrame);
        }

        PageLbl.Text = $"Page {_currentPage + 1} / {_totalPages}";
        PrevBtn.IsEnabled = _currentPage > 0;
        NextBtn.IsEnabled = _currentPage < _totalPages - 1;
    }

    private void AddCardColumn(Grid grid, int col, string pairKey, string slot, int cardIdx, Flashcard? card, bool defaultChecked)
    {
        var cell = new StackPanel { Margin = new Thickness(4) };

        var cb = new CheckBox
        {
            Content = $"#{cardIdx + 1} — Delete?",
            IsChecked = defaultChecked,
            FontSize = 12, FontWeight = FontWeights.Bold,
            Foreground = (Brush)FindResource("TextBrush")
        };
        _deleteChecks[(pairKey, slot)] = cb;
        cell.Children.Add(cb);

        if (card != null)
        {
            var q = card.Question.Length > 160 ? card.Question[..160] + "..." : card.Question;
            cell.Children.Add(new TextBlock { Text = q, FontSize = 11, TextWrapping = TextWrapping.Wrap,
                Foreground = (Brush)FindResource("TextBrush"), Margin = new Thickness(0,2,0,0) });

            var ansText = GetAnswerText(card);
            cell.Children.Add(new TextBlock { Text = ansText, FontSize = 11,
                Foreground = (Brush)FindResource("SuccessBrush"), TextWrapping = TextWrapping.Wrap });
        }

        Grid.SetColumn(cell, col);
        grid.Children.Add(cell);
    }

    private static string GetAnswerText(Flashcard card)
    {
        var correct = card.CorrectAnswers;
        if (correct.Count == 0) return "Answer: (none)";
        var correctSet = correct.Select(c => c.Trim().ToUpper()).ToHashSet();
        var matched = card.Options.Where(opt =>
        {
            var t = opt.Trim();
            return t.Length > 0 && correctSet.Contains(t[0].ToString().ToUpper());
        }).ToList();
        return matched.Count > 0 ? "Answer: " + string.Join(" | ", matched) : "Answer: " + string.Join(", ", correct);
    }

    private void Prev_Click(object sender, RoutedEventArgs e) { if (_currentPage > 0) { _currentPage--; RenderPage(); } }
    private void Next_Click(object sender, RoutedEventArgs e) { if (_currentPage < _totalPages - 1) { _currentPage++; RenderPage(); } }
    private void Cancel_Click(object sender, RoutedEventArgs e) => Close();

    private void ToggleExact_Click(object sender, RoutedEventArgs e)
    {
        // Check if we need to check or uncheck current page exact b-keys
        bool allChecked = true;
        foreach (var key in _exactBKeys)
        {
            if (_deleteChecks.TryGetValue(key, out var cb))
            {
                if (cb.IsChecked != true) { allChecked = false; break; }
            }
        }

        bool newState = !allChecked;
        foreach (var key in _exactBKeys)
        {
            if (_deleteChecks.TryGetValue(key, out var cb))
                cb.IsChecked = newState;
        }
        ToggleExactBtn.Content = newState ? "☒ Unselect All (100%)" : "☑ Select All (100%)";
    }

    private void Apply_Click(object sender, RoutedEventArgs e)
    {
        var indicesToDelete = new SortedSet<int>(Comparer<int>.Create((a, b) => b.CompareTo(a)));

        foreach (var ((pk, slot), cb) in _deleteChecks)
        {
            if (cb.IsChecked == true && _keyToIdx.TryGetValue((pk, slot), out int idx))
                indicesToDelete.Add(idx);
        }

        foreach (int idx in indicesToDelete)
        {
            if (idx >= 0 && idx < _deck.Cards.Count)
                _deck.Cards.RemoveAt(idx);
        }

        _onApply(indicesToDelete.Count);
        Close();
    }
}
