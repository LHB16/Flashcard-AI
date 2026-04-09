/**
 * geminiService.js — Orchestrator for AI Scan flow
 *
 * === SECURITY MODEL ===
 * Frontend NEVER handles full API keys. All key management goes through
 * the backend scan server which reads keys from Google Drive config.json.
 * Frontend only receives masked keys for display.
 *
 * Flow:
 * 1. fetchScanConfig(googleId) → get masked config from backend
 * 2. addScanApiKey(googleId, key) → send key to backend → receive masked
 * 3. validateScanKeys(googleId) → backend validates all keys → returns valid indices
 * 4. processBatches(pdfs, googleId, validKeyIndices, ...) → scan via backend
 */
import { v4 as uuidv4 } from 'uuid';
import { imagesToPdf } from './pdfService';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const SCAN_URL = import.meta.env.VITE_SCAN_BACKEND_URL || BACKEND_URL;

/**
 * Get google_id from localStorage
 */
function getGoogleId() {
  return localStorage.getItem('g_id');
}

/**
 * Sleep helper that respects AbortSignal
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    }
  });
}

/**
 * Mask API key for display: ...last8chars (used for log display only)
 */
export function maskKey(key) {
  if (!key || key.length < 8) return '****';
  return `...${key.slice(-8)}`;
}

// ════════════════════════════════════
// CONFIG API — Backend manages Google Drive config.json
// ════════════════════════════════════

/**
 * Fetch scan config from backend (masked keys only)
 * @param {string} [googleId]
 * @returns {Promise<{ api_keys: string[], batch_size: number, updated_at: string }>}
 */
export async function fetchScanConfig(googleId) {
  const gid = googleId || getGoogleId();
  if (!gid) throw new Error('Not logged in');

  const res = await fetch(`${SCAN_URL}/scan/config?google_id=${encodeURIComponent(gid)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Failed to load config: ${res.status}`);
  }
  return res.json();
}

/**
 * Add a new API key via backend
 * @param {string} apiKey - Full API key (sent once, then discarded)
 * @param {string} [googleId]
 * @param {number} [replaceIndex] - Replace key at this index instead of adding
 * @returns {Promise<{ masked_key: string, api_keys: string[], batch_size: number }>}
 */
export async function addScanApiKey(apiKey, googleId, replaceIndex) {
  const gid = googleId || getGoogleId();
  if (!gid) throw new Error('Not logged in');

  const body = { google_id: gid, api_key: apiKey };
  if (replaceIndex !== undefined) body.replace_index = replaceIndex;

  const res = await fetch(`${SCAN_URL}/scan/config/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Failed to add key: ${res.status}`);
  }
  return res.json();
}

/**
 * Remove an API key by index via backend
 * @param {number} index
 * @param {string} [googleId]
 * @returns {Promise<{ success: boolean, api_keys: string[], batch_size: number }>}
 */
export async function removeScanApiKey(index, googleId) {
  const gid = googleId || getGoogleId();
  if (!gid) throw new Error('Not logged in');

  const res = await fetch(`${SCAN_URL}/scan/config/keys/${index}?google_id=${encodeURIComponent(gid)}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Failed to remove key: ${res.status}`);
  }
  return res.json();
}

/**
 * Update non-key config fields (batch_size, etc.)
 * @param {{ batch_size?: number }} updates
 * @param {string} [googleId]
 */
export async function updateScanConfig(updates, googleId) {
  const gid = googleId || getGoogleId();
  if (!gid) throw new Error('Not logged in');

  const res = await fetch(`${SCAN_URL}/scan/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ google_id: gid, ...updates }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Failed to update config: ${res.status}`);
  }
  return res.json();
}

// ════════════════════════════════════
// KEY VALIDATION — Backend validates all keys at once
// ════════════════════════════════════

/**
 * Validate all API keys via backend. Returns valid key indices + masked keys.
 * @param {string} [googleId]
 * @param {function} [onLog]
 * @returns {Promise<{ validIndices: number[], maskedKeys: string[], totalKeys: number }>}
 */
