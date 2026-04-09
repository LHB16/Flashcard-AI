/**
 * routes/scan.js — Proxy Gemini API for AI Scan (CJS version)
 *
 * === SECURITY MODEL ===
 * Full API keys NEVER leave the server. Frontend sends google_id,
 * server reads keys from user's Google Drive config.json.
 * Only masked keys are returned to frontend for display.
 *
 * Synced with appScanServer/routes/scan.js (ESM version).
 */
const express = require('express');
const router = express.Router();
const {
  loadConfig,
  saveConfig,
  maskKey,
  getMaskedConfig,
  invalidateConfigCache,
} = require('../driveHelper');

const MODEL_LIST = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
];

const GEMINI_PROMPT = `You are extracting multiple-choice questions from a PDF exam.
Each PAGE contains ONE question. Process EVERY page in order.

=== WHAT TO IGNORE (on every page) ===
- Logos, watermarks, school/course names, page numbers, headers, footers
- Decorative elements not part of the question or options

=== WHAT TO EXTRACT ===
For each page: the question stem and ALL answer options. Note:
- Options may be 2, 3, 4, 5 or more (not always A B C D)
- May require single OR multiple correct answers
- Options labeled with letters (A, B, C...) or numbers (1, 2, 3...)

=== SPECIAL CONTENT HANDLING ===
- Code, math formulas, special symbols: preserve EXACTLY as written
- Partially cut-off options: include visible text + '[...]'

=== FINDING THE CORRECT ANSWER ===
First look for EXPLICIT clues: highlighted/bold/underlined/circled options, checkmarks,
filled bubbles, or a solution/explanation section below the question.
Do NOT include explanation text in the options.

If NO explicit clues are visible on a page, you MUST reason and infer the most likely
correct answer(s) based on your subject knowledge:
- For factual/concept questions: apply domain knowledge to select the best option(s)
- For "multiple_choice" questions: include all options you believe are correct
- Set "inferred": true for that page when you guessed the answer
- NEVER use ["Unknown"] — always provide your best reasoned answer

=== WHEN A PAGE HAS NO QUESTION ===
Set question to "NOT_A_QUESTION" for pages that are:
- Diagram/chart only, blank, title/logo only, or explanation-only pages

=== OUTPUT FORMAT ===
Return ONLY a valid JSON array, one object per page, no markdown:
[
  {
    "question": "question text (without question number prefix)",
    "options": ["A. text", "B. text", "C. text"],
    "correct_answers": ["A"],
    "type": "single_choice",
    "inferred": false
  },
  ...
]

- Include ALL pages in order, even NOT_A_QUESTION ones
- "type": "single_choice" or "multiple_choice"
- "inferred": true if you reasoned/guessed the answer, false if a clue was visible`;

// ════════════════════════════════════
// CONFIG MANAGEMENT ENDPOINTS
// ════════════════════════════════════

