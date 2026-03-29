import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';

const FlashcardMode = ({ deck, onBack }) => {
  const cards = deck?.cards || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  if (!cards || cards.length === 0) {
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: '2rem', textAlign: 'center' }}>
        <h3>This deck has no cards!</h3>
        <button className="btn btn-glass" onClick={onBack} style={{ marginTop: '1rem' }}>Go Back</button>
      </div>
    );
  }

  const currentCard = cards[currentIndex];

  const handleNext = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev < cards.length - 1 ? prev + 1 : prev));
    }, 150);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
    }, 150);
  };

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const getCorrectAnswerText = (card) => {
    if (card.correct_answers && card.correct_answers.length > 0) {
      const correctAns = card.correct_answers[0];
      if (card.options) {
        const optionMatched = card.options.find(opt => opt.startsWith(correctAns + ".") || opt === correctAns);
        return optionMatched || correctAns;
      }
      return "No answer provided";
    }
    return "No answer provided";
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '800px', margin: '0 auto', padding: '1rem 0' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '1.5rem', alignItems: 'center' }}>
        <button className="btn btn-glass" onClick={onBack}>
          <ArrowLeft size={18} /> Select Deck
        </button>
        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
          Card {currentIndex + 1} / {cards.length}
        </span>
      </div>

      <div className={`flip-card ${isFlipped ? 'flipped' : ''}`} onClick={handleFlip} style={{ cursor: 'pointer', marginBottom: '2rem' }}>
        <div className="flip-card-inner">
          
          <div className="flip-card-front">
            <h3 style={{ fontSize: '1.3rem', lineHeight: '1.5', fontWeight: 600, width: '100%' }}>
              {currentCard.question}
            </h3>
            
            {/* Hiển thị danh sách đáp án để tham khảo (nếu có) */}
            {currentCard.options && currentCard.options.length > 0 && (
              <div style={{ marginTop: '1.5rem', width: '100%', display: 'flex', flexDirection: 'column', gap: '0.6rem', textAlign: 'left', flex: 1 }}>
                {currentCard.options.map((opt, i) => (
                  <div key={i} className="option-item">
                    {opt}
                  </div>
                ))}
              </div>
            )}

            <p style={{ marginTop: '1.5rem', opacity: 0.6, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Tap the card to see the answer</p>
          </div>

          <div className="flip-card-back">
            <h4 style={{ color: 'var(--primary)', marginBottom: '1rem', fontSize: '1.1rem' }}>Correct answer:</h4>
            <p style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-main)' }}>{getCorrectAnswerText(currentCard)}</p>
          </div>

        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem' }}>
        <button className="btn btn-glass btn-icon" onClick={handlePrev} disabled={currentIndex === 0}>
          <ArrowLeft size={24} />
        </button>
        <button className="btn btn-glass btn-icon" onClick={(e) => { e.stopPropagation(); setIsFlipped(false); }} title="Flip back" disabled={!isFlipped}>
          <RotateCcw size={24} />
        </button>
        <button className="btn btn-glass btn-icon" onClick={handleNext} disabled={currentIndex === cards.length - 1}>
          <ArrowRight size={24} />
        </button>
      </div>
    </div>
  );
};

export default FlashcardMode;
