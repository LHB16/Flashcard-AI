import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, RotateCcw } from 'lucide-react';

const FlashcardMode = ({ deck, onBack, onDeckModified }) => {
  const cards = deck?.cards || [];
  
  const [index, setIndex] = useState(0);
  const [isFlipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [unknown, setUnknown] = useState(0);
  const [done, setDone] = useState(false);
  
  // Drag tilt state
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // Swipe-out animation state: 'left' | 'right' | null
  const [swipeOut, setSwipeOut] = useState(null);
  
  const touchStartX = useRef(null);
  const isAnimating = useRef(false);
  const cardRef = useRef(null);

  // Initialize
  useEffect(() => {
    if (!cards.length) return;
    const currentKnown = cards.filter(c => c.status === 2).length;
    const currentUnknown = cards.filter(c => c.status === 1).length;
    
    setKnown(currentKnown);
    setUnknown(currentUnknown);
    
    const nextIndex = cards.findIndex(c => !c.status || c.status === 0);
    if (nextIndex === -1 && cards.length > 0) {
      setDone(true);
    } else if (nextIndex > 0) {
      setIndex(nextIndex);
    }
  }, [deck?.deck_id, cards]);

  // Core advance with swipe-out animation
  const advanceCardWithAnimation = useCallback((wasKnown) => {
    if (index >= cards.length || isAnimating.current) return;
    
    isAnimating.current = true;
    
    if (wasKnown) {
      cards[index].status = 2;
    } else {
      cards[index].status = 1;
    }
    
    setKnown(cards.filter(c => c.status === 2).length);
    setUnknown(cards.filter(c => c.status === 1).length);
    
    if (onDeckModified) onDeckModified();
    
    // Trigger swipe-out animation
    setSwipeOut(wasKnown ? 'right' : 'left');
    
    // After animation completes, advance card
    setTimeout(() => {
      setSwipeOut(null);
      setFlipped(false);
      setDragX(0);
      
      const nextIndex = index + 1;
      if (nextIndex >= cards.length) {
        setDone(true);
      } else {
        setIndex(nextIndex);
      }
      
      setTimeout(() => {
        isAnimating.current = false;
      }, 200);
    }, 300);
  }, [index, cards, onDeckModified]);

  const goBackCard = useCallback(() => {
    if (isAnimating.current) return;
    
    let prevIndex = index - 1;
    if (done) prevIndex = cards.length - 1;
    
    if (prevIndex >= 0) {
      isAnimating.current = true;
      
      const prevStatus = cards[prevIndex].status;
      if (prevStatus === 2) {
        setKnown(k => Math.max(0, k - 1));
      } else if (prevStatus === 1) {
        setUnknown(u => Math.max(0, u - 1));
      }
      cards[prevIndex].status = 0;
      if (onDeckModified) onDeckModified();

      setDone(false);
      setFlipped(false);
      setDragX(0);
      setIndex(prevIndex);
      
      setTimeout(() => {
        isAnimating.current = false;
      }, 500);
    }
  }, [index, done, cards, onDeckModified]);

  const restartStudy = () => {
    if (isAnimating.current) return;
    cards.forEach(c => c.status = 0);
    if (onDeckModified) onDeckModified();
    setIndex(0);
    setKnown(0);
    setUnknown(0);
    setDone(false);
    setFlipped(false);
    setDragX(0);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.repeat) return;

      if (done) {
        if (e.key === 'r' || e.key === 'R') restartStudy();
        return;
      }
      if (['ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        e.preventDefault();
        setFlipped(f => !f);
      } else if (e.key === 'ArrowLeft') {
        advanceCardWithAnimation(false);
      } else if (e.key === 'ArrowRight') {
        advanceCardWithAnimation(true);
      } else if (e.key === 'r' || e.key === 'R') {
        goBackCard();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [advanceCardWithAnimation, goBackCard, done]);

  // Touch drag handlers with direction detection
  const touchStartY = useRef(null);
  const touchStartTime = useRef(0);
  const directionLocked = useRef(null); // 'horizontal' | 'vertical' | null

  const handleTouchStart = (e) => {
    if (isAnimating.current) return;
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    touchStartTime.current = Date.now();
    directionLocked.current = null;
    setIsDragging(false);
    setDragX(0);
  };

  const handleTouchMove = useCallback((e) => {
    if (touchStartX.current === null || isAnimating.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX.current;
    const dy = touch.clientY - touchStartY.current;

    if (!directionLocked.current && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      directionLocked.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }

    if (directionLocked.current === 'horizontal') {
      e.preventDefault();
      setIsDragging(true);
      setDragX(dx);
    }
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (touchStartX.current === null || isAnimating.current) {
      setIsDragging(false);
      setDragX(0);
      directionLocked.current = null;
      return;
    }

    const touch = e.changedTouches[0];
    const duration = Date.now() - touchStartTime.current;
    const dxAbs = Math.abs(touch.clientX - touchStartX.current);
    const dyAbs = Math.abs(touch.clientY - touchStartY.current);

    // Người dùng tối ưu chạm nhanh gọn
    if (dxAbs < 10 && dyAbs < 10 && duration < 200) {
      setIsDragging(false);
      setDragX(0);
      setFlipped(f => !f);
      touchStartX.current = null;
      touchStartY.current = null;
      directionLocked.current = null;
      return;
    }

    const dx = touch.clientX - touchStartX.current;
    setIsDragging(false);

    // Fallback: Chạm bình thường (kể cả giữ lâu)
    if (dxAbs < 15 && dyAbs < 15) {
      setDragX(0);
      setFlipped(f => !f);
    } else if (directionLocked.current === 'horizontal') {
      if (dx > 80) {
        advanceCardWithAnimation(true);
      } else if (dx < -80) {
        advanceCardWithAnimation(false);
      } else {
        setDragX(0);
      }
    } else {
      setDragX(0);
    }

    touchStartX.current = null;
    touchStartY.current = null;
    directionLocked.current = null;
  }, [advanceCardWithAnimation]);

  // Mouse drag handlers for desktop
  const mouseDownRef = useRef(false);

  const handleMouseDown = (e) => {
    // Nếu là thiết bị cảm ứng, bỏ qua sự kiện chuột giả lập (simulated mouse events) để không bị lỗi "giữ mới lật"
    if (isAnimating.current || e.button !== 0 || ('ontouchstart' in window)) return;
    e.preventDefault();
    mouseDownRef.current = true;
    touchStartX.current = e.clientX;
    setIsDragging(false);
    setDragX(0);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!mouseDownRef.current || touchStartX.current === null || isAnimating.current) return;
      const dx = e.clientX - touchStartX.current;
      if (Math.abs(dx) > 5) {
        setIsDragging(true);
        setDragX(dx);
      }
    };

    const handleMouseUp = (e) => {
      if (!mouseDownRef.current) return;
      mouseDownRef.current = false;
      if (touchStartX.current === null || isAnimating.current) {
        setIsDragging(false);
        setDragX(0);
        return;
      }
      const dx = e.clientX - touchStartX.current;
      setIsDragging(false);

      if (dx > 80) {
        advanceCardWithAnimation(true);
      } else if (dx < -80) {
        advanceCardWithAnimation(false);
      } else if (Math.abs(dx) < 5) {
        setDragX(0);
        setFlipped(f => !f);
      } else {
        setDragX(0);
      }
      touchStartX.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [advanceCardWithAnimation]);

  const getCorrectAnswerText = (card) => {
    if (card.correct_answers && card.correct_answers.length > 0) {
      const correctAns = card.correct_answers[0];
      if (card.options) {
        const optionMatched = card.options.find(opt => opt.startsWith(correctAns + ".") || opt === correctAns);
        return optionMatched || correctAns;
      }
      return correctAns;
    }
    return "—";
  };

  // Compute card transform
  const getCardTransform = () => {
    if (swipeOut === 'left') {
      return { transform: 'translateX(-120%) rotate(-25deg)', opacity: 0, transition: 'transform 0.3s ease-in, opacity 0.3s ease-in' };
    }
    if (swipeOut === 'right') {
      return { transform: 'translateX(120%) rotate(25deg)', opacity: 0, transition: 'transform 0.3s ease-in, opacity 0.3s ease-in' };
    }
    if (isDragging && Math.abs(dragX) > 5) {
      const rotation = Math.max(-20, Math.min(20, dragX * 0.15));
      const translateX = dragX;
      return { 
        transform: `translateX(${translateX}px) rotate(${rotation}deg)`, 
        opacity: 1, 
        transition: 'none' 
      };
    }
    return { transform: 'translateX(0) rotate(0deg)', opacity: 1, transition: 'transform 0.3s ease-out, opacity 0.3s ease-out' };
  };

  // Compute border glow based on drag
  const getCardBorderStyle = () => {
    if (swipeOut === 'right' || (isDragging && dragX > 30)) {
      const intensity = swipeOut ? 1 : Math.min(1, (dragX - 30) / 100);
      return {
        borderColor: `rgba(16, 185, 129, ${0.3 + intensity * 0.7})`,
        boxShadow: `0 0 ${20 * intensity}px rgba(16, 185, 129, ${0.2 * intensity}), var(--glass-shadow)`
      };
    }
    if (swipeOut === 'left' || (isDragging && dragX < -30)) {
      const intensity = swipeOut ? 1 : Math.min(1, (-dragX - 30) / 100);
      return {
        borderColor: `rgba(239, 68, 68, ${0.3 + intensity * 0.7})`,
        boxShadow: `0 0 ${20 * intensity}px rgba(239, 68, 68, ${0.2 * intensity}), var(--glass-shadow)`
      };
    }
    return {};
  };

  if (!cards || cards.length === 0) {
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: '2rem', textAlign: 'center' }}>
        <h3>This deck has no cards!</h3>
        <button className="btn btn-glass" onClick={onBack} style={{ marginTop: '1rem' }}>Go Back</button>
      </div>
    );
  }

  // Results screen
  if (done) {
    const total = known + unknown;
    const pct = total > 0 ? Math.round((known / total) * 100) : 0;
    
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '800px', margin: '0 auto', padding: '1rem 0' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%', marginBottom: '1.5rem' }}>
          <button className="btn btn-glass" onClick={onBack}>
            <ArrowLeft size={18} /> Select Deck
          </button>
        </div>
        
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', width: '100%', maxWidth: '500px' }}>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '1.5rem', color: 'var(--text-main)' }}>Results</h2>
          <div style={{ fontSize: '4rem', margin: '1rem 0' }}>
            {pct >= 70 ? '🎉' : pct >= 50 ? '😐' : '😓'}
          </div>
          <div style={{ fontSize: '3.5rem', fontWeight: '900', color: pct >= 70 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)', marginBottom: '1rem' }}>
            {pct}%
          </div>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
            ✅ Known: <strong style={{color:'var(--success)', fontSize:'1.2rem'}}>{known}</strong> &nbsp;  ❌ Unknown: <strong style={{color:'var(--danger)', fontSize:'1.2rem'}}>{unknown}</strong>
          </p>
          
          <button className="btn" style={{ background: 'var(--primary)', color: 'white', padding: '1rem', width: '100%', border: 'none', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', cursor: 'pointer' }} onClick={restartStudy}>
            🔄 Study again
          </button>
          <button className="btn btn-glass" style={{ width: '100%', padding: '1rem' }} onClick={onBack}>
            🏠 Go Back
          </button>
        </div>
      </div>
    );
  }

  const currentCard = cards[index];
  const cardTransform = getCardTransform();
  const cardBorder = getCardBorderStyle();

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '800px', margin: '0 auto', padding: '0 0 2rem 0', overflow: 'hidden' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '1rem', alignItems: 'center' }}>
        <button className="btn btn-glass btn-icon" style={{ padding: '0.4rem 0.8rem', borderRadius: '8px' }} onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
          {index + 1} / {cards.length}
        </span>
        <button className="btn btn-glass btn-icon" style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', background:'rgba(239, 68, 68, 0.1)', color:'var(--danger)' }} onClick={restartStudy} title="Reset all progress (Restart)">
          Reset
        </button>
      </div>

      {/* Progress Bar */}
      <div style={{ width: '100%', height: '4px', background: 'var(--glass-bg)', borderRadius: '2px', overflow: 'hidden', marginBottom: '1rem' }}>
        <div style={{ width: `${((index + 1) / cards.length) * 100}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.3s ease-out' }}></div>
      </div>

      {/* Score Pills */}
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '2rem', alignItems: 'center', padding: '0 1rem' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--glass-bg)', padding: '0.4rem 1rem', borderRadius: '20px' }}>
          <span style={{ fontSize: '1.1rem' }}>❌</span>
          <span style={{ color: 'var(--danger)', fontWeight: 'bold', fontSize: '1.2rem' }}>{unknown}</span>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', flex: 1, textAlign: 'center' }}>
          ← Unknown &nbsp;/&nbsp; Known →
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--glass-bg)', padding: '0.4rem 1rem', borderRadius: '20px' }}>
          <span style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '1.2rem' }}>{known}</span>
          <span style={{ fontSize: '1.1rem' }}>✅</span>
        </div>
      </div>

      {/* Card with drag tilt */}
      <div 
        ref={cardRef}
        className={`flip-card ${isFlipped ? 'flipped' : ''}`} 
        style={{ 
          cursor: 'pointer', marginBottom: '2rem', flex: 1, minHeight: '350px', maxHeight: '65vh', 
          touchAction: 'pan-y', width: '100%',
          ...cardTransform
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        <div className="flip-card-inner" style={cardBorder}>
          <div className="flip-card-front" style={{ display: 'flex', flexDirection: 'column', ...cardBorder }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '1.5px', color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '1rem', display: 'block', textAlign: 'left', width: '100%' }}>QUESTION</span>
            <div 
              style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', width: '100%', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'pan-y' }}
            >
              <h3 style={{ fontSize: '1.2rem', lineHeight: '1.5', fontWeight: 600, width: '100%', marginBottom: '1.5rem', color: 'var(--text-main)', textAlign: 'left' }}>
                {currentCard?.question}
              </h3>
              
              {currentCard?.options && currentCard.options.length > 0 && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.6rem', textAlign: 'left' }}>
                  {currentCard.options.map((opt, i) => (
                    <div key={i} className="option-item" style={{ fontSize: '0.95rem' }}>
                      {opt}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <p style={{ marginTop: '1rem', opacity: 0.8, fontSize: '0.9rem', color: 'var(--primary)', textAlign: 'center', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem', width: '100%' }}>
              👆 Tap / Space to flip
            </p>
          </div>

          <div className="flip-card-back" style={{ display: 'flex', flexDirection: 'column', ...cardBorder }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '1.5px', color: 'var(--success)', textTransform: 'uppercase', marginBottom: '1rem', display: 'block', textAlign: 'left', width: '100%' }}>ANSWER</span>
            <div 
              style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', width: '100%', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'pan-y' }}
            >
              <p style={{ fontSize: '1.3rem', fontWeight: 600, color: 'var(--success)', lineHeight: '1.6', textAlign: 'left' }}>
                {getCorrectAnswerText(currentCard)}
              </p>
              {currentCard?.notes && (
                 <p style={{ marginTop: '1rem', fontSize: '1rem', color: 'var(--warning)', fontStyle: 'italic', textAlign: 'left' }}>
                   {currentCard.notes}
                 </p>
              )}
            </div>
            <p style={{ marginTop: '1rem', opacity: 0.8, fontSize: '0.9rem', color: 'var(--primary)', textAlign: 'center', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem', width: '100%' }}>
              👆 Tap / Space to flip back
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', width: '100%' }}>
        <button className="btn btn-glass btn-icon" style={{flex: 1, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '1rem', borderRadius: '12px' }} onClick={(e) => { e.stopPropagation(); advanceCardWithAnimation(false); }}>
          <span style={{ fontSize: '2rem', display: 'block' }}>❌</span>
        </button>
        <button className="btn btn-glass btn-icon" onClick={(e) => { e.stopPropagation(); goBackCard(); }} disabled={index === 0 && !done} style={{ padding: '0', height: '60px', width: '60px', borderRadius: '50%', alignSelf: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} title="Previous Card (R)">
          <RotateCcw size={24} />
        </button>
        <button className="btn btn-glass btn-icon" style={{flex: 1, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '1rem', borderRadius: '12px' }} onClick={(e) => { e.stopPropagation(); advanceCardWithAnimation(true); }}>
          <span style={{ fontSize: '2rem', display: 'block' }}>✅</span>
        </button>
      </div>

    </div>
  );
};

export default FlashcardMode;

