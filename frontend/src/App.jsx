import { useState, useEffect } from 'react';
import Hero from './components/Hero';
import MessageForm from './components/MessageForm';
import TransactionForm from './components/TransactionForm';
import UpiRequestForm from './components/UpiRequestForm';
import ResultPanel from './components/ResultPanel';
import { checkMessage, checkTransaction, checkUpiRequest, pingHealth } from './api';
import './app.css';
import ChatAssistant from './components/ChatAssistant';

const TABS = [
  { id: 'message', label: 'Message', desc: 'SMS / WhatsApp text' },
  { id: 'transaction', label: 'Transaction', desc: 'Payment pattern' },
  { id: 'upi', label: 'UPI request', desc: 'Collect request' },
  { id: 'assistant', label: 'Assistant', desc: 'Ask about scams' },
];

const MAX_HISTORY = 10;

const LEVEL_WORD = { high: 'HIGH RISK', medium: 'MEDIUM RISK', low: 'low risk' };

function formatHistoryForExport(history) {
  const lines = [`ScamShield \u2014 ${history.length} checks from this session`, ''];
  [...history].reverse().forEach((entry, i) => {
    const time = entry.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    lines.push(
      `${i + 1}. [${time}] ${entry.label} \u2014 ${LEVEL_WORD[entry.result.risk_level] || entry.result.risk_level}`,
      `   ${entry.result.explanation}`,
      ''
    );
  });
  lines.push('Checked with ScamShield: https://scamshield-cyan.vercel.app');
  return lines.join('\n');
}

function levelIcon(level) {
  if (level === 'high') return '●';
  if (level === 'medium') return '●';
  return '●';
}

export default function App() {
  const [activeTab, setActiveTab] = useState('message');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checkedLabel, setCheckedLabel] = useState('');
  const [history, setHistory] = useState([]);
  const [requestId, setRequestId] = useState(0);
  const [backendStatus, setBackendStatus] = useState('checking');

  const runCheck = async (fn, label) => {
    const thisRequestId = requestId + 1;
    setRequestId(thisRequestId);
    setLoading(true);
    setError(null);
    try {
      const res = await fn();
      setRequestId((current) => {
        if (current === thisRequestId) {
          setResult(res);
          setCheckedLabel(label);
          setHistory((h) => [
            { id: `${Date.now()}-${Math.random()}`, label, result: res, at: new Date() },
            ...h,
          ].slice(0, MAX_HISTORY));
        }
        return current;
      });
    } catch (e) {
      setRequestId((current) => {
        if (current === thisRequestId) {
          setError(e.message);
          setResult(null);
        }
        return current;
      });
    } finally {
      setRequestId((current) => {
        if (current === thisRequestId) setLoading(false);
        return current;
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ok = await pingHealth();
      if (!cancelled) setBackendStatus(ok ? 'online' : 'offline');
    };
    check();
    const id = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const handleTabChange = (id) => {
    setActiveTab(id);
    setResult(null);
    setError(null);
  };

  const revisitHistoryEntry = (entry) => {
    setRequestId((id) => id + 1);
    setLoading(false);
    setError(null);
    setResult(entry.result);
    setCheckedLabel(entry.label);
  };

  const clearHistory = () => setHistory([]);

  const [exportState, setExportState] = useState('idle');
  const exportHistory = async () => {
    const text = formatHistoryForExport(history);
    try {
      await navigator.clipboard.writeText(text);
      setExportState('copied');
    } catch (e) {
      const ok = window.prompt('Copy failed \u2014 select and copy this manually:', text);
      setExportState(ok !== null ? 'copied' : 'failed');
    }
    setTimeout(() => setExportState('idle'), 2500);
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
        <div className={`status-pill status-pill--${backendStatus}`}>
          <span className={`status-dot status-dot--${backendStatus}`} aria-hidden="true" />
          {backendStatus === 'online' && 'Models online'}
          {backendStatus === 'offline' && 'Server unreachable'}
          {backendStatus === 'checking' && 'Checking…'}
        </div>
      </header>

      <Hero />

      <main className="main-grid" id="tool">
        <nav className="tab-rail" role="tablist" aria-label="Check type">
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

              {history.length > 0 && (
                <div className="history-panel">
                  <div className="history-header">
                    <span className="history-title">Recent checks (this session)</span>
                    <div className="history-header-actions">
                      {history.length > 1 && (
                        <button type="button" className="history-export-btn" onClick={exportHistory}>
                          {exportState === 'copied' ? 'Copied!' : `Export all ${history.length}`}
                        </button>
                      )}
                      <button type="button" className="history-clear-btn" onClick={clearHistory}>
                        Clear
                      </button>
                    </div>
                  </div>
                  <ul className="history-list">
                    {history.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          className={`history-item history-item--${entry.result.risk_level}`}
                          onClick={() => revisitHistoryEntry(entry)}
                        >
                          <span
                            className={`history-dot history-dot--${entry.result.risk_level}`}
                            aria-hidden="true"
                          >
                            {levelIcon(entry.result.risk_level)}
                          </span>
                          <span className="history-label">{entry.label}</span>
                          <span className="history-time">
                            {entry.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="history-note">
                    Kept only in this browser tab — nothing here is saved or sent anywhere.
                  </p>
                </div>
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
          Text classifier trained on 6,840 real, deduplicated messages from two public
          datasets plus documented UPI-scam phrasing (95% cross-validated F1). Transaction
          risk uses an Isolation Forest and a Random Forest over synthetic data — no real
          bank or UPI transaction data exists publicly, or was used here — with sequence
          features that also catch patterns spread across several transactions, not just
          one at a time.
        </p>
      </footer>
    </div>
  );
}
