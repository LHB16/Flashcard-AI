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

public partial class HomePage : Page
{
    private readonly MainWindow _app;

    public HomePage(MainWindow app)
    {
        InitializeComponent();
        _app = app;
    }

    public void Refresh()
    {
        RebuildScans();
        RebuildDecks();
        UpdateAuthUI();
    }

    private async void UpdateAuthUI()
    {
        if (_app.AuthService.IsLoggedIn)
        {
            AuthBtn.Content = "Logout Drive";
            SyncBtn.IsEnabled = true;

            var email = await _app.AuthService.GetUserEmailAsync();
            if (!string.IsNullOrEmpty(email))
            {
                AuthBtn.Content = $"Logout ({email})";
            }
        }
        else
        {
            AuthBtn.Content = "Login Drive";
            SyncBtn.IsEnabled = false;
        }
    }

    private async void AuthBtn_Click(object sender, RoutedEventArgs e)
    {
        if (_app.AuthService.IsLoggedIn)
        {
            _app.AuthService.Logout();
            UpdateAuthUI();
        }
        else
        {
            SyncStatusLbl.Text = "Đang đăng nhập...";
            var success = await _app.AuthService.LoginAsync();
            SyncStatusLbl.Text = "";
            UpdateAuthUI();
            if (!success)
                MessageBox.Show("Đăng nhập thất bại.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void SyncBtn_Click(object sender, RoutedEventArgs e)
    {
        SyncBtn.IsEnabled = false;
        SyncStatusLbl.Text = "Đang đồng bộ...";
        SyncStatusLbl.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3B82F6"));

        var (success, msg) = await _app.SyncService.PerformFullSyncAsync();

        if (success)
        {
            SyncStatusLbl.Text = $"✅ {msg}";
            SyncStatusLbl.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(ThemeColors.Success));
            _app.Decks = StorageService.LoadDecks();
            Refresh();
        }
        else
        {
            SyncStatusLbl.Text = $"❌ {msg}";
            SyncStatusLbl.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(ThemeColors.Danger));
        }
        SyncBtn.IsEnabled = true;

        await Task.Delay(5000);
        SyncStatusLbl.Text = "";
    }

    private void ApiKeys_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new ApiKeyDialog(_app);
        dialog.Owner = _app;
        dialog.ShowDialog();
    }

    private void NewScan_Click(object sender, RoutedEventArgs e) => _app.ShowScan();

    private void SearchBox_TextChanged(object sender, TextChangedEventArgs e) => RebuildDecks();

    // ─── Scans ───
    private void RebuildScans()
    {
        ScansPanel.Children.Clear();
        if (_app.ActiveScans.Count == 0) { ScansPanel.Visibility = Visibility.Collapsed; return; }
        ScansPanel.Visibility = Visibility.Visible;

        var header = new TextBlock { Text = "🔄  Active Scans", FontSize = 14, FontWeight = FontWeights.Bold,
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(ThemeColors.Success)), Margin = new Thickness(0,0,0,5) };
        ScansPanel.Children.Add(header);

