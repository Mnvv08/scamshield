import { useState } from 'react';

const DEFAULTS = {
  hour: 14,
  amount: 500,
  is_new_payee: false,
  txns_last_hour: 0,
  device_changed_recently: false,
  payee_risk_score: 0.1,
  time_since_last_txn_min: 180,
};

const SUSPICIOUS_PRESET = {
  hour: 2,
  amount: 9500,
  is_new_payee: true,
  txns_last_hour: 4,
  device_changed_recently: true,
  payee_risk_score: 0.8,
  time_since_last_txn_min: 2,
};

export default function TransactionForm({ onSubmit, loading }) {
  const [form, setForm] = useState(DEFAULTS);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="form">
      <div className="field-row">
        <div className="field">
          <label className="field-label">Hour of day (0–23)</label>
          <input
            type="number" min={0} max={23} className="input"
            value={form.hour} onChange={(e) => update('hour', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label className="field-label">Amount (₹)</label>
          <input
            type="number" min={1} className="input"
            value={form.amount} onChange={(e) => update('amount', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label className="field-label">Transactions in last hour</label>
          <input
            type="number" min={0} className="input"
            value={form.txns_last_hour} onChange={(e) => update('txns_last_hour', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label className="field-label">Minutes since last transaction</label>
          <input
            type="number" min={0} className="input"
            value={form.time_since_last_txn_min}
            onChange={(e) => update('time_since_last_txn_min', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="field">
        <label className="field-label">Payee risk score (0 = trusted, 1 = high risk)</label>
        <input
          type="range" min={0} max={1} step={0.05} className="slider"
          value={form.payee_risk_score}
          onChange={(e) => update('payee_risk_score', Number(e.target.value))}
        />
        <span className="slider-value">{form.payee_risk_score.toFixed(2)}</span>
      </div>

      <div className="checkbox-row">
        <label className="checkbox-field">
          <input
            type="checkbox" checked={form.is_new_payee}
            onChange={(e) => update('is_new_payee', e.target.checked)}
          />
          First-time payee
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox" checked={form.device_changed_recently}
            onChange={(e) => update('device_changed_recently', e.target.checked)}
          />
          Device/SIM changed recently
        </label>
      </div>

      <div className="sample-row">
        <span className="sample-label">Try:</span>
        <button type="button" className="sample-chip" onClick={() => setForm(DEFAULTS)}>Normal transaction</button>
        <button type="button" className="sample-chip" onClick={() => setForm(SUSPICIOUS_PRESET)}>Suspicious pattern</button>
      </div>

      <button type="submit" className="submit-btn" disabled={loading}>
        {loading ? 'Analyzing…' : 'Check transaction'}
      </button>
    </form>
  );
}
