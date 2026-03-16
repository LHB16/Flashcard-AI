using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using FlashcardAI.Helpers;
using FlashcardAI.Services;

namespace FlashcardAI.Views.Dialogs;

public partial class ScanAssignDialog : Window
{
    private readonly MainWindow _app;
    private readonly List<string> _imageFiles;
    private readonly string _deckName;
    private readonly string _videoPath;
    private readonly Dictionary<string, ToggleButton> _checkMap = new();

    public ScanAssignDialog(MainWindow app, List<string> imageFiles, string deckName, string videoPath = "")
    {
        InitializeComponent();
        _app = app;
        _imageFiles = imageFiles;
        _deckName = deckName;
        _videoPath = videoPath;
        BuildKeyList();
    }

    private void BuildKeyList()
    {
        var allKeys = StorageService.GetApiKeys(_app.Settings);
        var aktmp = StorageService.GetActiveKeys(_app.Settings);
        var activeSettingsKeys = aktmp != null ? new HashSet<string>(aktmp) : new HashSet<string>(allKeys);
        var usedKeys = _app.GetUsedKeys();

        for (int i = 0; i < allKeys.Count; i++)
        {
            var key = allKeys[i];
            var masked = key.Length > 8 ? $"...{key[^8..]}" : "****";
            var inUse = usedKeys.Contains(key);

            var row = new Border { Background = (Brush)FindResource("Surface2Brush"),
                CornerRadius = new CornerRadius(8), Margin = new Thickness(0,3,0,3), Padding = new Thickness(8,8,8,8) };
            var dock = new DockPanel();

            var cb = new CheckBox
            {
                Content = $"Key {i + 1}: {masked}",
                IsChecked = activeSettingsKeys.Contains(key) && !inUse,
                Foreground = inUse ? (Brush)FindResource("TextDimBrush") : (Brush)FindResource("TextBrush"),
                FontSize = 13, VerticalContentAlignment = VerticalAlignment.Center
            };
            if (inUse) cb.IsEnabled = false;
            _checkMap[key] = cb;
            dock.Children.Add(cb);

            if (inUse)
            {
                var useLbl = new TextBlock { Text = "[In Use]", FontSize = 11, FontWeight = FontWeights.Bold,
                    Foreground = (Brush)FindResource("WarningBrush"), VerticalAlignment = VerticalAlignment.Center };
                DockPanel.SetDock(useLbl, Dock.Right);
                dock.Children.Add(useLbl);
            }

            row.Child = dock;
            KeyList.Children.Add(row);
        }
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => Close();

    private void Start_Click(object sender, RoutedEventArgs e)
    {
        var selected = _checkMap.Where(kv => kv.Value.IsChecked == true).Select(kv => kv.Key).ToList();
        if (selected.Count == 0)
        {
            MessageBox.Show("You must select at least one API key to start the scan.", "Error",
                MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        var parallel = ParallelCheck.IsChecked == true;

        var scan = new BackgroundScan(
            _imageFiles, _deckName, selected, parallel,
            dispatch: action => Dispatcher.Invoke(action),
            onRefresh: () =>
            {
                if (MainWindow.Instance != null)
                {
                    MainWindow.Instance.Decks = StorageService.LoadDecks();
                    MainWindow.Instance.ShowHome();
                }
            },
            videoPath: _videoPath
        );
        scan.AppDecks = _app.Decks;
        _app.ActiveScans.Add(scan);
        scan.Start();

        _app.ShowHome();
        Close();
    }
}