router.get('/config', async (req, res) => {
  const googleId = req.query.google_id || req.headers['x-google-id'];
  if (!googleId) return res.status(400).json({ error: 'Missing google_id' });

  try {
    const { config } = await loadConfig(googleId);
    res.json(getMaskedConfig(config));
  } catch (err) {
    console.error(`[Config] Load error for ${googleId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/config/keys', async (req, res) => {
  const { google_id, api_key, replace_index } = req.body;
  if (!google_id) return res.status(400).json({ error: 'Missing google_id' });
  if (!api_key || !api_key.trim()) return res.status(400).json({ error: 'Missing api_key' });

  const trimmedKey = api_key.trim();
  if (!trimmedKey.startsWith('AIza')) {
    return res.status(400).json({ error: 'Invalid key format — must start with "AIza"' });
  }

  try {
    const { config, fileId } = await loadConfig(google_id);
    const keys = config.api_keys || [];

    if (replace_index !== undefined && replace_index !== null) {
      if (replace_index < 0 || replace_index >= keys.length) {
        return res.status(400).json({ error: 'Invalid replace_index' });
      }
      keys[replace_index] = trimmedKey;
    } else {
      if (keys.includes(trimmedKey)) {
        return res.status(409).json({ error: 'Key already exists' });
      }
      keys.push(trimmedKey);
    }

    config.api_keys = keys;
    await saveConfig(google_id, config, fileId);

    res.json({
      masked_key: maskKey(trimmedKey),
      ...getMaskedConfig(config),
    });
  } catch (err) {
    console.error(`[Config] Add key error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/config/keys/:index', async (req, res) => {
  const googleId = req.query.google_id || req.headers['x-google-id'];
  const index = parseInt(req.params.index, 10);
  if (!googleId) return res.status(400).json({ error: 'Missing google_id' });
  if (isNaN(index)) return res.status(400).json({ error: 'Invalid index' });

  try {
    const { config, fileId } = await loadConfig(googleId);
    const keys = config.api_keys || [];

    if (index < 0 || index >= keys.length) {
      return res.status(400).json({ error: 'Index out of range' });
    }

    keys.splice(index, 1);
    config.api_keys = keys;
    await saveConfig(googleId, config, fileId);

    res.json({ success: true, ...getMaskedConfig(config) });
  } catch (err) {
    console.error(`[Config] Delete key error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/config', async (req, res) => {
  const { google_id, batch_size } = req.body;
  if (!google_id) return res.status(400).json({ error: 'Missing google_id' });

  try {
    const { config, fileId } = await loadConfig(google_id);

    if (batch_size !== undefined) {
      config.batch_size = Math.max(1, Math.min(parseInt(batch_size, 10) || 30, 30));
    }

    await saveConfig(google_id, config, fileId);
    res.json({ success: true, ...getMaskedConfig(config) });
  } catch (err) {
    console.error(`[Config] Update error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════
// SCAN OPERATIONS
// ════════════════════════════════════

router.post('/validate-keys', async (req, res) => {
  const { google_id } = req.body;
  if (!google_id) return res.status(400).json({ error: 'Missing google_id' });

  try {
    const { config } = await loadConfig(google_id);
    const keys = config.api_keys || [];

    if (keys.length === 0) {
      return res.json({ results: [] });
    }

    const results = await Promise.all(keys.map(async (key, idx) => {
      const masked = maskKey(key);
      try {
        for (const model of MODEL_LIST) {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
          const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'Say OK in one word.' }] }] }),
          });

          if (geminiRes.ok) {
            return { index: idx, masked, valid: true, msg: `✓ Valid (${model})` };
          }

          const errText = await geminiRes.text();
          if (geminiRes.status === 404 || errText.toLowerCase().includes('not found')) {
            continue;
          }

          return { index: idx, masked, valid: false, msg: `Invalid: ${errText.slice(0, 80)}` };
        }
        return { index: idx, masked, valid: false, msg: 'No working model found.' };
      } catch (err) {
        return { index: idx, masked, valid: false, msg: `Error: ${err.message.slice(0, 80)}` };
      }
    }));

    res.json({ results });
  } catch (err) {
    console.error(`[Validate] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Concurrency Limiter ───
let activeScans = 0;
const MAX_CONCURRENT_SCANS = 5;

router.post('/process', async (req, res) => {
  if (activeScans >= MAX_CONCURRENT_SCANS) {
    console.warn(`⚠ [Scan] Rejected: ${activeScans}/${MAX_CONCURRENT_SCANS} slots busy`);
    return res.status(429).json({
      error: 'Server busy processing other scans. Please retry shortly.',
      retry_after: 5,
    });
  }

  activeScans++;
  try {
    return await handleScanProcess(req, res);
  } finally {
    activeScans--;
  }
});

async function handleScanProcess(req, res) {
  const googleId = req.headers['x-google-id'];
  const keyIndex = parseInt(req.headers['x-key-index'] || '0', 10);
  const { pdf_base64, batch_index, total_batches, page_count, model_index } = req.body;

  if (!googleId) {
    return res.status(400).json({ error: 'Missing x-google-id header.' });
  }
  if (!pdf_base64) {
    return res.status(400).json({ error: 'Missing pdf_base64 in request body.' });
  }

  let geminiKey;
  try {
    const { config } = await loadConfig(googleId);
    const keys = config.api_keys || [];
    if (keyIndex < 0 || keyIndex >= keys.length) {
      return res.status(400).json({ error: `Invalid key_index ${keyIndex}. User has ${keys.length} key(s).` });
    }
    geminiKey = keys[keyIndex];
  } catch (err) {
    return res.status(500).json({ error: `Failed to load config: ${err.message}` });
  }

  if (!geminiKey || !geminiKey.startsWith('AIza')) {
    return res.status(400).json({ error: 'Resolved API key is invalid.' });
  }

  const mIdx = Math.min(model_index || 0, MODEL_LIST.length - 1);
  const model = MODEL_LIST[mIdx];

  const sizeKb = Math.round((pdf_base64.length * 3) / 4 / 1024);
  console.log(
    `📤 [Scan] Batch ${batch_index + 1}/${total_batches} | ` +
    `${page_count} pages (${sizeKb}KB) | Model: ${model} | Key: ${maskKey(geminiKey)}`
  );

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'application/pdf', data: pdf_base64 } },
            { text: GEMINI_PROMPT },
          ],
        }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => '');
      console.error(`❌ [Scan] Gemini ${geminiRes.status}: ${errBody.slice(0, 200)}`);

      return res.status(geminiRes.status).json({
        error: `Gemini API error: ${geminiRes.status}`,
        gemini_status: geminiRes.status,
        detail: errBody.slice(0, 300),
        model_used: model,
        model_index: mIdx,
      });
    }

    const data = await geminiRes.json();
    const { cards, error } = parseGeminiResponse(data);

    if (error) {
      console.warn(`⚠ [Scan] Parse warning batch ${batch_index + 1}: ${error}`);
    }

    console.log(`✅ [Scan] Batch ${batch_index + 1}: ${cards.length} cards extracted`);

    return res.json({
      cards,
      batch_index,
      model_used: model,
      parse_error: error,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error(`⏰ [Scan] Batch ${batch_index + 1} timed out`);
      return res.status(504).json({ error: 'Request to Gemini API timed out (120s)', batch_index });
    }
    console.error(`❌ [Scan] Batch ${batch_index + 1} error:`, err.message);
    return res.status(500).json({ error: err.message, batch_index });
  }
}

// ════════════════════════════════════
// JSON PARSE HELPERS
// ════════════════════════════════════

function cleanJson(text) {
  text = text.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-z]*\n?/, '');
    text = text.replace(/\n?```$/, '');
  }
  return text.trim();
}

