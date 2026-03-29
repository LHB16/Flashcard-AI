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

module.exports = router;
