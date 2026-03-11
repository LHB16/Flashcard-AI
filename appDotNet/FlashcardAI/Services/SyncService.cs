using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Sockets;
using System.Text.Json;
using System.Threading.Tasks;
using Google.Apis.Drive.v3;
using Google.Apis.Download;
using Google.Apis.Upload;
using FlashcardAI.Models;

namespace FlashcardAI.Services;

/// <summary>
/// Google Drive AppData Synchronization — matches Python sync_service.py.
/// Smart merge based on updated_at timestamps.
/// </summary>
public class SyncService
{
    private readonly AuthService _auth;
    private DriveService? _drive;

    public SyncService(AuthService auth)
    {
        _auth = auth;
    }

    private async Task<DriveService> GetDriveServiceAsync()
    {
        if (_drive == null)
        {
            await _auth.EnsureCredentialAsync();
            _drive = _auth.CreateDriveService();
            if (_drive == null) throw new Exception("Not authenticated");
        }
        return _drive;
    }

    private static bool CheckInternet()
    {
        try
        {
            using var client = new TcpClient();
            var result = client.BeginConnect("8.8.8.8", 53, null, null);
            bool success = result.AsyncWaitHandle.WaitOne(3000);
            if (success) client.EndConnect(result);
            return success;
        }
        catch { return false; }
    }

    private async Task<Google.Apis.Drive.v3.Data.File?> FindFileInAppData(string filename)
    {
        var service = await GetDriveServiceAsync();
        var request = service.Files.List();
        request.Spaces = "appDataFolder";
        request.Fields = "files(id, name)";
        request.Q = $"name='{filename}'";
        var result = await request.ExecuteAsync();
        return result.Files?.FirstOrDefault();
    }

    private async Task<string?> DownloadJson(string fileId)
    {
        var service = await GetDriveServiceAsync();
        var request = service.Files.Get(fileId);
        using var ms = new MemoryStream();
        await request.DownloadAsync(ms);
        ms.Seek(0, SeekOrigin.Begin);
        return System.Text.Encoding.UTF8.GetString(ms.ToArray());
    }

    private async Task UploadJson(string filename, string? fileId, string jsonContent)
    {
        var service = await GetDriveServiceAsync();
        var bytes = System.Text.Encoding.UTF8.GetBytes(jsonContent);
        using var stream = new MemoryStream(bytes);

        if (fileId != null)
        {
            var updateRequest = service.Files.Update(
                new Google.Apis.Drive.v3.Data.File(),
                fileId,
                stream,
                "application/json");
            await updateRequest.UploadAsync();
        }
        else
        {
            var fileMetadata = new Google.Apis.Drive.v3.Data.File
            {
                Name = filename,
                Parents = new List<string> { "appDataFolder" }
            };
            var createRequest = service.Files.Create(fileMetadata, stream, "application/json");
            createRequest.Fields = "id";
            await createRequest.UploadAsync();
        }
    }

