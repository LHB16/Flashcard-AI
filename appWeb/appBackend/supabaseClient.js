require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn("⚠️ Cảnh báo: Thiếu SUPABASE_URL hoặc SUPABASE_KEY trong file .env!");
}

const supabase = createClient(supabaseUrl || 'https://mock.supabase.co', supabaseKey || 'mock_key');

module.exports = supabase;
