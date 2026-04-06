import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const ChatBubble = ({ currentCard, userLoggedIn = true }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAwake, setIsAwake] = useState(false); // false = mờ, true = rõ
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '👋 Hi! I can see the card you\'re studying.\nSend me your answer and I\'ll check if it\'s correct, or ask me to explain anything!' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fadeTimerRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Reset conversation history khi đổi Flashcard
  useEffect(() => {
    setMessages([
      { role: 'assistant', content: '👋 Hi! I can see the card you\'re studying.\nSend me your answer and I\'ll check if it\'s correct, or ask me to explain anything!' }
    ]);
  }, [currentCard]);

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

    const userMsg = { role: 'user', content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputValue('');
    setIsLoading(true);

    try {
      const { card_front, card_back, card_context } = buildCardContext();

      // Filter out only role & content for API
      const chatHistory = newMessages.map(msg => ({
        role: msg.role === 'bot' ? 'assistant' : msg.role,
        content: msg.content
      }));

      const res = await fetch(`${BACKEND_URL}/chat/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory,
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
      const botMsg = { role: 'assistant', content: data.reply || 'Sorry, I couldn\'t generate a response.' };
      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Connection error. Please check your internet and try again.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    e.stopPropagation(); // Prevent triggering parent shortcuts (Space, Arrow, etc.)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Show what card the AI is seeing (mini context bar)
  const cardPreview = currentCard
    ? (currentCard.question || '').slice(0, 60) + ((currentCard.question || '').length > 60 ? '...' : '')
    : 'No card selected';

  return (
    <>
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
            onClick={() => setIsOpen(false)}
            title="Close chat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Card Context Bar */}
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

      {/* Toggle Button — idle-fade behavior */}
      <button
        className={`chat-toggle-btn ${isOpen ? 'chat-toggle-btn--hidden' : ''}`}
        style={{
          opacity: isAwake ? 1 : 0.3,
          transition: 'opacity 0.4s ease, transform 0.3s, box-shadow 0.3s',
          cursor: !userLoggedIn ? 'not-allowed' : 'pointer'
        }}
        disabled={!userLoggedIn}
        onClick={() => {
          // Clear any existing fade timer
          if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

          if (!isAwake) {
            // Click 1: wake up (become fully visible)
            setIsAwake(true);
            // Auto-fade after 3s if not clicked again
            fadeTimerRef.current = setTimeout(() => {
              setIsAwake(false);
            }, 3000);
          } else {
            // Click 2: open the chat
            setIsOpen(true);
            setIsAwake(false); // reset for next time
          }
        }}
        title={!userLoggedIn ? 'Login to Google Drive first' : (isAwake ? 'Click to open chat' : 'Click to activate')}
      >
        <MessageCircle size={24} />
      </button>
    </>
  );
};

export default ChatBubble;
