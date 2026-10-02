import { useCallback, useRef, useState } from 'react';
import { readScreenshot } from '../lib/ocr';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

const SAMPLES = [
  "Your KYC has expired. Update immediately to avoid account block. Click http://kyc-verify-sbi.tk",
  "You have received a collect request of Rs 1 from Amazon Refund team. Approve to receive your cashback of Rs 5000",
  "Hey, are we still on for dinner tonight at 8?",
];

export default function MessageForm({ onSubmit, loading }) {
  const [text, setText] = useState('');

  const [lastCaptured, setLastCaptured] = useState('');

  const MAX_MESSAGE_LENGTH = 2000;

  // Screenshot reading: null when idle, otherwise { label, pct } while working.
  const [ocrProgress, setOcrProgress] = useState(null);
  const [ocrNote, setOcrNote] = useState(null); // { kind: 'ok' | 'warn' | 'error', text }
  const fileInput = useRef(null);
  const textareaRef = useRef(null);

  const handleScreenshot = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (listening) stop();
    setOcrNote(null);
    setOcrProgress({ label: 'Starting the text reader', pct: 0 });
    try {
      const { text: found, confidence } = await readScreenshot(file, (m) => {
        const label = m.status === 'recognizing text'
          ? 'Reading the screenshot'
          : 'Loading the text reader (first time only, about 8 MB)';
        setOcrProgress({ label, pct: Math.round((m.progress || 0) * 100) });
      });
      if (!found) {
        setOcrNote({ kind: 'error', text: 'No readable text found in that image. Try a clearer screenshot, or type the message instead.' });
        return;
      }
      setText(found);
      setOcrNote(confidence < 60
        ? { kind: 'warn', text: 'Some of the text was hard to read. Check it against the screenshot and fix any mistakes before checking.' }
        : { kind: 'ok', text: 'Text read from the screenshot. Check it matches, then run the check.' });
      textareaRef.current?.focus();
    } catch {
      setOcrNote({ kind: 'error', text: "The text reader couldn't load. Check your connection and try again." });
    } finally {
      setOcrProgress(null);
    }
  };

  const handleSpeechResult = useCallback((transcript) => {
    setText((prev) => {
      const next = prev ? `${prev} ${transcript}` : transcript;
      return next.length > MAX_MESSAGE_LENGTH ? next.slice(0, MAX_MESSAGE_LENGTH) : next;
    });
    setLastCaptured(transcript);
  }, []);

  const { listening, error: speechError, start, stop, supported } =
    useSpeechRecognition(handleSpeechResult);

  const liveAnnouncement = listening
    ? 'Listening for your message'
    : speechError
    ? speechError
    : lastCaptured
    ? `Captured: ${lastCaptured}`
    : '';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim()) onSubmit(text.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="form">
      <p className="sr-only" role="status" aria-live="polite">{liveAnnouncement}</p>
      <div className="field-label-row">
        <label className="field-label" htmlFor="msg">
          Paste a message, SMS, or WhatsApp text
        </label>
        <div className="input-tools">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleScreenshot}
        />
        <button
          type="button"
          className="mic-btn"
          onClick={() => fileInput.current?.click()}
          disabled={loading || Boolean(ocrProgress)}
          title="Read the text from a screenshot of an SMS or WhatsApp message"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="6" y="2.5" width="12" height="19" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M9.5 8h5M9.5 11.5h5M9.5 15h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {ocrProgress ? 'Reading…' : 'Screenshot'}
        </button>
        {supported && (
          <button
            type="button"
            className={`mic-btn ${listening ? 'mic-btn--listening' : ''}`}
            onClick={listening ? stop : start}
            aria-pressed={listening}
            aria-label={listening ? 'Stop voice input' : 'Start voice input'}
            title={listening ? 'Listening… click to stop' : 'Speak the message instead of typing'}
            disabled={loading}
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
      </div>
      {speechError && <p className="mic-error" role="alert">{speechError}</p>}
      {ocrProgress && (
        <div className="ocr-progress" role="status">
          <span>{ocrProgress.label}{ocrProgress.pct ? ` · ${ocrProgress.pct}%` : '…'}</span>
          <span className="ocr-progress-bar" aria-hidden="true">
            <span style={{ width: `${ocrProgress.pct}%` }} />
          </span>
        </div>
      )}
      {ocrNote && !ocrProgress && (
        <p className={`ocr-note ocr-note--${ocrNote.kind}`} role={ocrNote.kind === 'error' ? 'alert' : 'status'}>
          {ocrNote.text}
        </p>
      )}
      <textarea
        id="msg"
        ref={textareaRef}
        className="textarea"
        rows={6}
        maxLength={2000}
        placeholder="e.g. Your KYC has expired, click here to verify..."
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (ocrNote?.kind === 'ok') setOcrNote(null);
        }}
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
            onClick={() => {
              if (listening) stop();
              setText(s);
            }}
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
