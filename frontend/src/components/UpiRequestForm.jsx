import { useState } from 'react';

const DEFAULTS = {
  payee_vpa: 'friend@okhdfcbank',
  is_collect_request: false,
  requested_amount: 500,
  payee_verified: true,
  note: '',
};

const SCAM_PRESET = {
  payee_vpa: 'amazon.refund@upi',
  is_collect_request: true,
  requested_amount: 1,
  payee_verified: false,
  note: 'claim your cashback reward now',
};

export default function UpiRequestForm({ onSubmit, loading }) {
  const [form, setForm] = useState(DEFAULTS);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="form">
      <div className="field">
        <label className="field-label" htmlFor="upi-vpa">Payee UPI ID (VPA)</label>
        <input
          id="upi-vpa"
          type="text" className="input"
          value={form.payee_vpa} onChange={(e) => update('payee_vpa', e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="upi-note">Request note / message</label>
        <input
          id="upi-note"
          type="text" className="input"
          placeholder="e.g. for lunch, claim your reward…"
          value={form.note} onChange={(e) => update('note', e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="upi-amount">Requested amount (₹)</label>
        <input
          id="upi-amount"
          type="number" min={0} max={10_000_000} className="input"
          value={form.requested_amount} onChange={(e) => update('requested_amount', Number(e.target.value))}
        />
      </div>

      <div className="checkbox-row">
        <label className="checkbox-field" htmlFor="upi-collect">
          <input
            id="upi-collect"
            type="checkbox" checked={form.is_collect_request}
            onChange={(e) => update('is_collect_request', e.target.checked)}
            aria-describedby="upi-collect-hint"
          />
          This is a "collect" request (you'd be sending money)
        </label>
        <span id="upi-collect-hint" className="sr-only">
          A collect request means accepting it sends money from your account,
          not receives it. This is the core mechanism most UPI scams rely on.
        </span>

        <label className="checkbox-field" htmlFor="upi-verified">
          <input
            id="upi-verified"
            type="checkbox" checked={form.payee_verified}
            onChange={(e) => update('payee_verified', e.target.checked)}
          />
          Payee identity verified
        </label>
      </div>

      <div className="sample-row">
        <span className="sample-label">Try:</span>
        <button type="button" className="sample-chip" onClick={() => setForm(DEFAULTS)}>Normal request</button>
        <button type="button" className="sample-chip" onClick={() => setForm(SCAM_PRESET)}>Refund scam pattern</button>
      </div>

      <button type="submit" className="submit-btn" disabled={loading}>
        {loading ? 'Analyzing…' : 'Check request'}
      </button>
    </form>
  );
}