export async function validateScanKeys(googleId, onLog) {
  const gid = googleId || getGoogleId();
  if (!gid) throw new Error('Not logged in');

  const res = await fetch(`${SCAN_URL}/scan/validate-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ google_id: gid }),
  });

  if (!res.ok) {
    throw new Error(`Validation failed: ${res.status}`);
  }

  const data = await res.json();
  const results = data.results || [];

  // Log each result
  for (const r of results) {
    const keyNum = r.index + 1;
    if (r.valid) {
      if (onLog) onLog(`✅ Key ${keyNum} [${r.masked}]: ${r.msg}`);
    } else {
      if (onLog) onLog(`❌ Key ${keyNum} [${r.masked}]: ${r.msg}`);
    }
  }

  return {
    validIndices: results.filter(r => r.valid).map(r => r.index),
    maskedKeys: results.map(r => r.masked),
    totalKeys: results.length,
  };
}

// ════════════════════════════════════
// BATCH PROCESSING — Scan via backend
// ════════════════════════════════════

/**
 * Send one PDF batch to backend for Gemini processing.
 * Backend resolves google_id + keyIndex → actual API key.
 */
async function sendBatch(pdfBase64, googleId, keyIndex, batchIndex, totalBatches, pageCount, signal) {
  let modelIndex = 0;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const res = await fetch(`${SCAN_URL}/scan/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-google-id': googleId,
        'x-key-index': String(keyIndex),
      },
      body: JSON.stringify({
        pdf_base64: pdfBase64,
        batch_index: batchIndex,
        total_batches: totalBatches,
        page_count: pageCount,
        model_index: modelIndex,
      }),
      signal,
    });

    if (res.ok) {
      return await res.json();
    }

    const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));

    if (res.status === 404) {
      modelIndex = Math.min(modelIndex + 1, 5);
      await sleep(1000, signal);
      continue;
    }

    const err = new Error(errData.error || `HTTP ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }

  throw new Error(`Model fallback exhausted for batch ${batchIndex + 1}`);
}

/**
 * Process all PDF batches with a robust worker pool.
 *
 * @param {string[]} pdfBatches - base64 PDF strings
 * @param {number[]} pageCounts - pages in each batch
 * @param {string} googleId - user's Google ID
 * @param {number[]} validKeyIndices - indices of validated keys
 * @param {string[]} maskedKeys - masked key strings for log display
 * @param {object} callbacks - { onLog, onProgress, onBatchDone, onBatchError }
 * @param {AbortSignal} [signal]
 * @param {File[][]} [imageBatches] - original images for binary split
 */
export async function processBatches(pdfBatches, pageCounts, googleId, validKeyIndices, maskedKeys, callbacks, signal, imageBatches) {
  const { onLog, onProgress, onBatchDone, onBatchError } = callbacks;
  const totalBatches = pdfBatches.length;
  const totalPages = pageCounts.reduce((a, b) => a + b, 0);

  const pdfList = [...pdfBatches];
  const pageList = [...pageCounts];
  const imageList = imageBatches ? [...imageBatches] : null;
  const cardResults = Array(totalBatches).fill(null);
  const failedBatches = [];
  let processedPages = 0;

  onLog(`🚀 Starting scan: ${totalPages} images → ${totalBatches} batch(es)`);
  onLog(`   Using ${validKeyIndices.length} API key(s)`);

  const concurrency = validKeyIndices.length;
  const queue = Array.from({ length: totalBatches }, (_, i) => ({ batchIndex: i, retries: 0 }));

  onLog(concurrency > 1 ? `⚡ Parallel worker pool: ${concurrency} concurrent keys` : `🚶 Sequential mode`);

  async function worker(workerIndex) {
    const keyIndex = validKeyIndices[workerIndex];
    const keyNum = workerIndex + 1;
    const maskedKey = maskedKeys[keyIndex] || `Key#${keyNum}`;

    while (queue.length > 0) {
      if (signal?.aborted) break;

      const task = queue.shift();
      if (!task) break;

      const { batchIndex: i, retries } = task;
      const pageCount = pageList[i];

      const retryLabel = retries > 0 ? ` (Retry ${retries}/2)` : '';
      onLog(`📤 Batch ${i + 1}/${pdfList.length} [${pageCount} pg] → Key ${keyNum} [${maskedKey}]${retryLabel}`);

      try {
        const result = await sendBatch(pdfList[i], googleId, keyIndex, i, pdfList.length, pageCount, signal);
        const cards = addCardIds(result.cards || []);

        while (cardResults.length <= i) cardResults.push(null);
        cardResults[i] = cards;

        processedPages += pageCount;
        onBatchDone(i, cards.length);
        onLog(`✅ Batch ${i + 1}: ${cards.length} cards (model: ${result.model_used})`);
        onProgress(processedPages, totalPages);

        if (queue.length > 0 && !signal?.aborted) {
          await sleep(2000, signal).catch(() => {});
        }
      } catch (err) {
        if (err.name === 'AbortError') throw err;

        if (retries < 2) {
          onLog(`⚠ Batch ${i + 1} failed: ${err.message}. Re-queueing (Retry ${retries + 1}/2)...`);
          queue.push({ batchIndex: i, retries: retries + 1 });

          if (err.message.includes('429')) {
            await sleep(15000, signal).catch(() => {});
          } else {
            await sleep(5000, signal).catch(() => {});
          }
        } else {
          // Binary split
          if (pageCount > 1 && imageList && imageList[i] && imageList[i].length > 1) {
            const imgs = imageList[i];
            const mid = Math.ceil(imgs.length / 2);
            const halfA = imgs.slice(0, mid);
            const halfB = imgs.slice(mid);

            onLog(`🔀 Binary split: Batch ${i + 1} (${imgs.length} imgs) → [${halfA.length}] + [${halfB.length}]`);

            try {
              const [pdfA, pdfB] = await Promise.all([
                imagesToPdf(halfA),
                imagesToPdf(halfB),
              ]);

              const idxA = pdfList.length;
              pdfList.push(pdfA.pdfBase64);
              pageList.push(pdfA.pageCount);
              imageList.push(halfA);

              const idxB = pdfList.length;
              pdfList.push(pdfB.pdfBase64);
              pageList.push(pdfB.pageCount);
              imageList.push(halfB);

              while (cardResults.length <= idxB) cardResults.push(null);

              queue.push({ batchIndex: idxA, retries: 0 });
              queue.push({ batchIndex: idxB, retries: 0 });

              onLog(`📋 Sub-batches #${idxA + 1} (${halfA.length} pg) and #${idxB + 1} (${halfB.length} pg) queued`);
            } catch (splitErr) {
              processedPages += pageCount;
              failedBatches.push(i);
              while (cardResults.length <= i) cardResults.push(null);
              cardResults[i] = [];
              onBatchError(i, err.message);
              onLog(`❌ Batch ${i + 1}: binary split failed (${splitErr.message}) — giving up`);
              onProgress(processedPages, totalPages);
            }
          } else {
            processedPages += pageCount;
            failedBatches.push(i);
            while (cardResults.length <= i) cardResults.push(null);
            cardResults[i] = [];
            onBatchError(i, err.message);
            onLog(`❌ Batch ${i + 1}: permanently failed after 3 attempts — ${err.message}`);
            onProgress(processedPages, totalPages);
          }
        }
      }
    }
  }

  const workers = validKeyIndices.map((_, idx) => worker(idx));

  try {
    await Promise.all(workers);
  } catch (err) {
    if (err.name === 'AbortError') {
      onLog('⏹ Scan cancelled by user.');
    } else {
      onLog(`❌ Fatal error: ${err.message}`);
    }
  }

  const allCards = cardResults.filter(b => b !== null).flat();
  const validCount = allCards.length;
  onLog(`\n🏁 Done! ${validCount} cards from ${pdfList.length} batches (${failedBatches.length} failed)`);

  return { cards: allCards, failedBatches };
}

/**
 * Add unique card_id and ensure proper structure for each card
 */
function addCardIds(cards) {
  return cards.map(card => ({
    card_id: uuidv4(),
    question: card.question || '',
    options: card.options || [],
    correct_answers: card.correct_answers || [],
    question_type: card.question_type || 'single_choice',
    notes: card.notes || '',
    status: 0,
    image_path: null,
  }));
}
