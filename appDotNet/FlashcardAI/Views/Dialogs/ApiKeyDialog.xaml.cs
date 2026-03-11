using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using FlashcardAI.Helpers;
using FlashcardAI.Services;

namespace FlashcardAI.Views.Dialogs;

public partial class ApiKeyDialog : Window
{
    private readonly MainWindow _app;
    private List<string> _keys;
    private HashSet<string> _activeKeys;
    private Dictionary<string, TextBlock> _statusLabels = new();
    private Dictionary<string, ToggleButton> _checkBoxes = new();
    private bool _showKeys = false;

    public ApiKeyDialog(MainWindow app)
    {
        InitializeComponent();
        _app = app;
        _keys = StorageService.GetApiKeys(app.Settings);
        var aktmp = StorageService.GetActiveKeys(app.Settings);
        _activeKeys = aktmp != null ? new HashSet<string>(aktmp) : new HashSet<string>(_keys);
        RefreshList();
    }

    private void RefreshList()
    {
        KeyList.Children.Clear();
        _statusLabels.Clear();
        _checkBoxes.Clear();
        var usedKeys = _app.GetUsedKeys();

        if (_keys.Count == 0)
        {
            KeyList.Children.Add(new TextBlock { Text = "No keys yet. Add your first key above.",
                Foreground = (Brush)FindResource("TextDimBrush"), Margin = new Thickness(0,20,0,0), HorizontalAlignment = HorizontalAlignment.Center });
            return;
        }

        for (int i = 0; i < _keys.Count; i++)
        {
            var key = _keys[i];
            var masked = key.Length > 8 ? $"...{key[^8..]}" : "****";
            var inUse = usedKeys.Contains(key);

            var row = new Border { Background = (Brush)FindResource("Surface2Brush"),
                CornerRadius = new CornerRadius(8), Margin = new Thickness(0,3,0,3), Padding = new Thickness(8,6,8,6) };
            var dockPanel = new DockPanel();

            // Checkbox
            var cb = new ToggleButton
            {
                Content = $"Key {i + 1}: {masked}",
                IsChecked = _activeKeys.Contains(key),
                Foreground = inUse ? (Brush)FindResource("TextDimBrush") : (Brush)FindResource("TextBrush"),
                FontSize = 13, Padding = new Thickness(4), Background = Brushes.Transparent, BorderThickness = new Thickness(0)
            };
            if (inUse) cb.IsEnabled = false;
            _checkBoxes[key] = cb;
            dockPanel.Children.Add(cb);

            if (inUse)
            {
                var useLbl = new TextBlock { Text = "[In Use]", FontSize = 11, FontWeight = FontWeights.Bold,
                    Foreground = (Brush)FindResource("WarningBrush"), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(6,0,0,0) };
                DockPanel.SetDock(useLbl, Dock.Left);
                dockPanel.Children.Add(useLbl);
            }

            // Right side buttons
            var statusLbl = new TextBlock { Text = "", FontSize = 11, Width = 60, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(4,0,0,0) };
            _statusLabels[key] = statusLbl;
            DockPanel.SetDock(statusLbl, Dock.Right);
            dockPanel.Children.Add(statusLbl);

            var testBtn = new Button { Content = "Test", Style = (Style)FindResource("PrimaryBtn"),
                Padding = new Thickness(8,3,8,3), FontSize = 11 };
            var k = key;
            testBtn.Click += async (_, _) => await TestKey(k);
            DockPanel.SetDock(testBtn, Dock.Right);
            dockPanel.Children.Add(testBtn);

            var copyBtn = new Button { Content = "📋", Style = (Style)FindResource("SubtleBtn"),
                Padding = new Thickness(6,3,6,3), FontSize = 11, Margin = new Thickness(0,0,4,0) };
            copyBtn.Click += (_, _) => { Clipboard.SetText(k); StatusLbl.Text = "Key copied!"; StatusLbl.Foreground = (Brush)FindResource("SuccessBrush"); };
            DockPanel.SetDock(copyBtn, Dock.Right);
            dockPanel.Children.Add(copyBtn);

            var idx = i;
            if (!inUse)
            {
                var delBtn = new Button { Content = "✕", Style = (Style)FindResource("DangerBtn"),
                    Padding = new Thickness(6,3,6,3), FontSize = 11, Margin = new Thickness(0,0,4,0) };
                delBtn.Click += (_, _) => { _keys.RemoveAt(idx); _activeKeys.Remove(k); RefreshList(); };
                DockPanel.SetDock(delBtn, Dock.Right);
                dockPanel.Children.Add(delBtn);
            }

            row.Child = dockPanel;
            KeyList.Children.Add(row);
        }
    }

