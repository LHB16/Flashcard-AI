import React, { useState, useEffect } from 'react';
import { ArrowLeft, Send, Loader2, Copy, Check, Trash2, User } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';

export default function ShareDeckView({ deck, onBack }) {
  const [emails, setEmails] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: '' }
  const [copied, setCopied] = useState(false);
  const [currentInvites, setCurrentInvites] = useState([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(true);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, email: null });
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchInvites = async () => {
    setIsLoadingInvites(true);
    try {
      const googleId = localStorage.getItem('g_id');
      if (!googleId || !deck?.deck_id) {
        setIsLoadingInvites(false);
        return;
      }
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'}/share/invites/${deck.deck_id}?google_id=${googleId}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentInvites(data.invites || []);
      } else {
        const errData = await res.json();
        console.error('Failed to fetch invites:', errData);
      }
    } catch(err) {
      console.error('Network error fetching invites:', err);
    } finally {
      setIsLoadingInvites(false);
    }
  };

  useEffect(() => {
    if (deck?.deck_id) {
      fetchInvites();
    }
  }, [deck?.deck_id]);

  const removeInvite = async () => {
    if (!deleteModal.email) return;
    setIsDeleting(true);
    try {
      const googleId = localStorage.getItem('g_id');
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'}/share/invite`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deck_id: deck.deck_id,
          receiver_email: deleteModal.email,
          google_id: googleId
        })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to remove');
      
      setCurrentInvites(prev => prev.filter(inv => inv.receiver_email !== deleteModal.email));
      setDeleteModal({ isOpen: false, email: null });
    } catch(err) {
      console.error(err);
      setMessage({ type: 'error', text: err.message });
      setDeleteModal({ isOpen: false, email: null });
    } finally {
      setIsDeleting(false);
    }
  };

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

      if (result.newlySharedCount === 0) {
        setMessage({ type: 'error', text: result.message });
        fetchInvites();
      } else {
        setMessage({ type: 'success', text: result.message || `Successfully shared!` });
        setEmails('');
        fetchInvites();
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'An error occurred: ' + err.message });
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Send size={20} color="var(--primary)" /> Share "{deck?.name}"
        </h3>
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

        {/* Danh sách người đang được share */}
        <div style={{ marginBottom: '2rem' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>Currently Shared with ({currentInvites.length} {currentInvites.length === 1 ? 'person' : 'people'})</span>
          </h4>
          
          <div style={{ 
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)',
            borderRadius: '16px', overflow: 'hidden'
          }}>
            {isLoadingInvites ? (
              <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <Loader2 size={24} className="animate-spin" />
              </div>
            ) : currentInvites.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                No one has been shared this deck yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {currentInvites.map((inv, idx) => (
                  <div key={inv.id} style={{
                    display: 'flex', alignItems: 'center', padding: '1rem',
                    borderBottom: idx < currentInvites.length - 1 ? '1px solid var(--glass-border)' : 'none',
                    gap: '1rem'
                  }}>
                    <div style={{ 
                      width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary-light)', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)'
                    }}>
                      <User size={18} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-main)', fontWeight: 500 }}>{inv.receiver_email}</p>
                      <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Shared on: {new Date(inv.created_at).toLocaleDateString('en-US')}
                      </p>
                    </div>
                    <button
                      onClick={() => setDeleteModal({ isOpen: true, email: inv.receiver_email })}
                      className="btn-icon"
                      style={{ 
                        background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', 
                        border: '1px solid rgba(239, 68, 68, 0.2)', width: '36px', height: '36px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px'
                      }}
                      title="Remove access"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

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

      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, email: null })}
        onConfirm={removeInvite}
        title="Remove Access"
        description={`Are you sure you want to remove access for ${deleteModal.email}? They will no longer be able to access this deck via ID.`}
        confirmText="Remove"
        cancelText="Cancel"
        type="danger"
        isLoading={isDeleting}
        icon={Trash2}
      />
    </div>
  );
}
