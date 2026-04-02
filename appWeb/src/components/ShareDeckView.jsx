import React, { useState } from 'react';
import { ArrowLeft, Send, Loader2, Copy, Check } from 'lucide-react';

export default function ShareDeckView({ deck, onBack }) {
  const [emails, setEmails] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: '' }
  const [copied, setCopied] = useState(false);

  const handleCopyId = () => {
    if (deck?.deck_id) {
      navigator.clipboard.writeText(deck.deck_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    setMessage(null);
    const googleId = localStorage.getItem('g_id');
    
    if (!googleId) {
      setMessage({ type: 'error', text: 'Please login to Google Drive to share the deck.' });
      return;
    }

    if (!deck || !deck.deck_id) {
       setMessage({ type: 'error', text: 'Error: Current deck is invalid (missing ID).' });
       return;
    }

    const emailList = Array.from(new Set(
      emails.split(/[\n,;]+/)
        .map(e => e.trim())
        .filter(e => e.length > 0 && e.includes('@'))
    ));

    if (emailList.length === 0) {
      setMessage({ type: 'error', text: 'Please enter at least 1 valid email.' });
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

      setMessage({ type: 'success', text: `Successfully shared with ${emailList.length} people!` });
      setTimeout(() => {
        onBack();
      }, 2000);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'An error occurred: ' + err.message });
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="glass-panel" style={{ 
        padding: '1rem 1.5rem', borderRadius: '24px', 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--card-bg)' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button 
            className="btn btn-glass btn-icon" 
            onClick={onBack}
            title="Back to list"
          >
            <ArrowLeft size={20} />
          </button>
          <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Send size={20} color="var(--primary)" /> Share "{deck?.name}"
          </h3>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
          Recipients will receive a standalone clone of this deck. Their future changes will not affect your original deck.
        </p>

        {message && (
          <div style={{
            padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem',
            background: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
            color: message.type === 'error' ? '#ef4444' : '#10b981',
            border: `1px solid ${message.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
          }}>
            {message.text}
          </div>
        )}

        <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.8rem', display: 'block', textTransform: 'uppercase' }}>
          Recipient Emails
        </label>
        <textarea
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="user1@gmail.com, user2@gmail.com&#10;user3@domain.com"
          style={{
            width: '100%', minHeight: '120px', padding: '1rem', borderRadius: '16px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
            color: 'var(--text-main)', fontSize: '0.95rem', outline: 'none', resize: 'vertical',
            marginBottom: '1.5rem', lineHeight: '1.5'
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.6rem 1rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
               Deck ID: <strong style={{color: 'var(--text-main)', margin: '0 0.5rem'}}>{deck?.deck_id}</strong>
            </p>
            <button 
              onClick={handleCopyId}
              className="btn-glass btn-icon"
              style={{ width: '32px', height: '32px', padding: 0, border: 'none' }}
              title="Copy Deck ID"
            >
              {copied ? <Check size={16} color="var(--success)" /> : <Copy size={16} />}
            </button>
          </div>
          <button 
            onClick={handleShare}
            disabled={isSharing}
            className="btn btn-primary"
            style={{ padding: '0.8rem 2rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isSharing ? 0.7 : 1 }}
          >
            {isSharing ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            {isSharing ? 'Sharing...' : 'Share Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
