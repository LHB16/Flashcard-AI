/**
 * geminiService.js — Orchestrator for AI Scan flow
 * Sends PDF batches to Render backend, which proxies to Gemini API.
 * Handles round-robin keys, retry logic, binary split, and cancellation.
 *
 * Reference: appPython/services/gemini_service.py
 */
import { v4 as uuidv4 } from 'uuid';
import { imagesToPdf } from './pdfService';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const SCAN_URL = import.meta.env.VITE_SCAN_BACKEND_URL || BACKEND_URL;

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
 * Send one PDF batch to backend for Gemini processing.
 * Tries models sequentially if 404 is encountered, otherwise throws on error.
 */
async function sendBatch(pdfBase64, apiKey, batchIndex, totalBatches, pageCount, signal) {
  let modelIndex = 0;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const res = await fetch(`${SCAN_URL}/scan/process`, {
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
      modelIndex = Math.min(modelIndex + 1, 5);
      await sleep(1000, signal);
      continue;
    }

    // For 429, 500, or 400, throw immediately so the orchestrator can re-queue
    const err = new Error(errData.error || `HTTP ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }

  throw new Error(`Model fallback exhausted for batch ${batchIndex + 1}`);
}

/**
 * Validate all API keys in parallel. Returns list of alive keys only.
 */
export async function validateKeysParallel(apiKeys, onLog) {
  const results = await Promise.all(apiKeys.map(async (key, idx) => {
    const keyNum = idx + 1;
    const masked = maskKey(key);
    if (onLog) onLog(`🔍 Testing Key ${keyNum} [${masked}]...`);

    try {
      const res = await fetch(`${SCAN_URL}/scan/validate`, {
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
 * Process all PDF batches with a robust worker pool.
 *
 * Features:
 * - Round-robin key rotation via shared queue
 * - Max 2 retries per batch (with different API key)
 * - Binary Split: permanently failed batches with >1 page get split in half
 *   and re-queued as two smaller sub-batches to isolate problem images
 *
 * @param {string[]} pdfBatches - array of base64 PDF strings
 * @param {number[]} pageCounts - number of pages in each batch
 * @param {string[]} apiKeys - API keys for round-robin
 * @param {object} callbacks
 * @param {AbortSignal} [signal]
 * @param {File[][]} [imageBatches] - original image File[] batches (needed for binary split)
 */
export async function processBatches(pdfBatches, pageCounts, apiKeys, callbacks, signal, imageBatches) {
  const { onLog, onProgress, onBatchDone, onBatchError } = callbacks;
  const totalBatches = pdfBatches.length;
  const totalPages = pageCounts.reduce((a, b) => a + b, 0);

  // Dynamic arrays — can grow when binary split adds sub-batches
  const pdfList = [...pdfBatches];
  const pageList = [...pageCounts];
  const imageList = imageBatches ? [...imageBatches] : null;
  const cardResults = Array(totalBatches).fill(null);
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
      const pageCount = pageList[i];

      const retryLabel = retries > 0 ? ` (Retry ${retries}/2)` : '';
      onLog(`📤 Batch ${i + 1}/${pdfList.length} [${pageCount} pg] → Key ${keyNum} [${maskKey(key)}]${retryLabel}`);

      try {
        const result = await sendBatch(pdfList[i], key, i, pdfList.length, pageCount, signal);
        const cards = addCardIds(result.cards || []);

        // Store result (extend array if needed for sub-batches)
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
          // === BINARY SPLIT: permanently failed batch with >1 page ===
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
            // Can't split (single image or no image data) — give up
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
