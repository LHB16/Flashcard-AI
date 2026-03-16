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
    private string _videoPath = "";
    private List<string> _imageFiles = new();
    
    private static readonly HashSet<string> ImageExts = new() { ".png", ".jpg", ".jpeg", ".webp", ".bmp" };
    private static readonly HashSet<string> VideoExts = new() { ".mp4", ".avi", ".mkv", ".mov" };

    public ScanPage(MainWindow app)
    {
        InitializeComponent();
        _app = app;
    }

    private void Back_Click(object sender, RoutedEventArgs e) => _app.ShowHome();

    private void BrowseFolder_Click(object sender, RoutedEventArgs e)
    {
        using var fbd = new System.Windows.Forms.FolderBrowserDialog
        {
            Description = "Select Image Folder"
        };

        if (fbd.ShowDialog() == System.Windows.Forms.DialogResult.OK)
        {
            _folderPath = fbd.SelectedPath;
            _videoPath = ""; // reset video
            _imageFiles = Directory.GetFiles(_folderPath)
                .Where(f => ImageExts.Contains(Path.GetExtension(f).ToLower()))
                .OrderBy(f => f)
                .ToList();

            SourceLbl.Text = Path.GetFileName(_folderPath);
            FileCountLbl.Text = $"Found {_imageFiles.Count} images";
            FileCountLbl.Foreground = _imageFiles.Count > 0
                ? (SolidColorBrush)FindResource("SuccessBrush")
                : (SolidColorBrush)FindResource("DangerBrush");

            if (string.IsNullOrEmpty(DeckNameBox.Text))
                DeckNameBox.Text = Path.GetFileName(_folderPath);
        }
    }

    private void BrowseVideo_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Title = "Select Video File",
            Filter = "Video Files|*.mp4;*.avi;*.mkv;*.mov|All Files|*.*"
        };

        if (dialog.ShowDialog() == true)
        {
            _videoPath = dialog.FileName;
            _folderPath = ""; // reset folder
            _imageFiles.Clear();

            SourceLbl.Text = Path.GetFileName(_videoPath);
            FileCountLbl.Text = "Will extract frames on start";
            FileCountLbl.Foreground = (SolidColorBrush)FindResource("SuccessBrush");

            if (string.IsNullOrEmpty(DeckNameBox.Text))
                DeckNameBox.Text = Path.GetFileNameWithoutExtension(_videoPath);
        }
    }

    private void Start_Click(object sender, RoutedEventArgs e)
    {
        if (_imageFiles.Count == 0 && string.IsNullOrEmpty(_videoPath))
        {
            MessageBox.Show("Please select an image folder or a video file first.", "Error",
                MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        var deckName = string.IsNullOrWhiteSpace(DeckNameBox.Text) ? "Untitled Deck" : DeckNameBox.Text.Trim();
        var dialog = new ScanAssignDialog(_app, _imageFiles, deckName, _videoPath);
        dialog.Owner = _app;
        dialog.ShowDialog();
    }
}