        foreach (var scan in _app.ActiveScans.ToList())
        {
            var border = new Border { Background = (SolidColorBrush)FindResource("Surface2Brush"),
                CornerRadius = new CornerRadius(8), Margin = new Thickness(0,4,0,4), Padding = new Thickness(15,10,15,10) };
            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var info = new StackPanel();
            info.Children.Add(new TextBlock { Text = scan.DeckName, FontSize = 14, FontWeight = FontWeights.Bold,
                Foreground = (SolidColorBrush)FindResource("TextBrush") });

            var statusRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0,4,0,4) };
            var pb = new ProgressBar { Width = 160, Height = 8, Value = scan.ProgressFrac * 100,
                Foreground = (SolidColorBrush)FindResource("AccentBrush") };
            statusRow.Children.Add(pb);
            statusRow.Children.Add(new TextBlock { Text = $"  {scan.ProgressText}", FontSize = 11,
                Foreground = (SolidColorBrush)FindResource("TextDimBrush"), VerticalAlignment = VerticalAlignment.Center });
            statusRow.Children.Add(new TextBlock { Text = $"  •  {scan.Status}", FontSize = 11, FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(scan.StatusColor)),
                VerticalAlignment = VerticalAlignment.Center });
            info.Children.Add(statusRow);

            // Mini log
            var logBox = new TextBox { Text = scan.LogText, FontSize = 10, FontFamily = new FontFamily("Consolas"),
                Height = 70, IsReadOnly = true, TextWrapping = TextWrapping.Wrap,
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#F8F9FC")),
                Foreground = (SolidColorBrush)FindResource("TextDimBrush"), BorderThickness = new Thickness(0),
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Margin = new Thickness(0,6,0,0) };
            info.Children.Add(logBox);
            Grid.SetColumn(info, 0);
            grid.Children.Add(info);

            // Buttons
            var btns = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            if (scan.IsFinished)
            {
                var dismissBtn = new Button { Content = "Dismiss", Style = (Style)FindResource("SubtleBtn"), Padding = new Thickness(10,4,10,4) };
                var s = scan;
                dismissBtn.Click += (_, _) => { _app.ActiveScans.Remove(s); Refresh(); };
                btns.Children.Add(dismissBtn);
            }
            else
            {
                if (scan.IsPaused)
                {
                    var resumeBtn = new Button { Content = "▶ Resume", Style = (Style)FindResource("SuccessBtn"), Padding = new Thickness(10,4,10,4) };
                    var s = scan;
                    resumeBtn.Click += (_, _) => { s.Resume(); Refresh(); };
                    btns.Children.Add(resumeBtn);
                }
                else
                {
                    var pauseBtn = new Button { Content = "⏸ Pause", Style = (Style)FindResource("WarningBtn"), Padding = new Thickness(10,4,10,4) };
                    var s = scan;
                    pauseBtn.Click += (_, _) => { s.Pause(); Refresh(); };
                    btns.Children.Add(pauseBtn);
                }
                var stopBtn = new Button { Content = "⏹ Stop", Style = (Style)FindResource("DangerBtn"), Padding = new Thickness(10,4,10,4), Margin = new Thickness(4,0,0,0) };
                var sc = scan;
                stopBtn.Click += (_, _) => { sc.Stop(); Refresh(); };
                btns.Children.Add(stopBtn);
            }
            Grid.SetColumn(btns, 1);
            grid.Children.Add(btns);

            border.Child = grid;
            ScansPanel.Children.Add(border);
        }
    }

    // ─── Decks ───
    private void RebuildDecks()
    {
        DeckList.Children.Clear();
        var query = SearchBox?.Text?.ToLower() ?? "";
        var decks = _app.Decks.Where(d => d.Name.ToLower().Contains(query)).Reverse().ToList();

        if (decks.Count == 0)
        {
            DeckList.Children.Add(new TextBlock
            {
                Text = "No decks yet.\nClick '+ New Scan' to create your first deck from images!",
                FontSize = 15, Foreground = (SolidColorBrush)FindResource("TextDimBrush"),
                TextAlignment = TextAlignment.Center, Margin = new Thickness(0, 60, 0, 0)
            });
            return;
        }

        foreach (var deck in decks) DeckList.Children.Add(CreateDeckCard(deck));
    }

    private Border CreateDeckCard(Deck deck)
    {
        var border = new Border { Background = (SolidColorBrush)FindResource("SurfaceBrush"),
            CornerRadius = new CornerRadius(12), Height = 110, Margin = new Thickness(0,5,0,5) };
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        // Left: info
        var info = new StackPanel { Margin = new Thickness(15,10,0,10) };
        info.Children.Add(new TextBlock { Text = deck.Name, FontSize = 15, FontWeight = FontWeights.Bold,
            Foreground = (SolidColorBrush)FindResource("TextBrush") });

        var dateStr = deck.CreatedAt.Length >= 10 ? deck.CreatedAt.Substring(0, 10) : "";
        var mc = deck.Cards.Count(c => c.QuestionType == QuestionType.MultipleChoice);
        info.Children.Add(new TextBlock { Text = $"{deck.CardCount} cards  •  {mc} multi-answer  •  {dateStr}",
            FontSize = 12, Foreground = (SolidColorBrush)FindResource("TextDimBrush") });

        // Progress bar
        if (deck.CardCount > 0)
        {
            int green = deck.Cards.Count(c => c.Status == 2);
            int orange = deck.Cards.Count(c => c.Status == 1);
            int gray = deck.Cards.Count(c => c.Status == 0);

            var progRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0,6,0,0) };
            progRow.Children.Add(new TextBlock { Text = "Progress:", FontSize = 11, FontWeight = FontWeights.Bold,
                Foreground = (SolidColorBrush)FindResource("TextDimBrush"), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0,0,6,0) });

            // Bar
            var barGrid = new Grid { Width = 120, Height = 10, ClipToBounds = true };
            var barBg = new Border { Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E2E8F0")), CornerRadius = new CornerRadius(5) };
            barGrid.Children.Add(barBg);

            var barPanel = new StackPanel { Orientation = Orientation.Horizontal };
            int wG = (int)((double)green / deck.CardCount * 120);
            int wO = (int)((double)orange / deck.CardCount * 120);
            if (wG > 0) barPanel.Children.Add(new Border { Width = wG, Background = (SolidColorBrush)FindResource("SuccessBrush") });
            if (wO > 0) barPanel.Children.Add(new Border { Width = wO, Background = (SolidColorBrush)FindResource("WarningBrush") });
            barGrid.Children.Add(barPanel);
            progRow.Children.Add(barGrid);

            progRow.Children.Add(new TextBlock { Text = $"  ✅{green}  ❌{orange}  ⚪{gray}", FontSize = 10,
                Foreground = (SolidColorBrush)FindResource("TextDimBrush"), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(10,0,0,0) });
            info.Children.Add(progRow);
        }
        Grid.SetColumn(info, 0);
        grid.Children.Add(info);

        // Right: buttons
        var btns = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0,0,12,0) };
        var studyBtn = new Button { Content = "Study ▶", Style = (Style)FindResource("SuccessBtn"), Padding = new Thickness(10,6,10,6), Margin = new Thickness(3,0,3,0) };
        studyBtn.Click += (_, _) => _app.ShowStudy(deck);
        btns.Children.Add(studyBtn);

        var quizBtn = new Button { Content = "Quiz 📝", Style = (Style)FindResource("PrimaryBtn"), Padding = new Thickness(10,6,10,6), Margin = new Thickness(3,0,3,0) };
        quizBtn.Click += (_, _) => _app.ShowQuiz(deck);
        btns.Children.Add(quizBtn);

        var viewBtn = new Button { Content = "View", Style = (Style)FindResource("PrimaryBtn"), Padding = new Thickness(10,6,10,6), Margin = new Thickness(3,0,3,0) };
        viewBtn.Click += (_, _) => _app.ShowDeck(deck);
        btns.Children.Add(viewBtn);

        var delBtn = new Button { Content = "✕", Style = (Style)FindResource("DangerBtn"), Padding = new Thickness(8,6,8,6), Margin = new Thickness(3,0,3,0) };
        delBtn.Click += (_, _) =>
        {
            if (MessageBox.Show($"Delete '{deck.Name}'? This cannot be undone.", "Delete Deck",
                MessageBoxButton.YesNo, MessageBoxImage.Warning) == MessageBoxResult.Yes)
            {
                _app.Decks.RemoveAll(d => d.DeckId == deck.DeckId);
                StorageService.SaveDecks(_app.Decks);
                Refresh();
            }
        };
        btns.Children.Add(delBtn);
        Grid.SetColumn(btns, 1);
        grid.Children.Add(btns);

        border.Child = grid;
        return border;
    }
}
