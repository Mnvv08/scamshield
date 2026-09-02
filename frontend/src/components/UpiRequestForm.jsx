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
        <label className="field-label">Payee UPI ID (VPA)</label>
        <input
          type="text" className="input"
          value={form.payee_vpa} onChange={(e) => update('payee_vpa', e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label">Request note / message</label>
        <input
          type="text" className="input"
          placeholder="e.g. for lunch, claim your reward..."
          value={form.note} onChange={(e) => update('note', e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label">Requested amount (₹)</label>
        <input
          type="number" min={0} className="input"
          value={form.requested_amount} onChange={(e) => update('requested_amount', Number(e.target.value))}
        />
      </div>

      <div className="checkbox-row">
        <label className="checkbox-field">
          <input
            type="checkbox" checked={form.is_collect_request}
            onChange={(e) => update('is_collect_request', e.target.checked)}
          />
          This is a "collect" request (you'd be sending money)
        </label>
        <label className="checkbox-field">
          <input
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
