/**
 * driveHelper.js — Backend-side Google Drive config management (CJS)
 *
 * Same logic as appScanServer/driveHelper.js but in CommonJS format.
 * Uses raw fetch for Supabase (no extra deps) + Google OAuth token refresh.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const CONFIG_FILENAME = 'config.json';
const DEFAULT_CONFIG = { api_keys: [], batch_size: 30, updated_at: '' };

// ─── Caches ───
const tokenCache = new Map();
const configCache = new Map();
const CONFIG_CACHE_TTL = 5 * 60 * 1000;

// ════════════════════════════════════
// SUPABASE — Get refresh_token
// ════════════════════════════════════

async function getRefreshToken(googleId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/users?google_id=eq.${encodeURIComponent(googleId)}&select=refresh_token`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  const rows = await res.json();
  if (!rows.length || !rows[0].refresh_token) {
    throw new Error('User not found or no refresh token');
  }
  return rows[0].refresh_token;
}

// ════════════════════════════════════
// GOOGLE OAUTH — Refresh access token
// ════════════════════════════════════

async function getAccessToken(googleId) {
  const cached = tokenCache.get(googleId);
  if (cached && Date.now() < cached.expires_at - 120_000) {
    return cached.access_token;
  }

  const refreshToken = await getRefreshToken(googleId);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Token refresh failed: ${res.status} ${errText.slice(0, 100)}`);
  }

  const data = await res.json();

  tokenCache.set(googleId, {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
  });

  return data.access_token;
}

// ════════════════════════════════════
// GOOGLE DRIVE — Read config.json
// ════════════════════════════════════

async function loadConfig(googleId) {
  const cached = configCache.get(googleId);
  if (cached && Date.now() < cached.expires_at) {
    return { config: cached.config, fileId: cached.fileId };
  }

  const token = await getAccessToken(googleId);

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${CONFIG_FILENAME}'&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!searchRes.ok) throw new Error(`Drive search failed: ${searchRes.status}`);

  const searchData = await searchRes.json();
  const file = searchData.files?.[0] || null;

  if (!file) {
    const result = { config: { ...DEFAULT_CONFIG }, fileId: null };
    configCache.set(googleId, { ...result, expires_at: Date.now() + CONFIG_CACHE_TTL });
    return result;
  }

  const downloadRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!downloadRes.ok) throw new Error(`Drive download failed: ${downloadRes.status}`);

  const rawConfig = await downloadRes.json();
  const config = { ...DEFAULT_CONFIG, ...rawConfig };
  const result = { config, fileId: file.id };

  configCache.set(googleId, { ...result, expires_at: Date.now() + CONFIG_CACHE_TTL });
  return result;
}

// ════════════════════════════════════
// GOOGLE DRIVE — Write config.json
// ════════════════════════════════════

async function saveConfig(googleId, config, fileId = null) {
  const token = await getAccessToken(googleId);

  const updatedConfig = {
    ...config,
    updated_at: new Date().toISOString(),
  };

  const metadata = {
    name: CONFIG_FILENAME,
    ...(fileId ? {} : { parents: ['appDataFolder'] }),
  };

  const boundary = '---configBoundary' + Date.now();
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    JSON.stringify(updatedConfig, null, 2),
    `--${boundary}--`,
  ].join('\r\n');

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const res = await fetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Drive save failed: ${res.status} ${errText.slice(0, 100)}`);
  }

  const result = await res.json();
  const newFileId = result.id || fileId;

  configCache.delete(googleId);
  return newFileId;
}

function invalidateConfigCache(googleId) {
  configCache.delete(googleId);
}

function maskKey(key) {
  if (!key || key.length < 8) return '••••••••';
  return `${key.slice(0, 4)}${'•'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`;
}

function getMaskedConfig(config) {
  return {
    api_keys: (config.api_keys || []).map(k => maskKey(k)),
    batch_size: config.batch_size || 30,
    updated_at: config.updated_at || '',
  };
}

module.exports = {
  getAccessToken,
  loadConfig,
  saveConfig,
  invalidateConfigCache,
  maskKey,
  getMaskedConfig,
};
