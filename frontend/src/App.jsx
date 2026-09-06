import { useState } from 'react';
import Hero from './components/Hero';
import MessageForm from './components/MessageForm';
import TransactionForm from './components/TransactionForm';
import UpiRequestForm from './components/UpiRequestForm';
import ResultPanel from './components/ResultPanel';
import { checkMessage, checkTransaction, checkUpiRequest } from './api';
import './app.css';
import ChatAssistant from './components/ChatAssistant';

const TABS = [
  { id: 'message', label: 'Message', desc: 'SMS / WhatsApp text' },
  { id: 'transaction', label: 'Transaction', desc: 'Payment pattern' },
  { id: 'upi', label: 'UPI request', desc: 'Collect request' },
  { id: 'assistant', label: 'Assistant', desc: 'Ask about scams' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('message');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checkedLabel, setCheckedLabel] = useState('');

  const runCheck = async (fn, label) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fn();
      setResult(res);
      setCheckedLabel(label);
    } catch (e) {
      setError(e.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (id) => {
    setActiveTab(id);
    setResult(null);
    setError(null);
  };

  return (
    <div className="app-shell">
      <a href="#tool" className="skip-link">Skip to fraud checker</a>
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">ScamShield</span>
        </div>
        <p className="topbar-tagline">Fraud detection for UPI &amp; digital payments</p>
        <div className="status-pill">
          <span className="status-dot" />
          Models online
        </div>
      </header>

      <Hero />

      <main className="main-grid" id="tool">
  <nav className="tab-rail">
    {TABS.map((t, i) => (
      <button
        key={t.id}
        role="tab"
        id={`tab-${t.id}`}
        aria-selected={activeTab === t.id}
        aria-controls={`panel-${t.id}`}
        tabIndex={activeTab === t.id ? 0 : -1}
        className={`tab-btn ${activeTab === t.id ? 'tab-btn--active' : ''}`}
        onClick={() => handleTabChange(t.id)}
        onKeyDown={(e) => {
          // Standard tab-list behaviour: arrow keys move focus and
          // selection together, without needing Tab to step through each one.
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault();
          const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
          handleTabChange(TABS[next].id);
          document.getElementById(`tab-${TABS[next].id}`)?.focus();
        }}
      >
        <span className="tab-btn-label">{t.label}</span>
        <span className="tab-btn-desc">{t.desc}</span>
      </button>
    ))}
  </nav>

  {activeTab === 'assistant' ? (
    <section className="panel panel--chat">
      <h1 className="panel-title">Ask the assistant</h1>
      <p className="panel-subtitle">
        Explains scam patterns and how the checks work — doesn't replace running an actual check.
      </p>
      <ChatAssistant />
    </section>
  ) : (
    <>
      <section className="panel form-panel">
        <h1 className="panel-title">
          {activeTab === 'message' && 'Check a message'}
          {activeTab === 'transaction' && 'Check a transaction pattern'}
          {activeTab === 'upi' && 'Check a UPI collect request'}
        </h1>
        <p className="panel-subtitle">
          {activeTab === 'message' && 'Paste any suspicious SMS, WhatsApp, or email text to check for scam patterns.'}
          {activeTab === 'transaction' && 'Enter transaction details to check against known fraud behaviour patterns.'}
          {activeTab === 'upi' && 'Check a payment request before approving it.'}
        </p>

        {activeTab === 'message' && (
          <MessageForm loading={loading} onSubmit={(text) => runCheck(() => checkMessage(text), 'Message check')} />
        )}
        {activeTab === 'transaction' && (
          <TransactionForm loading={loading} onSubmit={(payload) => runCheck(() => checkTransaction(payload), 'Transaction check')} />
        )}
        {activeTab === 'upi' && (
          <UpiRequestForm loading={loading} onSubmit={(payload) => runCheck(() => checkUpiRequest(payload), 'UPI request check')} />
        )}
      </section>

      <section className="panel">
        <div
  id={`panel-${activeTab}`}
  role="region"
  aria-labelledby={`tab-${activeTab}`}
  aria-live="polite"
  aria-atomic="true"
>
  <ResultPanel loading={loading} result={result} error={error} checkedLabel={checkedLabel} />
</div>
      </section>
    </>
  )}
</main>

      <footer className="footer">
        <p>
          Text classifier trained on the public UCI SMS Spam Collection dataset, extended with
          documented UPI-scam phrasing. Transaction model trained on a synthetic dataset built
          from publicly reported fraud patterns — no real bank or UPI transaction data exists
          publicly, or was used here.
        </p>
      </footer>
    </div>
  );
}
