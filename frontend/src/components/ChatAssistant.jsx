import { useState, useRef, useEffect } from 'react';
import { sendChatMessage } from '../api';

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
      <div className="chat-messages" ref={scrollRef}>
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
            {m.content}
          </div>
        ))}

        {loading && (
          <div className="chat-bubble chat-bubble--assistant chat-bubble--pending">
            <span className="chat-dot" />
            <span className="chat-dot" />
            <span className="chat-dot" />
          </div>
        )}

        {error && <div className="chat-error">{error}</div>}
      </div>

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          className="input chat-input"
          placeholder="Ask about a scam pattern…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="submit-btn" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}