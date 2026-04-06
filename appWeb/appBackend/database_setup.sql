-- HƯỚNG DẪN: Copy toàn bộ nội dung file này và chạy trong giao diện SQL Editor của nền tảng Supabase

-- 1. Tạo bảng Users lưu Refresh Token của Google
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  refresh_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tạo bảng Progress lưu Điểm học tập cho đa thiết bị
CREATE TABLE IF NOT EXISTS progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  google_id TEXT REFERENCES users(google_id) ON DELETE CASCADE,
  deck_id TEXT NOT NULL,
  percent INTEGER DEFAULT 0,
  last_studied TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(google_id, deck_id) -- Bắt buộc chỉ có 1 dòng Progress duy nhất cho mỗi user-deck
);

-- 3. Tạo bảng Quiz Sessions lưu phiên làm bài quiz
CREATE TABLE IF NOT EXISTS quiz_sessions (
  deck_id TEXT NOT NULL,
  google_id TEXT REFERENCES users(google_id) ON DELETE CASCADE,
  session_id TEXT,
  question_order JSONB,
  current_index INTEGER DEFAULT 0,
  answers JSONB DEFAULT '{}',
  correct_count INTEGER DEFAULT 0,
  wrong_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (google_id, deck_id)
);

-- 4. Tạo bảng Deck Progress lưu tiến độ tất cả thẻ của 1 bộ bài bằng JSONB
DROP TABLE IF EXISTS card_progress;

CREATE TABLE IF NOT EXISTS deck_progress (
  google_id TEXT REFERENCES users(google_id) ON DELETE CASCADE,
  deck_id TEXT NOT NULL,
  cards_status JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (google_id, deck_id)
);

-- 5. Tạo Function (Stored Procedure) để tự động NỐI (Merge) JSONB thẻ học
CREATE OR REPLACE FUNCTION merge_deck_progress(p_google_id TEXT, p_deck_id TEXT, p_cards_status JSONB)
RETURNS void AS $$
BEGIN
  INSERT INTO deck_progress (google_id, deck_id, cards_status)
  VALUES (p_google_id, p_deck_id, p_cards_status)
  ON CONFLICT (google_id, deck_id)
  DO UPDATE SET 
    cards_status = deck_progress.cards_status || EXCLUDED.cards_status,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 6. Tạo bảng Shared Decks lưu trữ nội dung deck được chia sẻ (JSONB)
CREATE TABLE IF NOT EXISTS shared_decks (
  deck_id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(google_id) ON DELETE CASCADE,
  deck_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Tạo bảng Deck Invites lưu email những người được phép xem deck
CREATE TABLE IF NOT EXISTS deck_invites (
  deck_id TEXT REFERENCES shared_decks(deck_id) ON DELETE CASCADE,
  receiver_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (deck_id, receiver_email)
);

-- 8. Tạo bảng System Settings để lưu API Keys và cấu hình toàn cục
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Thêm các giá trị mặc định nếu chưa có
INSERT INTO system_settings (key, value)
VALUES ('api_keys', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO system_settings (key, value)
VALUES ('notifications', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 9. Tạo bảng Notifications cho người dùng (In-App Notification)
CREATE TABLE IF NOT EXISTS notifications (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  receiver_email TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'deck_shared',
  payload        JSONB NOT NULL,
  is_read        BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_receiver_is_read
  ON notifications(receiver_email, is_read);

-- 10. Tạo bảng User Settings lưu cấu hình cá nhân của người dùng
CREATE TABLE IF NOT EXISTS user_settings (
  google_id             TEXT PRIMARY KEY REFERENCES users(google_id) ON DELETE CASCADE,
  receive_email_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  send_email_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Index cho tìm kiếm nhanh
CREATE INDEX IF NOT EXISTS idx_user_settings_google_id ON user_settings(google_id);

