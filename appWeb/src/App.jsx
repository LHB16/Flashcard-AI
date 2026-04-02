import React, { useState, useEffect, useRef } from 'react';
import FileLoader from './components/FileLoader';
import FlashcardMode from './components/FlashcardMode';
import QuizMode from './components/QuizMode';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import AIScan from './components/AIScan';
import DeckManager from './components/DeckManager';
import AddDeckModal from './components/AddDeckModal';
import ImportSharedDeckModal from './components/ImportSharedDeckModal';
import NotificationBell from './components/NotificationBell';
import { Layers, BrainCircuit, Moon, Sun, BookOpen, Cloud, Check, Loader2, CloudOff, Search, Star, StarOff, ChevronUp, ChevronDown, Sparkles, Settings, Plus, Trash2, AlertTriangle, X, Download, Keyboard, LogOut } from 'lucide-react';
import { initGoogleIdentity, loginGoogle, logoutGoogle, fetchDecksFromDrive, uploadDecksToDrive, deleteDecksProgress } from './services/driveSync';
import Footer from './components/Footer';
import Skeleton, { HomeSkeleton } from './components/Skeleton';
import ConfirmationModal from './components/ConfirmationModal';


function App() {
  const [data, setData] = useState(null);
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [mode, setMode] = useState(null); // 'home', 'flashcard', 'quiz'
  const [theme, setTheme] = useState('dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('decks');
  const [isAddDeckModalOpen, setIsAddDeckModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedDecks, setSelectedDecks] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Generic confirmation modal state
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: '',
    description: '',
    confirmText: '',
    type: 'warning',
    icon: AlertTriangle,
    onConfirm: () => {}
  });

  const [pinnedDecks, setPinnedDecks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pinned_decks')) || []; } catch(e) { return []; }
  });
  const [sortOrder, setSortOrder] = useState(() => {
    return localStorage.getItem('deck_sort_order') || 'none';
  });

  const togglePin = React.useCallback((deck_id, e) => {
    e.stopPropagation();
    if (!deck_id) return;
    setPinnedDecks(prev => {
      const newPinned = prev.includes(deck_id) ? prev.filter(id => id !== deck_id) : [...prev, deck_id];
      localStorage.setItem('pinned_decks', JSON.stringify(newPinned));
      return newPinned;
    });
  }, [pinnedDecks]);

  const toggleSort = React.useCallback(() => {
    setSortOrder(prev => {
      const next = prev === 'none' ? 'asc' : prev === 'asc' ? 'desc' : 'none';
      localStorage.setItem('deck_sort_order', next);
      return next;
    });
  }, []);

  const processedDecks = React.useMemo(() => {
    if (!data) return [];
    let filtered = data.filter(deck => (deck.name || '').toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (sortOrder === 'asc') {
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortOrder === 'desc') {
      filtered.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    }

    const pinned = filtered.filter(deck => deck.deck_id && pinnedDecks.includes(deck.deck_id));
    const unpinned = filtered.filter(deck => !deck.deck_id || !pinnedDecks.includes(deck.deck_id));
    
    return [...pinned, ...unpinned];
  }, [data, searchQuery, sortOrder, pinnedDecks]);

  // Google Sync state
  const [userLoggedIn, setUserLoggedIn] = useState(false);
  const [driveFileId, setDriveFileId] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  const userEmail = localStorage.getItem('g_email') || '';
  const displayName = userEmail ? userEmail.split('@')[0] : '';

  // Keep a ref to always have fresh data in async callbacks
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  // Load theme from localStorage on start
  useEffect(() => {
    const savedTheme = localStorage.getItem('app-theme') || 'dark';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Kích hoạt nhận diện Google ngầm từ Backend Auth Flow
    initGoogleIdentity(
      (token) => {
        setUserLoggedIn(true);
        handleSyncFromDrive();
      },
      (err) => {
        console.warn("Chưa đăng nhập Google hoặc phiên đã hết hạn:", err);
        setIsSyncing(false);
      }
    );
    // Tự động thu gọn header khi cuộn xuống
    const lastScrollYRef = { current: window.scrollY };
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      // Chỉ tự động thu gọn nếu đang cuộn xuống và vượt qua mốc 80px
      if (currentScrollY > 80 && lastScrollYRef.current <= 80) {
        setIsHeaderCollapsed(true);
      }
      lastScrollYRef.current = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleTheme = React.useCallback(() => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('app-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  }, [theme]);

  const handleLoginClick = () => {
    setIsSyncing(true);
    loginGoogle();
    // After login popup, the callback inside initGoogleIdentity triggers (onSuccess -> handleSyncFromDrive)
  };

  const handleLogoutClick = () => {
    setConfirmConfig({
      isOpen: true,
      title: "Logout / Disconnect?",
      description: "Are you sure you want to log out and disconnect from Google Drive? Your local data will remain until you log in again or clear browser cache.",
      confirmText: "Logout",
      type: "danger",
      icon: LogOut,
      onConfirm: () => {
        logoutGoogle();
        setUserLoggedIn(false);
        setDriveFileId(null);
        setSyncMessage(null);
        setData(null);
        setSelectedDeck(null);
        setMode(null);
        setActiveTab('decks');
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleSyncFromDrive = async (goToScan = false) => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const result = await fetchDecksFromDrive();
      if (result && result.data) {
        setDriveFileId(result.fileId);
        // Successfully loaded from drive
        handleDataLoaded(result.data, false);
      } else {
        if (goToScan) {
           // New account, no desks.json. Setup empty environment for them to create decks.
           setData([]);
           setSelectedDeck(null);
        } else {
           setConfirmConfig({
             isOpen: true,
             title: "No data found",
             description: "No desk.json found on this Google Drive. Please upload a file manually or use AI Scan to create one.",
             confirmText: "Close",
             type: "warning",
             icon: AlertTriangle,
             onConfirm: () => setConfirmConfig(prev => ({ ...prev, isOpen: false }))
           });
        }
      }

      if (goToScan) {
        setMode(null);
        setActiveTab('scan');
      }
    } catch (e) {
      console.error(e);
      setConfirmConfig({
        isOpen: true,
        title: "Sync Failed",
        description: "Failed to connect to Google Drive or fetch data. Please check your internet connection and try again.",
        confirmText: "Close",
        type: "danger",
        icon: AlertTriangle,
        onConfirm: () => setConfirmConfig(prev => ({ ...prev, isOpen: false }))
      });
    }
    setIsSyncing(false);
  };

  const handleDataLoaded = async (decksData, isManualUpload = false) => {
    setData(decksData);
    setSelectedDeck(null); // Force selection list always
    setMode(null);

    // Automatically sync to Google Drive if a user uploads manually and is logged in
    if (isManualUpload && userLoggedIn) {
      setIsSyncing(true);
      try {
        const res = await uploadDecksToDrive(decksData, driveFileId);
        if (!driveFileId && res && res.id) {
          setDriveFileId(res.id); // Save new file ID for future PATCH updates
        }
      } catch (e) {
        console.error("Error syncing to Drive:", e);
      }
      setIsSyncing(false);
    }
  };

  const resetAll = React.useCallback(() => {
    setData(null);
    setSelectedDeck(null);
    setMode(null);
    setActiveTab('decks');
  }, []);

  const handleScanComplete = async (newDeck) => {
    // Merge new deck into existing data
    const updated = data ? [...data, newDeck] : [newDeck];
    setData(updated);

    // Sync to Drive
    if (userLoggedIn) {
      setIsSyncing(true);
      try {
        const res = await uploadDecksToDrive(updated, driveFileId);
        if (!driveFileId && res && res.id) {
          setDriveFileId(res.id);
        }
      } catch (e) {
        console.error('Error syncing scanned deck to Drive:', e);
      }
      setIsSyncing(false);
    }

    // Switch to decks tab
    setActiveTab('decks');
  };

  const handleDeckCreated = async (newDeck) => {
    const updated = data ? [...data, newDeck] : [newDeck];
    setData(updated);
    
    // Auto-select the newly created deck
    setSelectedDeck(newDeck);
    setMode('home');
    
    // Sync to Drive
    if (userLoggedIn) {
      setIsSyncing(true);
      try {
        const res = await uploadDecksToDrive(updated, driveFileId);
        if (!driveFileId && res && res.id) {
          setDriveFileId(res.id);
        }
      } catch (e) {
        console.error('Error syncing new deck to Drive:', e);
      }
      setIsSyncing(false);
    }
  };

  const handleDeckImported = async (clonedDeck) => {
    const updated = data ? [...data, clonedDeck] : [clonedDeck];
    setData(updated);
    
    // Auto-select the newly imported deck
    setSelectedDeck(clonedDeck);
    setMode('home');
    
    // Sync to Drive
    if (userLoggedIn) {
      setIsSyncing(true);
      try {
        const res = await uploadDecksToDrive(updated, driveFileId);
        if (!driveFileId && res && res.id) {
          setDriveFileId(res.id);
        }
      } catch (e) {
        console.error('Error syncing imported deck to Drive:', e);
      }
      setIsSyncing(false);
    }
  };

  const pressTimerRef = useRef(null);
  const touchStartPosRef = useRef({ x: 0, y: 0 });

  const handleTouchStart = (e, deckId) => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    
    // Store initial coordinates
    if (e.touches && e.touches[0]) {
      touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else {
      touchStartPosRef.current = { x: e.clientX, y: e.clientY };
    }

    pressTimerRef.current = setTimeout(() => {
      setIsSelectionMode(true);
      toggleSelectDeck(deckId);
      pressTimerRef.current = null;
    }, 800);
  };

  const handleTouchMove = (e) => {
    if (!pressTimerRef.current) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const moveX = Math.abs(clientX - touchStartPosRef.current.x);
    const moveY = Math.abs(clientY - touchStartPosRef.current.y);
    
    if (moveX > 10 || moveY > 10) {
      handleTouchEnd();
    }
  };

  const handleTouchEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const toggleSelectDeck = (deckId) => {
    setSelectedDecks(prev => {
      const next = new Set(prev);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  };

  const handleCancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedDecks(new Set());
  };

  const handleDeleteCurrentDeck = () => {
    if (!selectedDeck) return;
    const id = selectedDeck.deck_id || selectedDeck.name;
    setSelectedDecks(new Set([id]));
    setShowDeleteConfirm(true);
  };

  const confirmDeleteDeck = async () => {
    setIsDeleting(true);
    const deckIdsToDelete = Array.from(selectedDecks);
    const updatedDecks = (data || []).filter(d => !selectedDecks.has(d.deck_id));
    setData(updatedDecks);

    if (userLoggedIn) {
      try {
        await Promise.all([
          uploadDecksToDrive(updatedDecks, driveFileId),
          deleteDecksProgress(deckIdsToDelete)
        ]);
      } catch (e) {
        console.error('Error deleting deck and syncing:', e);
      }
    }

    if (selectedDeck && selectedDecks.has(selectedDeck.deck_id)) {
      setSelectedDeck(null);
      setMode(null);
    }

    setShowDeleteConfirm(false);
    setIsDeleting(false);
    handleCancelSelection();
  };

  const syncTimeoutRef = useRef(null);
  const handleDeckModified = React.useCallback(() => {
    setSelectedDeck(prev => {
      if (!prev) return prev;
      return { ...prev, cards: [...(prev.cards || [])] };
    });
    setData(prev => prev ? [...prev] : prev);

    if (!userLoggedIn || !driveFileId) return;

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(async () => {
      try {
        const freshData = dataRef.current;
        if (!freshData) return;
        uploadDecksToDrive(freshData, driveFileId).catch(e => console.warn('Drive sync failed:', e));

        const gId = localStorage.getItem('g_id');
        if (gId && selectedDeck) {
          const freshDeck = freshData.find(d => d.deck_id === selectedDeck.deck_id);
          if (freshDeck) {
            const known = freshDeck.cards.filter(c => c.status === 2).length;
            const total = freshDeck.cards.length;
            const percent = total > 0 ? Math.round((known / total) * 100) : 0;

            fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'}/progress/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ google_id: gId, deck_id: freshDeck.deck_id, percent })
            }).catch(e => console.warn("Supabase Progress Sync issue:", e));
          }
        }
      } catch (e) { console.error("Background sync failed:", e); }
    }, 3000);
  }, [userLoggedIn, driveFileId, selectedDeck?.deck_id]);

  // --- RENDER LOGIC ---
  return (
    <>
      {isSyncing && <div className="top-progress-bar"></div>}
      
      {!data ? (
        // 1. Initial State (Login / Load)
        <main className="app-main" style={{ padding: '2rem 5vw', display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
          <header className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4rem', padding: '1rem 2rem', background: 'var(--glass-bg)', backdropFilter: 'blur(10px)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
            <div className="app-header-left">
              <h1 className="text-gradient" style={{ fontSize: '2.5rem', letterSpacing: '-0.02em', margin: 0 }}>Flashcard AI</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '1rem', margin: 0 }}>Cross-platform sync & intelligent learning</p>
            </div>
            <div className="app-header-right" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <NotificationBell icon={theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />} />
              <button className="btn btn-glass btn-icon" onClick={toggleTheme} title="Switch Theme">
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
          </header>

          <div className="home-container">
            <div className="home-column">
              {!theme ? <HomeSkeleton /> : (
                <>
                  {userLoggedIn ? (
                    <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', borderColor: 'rgba(16, 185, 129, 0.4)' }}>
                      <button onClick={handleLogoutClick} className="btn-glass btn-icon" style={{ position: 'absolute', right: '1rem', top: '1rem', color: 'var(--danger)' }}><LogOut size={18} /></button>
                      <Check size={48} color="var(--success)" style={{ margin: '0 auto 1.5rem' }} />
                      <h3>Connected to Google Drive</h3>
                      <button className="btn btn-primary" onClick={() => handleSyncFromDrive(false)} style={{ marginTop: '1.5rem', width: '100%' }}>Start Learning</button>
                    </div>
                  ) : (
                    <button className="btn btn-glass glass-panel-hover" onClick={handleLoginClick} style={{ padding: '1.5rem', fontSize: '1.2rem', width: '100%', borderColor: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem' }}>
                      <Cloud size={28} color="var(--primary)" /> Sign in to experience full features
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="home-divider"><div className="line"></div> <span>OR</span> <div className="line"></div></div>
            <div className="home-column"><FileLoader onDataLoaded={handleDataLoaded} /></div>
          </div>
          <Footer />
        </main>
      ) : !selectedDeck ? (
        // 2. Deck Selection
        <main className="app-main" style={{ padding: '1.5rem 5vw', display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
          <div style={{ position: 'sticky', top: '0', zIndex: 100, background: 'var(--bg-main)', marginBottom: '1.5rem' }}>
            <header className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>My Decks</h1>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <NotificationBell />
                <button className="btn btn-glass btn-icon" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button>
                <button className="btn btn-primary" onClick={() => setIsAddDeckModalOpen(true)}><Plus size={20} /></button>
              </div>
            </header>
            <div style={{ display: 'flex', gap: '1rem', margin: '1rem 0' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={20} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                <input type="text" placeholder="Search decks..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '0.8rem 0.8rem 0.8rem 3rem', borderRadius: '12px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', outline: 'none' }} />
              </div>
              <button className="btn btn-glass" onClick={toggleSort}>{sortOrder === 'asc' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</button>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            {isSelectionMode && (
              <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <span>{selectedDecks.size} Selected</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-glass" onClick={handleCancelSelection}>Cancel</button>
                  <button className="btn btn-primary" style={{ background: '#ef4444' }} onClick={() => setShowDeleteConfirm(true)}>Delete</button>
                </div>
              </div>
            )}
            <div className="decks-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
              {processedDecks.map(deck => {
                const isSelected = selectedDecks.has(deck.deck_id);
                const isPinned = pinnedDecks.includes(deck.deck_id);
                return (
                  <div key={deck.deck_id} className={`glass-panel glass-panel-hover ${isSelected ? 'selected' : ''}`} style={{ padding: '1.5rem', cursor: 'pointer', position: 'relative', border: isSelected ? '2px solid #ef4444' : (isPinned ? '1px solid var(--warning)' : undefined) }} onClick={() => isSelectionMode ? toggleSelectDeck(deck.deck_id) : setSelectedDeck(deck)} onMouseDown={(e) => !isSelectionMode && handleTouchStart(e, deck.deck_id)} onTouchStart={(e) => !isSelectionMode && handleTouchStart(e, deck.deck_id)} onMouseMove={handleTouchMove} onTouchMove={handleTouchMove} onMouseUp={handleTouchEnd} onTouchEnd={handleTouchEnd}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                      <BrainCircuit size={24} color="var(--primary)" />
                      <button className="pin-btn" onClick={(e) => { e.stopPropagation(); togglePin(deck.deck_id, e); }} style={{ color: isPinned ? '#fbbf24' : 'var(--text-muted)' }}>
                        {isPinned ? <Star size={20} fill="#fbbf24" strokeWidth={1} /> : <StarOff size={20} strokeWidth={1} />}
                      </button>
                    </div>
                    <h3 style={{ margin: '0 0 0.5rem' }}>{deck.name}</h3>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>{deck.cards?.length || 0} cards</p>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      ) : (
        // 3. Study Mode Selection
        <main className="app-main" style={{ padding: '1.5rem 5vw', display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
          <div style={{ position: 'sticky', top: '0', zIndex: 100, background: 'var(--bg-main)', marginBottom: '1.5rem' }}>
            <header className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }} onClick={() => { setSelectedDeck(null); setMode(null); }}>
                <ChevronLeft size={24} />
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{selectedDeck.name}</h1>
              </div>
              <button className="btn btn-glass btn-icon" onClick={handleDeleteCurrentDeck}><Trash2 size={20} color="#ef4444" /></button>
            </header>
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 0' }}>
               <button className={`btn ${!mode || mode === 'home' ? 'btn-primary' : 'btn-glass'}`} onClick={() => setMode('home')}>Modes</button>
               <button className={`btn ${mode === 'manage' ? 'btn-primary' : 'btn-glass'}`} onClick={() => setMode('manage')}>Manage</button>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            {(!mode || mode === 'home') && (
              <div className="mode-selection-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
                <div className="glass-panel glass-panel-hover" style={{ padding: '3rem', textAlign: 'center', cursor: 'pointer' }} onClick={() => setMode('flashcard')}>
                  <Layers size={48} color="var(--primary)" style={{ marginBottom: '1rem' }} />
                  <h3>Flashcards</h3>
                </div>
                <div className="glass-panel glass-panel-hover" style={{ padding: '3rem', textAlign: 'center', cursor: 'pointer' }} onClick={() => setMode('quiz')}>
                  <BrainCircuit size={48} color="var(--success)" style={{ marginBottom: '1rem' }} />
                  <h3>Quiz Mode</h3>
                </div>
              </div>
            )}
            {mode === 'flashcard' && <FlashcardMode deck={selectedDeck} onBack={() => setMode('home')} onDeckModified={handleDeckModified} />}
            {mode === 'quiz' && <QuizMode deck={selectedDeck} onBack={() => setMode('home')} onDeckModified={handleDeckModified} />}
            {mode === 'manage' && <DeckManager deck={selectedDeck} onBack={() => setMode('home')} onDeckModified={handleDeckModified} />}
            {mode === 'shortcuts' && <KeyboardShortcuts onBack={() => setMode('home')} />}
          </div>
        </main>
      )}

      {/* --- SHARED MODALS --- */}
      <AddDeckModal isOpen={isAddDeckModalOpen} onClose={() => setIsAddDeckModalOpen(false)} onDeckCreated={handleDeckCreated} />
      <ImportSharedDeckModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} onDeckImported={handleDeckImported} />
      
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDeleteDeck}
        title={`Delete ${selectedDecks.size} Deck${selectedDecks.size > 1 ? 's' : ''}?`}
        description="This action cannot be undone. All cards will be lost."
        confirmText="Delete"
        type="danger"
        icon={Trash2}
        isLoading={isDeleting}
      />

      <ConfirmationModal
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        description={confirmConfig.description}
        confirmText={confirmConfig.confirmText}
        type={confirmConfig.type}
        icon={confirmConfig.icon}
      />
      <Footer />
    </>
  );
}

export default App;
