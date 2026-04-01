require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const progressRoutes = require('./routes/progress');
const scanRoutes = require('./routes/scan');

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

// Gắn bộ định tuyến
app.use('/auth', authRoutes);
app.use('/progress', progressRoutes);
app.use('/scan', scanRoutes);

app.listen(PORT, () => {
  console.log(`Backend Server đang chạy tại cổng: ${PORT}`);
});
