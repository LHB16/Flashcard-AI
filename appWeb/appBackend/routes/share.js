const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Chia sẻ deck (Share Deck)
router.post('/create', async (req, res) => {
  const { google_id, deck_id, deck_data, receiver_emails } = req.body;

  if (!google_id || !deck_id || !deck_data) {
    return res.status(400).json({ error: 'Thiếu tham số bắt buộc để chia sẻ bộ thẻ' });
  }

  try {
    // 1. Lưu nội dung deck vào bảng shared_decks (Upsert)
    const { error: deckError } = await supabase
      .from('shared_decks')
      .upsert({
        deck_id,
        owner_id: google_id,
        deck_data,
        updated_at: new Date().toISOString()
      }, { onConflict: 'deck_id' });

    if (deckError) throw deckError;

    // 2. Cập nhật danh sách invites (những email được phép truy cập)
    // Để an toàn, xóa toàn bộ email cũ của deck này trước, sau đó insert array email mới.
    const { error: deleteError } = await supabase
      .from('deck_invites')
      .delete()
      .eq('deck_id', deck_id);

    if (deleteError) throw deleteError;

    // Nếu có email để thêm, ta insert vào
    if (receiver_emails && Array.isArray(receiver_emails) && receiver_emails.length > 0) {
      // Chuẩn bị dữ liệu để insert multi-row
      const inviteData = receiver_emails.map((email) => ({
        deck_id,
        receiver_email: email,
      }));

      const { error: inviteError } = await supabase
        .from('deck_invites')
        .insert(inviteData);

      if (inviteError) throw inviteError;
    }

    res.json({ message: 'Chia sẻ bộ thẻ thành công' });
  } catch (error) {
    console.error('Share Deck Error:', error);
    res.status(500).json({ error: 'Lỗi khi lưu bộ thẻ chia sẻ lên Supabase' });
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
    // 1. Kiểm tra xem email có nằm trong danh sách được mời của deck này không
    const { data: inviteData, error: inviteError } = await supabase
      .from('deck_invites')
      .select('*')
      .eq('deck_id', deck_id)
      .eq('receiver_email', email)
      .single();

    // PGRST116 là mã lỗi không tìm thấy dòng nào (No rows found)
    if (inviteError && inviteError.code !== 'PGRST116') throw inviteError;

    if (!inviteData) {
      return res.status(403).json({ error: 'Truy cập bị từ chối. Email này không được cấp quyền xem bộ thẻ.' });
    }

    // 2. Lấy dữ liệu deck
    const { data: deckRecord, error: deckError } = await supabase
      .from('shared_decks')
      .select('deck_data')
      .eq('deck_id', deck_id)
      .single();

    if (deckError && deckError.code !== 'PGRST116') throw deckError;

    if (!deckRecord) {
      return res.status(404).json({ error: 'Bộ thẻ chia sẻ không tồn tại hoặc đã bị xóa.' });
    }

    res.json({ data: deckRecord.deck_data });
  } catch (error) {
    console.error('View Shared Deck Error:', error);
    res.status(500).json({ error: 'Lỗi tải bộ thẻ chia sẻ từ Backend Supabase' });
  }
});

module.exports = router;