    private void ShowHide_Click(object sender, RoutedEventArgs e)
    {
        _showKeys = !_showKeys;
        // Simplified — in a full implementation, toggle key visibility
        ShowHideBtn.Content = _showKeys ? "🙈" : "👁";
    }

    private void Add_Click(object sender, RoutedEventArgs e)
    {
        var key = KeyEntry.Text.Trim();
        if (string.IsNullOrEmpty(key)) return;
        if (_keys.Contains(key))
        {
            StatusLbl.Text = "Key already exists.";
            StatusLbl.Foreground = (Brush)FindResource("WarningBrush");
            return;
        }
        _keys.Add(key);
        _activeKeys.Add(key);
        KeyEntry.Clear();
        RefreshList();
        StatusLbl.Text = "Key added.";
        StatusLbl.Foreground = (Brush)FindResource("SuccessBrush");
    }

    private async Task TestKey(string key)
    {
        if (!_statusLabels.ContainsKey(key)) return;
        _statusLabels[key].Text = "...";
        _statusLabels[key].Foreground = (Brush)FindResource("TextDimBrush");

        var svc = new GeminiService();
        var (ok, msg) = await svc.ValidateKey(key);

        if (_statusLabels.ContainsKey(key))
        {
            _statusLabels[key].Text = ok ? "🟢 Live" : "🔴 Die";
            _statusLabels[key].Foreground = ok
                ? (Brush)FindResource("SuccessBrush")
                : (Brush)FindResource("DangerBrush");
        }
    }

    private async void TestAll_Click(object sender, RoutedEventArgs e)
    {
        if (_keys.Count == 0) return;
        StatusLbl.Text = $"Testing {_keys.Count} keys...";
        StatusLbl.Foreground = (Brush)FindResource("TextDimBrush");

        var tasks = _keys.Select(k => TestKey(k)).ToArray();
        await Task.WhenAll(tasks);

        StatusLbl.Text = "All tests done.";
        StatusLbl.Foreground = (Brush)FindResource("SuccessBrush");
    }

    private void SaveClose_Click(object sender, RoutedEventArgs e)
    {
        // Compute active keys
        var active = _keys.Where(k => _checkBoxes.ContainsKey(k) && _checkBoxes[k].IsChecked == true).ToList();

        // Update settings
        var newSettings = new Dictionary<string, object?>
        {
            ["api_keys"] = _keys,
            ["active_keys"] = active,
        };
        // Preserve other settings
        foreach (var kv in _app.Settings)
        {
            if (kv.Key != "api_keys" && kv.Key != "active_keys")
            {
                newSettings[kv.Key] = kv.Value.ValueKind switch
                {
                    JsonValueKind.String => kv.Value.GetString(),
                    JsonValueKind.Number => kv.Value.GetInt32(),
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    _ => kv.Value.GetRawText()
                };
            }
        }
        StorageService.SaveSettings(newSettings);
        _app.Settings = StorageService.LoadSettingsRaw();

        if (active.Count > 0)
            _app.GeminiService.SetKeys(active);

        DialogResult = true;
        Close();
    }
}
