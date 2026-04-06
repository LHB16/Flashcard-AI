require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const progressRoutes = require('./routes/progress');
const scanRoutes = require('./routes/scan');
const shareRoutes = require('./routes/share');
const adminRoutes = require('./routes/admin');
const chatRoutes = require('./routes/chat');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

app.use(express.json({ limit: '100mb' }));

// Google Apps Script Ping Route để giữ cho Render luôn thức
app.get('/ping', (req, res) => {
  res.status(200).send('Pong! Render is alive.');
});

// Route Public lấy Notifications từ Database
const supabase = require('./supabaseClient');
app.get('/notifications', async (req, res) => {
  try {
    const { data: settings, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'notifications')
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // ignore no rows error
    res.json(settings ? settings.value : []);
  } catch (err) {
    console.error('Fetch notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Gắn bộ định tuyến
app.use('/auth', authRoutes);
app.use('/progress', progressRoutes);
app.use('/scan', scanRoutes);
app.use('/share', shareRoutes);
app.use('/admin', adminRoutes);
app.use('/chat', chatRoutes);
app.use('/settings', settingsRoutes);

app.listen(PORT, () => {
  console.log(`Backend Server đang chạy tại cổng: ${PORT}`);
});
