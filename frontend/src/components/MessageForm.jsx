import { useState } from 'react';

const SAMPLES = [
  "Your KYC has expired. Update immediately to avoid account block. Click http://kyc-verify-sbi.tk",
  "You have received a collect request of Rs 1 from Amazon Refund team. Approve to receive your cashback of Rs 5000",
  "Hey, are we still on for dinner tonight at 8?",
];

export default function MessageForm({ onSubmit, loading }) {
  const [text, setText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim()) onSubmit(text.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="form">
      <label className="field-label" htmlFor="msg">
        Paste a message, SMS, or WhatsApp text
      </label>
      <textarea
        id="msg"
        className="textarea"
        rows={6}
        placeholder="e.g. Your KYC has expired, click here to verify..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
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
