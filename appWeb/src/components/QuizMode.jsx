import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const QuizMode = ({ deck, onBack }) => {
  const cards = deck?.cards || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [answers, setAnswers] = useState({});
  const [sessionId] = useState(() => crypto.randomUUID());
  const [startedAt] = useState(() => new Date().toISOString());
  
  const syncTimeoutRef = useRef(null);

  const deckId = deck?.deck_id || deck?.title || 'unknown';
  const googleId = localStorage.getItem('g_id');

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

  if (!cards || cards.length === 0) {
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: '2rem', textAlign: 'center' }}>
        <h3>This deck has no cards!</h3>
        <button className="btn btn-glass" onClick={onBack} style={{ marginTop: '1rem' }}>Go Back</button>
      </div>
    );
  }

  const currentCard = cards[currentIndex];

  const handleSelectOption = (index, opt) => {
    if (isAnswered) return;
    
    const letterMatch = opt.match(/^([A-Z])\./);
    const answerLetter = letterMatch ? letterMatch[1] : opt;
    const correctLetter = currentCard.correct_answers[0];
    const isCorrect = (answerLetter === correctLetter) || (opt === correctLetter) || (opt.startsWith(correctLetter + "."));
    
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
  };

  const handleNext = () => {
    if (currentIndex < cards.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      setSelectedAnswer(null);
      setIsAnswered(false);
    } else {
      setIsFinished(true);
    }
  };

  const resetQuiz = () => {
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setScore(0);
    setWrongCount(0);
    setIsFinished(false);
    setAnswers({});
  };

  if (isFinished) {
    const pct = cards.length > 0 ? Math.round((score / cards.length) * 100) : 0;
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: '3rem', textAlign: 'center', maxWidth: '600px', margin: '4rem auto' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem' }} className="text-gradient">Quiz Completed!</h2>
        <div style={{ fontSize: '4rem', margin: '1rem 0' }}>
          {pct >= 70 ? '🎉' : pct >= 50 ? '😐' : '😓'}
        </div>
        <div style={{ fontSize: '3rem', fontWeight: '900', color: pct >= 70 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)', marginBottom: '1rem' }}>
          {pct}%
        </div>
        <p style={{ marginBottom: '2.5rem', color: 'var(--text-muted)', fontSize: '1.1rem' }}>
          ✅ Correct: <strong style={{color:'var(--success)'}}>{score}</strong> &nbsp; ❌ Wrong: <strong style={{color:'var(--danger)'}}>{wrongCount}</strong> &nbsp; / &nbsp; {cards.length} questions
        </p>
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
          <button className="btn btn-glass" onClick={resetQuiz}>Study again</button>
          <button className="btn btn-primary" onClick={onBack}>Go to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ width: '100%', maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
        <button className="btn btn-glass" onClick={onBack}>
          <ArrowLeft size={18} /> Go Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Question {currentIndex + 1} / {cards.length}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ width: '100%', height: '4px', background: 'var(--glass-bg)', borderRadius: '2px', overflow: 'hidden', marginBottom: '2rem' }}>
        <div style={{ width: `${((currentIndex + 1) / cards.length) * 100}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.3s ease-out' }}></div>
      </div>

      <div className="glass-panel" style={{ padding: '2.5rem', marginBottom: '2rem', minHeight: '200px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h3 style={{ fontSize: '1.4rem', lineHeight: '1.6', fontWeight: 500 }}>{currentCard.question}</h3>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
        {currentCard.options?.map((opt, i) => {
          const letterMatch = opt.match(/^([A-Z])\./);
          const answerLetter = letterMatch ? letterMatch[1] : opt;
          const correctLetter = currentCard.correct_answers[0];
          const isCorrectAns = (answerLetter === correctLetter) || (opt === correctLetter) || opt.startsWith(correctLetter + ".");
          
          let btnClass = "btn btn-glass";
          if (isAnswered) {
            if (isCorrectAns) {
              btnClass = "btn";
            } else if (selectedAnswer === opt) {
              btnClass = "btn";
            }
          } else if (selectedAnswer === opt) {
             btnClass = "btn btn-glass";
          }

          return (
            <button 
              key={i} 
              className={btnClass}
              style={{
                justifyContent: 'flex-start',
                padding: '1.2rem 1.5rem',
                textAlign: 'left',
                background: isAnswered && isCorrectAns ? 'rgba(16, 185, 129, 0.2)' : 
                            isAnswered && selectedAnswer === opt ? 'rgba(239, 68, 68, 0.2)' : undefined,
                borderColor: isAnswered && isCorrectAns ? 'rgba(16, 185, 129, 0.5)' : 
                             isAnswered && selectedAnswer === opt ? 'rgba(239, 68, 68, 0.5)' : undefined
              }}
              onClick={() => handleSelectOption(i, opt)}
              disabled={isAnswered}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span>{opt}</span>
                {isAnswered && isCorrectAns && <CheckCircle size={20} color="var(--success)" />}
                {isAnswered && selectedAnswer === opt && !isCorrectAns && <XCircle size={20} color="var(--danger)" />}
              </div>
            </button>
          );
        })}
      </div>

      {isAnswered && (
        <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
          <button className="btn btn-primary" onClick={handleNext}>
            {currentIndex === cards.length - 1 ? 'Finish' : 'Next Question'}
          </button>
        </div>
      )}
    </div>
  );
};

export default QuizMode;
