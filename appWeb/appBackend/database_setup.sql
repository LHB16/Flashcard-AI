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

-- 4. Tạo bảng Card Progress lưu tiến độ từng thẻ flashcard
CREATE TABLE IF NOT EXISTS card_progress (
  google_id TEXT REFERENCES users(google_id) ON DELETE CASCADE,
  deck_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  status INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (google_id, deck_id, card_id)
);
