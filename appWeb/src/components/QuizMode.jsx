import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, CheckCircle, XCircle, Square, CheckSquare } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const QuizMode = ({ deck, onBack }) => {
  const cards = deck?.cards || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [selectedMulti, setSelectedMulti] = useState([]); // For multiple_choice
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [answers, setAnswers] = useState({});
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [isLoading, setIsLoading] = useState(true);

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

  // Tải session cũ từ Backend khi mở quiz
  useEffect(() => {
    if (!googleId || !deckId) {
      setIsLoading(false);
      return;
    }

    fetch(`${BACKEND_URL}/progress/quiz/${encodeURIComponent(deckId)}?google_id=${googleId}`)
      .then(res => res.json())
      .then(result => {
        if (result.data && result.data.current_index < cards.length) {
          setCurrentIndex(result.data.current_index + 1);
          setAnswers(result.data.answers || {});
          setScore(result.data.correct_count || 0);
          setWrongCount(result.data.wrong_count || 0);
          setSessionId(result.data.session_id || sessionId);
          setStartedAt(result.data.started_at || startedAt);

          if ((result.data.current_index + 1) >= cards.length) {
            setIsFinished(true);
          }
          console.log(`📚 Quiz resumed from question ${result.data.current_index + 2}`);
        }
      })
      .catch(e => console.warn("Load quiz session failed:", e))
      .finally(() => setIsLoading(false));
  }, [googleId, deckId]);

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

  if (isLoading) {
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: '3rem', textAlign: 'center' }}>
        <h3>⏳ Loading quiz session...</h3>
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

  const currentCard = cards[currentIndex];
  const multiChoice = isMultiChoice(currentCard);
  const correctCount = currentCard?.correct_answers?.length || 1;

  // --- Single choice handler (original logic) ---
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
  };

  const handleNext = () => {
    if (currentIndex < cards.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      setSelectedAnswer(null);
      setSelectedMulti([]);
      setIsAnswered(false);
    } else {
      setIsFinished(true);
    }
  };

  const resetQuiz = () => {
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setSelectedMulti([]);
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
          ✅ Correct: <strong style={{ color: 'var(--success)' }}>{score}</strong> &nbsp; ❌ Wrong: <strong style={{ color: 'var(--danger)' }}>{wrongCount}</strong> &nbsp; / &nbsp; {cards.length} questions
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
        {multiChoice && (
          <p style={{ color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 600, marginTop: '0.8rem', opacity: 0.9 }}>
            ☑️ Choose {correctCount} options
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
        {currentCard.options?.map((opt, i) => {
          const isCorrectAns = currentCard.correct_answers.some(ca => optMatchesAnswer(opt, ca));

          if (multiChoice) {
            // --- MULTIPLE CHOICE UI ---
            const isSelected = selectedMulti.includes(opt);
            const isWrongPick = isAnswered && isSelected && !isCorrectAns;

            return (
              <button
                key={i}
                className="btn btn-glass"
                style={{
                  justifyContent: 'flex-start',
                  padding: '1.2rem 1.5rem',
                  textAlign: 'left',
                  background: isAnswered && isCorrectAns ? 'rgba(16, 185, 129, 0.2)' :
                              isWrongPick ? 'rgba(239, 68, 68, 0.2)' :
                              isSelected && !isAnswered ? 'rgba(139, 92, 246, 0.15)' : undefined,
                  borderColor: isAnswered && isCorrectAns ? 'rgba(16, 185, 129, 0.5)' :
                               isWrongPick ? 'rgba(239, 68, 68, 0.5)' :
                               isSelected && !isAnswered ? 'rgba(139, 92, 246, 0.5)' : undefined
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
                </div>
              </button>
            );
          } else {
            // --- SINGLE CHOICE UI (original) ---
            return (
              <button
                key={i}
                className="btn btn-glass"
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
          }
        })}
      </div>

      {/* Submit button for multiple choice (before answering) */}
      {multiChoice && !isAnswered && selectedMulti.length > 0 && (
        <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
          <button
            className="btn btn-primary"
            style={{ padding: '0.8rem 2.5rem', fontSize: '1.05rem', fontWeight: 700 }}
            onClick={handleSubmitMulti}
          >
            Submit ({selectedMulti.length}/{correctCount})
          </button>
        </div>
      )}

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
