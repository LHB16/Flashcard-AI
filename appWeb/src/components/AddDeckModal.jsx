import React, { useState, useCallback, useRef, useEffect } from 'react';
import { X, Plus, Trash, BookOpen, Layers, CheckCircle2, AlertTriangle, ArrowRight, Trash2, Pencil } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

/**
 * AddDeckModal — Create a new deck via Bulk Import or Manual Entry
 * Props: isOpen, onClose, onDeckCreated
 */
export default function AddDeckModal({ isOpen, onClose, onDeckCreated }) {
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

  if (!isOpen) return null;

  const handleCreateDeck = () => {
    if (!deckName.trim()) {
      alert("Please enter a Deck Name!");
      return;
    }

    let finalCards = [];

    if (activeTab === 'bulk') {
      finalCards = parseBulkText(bulkText);
      if (finalCards.length === 0) {
        alert("No valid cards found in Bulk Import text. Check your format!");
        return;
      }
    } else {
      finalCards = manualCards;
      if (finalCards.length === 0) {
        alert("Please add at least one card manually!");
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

  const parseBulkText = (text) => {
    const cards = [];
    // Split by {[(Q)]} to find question blocks. 
    // Format: ... {[(Q)]} Q-Content {[(Q)]} {[(A)]} A-Content {[(A)]} {[(O)]} O-Content {[(O)]} ...
    const qParts = text.split(/\{\[\(Q\)\]\}/g);
    
    // Index 1, 3, 5... are the questions
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
      
      // Sort by position in text for natural order
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
      alert("Question cannot be empty!");
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
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-[var(--card-bg)] border border-[var(--glass-border)] rounded-[24px] shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-[var(--glass-border)] flex justify-between items-center bg-black/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--primary)] flex items-center justify-center text-white">
              <Plus size={24} />
            </div>
            <h2 className="text-xl font-bold text-[var(--text-main)]">Create New Deck</h2>
          </div>
          <button 
            onClick={() => {
              if (window.confirm("Discard changes? All input data will be lost.")) {
                resetState();
                onClose();
              }
            }} 
            className="p-2 hover:bg-white/5 rounded-full text-[var(--text-muted)] transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Deck Name Input */}
        <div className="px-6 py-4 bg-black/5">
          <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Deck Name (Required)</label>
          <input 
            type="text"
            value={deckName}
            onChange={e => setDeckName(e.target.value)}
            placeholder="e.g., Biology Chapter 1, English Vocabulary..."
            className="w-full p-3 bg-white/5 border border-[var(--glass-border)] rounded-xl text-lg text-[var(--text-main)] outline-none focus:border-[var(--primary)] transition-all"
          />
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-[var(--glass-border)] h-14">
          <button 
            onClick={() => setActiveTab('bulk')}
            className={`flex-1 flex items-center justify-center gap-2 font-medium transition-all ${activeTab === 'bulk' ? 'text-[var(--primary)] border-b-2 border-[var(--primary)] bg-[var(--primary)]/5' : 'text-[var(--text-muted)] hover:bg-white/5'}`}
          >
            <Layers size={18} /> Bulk Import
          </button>
          <button 
            onClick={() => setActiveTab('manual')}
            className={`flex-1 flex items-center justify-center gap-2 font-medium transition-all ${activeTab === 'manual' ? 'text-[var(--primary)] border-b-2 border-[var(--primary)] bg-[var(--primary)]/5' : 'text-[var(--text-muted)] hover:bg-white/5'}`}
          >
            <Pencil size={18} /> Manual Entry
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {activeTab === 'bulk' ? (
            <div className="flex flex-col gap-4 animate-fade-in">
              <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm flex gap-3 items-start">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold mb-1 underline">Format Instructions:</p>
                  <p>Wrap question in <b>{"{[(Q)]}"}</b> tags.</p>
                  <p>Wrap correct answers in <b>{"{[(A)]}"}</b> tags.</p>
                  <p>Wrap wrong options (distractors) in <b>{"{[(O)]}"}</b> tags.</p>
                  <p className="mt-2 opacity-80 italic">Example: {"{[(Q)]} What is 1+1? {[(Q)]} {[(A)]} 2 {[(A)]} {[(O)]} 3 {[(O)]} {[(O)]} 4 {[(O)]}"}</p>
                </div>
              </div>
              <textarea 
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder="Paste your content here..."
                className="w-full min-h-[300px] p-4 bg-white/5 border border-[var(--glass-border)] rounded-2xl text-[var(--text-main)] font-mono text-sm leading-relaxed outline-none focus:border-[var(--primary)] transition-all resize-none"
              />
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6 animate-fade-in">
              {/* Manual Form */}
              <div className="flex-1 flex flex-col gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">Question</label>
                  <textarea 
                    value={currentCard.question}
                    onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                    onChange={e => setCurrentCard(prev => ({ ...prev, question: e.target.value }))}
                    style={{ minHeight: '100px' }}
                    className="w-full p-4 bg-white/5 border border-[var(--glass-border)] rounded-2xl text-[var(--text-main)] outline-none focus:border-[var(--primary)] resize-none"
                    placeholder="Enter question text..."
                  />
                </div>

                <div className="flex items-center justify-between py-3 border-y border-[var(--glass-border)]">
                   <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Type</span>
                   <div className="flex gap-2">
                     {['single_choice', 'multiple_choice'].map(t => (
                       <button
                         key={t}
                         onClick={() => setCurrentCard(p => ({ ...p, question_type: t, correct_answers: t === 'single_choice' ? [p.correct_answers[0]] : p.correct_answers }))}
                         className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${currentCard.question_type === t ? 'bg-[var(--primary)]/20 text-[var(--primary)] border-[var(--primary)]/40' : 'bg-white/5 text-[var(--text-muted)] border-[var(--glass-border)]'}`}
                       >
                         {t === 'multiple_choice' ? 'Multiple' : 'Single'}
                       </button>
                     ))}
                   </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-4">Options (Click letter to toggle correct)</label>
                  <div className="flex flex-col gap-3">
                    {currentCard.options.map((opt, idx) => {
                      const letter = String.fromCharCode(65 + idx);
                      const isCorrect = currentCard.correct_answers.includes(letter);
                      return (
                        <div key={idx} className="flex gap-3">
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
                             className={`w-10 h-10 shrink-0 rounded-xl font-bold transition-all flex items-center justify-center ${isCorrect ? 'bg-[var(--success)] text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-white/5 text-[var(--text-muted)] border border-[var(--glass-border)]'}`}
                           >
                             {letter}
                           </button>
                           <textarea 
                             onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                             value={opt.replace(/^[A-Z]\.\s+/, '')}
                             onChange={e => {
                               const newOpts = [...currentCard.options];
                               newOpts[idx] = `${letter}. ${e.target.value}`;
                               setCurrentCard(p => ({ ...p, options: newOpts }));
                             }}
                             className="flex-1 p-2.5 bg-white/5 border border-[var(--glass-border)] rounded-xl text-[var(--text-main)] outline-none focus:border-[var(--primary)] resize-none"
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
                               className="w-10 h-10 shrink-0 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors flex items-center justify-center"
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
                        className="w-full p-3 bg-white/5 border border-dashed border-[var(--glass-border)] rounded-xl text-[var(--text-muted)] hover:text-[var(--primary)] hover:border-[var(--primary)]/50 transition-all flex items-center justify-center gap-2"
                      >
                        <Plus size={18} /> Add Option
                      </button>
                    )}
                  </div>
                </div>

                <button 
                  onClick={addManualCard}
                  className="mt-2 w-full p-4 bg-[var(--primary)]/10 border border-[var(--primary)]/30 text-[var(--primary)] rounded-2xl font-bold hover:bg-[var(--primary)]/20 transition-all flex items-center justify-center gap-2"
                >
                  <ArrowRight size={20} /> Add this card to Preview
                </button>
              </div>

              {/* Preview List */}
              <div className="w-full lg:w-80 flex flex-col gap-4 border-t lg:border-t-0 lg:border-l border-[var(--glass-border)] pt-6 lg:pt-0 lg:pl-6">
                 <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-widest">Added Cards ({manualCards.length})</h3>
                    {manualCards.length > 0 && <button onClick={() => setManualCards([])} className="text-xs text-red-400 hover:underline">Clear all</button>}
                 </div>
                 <div className="flex flex-col gap-3 max-h-[400px] lg:max-h-none overflow-y-auto pr-2 custom-scrollbar">
                    {manualCards.length === 0 ? (
                      <div className="py-12 border border-dashed border-[var(--glass-border)] rounded-2xl flex flex-col items-center justify-center gap-3 opacity-40">
                         <BookOpen size={32} />
                         <span className="text-xs">No cards added yet</span>
                      </div>
                    ) : (
                      manualCards.slice().reverse().map((card, idx) => (
                        <div key={card.card_id} className="p-3 bg-white/5 border border-[var(--glass-border)] rounded-xl flex gap-3 items-center group animate-fade-in">
                          <div className="w-8 h-8 shrink-0 rounded-lg bg-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)] font-bold text-xs">
                             {manualCards.length - idx}
                          </div>
                          <div className="flex-1 min-w-0">
                             <p className="text-xs text-[var(--text-main)] truncate font-medium">{card.question}</p>
                             <p className="text-[10px] text-[var(--success)] mt-0.5">✓ {card.correct_answers.join(', ')}</p>
                          </div>
                          <button 
                            onClick={() => setManualCards(prev => prev.filter(c => c.card_id !== card.card_id))}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/20 lg:opacity-0 lg:group-hover:opacity-100 transition-all"
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
        <div className="p-6 border-t border-[var(--glass-border)] bg-black/10 flex flex-col sm:flex-row gap-3">
          <button 
            onClick={() => {
              if (window.confirm("Abort creation? All input will be lost.")) { onClose(); resetState(); }
            }}
            className="flex-1 p-4 bg-white/5 border border-[var(--glass-border)] text-[var(--text-muted)] rounded-2xl font-bold hover:bg-white/10 transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={handleCreateDeck}
            className="flex-[2] p-4 bg-[var(--primary)] text-white rounded-2xl font-bold shadow-[0_10px_30px_rgba(79,70,229,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {activeTab === 'bulk' ? <Layers size={20} /> : <BookOpen size={20} />}
            Create Deck Now
          </button>
        </div>
      </div>
    </div>
  );
}
