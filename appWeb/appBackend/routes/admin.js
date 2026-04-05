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

// Lấy thông tin Dashboard (tổng quan)
router.get('/dashboard', isAdmin, async (req, res) => {
  try {
    // 1. Đếm số lượng User
    const { count: userCount, error: userError } = await supabase
      .from('users')
      .select('google_id', { count: 'exact', head: true });

    // 2. Đọc API Keys + updated_at từ Database
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('value, updated_at')
      .eq('key', 'api_keys')
      .single();

    const apiKeys = settings ? settings.value : [];
    const keysUpdatedAt = settings ? settings.updated_at : null;

    res.json({
      total_users: userCount || 0,
      api_keys: apiKeys,
      keys_updated_at: keysUpdatedAt
    });
  } catch (err) {
    console.error('Admin Dashboard error:', err);
    res.status(500).json({ error: 'Server error while fetching dashboard data' });
  }
});

// Lấy danh sách tất cả Users
router.get('/users', isAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('google_id, email, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ users: users || [] });
  } catch (err) {
    console.error('Admin get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users list' });
  }
});

// Lưu danh sách API Keys vào Database
router.post('/settings/keys', isAdmin, async (req, res) => {
  const { keys } = req.body;
  if (!Array.isArray(keys)) {
    return res.status(400).json({ error: 'Invalid data format' });
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
    res.json({ success: true, message: 'API Keys saved successfully' });
  } catch (err) {
    console.error('Save API Keys error:', err);
    res.status(500).json({ error: 'Failed to save API Keys' });
  }
});

// Xóa 1 API Key theo index — xóa trực tiếp trên server
router.delete('/settings/keys/:index', isAdmin, async (req, res) => {
  const index = parseInt(req.params.index, 10);

  try {
    // 1. Lấy danh sách keys hiện tại
    const { data: settings, error: fetchError } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'api_keys')
      .single();

    if (fetchError) throw fetchError;

    const currentKeys = settings ? settings.value : [];

    if (index < 0 || index >= currentKeys.length) {
      return res.status(400).json({ error: 'Invalid key index' });
    }

    // 2. Xóa key tại index
    const updatedKeys = currentKeys.filter((_, i) => i !== index);

    // 3. Cập nhật lại database
    const { error: updateError } = await supabase
      .from('system_settings')
      .upsert({
        key: 'api_keys',
        value: updatedKeys,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

    if (updateError) throw updateError;

    res.json({ 
      success: true, 
      message: 'API Key deleted successfully',
      api_keys: updatedKeys,
      keys_updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Delete API Key error:', err);
    res.status(500).json({ error: 'Failed to delete API Key' });
  }
});

module.exports = router;
