const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_NOTIFY,
    pass: process.env.EMAIL_PASS
  }
});

// Chia sẻ deck (Share Deck)
router.post('/create', async (req, res) => {
  const { google_id, deck_id, deck_data, receiver_emails } = req.body;

  if (!google_id || !deck_id || !deck_data) {
    return res.status(400).json({ error: 'Missing required parameters to share deck' });
  }

  try {
    // [existing Supabase logic preserved]
    const { error: deckError } = await supabase
      .from('shared_decks')
      .upsert({
        deck_id,
        owner_id: google_id,
        deck_data,
        updated_at: new Date().toISOString()
      }, { onConflict: 'deck_id' });

    if (deckError) throw deckError;

    const { error: deleteError } = await supabase
      .from('deck_invites')
      .delete()
      .eq('deck_id', deck_id);

    if (deleteError) throw deleteError;

    if (receiver_emails && Array.isArray(receiver_emails) && receiver_emails.length > 0) {
      const inviteData = receiver_emails.map((email) => ({
        deck_id,
        receiver_email: email,
      }));

      const { error: inviteError } = await supabase
        .from('deck_invites')
        .insert(inviteData);

      if (inviteError) throw inviteError;
    }

    // Extract deck name
    const deckName = deck_data.name;

    // Fetch sender email from Supabase
    const { data: senderData, error: senderError } = await supabase
      .from('users')
      .select('email')
      .eq('google_id', google_id)
      .single();

    if (senderError || !senderData) {
      console.error('Sender lookup failed:', senderError);
      return res.status(404).json({ error: 'Sender not found' });
    }

    const senderEmail = senderData.email;

    // Build and send invitation email
    const mailOptions = {
      from: `"Flashcard AI" <${process.env.EMAIL_NOTIFY}>`,
      to: receiver_emails.join(', '),
      subject: `${senderEmail} shared the Flashcard Deck "${deckName}" with you`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: auto; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); overflow: hidden; border: 1px solid #e5e7eb;">
          <!-- Header Banner -->
          <div style="background: #2563eb; padding: 24px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">📖 Flashcard AI</h1>
            <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">You've been invited to study a new deck!</p>
          </div>

          <!-- Body -->
          <div style="background: #ffffff; padding: 28px 32px;">
            <p style="margin: 0 0 16px 0; font-size: 16px; color: #111827;">Hi there,</p>

            <p style="margin: 0 0 12px 0; font-size: 15px; color: #374151; line-height: 1.6;">
              You've received an invitation to study a new Flashcard deck, shared by <strong style="color: #111827;">${senderEmail}</strong>.
            </p>

            <p style="margin: 0 0 20px 0; font-size: 15px; color: #374151; line-height: 1.6;">
              📚 <strong>Deck Name:</strong> ${deckName}
            </p>

            <!-- Deck ID Highlight Box -->
            <div style="background: #eff6ff; border: 1.5px solid #bfdbfe; border-radius: 8px; padding: 14px 20px; margin-bottom: 20px;">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">🔑 Deck ID</p>
              <p style="margin: 0; font-family: 'Courier New', monospace; font-size: 20px; color: #1d4ed8; letter-spacing: 1px; font-weight: 600; word-break: break-all;">${deck_id}</p>
            </div>

            <p style="margin: 0; font-size: 14px; color: #374151; font-style: italic; line-height: 1.5;">
              To get started, open Flashcard AI, tap "Add Deck" → "Import", and paste the Deck ID above.
            </p>
          </div>

          <!-- Footer -->
          <div style="padding: 20px 32px; background: #f9fafb;">
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0 0 16px 0;" />
            <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">
              This invitation was sent via Flashcard AI. If you didn't expect this email, you can safely ignore it.
            </p>
          </div>
        </div>
      `
    };

    // Fire-and-forget sendMail (không block response)
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) console.error('Mail error:', error);
      else console.log('Mail sent:', info.response);
    });

    res.json({ message: 'Deck shared and invites sent successfully!' });
  } catch (error) {
    console.error('Share Deck Error:', error);
    res.status(500).json({ error: 'Failed to share deck to Supabase' });
  }
});

// Xem deck được chia sẻ (View Shared Deck)
router.get('/view/:deck_id', async (req, res) => {
  const { deck_id } = req.params;
  const { email } = req.query;

  if (!deck_id || !email) {
    return res.status(400).json({ error: 'Thiếu deck_id hoặc email' });
  }

  try {
    const { data: inviteData, error: inviteError } = await supabase
      .from('deck_invites')
      .select('*')
      .eq('deck_id', deck_id)
      .eq('receiver_email', email)
      .single();

    if (inviteError && inviteError.code !== 'PGRST116') throw inviteError;

    if (!inviteData) {
      return res.status(403).json({ error: 'Access denied. This email is not authorized to view the deck.' });
    }

    const { data: deckRecord, error: deckError } = await supabase
      .from('shared_decks')
      .select('deck_data')
      .eq('deck_id', deck_id)
      .single();

    if (deckError && deckError.code !== 'PGRST116') throw deckError;

    if (!deckRecord) {
      return res.status(404).json({ error: 'Shared deck does not exist or has been deleted.' });
    }

    res.json({ data: deckRecord.deck_data });
  } catch (error) {
    console.error('View Shared Deck Error:', error);
    res.status(500).json({ error: 'Failed to fetch shared deck from Supabase' });
  }
});

module.exports = router;

