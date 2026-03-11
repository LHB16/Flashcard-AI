using System.Windows;
using System.Windows.Media;
using FlashcardAI.Helpers;
using FlashcardAI.Models;
using FlashcardAI.Services;

namespace FlashcardAI.Views.Dialogs;

public partial class ExportDialog : Window
{
    private readonly MainWindow _app;
    private readonly Deck _deck;

    public ExportDialog(MainWindow app, Deck deck)
    {
        InitializeComponent();
        _app = app;
        _deck = deck;
        UpdatePreview();
    }

    private string GetSelectedFormat()
    {
        if (RbSimple.IsChecked == true) return "simple";
        if (RbCompact.IsChecked == true) return "compact";
        if (RbSafe.IsChecked == true) return "safe";
        return "full";
    }

    private void Format_Changed(object sender, RoutedEventArgs e)
    {
        UpdatePreview();
    }

    private void UpdatePreview()
    {
        var fmt = GetSelectedFormat();
        if (fmt == "safe")
            HintLbl.Text = "⚠ Safe mode → Quizlet Import: Between Term & Definition = Custom → {[(DapAn)]}    Between Cards = Custom → {[(CauHoi)]}";
        else
            HintLbl.Text = "";

        PreviewBox.Text = ExportService.GetQuizletPreview(_deck, fmt, 5);
    }

    private void Export_Click(object sender, RoutedEventArgs e)
    {
        var defaultName = $"{_deck.Name.Replace(" ", "_")}_quizlet.txt";
        var sfd = new Microsoft.Win32.SaveFileDialog
        {
            Title = "Save Quizlet File",
            FileName = defaultName,
            DefaultExt = ".txt",
            Filter = "Text files (*.txt)|*.txt|All files (*.*)|*.*"
        };

        if (sfd.ShowDialog() == true)
        {
            var fmt = GetSelectedFormat();
            var msg = ExportService.ExportToQuizlet(_deck, sfd.FileName, fmt);
            MessageBox.Show(msg, "Export Complete", MessageBoxButton.OK, MessageBoxImage.Information);
            Close();
        }
    }
}
