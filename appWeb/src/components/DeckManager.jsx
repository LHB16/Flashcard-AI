import React, { useState, useMemo, useCallback } from 'react';
import { ArrowLeft, Trash2, Search, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, X, Pencil, Plus, Trash, Share2, Settings, Save } from 'lucide-react';
import { findDuplicateQuestions } from '../services/dedupService';
import { v4 as uuidv4 } from 'uuid';
import { notifyDeckStructureChanged } from '../services/driveSync';
import ConfirmationModal from './ConfirmationModal';
import ShareDeckView from './ShareDeckView';

const CARDS_PER_PAGE = 30;
const DEDUP_PAIRS_PER_PAGE = 15;

/**
 * DeckManager — View/Delete cards + Check Duplicates
 * Props: deck, onBack, onDeckModified
 */
export default function DeckManager({ deck, onBack, onDeckModified, setConfirmConfig, userLoggedIn }) {
  const [tab, setTab] = useState('view'); // 'view' | 'dedup'
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selectedCards, setSelectedCards] = useState(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Dedup state
  const [dedupResults, setDedupResults] = useState(null);
  const [dedupRunning, setDedupRunning] = useState(false);
  const [dedupPage, setDedupPage] = useState(0);
  const [dedupSelected, setDedupSelected] = useState(new Set());
  const [editingCard, setEditingCard] = useState(null); // { index, data }

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

  const cards = deck?.cards || [];
  const deckIdToSync = deck?.deck_id || deck?.title || deck?.name;

  // Filtered cards for view tab
  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return cards.map((c, i) => ({ ...c, _origIdx: i }));
    const q = searchQuery.toLowerCase();
    return cards
      .map((c, i) => ({ ...c, _origIdx: i }))
      .filter(c => c.question.toLowerCase().includes(q) || (c.options || []).some(o => o.toLowerCase().includes(q)));
  }, [cards, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredCards.length / CARDS_PER_PAGE));
  const pageCards = filteredCards.slice(page * CARDS_PER_PAGE, (page + 1) * CARDS_PER_PAGE);

  // Stats
  const multiCount = cards.filter(c => c.question_type === 'multiple_choice').length;
  const singleCount = cards.length - multiCount;

  // ─── Card Actions ───
  const handleDeleteSingle = useCallback((origIdx) => {
    // Immutable update: create new cards array without the deleted card
    const cardToDelete = deck.cards[origIdx];
    deck.cards = deck.cards.filter((_, idx) => idx !== origIdx);
    
    // Cleanup progress in DB
    if (cardToDelete && cardToDelete.card_id) {
       notifyDeckStructureChanged(deckIdToSync, cardToDelete.card_id, 'delete');
    }
    
    onDeckModified();
    setDeleteConfirm(null);
    setSelectedCards(prev => { const n = new Set(prev); n.delete(origIdx); return n; });
  }, [deck, deckIdToSync, onDeckModified]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedCards.size) return;
    setConfirmConfig({
      isOpen: true,
      title: `Delete ${selectedCards.size} Card${selectedCards.size > 1 ? 's' : ''}?`,
      description: `Are you sure you want to delete ${selectedCards.size} selected card${selectedCards.size > 1 ? 's' : ''}? This action cannot be undone.`,
      confirmText: 'Delete',
      type: 'danger',
      icon: Trash2,
      onConfirm: () => {
        const indices = new Set(selectedCards);
        notifyDeckStructureChanged(deckIdToSync, null, 'delete_multiple');
        deck.cards = deck.cards.filter((_, idx) => !indices.has(idx));
        setSelectedCards(new Set());
        onDeckModified();
        closeConfirm();
      }
    });
  }, [deck, selectedCards, onDeckModified, deckIdToSync]);

  const toggleSelectCard = useCallback((origIdx) => {
    setSelectedCards(prev => {
      const n = new Set(prev);
      n.has(origIdx) ? n.delete(origIdx) : n.add(origIdx);
      return n;
    });
  }, []);

  // ─── Dedup ───
  const runDedup = useCallback(() => {
    setDedupRunning(true);
    // Run in next tick to allow UI update
    setTimeout(() => {
      const results = findDuplicateQuestions(cards, 0.85);
      setDedupResults(results);
      setDedupPage(0);

      // Auto-select "B" cards for exact matches
      const autoSelect = new Set();
      results.forEach((d, i) => {
        if (d.ratio >= 0.99) autoSelect.add(`${i}:b`);
      });
      setDedupSelected(autoSelect);
      setDedupRunning(false);
    }, 50);
  }, [cards]);

  const toggleDedupSelect = useCallback((pairIdx, slot) => {
    const key = `${pairIdx}:${slot}`;
    setDedupSelected(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }, []);

  const handleDedupDelete = useCallback(() => {
    if (!dedupResults || !dedupSelected.size) return;
    const indicesToDelete = new Set();
    dedupSelected.forEach(key => {
      const [pairIdx, slot] = key.split(':');
      const pair = dedupResults[parseInt(pairIdx)];
      if (pair) indicesToDelete.add(slot === 'a' ? pair.indexA : pair.indexB);
    });
    
    // Immutable update
    deck.cards = deck.cards.filter((_, idx) => !indicesToDelete.has(idx));
    
    onDeckModified();
    setDedupResults(null);
    setDedupSelected(new Set());
  }, [deck, dedupResults, dedupSelected, onDeckModified]);

  const selectAllExact = useCallback(() => {
    if (!dedupResults) return;
    const exactKeys = dedupResults
      .map((d, i) => d.ratio >= 0.99 ? `${i}:b` : null)
      .filter(Boolean);
    const allSelected = exactKeys.every(k => dedupSelected.has(k));
    setDedupSelected(prev => {
      const n = new Set(prev);
      exactKeys.forEach(k => allSelected ? n.delete(k) : n.add(k));
      return n;
    });
  }, [dedupResults, dedupSelected]);

  // Dedup pagination
  const dedupTotalPages = dedupResults ? Math.max(1, Math.ceil(dedupResults.length / DEDUP_PAIRS_PER_PAGE)) : 1;
  const dedupPagePairs = dedupResults
    ? dedupResults.slice(dedupPage * DEDUP_PAIRS_PER_PAGE, (dedupPage + 1) * DEDUP_PAIRS_PER_PAGE)
    : [];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button className="btn btn-glass btn-icon" onClick={onBack} title="Back">
          <ArrowLeft size={20} />
        </button>
        <h2 style={{ fontSize: '1.5rem', margin: 0, flex: 1, display: 'flex', alignItems: 'center' }}>
          <Settings size={22} color="var(--primary)" style={{ marginRight: '10px' }} /> 
          {deck?.name || 'Deck'}
        </h2>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {cards.length} cards · {multiCount} multi · {singleCount} single
        </span>
      </div>

      {/* Tab Bar - Hidden in Edit Mode only */}
      {(tab !== 'edit') && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            className={`btn ${tab === 'view' ? 'btn-primary' : 'btn-glass'}`}
            onClick={() => setTab('view')}
            style={{ padding: '0.6rem 1.5rem', fontSize: '0.95rem' }}
          >
            View & Delete
          </button>
          <button
            className={`btn ${tab === 'dedup' ? 'btn-primary' : 'btn-glass'}`}
            onClick={() => { setTab('dedup'); if (!dedupResults && !dedupRunning) runDedup(); }}
            style={{ padding: '0.6rem 1.5rem', fontSize: '0.95rem' }}
          >
            Check Duplicates
          </button>
          <button
            className={`btn ${tab === 'share' ? 'btn-primary' : 'btn-glass'}`}
            onClick={() => userLoggedIn && setTab('share')}
            disabled={!userLoggedIn}
            title={!userLoggedIn ? 'Login to Google Drive first' : ''}
            style={{ padding: '0.6rem 1.5rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Share2 size={18} /> Share Deck
          </button>
        </div>
      )}

      {/* ─── VIEW TAB ─── */}
      {tab === 'view' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Search + Bulk Delete */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search cards..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
                style={{
                  width: '100%', padding: '0.7rem 0.7rem 0.7rem 2.5rem', borderRadius: '10px',
                  background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                  color: 'var(--text-main)', fontSize: '0.9rem', outline: 'none'
                }}
              />
            </div>
            {selectedCards.size > 0 && (
              <button
                className="btn"
                onClick={handleDeleteSelected}
                style={{
                  padding: '0.7rem 1.2rem', background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', borderRadius: '10px',
                  display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer'
                }}
              >
                <Trash2 size={16} /> Delete {selectedCards.size} selected
              </button>
            )}
            
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingCard({
                  index: -1,
                  isNew: true,
                  data: {
                    card_id: uuidv4(),
                    question: '',
                    options: ['A. ', 'B. ', 'C. ', 'D. '],
                    correct_answers: [],
                    question_type: 'single_choice',
                    status: 0,
                    notes: ''
                  }
                });
                setTab('edit');
              }}
              style={{
                padding: '0.7rem 1.2rem', borderRadius: '10px',
                display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem',
                marginLeft: 'auto'
              }}
            >
              <Plus size={18} /> Add Card
            </button>
          </div>

          {/* Card List */}
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem' }}>
            {pageCards.map((card) => (
              <div
                key={card._origIdx}
                className="glass-panel"
                onClick={() => toggleSelectCard(card._origIdx)}
                style={{
                  padding: '0.8rem 1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.8rem',
                  borderColor: selectedCards.has(card._origIdx) ? 'rgba(239, 68, 68, 0.5)' : undefined,
                  background: selectedCards.has(card._origIdx) ? 'rgba(239, 68, 68, 0.05)' : undefined,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {/* Badge */}
                <div style={{
                  minWidth: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: card.status === 2 ? 'var(--success)' : card.status === 1 ? '#f59e0b' : '#6b7280',
                  color: '#fff', fontWeight: 'bold', fontSize: '0.85rem', flexShrink: 0
                }}>
                  {card._origIdx + 1}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    {/* Checkbox before question */}
                    <input
                      type="checkbox"
                      checked={selectedCards.has(card._origIdx)}
                      onChange={(e) => { e.stopPropagation(); toggleSelectCard(card._origIdx); }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ cursor: 'pointer', accentColor: '#ef4444' }}
                    />
                    <span style={{
                      fontSize: '0.7rem', padding: '0.1rem 0.5rem', borderRadius: '4px', fontWeight: 600,
                      background: card.question_type === 'multiple_choice' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                      color: card.question_type === 'multiple_choice' ? '#f59e0b' : 'var(--success)',
                    }}>
                      {card.question_type === 'multiple_choice' ? 'Multi' : 'Single'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.4, wordBreak: 'break-word' }}>
                    {card.question}
                  </p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {(card.options || []).slice(0, 4).join('  ·  ')}{card.options?.length > 4 ? ` (+${card.options.length - 4})` : ''}
                  </p>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--success)' }}>
                    ✓ {(card.correct_answers || []).join(' | ')}
                  </p>
                </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flexShrink: 0 }}>
                    <button
                      className="btn-glass btn-icon"
                      onClick={() => {
                        setConfirmConfig({
                          isOpen: true,
                          title: "Delete Card?",
                          description: "Are you sure you want to delete this flashcard? This action cannot be undone.",
                          confirmText: "Delete",
                          type: "danger",
                          icon: Trash2,
                          onConfirm: () => {
                            handleDeleteSingle(card._origIdx);
                            closeConfirm();
                          }
                        });
                      }}
                      title="Delete card"
                      style={{ 
                        color: '#ef4444', 
                        width: '32px', height: '32px', padding: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                    <button
                      className="btn-glass btn-icon"
                      onClick={() => {
                        setEditingCard({ index: card._origIdx, data: JSON.parse(JSON.stringify(deck.cards[card._origIdx])) });
                        setTab('edit');
                      }}
                      title="Edit card"
                      style={{ 
                        color: 'var(--primary)', 
                        width: '32px', height: '32px', padding: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
              </div>
            ))}

            {filteredCards.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                {searchQuery ? 'No cards match your search.' : 'This deck has no cards.'}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
              <button className="btn btn-glass btn-icon" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={18} />
              </button>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Page {page + 1} / {totalPages}
              </span>
              <button className="btn btn-glass btn-icon" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── DEDUP TAB ─── */}
      {tab === 'dedup' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {dedupRunning && (
            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
              <div className="animate-spin" style={{ width: '40px', height: '40px', border: '3px solid var(--glass-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', margin: '0 auto 1rem' }} />
              <p>Analyzing {cards.length} cards for duplicates...</p>
            </div>
          )}

          {!dedupRunning && dedupResults !== null && dedupResults.length === 0 && (
            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
              <CheckCircle2 size={48} color="var(--success)" style={{ margin: '0 auto 1rem', display: 'block' }} />
              <h3>No Duplicates Found! 🎉</h3>
              <p style={{ color: 'var(--text-muted)' }}>All {cards.length} cards are unique.</p>
              <button className="btn btn-glass" onClick={runDedup} style={{ marginTop: '1rem' }}>
                🔄 Run Again
              </button>
            </div>
          )}

          {!dedupRunning && dedupResults && dedupResults.length > 0 && (
            <>
              {/* Summary Bar */}
              <div className="glass-panel dedup-summary-panel" style={{ padding: '1rem 1.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                <AlertTriangle size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div className="dedup-summary-stats" style={{ flex: 1 }}>
                  <span><strong style={{minWidth: '24px', display: 'inline-block'}}>{dedupResults.filter(d => d.ratio >= 0.99).length}</strong> exact</span>
                  <span><strong style={{minWidth: '24px', display: 'inline-block'}}>{dedupResults.filter(d => d.ratio < 0.99).length}</strong> similar</span>
                  <span><strong style={{minWidth: '24px', display: 'inline-block'}}>{dedupResults.length}</strong> total pairs</span>
                </div>
                <div className="dedup-summary-actions">
                  <button
                    className="btn btn-glass"
                    onClick={selectAllExact}
                    style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}
                  >
                    ☑ Toggle All Exact (100%)
                  </button>
                  {dedupSelected.size > 0 && (
                    <button
                      className="btn"
                      onClick={handleDedupDelete}
                      style={{
                        padding: '0.5rem 1.2rem', background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.5)', color: '#f87171', borderRadius: '8px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem'
                      }}
                    >
                      <Trash2 size={14} /> Delete {dedupSelected.size} selected
                    </button>
                  )}
                  <button className="btn btn-glass" onClick={runDedup} style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', display: 'flex', justifyContent: 'center' }}>
                    🔄
                  </button>
                </div>
              </div>

              {/* Pairs List */}
              <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem' }}>
                {dedupPagePairs.map((pair, localIdx) => {
                  const globalIdx = dedupPage * DEDUP_PAIRS_PER_PAGE + localIdx;
                  const pct = Math.round(pair.ratio * 100);
                  const isExact = pair.ratio >= 0.99;
                  const cardA = cards[pair.indexA];
                  const cardB = cards[pair.indexB];
                  if (!cardA || !cardB) return null;

                  return (
                    <div key={globalIdx} className="glass-panel" style={{ padding: '1rem', marginBottom: '0.6rem' }}>
                      <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                          fontSize: '0.8rem', fontWeight: 700, padding: '0.15rem 0.6rem', borderRadius: '6px',
                          background: isExact ? 'rgba(239, 68, 68, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                          color: isExact ? '#ef4444' : '#8b5cf6',
                        }}>
                          {isExact ? `✅ ${pct}% exact` : `🔍 ${pct}% similar`}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                        {[
                          { card: cardA, idx: pair.indexA, slot: 'a' },
                          { card: cardB, idx: pair.indexB, slot: 'b' },
                        ].map(({ card, idx, slot }) => {
                          const key = `${globalIdx}:${slot}`;
                          const isChecked = dedupSelected.has(key);
                          return (
                            <div
                              key={slot}
                              style={{
                                padding: '0.6rem', borderRadius: '8px',
                                background: isChecked ? 'rgba(239, 68, 68, 0.06)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${isChecked ? 'rgba(239, 68, 68, 0.3)' : 'var(--glass-border)'}`,
                              }}
                            >
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.3rem' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleDedupSelect(globalIdx, slot)}
                                  style={{ accentColor: '#ef4444' }}
                                />
                                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>#{idx + 1} — Delete?</span>
                              </label>
                              <p style={{ margin: '0.2rem 0', fontSize: '0.85rem', lineHeight: 1.3, wordBreak: 'break-word' }}>
                                {card.question.length > 150 ? card.question.slice(0, 150) + '...' : card.question}
                              </p>
                              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--success)' }}>
                                ✓ {(card.correct_answers || []).join(' | ')}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Dedup Pagination */}
              {dedupTotalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
                  <button className="btn btn-glass btn-icon" disabled={dedupPage === 0} onClick={() => setDedupPage(p => p - 1)}>
                    <ChevronLeft size={18} />
                  </button>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Page {dedupPage + 1} / {dedupTotalPages}
                  </span>
                  <button className="btn btn-glass btn-icon" disabled={dedupPage >= dedupTotalPages - 1} onClick={() => setDedupPage(p => p + 1)}>
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {/* ─── EDIT TAB (FOCUSED VIEW) ─── */}
      {tab === 'edit' && editingCard && (
        <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Editor Header */}
          <div className="glass-panel" style={{ 
            padding: '1rem 1.5rem', borderRadius: '24px', 
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--card-bg)' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button 
                className="btn btn-glass btn-icon" 
                onClick={() => {
                  setConfirmConfig({
                    isOpen: true,
                    title: "Discard changes?",
                    description: "Are you sure you want to leave? Your unsaved edits will be lost.",
                    confirmText: "Discard",
                    type: "danger",
                    icon: AlertTriangle,
                    onConfirm: () => { setTab('view'); closeConfirm(); }
                  });
                }}
                title="Back to list"
              >
                <ArrowLeft size={20} />
              </button>
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Edit Flashcard</h3>
            </div>
            
            <button
              className="btn btn-primary"
              onClick={async () => {
                if (!editingCard.data.question.trim()) {
                  showAlert("Empty Question", "Question content cannot be empty!");
                  return;
                }
                
                const correctCount = editingCard.data.correct_answers?.length || 0;
                if (correctCount === 0) {
                  showAlert("No Correct Answer", "Please select at least one correct answer!");
                  return;
                }
                if (editingCard.data.question_type === 'single_choice' && correctCount !== 1) {
                  showAlert("Invalid Answer", "Single Choice questions must have exactly 1 correct answer!");
                  return;
                }
                if (editingCard.data.question_type === 'multiple_choice' && correctCount < 2) {
                  showAlert("Invalid Answers", "Multiple Choice questions must have at least 2 correct answers!");
                  return;
                }

                const isNew = editingCard.isNew;
                setConfirmConfig({
                  isOpen: true,
                  title: isNew ? "Add card?" : "Save changes?",
                  description: isNew ? "Do you want to add this new card to the deck?" : "Are you sure you want to save the changes to this flashcard?",
                  confirmText: isNew ? "Add" : "Save",
                  type: isNew ? "warning" : "info",
                  icon: isNew ? Plus : Save,
                  onConfirm: async () => {
                    closeConfirm();
                    // ... existing saving logic ...
                    const newCards = [...deck.cards];
                    if (isNew) {
                      newCards.push(editingCard.data);
                      // Don't reset quiz progress — new cards are appended at the end
                      // and don't affect existing answer indices
                    } else {
                      const updatedCard = { ...editingCard.data, status: 0 };
                      newCards[editingCard.index] = updatedCard;
                      await notifyDeckStructureChanged(deckIdToSync, editingCard.data.card_id, 'edit');
                    }
                    deck.cards = newCards;
                    onDeckModified();
                    setTab('view');
                    setEditingCard(null);
                  }
                });
              }}
              style={{ padding: '0.6rem 2rem', borderRadius: '12px' }}
            >
              Save Changes
            </button>
          </div>

          <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Question */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Question Content</label>
              <textarea
                value={editingCard.data.question}
                onInput={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onChange={e => setEditingCard(prev => ({ ...prev, data: { ...prev.data, question: e.target.value } }))}
                style={{
                  width: '100%', minHeight: '120px', padding: '1rem', borderRadius: '16px',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
                  color: 'var(--text-main)', fontSize: '1rem', outline: 'none', resize: 'none',
                  lineHeight: '1.5'
                }}
                placeholder="Enter question text..."
              />
            </div>

            {/* Type Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Question Type</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {['single_choice', 'multiple_choice'].map(t => {
                  const isActive = editingCard.data.question_type === t;
                  return (
                    <button
                      key={t}
                      className="btn"
                      onClick={() => {
                        const newData = { ...editingCard.data, question_type: t };
                        if (t === 'single_choice' && newData.correct_answers?.length > 1) {
                          newData.correct_answers = [newData.correct_answers[0]];
                        }
                        setEditingCard(prev => ({ ...prev, data: newData }));
                      }}
                      style={{
                        padding: '0.5rem 1.2rem', borderRadius: '10px', fontSize: '0.85rem',
                        background: isActive ? (t === 'multiple_choice' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)') : 'var(--glass-bg)',
                        color: isActive ? (t === 'multiple_choice' ? '#f59e0b' : 'var(--success)') : 'var(--text-muted)',
                        border: `1px solid ${isActive ? (t === 'multiple_choice' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)') : 'var(--glass-border)'}`
                      }}
                    >
                      {t === 'multiple_choice' ? 'Multiple Choice' : 'Single Choice'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Options */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', fontWeight: 600, textTransform: 'uppercase' }}>Answers & Options</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {(editingCard.data.options || []).map((opt, idx) => {
                  const letter = String.fromCharCode(65 + idx);
                  const isCorrect = editingCard.data.correct_answers?.includes(letter);
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                      {/* ABC Selector */}
                      <button
                        onClick={() => {
                          let newCorrect = [...(editingCard.data.correct_answers || [])];
                          if (editingCard.data.question_type === 'multiple_choice') {
                            if (isCorrect) newCorrect = newCorrect.filter(c => c !== letter);
                            else newCorrect.push(letter);
                          } else {
                            newCorrect = [letter];
                          }
                          setEditingCard(prev => ({ ...prev, data: { ...prev.data, correct_answers: newCorrect } }));
                        }}
                        style={{
                          width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0,
                          border: isCorrect ? 'none' : '2px solid var(--glass-border)',
                          background: isCorrect ? 'var(--success)' : 'transparent',
                          color: isCorrect ? 'white' : 'var(--text-muted)',
                          fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer',
                          transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                      >
                        {letter}
                      </button>

                      {/* Auto-expand Answer Textarea */}
                      <textarea
                        onInput={(e) => {
                          e.target.style.height = 'auto';
                          e.target.style.height = `${e.target.scrollHeight}px`;
                        }}
                        value={opt.replace(/^[A-Z]\.\s+/, '')}
                        onChange={e => {
                          const newOpts = [...editingCard.data.options];
                          newOpts[idx] = `${letter}. ${e.target.value}`;
                          setEditingCard(prev => ({ ...prev, data: { ...prev.data, options: newOpts } }));
                        }}
                        style={{
                          flex: 1, padding: '0.65rem 1rem', borderRadius: '14px',
                          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
                          color: 'var(--text-main)', fontSize: '0.95rem', outline: 'none',
                          resize: 'none', minHeight: '40px', lineHeight: '1.4'
                        }}
                        rows={1}
                        placeholder={`Enter option ${letter}...`}
                      />

                      {/* Delete Option */}
                      {editingCard.data.options.length > 2 && (
                        <button
                          onClick={() => {
                            const newOpts = editingCard.data.options.filter((_, i) => i !== idx);
                            const finalOpts = newOpts.map((o, i) => `${String.fromCharCode(65 + i)}. ${o.replace(/^[A-Z]\.\s+/, '')}`);
                            const newCorrect = [];
                            editingCard.data.correct_answers.forEach(c => {
                              const oldIdx = c.charCodeAt(0) - 65;
                              if (oldIdx < idx) newCorrect.push(c);
                              else if (oldIdx > idx) newCorrect.push(String.fromCharCode(c.charCodeAt(0) - 1));
                            });
                            setEditingCard(prev => ({
                              ...prev,
                              data: { ...prev.data, options: finalOpts, correct_answers: newCorrect }
                            }));
                          }}
                          className="btn btn-glass btn-icon"
                          style={{ color: '#f87171', width: '40px', height: '40px' }}
                        >
                          <Trash size={18} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Add Option Button */}
                {editingCard.data.options.length < 26 && (
                  <button
                    onClick={() => {
                      const nextLetter = String.fromCharCode(65 + editingCard.data.options.length);
                      const newOpts = [...editingCard.data.options, `${nextLetter}. `];
                      setEditingCard(prev => ({ ...prev, data: { ...prev.data, options: newOpts } }));
                    }}
                    className="btn btn-glass"
                    style={{
                      marginTop: '0.5rem', padding: '0.8rem', borderRadius: '14px', borderStyle: 'dashed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                      width: '100%', fontSize: '0.95rem'
                    }}
                  >
                    <Plus size={20} /> Add more options
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── SHARE TAB (FOCUSED VIEW) ─── */}
      {tab === 'share' && userLoggedIn && (
        <ShareDeckView 
          deck={deck} 
          onBack={() => setTab('view')} 
        />
      )}

    </div>
  );
}
