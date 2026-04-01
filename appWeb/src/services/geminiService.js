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
 * @param {string} pdfBase64
 * @param {string} apiKey
 * @param {number} batchIndex
 * @param {number} totalBatches
 * @param {number} pageCount
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ cards: object[], model_used: string }>}
 */
async function sendBatch(pdfBase64, apiKey, batchIndex, totalBatches, pageCount, signal) {
  let lastError = null;
  let modelIndex = 0;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
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
      lastError = errData;

      if (res.status === 429) {
        // Rate limited — wait and retry with same model
        await sleep(RETRY_DELAY_429, signal);
      } else if (res.status === 404) {
        // Model not found — try next model
        modelIndex = Math.min(modelIndex + 1, 5);
        await sleep(1000, signal);
      } else if (res.status >= 500) {
        // Server error — retry after short delay
        await sleep(RETRY_DELAY_5XX, signal);
      } else {
        // Client error (400, etc.) — don't retry
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_5XX, signal);
      }
    }
  }

  throw new Error(lastError?.error || lastError?.message || `Batch ${batchIndex + 1} failed after ${MAX_RETRIES} retries`);
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

  const allCards = [];
  const failedBatches = [];
  let processedPages = 0;
  let keyIndex = 0;

  const getNextKey = () => {
    const key = apiKeys[keyIndex % apiKeys.length];
    keyIndex++;
    return key;
  };

  const getKeyNum = () => ((keyIndex - 1) % apiKeys.length) + 1;

  onLog(`🚀 Starting scan: ${totalPages} images → ${totalBatches} batch(es)`);
  onLog(`   Using ${apiKeys.length} API key(s)`);

  // Process batches — if multiple keys, run N in parallel
  const concurrency = apiKeys.length;

  if (concurrency <= 1) {
    // Sequential mode
    for (let i = 0; i < totalBatches; i++) {
      if (signal?.aborted) break;

      const key = getNextKey();
      const keyNum = getKeyNum();
      const pageCount = pageCounts[i];

      onLog(`\n── Batch ${i + 1}/${totalBatches}: ${pageCount} pages | Key ${keyNum} [${maskKey(key)}] ──`);

      try {
        const result = await sendBatch(pdfBatches[i], key, i, totalBatches, pageCount, signal);
        const cards = addCardIds(result.cards || []);
        allCards.push(...cards);
        processedPages += pageCount;
        onBatchDone(i, cards.length);
        onLog(`✅ Batch ${i + 1}: ${cards.length} cards extracted (model: ${result.model_used})`);
      } catch (err) {
        if (err.name === 'AbortError') {
          onLog('⏹ Scan cancelled by user.');
          break;
        }
        processedPages += pageCount;
        failedBatches.push(i);
        onBatchError(i, err.message);
        onLog(`❌ Batch ${i + 1}: failed — ${err.message}`);
      }

      onProgress(processedPages, totalPages);

      // Rate limit buffer between batches
      if (i < totalBatches - 1 && !signal?.aborted) {
        onLog(`⏱ Waiting 2s (rate limit buffer)...`);
        await sleep(2000, signal).catch(() => {});
      }
    }
  } else {
    // Parallel mode — process N batches at a time (N = key count)
    onLog(`⚡ Parallel mode: ${concurrency} concurrent workers`);

    for (let start = 0; start < totalBatches; start += concurrency) {
      if (signal?.aborted) break;

      const end = Math.min(start + concurrency, totalBatches);
      const batchSlice = [];

      for (let i = start; i < end; i++) {
        const key = getNextKey();
        const keyNum = getKeyNum();
        onLog(`📤 Batch ${i + 1}/${totalBatches} → Key ${keyNum} [${maskKey(key)}]`);

        batchSlice.push(
          sendBatch(pdfBatches[i], key, i, totalBatches, pageCounts[i], signal)
            .then(result => {
              const cards = addCardIds(result.cards || []);
              allCards.push(...cards);
              processedPages += pageCounts[i];
              onBatchDone(i, cards.length);
              onLog(`✅ Batch ${i + 1}: ${cards.length} cards (model: ${result.model_used})`);
              onProgress(processedPages, totalPages);
              return { success: true, index: i };
            })
            .catch(err => {
              if (err.name === 'AbortError') throw err;
              processedPages += pageCounts[i];
              failedBatches.push(i);
              onBatchError(i, err.message);
              onLog(`❌ Batch ${i + 1}: failed — ${err.message}`);
              onProgress(processedPages, totalPages);
              return { success: false, index: i };
            })
        );
      }

      try {
        await Promise.all(batchSlice);
      } catch (err) {
        if (err.name === 'AbortError') {
          onLog('⏹ Scan cancelled by user.');
          break;
        }
      }

      // Rate limit buffer between rounds
      if (end < totalBatches && !signal?.aborted) {
        onLog(`⏱ Waiting 3s before next round...`);
        await sleep(3000, signal).catch(() => {});
      }
    }
  }

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
