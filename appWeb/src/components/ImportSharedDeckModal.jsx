import React, { useState, useEffect } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function ImportSharedDeckModal({ isOpen, onClose, onDeckImported, initialDeckId = '' }) {
  const [deckId, setDeckId] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (initialDeckId) setDeckId(initialDeckId);
      else setDeckId('');
      setMessage(null);
    }
  }, [isOpen, initialDeckId]);

  if (!isOpen) return null;

  const handleImport = async () => {
    setMessage(null);
    const googleId = localStorage.getItem('g_id');
    const userEmail = localStorage.getItem('g_email');
    
    if (!googleId || !userEmail) {
      setMessage({ type: 'error', text: 'Please login to Google Drive to download the shared deck.' });
      return;
    }

    const trimmedId = deckId.trim();
    if (!trimmedId) {
      setMessage({ type: 'error', text: 'Please enter a Deck ID.' });
      return;
    }

    setIsImporting(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'}/share/view/${trimmedId}?email=${encodeURIComponent(userEmail)}`);
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Server error');
      }

      if (!result.data) {
        throw new Error('Downloaded deck data is invalid.');
      }

      // CLONE LOGIC
      const clonedDeck = { ...result.data };
      clonedDeck.deck_id = uuidv4(); // Generate new unique ID for the receiver
      
      // Update timestamps
      const now = new Date().toISOString();
      clonedDeck.created_at = now;
      clonedDeck.updated_at = now;

      // Reset progress
      if (clonedDeck.cards && Array.isArray(clonedDeck.cards)) {
        clonedDeck.cards = clonedDeck.cards.map(card => ({
          ...card,
          status: 0,
          card_id: card.card_id || uuidv4()
        }));
      }

      setMessage({ type: 'success', text: 'Deck downloaded successfully! Saving to your library...' });
      
      setTimeout(() => {
        onDeckImported(clonedDeck);
        onClose();
        setDeckId('');
        setMessage(null);
      }, 1500);

    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'An error occurred: ' + err.message });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)'
    }}>
      <div className="glass-panel scale-in" style={{
        width: '100%', maxWidth: '400px', background: 'var(--card-bg)', 
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
          <Download size={24} color="var(--primary)" /> Import Deck
        </h2>
        
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
          Enter the Deck ID shared with your email to download a clone of the deck to your library.
        </p>

        {message && (
          <div style={{
            padding: '1rem', borderRadius: '12px', marginBottom: '1rem',
            background: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
            color: message.type === 'error' ? '#ef4444' : '#10b981',
            border: `1px solid ${message.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
            fontSize: '0.9rem'
          }}>
            {message.text}
          </div>
        )}

        <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.5rem', display: 'block' }}>
          Deck ID:
        </label>
        <input
          type="text"
          value={deckId}
          onChange={(e) => setDeckId(e.target.value)}
          placeholder="Enter Deck ID..."
          style={{
            width: '100%', padding: '0.8rem 1rem', borderRadius: '12px',
            background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
            color: 'var(--text-main)', fontSize: '1rem', outline: 'none',
            marginBottom: '1.5rem'
          }}
        />

        <button 
          onClick={handleImport}
          disabled={isImporting}
          className="btn btn-primary"
          style={{ padding: '0.8rem 1.5rem', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: isImporting ? 0.7 : 1, width: '100%' }}
        >
          {isImporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          {isImporting ? 'Downloading...' : 'Download Deck'}
        </button>
      </div>
    </div>
  );
}