    public async Task<(bool success, string message)> SyncDecksAsync()
    {
        if (!CheckInternet()) return (false, "Không có kết nối mạng");

        try
        {
            var remoteFile = await FindFileInAppData("decks.json");

            // Load remote
            var remoteDecksData = new List<Dictionary<string, JsonElement>>();
            if (remoteFile != null)
            {
                var json = await DownloadJson(remoteFile.Id);
                if (!string.IsNullOrEmpty(json))
                {
                    var parsed = JsonSerializer.Deserialize<List<Dictionary<string, JsonElement>>>(json);
                    if (parsed != null) remoteDecksData = parsed;
                }
            }

            // Load local
            var localDecks = StorageService.LoadDecks();
            var localDecksMap = localDecks.ToDictionary(d => d.DeckId);

            // Smart merge
            var mergedDecksMap = new Dictionary<string, Deck>();
            foreach (var rdData in remoteDecksData)
            {
                var rdId = rdData.GetStringOr("deck_id");
                var rdUpdatedAt = rdData.GetStringOr("updated_at");

                if (localDecksMap.TryGetValue(rdId, out var ld))
                {
                    if (string.Compare(rdUpdatedAt, ld.UpdatedAt, StringComparison.Ordinal) > 0)
                    {
                        // Remote newer
                        var rDeck = Deck.FromDict(rdData);
                        // Preserve local image paths
                        var rCardsMap = rDeck.Cards.ToDictionary(c => c.CardId);
                        foreach (var locCard in ld.Cards)
                        {
                            if (!string.IsNullOrEmpty(locCard.ImagePath) &&
                                rCardsMap.TryGetValue(locCard.CardId, out var remoteCard))
                            {
                                remoteCard.ImagePath = locCard.ImagePath;
                            }
                        }
                        mergedDecksMap[rdId] = rDeck;
                    }
                    else
                    {
                        mergedDecksMap[rdId] = ld;
                    }
                }
                else
                {
                    mergedDecksMap[rdId] = Deck.FromDict(rdData);
                }
            }

            // Add local-only decks
            foreach (var (ldId, ld) in localDecksMap)
            {
                if (!mergedDecksMap.ContainsKey(ldId))
                    mergedDecksMap[ldId] = ld;
            }

            var mergedList = mergedDecksMap.Values.ToList();
            StorageService.SaveDecksRaw(mergedList);

            // Upload
            var jsonOpts = new JsonSerializerOptions
            {
                WriteIndented = true,
                Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            };
            var uploadJson = JsonSerializer.Serialize(
                mergedList.Select(d => d.ToDict()).ToList(), jsonOpts);
            await UploadJson("decks.json", remoteFile?.Id, uploadJson);

            return (true, "Đồng bộ Decks thành công");
        }
        catch (Exception e)
        {
            return (false, $"Lỗi: {e.Message}");
        }
    }

    public async Task<(bool success, string message)> SyncQuizSessionsAsync()
    {
        if (!CheckInternet()) return (false, "Không có kết nối mạng");

        try
        {
            var remoteFile = await FindFileInAppData("quiz_sessions.json");

            var remoteSessionsData = new Dictionary<string, Dictionary<string, JsonElement>>();
            if (remoteFile != null)
            {
                var json = await DownloadJson(remoteFile.Id);
                if (!string.IsNullOrEmpty(json))
                {
                    var parsed = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, JsonElement>>>(json);
                    if (parsed != null) remoteSessionsData = parsed;
                }
            }

            var localSessions = StorageService.LoadQuizSessions();
            var mergedData = new Dictionary<string, object>();

            var allDeckIds = new HashSet<string>(remoteSessionsData.Keys);
            foreach (var k in localSessions.Keys) allDeckIds.Add(k);

            foreach (var deckId in allDeckIds)
            {
                bool hasRemote = remoteSessionsData.ContainsKey(deckId);
                bool hasLocal = localSessions.ContainsKey(deckId);

                if (hasRemote && hasLocal)
                {
                    var rsUpdated = remoteSessionsData[deckId].GetStringOr("updated_at");
                    var lsUpdated = localSessions[deckId].UpdatedAt;

                    if (string.Compare(rsUpdated, lsUpdated, StringComparison.Ordinal) > 0)
                        mergedData[deckId] = remoteSessionsData[deckId];
                    else
                        mergedData[deckId] = localSessions[deckId].ToDict();
                }
                else if (hasRemote)
                    mergedData[deckId] = remoteSessionsData[deckId];
                else
                    mergedData[deckId] = localSessions[deckId].ToDict();
            }

            var jsonOpts = new JsonSerializerOptions
            {
                WriteIndented = true,
                Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            };
            var mergedJson = JsonSerializer.Serialize(mergedData, jsonOpts);

            // Save locally
            File.WriteAllText(StorageService.QuizSessionsFile, mergedJson);

            // Upload
            await UploadJson("quiz_sessions.json", remoteFile?.Id, mergedJson);

            return (true, "Đồng bộ Sessions thành công");
        }
        catch (Exception e)
        {
            return (false, $"Lỗi: {e.Message}");
        }
    }

    public async Task<(bool success, string message)> PerformFullSyncAsync()
    {
        if (!_auth.IsLoggedIn) return (false, "Chưa đăng nhập Google Drive");

        var (s1, m1) = await SyncDecksAsync();
        if (!s1) return (false, m1);

        var (s2, m2) = await SyncQuizSessionsAsync();
        if (!s2) return (false, m2);

        return (true, "Đồng bộ thành công");
    }
}
