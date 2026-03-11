using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using FlashcardAI.Helpers;
using FlashcardAI.Models;
using FlashcardAI.Services;

namespace FlashcardAI.Views.Pages;

public partial class StudyPage : Page
{
    private readonly MainWindow _app;
    private Deck _deck;
    private List<Flashcard> _cards;
    private int _currentIndex = 0;
    private int _knowCount = 0;
    private int _dontKnowCount = 0;
    private bool _isFlipped = false;
    private Stack<(int index, int oldStatus)> _undoStack = new();

    public StudyPage(MainWindow app, Deck deck)
    {
        InitializeComponent();
        _app = app;
        _deck = deck;

        // Study unmastered cards (status 0 or 1), shuffled
        _cards = deck.Cards.Where(c => c.Status != 2).ToList();
        if (_cards.Count == 0)
        {
            _cards = deck.Cards.ToList();
            // Reset all since all mastered
            foreach (var c in deck.Cards) c.Status = 0;
        }

        var rng = new Random();
        for (int i = _cards.Count - 1; i > 0; i--)
        {
            int j = rng.Next(i + 1);
            (_cards[i], _cards[j]) = (_cards[j], _cards[i]);
        }

        TitleLbl.Text = $"📖  Study: {deck.Name}";
        this.Loaded += (s, e) => this.Focus();
        ShowCard();
    }

    private void ShowCard()
    {
        if (_currentIndex >= _cards.Count)
        {
            ShowResults();
            return;
        }

        _isFlipped = false;
        var card = _cards[_currentIndex];

        CardNumber.Text = $"Card {_currentIndex + 1} / {_cards.Count}";
        QuestionText.Text = card.Question;
        OptionsText.Text = string.Join("\n", card.Options);

        AnswerCard.Visibility = Visibility.Collapsed;
        FlipHint.Visibility = Visibility.Visible;
        ActionBtns.Visibility = Visibility.Collapsed;

        // Notes
        if (!string.IsNullOrEmpty(card.Notes))
        {
            NotesText.Text = card.Notes;
            NotesText.Visibility = Visibility.Visible;
        }
        else NotesText.Visibility = Visibility.Collapsed;

        ProgressLbl.Text = $"✅ {_knowCount}  |  ❌ {_dontKnowCount}  |  ⚪ {_cards.Count - _currentIndex}";
    }

    private void Flip()
    {
        if (_isFlipped) return;
        _isFlipped = true;
        var card = _cards[_currentIndex];
        AnswerText.Text = $"✓  {card.GetCorrectAnswerText()}";
        AnswerCard.Visibility = Visibility.Visible;
        FlipHint.Visibility = Visibility.Collapsed;
        ActionBtns.Visibility = Visibility.Visible;
    }

    private void Know_Click(object sender, RoutedEventArgs e) => MarkKnow();
    private void DontKnow_Click(object sender, RoutedEventArgs e) => MarkDontKnow();

    private void MarkKnow()
    {
        if (!_isFlipped) return;
        var card = _cards[_currentIndex];
        _undoStack.Push((_currentIndex, card.Status));
        card.Status = 2; // Mastered
        _knowCount++;
        _currentIndex++;
        SaveProgress();
        ShowCard();
        UndoBtn.IsEnabled = _undoStack.Count > 0;
    }

    private void MarkDontKnow()
    {
        if (!_isFlipped) return;
        var card = _cards[_currentIndex];
        _undoStack.Push((_currentIndex, card.Status));
        card.Status = 1; // Learning
        _dontKnowCount++;
        _currentIndex++;
        SaveProgress();
        ShowCard();
        UndoBtn.IsEnabled = _undoStack.Count > 0;
    }

    private void Undo_Click(object sender, RoutedEventArgs e)
    {
        if (_undoStack.Count == 0) return;
        var (idx, oldStatus) = _undoStack.Pop();
        var card = _cards[idx];

        if (card.Status == 2) _knowCount--;
        else if (card.Status == 1) _dontKnowCount--;

        card.Status = oldStatus;
        _currentIndex = idx;
        SaveProgress();

        StudyPanel.Visibility = Visibility.Visible;
        ResultsPanel.Visibility = Visibility.Collapsed;
        ShowCard();
        UndoBtn.IsEnabled = _undoStack.Count > 0;
    }

    private void SaveProgress()
    {
        StorageService.SaveDecks(_app.Decks);
    }

    private void ShowResults()
    {
        StudyPanel.Visibility = Visibility.Collapsed;
        ResultsPanel.Visibility = Visibility.Visible;
        int total = _cards.Count;
        ResultStats.Text = $"✅ Known: {_knowCount}    ❌ Don't Know: {_dontKnowCount}    📊 Total: {total}";
    }

    private void Reset_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show("Reset all card progress and start over?", "Confirm",
            MessageBoxButton.YesNo) == MessageBoxResult.Yes)
        {
            foreach (var c in _deck.Cards) c.Status = 0;
            StorageService.SaveDecks(_app.Decks);
            _app.ShowStudy(_deck);
        }
        this.Focus();
    }

    private void StudyAgain_Click(object sender, RoutedEventArgs e)
    {
        foreach (var c in _deck.Cards) { if (c.Status == 1) c.Status = 0; }
        StorageService.SaveDecks(_app.Decks);
        _app.ShowStudy(_deck);
    }

    private void Home_Click(object sender, RoutedEventArgs e) => _app.ShowHome();

    private void Card_Click(object sender, MouseButtonEventArgs e) => Flip();

    private void Page_PreviewKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        switch (e.Key)
        {
            case System.Windows.Input.Key.Space: Flip(); e.Handled = true; break;
            case System.Windows.Input.Key.Right: MarkKnow(); e.Handled = true; break;
            case System.Windows.Input.Key.Left: MarkDontKnow(); e.Handled = true; break;
        }
    }
}
