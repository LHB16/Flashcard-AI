import React, { useState, useEffect, useRef } from 'react';
import FileLoader from './components/FileLoader';
import FlashcardMode from './components/FlashcardMode';
import QuizMode from './components/QuizMode';
import { Layers, BrainCircuit, Moon, Sun, BookOpen, Cloud, Check, Loader2, CloudOff } from 'lucide-react';
import { initGoogleIdentity, loginGoogle, logoutGoogle, fetchDecksFromDrive, uploadDecksToDrive } from './services/driveSync';

function App() {
  const [data, setData] = useState(null);
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [mode, setMode] = useState(null); // 'home', 'flashcard', 'quiz'
  const [theme, setTheme] = useState('dark');

  // Google Sync state
  const [userLoggedIn, setUserLoggedIn] = useState(false);
  const [driveFileId, setDriveFileId] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  // Load theme from localStorage on start
  useEffect(() => {
    const savedTheme = localStorage.getItem('app-theme') || 'dark';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Initialize Google API Auth
    const timer = setInterval(() => {
      if (window.google) {
        clearInterval(timer);
        initGoogleIdentity(
          (token) => {
            setUserLoggedIn(true);
            handleSyncFromDrive();
          },
          (err) => {
            console.error(err);
            setSyncMessage({ type: 'error', text: 'Authentication failed. Please check your browser settings.' });
            setIsSyncing(false);
          }
        );
      }
    }, 500);

    return () => clearInterval(timer);
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
       } catch(e) {
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
    setData([...data]); // trigger global re-render to reflect stat changes if needed

    if (!userLoggedIn || !driveFileId) return;

    // Auto sync to Drive softly in the background after 3s of inactivity
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(async () => {
      try {
        await uploadDecksToDrive(data, driveFileId);
        console.log("Background sync complete");
      } catch (e) {
        console.error("Background sync failed:", e);
      }
    }, 3000);
  };

  // 1. Render file selection & Login first
  if (!data) {
    return (
      <>
        {isSyncing && <div className="top-progress-bar"></div>}
        <main style={{ padding: '2rem' }}>
        <header style={{ textAlign: 'center', marginBottom: '4rem', marginTop: '2rem', position: 'relative' }}>
          <button className="btn btn-glass btn-icon" onClick={toggleTheme} style={{ position: 'absolute', right: '1rem', top: 0 }} title="Switch Theme">
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <h1 className="text-gradient" style={{ fontSize: '3rem', letterSpacing: '-0.02em', marginBottom: '1rem' }}>Flashcard AI</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>Cross-platform sync & intelligent learning</p>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3rem', maxWidth: '600px', margin: '0 auto' }}>
          {isSyncing ? (
            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <Loader2 size={48} className="animate-spin" color="var(--primary)" />
              </div>
              <h3 style={{ fontSize: '1.3rem' }}>Syncing data with Google Drive...</h3>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Please wait a moment</p>
            </div>
          ) : (
            <>
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
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-muted)', width: '100%' }}>
                <span style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></span>
                or Local Upload
                <span style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></span>
              </div>

              <FileLoader onDataLoaded={handleDataLoaded} />
            </>
          )}
        </div>
      </main>
      </>
    );
  }

  // 2. Render deck selection if multiple decks and none selected
  if (data && !selectedDeck) {
    return (
      <>
        {isSyncing && <div className="top-progress-bar"></div>}
        <main className="app-main" style={{ padding: '2rem 5vw', display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
        <header className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', padding: '1rem 2rem', background: 'var(--glass-bg)', backdropFilter: 'blur(10px)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
          <div className="app-header-left" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h1 className="text-gradient" style={{ fontSize: '1.5rem', margin: 0 }}>Select a Deck</h1>
            {isSyncing && <Loader2 size={16} className="animate-spin" color="var(--primary)" />}
          </div>
          <div className="app-header-right" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {userLoggedIn && <span style={{ color: 'var(--success)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Cloud size={14}/> Synced</span>}
            <button className="btn btn-glass btn-icon" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="btn btn-glass" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={resetAll}>Go back</button>
          </div>
        </header>

        <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {data.map((deck, idx) => (
            <div 
              key={deck.deck_id || idx} 
              className="glass-panel glass-panel-hover" 
              style={{ padding: '2.5rem 2rem', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
              onClick={() => { setSelectedDeck(deck); setMode('home'); }}
            >
              <BookOpen size={36} color="var(--primary)" style={{ marginBottom: '1.5rem' }} />
              <h3 style={{ fontSize: '1.3rem', marginBottom: '0.5rem', color: 'var(--text-main)', wordBreak: 'break-word' }}>{deck.name || 'Deck ' + (idx + 1)}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: 'auto' }}>
                Cards: <strong style={{ color: 'var(--primary)' }}>{deck.cards?.length || 0}</strong> items
              </p>
            </div>
          ))}
        </div>
      </main>
      </>
    )
  }

  // 3. Render chosen deck mode options
  return (
    <>
      {isSyncing && <div className="top-progress-bar"></div>}
      <main className="app-main" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', minHeight: '100vh', maxWidth: '1000px', margin: '0 auto' }}>
      <header className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', padding: '1rem 2rem', background: 'var(--glass-bg)', backdropFilter: 'blur(10px)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
        <div className="app-header-left" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 className="text-gradient" style={{ fontSize: '1.5rem', margin: 0 }}>Flashcard AI</h1>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', borderLeft: '1px solid var(--glass-border)', paddingLeft: '1rem' }}>
            {selectedDeck?.name || 'Unnamed Deck'} ({selectedDeck?.cards?.length || 0} cards)
          </span>
        </div>
        <div className="app-header-right" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {userLoggedIn && <span style={{ color: 'var(--success)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Cloud size={14}/> Drive Synced</span>}
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
        {mode === 'quiz' && <QuizMode deck={selectedDeck} onBack={() => setMode('home')} />}
      </div>
    </main>
    </>
  );
}

export default App;
