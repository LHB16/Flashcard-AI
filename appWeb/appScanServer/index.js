import express from 'express';
import cors from 'cors';
import scanRouter from './routes/scan.js';

// ─── Validate required env vars ───
const REQUIRED_ENVS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const missing = REQUIRED_ENVS.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
  console.error('   These are needed for backend-side Google Drive config access.');
  process.exit(1);
}

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
  console.log(`  Config: Backend reads Google Drive config.json (keys never exposed to frontend)`);
});
