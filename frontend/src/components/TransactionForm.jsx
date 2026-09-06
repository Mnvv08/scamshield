import { useState } from 'react';

const DEFAULTS = {
  hour: 14,
  amount: 500,
  is_new_payee: false,
  txns_last_hour: 0,
  device_changed_recently: false,
  payee_risk_score: 0.1,
  time_since_last_txn_min: 180,
  is_weekend: false,
  amount_to_avg_ratio: 1.0,
  recent_failed_attempts: 0,
  recent_payee_txns: [],
};

const SUSPICIOUS_PRESET = {
  ...DEFAULTS,
  hour: 2,
  amount: 9500,
  is_new_payee: true,
  txns_last_hour: 4,
  device_changed_recently: true,
  payee_risk_score: 0.8,
  time_since_last_txn_min: 2,
  amount_to_avg_ratio: 3.2,
  recent_failed_attempts: 2,
};

const SALAMI_PRESET = {
  ...DEFAULTS,
  hour: 15,
  amount: 180,
  is_new_payee: false,
  txns_last_hour: 9,
  time_since_last_txn_min: 4,
  amount_to_avg_ratio: 1.0,
  recent_payee_txns: Array.from({ length: 28 }, (_, i) => ({
    amount: 180,
    minutes_ago: (i + 1) * 20,
  })),
};

export default function TransactionForm({ onSubmit, loading }) {
  const [form, setForm] = useState(DEFAULTS);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const addHistoryRow = () => {
    setForm((f) => ({
      ...f,
      recent_payee_txns: [...(f.recent_payee_txns || []), { amount: 200, minutes_ago: 60 }],
    }));
  };

  const updateHistoryRow = (i, key, value) => {
    setForm((f) => {
      const rows = [...f.recent_payee_txns];
      rows[i] = { ...rows[i], [key]: value };
      return { ...f, recent_payee_txns: rows };
    });
  };

  const removeHistoryRow = (i) => {
    setForm((f) => ({
      ...f,
      recent_payee_txns: f.recent_payee_txns.filter((_, idx) => idx !== i),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const { recent_payee_txns, ...rest } = form;
    onSubmit(recent_payee_txns?.length ? form : rest);
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
            type="number" min={1} max={10_000_000} className="input"
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

      <div className="field-row">
        <div className="field">
          <label className="field-label">Amount vs. this payee's usual (ratio)</label>
          <input
            type="number" min={0} step={0.1} className="input"
            value={form.amount_to_avg_ratio}
            onChange={(e) => update('amount_to_avg_ratio', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label className="field-label">Recent failed PIN/OTP attempts</label>
          <input
            type="number" min={0} className="input"
            value={form.recent_failed_attempts}
            onChange={(e) => update('recent_failed_attempts', Number(e.target.value))}
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
        <label className="checkbox-field">
          <input
            type="checkbox" checked={form.is_weekend}
            onChange={(e) => update('is_weekend', e.target.checked)}
          />
          Weekend
        </label>
      </div>

      <div className="field payee-history">
        <label className="field-label">
          Recent transfers to this payee (last 24h)
        </label>
        <p className="field-hint">
          Lets the model see patterns a single transaction can't — e.g. many
          small transfers to the same payee ("salami slicing").
        </p>
        {(form.recent_payee_txns || []).map((row, i) => (
          <div className="field-row payee-history-row" key={i}>
            <input
              type="number" min={0} className="input" placeholder="Amount (₹)"
              value={row.amount}
              onChange={(e) => updateHistoryRow(i, 'amount', Number(e.target.value))}
            />
            <input
              type="number" min={0} max={1440} className="input" placeholder="Minutes ago"
              value={row.minutes_ago}
              onChange={(e) => updateHistoryRow(i, 'minutes_ago', Number(e.target.value))}
            />
            <button
              type="button" className="remove-row-btn"
              onClick={() => removeHistoryRow(i)}
              aria-label={`Remove transfer ${i + 1}`}
            >
              ×
            </button>
          </div>
        ))}
        {(form.recent_payee_txns || []).length < 100 && (
          <button type="button" className="add-row-btn" onClick={addHistoryRow}>
            + Add a prior transfer
          </button>
        )}
      </div>

      <div className="sample-row">
        <span className="sample-label">Try:</span>
        <button type="button" className="sample-chip" onClick={() => setForm(DEFAULTS)}>Normal transaction</button>
        <button type="button" className="sample-chip" onClick={() => setForm(SUSPICIOUS_PRESET)}>Suspicious pattern</button>
        <button type="button" className="sample-chip" onClick={() => setForm(SALAMI_PRESET)}>Many small transfers</button>
      </div>

      <button type="submit" className="submit-btn" disabled={loading}>
        {loading ? 'Analyzing…' : 'Check transaction'}
      </button>
    </form>
  );
}
