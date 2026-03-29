const CLIENT_ID = '900559674142-os3o3k7k0hs995rk303g05dvl7n5ohne.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

let tokenClient;
let accessToken = null;

export const initGoogleIdentity = (onSuccess, onError) => {
  if (window.google) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          accessToken = tokenResponse.access_token;
          onSuccess(accessToken);
        } else {
          onError('Error getting authentication token');
        }
      },
    });
  }
};

export const loginGoogle = () => {
  if (tokenClient) {
    tokenClient.requestAccessToken();
  } else {
    alert("Google Services haven't loaded yet. Please refresh the page.");
  }
};

export const logoutGoogle = () => {
  if (accessToken) {
    window.google.accounts.oauth2.revoke(accessToken, () => {
      console.log('Token revoked.');
    });
    accessToken = null;
  }
};

export const fetchDecksFromDrive = async () => {
  if (!accessToken) throw new Error("Not logged in");

  // 1. Tìm file decks.json trong appDataFolder
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='decks.json'&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const searchData = await searchRes.json();
  const file = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

  if (!file) return null;

  // 2. Tải nội dung
  const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const jsonData = await downloadRes.json();
  return { fileId: file.id, data: jsonData };
};

export const uploadDecksToDrive = async (jsonData, existingFileId = null) => {
  if (!accessToken) throw new Error("Not logged in");
  
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
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form
  });
  return res.json();
};
