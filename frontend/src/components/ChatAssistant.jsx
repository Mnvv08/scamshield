import { useState, useRef, useEffect, useId, useCallback } from 'react';
import { sendChatMessage } from '../api';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

const STARTER_PROMPTS = [
  "What's a UPI collect request scam?",
  "Is it safe to share my UPI ID?",
  "How do I spot a fake KYC message?",
];

export default function ChatAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const inputId = useId();

  const handleSpeechResult = useCallback((transcript) => {
    setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
  }, []);

  const { listening, error: speechError, start, stop, supported: micSupported } =
    useSpeechRecognition(handleSpeechResult);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const nextMessages = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await sendChatMessage(nextMessages);
      setMessages([...nextMessages, { role: 'assistant', content: res.reply }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div className="chat-panel">
      <div
        className="chat-messages"
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation with the ScamShield assistant"
      >
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Ask about UPI scams, warning signs, or how a check result was reached.</p>
            <div className="chat-starters">
              {STARTER_PROMPTS.map((p) => (
                <button key={p} type="button" className="sample-chip" onClick={() => send(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
            <span className="sr-only">{m.role === 'user' ? 'You' : 'Assistant'}:</span>
            {m.content}
          </div>
        ))}

        {loading && (
          <div
            className="chat-bubble chat-bubble--assistant chat-bubble--pending"
            role="status"
            aria-label="Assistant is typing"
          >
            <span className="chat-dot" aria-hidden="true" />
            <span className="chat-dot" aria-hidden="true" />
            <span className="chat-dot" aria-hidden="true" />
          </div>
        )}

        {error && (
          <div className="chat-error" role="alert">
            {error}
          </div>
        )}
      </div>

      {speechError && <p className="mic-error" role="alert">{speechError}</p>}
      <form className="chat-input-row" onSubmit={handleSubmit}>
        <label htmlFor={inputId} className="sr-only">
          Ask the ScamShield assistant a question
        </label>
        <input
          id={inputId}
          className="input chat-input"
          placeholder="Ask about a scam pattern…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        {micSupported && (
          <button
            type="button"
            className={`mic-btn mic-btn--compact ${listening ? 'mic-btn--listening' : ''}`}
            onClick={listening ? stop : start}
            aria-pressed={listening}
            aria-label={listening ? 'Stop voice input' : 'Ask by voice'}
            title={listening ? 'Listening\u2026 click to stop' : 'Ask by voice instead of typing'}
            disabled={loading}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"
                    stroke="currentColor" strokeWidth="2" />
              <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <button type="submit" className="submit-btn" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
