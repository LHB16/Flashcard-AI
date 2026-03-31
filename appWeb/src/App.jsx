import React, { useState, useEffect, useRef } from 'react';
import FileLoader from './components/FileLoader';
import FlashcardMode from './components/FlashcardMode';
import QuizMode from './components/QuizMode';
import { Layers, BrainCircuit, Moon, Sun, BookOpen, Cloud, Check, Loader2, CloudOff, Search, Star, StarOff, ChevronUp, ChevronDown } from 'lucide-react';
import { initGoogleIdentity, loginGoogle, logoutGoogle, fetchDecksFromDrive, uploadDecksToDrive } from './services/driveSync';
import Footer from './components/Footer';

function App() {
  const [data, setData] = useState(null);
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [mode, setMode] = useState(null); // 'home', 'flashcard', 'quiz'
  const [theme, setTheme] = useState('dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  const [pinnedDecks, setPinnedDecks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pinned_decks')) || []; } catch(e) { return []; }
  });
  const [sortOrder, setSortOrder] = useState(() => {
    return localStorage.getItem('deck_sort_order') || 'none';
  });

  const togglePin = (deck_id, e) => {
    e.stopPropagation();
    if (!deck_id) return;
    setPinnedDecks(prev => {
      const newPinned = prev.includes(deck_id) ? prev.filter(id => id !== deck_id) : [...prev, deck_id];
      localStorage.setItem('pinned_decks', JSON.stringify(newPinned));
      return newPinned;
    });
  };

  const toggleSort = () => {
    setSortOrder(prev => {
      const next = prev === 'none' ? 'asc' : prev === 'asc' ? 'desc' : 'none';
      localStorage.setItem('deck_sort_order', next);
      return next;
    });
  };

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
    const handleScroll = () => {
      if (window.scrollY > 80) {
        setIsHeaderCollapsed(true);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('app-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const handleLoginClick = () => {
    setIsSyncing(true);
    loginGoogle();
    // After login popup, the callback inside initGoogleIdentity triggers (onSuccess -> handleSyncFromDrive)
  };

  const handleLogoutClick = () => {
    if (window.confirm("Are you sure you want to log out / disconnect from Google Drive?")) {
      logoutGoogle();
      setUserLoggedIn(false);
      setDriveFileId(null);
      setSyncMessage(null); // Tắt thông báo đỏ/xanh
    }
  };

  const handleSyncFromDrive = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const result = await fetchDecksFromDrive();
      if (result && result.data) {
        setDriveFileId(result.fileId);
        // Successfully loaded from drive
        handleDataLoaded(result.data, false);
      } else {
        setSyncMessage({ type: 'error', text: "No desk.json found on this Google Drive. Please upload a file manually below to initialize sync." });
      }
    } catch (e) {
      console.error(e);
      setSyncMessage({ type: 'error', text: "Failed to connect to Google Drive. Please try again." });
    }
    setIsSyncing(false);
  };

  const handleDataLoaded = async (decksData, isManualUpload = false) => {
    setData(decksData);
    if (decksData && decksData.length === 1) {
      setSelectedDeck(decksData[0]);
      setMode('home');
    } else {
      setSelectedDeck(null); // Force selection list
      setMode(null);
    }

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

  const resetAll = () => {
    setData(null);
    setSelectedDeck(null);
    setMode(null);
  };

  const syncTimeoutRef = useRef(null);

  const handleDeckModified = () => {
    setData(prev => prev ? [...prev] : prev);

    if (!userLoggedIn || !driveFileId) return;

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(async () => {
      try {
        const freshData = dataRef.current;
        if (!freshData) return;

        if (selectedDeck) {
          const known = selectedDeck.cards.filter(c => c.status === 2).length;
          const total = selectedDeck.cards.length;
          const percent = total > 0 ? Math.round((known / total) * 100) : 0;
          const gId = localStorage.getItem('g_id');

          if (gId) {
            fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'}/progress/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                google_id: gId,
                deck_id: selectedDeck.deck_id || selectedDeck.title,
                percent
              })
            }).catch(e => console.warn("Supabase Progress Sync issue:", e));
          }
        }
      } catch (e) {
        console.error("Background sync failed:", e);
      } finally {
        setIsDriveSyncing(false);
      }
    }, 3000);
  };

  // 1. Render file selection & Login first
  if (!data) {
    return (
      <>
        {isSyncing && <div className="top-progress-bar"></div>}
        <main className="app-main" style={{ padding: '2rem 5vw', display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
          <header style={{ textAlign: 'center', marginBottom: '4rem', marginTop: '2rem', position: 'relative' }}>
            <button className="btn btn-glass btn-icon" onClick={toggleTheme} style={{ position: 'absolute', right: '1rem', top: 0 }} title="Switch Theme">
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <h1 className="text-gradient" style={{ fontSize: '3rem', letterSpacing: '-0.02em', marginBottom: '1rem' }}>Flashcard AI</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>Cross-platform sync & intelligent learning</p>
          </header>

          <div className="home-container">
            {isSyncing ? (
              <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', width: '100%', maxWidth: '600px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                  <Loader2 size={48} className="animate-spin" color="var(--primary)" />
                </div>
                <h3 style={{ fontSize: '1.3rem' }}>Syncing data with Google Drive...</h3>
                <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Please wait a moment</p>
              </div>
            ) : (
              <>
                <div className="home-column">
                  {userLoggedIn ? (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', borderColor: 'rgba(16, 185, 129, 0.4)', position: 'relative' }}>
                        <button onClick={handleLogoutClick} className="btn-glass btn-icon" style={{ position: 'absolute', right: '1rem', top: '1rem', padding: '0.5rem', border: 'none' }} title="Logout">
                          <CloudOff size={18} />
                        </button>
                        <Check size={48} color="var(--success)" style={{ marginBottom: '1.5rem', margin: '0 auto' }} />
                        <h3 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>Connected to Google Drive</h3>
                        <p style={{ color: 'var(--text-muted)' }}>Any changes from now on will be synced automatically.</p>
                      </div>
                      <button className="btn btn-primary" onClick={handleSyncFromDrive} style={{ padding: '1.2rem', fontSize: '1.1rem', width: '100%', borderRadius: '12px' }}>
                        ▶ Start
                      </button>

                      {syncMessage && (
                        <div className="animate-fade-in" style={{ padding: '1rem', borderRadius: '12px', background: syncMessage.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: syncMessage.type === 'error' ? 'var(--danger)' : '#60a5fa', border: `1px solid ${syncMessage.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`, textAlign: 'center', fontWeight: '500' }}>
                          {syncMessage.text}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {syncMessage && (
                        <div className="animate-fade-in" style={{ padding: '1rem', borderRadius: '12px', background: syncMessage.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: syncMessage.type === 'error' ? 'var(--danger)' : '#60a5fa', border: `1px solid ${syncMessage.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`, textAlign: 'center', fontWeight: '500' }}>
                          {syncMessage.text}
                        </div>
                      )}
                      <button className="btn btn-glass glass-panel-hover" onClick={handleLoginClick} style={{ padding: '1.5rem', fontSize: '1.2rem', width: '100%', borderColor: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        <Cloud size={28} color="var(--primary)" />
                        Continue with Google Drive
                      </button>
                    </div>
                  )}
                </div>

                <div className="home-divider">
                  <div className="line"></div>
                  <span>or Local Upload</span>
                  <div className="line"></div>
                </div>

                <div className="home-column">
                  <FileLoader onDataLoaded={handleDataLoaded} />
                </div>
              </>
            )}
          </div>
          <Footer />
        </main>
      </>
    );
  }

  // 2. Render deck selection if multiple decks and none selected
  if (data && !selectedDeck) {
    return (
      <>
        {isSyncing && <div className="top-progress-bar"></div>}
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
              overflow: 'hidden',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              pointerEvents: isHeaderCollapsed ? 'none' : 'auto'
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
                border: '1px solid var(--glass-border)'
              }}>
                <div className="app-header-left" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <h1 className="text-gradient" style={{ fontSize: '1.5rem', margin: 0 }}>Select a Deck</h1>
                  {isSyncing && <Loader2 size={16} className="animate-spin" color="var(--primary)" />}
                </div>
                <div className="app-header-right" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  {userLoggedIn && (
                    <span style={{ color: 'var(--success)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Cloud size={14} /> Synced {displayName && `(${displayName})`}
                    </span>
                  )}
                  <button className="btn btn-glass btn-icon" onClick={toggleTheme}>
                    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                  </button>
                  <button className="btn btn-glass" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={resetAll}>Go back</button>
                </div>
              </header>

              <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', maxWidth: '600px' }}>
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
            </div>

            {/* Toggle Button as a Tab - Rectangular with 4 rounded corners and higher transparency */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              marginTop: isHeaderCollapsed ? '0' : '-32px',
              zIndex: 102,
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
                  boxShadow: isHeaderCollapsed ? '0 4px 15px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.4s'
                }}
              >
                {isHeaderCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
              </button>
            </div>
          </div>

          <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {processedDecks.map((deck, idx) => {
              const isPinned = deck.deck_id && pinnedDecks.includes(deck.deck_id);
              return (
              <div
                key={deck.deck_id || idx}
                className="glass-panel glass-panel-hover"
                style={{ padding: '2.5rem 2rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', position: 'relative' }}
                onClick={() => { setSelectedDeck(deck); setMode('home'); }}
              >
                {deck.deck_id && (
                  <button 
                    onClick={(e) => togglePin(deck.deck_id, e)}
                    style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', display: 'flex' }}
                    className="btn-icon"
                    title={isPinned ? "Unpin deck" : "Pin deck"}
                  >
                    {isPinned ? <Star size={24} color="#fbbf24" fill="#fbbf24" /> : <StarOff size={24} color="var(--text-muted)" />}
                  </button>
                )}
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                  <BookOpen size={36} color="var(--primary)" />
                  {isPinned && <span style={{ fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', padding: '0.3rem 0.6rem', borderRadius: '12px', display: 'inline-flex', alignItems: 'center' }}>📌 Pinned</span>}
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
            )})}
          </div>
          <Footer />
        </main>
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
            overflow: 'hidden',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: isHeaderCollapsed ? 'none' : 'auto'
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
              border: '1px solid var(--glass-border)'
            }}>
              <div className="app-header-left" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h1 className="text-gradient" style={{ fontSize: '1.5rem', margin: 0 }}>Flashcard AI</h1>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', borderLeft: '1px solid var(--glass-border)', paddingLeft: '1rem' }}>
                  {selectedDeck?.name || 'Unnamed Deck'} ({selectedDeck?.cards?.length || 0} cards)
                </span>
              </div>
              <div className="app-header-right" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                {userLoggedIn && (
                  <span style={{ color: 'var(--success)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Cloud size={14} /> Drive Synced {displayName && `(${displayName})`}
                  </span>
                )}
                <button className="btn btn-glass btn-icon" onClick={toggleTheme}>
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
                {data && data.length > 1 && (
                  <button className="btn btn-glass" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={() => { setSelectedDeck(null); setMode(null); }}>
                    Switch Deck
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
            zIndex: 102,
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
                boxShadow: isHeaderCollapsed ? '0 4px 15px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.4s'
              }}
            >
              {isHeaderCollapsed ? <ChevronDown size size={18} /> : <ChevronUp size={18} />}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {mode === 'home' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
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
            </div>
          )}

          {mode === 'flashcard' && <FlashcardMode deck={selectedDeck} onBack={() => setMode('home')} onDeckModified={handleDeckModified} />}
          {mode === 'quiz' && <QuizMode deck={selectedDeck} onBack={() => setMode('home')} onDeckModified={handleDeckModified} />}
        </div>
      </main>
    </>
  );
}

export default App;
