const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Lưu tiến trình (Save Progress)
router.post('/save', async (req, res) => {
  const { google_id, deck_id, percent } = req.body;

  if (!google_id || !deck_id || percent === undefined) {
    return res.status(400).json({ error: 'Lỗi thiếu params lưu trữ' });
  }

  try {
    const { data, error } = await supabase
      .from('progress')
      .upsert({
        google_id,
        deck_id,
        percent,
        last_studied: new Date().toISOString()
      }, { onConflict: 'google_id,deck_id' }); 

    if (error) throw error;
    res.json({ message: 'Lưu tiến trình Cloud thành công', data });
  } catch (error) {
    console.error('Save Progress Error:', error);
    res.status(500).json({ error: 'Lỗi ghi CSDL Supabase' });
  }
});

// Lấy tiến trình học (Get Progress) về máy hiện tại
router.get('/', async (req, res) => {
  const { google_id } = req.query;

  if (!google_id) return res.status(400).json({ error: 'Missing google_id parameter' });

  try {
    const { data, error } = await supabase
      .from('progress')
      .select('*')
      .eq('google_id', google_id);

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi tải tiến trình Backend Supabase' });
  }
});
// ============ QUIZ SESSIONS ============

// Lưu quiz session
router.post('/quiz/save', async (req, res) => {
  const { google_id, deck_id, session_id, question_order, current_index, answers, correct_count, wrong_count, started_at } = req.body;

  if (!google_id || !deck_id) {
    return res.status(400).json({ error: 'Thiếu google_id hoặc deck_id' });
  }

  try {
    const { data, error } = await supabase
      .from('quiz_sessions')
      .upsert({
        google_id,
        deck_id,
        session_id: session_id || null,
        question_order: question_order || [],
        current_index: current_index || 0,
        answers: answers || {},
        correct_count: correct_count || 0,
        wrong_count: wrong_count || 0,
        started_at: started_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'google_id,deck_id' });

    if (error) throw error;
    res.json({ message: 'Quiz session saved', data });
  } catch (error) {
    console.error('Quiz Save Error:', error);
    res.status(500).json({ error: 'Lỗi lưu quiz session' });
  }
});

// Lấy quiz session theo deck
router.get('/quiz/:deck_id', async (req, res) => {
  const { deck_id } = req.params;
  const { google_id } = req.query;

  if (!google_id) return res.status(400).json({ error: 'Missing google_id' });

  try {
    const { data, error } = await supabase
      .from('quiz_sessions')
      .select('*')
      .eq('google_id', google_id)
      .eq('deck_id', deck_id)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows found
    res.json({ data: data || null });
  } catch (error) {
    console.error('Quiz Load Error:', error);
    res.status(500).json({ error: 'Lỗi tải quiz session' });
  }
});
// ============ CARD PROGRESS (FLASHCARD) ============

// Lưu tiến độ từng thẻ (Bulk Upsert)
router.post('/cards/save', async (req, res) => {
  const { google_id, cards } = req.body;
  // cards = [{ deck_id, card_id, status }]

  if (!google_id || !cards || !Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: 'Missing google_id or valid cards array' });
  }

  // Chuẩn bị payload để upsert
  const upsertData = cards.map(c => ({
    google_id: google_id,
    deck_id: c.deck_id,
    card_id: c.card_id,
    status: c.status,
    updated_at: new Date().toISOString()
  }));

  try {
    const { data, error } = await supabase
      .from('card_progress')
      .upsert(upsertData, { onConflict: 'google_id,deck_id,card_id' });

    if (error) throw error;
    res.json({ message: 'Card progress bulk saved', count: cards.length });
  } catch (error) {
    console.error('Save Card Progress Error:', error);
    res.status(500).json({ error: 'Lỗi ghi card progress' });
  }
});

// Lấy tiến độ các thẻ của 1 deck
router.get('/cards/:deck_id', async (req, res) => {
  const { deck_id } = req.params;
  const { google_id } = req.query;

  if (!google_id) return res.status(400).json({ error: 'Missing google_id' });

  try {
    const { data, error } = await supabase
      .from('card_progress')
      .select('card_id, status')
      .eq('google_id', google_id)
      .eq('deck_id', deck_id);

    if (error) throw error;
    res.json({ data: data || [] }); // Return empty array if no rows
  } catch (error) {
    console.error('Load Card Progress Error:', error);
    res.status(500).json({ error: 'Lỗi tải card progress' });
  }
});

module.exports = router;

