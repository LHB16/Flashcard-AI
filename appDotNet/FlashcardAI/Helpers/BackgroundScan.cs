using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using FlashcardAI.Helpers;
using FlashcardAI.Models;
using FlashcardAI.Services;

namespace FlashcardAI.Helpers;

/// <summary>
/// BackgroundScan worker — manages a background image scanning task.
/// </summary>
public class BackgroundScan : ViewModelBase
{
    private readonly Action<Action> _dispatch; // UI dispatcher
    private readonly Action _onRefresh;        // callback to refresh home

    public string Id { get; } = Guid.NewGuid().ToString();
    public List<string> ImageFiles { get; }
    public string DeckName { get; }
    public List<string> Keys { get; }
    public bool Parallel { get; }
    public GeminiService GeminiSvc { get; } = new();

    private CancellationTokenSource _cts = new();
    private ManualResetEventSlim _pauseEvent = new(true); // starts unpaused

    private string _status = "Starting...";
    public string Status { get => _status; set => SetProperty(ref _status, value); }

    private string _statusColor = ThemeColors.TextDim;
    public string StatusColor { get => _statusColor; set => SetProperty(ref _statusColor, value); }

    private string _progressText = "0 / 0";
    public string ProgressText { get => _progressText; set => SetProperty(ref _progressText, value); }

    private double _progressFrac = 0;
    public double ProgressFrac { get => _progressFrac; set => SetProperty(ref _progressFrac, value); }

    private int _success = 0;
    public int SuccessCount { get => _success; set => SetProperty(ref _success, value); }

    private int _failed = 0;
    public int FailedCount { get => _failed; set => SetProperty(ref _failed, value); }

    private bool _isFinished = false;
    public bool IsFinished { get => _isFinished; set => SetProperty(ref _isFinished, value); }

    private bool _isPaused = false;
    public bool IsPaused { get => _isPaused; set => SetProperty(ref _isPaused, value); }

    private string _logText = "";
    public string LogText { get => _logText; set => SetProperty(ref _logText, value); }

    public List<Flashcard> Results { get; } = new();
    private List<string> _logLines = new();

    // Reference to app data
    public List<Deck> AppDecks { get; set; } = new();

    public BackgroundScan(List<string> imageFiles, string deckName, List<string> keys,
        bool parallel, Action<Action> dispatch, Action onRefresh)
    {
        ImageFiles = imageFiles;
        DeckName = deckName;
        Keys = keys;
        Parallel = parallel;
        _dispatch = dispatch;
        _onRefresh = onRefresh;
    }

    private void Log(string msg)
    {
        var ts = DateTime.Now.ToString("HH:mm:ss");
        _logLines.Add($"[{ts}] {msg}");
        if (_logLines.Count > 80) _logLines = _logLines.Skip(_logLines.Count - 80).ToList();
        _dispatch(() => LogText = string.Join("\n", _logLines.TakeLast(6)));
    }

    public void Start()
    {
        Task.Run(RunAsync);
    }

    private async Task RunAsync()
    {
        // Step 1: Validate keys
        _dispatch(() => Status = "Validating keys...");
        Log($"🔑 Validating {Keys.Count} key(s)...");

        var aliveKeys = await GeminiSvc.ValidateKeysParallel(Keys, msg => Log(msg));

        if (aliveKeys.Count == 0)
        {
            _dispatch(() =>
            {
                Status = "Failed: No alive keys";
                StatusColor = ThemeColors.Danger;
                IsFinished = true;
            });
            Log("❌ No alive API keys found. Aborted.");
            _dispatch(_onRefresh);
            return;
        }

        Log($"✅ {aliveKeys.Count} key(s) alive. Starting scan...");
        GeminiSvc.SetKeys(aliveKeys);
        _dispatch(() => { Status = "Scanning"; StatusColor = ThemeColors.Success; });

        int total = ImageFiles.Count;
        var modeLabel = Parallel ? "⚡ PARALLEL" : "📁 Sequential";
        int nBatches = (total + 49) / 50;
        Log($"{modeLabel}: {total} images → {nBatches} PDF batch(es)");

        void OnProgress(int idx, int tot, Flashcard? card)
        {
            _dispatch(() =>
            {
                ProgressFrac = (double)idx / tot;
                ProgressText = $"{idx} / {tot}";
                if (card != null) { SuccessCount++; Results.Add(card); }
                else FailedCount++;
                if (!_cts.IsCancellationRequested && !IsPaused)
                    Status = $"✓ {SuccessCount}  ✗ {FailedCount}";
            });
        }

        GeminiSvc.OnLog = msg => Log(msg);
        GeminiSvc.StopToken = _cts.Token;

        try
        {
            if (Parallel && aliveKeys.Count > 1)
            {
                await GeminiSvc.ProcessImagesParallel(
                    ImageFiles, aliveKeys,
                    onProgress: OnProgress,
                    stopToken: _cts.Token,
                    pauseEvent: _pauseEvent);
            }
            else
            {
                await GeminiSvc.ProcessImagesAsPdfBatches(
                    ImageFiles,
                    onProgress: OnProgress,
                    stopToken: _cts.Token,
                    pauseEvent: _pauseEvent);
            }
        }
        catch (OperationCanceledException) { }

        if (_cts.IsCancellationRequested)
        {
            _dispatch(() => { Status = "Stopped"; StatusColor = ThemeColors.Danger; });
        }
        else
        {
            _dispatch(() => { Status = "Finished ✅"; StatusColor = ThemeColors.Success; });
            if (Results.Count > 0)
            {
                var deck = new Deck
                {
                    Name = DeckName,
                    Cards = Results.ToList(),
                    SourceFolder = "",
                    CreatedAt = DateTime.Now.ToString("o")
                };
                AppDecks.Add(deck);
                StorageService.SaveDecks(AppDecks);
            }
        }

        _dispatch(() => IsFinished = true);
        _dispatch(_onRefresh);

        // Auto-remove after 8 seconds
        await Task.Delay(8000);
        _dispatch(_onRefresh);
    }

    public void Pause()
    {
        _pauseEvent.Reset();
        _dispatch(() => { IsPaused = true; Status = "Paused ⏸"; StatusColor = ThemeColors.Warning; });
    }

    public void Resume()
    {
        _pauseEvent.Set();
        _dispatch(() => { IsPaused = false; Status = "Scanning"; StatusColor = ThemeColors.Success; });
    }

    public void Stop()
    {
        _cts.Cancel();
        _pauseEvent.Set(); // unblock if paused
        _dispatch(() => { Status = "Stopping..."; StatusColor = ThemeColors.Danger; });
    }
}
