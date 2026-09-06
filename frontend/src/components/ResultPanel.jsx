import { useEffect, useState } from 'react';
import RiskGauge from './RiskGauge';

// The API runs on a free tier that sleeps after inactivity, so the first
// request can take ~50s. Silence for that long reads as a broken app, so the
// wait explains itself once it stops looking instant.
function LoadingState() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const cold = elapsed >= 4;
  return (
    <div className="result-panel result-panel--empty">
      <div className="loading-state">
        <div className="loading-ring" aria-hidden="true" />
        <p className="loading-title">{cold ? 'Waking the server' : 'Analysing'}</p>
        <p className="loading-sub">
          {cold
            ? 'The API sleeps when idle, so the first check can take up to a minute. Later checks are instant.'
            : 'Running the classifier and rule checks.'}
        </p>
        {cold && <p className="loading-timer">{elapsed}s</p>}
      </div>
    </div>
  );
}

const VERDICT = {
  low: { title: 'Looks safe', sub: 'Nothing here matches known scam patterns.' },
  medium: { title: 'Be careful', sub: 'Some scam signals present. Verify before you act.' },
  high: { title: 'Likely a scam', sub: 'Strong scam signals. Do not send money or share codes.' },
};

// Concrete next steps rather than generic advice, ordered most important first.
const ACTIONS = {
  low: [
    'Still never share your UPI PIN or OTP with anyone.',
    'If money is being requested, confirm with the person directly.',
  ],
  medium: [
    'Do not tap any links in the message.',
    'Contact the company using a number from their official app, not one in the message.',
    'Never enter your UPI PIN to receive money \u2014 only to send it.',
  ],
  high: [
    'Do not send money, tap links, or share any code.',
    'Do not install screen-sharing apps like AnyDesk or TeamViewer.',
    'Report it at cybercrime.gov.in or call 1930.',
  ],
};

function VerdictIcon({ level }) {
  const c = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  if (level === 'low') {
    return (
      <svg {...c}>
        <path d="M20 6 L9 17 L4 12" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (level === 'high') {
    return (
      <svg {...c}>
        <path d="M12 3 L22 20 H2 Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M12 10 V14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="12" cy="17.2" r="1.2" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...c}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5 V13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function parseReasonsFromExplanation(explanation) {
  if (!explanation) return [];
  const match = explanation.match(/^Flagged due to: (.+)\.$/);
  if (!match) return [];
  return match[1].split(', ').filter(Boolean);
}

export default function ResultPanel({ result, error, checkedLabel, loading }) {
  if (loading) return <LoadingState />;

  if (error) {
    return (
      <div className="result-panel result-panel--empty">
        <div className="result-error">
          <div className="result-error-title">Couldn't reach the analysis engine</div>
          <div className="result-error-detail">{error}</div>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="result-panel result-panel--empty">
        <div className="empty-state">
          <svg width="64" height="64" viewBox="0 0 64 64" className="empty-state-icon" aria-hidden="true">
            <path d="M32 4 L56 14 V30 C56 45 46 55 32 60 C18 55 8 45 8 30 V14 Z"
                  fill="none" stroke="var(--border-hairline)" strokeWidth="2" />
            <path d="M22 32 L29 39 L43 24" fill="none" stroke="var(--text-faint)"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p>Run a check to see the risk assessment here.</p>
        </div>
      </div>
    );
  }

  const level = result.risk_level || 'low';
  // Message and UPI results carry a real triggered_rules array; transaction
  // results only have a prose explanation ("Flagged due to: X, Y, Z."). Both
  // ended up rendering visibly differently for the same information, so
  // parse the prose into the same chip shape when the array isn't present.
  const rules = result.triggered_rules || parseReasonsFromExplanation(result.explanation);
  const verdict = VERDICT[level] || VERDICT.low;
  const actions = ACTIONS[level] || ACTIONS.low;

  return (
    <div className={`result-panel result-panel--${level}`} key={result.risk_score}>
      <div className="result-header">
        <span className="result-eyebrow">{checkedLabel}</span>
      </div>

      <RiskGauge score={result.risk_score} level={level} />

      <div className="verdict">
        <div className="verdict-title">
          <VerdictIcon level={level} />
          <span>{verdict.title}</span>
        </div>
        <p className="verdict-sub">{verdict.sub}</p>
      </div>

      <p className="result-explanation">{result.explanation}</p>

      {rules.length > 0 && (
        <div className="rule-chips">
          {rules.map((r) => (
            <span key={r} className="rule-chip">{r.includes('_') ? r.replaceAll('_', ' ') : r}</span>
          ))}
        </div>
      )}

      <div className="action-list">
        <div className="action-list-title">What to do</div>
        <ul>
          {actions.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </div>

      <details className="result-meta-toggle">
        <summary>Model details</summary>
        <div className="result-meta">
          {typeof result.ml_probability === 'number' && (
            <div className="meta-row">
              <span>ML model probability</span>
              <span className="mono">{(result.ml_probability * 100).toFixed(1)}%</span>
            </div>
          )}
          <div className="meta-row">
            <span>Combined risk score</span>
            <span className="mono">{result.risk_score.toFixed(3)}</span>
          </div>
          {'flagged_anomaly' in result && (
            <div className="meta-row">
              <span>Anomaly detector</span>
              <span className="mono">{result.flagged_anomaly ? 'FLAGGED' : 'clear'}</span>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
