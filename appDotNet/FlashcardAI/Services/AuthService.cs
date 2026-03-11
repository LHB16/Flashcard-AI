using System;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Drive.v3;
using Google.Apis.Oauth2.v2;
using Google.Apis.Services;
using Google.Apis.Util.Store;

namespace FlashcardAI.Services;

/// <summary>
/// Google Drive Authentication — matches Python auth_service.py.
/// </summary>
public class AuthService
{
    private static readonly string[] Scopes =
    {
        DriveService.Scope.DriveAppdata,
        "https://www.googleapis.com/auth/userinfo.email",
        "openid"
    };

    private const string TokenFile = "token.json";
    private const string ExternalCredentialsFile = "credentials.json";

    // Base64 encoded credentials.json (same as Python)
    private const string EmbeddedCredentialsB64 =
        "eyJpbnN0YWxsZWQiOnsiY2xpZW50X2lkIjoiOTAwNTU5Njc0MTQyLXA1ajlpbmZqaTgyMTNyNWI0MG02OXJwa3RlNWFvZzVvLmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29tIiwicHJvamVjdF9pZCI6ImZsYXNoY2FyZGFwcC1zeW5jIiwiYXV0aF91cmkiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20vby9vYXV0aDIvYXV0aCIsInRva2VuX3VyaSI6Imh0dHBzOi8vb2F1dGgyLmdvb2dsZWFwaXMuY29tL3Rva2VuIiwiYXV0aF9wcm92aWRlcl94NTA5X2NlcnRfdXJsIjoiaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vb2F1dGgyL3YxL2NlcnRzIiwiY2xpZW50X3NlY3JldCI6IkdPQ1NQWC0yNk9aOU5nNWRVSlZJb1RDYnA1alkxWVUwdFQtIiwicmVkaXJlY3RfdXJpcyI6WyJodHRwOi8vbG9jYWxob3N0Il19fQ==";

    private UserCredential? _credential;

    public async Task<bool> LoginAsync(CancellationToken ct = default)
    {
        try
        {
            GoogleClientSecrets clientSecrets;
            if (File.Exists(ExternalCredentialsFile))
            {
                using var stream = new FileStream(ExternalCredentialsFile, FileMode.Open, FileAccess.Read);
                clientSecrets = await GoogleClientSecrets.FromStreamAsync(stream, ct);
            }
            else
            {
                var json = Encoding.UTF8.GetString(Convert.FromBase64String(EmbeddedCredentialsB64));
                using var stream = new MemoryStream(Encoding.UTF8.GetBytes(json));
                clientSecrets = await GoogleClientSecrets.FromStreamAsync(stream, ct);
            }

            _credential = await GoogleWebAuthorizationBroker.AuthorizeAsync(
                clientSecrets.Secrets,
                Scopes,
                "user",
                ct,
                new FileDataStore(".", true));

            return _credential != null;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Auth failed: {ex}");
            _credential = null;
            return false;
        }
    }

    public void Logout()
    {
        _credential = null;
        var tokenPath = Path.Combine(".", "Google.Apis.Auth.OAuth2.Responses.TokenResponse-user");
        if (File.Exists(tokenPath)) File.Delete(tokenPath);
        // Also check standard token file
        if (File.Exists(TokenFile)) File.Delete(TokenFile);
    }

    public bool IsLoggedIn
    {
        get
        {
            if (_credential != null) return true;
            var tokenPath = Path.Combine(".", "Google.Apis.Auth.OAuth2.Responses.TokenResponse-user");
            return File.Exists(tokenPath);
        }
    }

    public UserCredential? GetCredential() => _credential;

    public DriveService? CreateDriveService()
    {
        if (_credential == null) return null;
        return new DriveService(new BaseClientService.Initializer
        {
            HttpClientInitializer = _credential,
            ApplicationName = "FlashcardAI"
        });
    }

    public async Task<bool> EnsureCredentialAsync()
    {
        if (_credential != null) return true;
        if (!IsLoggedIn) return false;
        return await LoginAsync();
    }

    public async Task<string> GetUserEmailAsync()
    {
        if (!await EnsureCredentialAsync()) return "";
        try
        {
            var service = new Oauth2Service(new BaseClientService.Initializer
            {
                HttpClientInitializer = _credential,
                ApplicationName = "FlashcardAI"
            });
            var userInfo = await service.Userinfo.Get().ExecuteAsync();
            return userInfo.Email ?? "";
        }
        catch { return ""; }
    }
}
