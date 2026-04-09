const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// GET /settings/email?google_id=xxx
router.get('/email', async (req, res) => {
  const { google_id } = req.query;
  if (!google_id) return res.status(400).json({ error: 'Missing google_id' });

  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('receive_email_enabled, send_email_enabled')
      .eq('google_id', google_id)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });

    // No record found → return defaults (both enabled)
    res.json(data || { receive_email_enabled: false, send_email_enabled: true });
  } catch (err) {
    console.error('Get email settings error:', err);
    res.status(500).json({ error: 'Failed to fetch email settings' });
  }
});

// POST /settings/email
router.post('/email', async (req, res) => {
  const { google_id, receive_email_enabled, send_email_enabled } = req.body;
  if (!google_id) return res.status(400).json({ error: 'Missing google_id' });

  try {
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        google_id,
        receive_email_enabled,
        send_email_enabled,
        updated_at: new Date().toISOString()
      });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    console.error('Save email settings error:', err);
    res.status(500).json({ error: 'Failed to save email settings' });
  }
});

// DELETE /settings/delete-all-data
router.delete('/delete-all-data', async (req, res) => {
  const { google_id } = req.body;
  if (!google_id) return res.status(400).json({ error: 'Missing google_id' });

  try {
    // 1. Get user email for notifications cleanup
    const { data: userData } = await supabase
      .from('users')
      .select('email')
      .eq('google_id', google_id)
      .maybeSingle();

    // 2. Delete progress (card-level)
    await supabase
      .from('progress')
      .delete()
      .eq('google_id', google_id);

    // 3. Delete deck_progress
    await supabase
      .from('deck_progress')
      .delete()
      .eq('google_id', google_id);

    // 4. Delete quiz_sessions
    await supabase
      .from('quiz_sessions')
      .delete()
      .eq('google_id', google_id);

    // 5. Delete deck_invites for owned decks
    const { data: ownedDecks } = await supabase
      .from('shared_decks')
      .select('deck_id')
      .eq('owner_id', google_id);

    if (ownedDecks && ownedDecks.length > 0) {
      const deckIds = ownedDecks.map(d => d.deck_id);
      await supabase
        .from('deck_invites')
        .delete()
        .in('deck_id', deckIds);
    }

    // 6. Delete shared_decks owned by user
    await supabase
      .from('shared_decks')
      .delete()
      .eq('owner_id', google_id);

    // 7. Delete notifications for this user
    if (userData?.email) {
      await supabase
        .from('notifications')
        .delete()
        .eq('receiver_email', userData.email);
    }

    // 8. Delete user_settings
    await supabase
      .from('user_settings')
      .delete()
      .eq('google_id', google_id);

    // 9. Delete user account (including refresh_token)
    await supabase
      .from('users')
      .delete()
      .eq('google_id', google_id);

    res.json({ success: true });
  } catch (err) {
    console.error('Nuclear delete error:', err);
    res.status(500).json({ error: 'Failed to delete all data' });
  }
});

module.exports = router;
