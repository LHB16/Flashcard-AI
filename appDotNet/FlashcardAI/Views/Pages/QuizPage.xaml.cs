using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using FlashcardAI.Helpers;
using FlashcardAI.Models;
using FlashcardAI.Services;

namespace FlashcardAI.Views.Pages;

public partial class QuizPage : Page
{
    private readonly MainWindow _app;
    private Deck _deck;
    private QuizSession _session;
    private List<ToggleButton> _optionButtons = new();
    private bool _answered = false;

    public QuizPage(MainWindow app, Deck deck, QuizSession? existingSession = null)
    {
        InitializeComponent();
        _app = app;
        _deck = deck;
        _session = existingSession ?? QuizSession.NewForDeck(deck);
        TitleLbl.Text = $"📝  Quiz: {deck.Name}";
        ShowQuestion();
    }

    private void ShowQuestion()
    {
        if (_session.CurrentIndex >= _session.QuestionOrder.Count)
        {
            ShowResults();
            return;
        }

        _answered = false;
        OptionsPanel.Children.Clear();
        _optionButtons.Clear();

        int cardIdx = _session.QuestionOrder[_session.CurrentIndex];
        if (cardIdx < 0 || cardIdx >= _deck.Cards.Count) { _session.CurrentIndex++; ShowQuestion(); return; }
        var card = _deck.Cards[cardIdx];

        // Progress
        int total = _session.QuestionOrder.Count;
        int cur = _session.CurrentIndex + 1;
        QuizProgress.Text = $"Q{cur}/{total}  ·  ✅{_session.CorrectCount}  ❌{_session.WrongCount}";
        QuizProgressBar.Value = _session.ProgressFrac * 100;

        // Type badge
        bool isMulti = card.QuestionType == QuestionType.MultipleChoice;
        TypeBadge.Background = isMulti
            ? new SolidColorBrush((Color)ColorConverter.ConvertFromString(ThemeColors.Warning))
            : new SolidColorBrush((Color)ColorConverter.ConvertFromString(ThemeColors.Success));
        TypeBadgeText.Text = isMulti ? "☑ Multi-answer" : "○ Single choice";

        // Question
        QuizQuestionText.Text = card.Question;

        // Options
        foreach (var opt in card.Options)
        {
            var tb = new ToggleButton
            {
                Content = new TextBlock { Text = opt, FontSize = 13, TextWrapping = TextWrapping.Wrap },
                HorizontalContentAlignment = HorizontalAlignment.Left,
                Padding = new Thickness(18, 12, 18, 12),
                Margin = new Thickness(0, 3, 0, 3),
                Cursor = System.Windows.Input.Cursors.Hand,
                Tag = opt,
            };

            // Style
            tb.Style = CreateOptionToggleStyle();

            if (!isMulti) // single choice => radio behavior
            {
                tb.Click += (s, e) =>
                {
                    foreach (var other in _optionButtons)
                        if (other != s) other.IsChecked = false;
                };
            }

            _optionButtons.Add(tb);
            OptionsPanel.Children.Add(tb);
        }

        ConfirmBtn.Visibility = Visibility.Visible;
        NextBtn.Visibility = Visibility.Collapsed;
    }

    private Style CreateOptionToggleStyle()
    {
        var style = new Style(typeof(ToggleButton));
        var template = new ControlTemplate(typeof(ToggleButton));
        var border = new FrameworkElementFactory(typeof(Border));
        border.SetValue(Border.BackgroundProperty, (Brush)FindResource("SurfaceBrush"));
        border.SetValue(Border.CornerRadiusProperty, new CornerRadius(8));
        border.SetValue(Border.BorderThicknessProperty, new Thickness(2));
        border.SetValue(Border.BorderBrushProperty, (Brush)FindResource("Surface2Brush"));
        border.SetValue(Border.PaddingProperty, new Thickness(18, 12, 18, 12));
        border.Name = "bd";

        var cp = new FrameworkElementFactory(typeof(ContentPresenter));
        cp.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Left);
        border.AppendChild(cp);
        template.VisualTree = border;

        // Trigger for Checked
        var checkedTrigger = new Trigger { Property = ToggleButton.IsCheckedProperty, Value = true };
        checkedTrigger.Setters.Add(new Setter(Border.BorderBrushProperty, FindResource("AccentBrush"), "bd"));
        checkedTrigger.Setters.Add(new Setter(Border.BackgroundProperty, new SolidColorBrush((Color)ColorConverter.ConvertFromString("#F0F0FF")), "bd"));
        template.Triggers.Add(checkedTrigger);

