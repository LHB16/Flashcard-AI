/**
 * configService.js — Manage config.json on Google Drive AppData
 * Stores API keys and scan settings. Keys never touch localStorage.
 */
import { getValidToken } from './driveSync';

const CONFIG_FILENAME = 'config.json';

/**
 * Default config shape
 */
const DEFAULT_CONFIG = {
  api_keys: [],
  batch_size: 50,
  updated_at: '',
};

/**
 * Find config.json in Drive appDataFolder
 * @returns {Promise<{ fileId: string|null, config: object }>}
 */
export async function loadConfigFromDrive() {
  const token = await getValidToken();

  // Search for config.json
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${CONFIG_FILENAME}'&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!searchRes.ok) {
    throw new Error(`Failed to search config on Drive: ${searchRes.status}`);
  }

  const searchData = await searchRes.json();
  const file = searchData.files?.[0] || null;

  if (!file) {
    return { fileId: null, config: { ...DEFAULT_CONFIG } };
  }

  // Download config.json
  const downloadRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!downloadRes.ok) {
    throw new Error(`Failed to download config from Drive: ${downloadRes.status}`);
  }

  const config = await downloadRes.json();

  return {
    fileId: file.id,
    config: { ...DEFAULT_CONFIG, ...config },
  };
}

/**
 * Upload/update config.json on Drive
 * @param {object} config - config object
 * @param {string|null} existingFileId - if updating existing file
 * @returns {Promise<string>} file ID
 */
export async function saveConfigToDrive(config, existingFileId = null) {
  const token = await getValidToken();

  const updatedConfig = {
    ...config,
    updated_at: new Date().toISOString(),
  };

  const metadata = {
    name: CONFIG_FILENAME,
    parents: existingFileId ? undefined : ['appDataFolder'],
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(updatedConfig, null, 2)], { type: 'application/json' }));

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const method = existingFileId ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Failed to save config to Drive: ${res.status}`);
  }

  const result = await res.json();
  return result.id || existingFileId;
}