function autoFixJson(text) {
  let fixed = text;
  fixed = fixed.replace(/,\s*([\]}])/g, '$1');
  const opens = (fixed.match(/\[/g) || []).length;
  const closes = (fixed.match(/\]/g) || []).length;
  const braceOpens = (fixed.match(/\{/g) || []).length;
  const braceCloses = (fixed.match(/\}/g) || []).length;
  for (let i = 0; i < braceOpens - braceCloses; i++) fixed += '}';
  fixed = fixed.replace(/,\s*$/, '');
  for (let i = 0; i < opens - closes; i++) fixed += ']';
  fixed = fixed.replace(/,\s*([\]}])/g, '$1');
  return fixed;
}

function extractPartialObjects(text) {
  const objects = [];
  const regex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj.question) objects.push(obj);
    } catch {
      // Skip
    }
  }
  return objects;
}

function parseGeminiResponse(responseData) {
  try {
    const candidate = responseData.candidates?.[0];
    if (!candidate) return { cards: [], error: 'No candidates in response' };

    const text = candidate.content?.parts?.[0]?.text;
    if (!text) return { cards: [], error: 'No text in response' };

    const cleaned = cleanJson(text);
    let parsed;
    let recoveryMethod = null;

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
          recoveryMethod = 'regex_extract';
        } catch {
          try {
            parsed = JSON.parse(autoFixJson(match[0]));
            recoveryMethod = 'auto_fix';
          } catch {
            parsed = extractPartialObjects(cleaned);
            recoveryMethod = parsed.length > 0 ? 'partial_recovery' : null;
          }
        }
      } else {
        try {
          parsed = JSON.parse(autoFixJson(cleaned));
          recoveryMethod = 'auto_fix_full';
        } catch {
          parsed = extractPartialObjects(cleaned);
          recoveryMethod = parsed.length > 0 ? 'partial_recovery' : null;
        }
      }
    }

    if (!parsed || (Array.isArray(parsed) && parsed.length === 0)) {
      return { cards: [], error: 'Cannot parse JSON from response' };
    }
    if (!Array.isArray(parsed)) {
      return { cards: [], error: 'Response is not an array' };
    }

    if (recoveryMethod) {
      console.log(`🔧 [JSON Recovery] Used "${recoveryMethod}" to recover ${parsed.length} items`);
    }

    const cards = [];
    for (const item of parsed) {
      const question = (item.question || '').trim();
      if (!question || question === 'NOT_A_QUESTION') continue;

      const inferred = item.inferred === true;
      cards.push({
        question,
        options: item.options || [],
        correct_answers: item.correct_answers || [],
        question_type: item.type === 'multiple_choice' ? 'multiple_choice' : 'single_choice',
        notes: inferred ? '⚠ Đáp án do AI suy luận (không có đáp án rõ trong ảnh)' : '',
      });
    }

    return { cards, error: recoveryMethod ? `Recovered via ${recoveryMethod}` : null };
  } catch (err) {
    return { cards: [], error: `Parse error: ${err.message}` };
  }
}

module.exports = router;
