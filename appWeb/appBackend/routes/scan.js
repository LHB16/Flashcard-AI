/**
 * routes/scan.js — Proxy Gemini API for AI Scan
 * Receives PDF base64 + API key from frontend, calls Gemini, returns parsed cards.
 * Key never exposed in browser network tab — only travels server-side.
 */
const express = require('express');
const router = express.Router();

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

/**
 * Clean markdown fences from Gemini response
 */
function cleanJson(text) {
  text = text.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-z]*\n?/, '');
    text = text.replace(/\n?```$/, '');
  }
  return text.trim();
}

/**
 * Auto-fix common JSON issues from Gemini responses:
 * - Trailing commas before ] or }
 * - Missing closing brackets/braces
 * - Unclosed strings (truncated response)
 */
function autoFixJson(text) {
  let fixed = text;

  // 1. Remove trailing commas before ] or }
  fixed = fixed.replace(/,\s*([\]}])/g, '$1');

  // 2. Try to balance brackets — count opens vs closes
  const opens = (fixed.match(/\[/g) || []).length;
  const closes = (fixed.match(/\]/g) || []).length;
  const braceOpens = (fixed.match(/\{/g) || []).length;
  const braceCloses = (fixed.match(/\}/g) || []).length;

  // Close any unclosed braces first, then brackets
  for (let i = 0; i < braceOpens - braceCloses; i++) fixed += '}';
  // Remove trailing comma before adding closing bracket
  fixed = fixed.replace(/,\s*$/, '');
  for (let i = 0; i < opens - closes; i++) fixed += ']';

  // 3. Remove trailing commas again after bracket fix
  fixed = fixed.replace(/,\s*([\]}])/g, '$1');

  return fixed;
}

/**
 * Extract individual JSON objects from a partially valid array string.
 * Useful when the array itself is broken but individual objects are intact.
 */
function extractPartialObjects(text) {
  const objects = [];
  const regex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj.question) objects.push(obj);
    } catch {
      // Skip unparseable fragments
    }
  }
  return objects;
}

/**
 * Parse Gemini response text into cards array.
 * Uses multi-layered recovery: direct parse → regex extract → auto-fix → partial object extraction.
 */
function parseGeminiResponse(responseData) {
  try {
    const candidate = responseData.candidates?.[0];
    if (!candidate) return { cards: [], error: 'No candidates in response' };

    const text = candidate.content?.parts?.[0]?.text;
    if (!text) return { cards: [], error: 'No text in response' };

    const cleaned = cleanJson(text);
    let parsed;
    let recoveryMethod = null;

    // Layer 1: Direct parse
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Layer 2: Regex extract JSON array
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
          recoveryMethod = 'regex_extract';
        } catch {
          // Layer 3: Auto-fix broken JSON (trailing commas, missing brackets)
          try {
            parsed = JSON.parse(autoFixJson(match[0]));
            recoveryMethod = 'auto_fix';
          } catch {
            // Layer 4: Extract individual objects from broken array
            parsed = extractPartialObjects(cleaned);
            recoveryMethod = parsed.length > 0 ? 'partial_recovery' : null;
          }
        }
      } else {
        // No array found at all — try auto-fix on full text
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

    // Convert to card format, skip NOT_A_QUESTION
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

/**
 * GET /scan/validate
 * Header: x-gemini-key
 * Validates the API key by sending a simple prompt to the first working model.
 */
router.get('/validate', async (req, res) => {
  const geminiKey = req.headers['x-gemini-key'];
  if (!geminiKey || !geminiKey.startsWith('AIza')) {
    return res.json({ valid: false, msg: 'Invalid API key format.' });
  }

  for (const model of MODEL_LIST) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Say OK in one word.' }] }] })
      });

      if (geminiRes.ok) {
        return res.json({ valid: true, msg: `✓ Valid (${model})` });
      }

      const errText = await geminiRes.text();
      // If 404, model is not found, try the next one
      if (geminiRes.status === 404 || errText.toLowerCase().includes('not found')) {
        continue;
      }

      // Other error (400, 403, 429) -> invalid or quota exceeded
      return res.json({ valid: false, msg: `Invalid: ${errText.slice(0, 80)}` });
    } catch (err) {
      return res.json({ valid: false, msg: `Error: ${err.message.slice(0, 80)}` });
    }
  }

  return res.json({ valid: false, msg: 'No working model found.' });
});

/**
 * POST /scan/process
 * Body: { pdf_base64, batch_index, total_batches, page_count }
 * Header: x-gemini-key
 */
router.post('/process', async (req, res) => {
  const geminiKey = req.headers['x-gemini-key'];
  const { pdf_base64, batch_index, total_batches, page_count, model_index } = req.body;

  // Validate
  if (!geminiKey || !geminiKey.startsWith('AIza')) {
    return res.status(400).json({ error: 'Invalid API key format. Key must start with "AIza".' });
  }
  if (!pdf_base64) {
    return res.status(400).json({ error: 'Missing pdf_base64 in request body.' });
  }

  // Determine which model to use (allow frontend to specify fallback index)
  const mIdx = Math.min(model_index || 0, MODEL_LIST.length - 1);
  const model = MODEL_LIST[mIdx];

  const sizeKb = Math.round((pdf_base64.length * 3) / 4 / 1024);
  console.log(
    `📤 [Scan] Batch ${batch_index + 1}/${total_batches} | ` +
    `${page_count} pages (${sizeKb}KB) | Model: ${model} | Key: ...${geminiKey.slice(-8)}`
  );

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 120s timeout

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'application/pdf', data: pdf_base64 } },
            { text: GEMINI_PROMPT }
          ]
        }]
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => '');
      console.error(`❌ [Scan] Gemini ${geminiRes.status}: ${errBody.slice(0, 200)}`);

      // Return status so frontend can decide retry/fallback
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
});

module.exports = router;
