/**
 * Script 1 lần: Lấy Refresh Token cho tài khoản Gmail notify.
 * 
 * HƯỚNG DẪN:
 * 1. Vào Google Cloud Console → OAuth 2.0 Client IDs
 *    → Thêm "http://localhost:3456/callback" vào Authorized redirect URIs
 * 2. Chạy: node get-gmail-token.js
 * 3. Mở link hiện ra, đăng nhập bằng tài khoản NOTIFY (flashcardai.lhb16.notify@gmail.com)
 * 4. Copy Refresh Token hiện ra → paste vào Render env var: GMAIL_REFRESH_TOKEN
 * 5. Xóa redirect URI tạm khỏi Google Cloud Console (tuỳ chọn)
 */

require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');

const app = express();
const PORT = 3456;

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `http://localhost:${PORT}/callback`
);

// Bước 1: Tạo URL xác thực
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/gmail.send']
});

console.log('\n📧 Gmail Token Helper');
console.log('====================');
console.log('\n👉 Mở link này trong trình duyệt và đăng nhập bằng tài khoản NOTIFY:\n');
console.log(authUrl);
console.log('\n⏳ Đang chờ callback...\n');

// Bước 2: Nhận callback
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    res.send('❌ Không nhận được code!');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('\n✅ THÀNH CÔNG! Copy Refresh Token bên dưới:\n');
    console.log('═══════════════════════════════════════');
    console.log(tokens.refresh_token);
    console.log('═══════════════════════════════════════');
    console.log('\n📋 Paste giá trị trên vào Render → Environment → GMAIL_REFRESH_TOKEN');
    
    res.send(`
      <h2>✅ Thành công!</h2>
      <p>Refresh Token đã hiện trong terminal. Bạn có thể đóng tab này.</p>
      <pre style="background:#f3f4f6;padding:16px;border-radius:8px;word-break:break-all;">${tokens.refresh_token}</pre>
    `);

    // Tự tắt server sau 2 giây
    setTimeout(() => process.exit(0), 2000);
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    res.send('❌ Lỗi: ' + error.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server tạm đang chạy tại http://localhost:${PORT}`);
});
