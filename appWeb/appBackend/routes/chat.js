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

    let groqKeys = [];
    if (settings && settings.value) {
      groqKeys = settings.value;
    }
    
    // 2. Chọn API Key (xoay vòng hoặc chọn ngẫu nhiên)
    let selectedKey = null;
    let provider = 'gemini'; // Mặc định là Gemini

    if (groqKeys.length > 0) {
      selectedKey = groqKeys[Math.floor(Math.random() * groqKeys.length)];
      provider = 'groq';
    } else {
      selectedKey = process.env.GEMINI_API_KEY;
    }

    if (!selectedKey) {
      return res.status(500).json({ error: 'Chưa cấu hình API Key (Groq hoặc Gemini)' });
    }

    // 3. Gọi API tương ứng
    let aiResponse = '';
    
    if (provider === 'groq') {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${selectedKey}`,
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
      
      const data = await response.json();
      aiResponse = data.choices?.[0]?.message?.content || 'Xin lỗi, Groq không phản hồi.';
    } else {
      // Fallback: Gemini 1.5 Flash
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
      aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Xin lỗi, Gemini không phản hồi.';
    }

    res.json({ reply: aiResponse, provider });

  } catch (err) {
    console.error('Chat API Error:', err);
    res.status(500).json({ error: 'Lỗi khi kết nối với AI Service' });
  }
});

module.exports = router;
