import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const ChatBubble = ({ currentCard }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [messages, setMessages] = useState([
    { role: 'bot', content: '👋 Hi! I can see the card you\'re studying.\nSend me your answer and I\'ll check if it\'s correct, or ask me to explain anything!' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Dragging state
  const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight - 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [snappedEdge, setSnappedEdge] = useState('right');

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatWindowRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Dragging logic
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      
      // Keep within bounds
      const boundedX = Math.max(0, Math.min(newX, window.innerWidth - 60));
      const boundedY = Math.max(0, Math.min(newY, window.innerHeight - 60));
      
      setPosition({ x: boundedX, y: boundedY });
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      setIsDragging(false);
      
      // Snap to nearest edge
      const threshold = window.innerWidth / 2;
      if (position.x < threshold) {
        setSnappedEdge('left');
        setPosition(prev => ({ ...prev, x: -40 })); // Tuck 2/3 (assuming 60px width)
      } else {
        setSnappedEdge('right');
        setPosition(prev => ({ ...prev, x: window.innerWidth - 20 }));
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, position]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Build rich context string from the current card
  const buildCardContext = () => {
    if (!currentCard) return { card_front: '', card_back: '', card_context: '' };

    const question = currentCard.question || '';
    const options = currentCard.options || [];
    const correctAnswers = currentCard.correct_answers || [];
    const notes = currentCard.notes || '';

    // Full context for AI system prompt
    let cardContext = `CURRENT FLASHCARD ON SCREEN:\n`;
    cardContext += `Question: ${question}\n`;

    if (options.length > 0) {
      cardContext += `Options:\n${options.map(opt => `  - ${opt}`).join('\n')}\n`;
    }

    cardContext += `Correct Answer(s): ${correctAnswers.join(', ')}\n`;

    if (notes) {
      cardContext += `Notes/Explanation: ${notes}\n`;
    }

    return {
      card_front: question,
      card_back: correctAnswers.join(', '),
      card_context: cardContext
    };
  };

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    // Add user message
    const userMsg = { role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const { card_front, card_back, card_context } = buildCardContext();

      const res = await fetch(`${BACKEND_URL}/chat/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_question: trimmed,
          card_front,
          card_back,
          card_context,
          system_prompt: `You are a smart study assistant for a Flashcard learning app. You can see the flashcard the user is currently studying.

${card_context}

YOUR ROLE:
1. If the user sends an answer (like "A", "B", "C", "D" or a text answer), CHECK it against the correct answer(s) above.
   - If CORRECT: Confirm enthusiastically and briefly explain why it's right.
   - If WRONG: Gently tell them it's incorrect, reveal the correct answer, and explain why.
2. If the user asks "why?", "explain", or asks for clarification, give a clear and concise explanation based on the card content.
3. If the user asks something unrelated to the card, politely redirect them to the current card topic.
4. Keep responses concise (2-4 sentences max), friendly, and educational.
5. Use emoji sparingly for engagement.
6. Respond in the same language the user uses (Vietnamese or English).`
        })
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();
      const botMsg = { role: 'bot', content: data.reply || 'Sorry, I couldn\'t generate a response.' };
      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, {
        role: 'bot',
        content: '⚠️ Connection error. Please check your internet and try again.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    e.stopPropagation(); // Avoid triggering parent shortcuts
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startDrag = (e) => {
    if (isOpen) return; // Prevent dragging when open
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const toggleChat = () => {
    if (isOpen) {
      setIsOpen(false);
      // Snap back to edge if closing
      if (snappedEdge === 'left') setPosition(prev => ({ ...prev, x: -40 }));
      else setPosition(prev => ({ ...prev, x: window.innerWidth - 20 }));
    } else {
      setIsOpen(true);
      // Center or move window to readable area
      setPosition({ x: window.innerWidth - 400, y: window.innerHeight - 550 });
    }
  };

  // Show what card the AI is seeing (mini context bar)
  const cardPreview = currentCard
    ? (currentCard.question || '').slice(0, 60) + ((currentCard.question || '').length > 60 ? '...' : '')
    : 'No card selected';

  return (
    <div 
      className="chat-container-wrapper" 
      style={{ 
        position: 'fixed', 
        left: position.x, 
        top: position.y, 
        zIndex: 9999,
        transition: isDragging ? 'none' : 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
      }}
    >
      {/* Chat Window */}
      <div className={`chat-window ${isOpen ? 'chat-window--open' : ''}`}>
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-info">
            <div className="chat-header-avatar">
              <MessageCircle size={18} />
            </div>
            <div>
              <h4 className="chat-header-title">AI Assistant</h4>
              <span className="chat-header-subtitle">Checking your answers</span>
            </div>
          </div>
          <button
            className="chat-close-btn"
            onClick={toggleChat}
            title="Close chat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Card Context Bar - shows what card AI is seeing */}
        <div className="chat-context-bar-v2">
          <div className="chat-context-inner">
            <span className="chat-context-label">📖 Viewing:</span>
            <span className="chat-context-text">{cardPreview}</span>
          </div>
        </div>

        {/* Messages Body */}
        <div className="chat-body">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`chat-message ${msg.role === 'user' ? 'chat-message--user' : 'chat-message--bot'}`}
            >
              <div className={`chat-bubble-msg ${msg.role === 'user' ? 'chat-bubble-msg--user' : 'chat-bubble-msg--bot'}`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="chat-message chat-message--bot">
              <div className="chat-bubble-msg chat-bubble-msg--bot chat-typing">
                <Loader2 size={16} className="animate-spin" />
                <span>Checking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Footer Input */}
        <div className="chat-footer">
          <input
            ref={inputRef}
            type="text"
            className="chat-input"
            placeholder="Type your answer or question..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            title="Send message"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Toggle Button (Minimized State) */}
      {!isOpen && (
        <button
          className={`chat-toggle-btn-v2 ${isDragging ? 'dragging' : ''}`}
          onMouseDown={startDrag}
          onClick={(e) => {
            if (!isDragging) toggleChat();
          }}
          title="Open AI Chat"
          style={{
            opacity: isDragging ? 0.8 : 1,
            transform: isDragging ? 'scale(1.1)' : 'none',
          }}
        >
          <MessageCircle size={24} />
        </button>
      )}
    </div>
  );
};

export default ChatBubble;
