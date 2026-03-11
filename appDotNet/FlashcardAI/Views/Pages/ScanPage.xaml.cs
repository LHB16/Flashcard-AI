using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using FlashcardAI.Helpers;
using FlashcardAI.Views.Dialogs;

namespace FlashcardAI.Views.Pages;

public partial class ScanPage : Page
{
    private readonly MainWindow _app;
    private string _folderPath = "";
    private List<string> _imageFiles = new();

    private static readonly HashSet<string> ImageExts = new() { ".png", ".jpg", ".jpeg", ".webp", ".bmp" };

    public ScanPage(MainWindow app)
    {
        InitializeComponent();
        _app = app;
    }

    private void Back_Click(object sender, RoutedEventArgs e) => _app.ShowHome();

    private void Browse_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            // Use FolderPicker hack or use Microsoft.WindowsAPICodePack
            CheckFileExists = false,
            FileName = "Select Folder",
            Filter = "Folder|*.folder"
        };

        // Use FolderBrowserDialog equivalent
        using var fbd = new System.Windows.Forms.FolderBrowserDialog
        {
            Description = "Select Image Folder"
        };

        if (fbd.ShowDialog() == System.Windows.Forms.DialogResult.OK)
        {
            _folderPath = fbd.SelectedPath;
            _imageFiles = Directory.GetFiles(_folderPath)
                .Where(f => ImageExts.Contains(Path.GetExtension(f).ToLower()))
                .OrderBy(f => f)
                .ToList();

            FolderLbl.Text = Path.GetFileName(_folderPath);
            FileCountLbl.Text = $"Found {_imageFiles.Count} images";
            FileCountLbl.Foreground = _imageFiles.Count > 0
                ? (SolidColorBrush)FindResource("SuccessBrush")
                : (SolidColorBrush)FindResource("DangerBrush");

            if (string.IsNullOrEmpty(DeckNameBox.Text))
                DeckNameBox.Text = Path.GetFileName(_folderPath);
        }
    }

    private void Start_Click(object sender, RoutedEventArgs e)
    {
        if (_imageFiles.Count == 0)
        {
            MessageBox.Show("Please select a folder with images first.", "Error",
                MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        var deckName = string.IsNullOrWhiteSpace(DeckNameBox.Text) ? "Untitled Deck" : DeckNameBox.Text.Trim();
        var dialog = new ScanAssignDialog(_app, _imageFiles, deckName);
        dialog.Owner = _app;
        dialog.ShowDialog();
    }
}
