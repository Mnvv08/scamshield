import RiskGauge from './RiskGauge';

export default function ResultPanel({ result, error, checkedLabel }) {
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
            <path
              d="M32 4 L56 14 V30 C56 45 46 55 32 60 C18 55 8 45 8 30 V14 Z"
              fill="none"
              stroke="var(--border-hairline)"
              strokeWidth="2"
            />
            <path
              d="M22 32 L29 39 L43 24"
              fill="none"
              stroke="var(--text-faint)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p>Run a check to see the risk assessment here.</p>
        </div>
      </div>
    );
  }

  const rules = result.triggered_rules || [];

  return (
    <div className="result-panel">
      <div className="result-header">
        <span className="result-eyebrow">{checkedLabel}</span>
      </div>
      <RiskGauge score={result.risk_score} level={result.risk_level} />
      <p className="result-explanation">{result.explanation}</p>

      {rules.length > 0 && (
        <div className="rule-chips">
          {rules.map((r) => (
            <span key={r} className="rule-chip">{r.replaceAll('_', ' ')}</span>
          ))}
        </div>
      )}

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
    </div>
  );
}
