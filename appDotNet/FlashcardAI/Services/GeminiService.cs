using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using FlashcardAI.Models;

namespace FlashcardAI.Services;

/// <summary>
/// Gemini API integration with round-robin key rotation.
/// Uses REST API directly via HttpClient.
/// Supports: single image, PDF batch, parallel multi-key processing.
/// </summary>
public class GeminiService
{
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromMinutes(5) };

    private const string ExtractionPrompt = """
        You are extracting a multiple-choice question from an exam image.

        === WHAT TO IGNORE ===
        - Logos, watermarks, school/course names, page numbers, headers, footers
        - Any decorative elements not part of the question or options

        === WHAT TO EXTRACT ===
        The question stem and ALL answer options. Note:
        - Options may be 2, 3, 4, 5 or more (not always A B C D)
        - May require single OR multiple correct answers
        - Options may be labeled with letters (A, B, C...) or numbers (1, 2, 3...)

        === SPECIAL CONTENT HANDLING ===
        - Code snippets, programming syntax, math formulas: preserve EXACTLY as written
        - Greek letters, arrows, symbols: preserve exactly
        - If an option is partially cut off or unclear, include visible text and append '[...]'

        === FINDING THE CORRECT ANSWER ===
        First, look for EXPLICIT clues: highlighted/bold/underlined/circled options, checkmarks, filled bubbles.
        If NO explicit clues, reason and infer the most likely correct answer(s).
        Set "inferred": true when you guessed. NEVER return ["Unknown"].

        === WHEN TO RETURN NOT_A_QUESTION ===
        Set question to "NOT_A_QUESTION" if: diagram only, blank page, logo/title only, explanation only.

        === OUTPUT FORMAT ===
        Return ONLY valid JSON:
        {
          "question": "the question text",
          "options": ["A. option", "B. option", "C. option"],
          "correct_answers": ["A"],
          "type": "single_choice",
          "inferred": false
        }
        """;

    private const string PdfBatchPrompt = """
        You are extracting multiple-choice questions from a PDF exam.
        Each PAGE contains ONE question. Process EVERY page in order.

        === WHAT TO IGNORE ===
        - Logos, watermarks, school/course names, page numbers, headers, footers

        === WHAT TO EXTRACT ===
        For each page: the question stem and ALL answer options.

        === SPECIAL CONTENT HANDLING ===
        - Code, math formulas, special symbols: preserve EXACTLY as written

        === FINDING THE CORRECT ANSWER ===
        Look for EXPLICIT clues first. If none, reason and infer.
        Set "inferred": true when guessed. NEVER use ["Unknown"].

        === WHEN A PAGE HAS NO QUESTION ===
        Set question to "NOT_A_QUESTION".

        === OUTPUT FORMAT ===
        Return ONLY a valid JSON array:
        [
          {
            "question": "question text",
            "options": ["A. text", "B. text"],
            "correct_answers": ["A"],
            "type": "single_choice",
            "inferred": false
          }
        ]
        """;

    public static readonly string[] ModelList =
    {
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-3-flash-preview",
        "gemini-3.1-flash-lite-preview",
        "gemini-flash-latest",
        "gemini-flash-lite-latest",
    };

    private const int SafeRpm = 8;
    public const int PdfBatchPages = 50;

    private List<string> _keys = new();
    private int _keyIndex = 0;
    private readonly object _lock = new();
    private string _activeModel = ModelList[0];
    public int StartFrom { get; set; } = 0;

    public Action<string>? OnLog { get; set; }
    public CancellationToken StopToken { get; set; } = CancellationToken.None;

    public void SetKeys(List<string> keys, int startFrom = 0)
    {
        lock (_lock)
        {
            _keys = keys.Where(k => !string.IsNullOrWhiteSpace(k)).Select(k => k.Trim()).ToList();
            _keyIndex = startFrom % Math.Max(_keys.Count, 1);
        }
    }

    public double RequestDelay
    {
        get
        {
            int n = Math.Max(_keys.Count, 1);
            return Math.Max(60.0 / SafeRpm / n, 1.0);
        }
    }

    private string? GetNextKey()
    {
        lock (_lock)
        {
            if (_keys.Count == 0) return null;
            var key = _keys[_keyIndex % _keys.Count];
            _keyIndex = (_keyIndex + 1) % _keys.Count;
            return key;
        }
    }

    private int GetKeyNum()
    {
        lock (_lock)
        {
            int n = _keys.Count;
            if (n == 0) return 0;
            return ((_keyIndex - 1 + n) % n) + 1;
        }
    }

    private void Log(string msg) => OnLog?.Invoke(msg);

    public static string MaskKey(string key) => key.Length >= 8 ? $"...{key[^8..]}" : "****";

    private async Task InterruptibleDelay(double seconds)
    {
        var step = TimeSpan.FromMilliseconds(500);
        var total = TimeSpan.FromSeconds(seconds);
        var elapsed = TimeSpan.Zero;
        while (elapsed < total)
        {
            var chunk = elapsed + step > total ? total - elapsed : step;
            try { await Task.Delay(chunk, StopToken); }
            catch (OperationCanceledException) { return; }
            elapsed += chunk;
        }
    }

    // ─── JSON cleaning ───
    private static string CleanJson(string text)
    {
        text = text.Trim();
        if (text.StartsWith("```"))
        {
            text = Regex.Replace(text, @"^```[a-z]*\n?", "");
            text = Regex.Replace(text, @"\n?```$", "");
        }
        return text.Trim();
    }

    private Flashcard? ParseSingle(string text, string imagePath)
    {
        text = CleanJson(text);
        Dictionary<string, JsonElement>? data;
        try { data = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(text); }
        catch
        {
            var m = Regex.Match(text, @"\{.*\}", RegexOptions.Singleline);
            if (!m.Success) return null;
            try { data = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(m.Value); }
            catch { return null; }
        }
        if (data == null) return null;

        var question = data.GetStringOr("question").Trim();
        if (string.IsNullOrEmpty(question) || question == "NOT_A_QUESTION") return null;

        bool inferred = data.TryGetValue("inferred", out var inf) &&
                        inf.ValueKind == JsonValueKind.True;
        string notes = inferred ? "⚠ Đáp án do AI suy luận (không có đáp án rõ trong ảnh)" : "";

        return new Flashcard
        {
            Question = question,
            Options = data.GetStringListOr("options"),
            CorrectAnswers = data.GetStringListOr("correct_answers"),
            QuestionType = data.GetStringOr("type") == "multiple_choice"
                ? QuestionType.MultipleChoice : QuestionType.SingleChoice,
            ImagePath = imagePath,
            Notes = notes,
        };
    }

    private List<Flashcard?> ParsePdfBatch(string text, List<string> imagePaths)
    {
        text = CleanJson(text);
        List<Dictionary<string, JsonElement>>? dataList;
        try { dataList = JsonSerializer.Deserialize<List<Dictionary<string, JsonElement>>>(text); }
        catch
        {
            var m = Regex.Match(text, @"\[.*\]", RegexOptions.Singleline);
            if (!m.Success) return new();
            try { dataList = JsonSerializer.Deserialize<List<Dictionary<string, JsonElement>>>(m.Value); }
            catch { return new(); }
        }
        if (dataList == null) return new();

        var results = new List<Flashcard?>();
        for (int i = 0; i < dataList.Count; i++)
        {
            var data = dataList[i];
            var imgPath = i < imagePaths.Count ? imagePaths[i] : "";
            var question = data.GetStringOr("question").Trim();
            if (string.IsNullOrEmpty(question) || question == "NOT_A_QUESTION")
            {
                results.Add(null);
                continue;
            }
            bool inferred = data.TryGetValue("inferred", out var inf) && inf.ValueKind == JsonValueKind.True;
            results.Add(new Flashcard
            {
                Question = question,
                Options = data.GetStringListOr("options"),
                CorrectAnswers = data.GetStringListOr("correct_answers"),
                QuestionType = data.GetStringOr("type") == "multiple_choice"
                    ? QuestionType.MultipleChoice : QuestionType.SingleChoice,
                ImagePath = imgPath,
                Notes = inferred ? "⚠ Đáp án do AI suy luận (không có đáp án rõ trong ảnh)" : "",
            });
        }
        return results;
    }

    // ─── Gemini REST API call ───
    private async Task<string> CallGeminiApi(string apiKey, string model, List<object> parts)
    {
        var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";
        var body = new { contents = new[] { new { parts } } };
        var json = JsonSerializer.Serialize(body);
        var content = new StringContent(json, Encoding.UTF8, "application/json");
        var response = await _http.PostAsync(url, content, StopToken);
        var responseText = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"{(int)response.StatusCode}: {responseText[..Math.Min(200, responseText.Length)]}");

        // Parse response to get text
        var respData = JsonSerializer.Deserialize<JsonElement>(responseText);
        return respData.GetProperty("candidates")[0]
                       .GetProperty("content")
                       .GetProperty("parts")[0]
                       .GetProperty("text")
                       .GetString() ?? "";
    }

    private async Task HandleErrorWithLog(Exception e, int attempt, int[] modelIdx, string context)
    {
        var err = e.Message.ToLower();
        var keyNum = GetKeyNum();

        if (err.Contains("429") || err.Contains("quota") || err.Contains("rate"))
        {
            int wait = Math.Min(60 * (attempt + 1), 120);
            Log($"⚠ Key {keyNum} [{MaskKey(_keys.Count > 0 && keyNum > 0 ? _keys[keyNum - 1] : "")}] hit rate limit (429). Waiting {wait}s...");
            await InterruptibleDelay(wait);
        }
        else if (err.Contains("404") || err.Contains("not found") || err.Contains("preview"))
        {
            var oldModel = ModelList[modelIdx[0] % ModelList.Length];
            modelIdx[0]++;
            var newModel = ModelList[modelIdx[0] % ModelList.Length];
            Log($"⚠ Model '{oldModel}' not available. Falling back to '{newModel}'...");
            await InterruptibleDelay(1);
        }
        else if (err.Contains("500") || err.Contains("503") || err.Contains("unavailable"))
        {
            Log($"⚠ Server error (5xx) on {context}. Retrying in 5s...");
            await InterruptibleDelay(5);
        }
        else
        {
            Log($"✗ Error on {context}: {e.Message[..Math.Min(100, e.Message.Length)]}. Retrying in 3s...");
            await InterruptibleDelay(3);
        }
    }

    // ─── Single image ───
    public async Task<Flashcard?> ProcessImage(string imagePath, int maxRetries = 5)
    {
        var ext = Path.GetExtension(imagePath).ToLower();
        var mimeMap = new Dictionary<string, string>
        {
            [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg",
            [".png"] = "image/png", [".webp"] = "image/webp", [".bmp"] = "image/bmp"
        };
        var mimeType = mimeMap.GetValueOrDefault(ext, "image/png");
        var fname = Path.GetFileName(imagePath);
        var imageBytes = await File.ReadAllBytesAsync(imagePath);
        var base64 = Convert.ToBase64String(imageBytes);
        var modelIdx = new[] { 0 };

        for (int attempt = 0; attempt < maxRetries; attempt++)
        {
            if (StopToken.IsCancellationRequested) break;
            var apiKey = GetNextKey();
            if (apiKey == null) throw new InvalidOperationException("No API keys configured.");

            var keyNum = GetKeyNum();
            var model = ModelList[modelIdx[0] % ModelList.Length];
            Log($"📤 Sending '{fname}' | Key {keyNum} [{MaskKey(apiKey)}] | Model: {model}");

            try
            {
                var parts = new List<object>
                {
                    new { inline_data = new { mime_type = mimeType, data = base64 } },
                    new { text = ExtractionPrompt }
                };
                Log($"⏳ Waiting for response... ({fname})");
                var responseText = await CallGeminiApi(apiKey, model, parts);
                _activeModel = model;
                var card = ParseSingle(responseText, imagePath);
                if (card != null) Log($"✅ Extracted: {card.Question[..Math.Min(60, card.Question.Length)]}...");
                else Log($"⚪ No question found in '{fname}'");
                return card;
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                await HandleErrorWithLog(e, attempt, modelIdx, fname);
            }
        }
        return null;
    }

    // ─── PDF batch ───
    public async Task<List<Flashcard?>> ProcessPdfBytes(byte[] pdfBytes, List<string> pagePaths,
        string batchLabel = "", int maxRetries = 5)
    {
        var base64 = Convert.ToBase64String(pdfBytes);
        var modelIdx = new[] { 0 };

        for (int attempt = 0; attempt < maxRetries; attempt++)
        {
            if (StopToken.IsCancellationRequested) break;
            var apiKey = GetNextKey();
            if (apiKey == null) throw new InvalidOperationException("No API keys configured.");

            var keyNum = GetKeyNum();
            var model = ModelList[modelIdx[0] % ModelList.Length];
            var sizeKb = pdfBytes.Length / 1024;
            Log($"📤 Sending PDF batch {batchLabel} ({pagePaths.Count} pages, {sizeKb}KB) | Key {keyNum} [{MaskKey(apiKey)}] | Model: {model}");

            try
            {
                var parts = new List<object>
                {
                    new { inline_data = new { mime_type = "application/pdf", data = base64 } },
                    new { text = PdfBatchPrompt }
                };
                Log($"⏳ Waiting for response on batch {batchLabel}...");
                var responseText = await CallGeminiApi(apiKey, model, parts);
                _activeModel = model;
                var cards = ParsePdfBatch(responseText, pagePaths);
                var valid = cards.Count(c => c != null);
                Log($"✅ Batch {batchLabel} done — {valid}/{pagePaths.Count} cards extracted");
                return cards;
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                await HandleErrorWithLog(e, attempt, modelIdx, $"batch {batchLabel}");
            }
        }
        return new List<Flashcard?>();
    }

    // ─── Images to PDF ───
    public static byte[] ImagesToPdf(List<string> imagePaths)
    {
        using var doc = new PdfSharpCore.Pdf.PdfDocument();
        foreach (var path in imagePaths)
        {
            var page = doc.AddPage();
            using var img = PdfSharpCore.Drawing.XImage.FromFile(path);
            page.Width = img.PointWidth;
            page.Height = img.PointHeight;
            using var gfx = PdfSharpCore.Drawing.XGraphics.FromPdfPage(page);
            gfx.DrawImage(img, 0, 0, page.Width, page.Height);
        }
        using var ms = new MemoryStream();
        doc.Save(ms);
        return ms.ToArray();
    }

    // ─── PDF batch mode ───
    public async Task<List<Flashcard?>> ProcessImagesAsPdfBatches(
        List<string> imagePaths,
        int batchSize = PdfBatchPages,
        Action<int, int, Flashcard?>? onProgress = null,
        Action<int, string, string>? onError = null,
        CancellationToken stopToken = default,
        ManualResetEventSlim? pauseEvent = null)
    {
        StopToken = stopToken;
        var allResults = new List<Flashcard?>();
        int total = imagePaths.Count;
        var batches = new List<List<string>>();
        for (int i = 0; i < total; i += batchSize)
            batches.Add(imagePaths.Skip(i).Take(batchSize).ToList());
        int processed = 0;

        Log($"🚀 PDF Batch mode: {total} images → {batches.Count} batch(es) of up to {batchSize} pages each");

        for (int bIdx = 0; bIdx < batches.Count; bIdx++)
        {
            if (stopToken.IsCancellationRequested) { Log("⏹ Scan stopped by user."); break; }
            if (pauseEvent != null) pauseEvent.Wait(stopToken);

            var batch = batches[bIdx];
            var batchLabel = $"{bIdx + 1}/{batches.Count}";
            Log($"\n── Batch {batchLabel}: images {bIdx * batchSize + 1}–{bIdx * batchSize + batch.Count} ──");
            Log($"🔧 Merging {batch.Count} images into PDF...");

            try
            {
                var pdfBytes = ImagesToPdf(batch);
                Log($"✔ PDF ready ({pdfBytes.Length / 1024}KB)");
                var cards = await ProcessPdfBytes(pdfBytes, batch, batchLabel);
                while (cards.Count < batch.Count) cards.Add(null);

                for (int i = 0; i < batch.Count; i++)
                {
                    allResults.Add(cards[i]);
                    processed++;
                    onProgress?.Invoke(processed, total, cards[i]);
                }
            }
            catch (Exception e)
            {
                Log($"✗ Batch {batchLabel} failed: {e.Message[..Math.Min(120, e.Message.Length)]}");
                foreach (var path in batch)
                {
                    allResults.Add(null);
                    processed++;
                    onError?.Invoke(processed - 1, path, e.Message);
                    onProgress?.Invoke(processed, total, null);
                }
            }

            if (bIdx < batches.Count - 1)
            {
                var delay = RequestDelay;
                Log($"⏱ Waiting {delay:F1}s before next batch...");
                await InterruptibleDelay(delay);
            }
        }

        var validTotal = allResults.Count(c => c != null);
        Log($"\n🏁 All done! {validTotal}/{total} cards extracted successfully.");
        return allResults;
    }

    // ─── Parallel multi-key ───
    public async Task<List<Flashcard?>> ProcessImagesParallel(
        List<string> imagePaths,
        List<string> keys,
        int batchSize = PdfBatchPages,
        Action<int, int, Flashcard?>? onProgress = null,
        Action<int, string, string>? onError = null,
        CancellationToken stopToken = default,
        ManualResetEventSlim? pauseEvent = null)
    {
        int total = imagePaths.Count;
        int nKeys = keys.Count;
        var packs = new List<List<string>>();
        int packSize = Math.Max(1, (total + nKeys - 1) / nKeys);
        for (int i = 0; i < total; i += packSize)
            packs.Add(imagePaths.Skip(i).Take(packSize).ToList());

        Log($"\n⚡ PARALLEL MODE: {total} images → {packs.Count} packs across {nKeys} API key(s)");
        for (int i = 0; i < packs.Count; i++)
            Log($"   Pack {i + 1}: {packs[i].Count} images → Key {i + 1} [{MaskKey(keys[i])}]");

        var progressLock = new object();
        int sharedProgress = 0;
        var allResults = new Flashcard?[total];

        var tasks = new List<Task>();
        for (int idx = 0; idx < packs.Count; idx++)
        {
            var packIdx = idx;
            var pack = packs[idx];
            var apiKey = keys[idx];
            tasks.Add(Task.Run(async () =>
            {
                var keyLabel = $"Key {packIdx + 1}";
                var masked = MaskKey(apiKey);
                var workerSvc = new GeminiService();
                workerSvc.SetKeys(new List<string> { apiKey });
                workerSvc.OnLog = msg => Log($"[{keyLabel}] {msg}");
                workerSvc.StopToken = stopToken;

                var subBatches = new List<List<string>>();
                for (int j = 0; j < pack.Count; j += batchSize)
                    subBatches.Add(pack.Skip(j).Take(batchSize).ToList());

                Log($"[{keyLabel}] 🚀 Starting: {pack.Count} images → {subBatches.Count} sub-batch(es) [{masked}]");

                int packOffset = 0;
                for (int p = 0; p < packIdx; p++) packOffset += packs[p].Count;
                int localProcessed = 0;

                for (int sbIdx = 0; sbIdx < subBatches.Count; sbIdx++)
                {
                    if (stopToken.IsCancellationRequested) break;
                    if (pauseEvent != null) pauseEvent.Wait(stopToken);

                    var subBatch = subBatches[sbIdx];
                    try
                    {
                        var pdfBytes = ImagesToPdf(subBatch);
                        var cards = await workerSvc.ProcessPdfBytes(pdfBytes, subBatch,
                            $"P{packIdx + 1}-{sbIdx + 1}/{subBatches.Count}");
                        while (cards.Count < subBatch.Count) cards.Add(null);

                        for (int i = 0; i < subBatch.Count; i++)
                        {
                            int globalIdx = packOffset + localProcessed;
                            allResults[globalIdx] = cards[i];
                            localProcessed++;
                            int current;
                            lock (progressLock) { sharedProgress++; current = sharedProgress; }
                            onProgress?.Invoke(current, total, cards[i]);
                        }
                    }
                    catch (Exception e)
                    {
                        Log($"[{keyLabel}] ✗ Sub-batch {sbIdx + 1}/{subBatches.Count} failed: {e.Message[..Math.Min(120, e.Message.Length)]}");
                        foreach (var imgPath in subBatch)
                        {
                            int globalIdx = packOffset + localProcessed;
                            allResults[globalIdx] = null;
                            localProcessed++;
                            int current;
                            lock (progressLock) { sharedProgress++; current = sharedProgress; }
                            onError?.Invoke(globalIdx, imgPath, e.Message);
                            onProgress?.Invoke(current, total, null);
                        }
                    }

                    if (sbIdx < subBatches.Count - 1)
                    {
                        var delay = Math.Max(60.0 / SafeRpm, 1.0);
                        await Task.Delay(TimeSpan.FromSeconds(delay), stopToken).ContinueWith(_ => { });
                    }
                }
                Log($"[{keyLabel}] ✔ Finished all sub-batches");
            }, stopToken));
        }

        await Task.WhenAll(tasks);

        var validTotal = allResults.Count(c => c != null);
        Log($"\n🏁 PARALLEL DONE! {validTotal}/{total} cards extracted across {packs.Count} parallel workers.");
        return allResults.ToList();
    }

    // ─── Key validation ───
    public async Task<(bool ok, string msg)> ValidateKey(string apiKey)
    {
        foreach (var model in ModelList)
        {
            try
            {
                var parts = new List<object> { new { text = "Say OK in one word." } };
                var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";
                var body = new { contents = new[] { new { parts } } };
                var json = JsonSerializer.Serialize(body);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var resp = await _http.PostAsync(url, content);
                if (resp.IsSuccessStatusCode) return (true, $"✓ Valid ({model})");
                var errText = await resp.Content.ReadAsStringAsync();
                if (errText.Contains("404") || errText.Contains("not found", StringComparison.OrdinalIgnoreCase))
                    continue;
                return (false, $"Invalid: {errText[..Math.Min(80, errText.Length)]}");
            }
            catch (Exception e)
            {
                if (e.Message.Contains("404") || e.Message.Contains("not found", StringComparison.OrdinalIgnoreCase))
                    continue;
                return (false, $"Invalid: {e.Message[..Math.Min(80, e.Message.Length)]}");
            }
        }
        return (false, "No working model found.");
    }

    public async Task<List<string>> ValidateKeysParallel(List<string> keys, Action<string>? onLog = null)
    {
        var results = new Dictionary<string, (bool ok, string msg)>();
        var finishOrder = new List<string>();
        var lk = new object();

        var tasks = keys.Select((key, i) => Task.Run(async () =>
        {
            var masked = MaskKey(key);
            onLog?.Invoke($"🔍 Testing Key {i + 1} [{masked}]...");
            var (ok, msg) = await ValidateKey(key);
            lock (lk)
            {
                results[key] = (ok, msg);
                if (ok) finishOrder.Add(key);
            }
            onLog?.Invoke($"{(ok ? "✅" : "❌")} Key {i + 1} [{masked}]: {msg}");
        })).ToList();

        await Task.WhenAll(tasks);

        var alive = keys.Where(k => results.ContainsKey(k) && results[k].ok).ToList();
        var dead = keys.Count - alive.Count;

        onLog?.Invoke($"\n📊 Key check done: {alive.Count}/{keys.Count} alive" +
                      (dead > 0 ? $", {dead} dead (excluded)" : ""));

        StartFrom = 0;
        if (alive.Count > 0 && finishOrder.Count > 0)
        {
            var lastTested = finishOrder[^1];
            if (alive.Contains(lastTested))
            {
                var lastIdx = alive.IndexOf(lastTested);
                StartFrom = (lastIdx + 1) % alive.Count;
                onLog?.Invoke($"🔀 Scan will start from Key {StartFrom + 1}");
            }
        }

        return alive;
    }
}
