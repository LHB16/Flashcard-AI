require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn("⚠️ Warning: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file!");
}

const supabase = createClient(supabaseUrl || 'https://mock.supabase.co', supabaseKey || 'mock_key');

module.exports = supabase;
