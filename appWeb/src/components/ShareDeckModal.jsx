import React, { useState } from 'react';
import { X, Send, Loader2 } from 'lucide-react';

export default function ShareDeckModal({ isOpen, onClose, deck }) {
  const [emails, setEmails] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: '' }

  if (!isOpen) return null;

  const handleShare = async () => {
    setMessage(null);
    const googleId = localStorage.getItem('g_id');
    
    if (!googleId) {
      setMessage({ type: 'error', text: 'Vui lòng đăng nhập Google Drive để chia sẻ bộ thẻ.' });
      return;
    }

    if (!deck || !deck.deck_id) {
       setMessage({ type: 'error', text: 'Lỗi: Deck hiện tại không hợp lệ (không có ID).' });
       return;
    }

    // Tách email từ string, bỏ khoảng trắng và filter rỗng, sau đó set để xóa trùng
    const emailList = Array.from(new Set(
      emails.split(/[\n,;]+/)
        .map(e => e.trim())
        .filter(e => e.length > 0 && e.includes('@'))
    ));

    if (emailList.length === 0) {
      setMessage({ type: 'error', text: 'Vui lòng nhập ít nhất 1 email hợp lệ.' });
      return;
    }

    setIsSharing(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'}/share/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          google_id: googleId,
          deck_id: deck.deck_id,
          deck_data: deck,
          receiver_emails: emailList
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Server error');
      }

      setMessage({ type: 'success', text: `Chia sẻ thành công tới ${emailList.length} người!` });
      setTimeout(() => {
        onClose();
        setEmails('');
        setMessage(null);
      }, 2000);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Có lỗi xảy ra: ' + err.message });
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)'
    }}>
      <div className="glass-panel scale-in" style={{
        width: '100%', maxWidth: '500px', background: 'var(--card-bg)', 
        borderRadius: '24px', overflow: 'hidden', padding: '2rem',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
        position: 'relative'
      }}>
        <button 
          onClick={onClose}
          className="btn-glass btn-icon"
          style={{ position: 'absolute', top: '1rem', right: '1rem', border: 'none' }}
        >
          <X size={20} />
        </button>

        <h2 style={{ fontSize: '1.5rem', margin: '0 0 1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Send size={24} color="var(--primary)" /> Share "{deck?.name}"
        </h2>
        
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
          Người nhận sẽ nhận được một bản sao lưu (clone) của Deck này. Những thay đổi về sau của họ sẽ không ảnh hưởng đến bản gốc.
        </p>

        {message && (
          <div style={{
            padding: '1rem', borderRadius: '12px', marginBottom: '1rem',
            background: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
            color: message.type === 'error' ? '#ef4444' : '#10b981',
            border: `1px solid ${message.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
          }}>
            {message.text}
          </div>
        )}

        <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.5rem', display: 'block' }}>
          Email người nhận (cách nhau bởi dấu phẩy hoặc xuống dòng):
        </label>
        <textarea
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="user1@gmail.com, user2@gmail.com&#10;user3@domain.com"
          style={{
            width: '100%', minHeight: '120px', padding: '1rem', borderRadius: '12px',
            background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
            color: 'var(--text-main)', fontSize: '0.95rem', outline: 'none', resize: 'vertical',
            marginBottom: '1.5rem', lineHeight: '1.5'
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
             Deck ID: <strong style={{color: 'var(--text-main)'}}>{deck?.deck_id}</strong>
          </p>
          <button 
            onClick={handleShare}
            disabled={isSharing}
            className="btn btn-primary"
            style={{ padding: '0.8rem 1.5rem', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isSharing ? 0.7 : 1 }}
          >
            {isSharing ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            {isSharing ? 'Đang chia sẻ...' : 'Chia sẻ ngay'}
          </button>
        </div>
      </div>
    </div>
  );
}
