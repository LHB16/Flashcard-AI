import React, { useState } from 'react';
import { X, Plus, Trash, BookOpen, Layers, AlertTriangle, ArrowRight, Trash2, Pencil, LogOut, FileJson } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import ConfirmationModal from './ConfirmationModal';

/**
 * AddDeckView — Create a new deck via Bulk Import or Manual Entry
 * Props: onClose, onDeckCreated, onOpenImport, setConfirmConfig
 */
export default function AddDeckView({ onClose, onDeckCreated, onOpenImport, setConfirmConfig }) {
  const { t } = useTranslation();
  const [deckName, setDeckName] = useState('');
  const [activeTab, setActiveTab] = useState('bulk'); // 'bulk' | 'manual'
  
  // Bulk state
  const [bulkText, setBulkText] = useState('');
  
  // Manual state
  const [manualCards, setManualCards] = useState([]);
  const [currentCard, setCurrentCard] = useState({
    question: '',
    options: ['A. ', 'B. '],
    correct_answers: ['A'],
    question_type: 'single_choice'
  });

  const closeConfirm = () => setConfirmConfig(prev => ({ ...prev, isOpen: false }));

  const showAlert = (title, description, type = 'warning') => {
    setConfirmConfig({
      isOpen: true,
      title,
      description,
      confirmText: "OK",
      type,
      icon: AlertTriangle,
      onConfirm: closeConfirm
    });
  };


  const handleCreateDeck = () => {
    if (!deckName.trim()) {
      showAlert("Missing Name", "Please enter a Deck Name!");
      return;
    }

    let finalCards = [];

    if (activeTab === 'bulk') {
      finalCards = parseBulkText(bulkText);
      if (finalCards.length === 0) {
        showAlert("Format Error", "No valid cards found in Bulk Import text. Check your format!");
        return;
      }
    } else {
      finalCards = manualCards;
      if (finalCards.length === 0) {
        showAlert("Empty Deck", "Please add at least one card manually!");
        return;
      }
    }

    const newDeck = {
      deck_id: Date.now().toString(),
      name: deckName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      cards: finalCards
    };

    onDeckCreated(newDeck);
    resetState();
    onClose();
  };

  const resetState = () => {
    setDeckName('');
    setBulkText('');
    setManualCards([]);
    setCurrentCard({
      question: '',
      options: ['A. ', 'B. '],
      correct_answers: ['A'],
      question_type: 'single_choice'
    });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonData = JSON.parse(event.target.result);
        const decksToAdd = Array.isArray(jsonData) ? jsonData : (jsonData.cards ? [jsonData] : []);
        
        if (decksToAdd.length === 0) {
          showAlert("Invalid File", "Could not find any valid decks in the uploaded file.", "danger");
          return;
        }

        // Add proper IDs to any decks missing them
        const processedDecks = decksToAdd.map(deck => ({
          ...deck,
          deck_id: deck.deck_id || Date.now().toString() + Math.random().toString(36).substr(2, 5)
        }));

        onDeckCreated(processedDecks);
        resetState();
        onClose();
      } catch (err) {
        showAlert("Error", "Cannot read JSON file. Please check again.", "danger");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input to allow uploading same file again
  };

  const parseBulkText = (text) => {
    const cards = [];
    const qParts = text.split(/\{\[\(Q\)\]\}/g);
    
    for (let i = 1; i < qParts.length; i += 2) {
      const question = (qParts[i] || '').trim();
      const afterQ = qParts[i+1] || '';
      
      if (!question) continue;

      const allOptionsRaw = [];
      const aRegex = /\{\[\(A\)\]\}(.*?)\{\[\(A\)\]\}/gs;
      const oRegex = /\{\[\(O\)\]\}(.*?)\{\[\(O\)\]\}/gs;
      
      let match;
      while ((match = aRegex.exec(afterQ)) !== null) {
        allOptionsRaw.push({ text: match[1].trim(), isCorrect: true, pos: match.index });
      }
      while ((match = oRegex.exec(afterQ)) !== null) {
        allOptionsRaw.push({ text: match[1].trim(), isCorrect: false, pos: match.index });
      }
      
      allOptionsRaw.sort((a, b) => a.pos - b.pos);
      
      if (allOptionsRaw.length > 0) {
        const options = [];
        const correctLetters = [];
        
        allOptionsRaw.forEach((opt, idx) => {
          const letter = String.fromCharCode(65 + idx);
          options.push(`${letter}. ${opt.text}`);
          if (opt.isCorrect) correctLetters.push(letter);
        });

        cards.push({
          card_id: uuidv4(),
          question,
          options,
          correct_answers: correctLetters,
          question_type: correctLetters.length > 1 ? 'multiple_choice' : 'single_choice',
          status: 0,
          notes: ''
        });
      }
    }
    return cards;
  };

  const addManualCard = () => {
    if (!currentCard.question.trim()) {
      showAlert("Empty Question", "Question cannot be empty!");
      return;
    }
    setManualCards(prev => [...prev, { ...currentCard, card_id: uuidv4(), status: 0 }]);
    setCurrentCard({
      question: '',
      options: ['A. ', 'B. '],
      correct_answers: ['A'],
      question_type: 'single_choice'
    });
  };

  return (
    <div className="add-deck-container animate-fade-in" style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingBottom: '2rem', width: '100%'
    }}>
      <div className="glass-panel" style={{
        width: '100%', maxWidth: '900px',
        display: 'flex', flexDirection: 'column', 
        background: 'var(--card-bg)', borderRadius: '24px', overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
      }}>
        
        {/* Header */}
        <div style={{
          padding: '1.5rem', borderBottom: '1px solid var(--glass-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px', background: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
            }}>
              <Plus size={24} />
            </div>
            <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-main)', fontWeight: 'bold' }}>{t('common.createNewDeck')}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <label 
              className="btn btn-glass" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '12px', fontSize: '0.9rem', color: 'var(--primary)', cursor: 'pointer', margin: 0 }}
            >
              <FileJson size={16} />
              {t('common.uploadJson')}
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>
            <button 
              onClick={onOpenImport} 
              className="btn btn-glass" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '12px', fontSize: '0.9rem', color: 'var(--primary)' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              Import
            </button>
            <button 
              onClick={() => {
                setConfirmConfig({
                  isOpen: true,
                  title: t('common.discardChangesTitle'),
                  description: t('common.discardChangesDesc'),
                  confirmText: t('common.discard'),
                  type: "danger",
                  icon: AlertTriangle,
                  onConfirm: () => {
                    resetState();
                    onClose();
                    closeConfirm();
                  }
                });
              }} 
              className="btn btn-glass btn-icon"
              style={{ borderRadius: '50%' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Deck Name Input */}
        <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.02)' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            {t('common.deckNameRequired')}
          </label>
          <input 
            type="text"
            value={deckName}
            onChange={e => setDeckName(e.target.value)}
            placeholder="e.g., Biology Chapter 1, English Vocabulary..."
            style={{
              width: '100%', padding: '0.8rem 1rem', background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--glass-border)', borderRadius: '12px', fontSize: '1.1rem',
              color: 'var(--text-main)', outline: 'none'
            }}
          />
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-border)', height: '56px' }}>
          <button 
            onClick={() => setActiveTab('bulk')}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.2s',
              background: activeTab === 'bulk' ? 'rgba(79, 70, 229, 0.05)' : 'transparent',
              color: activeTab === 'bulk' ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'bulk' ? '2px solid var(--primary)' : 'none'
            }}
          >
            <Layers size={18} /> {t('common.bulkImport')}
          </button>
          <button 
            onClick={() => setActiveTab('manual')}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.2s',
              background: activeTab === 'manual' ? 'rgba(79, 70, 229, 0.05)' : 'transparent',
              color: activeTab === 'manual' ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'manual' ? '2px solid var(--primary)' : 'none'
            }}
          >
            <Pencil size={18} /> {t('common.manualEntry')}
          </button>
        </div>

        {/* Body Content */}
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {activeTab === 'bulk' ? (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{
                padding: '1rem', borderRadius: '16px', background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.2)', color: '#60a5fa', fontSize: '0.9rem',
                display: 'flex', gap: '0.8rem', alignItems: 'flex-start'
              }}>
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <p style={{ margin: '0 0 0.5rem', fontWeight: 'bold', textDecoration: 'underline' }}>{t('common.formatInstructions')}</p>
                  <p style={{ margin: '0 0 0.2rem' }}>Wrap question in <b>{"{[(Q)]}"}</b> tags.</p>
                  <p style={{ margin: '0 0 0.2rem' }}>Wrap correct answers in <b>{"{[(A)]}"}</b> tags.</p>
                  <p style={{ margin: '0 0 0.5rem' }}>Wrap wrong options (distractors) in <b>{"{[(O)]}"}</b> tags.</p>
                  <p style={{ margin: 0, opacity: 0.8, fontStyle: 'italic' }}>Example: {"{[(Q)]} What is 1+1? {[(Q)]} {[(A)]} 2 {[(A)]} {[(O)]} 3 {[(O)]} {[(O)]} 4 {[(O)]}"}</p>
                </div>
              </div>
              <textarea 
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder="Paste your content here..."
                style={{
                  width: '100%', minHeight: '250px', padding: '1rem', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--glass-border)', borderRadius: '16px', color: 'var(--text-main)',
                  fontFamily: 'monospace', fontSize: '0.9rem', lineHeight: '1.5', outline: 'none', resize: 'none'
                }}
              />
            </div>
          ) : (
            <div className="animate-fade-in" style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
              {/* Manual Form */}
              <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>Question</label>
                  <textarea 
                    value={currentCard.question}
                    onInput={e => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
                    onChange={e => setCurrentCard(prev => ({ ...prev, question: e.target.value }))}
                    style={{
                      width: '100%', minHeight: '100px', padding: '1rem', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--glass-border)', borderRadius: '16px', color: 'var(--text-main)',
                      outline: 'none', resize: 'none'
                    }}
                    placeholder="Enter question text..."
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 0', borderTop: '1px solid var(--glass-border)', borderBottom: '1px solid var(--glass-border)' }}>
                   <span style={{ fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Type</span>
                   <div style={{ display: 'flex', gap: '0.5rem' }}>
                     {['single_choice', 'multiple_choice'].map(type => {
                       const isActive = currentCard.question_type === type;
                       return (
                         <button
                           key={type}
                           onClick={() => setCurrentCard(p => ({ ...p, question_type: type, correct_answers: type === 'single_choice' ? [p.correct_answers[0]] : p.correct_answers }))}
                           style={{
                             padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
                             border: `1px solid ${isActive ? 'rgba(79, 70, 229, 0.4)' : 'var(--glass-border)'}`,
                             background: isActive ? 'rgba(79, 70, 229, 0.2)' : 'rgba(255,255,255,0.05)',
                             color: isActive ? 'var(--primary)' : 'var(--text-muted)'
                           }}
                         >
                           {type === 'multiple_choice' ? t('deckmanager.multi') : t('deckmanager.single')}
                         </button>
                       )
                     })}
                   </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '1rem' }}>Options (Click letter to toggle correct)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    {currentCard.options.map((opt, idx) => {
                      const letter = String.fromCharCode(65 + idx);
                      const isCorrect = currentCard.correct_answers.includes(letter);
                      return (
                        <div key={idx} style={{ display: 'flex', gap: '0.8rem' }}>
                           <button 
                             onClick={() => {
                               let newCorrect = [...currentCard.correct_answers];
                               if (currentCard.question_type === 'multiple_choice') {
                                 newCorrect = isCorrect ? newCorrect.filter(c => c !== letter) : [...newCorrect, letter];
                               } else {
                                 newCorrect = [letter];
                               }
                               setCurrentCard(p => ({ ...p, correct_answers: newCorrect }));
                             }}
                             style={{
                               width: '40px', height: '40px', flexShrink: 0, borderRadius: '12px', fontWeight: 'bold',
                               display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                               background: isCorrect ? 'var(--success)' : 'rgba(255,255,255,0.05)',
                               color: isCorrect ? '#fff' : 'var(--text-muted)',
                               border: isCorrect ? 'none' : '1px solid var(--glass-border)',
                               boxShadow: isCorrect ? '0 0 15px rgba(16, 185, 129, 0.4)' : 'none',
                               transition: 'all 0.2s'
                             }}
                           >
                             {letter}
                           </button>
                           <textarea 
                             onInput={e => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
                             value={opt.replace(/^[A-Z]\.\s+/, '')}
                             onChange={e => {
                               const newOpts = [...currentCard.options];
                               newOpts[idx] = `${letter}. ${e.target.value}`;
                               setCurrentCard(p => ({ ...p, options: newOpts }));
                             }}
                             style={{
                               flex: 1, padding: '0.65rem 1rem', borderRadius: '12px',
                               background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)',
                               color: 'var(--text-main)', outline: 'none', resize: 'none', minHeight: '40px'
                             }}
                             rows={1}
                           />
                           {currentCard.options.length > 2 && (
                             <button 
                               onClick={() => {
                                 const newOpts = currentCard.options.filter((_, i) => i !== idx)
                                   .map((o, i) => `${String.fromCharCode(65 + i)}. ${o.replace(/^[A-Z]\.\s+/, '')}`);
                                 const newCorrect = [];
                                 currentCard.correct_answers.forEach(c => {
                                   const oldI = c.charCodeAt(0) - 65;
                                   if (oldI < idx) newCorrect.push(c);
                                   else if (oldI > idx) newCorrect.push(String.fromCharCode(c.charCodeAt(0) - 1));
                                 });
                                 setCurrentCard(p => ({ ...p, options: newOpts, correct_answers: newCorrect.length ? newCorrect : ['A'] }));
                               }}
                               style={{
                                 width: '40px', height: '40px', flexShrink: 0, borderRadius: '12px',
                                 display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                 background: 'transparent', border: 'none', color: '#ef4444'
                               }}
                             >
                               <Trash size={18} />
                             </button>
                           )}
                        </div>
                      )
                    })}
                    {currentCard.options.length < 26 && (
                      <button 
                        onClick={() => {
                           const letter = String.fromCharCode(65 + currentCard.options.length);
                           setCurrentCard(p => ({ ...p, options: [...p.options, `${letter}. `] }));
                        }}
                        style={{
                          width: '100%', padding: '0.8rem', borderRadius: '12px', cursor: 'pointer',
                          background: 'rgba(255,255,255,0.05)', border: '1px dashed var(--glass-border)',
                          color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                        }}
                      >
                        <Plus size={18} /> Add Option
                      </button>
                    )}
                  </div>
                </div>

                <button 
                  onClick={addManualCard}
                  className="btn"
                  style={{
                    marginTop: '0.5rem', padding: '1rem', borderRadius: '16px', fontWeight: 'bold',
                    background: 'rgba(79, 70, 229, 0.1)', border: '1px solid rgba(79, 70, 229, 0.3)',
                    color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                  }}
                >
                  <ArrowRight size={20} /> Add this card to Preview
                </button>
              </div>

              {/* Preview List */}
              <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: '1px solid var(--glass-border)', paddingLeft: '1.5rem' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Added Cards ({manualCards.length})</h3>
                    {manualCards.length > 0 && (
                      <button onClick={() => setManualCards([])} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}>Clear all</button>
                    )}
                 </div>
                 <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '450px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                    {manualCards.length === 0 ? (
                      <div style={{ padding: '3rem', border: '1px dashed var(--glass-border)', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem', opacity: 0.4 }}>
                         <BookOpen size={32} />
                         <span style={{ fontSize: '0.8rem' }}>No cards added yet</span>
                      </div>
                    ) : (
                      manualCards.slice().reverse().map((card, idx) => (
                        <div key={card.card_id} className="animate-fade-in" style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '12px', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                          <div style={{ width: '32px', height: '32px', flexShrink: 0, borderRadius: '8px', background: 'rgba(79, 70, 229, 0.2)', color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                             {manualCards.length - idx}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                             <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>{card.question}</p>
                             <p style={{ margin: '0.2rem 0 0', fontSize: '0.65rem', color: 'var(--success)' }}>✓ {card.correct_answers.join(', ')}</p>
                          </div>
                          <button 
                            onClick={() => setManualCards(prev => prev.filter(c => c.card_id !== card.card_id))}
                            style={{ padding: '0.4rem', borderRadius: '8px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                 </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.05)', display: 'flex', gap: '0.8rem' }}>
          <button 
            onClick={() => {
              setConfirmConfig({
                isOpen: true,
                title: t('common.abortCreationTitle'),
                description: t('common.abortCreationDesc'),
                confirmText: t('common.abort'),
                type: "danger",
                icon: AlertTriangle,
                onConfirm: () => {
                  onClose();
                  resetState();
                  closeConfirm();
                }
              });
            }}
            className="btn btn-glass"
            style={{ flex: 1, padding: '1rem', borderRadius: '16px', fontWeight: 'bold' }}
          >
            {t('common.cancel')}
          </button>
          <button 
            onClick={handleCreateDeck}
            className="btn btn-primary"
            style={{ flex: 2, padding: '1rem', borderRadius: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', boxShadow: '0 10px 30px rgba(79,70,229,0.3)' }}
          >
            {activeTab === 'bulk' ? <Layers size={20} /> : <BookOpen size={20} />}
            {t('deckmanager.createDeckNow')}
          </button>
        </div>

      </div>
    </div>
  );
}
