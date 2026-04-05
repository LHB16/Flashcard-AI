const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Middleware xác thực Admin
const isAdmin = (req, res, next) => {
  const userEmail = req.headers['x-user-email'];
  const ADMIN_EMAIL = 'binhlhce200315@gmail.com';
  
  if (userEmail === ADMIN_EMAIL) {
    next();
  } else {
    res.status(403).json({ error: 'Unauthorized: Admin access only' });
  }
};

// Lấy thông tin Dashboard
router.get('/dashboard', isAdmin, async (req, res) => {
  try {
    // 1. Đếm số lượng User (Dùng google_id làm khóa đếm)
    const { count: userCount, error: userError } = await supabase
      .from('users')
      .select('google_id', { count: 'exact', head: true });

    // 2. Lấy danh sách Decks và thông tin chi tiết
    const { data: deckList, error: deckError } = await supabase
      .from('shared_decks')
      .select('deck_id, deck_name, owner_id, cards, updated_at')
      .order('updated_at', { ascending: false })
      .limit(50);

    // 3. Đọc API Keys từ Database
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'api_keys')
      .single();

    const apiKeys = settings ? settings.value : [];

    // Chuyển đổi dữ liệu deck để phù hợp với Frontend (snake_case)
    const formattedDecks = (deckList || []).map(d => ({
      deck_id: d.deck_id,
      deck_name: d.deck_name,
      owner_id: d.owner_id,
      card_count: d.cards ? d.cards.length : 0,
      last_studied_at: d.updated_at
    }));

    res.json({
      total_users: userCount || 0,
      decks: formattedDecks,
      api_keys: apiKeys
    });
  } catch (err) {
    console.error('Admin Dashboard error:', err);
    res.status(500).json({ error: 'Server error while fetching dashboard data' });
  }
});

// Lưu danh sách API Keys vào Database
router.post('/settings/keys', isAdmin, async (req, res) => {
  const { keys } = req.body;
  if (!Array.isArray(keys)) {
    return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
  }

  try {
    const { error } = await supabase
      .from('system_settings')
      .upsert({ 
        key: 'api_keys', 
        value: keys,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

    if (error) throw error;
    res.json({ success: true, message: 'Đã lưu API Keys vào database' });
  } catch (err) {
    console.error('Save API Keys error:', err);
    res.status(500).json({ error: 'Không thể lưu API Keys vào database' });
  }
});

module.exports = router;
