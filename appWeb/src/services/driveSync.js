const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

let accessToken = localStorage.getItem('g_token');
let googleId = localStorage.getItem('g_id');

export const initGoogleIdentity = async (onSuccess, onError) => {
  // 1. Kiểm tra tham số Callback từ Backend URL
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get('access_token');
  const googleIdFromUrl = urlParams.get('google_id');
  const expiryFromUrl = urlParams.get('expiry');
  const emailFromUrl = urlParams.get('email');

  if (tokenFromUrl && googleIdFromUrl) {
    accessToken = tokenFromUrl;
    googleId = googleIdFromUrl;
    localStorage.setItem('g_token', tokenFromUrl);
    localStorage.setItem('g_id', googleIdFromUrl);
    localStorage.setItem('g_expiry', expiryFromUrl);
    if (emailFromUrl) {
      localStorage.setItem('g_email', emailFromUrl);
    }
    
    // Dọn dẹp URL cho gọn gàng, tránh lộ token ra thanh địa chỉ
    window.history.replaceState({}, document.title, window.location.pathname);
    
    if (onSuccess) onSuccess(accessToken);
    return;
  }

  // 2. Refresh lại Token ngầm
  if (googleId) {
    try {
      const token = await getValidToken();
      if (token && onSuccess) onSuccess(token);
    } catch (err) {
      if (onError) onError(err.message || 'Session expired');
    }
  } else {
    if (onError) onError('You are not logged in');
  }
};

export const getValidToken = async () => {
  if (!googleId) {
    throw new Error('Bạn cần đồng bộ với Google trước');
  }

  const savedExpiry = localStorage.getItem('g_expiry');
  // Trừ hao 2 phút trước khi hết hạn
  if (accessToken && savedExpiry && Date.now() < parseInt(savedExpiry, 10) - 120000) {
    return accessToken;
  }

  // Gọi lên BE xin Token mới bằng con đường Refresh Token
  try {
    const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ google_id: googleId })
    });

    if (!res.ok) {
       logoutGoogle();
       throw new Error('Failed to refresh token from server. Please log in again.');
    }
    
    const data = await res.json();
    accessToken = data.access_token;
    localStorage.setItem('g_token', accessToken);
    localStorage.setItem('g_expiry', data.expiry.toString());

    return accessToken;
  } catch (err) {
    console.error("Refresh auth error:", err);
    throw err;
  }
};

export const loginGoogle = () => {
  // Gọi redirect thẳng sang Express Backend để tạo chuỗi xoay vòng OAuth
  window.location.href = `${BACKEND_URL}/auth/google`;
};

export const logoutGoogle = () => {
  accessToken = null;
  googleId = null;
  localStorage.removeItem('g_token');
  localStorage.removeItem('g_id');
  localStorage.removeItem('g_expiry');
  localStorage.removeItem('g_email');
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

  // Merge Supabase flashcard card_progress back into jsonData
  if (googleId && Array.isArray(jsonData)) {
    try {
      await Promise.all(jsonData.map(async (deck) => {
        const targetId = deck.deck_id || deck.title;
        if (!targetId) return;

        const progressRes = await fetch(`${BACKEND_URL}/progress/cards/${encodeURIComponent(targetId)}?google_id=${googleId}`);
        if (progressRes.ok) {
          const result = await progressRes.json();
          if (result.data && typeof result.data === 'object' && Object.keys(result.data).length > 0) {
            const statusMap = result.data;
            
            // Loop through local deck cards and update status
            if (Array.isArray(deck.cards)) {
              deck.cards.forEach(card => {
                if (card.card_id && statusMap[card.card_id] !== undefined) {
                  card.status = statusMap[card.card_id];
                }
              });
            }
          }
        }
      }));
    } catch (e) {
      console.warn("Muted error: Failed to merge card progress from Supabase", e);
    }
  }

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

/**
 * Xóa tiến trình của nhiều deck trên Supabase (Clean up database)
 */
export const deleteDecksProgress = async (deckIds) => {
  if (!googleId || !deckIds || deckIds.length === 0) return null;

  try {
    const res = await fetch(`${BACKEND_URL}/progress/delete-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ google_id: googleId, deck_ids: deckIds })
    });

    if (!res.ok) {
      console.warn("Failed to delete backend progress:", await res.text());
      return null;
    }

    return res.json();
  } catch (e) {
    console.error("Error deleting deck progress from DB:", e);
    return null;
  }
};

/**
 * Thông báo thay đổi cấu trúc bộ thẻ (Thêm/Sửa/Xóa) để dọn dẹp DB
 */
export const notifyDeckStructureChanged = async (deckId, cardId = null, action = 'edit') => {
  if (!googleId || !deckId) return null;

  try {
    const res = await fetch(`${BACKEND_URL}/progress/deck/on-modified`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        google_id: googleId, 
        deck_id: deckId, 
        card_id: cardId, 
        action 
      })
    });

    if (!res.ok) {
       console.warn("Failed to notify deck modification:", await res.text());
       return null;
    }
    return res.json();
  } catch (e) {
    console.error("Error notifying deck structure change:", e);
    return null;
  }
};
