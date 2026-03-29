import React, { useState } from 'react';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';

const QuizMode = ({ deck, onBack }) => {
  const cards = deck?.cards || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

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
    
    // Parse the A, B, C, D part if it's formatted as "A. Answer"
    const letterMatch = opt.match(/^([A-Z])\./);
    const answerLetter = letterMatch ? letterMatch[1] : opt;
    const correctLetter = currentCard.correct_answers[0];

    // For desk.json format where correct is full text vs single letter
    const isCorrect = (answerLetter === correctLetter) || (opt === correctLetter) || (opt.startsWith(correctLetter + "."));
    
    setSelectedAnswer(opt);
    setIsAnswered(true);
    
    if (isCorrect) {
      setScore(prev => prev + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(prev => prev + 1);
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
    setIsFinished(false);
  };

  if (isFinished) {
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: '3rem', textAlign: 'center', maxWidth: '600px', margin: '4rem auto' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem' }} className="text-gradient">Quiz Completed!</h2>
        <p style={{ marginBottom: '2.5rem', color: 'var(--text-muted)', fontSize: '1.2rem' }}>
          Great job! You've finished all questions in this deck. 
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', alignItems: 'center' }}>
        <button className="btn btn-glass" onClick={onBack}>
          <ArrowLeft size={18} /> Go Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Question {currentIndex + 1} / {cards.length}</span>
        </div>
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
              // override bg inline for success
            } else if (selectedAnswer === opt) {
              btnClass = "btn"; // override bg inline for wrong
            }
          } else if (selectedAnswer === opt) {
             btnClass = "btn btn-glass"; // active
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
