import express from 'express';
import cors from 'cors';
import scanRouter from './routes/scan.js';

const app = express();
const PORT = process.env.PORT || 3001;

// JSON body limit cao hơn vì nhận PDF base64
app.use(express.json({ limit: '50mb' }));

// Chỉ allow frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://lhb16-flashcard-ai.pages.dev',
}));

// Health check — dùng cho keep-alive (Google Apps Script)
app.get('/ping', (_req, res) => res.json({ ok: true }));

// Mount scan routes
app.use('/scan', scanRouter);

app.listen(PORT, () => {
  console.log(`⚡ Scan server running on port ${PORT}`);
});
