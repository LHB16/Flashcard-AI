const express = require('express');
const { google } = require('googleapis');
const supabase = require('../supabaseClient');

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// 1. Redirect tới Google
router.get('/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Ép trả Refresh Token
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/drive.appdata',
      'https://www.googleapis.com/auth/drive.file'
    ]
  });
  res.redirect(url);
});

// 2. Callback nhận Authorization Code
router.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Không nhận được mã ủy quyền từ Google.');

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Lấy thông tin user (email, google_id)
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;
    const googleId = userInfo.data.id;

    let refreshToken = tokens.refresh_token;

    // Lưu refresh token vào Supabase (không crash nếu lỗi DB)
    try {
      const { data: user } = await supabase
        .from('users')
        .select('refresh_token')
        .eq('google_id', googleId)
        .single();

      if (user && !refreshToken) {
        refreshToken = user.refresh_token; 
      }

      if (refreshToken) {
        const { error: upsertErr } = await supabase
          .from('users')
          .upsert({
            google_id: googleId,
            email: email,
            refresh_token: refreshToken,
            updated_at: new Date()
          }, { onConflict: 'google_id' });

        if (upsertErr) console.error("⚠️ Supabase upsert lỗi (không ảnh hưởng login):", upsertErr);
      }
    } catch (dbErr) {
      console.error("⚠️ Supabase DB error (bỏ qua):", dbErr.message);
    }

    const frontendCallback = process.env.FRONTEND_CALLBACK_URL || 'http://localhost:5173';
    console.log('🔗 Redirecting to:', frontendCallback);
    
    // Điều hướng ngược lại Frontend kèm URL params
    res.redirect(`${frontendCallback}?access_token=${tokens.access_token}&google_id=${googleId}&expiry=${tokens.expiry_date || (Date.now() + 3599000)}&email=${encodeURIComponent(email)}`);
  } catch (error) {
    console.error('❌ Lỗi Callback OAuth:', error.message || error);
    res.status(500).send(`Đăng nhập thất bại: ${error.message || 'Unknown error'}`);
  }
});

// 3. API để Frontend xin Token mới tự động
router.post('/refresh', async (req, res) => {
  const { google_id } = req.body;
  
  if (!google_id) {
    return res.status(400).json({ error: 'Cần google_id' });
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('refresh_token')
      .eq('google_id', google_id)
      .single();

    if (error || !user || !user.refresh_token) {
      return res.status(401).json({ error: 'Phiên bị hủy hoặc chưa cấp phép. Vui lòng login lại qua luồng /auth/google' });
    }

    oauth2Client.setCredentials({ refresh_token: user.refresh_token });
    const { credentials } = await oauth2Client.refreshAccessToken();

    res.json({
      access_token: credentials.access_token,
      expiry: credentials.expiry_date
    });
  } catch (error) {
    console.error('Lỗi Refresh Token:', error);
    res.status(500).json({ error: 'Failed to refresh token API' });
  }
});

module.exports = router;
