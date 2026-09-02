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
          <div className="empty-state-mark" aria-hidden="true" />
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
