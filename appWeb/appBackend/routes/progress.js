const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Lưu tiến trình (Save Progress)
router.post('/save', async (req, res) => {
  const { google_id, deck_id, percent } = req.body;

  if (!google_id || !deck_id || percent === undefined) {
    return res.status(400).json({ error: 'Missing required storage params' });
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
    res.json({ message: 'Cloud progress saved successfully', data });
  } catch (error) {
    console.error('Save Progress Error:', error);
    res.status(500).json({ error: 'Failed to write to Supabase DB' });
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
    res.status(500).json({ error: 'Failed to fetch progress from Backend Supabase' });
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
    res.status(500).json({ error: 'Failed to save quiz session' });
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
    res.status(500).json({ error: 'Failed to fetch quiz session' });
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
    res.status(500).json({ error: 'Failed to write deck progress jsonb' });
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
    res.status(500).json({ error: 'Failed to fetch deck progress jsonb' });
  }
});

// Xóa tiến trình của nhiều deck cùng lúc (Clean up when decks are deleted)
router.post('/delete-bulk', async (req, res) => {
  const { google_id, deck_ids } = req.body;

  if (!google_id || !deck_ids || !Array.isArray(deck_ids)) {
    return res.status(400).json({ error: 'Missing google_id or deck_ids array' });
  }

  if (deck_ids.length === 0) {
    return res.json({ message: 'No decks to delete' });
  }

  try {
    // Xóa từ tất cả các bảng liên quan
    const p1 = supabase.from('progress').delete().eq('google_id', google_id).in('deck_id', deck_ids);
    const p2 = supabase.from('quiz_sessions').delete().eq('google_id', google_id).in('deck_id', deck_ids);
    const p3 = supabase.from('deck_progress').delete().eq('google_id', google_id).in('deck_id', deck_ids);

    const results = await Promise.all([p1, p2, p3]);
    
    // Check for errors in any of the results
    const firstError = results.find(r => r.error)?.error;
    if (firstError) throw firstError;
    res.json({ message: 'Database clean up successful', count: deck_ids.length });
  } catch (error) {
    console.error('Bulk Delete Error:', error);
    res.status(500).json({ error: 'Failed to cleanup Supabase DB' });
  }
});

// Update or reset progress when deck structure changes (edit/delete/add cards)
router.post('/deck/on-modified', async (req, res) => {
  const { google_id, deck_id, card_id, action } = req.body;

  if (!google_id || !deck_id) {
    return res.status(400).json({ error: 'Missing google_id or deck_id' });
  }

  try {
    const promises = [];

    // 1. Always reset Quiz Session because indices/order are now broken
    promises.push(
      supabase.from('quiz_sessions')
        .delete()
        .eq('google_id', google_id)
        .eq('deck_id', deck_id)
    );

    // 2. Handle card-specific progress in deck_progress (JSONB)
    if (card_id && (action === 'delete' || action === 'edit')) {
      // First, get current map
      const { data: current } = await supabase
        .from('deck_progress')
        .select('cards_status')
        .eq('google_id', google_id)
        .eq('deck_id', deck_id)
        .single();

      if (current && current.cards_status) {
        let newStatus = { ...current.cards_status };
        if (action === 'delete') {
          delete newStatus[card_id];
        } else if (action === 'edit') {
          newStatus[card_id] = 0; // Reset to unlearned
        }

        promises.push(
          supabase.from('deck_progress')
            .update({ cards_status: newStatus })
            .eq('google_id', google_id)
            .eq('deck_id', deck_id)
        );
      }
    }

    await Promise.all(promises);
    res.json({ message: 'Deck modifications synced to DB' });
  } catch (error) {
    console.error('Deck Modify Sync Error:', error);
    res.status(500).json({ error: 'Failed to sync structural changes' });
  }
});

module.exports = router;
