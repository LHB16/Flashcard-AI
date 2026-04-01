/**
 * geminiService.js — Orchestrator for AI Scan flow
 * Sends PDF batches to Render backend, which proxies to Gemini API.
 * Handles round-robin keys, retry logic, and cancellation.
 *
 * Reference: appPython/services/gemini_service.py
 */
import { v4 as uuidv4 } from 'uuid';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const MAX_RETRIES = 3;
const RETRY_DELAY_429 = 30000; // 30s for rate limit
const RETRY_DELAY_5XX = 5000;  // 5s for server errors

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
 * Mask API key for display: ...last8chars
 */
export function maskKey(key) {
  if (!key || key.length < 8) return '****';
  return `...${key.slice(-8)}`;
}

/**
 * Send one PDF batch to backend for Gemini processing
 * Tries models sequentially if 404 is encountered, otherwise throws on error.
 */
async function sendBatch(pdfBase64, apiKey, batchIndex, totalBatches, pageCount, signal) {
  let modelIndex = 0;

  // Try up to 3 models if we hit 404 (model not found)
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const res = await fetch(`${BACKEND_URL}/scan/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-gemini-key': apiKey,
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
      // Model not found for this key — try next model
      modelIndex = Math.min(modelIndex + 1, 5);
      await sleep(1000, signal);
      continue;
    }

    // For 429, 500, or 400, throw immediately so the orchestrator can re-queue with a DIFFERENT key
    throw new Error(errData.error || `HTTP ${res.status}`);
  }

  throw new Error(`Model fallback exhausted for batch ${batchIndex + 1}`);
}

/**
 * Validate all API keys in parallel. Returns list of alive keys only.
 * @param {string[]} apiKeys 
 * @param {function} onLog 
 * @returns {Promise<string[]>}
 */
export async function validateKeysParallel(apiKeys, onLog) {
  const results = await Promise.all(apiKeys.map(async (key, idx) => {
    const keyNum = idx + 1;
    const masked = maskKey(key);
    if (onLog) onLog(`🔍 Testing Key ${keyNum} [${masked}]...`);

    try {
      const res = await fetch(`${BACKEND_URL}/scan/validate`, {
        headers: { 'x-gemini-key': key }
      });
      const data = await res.json();
      
      if (data.valid) {
        if (onLog) onLog(`✅ Key ${keyNum} [${masked}]: ${data.msg}`);
        return { key, valid: true };
      } else {
        if (onLog) onLog(`❌ Key ${keyNum} [${masked}]: ${data.msg || 'Invalid'}`);
        return { key, valid: false };
      }
    } catch (err) {
      if (onLog) onLog(`❌ Key ${keyNum} [${masked}]: Failed to reach server (${err.message})`);
      return { key, valid: false };
    }
  }));

  return results.filter(r => r.valid).map(r => r.key);
}

/**
 * Process all PDF batches with round-robin key rotation.
 *
 * When multiple keys available, processes N batches in parallel (N = number of keys).
 * Each key handles one batch at a time, then moves to next batch.
 *
 * @param {string[]} pdfBatches - array of base64 PDF strings
 * @param {number[]} pageCounts - number of pages in each batch
 * @param {string[]} apiKeys - API keys for round-robin
 * @param {object} callbacks
 * @param {function} callbacks.onLog - (message: string) => void
 * @param {function} callbacks.onProgress - (processed: number, total: number) => void
 * @param {function} callbacks.onBatchDone - (batchIndex: number, cardCount: number) => void
 * @param {function} callbacks.onBatchError - (batchIndex: number, error: string) => void
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ cards: object[], failedBatches: number[] }>}
 */
export async function processBatches(pdfBatches, pageCounts, apiKeys, callbacks, signal) {
  const { onLog, onProgress, onBatchDone, onBatchError } = callbacks;
  const totalBatches = pdfBatches.length;
  const totalPages = pageCounts.reduce((a, b) => a + b, 0);

  const orderedCardBatches = Array(totalBatches).fill(null);
  const failedBatches = [];
  let processedPages = 0;

  onLog(`🚀 Starting scan: ${totalPages} images → ${totalBatches} batch(es)`);
  onLog(`   Using ${apiKeys.length} API key(s)`);

  const concurrency = apiKeys.length;
  const queue = Array.from({ length: totalBatches }, (_, i) => ({ batchIndex: i, retries: 0 }));

  onLog(concurrency > 1 ? `⚡ Parallel worker pool: ${concurrency} concurrent keys` : `🚶 Sequential mode`);

  async function worker(workerIndex) {
    const key = apiKeys[workerIndex];
    const keyNum = workerIndex + 1;

    while (queue.length > 0) {
      if (signal?.aborted) break;

      const task = queue.shift();
      if (!task) break;

      const { batchIndex: i, retries } = task;
      const pageCount = pageCounts[i];

      const retryLabel = retries > 0 ? ` (Retry ${retries}/2)` : '';
      onLog(`📤 Batch ${i + 1}/${totalBatches} → Key ${keyNum} [${maskKey(key)}]${retryLabel}`);

      try {
        const result = await sendBatch(pdfBatches[i], key, i, totalBatches, pageCount, signal);
        const cards = addCardIds(result.cards || []);
        orderedCardBatches[i] = cards;
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
          // Push back to end of queue to be retried by the next available worker/key
          queue.push({ batchIndex: i, retries: retries + 1 });
          
          if (err.message.includes('429')) {
            await sleep(15000, signal).catch(() => {});
          } else {
            await sleep(5000, signal).catch(() => {});
          }
        } else {
          processedPages += pageCount;
          failedBatches.push(i);
          orderedCardBatches[i] = []; // Empty array for permanently failed batch
          onBatchError(i, err.message);
          onLog(`❌ Batch ${i + 1}: permanently failed after 3 attempts — ${err.message}`);
          onProgress(processedPages, totalPages);
        }
      }
    }
  }

  // Spawn one worker per API key
  const workers = apiKeys.map((_, idx) => worker(idx));

  try {
    await Promise.all(workers);
  } catch (err) {
    if (err.name === 'AbortError') {
      onLog('⏹ Scan cancelled by user.');
    } else {
      onLog(`❌ Fatal error: ${err.message}`);
    }
  }

  const allCards = orderedCardBatches.filter(b => b !== null).flat();
  const validCount = allCards.length;
  onLog(`\n🏁 Done! ${validCount} cards from ${totalBatches} batches (${failedBatches.length} failed)`);

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
