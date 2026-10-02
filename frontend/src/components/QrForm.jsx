import { useRef, useState } from 'react';
import jsQR from 'jsqr';
import { imageSize, loadImageFile } from '../lib/image';

// Decoding happens here in the browser: the photo never leaves the phone,
// only the decoded text is sent to the API.
//
// jsQR can miss a small code inside a large screenshot, or a code in a huge
// camera photo, so it tries a few sizes before giving up.
const TRY_SIDES = [1600, 1000, 2400];

async function decodeQrFromFile(file) {
  const img = await loadImageFile(file);
  const { width, height } = imageSize(img);
  const longest = Math.max(width, height);
  const sides = [...new Set(TRY_SIDES.map((s) => Math.min(s, longest)))];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  try {
    for (const side of sides) {
      const scale = side / longest;
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
      if (code?.data) return code.data;
    }
    return null;
  } finally {
    img.close?.(); // ImageBitmap holds decoded pixels until closed
  }
}

const PURPOSES = [
  { id: 'pay', label: 'To pay for something' },
  { id: 'receive', label: 'To receive money: a refund, a prize, or a buyer paying me' },
  { id: 'unsure', label: 'Not sure' },
];

const SAMPLES = [
  {
    label: 'Shop QR',
    raw: 'upi://pay?pa=sharmagenstore@okicici&pn=Sharma%20General%20Store&cu=INR',
    purpose: 'pay',
  },
  {
    label: 'OLX buyer scam',
    raw: 'upi://pay?pa=9876543210@ybl&pn=Rahul&am=5000&cu=INR',
    purpose: 'receive',
  },
  {
    label: 'Refund QR',
    raw: 'upi://pay?pa=amazon.refund@upi&pn=Amazon%20Refund%20Desk&am=1&tn=claim%20your%20cashback&cu=INR',
    purpose: 'unsure',
  },
];

export default function QrForm({ onSubmit, loading }) {
  const [raw, setRaw] = useState('');
  const [purpose, setPurpose] = useState('pay');
  const [source, setSource] = useState(null); // file name, 'sample', or 'pasted'
  const [decoding, setDecoding] = useState(false);
  const [decodeError, setDecodeError] = useState(null);
  const fileInput = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    setDecoding(true);
    setDecodeError(null);
    try {
      const text = await decodeQrFromFile(file);
      if (text) {
        setRaw(text);
        setSource(file.name || 'photo');
      } else {
        setRaw('');
        setSource(null);
        setDecodeError('No QR code found in that image. Try a sharper photo, or crop closer to the code.');
      }
    } catch (err) {
      setDecodeError(err.message);
    } finally {
      setDecoding(false);
    }
  };

  const loadSample = (s) => {
    setRaw(s.raw);
    setPurpose(s.purpose);
    setSource('sample');
    setDecodeError(null);
  };

  const fromImage = Boolean(raw) && source !== 'sample' && source !== 'pasted';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!raw.trim()) return;
    onSubmit({ raw: raw.trim(), expecting_to_receive: purpose === 'receive' });
  };

  return (
    <form onSubmit={handleSubmit} className="form">
      <div className="field">
        <span className="field-label" id="qr-image-label">QR code image</span>
        <input
          ref={fileInput}
          id="qr-file"
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-labelledby="qr-image-label"
          onChange={handleFile}
        />
        <button
          type="button"
          className={`qr-drop ${fromImage ? 'qr-drop--ready' : ''}`}
          onClick={() => fileInput.current?.click()}
          disabled={decoding}
          aria-describedby="qr-status"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="9" y="9" width="6" height="6" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          <span className="qr-drop-title">
            {decoding ? 'Reading the QR code…' : fromImage ? 'Choose a different image' : 'Take a photo or upload a screenshot'}
          </span>
        </button>
        <p id="qr-status" className={`qr-status ${decodeError ? 'qr-status--error' : ''}`} role="status">
          {decodeError
            || (raw && source === 'sample' && 'Sample QR loaded.')
            || (raw && source === 'pasted' && 'Using the pasted QR text.')
            || (raw && `QR code read from ${source}.`)
            || 'The image is read on your device. Only the decoded text is checked.'}
        </p>
      </div>

      <fieldset className="radio-group">
        <legend className="field-label">What were you told this QR is for?</legend>
        {PURPOSES.map((p) => (
          <label key={p.id} className="radio-field">
            <input
              type="radio"
              name="qr-purpose"
              value={p.id}
              checked={purpose === p.id}
              onChange={() => setPurpose(p.id)}
            />
            {p.label}
          </label>
        ))}
      </fieldset>

      <details className="qr-paste">
        <summary>No image? Paste the QR text instead</summary>
        <textarea
          className="textarea"
          rows={3}
          maxLength={2000}
          placeholder="upi://pay?pa=…"
          aria-label="QR code text"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setSource('pasted');
            setDecodeError(null);
          }}
        />
      </details>

      <div className="sample-row">
        <span className="sample-label">Try:</span>
        {SAMPLES.map((s) => (
          <button key={s.label} type="button" className="sample-chip" onClick={() => loadSample(s)}>
            {s.label}
          </button>
        ))}
      </div>

      <button type="submit" className="submit-btn" disabled={loading || decoding || !raw.trim()}>
        {loading ? 'Analyzing…' : 'Check QR code'}
      </button>
    </form>
  );
}
