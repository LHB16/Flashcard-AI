import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, SkipForward, CheckCircle, XCircle, Square, CheckSquare, Loader2, Hourglass, AlertTriangle, RotateCcw } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';
import ChatBubble from './ChatBubble';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const QuizMode = React.memo(({ deck, onBack, onDeckModified, setConfirmConfig, userLoggedIn }) => {
  const cards = deck?.cards || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [selectedMulti, setSelectedMulti] = useState([]);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [answers, setAnswers] = useState({});
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [isLoading, setIsLoading] = useState(true);
  const [focusedIdx, setFocusedIdx] = useState(-1);

  const closeConfirm = () => setConfirmConfig(prev => ({ ...prev, isOpen: false }));

  const currentCard = cards[currentIndex];
  const multiChoice = currentCard?.question_type === 'multiple_choice' && currentCard?.correct_answers?.length > 1;
  const keyHandlersRef = useRef({});
  const syncTimeoutRef = useRef(null);

  const deckId = deck?.deck_id || deck?.title || 'unknown';
  const googleId = localStorage.getItem('g_id');

  // Helper: extract letter from option like "A. Something..."
  const getLetterFromOpt = (opt) => {
    const m = opt.match(/^([A-Z])\./);
    return m ? m[1] : opt;
  };

  // Helper: check if an option matches a correct answer entry
  const optMatchesAnswer = (opt, correctEntry) => {
    const letter = getLetterFromOpt(opt);
    return letter === correctEntry || opt === correctEntry || opt.startsWith(correctEntry + ".");
  };

  // Helper: is this a multiple_choice question?
  const isMultiChoice = (card) => {
    return card?.question_type === 'multiple_choice' && card?.correct_answers?.length > 1;
  };

  // Load saved session from Backend
  useEffect(() => {
    if (!googleId || !deckId) {
      setIsLoading(false);
      return;
    }

    fetch(`${BACKEND_URL}/progress/quiz/${encodeURIComponent(deckId)}?google_id=${googleId}`)
      .then(res => res.json())
      .then(result => {
        if (result.data) {
          const loadedAnswers = result.data.answers || {};
          const loadedIndex = result.data.current_index ?? 0;
          setCurrentIndex(loadedIndex < cards.length ? loadedIndex : 0);
          setAnswers(loadedAnswers);
          setScore(result.data.correct_count || 0);
          setWrongCount(result.data.wrong_count || 0);
          setSessionId(result.data.session_id || sessionId);
          setStartedAt(result.data.started_at || startedAt);

          // Check if all questions already answered
          if (Object.keys(loadedAnswers).length >= cards.length) {
            setIsFinished(true);
          }
          console.log(`📚 Quiz resumed at question ${loadedIndex + 1}, ${Object.keys(loadedAnswers).length}/${cards.length} answered`);
        }
      })
      .catch(e => console.warn("Load quiz session failed:", e))
      .finally(() => setIsLoading(false));
  }, [googleId, deckId]);

  // Restore UI state when navigating between questions
  useEffect(() => {
    const savedAnswer = answers[currentIndex];
    if (savedAnswer) {
      setIsAnswered(true);
      if (Array.isArray(savedAnswer.selected)) {
        setSelectedMulti(savedAnswer.selected);
        setSelectedAnswer(null);
      } else {
        setSelectedAnswer(savedAnswer.selected);
        setSelectedMulti([]);
      }
    } else {
      setIsAnswered(false);
      setSelectedAnswer(null);
      setSelectedMulti([]);
    }
    setFocusedIdx(-1);
  }, [currentIndex, answers]);

  // Debounced save to backend
  const saveToBackend = useCallback((updatedData = {}) => {
    if (!googleId) return;

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      fetch(`${BACKEND_URL}/progress/quiz/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          google_id: googleId,
          deck_id: deckId,
          session_id: sessionId,
          question_order: cards.map((_, i) => i),
          current_index: updatedData.current_index ?? currentIndex,
          answers: updatedData.answers ?? answers,
          correct_count: updatedData.correct_count ?? score,
          wrong_count: updatedData.wrong_count ?? wrongCount,
          started_at: startedAt
        })
      }).catch(e => console.warn("Quiz sync error:", e));
    }, 2000);
  }, [googleId, deckId, sessionId, cards, currentIndex, answers, score, wrongCount, startedAt]);

  // ============ NAVIGATION ============
  const goLeft = useCallback(() => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : cards.length - 1));
  }, [cards.length]);

  const goRight = useCallback(() => {
    setCurrentIndex(prev => (prev < cards.length - 1 ? prev + 1 : 0));
  }, [cards.length]);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!currentCard || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      const options = currentCard?.options || [];
      const showSubmit = multiChoice && !isAnswered && selectedMulti.length > 0;
      const totalFocusable = options.length + (showSubmit ? 1 : 0);

      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        setFocusedIdx(prev => prev <= 0 ? totalFocusable - 1 : prev - 1);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        setFocusedIdx(prev => (prev + 1) % totalFocusable);
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        if (focusedIdx >= 0 && focusedIdx < options.length) {
          e.preventDefault();
          const opt = options[focusedIdx];
          if (multiChoice) keyHandlersRef.current.handleToggleMulti?.(opt);
          else keyHandlersRef.current.handleSelectOption?.(focusedIdx, opt);
        } else if (focusedIdx === options.length && showSubmit) {
          e.preventDefault();
          keyHandlersRef.current.handleSubmitMulti?.();
        }
      } else if (e.key === '\\') {
        e.preventDefault();
        keyHandlersRef.current.goToFirstUnanswered?.();
      } else if (e.key === 'ArrowLeft') {
        goLeft();
      } else if (e.key === 'ArrowRight') {
        goRight();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goLeft, goRight, focusedIdx, currentCard, multiChoice, isAnswered, selectedMulti]);

  // Touch Swipe Navigation — using refs to avoid stale closures
  const containerRef = useRef(null);
  const indicatorRef = useRef(null);
  const startPointRef = useRef(null);
  const touchRef = useRef({ active: false, startX: 0, startY: 0, currentX: 0, currentY: 0, lockedDirection: null });

  const updateIndicator = useCallback((info) => {
    if (!indicatorRef.current || !startPointRef.current) return;

    if (!info.active || !info.lockedDirection) {
      indicatorRef.current.style.display = 'none';
      startPointRef.current.style.display = 'none';
      return;
    }

    const diffX = info.currentX - info.startX;
    if (Math.abs(diffX) < 10) {
      indicatorRef.current.style.display = 'none';
      startPointRef.current.style.display = 'none';
      return;
    }

    const lockRight = info.lockedDirection === 'right';
    const isRightSwipe = diffX > 0;
    const isOpposite = (lockRight && !isRightSwipe) || (!lockRight && isRightSwipe);
    const activated = Math.abs(diffX) > 60;

    // Update Start Point
    startPointRef.current.style.display = 'block';
    startPointRef.current.style.left = `${info.startX}px`;
    startPointRef.current.style.top = `${info.startY}px`;

    // Update Main Indicator
    indicatorRef.current.style.display = 'flex';
    indicatorRef.current.style.left = isRightSwipe ? '1.5rem' : 'auto';
    indicatorRef.current.style.right = !isRightSwipe ? '1.5rem' : 'auto';
    
    const bgColor = isOpposite 
      ? (activated ? 'rgba(59, 130, 246, 0.95)' : 'rgba(59, 130, 246, 0.4)')
      : (activated ? 'rgba(139, 92, 246, 0.95)' : 'rgba(139, 92, 246, 0.4)');
    
    indicatorRef.current.style.background = bgColor;
    indicatorRef.current.style.boxShadow = activated 
      ? (isOpposite ? '0 8px 32px rgba(59, 130, 246, 0.5)' : '0 8px 32px rgba(139, 92, 246, 0.5)') 
      : '0 4px 16px rgba(0,0,0,0.3)';

    // Update Icon (since we can't easily swap Lucide icons via style, we'll keep them both and toggle display)
    const iconNormal = indicatorRef.current.querySelector('.icon-normal');
    const iconJump = indicatorRef.current.querySelector('.icon-jump');
    const iconLeft = indicatorRef.current.querySelector('.icon-left');
    const iconRight = indicatorRef.current.querySelector('.icon-right');

    if (iconNormal) iconNormal.style.display = isOpposite ? 'none' : 'block';
    if (iconJump) iconJump.style.display = isOpposite ? 'block' : 'none';
    
    // Nested direction icons
    if (iconLeft) iconLeft.style.display = (!isOpposite && isRightSwipe) ? 'block' : 'none';
    if (iconRight) iconRight.style.display = (!isOpposite && !isRightSwipe) ? 'block' : 'none';
  }, []);

  const handleTouchStart = useCallback((e) => {
    const t = e.touches[0];
    touchRef.current = {
      active: true,
      startX: t.clientX,
      startY: t.clientY,
      currentX: t.clientX,
      currentY: t.clientY,
      lockedDirection: null,
    };
    updateIndicator(touchRef.current);
  }, [updateIndicator]);

  const handleTouchEnd = useCallback(() => {
    const info = touchRef.current;
    if (!info.active) return;

    const diffX = info.currentX - info.startX;

    if (info.lockedDirection) {
      const lockRight = info.lockedDirection === 'right';
      
      if ((lockRight && diffX > 60) || (!lockRight && diffX < -60)) {
        if (lockRight) goLeft();
        else goRight();
      }
      else if ((lockRight && diffX < -60) || (!lockRight && diffX > 60)) {
        keyHandlersRef.current.goToFirstUnanswered?.();
      }
    }

    touchRef.current = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0, lockedDirection: null };
    updateIndicator(touchRef.current);
  }, [goLeft, goRight, updateIndicator]);

  const handleTouchMove = useCallback((e) => {
    const info = touchRef.current;
    if (!info.active) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const dx = Math.abs(currentX - info.startX);
    const dy = Math.abs(currentY - info.startY);

    if (!info.lockedDirection && dx > 20 && dx > dy) {
      info.lockedDirection = (currentX - info.startX) > 0 ? 'right' : 'left';
    }

    info.currentX = currentX;
    info.currentY = currentY;
    updateIndicator(info);
  }, [updateIndicator]);


  const goToFirstUnanswered = () => {
    const idx = cards.findIndex((_, i) => !answers[i]);
    if (idx !== -1) setCurrentIndex(idx);
  };

  // ============ ANSWER HANDLERS ============
  const answeredCount = Object.keys(answers).length;
  const firstUnansweredIdx = cards.findIndex((_, i) => !answers[i]);

  const checkFinished = (newAnswers) => {
    if (Object.keys(newAnswers).length >= cards.length) {
      setTimeout(() => setIsFinished(true), 800);
    }
  };

  // --- Single choice handler ---
  const handleSelectOption = (index, opt) => {
    if (isAnswered) return;

    const answerLetter = getLetterFromOpt(opt);
    const correctLetter = currentCard.correct_answers[0];
    const isCorrect = optMatchesAnswer(opt, correctLetter);

    setSelectedAnswer(opt);
    setIsAnswered(true);

    const newAnswers = { ...answers, [currentIndex]: { selected: opt, correct: isCorrect } };
    setAnswers(newAnswers);

    let newScore = score;
    let newWrong = wrongCount;

    if (isCorrect) {
      newScore = score + 1;
      setScore(newScore);
    } else {
      newWrong = wrongCount + 1;
      setWrongCount(newWrong);
    }

    saveToBackend({
      answers: newAnswers,
      correct_count: newScore,
      wrong_count: newWrong,
      current_index: currentIndex
    });

    checkFinished(newAnswers);
  };

  // --- Multiple choice: toggle selection ---
  const handleToggleMulti = (opt) => {
    if (isAnswered) return;
    setSelectedMulti(prev =>
      prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]
    );
  };

  // --- Multiple choice: submit ---
  const handleSubmitMulti = () => {
    if (isAnswered || selectedMulti.length === 0) return;

    const selectedLetters = selectedMulti.map(getLetterFromOpt).sort();
    const correctLetters = [...currentCard.correct_answers].sort();

    const isCorrect =
      selectedLetters.length === correctLetters.length &&
      selectedLetters.every((l, i) => l === correctLetters[i]);

    setIsAnswered(true);

    const newAnswers = { ...answers, [currentIndex]: { selected: selectedMulti, correct: isCorrect } };
    setAnswers(newAnswers);

    let newScore = score;
    let newWrong = wrongCount;

    if (isCorrect) {
      newScore = score + 1;
      setScore(newScore);
    } else {
      newWrong = wrongCount + 1;
      setWrongCount(newWrong);
    }

    saveToBackend({
      answers: newAnswers,
      correct_count: newScore,
      wrong_count: newWrong,
      current_index: currentIndex
    });

    checkFinished(newAnswers);
  };

  // Keep ref updated with latest handlers for keyboard useEffect
  keyHandlersRef.current = { handleToggleMulti, handleSelectOption, handleSubmitMulti, goToFirstUnanswered };

  // ============ RESET ============
  const resetQuiz = () => {
    setConfirmConfig({
      isOpen: true,
      title: "Reset Progress?",
      description: "Are you sure you want to reset all quiz progress? This action cannot be undone.",
      confirmText: "Reset",
      type: "danger",
      icon: RotateCcw,
      onConfirm: () => {
        setCurrentIndex(0);
        setSelectedAnswer(null);
        setSelectedMulti([]);
        setIsAnswered(false);
        setScore(0);
        setWrongCount(0);
        setIsFinished(false);
        setAnswers({});

        // Xóa session trên backend để lần reload sau không bị restore lại trạng thái cũ
        if (googleId) {
          fetch(`${BACKEND_URL}/progress/deck/on-modified`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ google_id: googleId, deck_id: deckId, action: 'reset' })
          }).catch(e => console.warn('Reset session failed:', e));
        }

        closeConfirm();
      }
    });
  };

  // ============ RENDER ============
  if (isLoading) {
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: '3rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <Hourglass size={32} className="animate-spin-slow" color="var(--primary)" />
        <h3 style={{ margin: 0 }}>Loading quiz session...</h3>
      </div>
    );
  }

  if (!cards || cards.length === 0) {
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: '2rem', textAlign: 'center' }}>
        <h3>This deck has no cards!</h3>
        <button className="btn btn-glass" onClick={onBack} style={{ marginTop: '1rem' }}>Go Back</button>
      </div>
    );
  }


  const correctCount = currentCard?.correct_answers?.length || 1;
  const progressPct = cards.length > 0 ? Math.round((answeredCount / cards.length) * 100) : 0;

  if (isFinished) {
    const pct = cards.length > 0 ? Math.round((score / cards.length) * 100) : 0;
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: '3rem', textAlign: 'center', maxWidth: '600px', margin: '4rem auto' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem' }} className="text-gradient">Results</h2>
        <div style={{ fontSize: '4rem', margin: '1rem 0' }}>
          {pct >= 70 ? '🎉' : pct >= 50 ? '😐' : '😓'}
        </div>
        <div style={{ fontSize: '3rem', fontWeight: '900', color: pct >= 70 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)', marginBottom: '1rem' }}>
          {pct}%
        </div>
        <p style={{ marginBottom: '2.5rem', color: 'var(--text-muted)', fontSize: '1.1rem' }}>
          ✅ Correct: <strong style={{ color: 'var(--success)' }}>{score}</strong> &nbsp; ❌ Wrong: <strong style={{ color: 'var(--danger)' }}>{wrongCount}</strong> &nbsp; / &nbsp; {cards.length} questions
        </p>
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
          <button className="btn btn-glass" onClick={resetQuiz}>Try again</button>
          <button className="btn btn-primary" onClick={onBack}>Choose Another Mode</button>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="animate-fade-in" 
      style={{ width: '100%', margin: '0 auto', padding: '1rem', position: 'relative', touchAction: 'pan-y' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Fixed Swipe Indicator (Direct DOM via Ref) */}
      <div ref={startPointRef} style={{
        position: 'fixed',
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: 'rgba(139, 92, 246, 0.2)',
        filter: 'blur(8px)',
        transform: 'translate(-50%, -50%)',
        zIndex: 9998,
        pointerEvents: 'none',
        display: 'none'
      }} />

      <div ref={indicatorRef} style={{
        position: 'fixed',
        top: '50%',
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        color: 'white',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        transform: 'translateY(-50%)',
        zIndex: 9999,
        transition: 'background 0.15s, box-shadow 0.15s',
        pointerEvents: 'none'
      }}>
        <div className="icon-jump" style={{ display: 'none' }}><SkipForward size={36} /></div>
        <div className="icon-normal" style={{ display: 'none' }}>
           <div className="icon-left" style={{ display: 'none' }}><ChevronLeft size={36} /></div>
           <div className="icon-right" style={{ display: 'none' }}><ChevronRight size={36} /></div>
        </div>
      </div>

      {/* Top Header Row */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr auto 1fr', 
        width: '100%', 
        marginBottom: '0.8rem', 
        alignItems: 'center', 
        gap: '0.8rem' 
      }}>
        <button className="btn btn-glass btn-icon" style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', justifySelf: 'start' }} onClick={onBack}>
          <ArrowLeft size={18} /> <span className="hide-on-mobile">Back</span>
        </button>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', justifySelf: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <button className="btn btn-glass btn-icon" style={{ padding: '0.5rem', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={goLeft} title="Previous question">
              <ChevronLeft size={20} />
            </button>
            
            <span style={{ fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '80px', justifyContent: 'center' }}>
              {currentIndex + 1} / {cards.length}
            </span>
            
            <button className="btn btn-glass btn-icon" style={{ padding: '0.5rem', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={goRight} title="Next question">
              <ChevronRight size={20} />
            </button>
          </div>

          {firstUnansweredIdx !== -1 && (
            <button className="btn btn-glass btn-icon" style={{ 
              padding: '0.2rem 0.6rem', 
              borderRadius: '6px', 
              background: 'rgba(139, 92, 246, 0.1)', 
              color: 'var(--primary)', 
              fontSize: '0.75rem', 
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              border: '1px solid rgba(139, 92, 246, 0.2)'
            }} onClick={goToFirstUnanswered} title={`Go to question ${firstUnansweredIdx + 1}`}>
              <SkipForward size={14} /> <span className="hide-on-mobile">Jump to</span> #{firstUnansweredIdx + 1}
            </button>
          )}
        </div>

        <button className="btn btn-glass btn-icon" style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', justifySelf: 'end' }} onClick={resetQuiz} title="Reset all progress (Restart)">
          <RotateCcw size={18} /> <span className="hide-on-mobile">Reset</span>
        </button>
      </div>

      {/* Progress Bar — based on answered count */}
      <div style={{ width: '100%', height: '4px', background: 'var(--glass-bg)', borderRadius: '2px', overflow: 'hidden', marginBottom: '0.4rem' }}>
        <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.3s ease-out' }}></div>
      </div>
      <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        {answeredCount} / {cards.length} answered ({progressPct}%)
      </div>

      <div className="glass-panel quiz-question-card" aria-describedby="leo-ai-context" style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h3 style={{ fontSize: '1.4rem', lineHeight: '1.6', fontWeight: 500 }}>{currentCard.question}</h3>
        {multiChoice && (
          <p style={{ color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 600, marginTop: '0.8rem', opacity: 0.9 }}>
            ☑️ Choose {correctCount} options
          </p>
        )}
      </div>

      {/* Hidden content for AI assistants and screen readers */}
      <div
        id="leo-ai-context"
        role="region"
        aria-label="Quiz context"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'normal',
          border: 0
        }}
      >
        <p>Current Question ({currentIndex + 1} of {cards.length}): {currentCard.question}</p>
        <p>The available options are: {currentCard.options?.map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`).join(' | ')}</p>
        {isAnswered && (
          <p>Correct answer(s): {
            currentCard.options?.filter(opt =>
              currentCard.correct_answers?.some(ca => optMatchesAnswer(opt, ca))
            ).join(' | ')
          }</p>
        )}
      </div>

      <div className="quiz-options-grid">
        {currentCard.options?.map((opt, i) => {
          const isCorrectAns = currentCard.correct_answers.some(ca => optMatchesAnswer(opt, ca));

          if (multiChoice) {
            // --- MULTIPLE CHOICE UI ---
            const isSelected = selectedMulti.includes(opt);
            const isWrongPick = isAnswered && isSelected && !isCorrectAns;

            return (
              <button
                key={i}
                className="btn btn-glass quiz-option-btn"
                style={{
                  justifyContent: 'flex-start',
                  padding: '1.2rem 1.5rem',
                  textAlign: 'left',
                  background: isAnswered && isCorrectAns ? 'rgba(16, 185, 129, 0.2)' :
                              isWrongPick ? 'rgba(239, 68, 68, 0.2)' :
                              isSelected && !isAnswered ? 'rgba(139, 92, 246, 0.15)' : 
                              focusedIdx === i ? 'rgba(139, 92, 246, 0.08)' : undefined,
                  borderColor: isAnswered && isCorrectAns ? 'rgba(16, 185, 129, 0.5)' :
                               isWrongPick ? 'rgba(239, 68, 68, 0.5)' :
                               isSelected && !isAnswered ? 'rgba(139, 92, 246, 0.5)' : 
                               focusedIdx === i ? 'rgba(139, 92, 246, 0.4)' : undefined
                }}
                onClick={() => handleToggleMulti(opt)}
                disabled={isAnswered}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                    {isAnswered ? (
                      isCorrectAns ? <CheckSquare size={20} color="var(--success)" /> :
                      isSelected ? <Square size={20} color="var(--danger)" /> :
                      <Square size={20} color="var(--text-muted)" style={{ opacity: 0.3 }} />
                    ) : (
                      isSelected ? <CheckSquare size={20} color="var(--primary)" /> :
                      <Square size={20} color="var(--text-muted)" style={{ opacity: 0.5 }} />
                    )}
                    <span>{opt}</span>
                  </div>
                  {isAnswered && isCorrectAns && <CheckCircle size={20} color="var(--success)" />}
                  {isWrongPick && <XCircle size={20} color="var(--danger)" />}
                  {focusedIdx === i && <span style={{ fontSize: '1.2rem', marginLeft: '8px', animation: 'bounce-x 0.8s infinite' }}>👈</span>}
                </div>
              </button>
            );
          } else {
            // --- SINGLE CHOICE UI ---
            return (
              <button
                key={i}
                className="btn btn-glass quiz-option-btn"
                style={{
                  justifyContent: 'flex-start',
                  padding: '1.2rem 1.5rem',
                  textAlign: 'left',
                  background: isAnswered && isCorrectAns ? 'rgba(16, 185, 129, 0.2)' :
                              isAnswered && selectedAnswer === opt ? 'rgba(239, 68, 68, 0.2)' : 
                              focusedIdx === i ? 'rgba(139, 92, 246, 0.08)' : undefined,
                  borderColor: isAnswered && isCorrectAns ? 'rgba(16, 185, 129, 0.5)' :
                               isAnswered && selectedAnswer === opt ? 'rgba(239, 68, 68, 0.5)' : 
                               focusedIdx === i ? 'rgba(139, 92, 246, 0.4)' : undefined
                }}
                onClick={() => handleSelectOption(i, opt)}
                disabled={isAnswered}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span>{opt}</span>
                  {isAnswered && isCorrectAns && <CheckCircle size={20} color="var(--success)" />}
                  {isAnswered && selectedAnswer === opt && !isCorrectAns && <XCircle size={20} color="var(--danger)" />}
                  {focusedIdx === i && <span style={{ fontSize: '1.2rem', marginLeft: '8px', animation: 'bounce-x 0.8s infinite' }}>👈</span>}
                </div>
              </button>
            );
          }
        })}
      </div>

      {/* Submit button for multiple choice (before answering) */}
      {multiChoice && !isAnswered && selectedMulti.length > 0 && (
        <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
          <button
            className="btn btn-primary"
            style={{ 
              padding: '0.8rem 2.5rem', 
              fontSize: '1.05rem', 
              fontWeight: 700,
              boxShadow: focusedIdx === currentCard.options.length ? '0 0 15px var(--primary)' : 'none',
              transform: focusedIdx === currentCard.options.length ? 'scale(1.05)' : 'none',
              transition: 'all 0.2s'
            }}
            onClick={handleSubmitMulti}
          >
            Submit ({selectedMulti.length}/{correctCount})
            {focusedIdx === currentCard.options.length && <span style={{ fontSize: '1.2rem', marginLeft: '8px', animation: 'bounce-x 0.8s infinite' }}>👈</span>}
          </button>
        </div>
      )}
      {/* Confirmation Modal */}

      <ChatBubble currentCard={currentCard} userLoggedIn={userLoggedIn} />
    </div>
  );
});

export default QuizMode;
