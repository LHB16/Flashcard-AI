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
import ChatBubble from './components/ChatBubble';
import AdminDashboard from './components/AdminDashboard';
import SettingsPage from './components/SettingsPage';
import { Layers, BrainCircuit, Moon, Sun, BookOpen, Cloud, Check, Loader2, CloudOff, Search, Star, StarOff, ChevronUp, ChevronDown, Sparkles, Settings, Plus, Trash2, AlertTriangle, X, Download, Keyboard, LogOut, Shield } from 'lucide-react';
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
  const [importModalInitialId, setImportModalInitialId] = useState('');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedDecks, setSelectedDecks] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [managerTab, setManagerTab] = useState('view');

  // Generic confirmation modal state
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: '',
    description: '',
    confirmText: '',
    type: 'warning',
    icon: AlertTriangle,
    onConfirm: () => { }
  });

  const [pinnedDecks, setPinnedDecks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pinned_decks')) || []; } catch (e) { return []; }
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

    // Check if we're in dev mode with mock user
    if (import.meta.env.VITE_DEV_MODE === 'true') {
      // Simulate a logged-in user for development
      setUserLoggedIn(true);
      // Set mock data
      const mockData = [
        {
          deck_id: 'mock_deck_1',
          name: 'Sample Deck 1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          cards: [
            { front: 'Hello', back: 'Xin chào', status: 0 },
            { front: 'World', back: 'Thế giới', status: 0 }
          ]
        },
        {
          deck_id: 'mock_deck_2',
          name: 'Sample Deck 2',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          cards: [
            { front: 'Apple', back: 'Quả táo', status: 0 },
            { front: 'Banana', back: 'Quả chuối', status: 0 }
          ]
        }
      ];
      handleDataLoaded(mockData, false);
      console.log('DEV MODE: Using mock user and mock data');
    } else {
      // Kích hoạt nhận diện Google ngầm từ Backend Auth Flow
      initGoogleIdentity(
        (token) => {
          setUserLoggedIn(true);
          handleSyncFromDrive();
        },
        (err) => {
          console.warn("Not logged into Google or session expired:", err);
          setIsSyncing(false);
        }
      );
    }

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
        if (import.meta.env.VITE_DEV_MODE !== 'true') {
          logoutGoogle();
        }
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
    if (import.meta.env.VITE_DEV_MODE === 'true') {
      // In DEV mode, we don't sync from drive
      return;
    }

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
          // Allow entering the dashboard with an empty deck list automatically
          setDriveFileId(null);
          handleDataLoaded([], false);
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
    if (isManualUpload && userLoggedIn && import.meta.env.VITE_DEV_MODE !== 'true') {
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
    if (userLoggedIn && import.meta.env.VITE_DEV_MODE !== 'true') {
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

  const handleDeckCreated = async (newDeckData) => {
    const isArray = Array.isArray(newDeckData);
    const newDecks = isArray ? newDeckData : [newDeckData];
    const updated = data ? [...data, ...newDecks] : [...newDecks];
    setData(updated);

    // Auto-select the first newly created deck
    setSelectedDeck(newDecks[0]);
    setMode('home');

    // Sync to Drive
    if (userLoggedIn && import.meta.env.VITE_DEV_MODE !== 'true') {
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
    if (userLoggedIn && import.meta.env.VITE_DEV_MODE !== 'true') {
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

  const handleDeckPressStart = (deck, e) => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);

    // Store initial touch coordinates to detect scrolling
    if (e && e.touches && e.touches[0]) {
      touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e && e.clientX) {
      touchStartPosRef.current = { x: e.clientX, y: e.clientY };
    }

    pressTimerRef.current = setTimeout(() => {
      setIsSelectionMode(true);
      selectDeck(deck);
      pressTimerRef.current = null;
    }, 800); // 800ms long press, more intentional
  };

  const handleDeckTouchMove = (e) => {
    if (!pressTimerRef.current) return;

    // If user moves more than 10px, it's a scroll or swipe, not a long press
    if (e.touches && e.touches[0]) {
      const moveX = Math.abs(e.touches[0].clientX - touchStartPosRef.current.x);
      const moveY = Math.abs(e.touches[0].clientY - touchStartPosRef.current.y);
      if (moveX > 10 || moveY > 10) {
        handleDeckPressEnd();
      }
    }
  };

  const handleDeckPressEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const selectDeck = (deck) => {
    setSelectedDecks(prev => {
      const next = new Set(prev);
      const id = deck.deck_id || deck.name;
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeckClick = (deck, e) => {
    if (isSelectionMode) {
      // Allow checkbox toggle on click
      e.preventDefault();
      e.stopPropagation();
      selectDeck(deck);
    } else {
      setSelectedDeck(deck);
      setMode('home');
    }
  };

  const cancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedDecks(new Set());
    setShowDeleteConfirm(false);
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
    const updatedDecks = (data || []).filter(d => {
      const id = d.deck_id || d.name;
      return !selectedDecks.has(id);
    });
    setData(updatedDecks);

    if (userLoggedIn && import.meta.env.VITE_DEV_MODE !== 'true') {
      try {
        await Promise.all([
          uploadDecksToDrive(updatedDecks, driveFileId),
          deleteDecksProgress(deckIdsToDelete)
        ]);
      } catch (e) {
        console.error('Error deleting deck and syncing:', e);
      }
    }

    // If we deleted from mode page, go back to deck list
    if (mode !== null) {
      setSelectedDeck(null);
      setMode(null);
    }

    setShowDeleteConfirm(false);
    setIsDeleting(false);
    cancelSelection();
  };

  const syncTimeoutRef = useRef(null);

  const handleDeckModified = React.useCallback(() => {
    // Force refresh selectedDeck reference with a deep copy of cards to trigger prop update in children
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

        // 1. Upload structurally modified JSON to Google Drive directly without blocking UI
        if (import.meta.env.VITE_DEV_MODE !== 'true') {
          uploadDecksToDrive(freshData, driveFileId).catch(e => console.warn('Drive sync failed:', e));
        }

        // 2. Sync progress to Supabase — use freshData to find the current deck
        const gId = localStorage.getItem('g_id');
        if (gId) {
          // Find the fresh version of the selected deck from dataRef
          const currentDeckId = selectedDeck?.deck_id;
          const freshDeck = currentDeckId
            ? freshData.find(d => d.deck_id === currentDeckId)
            : null;

          if (freshDeck) {
            const known = freshDeck.cards.filter(c => c.status === 2).length;
            const total = freshDeck.cards.length;
            const percent = total > 0 ? Math.round((known / total) * 100) : 0;

            fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'}/progress/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                google_id: gId,
                deck_id: freshDeck.deck_id || freshDeck.title,
                percent
              })
            }).catch(e => console.warn("Supabase Progress Sync issue:", e));
          }
        }
      } catch (e) {
        console.error("Background sync failed:", e);
      }
    }, 3000);
  }, [userLoggedIn, driveFileId, selectedDeck?.deck_id]);


  // Prioritize Admin Dashboard render (even if no data)
  if (mode === 'admin') {
    return (
      <>
        {isSyncing && <div className="top-progress-bar"></div>}
        <main className="app-main" style={{ padding: '2rem 5vw', display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
          <AdminDashboard onBack={() => { setSelectedDeck(null); setMode(null); }} />
        </main>
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
      </>
    );
  }

  // 1. Render file selection & Login first
  if (!data) {
    return (
      <>
        {isSyncing && <div className="top-progress-bar"></div>}
        <main className="app-main" style={{ padding: '2rem 5vw', display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
          <header className="app-header login-header" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '3rem',
            marginTop: '2rem',
            padding: '1rem 2rem',
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(10px)',
            borderRadius: '16px',
            border: '1px solid var(--glass-border)',
            position: 'relative',
            zIndex: 200
          }}>
            <div className="app-header-left">
              <h1 className="text-gradient" style={{ fontSize: '2.5rem', letterSpacing: '-0.02em', margin: 0 }}>Flashcard AI</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '1rem', margin: 0 }}>Cross-platform sync & intelligent learning</p>
            </div>
            <div className="app-header-right" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <NotificationBell 
                userLoggedIn={userLoggedIn} 
                userEmail={userEmail} 
                onOpenImportModal={(id) => {
                  setImportModalInitialId(id);
                  setIsImportModalOpen(true);
                }} 
              />
              {userEmail === 'binhlhce200315@gmail.com' && (
                <button
                  className="btn btn-glass btn-icon"
                  onClick={() => { setSelectedDeck(null); setMode('admin'); }}
                  title="Admin Dashboard"
                  style={{ color: 'var(--warning)' }}
                >
                  <Shield size={18} />
                </button>
              )}
              <button className="btn btn-glass btn-icon" onClick={toggleTheme} title="Switch Theme">
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
          </header>

          <div className="home-container">
            <div className="home-column">
              {isSyncing ? (
                <HomeSkeleton />
              ) : (
                <>
                  {userLoggedIn ? (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', borderColor: 'rgba(16, 185, 129, 0.4)', position: 'relative' }}>
                        <button onClick={handleLogoutClick} className="btn-glass btn-icon" style={{ position: 'absolute', right: '1rem', top: '1rem', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', color: 'var(--danger)', padding: 0 }} title="Logout">
                          <CloudOff size={18} strokeWidth={2} />
                        </button>
                        <Check size={48} color="var(--success)" style={{ marginBottom: '1.5rem', margin: '0 auto' }} />
                        <h3 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>Connected to Google Drive</h3>
                        <p style={{ color: 'var(--text-muted)' }}>Any changes from now on will be synced automatically.</p>
                      </div>
                      <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                        <button className="btn btn-primary" onClick={() => handleSyncFromDrive(false)} style={{ padding: '1.2rem', fontSize: '1.1rem', flex: 1, borderRadius: '12px' }}>
                          ▶ Start
                        </button>
                        <button
                          className="btn btn-glass glass-panel-hover"
                          onClick={() => handleSyncFromDrive(true)}
                          style={{ padding: '1.2rem', fontSize: '1.1rem', flex: 1, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--primary)', borderColor: 'var(--primary)' }}
                        >
                          <Sparkles size={18} /> AI Scan
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <button className="btn btn-glass glass-panel-hover" onClick={handleLoginClick} style={{ padding: '1.5rem', fontSize: '1.2rem', width: '100%', borderColor: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        <Cloud size={28} color="var(--primary)" />
                        Sign in with Google to experience full features
                      </button>
                    </div>
                  )}
                  {syncMessage && (
                    <div className="animate-fade-in" style={{ marginTop: '1rem', padding: '1rem', borderRadius: '12px', background: syncMessage.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: syncMessage.type === 'error' ? 'var(--danger)' : '#60a5fa', border: `1px solid ${syncMessage.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`, textAlign: 'center', fontWeight: '500' }}>
                      {syncMessage.text}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="home-divider">
              <div className="line"></div>
              <span>{isSyncing ? '---' : 'or Local Upload'}</span>
              <div className="line"></div>
            </div>

            <div className="home-column">
              {isSyncing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                  <Skeleton height="200px" borderRadius="20px" className="glass-panel" style={{ opacity: 0.5 }} />
                  <Skeleton height="80px" borderRadius="12px" />
                </div>
              ) : (
                <FileLoader onDataLoaded={handleDataLoaded} />
              )}
            </div>
          </div>

          <Footer />
        </main>
        <AddDeckModal
          isOpen={isAddDeckModalOpen}
          onClose={() => setIsAddDeckModalOpen(false)}
          onDeckCreated={handleDeckCreated}
          onOpenImport={() => { setIsAddDeckModalOpen(false); setImportModalInitialId(''); setIsImportModalOpen(true); }}
          setConfirmConfig={setConfirmConfig}
        />
        <ImportSharedDeckModal
          isOpen={isImportModalOpen}
          initialDeckId={importModalInitialId}
          onClose={() => setIsImportModalOpen(false)}
          onDeckImported={handleDeckImported}
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
      </>
    );
  }

  // 2. Render deck selection if multiple decks and none selected
  if (data && !selectedDeck) {
    if (showSettings) {
      return (
        <>
          <main className="app-main" style={{ padding: '1.5rem 5vw', display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
            <SettingsPage
              userEmail={userEmail}
              googleId={localStorage.getItem('g_id') || ''}
              data={data}
              driveFileId={driveFileId}
              backendUrl={import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'}
              onBack={() => setShowSettings(false)}
              onDataChange={(newData) => {
                setData(newData);
                if (import.meta.env.VITE_DEV_MODE !== 'true') {
                  uploadDecksToDrive(newData, driveFileId);
                }
              }}
              onOpenConfirm={(config) => setConfirmConfig({ ...config, isOpen: config.isOpen !== undefined ? config.isOpen : true })}
              onShareDeck={(deck) => {
                setShowSettings(false);
                setSelectedDeck(deck);
                setManagerTab('share');
                setMode('manage');
              }}
            />
          </main>
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
        </>
      );
    }
    return (
      <>
        <main className="app-main" style={{ padding: '1.5rem 5vw', display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
          {/* Collapsible Container */}
          <div style={{
            position: 'sticky',
            top: '0',
            zIndex: 100,
            background: 'var(--bg-main)',
            marginBottom: '1.5rem',
            transition: 'all 0.4s'
          }}>
            <div style={{
              maxHeight: isHeaderCollapsed ? '0' : '400px',
              opacity: isHeaderCollapsed ? 0 : 1,
              overflow: isHeaderCollapsed ? 'hidden' : 'visible',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              pointerEvents: isHeaderCollapsed ? 'none' : 'auto',
              position: 'relative'
            }}>
              <header className="app-header" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem',
                padding: '1rem 2rem',
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(10px)',
                borderRadius: '16px',
                border: '1px solid var(--glass-border)',
                position: 'relative',
                zIndex: 200,
                pointerEvents: isHeaderCollapsed ? 'none' : 'auto'
              }}>
                <div className="app-header-left" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <h1 className="text-gradient" style={{ fontSize: '1.5rem', margin: 0 }}>Select a Deck</h1>
                  {isSyncing && <Loader2 size={16} className="animate-spin" color="var(--primary)" />}
                </div>
                <div className="app-header-right" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  {(userLoggedIn || import.meta.env.VITE_DEV_MODE === 'true') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                      <span className="header-sync-label" style={{ color: 'var(--success)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        {import.meta.env.VITE_DEV_MODE === 'true' ? (
                          <>
                            <Cloud size={14} /> DEV MODE (demo@example.com)
                          </>
                        ) : (
                          <>
                            <Cloud size={14} /> Synced {displayName && `(${displayName})`}
                          </>
                        )}
                      </span>
                      <button onClick={handleLogoutClick} className="btn-glass btn-icon" style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', color: 'var(--danger)', padding: 0 }} title="Logout">
                        <CloudOff size={16} strokeWidth={2} />
                      </button>
                    </div>
                  )}
                  <NotificationBell 
                    userLoggedIn={userLoggedIn} 
                    userEmail={userEmail} 
                    onOpenImportModal={(id) => {
                      setImportModalInitialId(id);
                      setIsImportModalOpen(true);
                      setMode(null);
                    }} 
                  />
                  <button
                    className="btn btn-glass btn-icon"
                    onClick={() => (userLoggedIn || import.meta.env.VITE_DEV_MODE === 'true') && setShowSettings(true)}
                    disabled={!(userLoggedIn || import.meta.env.VITE_DEV_MODE === 'true')}
                    title={(userLoggedIn || import.meta.env.VITE_DEV_MODE === 'true') ? "Settings" : "Login to access settings"}
                    aria-label="Open Settings"
                    style={{
                      color: 'var(--text-muted)',
                      cursor: (userLoggedIn || import.meta.env.VITE_DEV_MODE === 'true') ? 'pointer' : 'not-allowed',
                      opacity: (userLoggedIn || import.meta.env.VITE_DEV_MODE === 'true') ? 1 : 0.4
                    }}
                  >
                    <Settings size={18} />
                  </button>
                  {userEmail === 'binhlhce200315@gmail.com' && (
                    <button
                      className="btn btn-glass btn-icon"
                      onClick={() => { setSelectedDeck(null); setMode('admin'); }}
                      title="Admin Dashboard"
                      style={{ color: 'var(--warning)' }}
                    >
                      <Shield size={18} />
                    </button>
                  )}
                  <button className="btn btn-glass btn-icon" onClick={toggleTheme}>
                    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                  </button>
                  <button className="btn btn-glass" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={resetAll}>Go back</button>
                </div>
              </header>

              {/* Tab Switcher */}
              <div className="tab-switcher" style={{ position: 'relative', zIndex: 50, pointerEvents: isHeaderCollapsed ? 'none' : 'auto' }}>
                <button
                  className={`tab-btn${activeTab === 'decks' ? ' active' : ''}`}
                  onClick={() => setActiveTab('decks')}
                >
                  <BookOpen size={16} /> My Decks
                </button>
                <button
                  className={`tab-btn${activeTab === 'scan' ? ' active' : ''}`}
                  onClick={() => (userLoggedIn || import.meta.env.VITE_DEV_MODE === 'true') && setActiveTab('scan')}
                  disabled={!(userLoggedIn || import.meta.env.VITE_DEV_MODE === 'true')}
                  title={!(userLoggedIn || import.meta.env.VITE_DEV_MODE === 'true') ? 'Login to Google Drive first' : ''}
                >
                  <Sparkles size={16} /> AI Scan
                </button>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => (userLoggedIn || import.meta.env.VITE_DEV_MODE === 'true') && setIsAddDeckModalOpen(true)}
                    disabled={!(userLoggedIn || import.meta.env.VITE_DEV_MODE === 'true')}
                    title={!(userLoggedIn || import.meta.env.VITE_DEV_MODE === 'true') ? 'Login to Google Drive first' : ''}
                    style={{
                      padding: '0.4rem 1.25rem',
                      fontSize: '0.85rem',
                      height: '36px',
                      borderRadius: '10px'
                    }}
                  >
                    <Plus size={16} /> Add Deck
                  </button>
                </div>
              </div>

              {activeTab === 'decks' && (
                <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', maxWidth: '600px', position: 'relative', zIndex: 50, pointerEvents: isHeaderCollapsed ? 'none' : 'auto' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={20} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="Search decks..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ width: '100%', padding: '1rem 1rem 1rem 3.5rem', borderRadius: '12px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', fontSize: '1rem', outline: 'none' }}
                    />
                  </div>
                  <button className="btn btn-glass" onClick={toggleSort} style={{ width: '52px', height: '52px', borderRadius: '12px', flexShrink: 0, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }} title="Toggle Sort Order">
                    {sortOrder === 'asc' ? 'A-Z↓' : sortOrder === 'desc' ? 'Z-A↑' : 'Sort'}
                  </button>
                </div>
              )}
            </div>

            {/* Toggle Button as a Tab - Rectangular with 4 rounded corners and higher transparency */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: isHeaderCollapsed ? '0' : '-16px',
              zIndex: 106,
              position: 'relative',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
            }}>
              <button
                onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
                className="btn-glass"
                style={{
                  width: '52px',
                  height: '24px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  background: 'rgba(255, 255, 255, 0.03)',
                  backdropFilter: 'blur(12px)',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                  transition: 'all 0.4s'
                }}
              >
                {isHeaderCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
              </button>
            </div>
          </div>

          {activeTab === 'decks' ? (
            <>
              {/* Selection Action Bar - sticky top */}
              {isSelectionMode && (
                <div style={{
                  position: 'sticky', top: 0, zIndex: 200,
                  background: 'var(--glass-bg)', backdropFilter: 'blur(12px)', border: '1px solid var(--glass-border)',
                  borderRadius: '16px', padding: '0.8rem 1.5rem', display: 'flex', alignItems: 'center',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.2)', justifyContent: 'space-between',
                  marginBottom: '1rem'
                }}>
                  <button
                    onClick={cancelSelection}
                    className="btn btn-glass"
                    style={{ border: 'none', padding: '0.6rem 1rem', fontWeight: 'bold' }}
                  >
                    Cancel
                  </button>
                  <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-main)', textAlign: 'center' }}>
                    Selected <span style={{ color: 'var(--primary)' }}>{selectedDecks.size}</span>
                  </div>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={selectedDecks.size === 0}
                    className="btn"
                    style={{
                      background: selectedDecks.size > 0 ? '#ef4444' : 'rgba(239, 68, 68, 0.1)',
                      color: selectedDecks.size > 0 ? '#fff' : 'rgba(239, 68, 68, 0.4)',
                      border: `1px solid ${selectedDecks.size > 0 ? '#ef4444' : 'rgba(239, 68, 68, 0.2)'}`,
                      borderRadius: '12px', padding: '0.6rem 1rem', fontWeight: 'bold',
                      cursor: selectedDecks.size > 0 ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                    }}
                  >
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              )}
              <div className="animate-fade-in deck-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: '1.5rem' }}>
                {processedDecks.length === 0 ? (
                  <div style={{ textAlign: 'center', gridColumn: '1 / -1', padding: '4rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <BookOpen size={48} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--text-main)', marginBottom: '0.5rem' }}>You don't have any decks yet.</h3>
                    <p style={{ color: 'var(--text-muted)' }}>Try clicking the <strong style={{color: 'var(--primary)'}}>+ Add Deck</strong> or <strong style={{color: 'var(--primary)'}}>AI Scan</strong> button to get started!</p>
                  </div>
                ) : processedDecks.map((deck, idx) => {
                    const isPinned = deck.deck_id && pinnedDecks.includes(deck.deck_id);
                  return (
                    <div
                      key={deck.deck_id || idx}
                      className={`glass-panel glass-panel-hover deck-item-card ${isSelectionMode && selectedDecks.has(deck.deck_id || deck.name) ? 'selected' : ''}`}
                      style={{
                        padding: '2.5rem 2rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', position: 'relative',
                        transition: 'all 0.2s',
                        border: isSelectionMode && selectedDecks.has(deck.deck_id || deck.name) ? '1px solid #ef4444' : undefined,
                        background: isSelectionMode && selectedDecks.has(deck.deck_id || deck.name) ? 'rgba(239, 68, 68, 0.05)' : undefined
                      }}
                      onMouseDown={(e) => {
                        // Only trigger long press if not clicking the pin button
                        if (!e.target.closest('.pin-btn') && !isSelectionMode) handleDeckPressStart(deck, e);
                      }}
                      onMouseUp={() => !isSelectionMode && handleDeckPressEnd()}
                      onMouseLeave={() => !isSelectionMode && handleDeckPressEnd()}
                      onTouchStart={(e) => {
                        if (!e.target.closest('.pin-btn') && !isSelectionMode) handleDeckPressStart(deck, e);
                      }}
                      onTouchMove={handleDeckTouchMove}
                      onTouchEnd={() => !isSelectionMode && handleDeckPressEnd()}
                      onClick={(e) => handleDeckClick(deck, e)}
                      onContextMenu={(e) => {
                        if (!isSelectionMode) {
                          e.preventDefault(); // Prevent right click context menu if it helps mobile long press
                        }
                      }}
                    >
                      {/* Top-right: Checkbox + Pin */}
                      <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', zIndex: 10 }}>
                        {isSelectionMode && (
                          <input
                            type="checkbox"
                            checked={selectedDecks.has(deck.deck_id || deck.name)}
                            readOnly
                            style={{ width: '20px', height: '20px', accentColor: '#ef4444', pointerEvents: 'none', cursor: 'pointer' }}
                          />
                        )}
                        {deck.deck_id && (
                          <button
                            onClick={(e) => !isSelectionMode && togglePin(deck.deck_id, e)}
                            disabled={isSelectionMode}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: isSelectionMode ? 'not-allowed' : 'pointer',
                              padding: '0.5rem',
                              borderRadius: '50%',
                              display: 'flex',
                              opacity: isSelectionMode ? 0.3 : 1,
                              transition: 'opacity 0.2s'
                            }}
                            className="btn-icon pin-btn"
                            title={isSelectionMode ? "Disabled in selection mode" : (isPinned ? "Unpin deck" : "Pin deck")}
                          >
                            {isPinned ? <Star size={24} color="#fbbf24" strokeWidth={2.5} /> : <Star size={24} color="var(--text-muted)" strokeWidth={1.5} />}
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', marginTop: '1rem' }}>
                        <BookOpen size={36} color="var(--primary)" />
                        {isPinned && <span style={{ fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24', padding: '0.3rem 0.6rem', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(251, 191, 36, 0.2)' }}><Star size={12} color="#fbbf24" strokeWidth={2.5} /> Pinned</span>}
                      </div>

                      <h3 style={{ fontSize: '1.3rem', marginBottom: '0.5rem', color: 'var(--text-main)', wordBreak: 'break-word', paddingRight: '2.5rem' }}>{deck.name || 'Deck ' + (idx + 1)}</h3>
                      {deck.cards && (
                        <div style={{ marginTop: 'auto' }}>
                          <div style={{ width: '100%', height: '4px', background: 'var(--glass-bg)', borderRadius: '2px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                            <div
                              style={{
                                width: `${(deck.cards.filter(c => c.status === 2).length / deck.cards.length) * 100}%`,
                                height: '100%',
                                background: 'var(--success)',
                                transition: 'width 0.3s ease'
                              }}
                            ></div>
                          </div>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Progress:</span>
                            <strong style={{ color: 'var(--primary)' }}>
                              {deck.cards.filter(c => c.status === 2).length} / {deck.cards.length}
                            </strong>
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <AIScan userLoggedIn={userLoggedIn} onScanComplete={handleScanComplete} />
          )}
          <Footer />
        </main>
        <AddDeckModal
          isOpen={isAddDeckModalOpen}
          onClose={() => setIsAddDeckModalOpen(false)}
          onDeckCreated={handleDeckCreated}
          onOpenImport={() => { setIsAddDeckModalOpen(false); setImportModalInitialId(''); setIsImportModalOpen(true); }}
          setConfirmConfig={setConfirmConfig}
        />
        <ImportSharedDeckModal
          isOpen={isImportModalOpen}
          initialDeckId={importModalInitialId}
          onClose={() => setIsImportModalOpen(false)}
          onDeckImported={handleDeckImported}
        />

        <ConfirmationModal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={confirmDeleteDeck}
          title={`Delete ${selectedDecks.size} Deck${selectedDecks.size > 1 ? 's' : ''}?`}
          description="Are you sure you want to permanently delete the selected decks? All flashcards inside will be lost. This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          icon={Trash2}
          type="danger"
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
      </>
    )
  }

  // 3. Render chosen deck mode options
  return (
    <>
      {isSyncing && <div className="top-progress-bar"></div>}
      <main className="app-main" style={{ padding: '1.5rem 5vw', display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
        <div style={{
          position: 'sticky',
          top: '0',
          zIndex: 100,
          background: 'var(--bg-main)',
          marginBottom: '1.5rem',
          transition: 'all 0.4s'
        }}>
          <div style={{
            maxHeight: isHeaderCollapsed ? '0' : '300px',
            opacity: isHeaderCollapsed ? 0 : 1,
            overflow: isHeaderCollapsed ? 'hidden' : 'visible',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: 'none',
            position: 'relative'
          }}>
            <header className="app-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '2rem',
              padding: '1rem 2rem',
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(10px)',
              borderRadius: '16px',
              border: '1px solid var(--glass-border)',
              position: 'relative',
              zIndex: 200,
              pointerEvents: isHeaderCollapsed ? 'none' : 'auto'
            }}>
              <div className="app-header-left" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h1 className="text-gradient" style={{ fontSize: '1.5rem', margin: 0 }}>Flashcard AI</h1>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', borderLeft: '1px solid var(--glass-border)', paddingLeft: '1rem' }}>
                  {selectedDeck?.name || 'Unnamed Deck'} ({selectedDeck?.cards?.length || 0} cards)
                </span>
              </div>
              <div className="app-header-right" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                {(userLoggedIn || import.meta.env.VITE_DEV_MODE === 'true') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <span className="header-sync-label" style={{ color: 'var(--success)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      {import.meta.env.VITE_DEV_MODE === 'true' ? (
                        <>
                          <Cloud size={14} /> DEV MODE (demo@example.com)
                        </>
                      ) : (
                        <>
                          <Cloud size={14} /> Drive Synced {displayName && `(${displayName})`}
                        </>
                      )}
                    </span>
                    <button onClick={handleLogoutClick} className="btn-glass btn-icon" style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', color: 'var(--danger)', padding: 0 }} title="Logout">
                      <CloudOff size={16} strokeWidth={2} />
                    </button>
                  </div>
                )}
                <NotificationBell />
                {userEmail === 'binhlhce200315@gmail.com' && (
                  <button
                    className="btn btn-glass btn-icon"
                    onClick={() => { setSelectedDeck(null); setMode('admin'); }}
                    title="Admin Dashboard"
                    style={{ color: 'var(--warning)' }}
                  >
                    <Shield size={18} />
                  </button>
                )}
                <button className="btn btn-glass btn-icon" onClick={toggleTheme}>
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
                {data && (
                  <button className="btn btn-glass" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={() => { setSelectedDeck(null); setMode(null); }}>
                    {data.length > 1 ? 'Switch Deck' : 'My Decks'}
                  </button>
                )}
              </div>
            </header>
          </div>

          {/* Toggle Button as a Tab - Centered and Dynamic In/Out position */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: isHeaderCollapsed ? '0' : '-32px',
            zIndex: 106,
            position: 'relative',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
          }}>
            <button
              onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
              className="btn-glass"
              style={{
                width: '52px',
                height: '24px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                background: 'rgba(255, 255, 255, 0.03)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                transition: 'all 0.4s'
              }}
            >
              {isHeaderCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {mode === 'home' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, position: 'relative' }}>
              {/* Delete this deck button (top-right) */}
              <button
                onClick={handleDeleteCurrentDeck}
                className="btn-icon"
                title="Delete this deck"
                style={{
                  position: 'absolute', top: '0', right: '0',
                  background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)',
                  cursor: 'pointer', padding: '0.6rem', borderRadius: '12px', display: 'flex',
                  transition: 'all 0.2s', zIndex: 10
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; e.currentTarget.style.borderColor = '#ef4444'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.15)'; }}
              >
                <Trash2 size={20} color="#ef4444" />
              </button>
              <h2 className="study-title" style={{ fontSize: '2rem', marginBottom: '3rem', textAlign: 'center' }}>How would you like to study today?</h2>

              <div className="mode-selection-container" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <div
                  className="glass-panel glass-panel-hover mode-card"
                  style={{ padding: '3rem 2rem', width: '300px', textAlign: 'center', cursor: 'pointer' }}
                  onClick={() => setMode('flashcard')}
                >
                  <div style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2))', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                    <Layers size={40} color="var(--primary)" />
                  </div>
                  <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Flashcards</h3>
                  <p style={{ color: 'var(--text-muted)' }}>Review terms and definitions using an interactive 3D flipping card system.</p>
                </div>

                <div
                  className="glass-panel glass-panel-hover mode-card"
                  style={{ padding: '3rem 2rem', width: '300px', textAlign: 'center', cursor: 'pointer' }}
                  onClick={() => setMode('quiz')}
                >
                  <div style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(59, 130, 246, 0.2))', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                    <BrainCircuit size={40} color="var(--success)" />
                  </div>
                  <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Quiz Mode</h3>
                  <p style={{ color: 'var(--text-muted)' }}>Assess your progress rapidly with an intelligent multiple-choice testing system.</p>
                </div>
              </div>

              <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-glass glass-panel-hover"
                  onClick={() => { setManagerTab('view'); setMode('manage'); }}
                  style={{ fontSize: '0.95rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1.5rem' }}
                >
                  <Settings size={18} /> Manage Cards
                </button>
                <button
                  className="btn btn-glass"
                  onClick={() => setMode('shortcuts')}
                  style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1.5rem' }}
                >
                  <Keyboard size={18} /> Shortcuts
                </button>
              </div>
            </div>
          )}

          {mode === 'flashcard' && <FlashcardMode deck={selectedDeck} onBack={() => setMode('home')} onDeckModified={handleDeckModified} setConfirmConfig={setConfirmConfig} userLoggedIn={userLoggedIn} />}
          {mode === 'quiz' && <QuizMode deck={selectedDeck} onBack={() => setMode('home')} onDeckModified={handleDeckModified} setConfirmConfig={setConfirmConfig} userLoggedIn={userLoggedIn} />}
          {mode === 'shortcuts' && <KeyboardShortcuts onBack={() => setMode('home')} />}
          {mode === 'manage' && <DeckManager deck={selectedDeck} allDecks={data} onBack={() => { setMode('home'); setManagerTab('view'); }} onDeckModified={handleDeckModified} setConfirmConfig={setConfirmConfig} userLoggedIn={userLoggedIn} initialTab={managerTab} />}
        </div>
        <AddDeckModal
          isOpen={isAddDeckModalOpen}
          onClose={() => setIsAddDeckModalOpen(false)}
          onDeckCreated={handleDeckCreated}
          setConfirmConfig={setConfirmConfig}
        />

        {/* Delete Deck Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="animate-fade-in" style={{
            position: 'fixed', inset: 0, zIndex: 3000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)'
          }}>
            <div className="glass-panel scale-in" style={{
              width: '100%', maxWidth: '420px', background: 'var(--card-bg)',
              borderRadius: '24px', overflow: 'hidden', padding: '2rem',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
              border: '1px solid rgba(239, 68, 68, 0.3)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <AlertTriangle size={32} color="#ef4444" />
                </div>
              </div>
              <h2 style={{ fontSize: '1.25rem', textAlign: 'center', margin: '0 0 1rem', color: 'var(--text-main)' }}>Delete {selectedDecks.size} Deck{selectedDecks.size > 1 ? 's' : ''}?</h2>
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5', margin: '0 0 2rem' }}>
                Are you sure you want to permanently delete the selected decks? All flashcards inside will be lost. This action cannot be undone.
              </p>

              <div style={{ display: 'flex', gap: '0.8rem' }}>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="btn btn-glass"
                  style={{ flex: 1, padding: '0.8rem', borderRadius: '14px', fontWeight: 'bold' }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteDeck}
                  disabled={isDeleting}
                  className="btn"
                  style={{
                    flex: 1, padding: '0.8rem', borderRadius: '14px', fontWeight: 'bold',
                    background: '#ef4444', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    opacity: isDeleting ? 0.7 : 1, cursor: isDeleting ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}


      </main>
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
    </>
  );
}

export default App;
