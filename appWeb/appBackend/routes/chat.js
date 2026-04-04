const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../settings.json');

/**
 * POST /chat/ask
 * Handles AI Tutor responses based on card context.
 */
router.post('/ask', async (req, res) => {
  try {
    const { question, cardContext } = req.body;
    if (!question) return res.status(400).json({ error: 'Missing question' });

    // 1. Get API Key strategy:
    // First, check if there's a Groq Key configured via Admin Dashboard.
    // If not, fallback to server-side GEMINI_API_KEY from .env.
    let apiKey = process.env.GEMINI_API_KEY;
    let apiProvider = 'gemini';
    
    if (fs.existsSync(SETTINGS_FILE)) {
      try {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        if (settings.groq_keys && settings.groq_keys.length > 0) {
          apiKey = settings.groq_keys[0]; // Round-robin could be implemented here
          apiProvider = 'groq';
        }
      } catch (e) {
        console.error("Failed to read settings.json for chat:", e);
      }
    }

    if (!apiKey) {
      return res.status(500).json({ error: 'Server AI Key missing. Please configure Groq Keys in Admin Dashboard or set GEMINI_API_KEY in .env' });
    }

    const systemPrompt = `You are "AI Tutor", a senior educator specialized in active recall and flashcard learning.
Explain the concepts clearly, concisely, and provide helpful examples.

Current Flashcard Context:
- Question: ${cardContext.question}
- Options: ${cardContext.options?.join(', ') || 'None'}
- Correct Answer: ${cardContext.correct_answer || 'None'}
- Additional Notes: ${cardContext.notes || 'None'}

User is asking about this card: "${question}"`;

    let answer = "";
    
    if (apiProvider === 'groq') {
       // Groq API Call
       const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           'Authorization': `Bearer ${apiKey}`
         },
         body: JSON.stringify({
           model: "llama-3.3-70b-versatile",
           messages: [
             { role: "system", content: systemPrompt },
             { role: "user", content: question }
           ],
           temperature: 0.7,
           max_completion_tokens: 1000
         })
       });

       if (!groqRes.ok) {
         const err = await groqRes.text();
         throw new Error(`Groq API Error (${groqRes.status}): ${err}`);
       }

       const data = await groqRes.json();
       answer = data.choices?.[0]?.message?.content || "AI was unable to provide an answer.";
    } else {
       // Google Gemini API Call
       const model = 'gemini-1.5-flash';
       const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
       const geminiRes = await fetch(geminiUrl, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           contents: [{ 
             parts: [{ text: `${systemPrompt}\n\nHelpful Explanation:` }]
           }],
           generationConfig: {
             temperature: 0.7,
             maxOutputTokens: 1000
           }
         })
       });

       if (!geminiRes.ok) {
         const err = await geminiRes.text();
         throw new Error(`Gemini API Error (${geminiRes.status}): ${err}`);
       }

       const data = await geminiRes.json();
       answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "AI was unable to provide an answer.";
    }

    res.json({ answer });
  } catch (err) {
    console.error("Chat Tutor Request Failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
