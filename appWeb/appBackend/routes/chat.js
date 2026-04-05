const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

/**
 * POST /chat/ask
 * AI Chat Assistant proxy
 */
router.post('/ask', async (req, res) => {
  const { user_question, card_context, system_prompt } = req.body;

  try {
    // 1. Lấy danh sách API Keys từ Database
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'api_keys')
      .single();

    let groqKeys = settings?.value || [];
    
    let aiResponse = '';
    let provider = '';
    let success = false;

    // 2. Thử lần lượt các key Groq (trộn ngẫu nhiên để cân bằng tải)
    const keysToTry = [...groqKeys].sort(() => 0.5 - Math.random());

    for (const key of keysToTry) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: system_prompt },
              { role: 'user', content: user_question }
            ],
            temperature: 0.7,
            max_tokens: 500
          })
        });
        
        if (!response.ok) {
          console.warn(`Groq key failed with status: ${response.status}`);
          continue; // Rate limit hoặc lỗi auth -> thử key tiếp theo
        }
        
        const data = await response.json();
        if (data.choices?.[0]?.message?.content) {
          aiResponse = data.choices[0].message.content;
          provider = 'groq';
          success = true;
          break; // Tìm được key hoạt động, thoát vòng lặp
        }
      } catch (err) {
        console.error('Groq fetch error:', err.message);
      }
    }

    // 3. Fallback sang Gemini nếu Groq hết key hoặc tất cả đều lỗi
    if (!success && process.env.GEMINI_API_KEY) {
      try {
        const selectedKey = process.env.GEMINI_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${selectedKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `${system_prompt}\n\nUser Question: ${user_question}` }]
            }]
          })
        });
        
        const data = await response.json();
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          aiResponse = data.candidates[0].content.parts[0].text;
          provider = 'gemini';
          success = true;
        }
      } catch (err) {
        console.error('Gemini fallback error:', err.message);
      }
    }

    if (!success) {
      return res.status(500).json({ error: 'Hệ thống AI hiện đang quá tải. Tất cả các API Key đều không gọi được. Vui lòng thử lại sau.' });
    }

    res.json({ reply: aiResponse, provider });

  } catch (err) {
    console.error('Chat API Error:', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi kết nối với AI Service' });
  }
});

module.exports = router;
