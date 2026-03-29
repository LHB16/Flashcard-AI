import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, RotateCcw } from 'lucide-react';

const globalHistoryCache = {};

const FlashcardMode = ({ deck, onBack, onDeckModified }) => {
  const cards = deck?.cards || [];
  
  const [index, setIndex] = useState(0);
  const [isFlipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [unknown, setUnknown] = useState(0);
  const [done, setDone] = useState(false);
  const [history, setHistory] = useState(() => globalHistoryCache[deck?.deck_id || 'default'] || []);
  
  const touchStartX = useRef(null);
  const isAnimating = useRef(false);

  useEffect(() => {
    globalHistoryCache[deck?.deck_id || 'default'] = history;
  }, [history, deck?.deck_id]);

  // Khởi tạo thẻ chưa học
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

  const advanceCard = useCallback((wasKnown) => {
    if (index >= cards.length || isAnimating.current) return;
    
    isAnimating.current = true;
    const currentStatus = cards[index].status || 0;
    setHistory(prev => [...prev, { index, wasKnown, oldStatus: currentStatus }]);
    
    if (wasKnown) {
      setKnown(k => k + 1);
      cards[index].status = 2;
    } else {
      setUnknown(u => u + 1);
      cards[index].status = 1;
    }
    
    if (onDeckModified) onDeckModified();
    
    setFlipped(false);
    
    // Auto-advance and 1-second block
    setTimeout(() => {
      const nextIndex = index + 1;
      if (nextIndex >= cards.length) {
        setDone(true);
      } else {
        setIndex(nextIndex);
      }
      
      // Giữ khóa thêm 850ms nữa (Tổng cộng 1 giây)
      setTimeout(() => {
        isAnimating.current = false;
      }, 850);
    }, 150);
  }, [index, cards, onDeckModified]);

  const undo = useCallback(() => {
    if (history.length === 0 || isAnimating.current) return;
    
    const last = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    
    if (last.wasKnown) setKnown(k => k - 1);
    else setUnknown(u => u - 1);
    
    cards[last.index].status = last.oldStatus;
    if (onDeckModified) onDeckModified();
    
    setDone(false);
    setFlipped(false);
    setIndex(last.index);

    isAnimating.current = true;
    setTimeout(() => {
      isAnimating.current = false;
    }, 1000); // 1 giây mới cho undo hoặc đánh giá tiếp
  }, [history, cards, onDeckModified]);

  const restartStudy = () => {
    if (isAnimating.current) return;
    cards.forEach(c => c.status = 0);
    if (onDeckModified) onDeckModified();
    setIndex(0);
    setKnown(0);
    setUnknown(0);
    setHistory([]);
    setDone(false);
    setFlipped(false);
  };

  // Trình bắt phím tắt
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.repeat) return; // Chống nhấn giữ đè phím (Auto-repeat)

      if (done) {
        if (e.key === 'r' || e.key === 'R') restartStudy();
        return;
      }
      if (['ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        e.preventDefault();
        setFlipped(f => !f);
      } else if (e.key === 'ArrowLeft') {
        advanceCard(false);
      } else if (e.key === 'ArrowRight') {
        advanceCard(true);
      } else if (e.key === 'r' || e.key === 'R') {
        undo();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [advanceCard, undo, done]);

  // Trình bắt Touch vuốt
  const handlePointerDown = (e) => {
    if (isAnimating.current) return;
    touchStartX.current = e.clientX;
  };

  const handlePointerUp = (e) => {
    if (touchStartX.current === null || isAnimating.current) return;
    const diffX = e.clientX - touchStartX.current;
    
    // Vuốt > 50px
    if (diffX > 50) {
      advanceCard(true); // Know
    } else if (diffX < -50) {
      advanceCard(false); // Unknown
    } else if (Math.abs(diffX) < 10) {
      // Tap lật
      setFlipped(!isFlipped);
    }
    touchStartX.current = null;
  };

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

  if (!cards || cards.length === 0) {
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: '2rem', textAlign: 'center' }}>
        <h3>This deck has no cards!</h3>
        <button className="btn btn-glass" onClick={onBack} style={{ marginTop: '1rem' }}>Go Back</button>
      </div>
    );
  }

  // Màn hình Results
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

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '800px', margin: '0 auto', padding: '0 0 2rem 0' }}>
      
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

      {/* Card */}
      <div 
        className={`flip-card ${isFlipped ? 'flipped' : ''}`} 
        style={{ cursor: 'pointer', marginBottom: '2rem', flex: 1, minHeight: '350px', touchAction: 'pan-y', width: '100%' }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { touchStartX.current = null; }}
      >
        <div className="flip-card-inner">
          <div className="flip-card-front" style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '1.5px', color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '1rem', display: 'block', textAlign: 'left', width: '100%' }}>QUESTION</span>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', width: '100%' }}>
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

          <div className="flip-card-back" style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '1.5px', color: 'var(--success)', textTransform: 'uppercase', marginBottom: '1rem', display: 'block', textAlign: 'left', width: '100%' }}>ANSWER</span>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', width: '100%' }}>
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

      {/* Swipe Overlay Hint Bar */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', width: '100%' }}>
        <button className="btn btn-glass btn-icon" style={{flex: 1, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '1rem', borderRadius: '12px' }} onClick={(e) => { e.stopPropagation(); advanceCard(false); }}>
          <span style={{ fontSize: '2rem', display: 'block' }}>❌</span>
        </button>
        <button className="btn btn-glass btn-icon" onClick={(e) => { e.stopPropagation(); undo(); }} disabled={history.length === 0} style={{ padding: '0', height: '60px', width: '60px', borderRadius: '50%', alignSelf: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} title="Undo (R)">
          <RotateCcw size={24} />
        </button>
        <button className="btn btn-glass btn-icon" style={{flex: 1, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '1rem', borderRadius: '12px' }} onClick={(e) => { e.stopPropagation(); advanceCard(true); }}>
          <span style={{ fontSize: '2rem', display: 'block' }}>✅</span>
        </button>
      </div>

    </div>
  );
};

export default FlashcardMode;
