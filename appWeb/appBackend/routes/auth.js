const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const supabase = require('../supabaseClient');

const router = express.Router();

const oauth2Client = new OAuth2Client(
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

    // Lấy thông tin user (email, google_id) qua REST API (nhẹ hơn googleapis)
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    if (!userInfoRes.ok) throw new Error(`Failed to fetch userinfo: ${userInfoRes.status}`);
    const userInfoData = await userInfoRes.json();
    const email = userInfoData.email;
    const googleId = userInfoData.id;

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

        if (upsertErr) console.error("⚠️ Supabase upsert error (does not affect login):", upsertErr);
      }
    } catch (dbErr) {
      console.error("⚠️ Supabase DB error (bỏ qua):", dbErr.message);
    }

    const frontendCallback = process.env.FRONTEND_CALLBACK_URL || 'http://localhost:5173';
    console.log('🔗 Redirecting to:', frontendCallback);
    
    // Điều hướng ngược lại Frontend kèm URL params
    res.redirect(`${frontendCallback}?access_token=${tokens.access_token}&google_id=${googleId}&expiry=${tokens.expiry_date || (Date.now() + 3599000)}&email=${encodeURIComponent(email)}`);
  } catch (error) {
    console.error('❌ OAuth Callback Error:', error.message || error);
    res.status(500).send(`Login failed: ${error.message || 'Unknown error'}`);
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
      return res.status(401).json({ error: 'Session expired or unauthorized. Please log in again via /auth/google' });
    }

    // Refresh token qua REST API trực tiếp (không cần load googleapis)
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: user.refresh_token,
        grant_type: 'refresh_token'
      })
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Token refresh failed: ${errText}`);
    }
    const credentials = await tokenRes.json();

    res.json({
      access_token: credentials.access_token,
      expiry: credentials.expiry_date
    });
  } catch (error) {
    console.error('Refresh Token Error:', error);
    res.status(500).json({ error: 'Failed to refresh token API' });
  }
});

module.exports = router;
