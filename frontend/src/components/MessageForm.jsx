import { useCallback, useState } from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

const SAMPLES = [
  "Your KYC has expired. Update immediately to avoid account block. Click http://kyc-verify-sbi.tk",
  "You have received a collect request of Rs 1 from Amazon Refund team. Approve to receive your cashback of Rs 5000",
  "Hey, are we still on for dinner tonight at 8?",
];

export default function MessageForm({ onSubmit, loading }) {
  const [text, setText] = useState('');

  const handleSpeechResult = useCallback((transcript) => {
    setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
  }, []);

  const { listening, error: speechError, start, stop, supported } =
    useSpeechRecognition(handleSpeechResult);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim()) onSubmit(text.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="form">
      <div className="field-label-row">
        <label className="field-label" htmlFor="msg">
          Paste a message, SMS, or WhatsApp text
        </label>
        {supported && (
          <button
            type="button"
            className={`mic-btn ${listening ? 'mic-btn--listening' : ''}`}
            onClick={listening ? stop : start}
            aria-pressed={listening}
            aria-label={listening ? 'Stop voice input' : 'Start voice input'}
            title={listening ? 'Listening… click to stop' : 'Speak the message instead of typing'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"
                    stroke="currentColor" strokeWidth="2" />
              <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" />
            </svg>
            {listening ? 'Listening…' : 'Speak'}
          </button>
        )}
      </div>
      {speechError && <p className="mic-error" role="alert">{speechError}</p>}
      <textarea
        id="msg"
        className="textarea"
        rows={6}
        maxLength={2000}
        placeholder="e.g. Your KYC has expired, click here to verify..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-describedby="msg-char-count"
      />
      {text.length > 1500 && (
        <p
          id="msg-char-count"
          className={`char-count ${text.length >= 2000 ? 'char-count--limit' : ''}`}
        >
          {text.length} / 2000 characters
        </p>
      )}
      <div className="sample-row">
        <span className="sample-label">Try:</span>
        {SAMPLES.map((s, i) => (
          <button
            type="button"
            key={i}
            className="sample-chip"
            onClick={() => setText(s)}
          >
            {s.length > 34 ? s.slice(0, 34) + '…' : s}
          </button>
        ))}
      </div>
      <button type="submit" className="submit-btn" disabled={loading || !text.trim()}>
        {loading ? 'Analyzing…' : 'Check message'}
      </button>
    </form>
  );
}