        // Trigger IsMouseOver
        var hoverTrigger = new Trigger { Property = UIElement.IsMouseOverProperty, Value = true };
        hoverTrigger.Setters.Add(new Setter(Border.BorderBrushProperty, FindResource("AccentBrush"), "bd"));
        template.Triggers.Add(hoverTrigger);

        style.Setters.Add(new Setter(System.Windows.Controls.Control.TemplateProperty, template));
        return style;
    }

    private void Confirm_Click(object sender, RoutedEventArgs e)
    {
        if (_answered) return;

        var selected = _optionButtons.Where(b => b.IsChecked == true).Select(b => b.Tag?.ToString() ?? "").ToList();
        if (selected.Count == 0)
        {
            MessageBox.Show("Please select at least one answer.", "No Selection");
            return;
        }

        _answered = true;
        int cardIdx = _session.QuestionOrder[_session.CurrentIndex];
        var card = _deck.Cards[cardIdx];

        // Determine correct options text
        var correctSet = card.CorrectAnswers.Select(a => a.Trim()).ToHashSet();
        var correctOpts = card.Options.Where(opt =>
        {
            var trimmed = opt.Trim();
            // Full-text match
            if (correctSet.Contains(trimmed)) return true;
            
            // Letter match
            if (trimmed.Length > 0 && char.IsLetter(trimmed[0]))
            {
                var letter = trimmed[0].ToString().ToUpper();
                return correctSet.Any(c => c.Length == 1 && c.ToUpper() == letter);
            }
            return false;
        }).ToHashSet();

        bool isCorrect = selected.Count == correctOpts.Count && selected.All(s => correctOpts.Contains(s));

        // Highlight buttons
        foreach (var btn in _optionButtons)
        {
            btn.IsEnabled = false;
            var optText = btn.Tag?.ToString() ?? "";
            if (correctOpts.Contains(optText))
            {
                // Correct option → green
                var bd = FindBorderInTemplate(btn);
                if (bd != null) { bd.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#D1FAE5")); bd.BorderBrush = (Brush)FindResource("SuccessBrush"); }
            }
            else if (btn.IsChecked == true)
            {
                // Wrong selection → red
                var bd = FindBorderInTemplate(btn);
                if (bd != null) { bd.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FEE2E2")); bd.BorderBrush = (Brush)FindResource("DangerBrush"); }
            }
        }

        // Update score
        if (isCorrect) { _session.CorrectCount++; card.Status = 2; }
        else { _session.WrongCount++; card.Status = 1; }

        // Save
        _session.Answers[_session.CurrentIndex.ToString()] = selected;
        StorageService.SaveDecks(_app.Decks);

        ConfirmBtn.Visibility = Visibility.Collapsed;
        NextBtn.Visibility = Visibility.Visible;

        QuizProgress.Text = $"Q{_session.CurrentIndex + 1}/{_session.QuestionOrder.Count}  ·  ✅{_session.CorrectCount}  ❌{_session.WrongCount}";
    }

    private Border? FindBorderInTemplate(System.Windows.Controls.Control ctrl)
    {
        var template = ctrl.Template;
        return template?.FindName("bd", ctrl) as Border;
    }

    private void Next_Click(object sender, RoutedEventArgs e)
    {
        _session.CurrentIndex++;
        _session.UpdatedAt = DateTime.Now.ToString("o");
        StorageService.SaveQuizSession(_session);
        ShowQuestion();
    }

    private void ShowResults()
    {
        QuizPanel.Visibility = Visibility.Collapsed;
        ResultsPanel.Visibility = Visibility.Visible;

        int total = _session.CorrectCount + _session.WrongCount;
        double pct = total > 0 ? (_session.CorrectCount * 100.0 / total) : 0;
        ScoreLbl.Text = $"{pct:F0}% Score";
        ScoreDetailLbl.Text = $"✅ Correct: {_session.CorrectCount}    ❌ Wrong: {_session.WrongCount}    📊 Total: {total}";

        // Delete completed session
        StorageService.DeleteQuizSession(_deck.DeckId);
    }

    private void ExitSave_Click(object sender, RoutedEventArgs e)
    {
        if (!_session.IsComplete)
        {
            _session.UpdatedAt = DateTime.Now.ToString("o");
            StorageService.SaveQuizSession(_session);
        }
        StorageService.SaveDecks(_app.Decks);
        _app.ShowHome();
    }

    private void QuizAgain_Click(object sender, RoutedEventArgs e)
    {
        foreach (var c in _deck.Cards) { if (c.Status != 0) c.Status = 0; }
        StorageService.SaveDecks(_app.Decks);
        _app.ShowQuiz(_deck);
    }

    private void Home_Click(object sender, RoutedEventArgs e) => _app.ShowHome();
}
