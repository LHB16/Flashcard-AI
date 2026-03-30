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
// ============ DECK PROGRESS (JSONB) ============

// Lưu tiến độ tất cả thẻ của 1 deck (JSONB merge qua RPC)
router.post('/cards/save', async (req, res) => {
  const { google_id, deck_id, cards_map } = req.body;
  // cards_map = { "uuid1": 1, "uuid2": 2 }

  if (!google_id || !deck_id || !cards_map || typeof cards_map !== 'object') {
    return res.status(400).json({ error: 'Missing parameters or invalid cards_map' });
  }

  try {
    const { data, error } = await supabase.rpc('merge_deck_progress', {
      p_google_id: google_id,
      p_deck_id: deck_id,
      p_cards_status: cards_map
    });

    if (error) throw error;
    res.json({ message: 'Deck progress merged successfully' });
  } catch (error) {
    console.error('Merge Deck Progress Error:', error);
    res.status(500).json({ error: 'Lỗi ghi deck progress jsonb' });
  }
});

// Lấy tiến độ thẻ của 1 deck
router.get('/cards/:deck_id', async (req, res) => {
  const { deck_id } = req.params;
  const { google_id } = req.query;

  if (!google_id) return res.status(400).json({ error: 'Missing google_id' });

  try {
    const { data, error } = await supabase
      .from('deck_progress')
      .select('cards_status')
      .eq('google_id', google_id)
      .eq('deck_id', deck_id)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // ignore no rows
    res.json({ data: data ? data.cards_status : {} });
  } catch (error) {
    console.error('Load Deck Progress Error:', error);
    res.status(500).json({ error: 'Lỗi tải deck progress jsonb' });
  }
});

module.exports = router;
