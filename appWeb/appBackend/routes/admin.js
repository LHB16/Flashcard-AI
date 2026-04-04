const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../settings.json');

// Helper to check admin
const isAdmin = (req, res, next) => {
  const email = req.headers['x-user-email'];
  if (email === 'binhlhce200315@gmail.com') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied' });
  }
};

/**
 * GET /admin/dashboard
 * Returns overall system stats and current Groq API keys.
 */
router.get('/dashboard', isAdmin, async (req, res) => {
  try {
    // 1. Get stats from Supabase
    const { count: userCount, error: userError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });
      
    const { count: deckCount, error: deckError } = await supabase
      .from('shared_decks')
      .select('*', { count: 'exact', head: true });

    if (userError) console.error("User stats error:", userError);
    if (deckError) console.error("Deck stats error:", deckError);

    // 2. Load API keys from settings file
    let apiKeys = [];
    if (fs.existsSync(SETTINGS_FILE)) {
      try {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        apiKeys = settings.groq_keys || [];
      } catch (e) {
        console.error("Failed to parse settings.json:", e);
      }
    }

    res.json({
      stats: {
        totalUsers: userCount || 0,
        totalDecks: deckCount || 0,
      },
      apiKeys: apiKeys
    });
  } catch (err) {
    console.error("Admin Dashboard error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /admin/settings/keys
 * Saves the Groq API keys to settings.json.
 */
router.post('/settings/keys', isAdmin, async (req, res) => {
  try {
    const { keys } = req.body;
    if (!Array.isArray(keys)) {
      return res.status(400).json({ error: 'Keys must be an array' });
    }

    let settings = {};
    if (fs.existsSync(SETTINGS_FILE)) {
      try {
        settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      } catch (e) {
        // Ignore parse error, start fresh
      }
    }

    settings.groq_keys = keys;
    settings.updated_at = new Date().toISOString();

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err) {
    console.error("Save keys error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
