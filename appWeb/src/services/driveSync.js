const CLIENT_ID = '900559674142-os3o3k7k0hs995rk303g05dvl7n5ohne.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

let tokenClient;
let accessToken = null;
let tokenResolveCallback = null;
let tokenRejectCallback = null;

export const initGoogleIdentity = (onSuccess, onError) => {
  if (!window.google) return;
  
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (tokenResponse) => {
      if (tokenResponse && tokenResponse.access_token) {
        accessToken = tokenResponse.access_token;
        // Save token to localStorage. Deduct 100 seconds to be safe before actual expiry
        const expiryTime = Date.now() + 3500 * 1000;
        localStorage.setItem('g_token', accessToken);
        localStorage.setItem('g_expiry', expiryTime.toString());
        
        if (tokenResolveCallback) {
          tokenResolveCallback(accessToken);
          tokenResolveCallback = null;
          tokenRejectCallback = null;
        }
        if (onSuccess) onSuccess(accessToken);
      } else {
        if (tokenRejectCallback) {
          tokenRejectCallback(new Error('Error getting authentication token'));
          tokenResolveCallback = null;
          tokenRejectCallback = null;
        }
        if (onError) onError('Error getting authentication token');
      }
    },
  });

  // Check saved token on initialization
  const savedToken = localStorage.getItem('g_token');
  const savedExpiry = localStorage.getItem('g_expiry');
  
  if (savedToken && savedExpiry && Date.now() < parseInt(savedExpiry, 10)) {
    accessToken = savedToken;
    if (onSuccess) onSuccess(accessToken);
  }
};

const getValidToken = () => {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error("Google Services haven't loaded yet."));
      return;
    }
    
    // Check current loaded token or freshly grabbed token locally
    if (accessToken) {
      const savedExpiry = localStorage.getItem('g_expiry');
      if (savedExpiry && Date.now() < parseInt(savedExpiry, 10)) {
        resolve(accessToken);
        return;
      }
    }
    
    // Token is expired or missing. Try to get a new one silently using prompt empty
    tokenResolveCallback = resolve;
    tokenRejectCallback = reject;
    tokenClient.requestAccessToken({ prompt: '' });
  });
};

export const loginGoogle = () => {
  if (tokenClient) {
    tokenClient.requestAccessToken({ prompt: '' });
  } else {
    alert("Google Services haven't loaded yet. Please refresh the page.");
  }
};

export const logoutGoogle = () => {
  if (accessToken) {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      window.google.accounts.oauth2.revoke(accessToken, () => {
        console.log('Token revoked.');
      });
    }
  }
  accessToken = null;
  localStorage.removeItem('g_token');
  localStorage.removeItem('g_expiry');
};

export const fetchDecksFromDrive = async () => {
  const validToken = await getValidToken();

  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='decks.json'&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${validToken}` }
  });
  
  if (!searchRes.ok) {
     if (searchRes.status === 401) logoutGoogle();
     throw new Error("Failed to search file on Google Drive.");
  }
  
  const searchData = await searchRes.json();
  const file = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

  if (!file) return null;

  const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${validToken}` }
  });
  
  if (!downloadRes.ok) throw new Error("Failed to download file from Google Drive.");
  
  const jsonData = await downloadRes.json();
  return { fileId: file.id, data: jsonData };
};

export const uploadDecksToDrive = async (jsonData, existingFileId = null) => {
  const validToken = await getValidToken();
  
  const metadata = {
    name: 'decks.json',
    parents: existingFileId ? undefined : ['appDataFolder']
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' }));

  const url = existingFileId 
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
    
  const method = existingFileId ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${validToken}` },
    body: form
  });
  
  if (!res.ok) {
     if (res.status === 401) logoutGoogle();
     throw new Error("Failed to upload file to Google Drive.");
  }
  
  return res.json();
};
