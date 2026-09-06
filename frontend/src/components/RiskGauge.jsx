const LEVEL_COLOR = {
  low: 'var(--signal-safe)',
  medium: 'var(--signal-medium)',
  high: 'var(--signal-high)',
};

const LEVEL_LABEL = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
};

export default function RiskGauge({ score, level }) {
  const pct = Math.max(0, Math.min(1, score));
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const color = LEVEL_COLOR[level] || 'var(--text-muted)';

  const pctLabel = Math.round(pct * 100);

  return (
    <div className="risk-gauge">
      <svg
        width="176" height="176" viewBox="0 0 176 176"
        style={{ filter: `drop-shadow(0 0 18px ${color}55)` }}
        role="img"
        aria-label={`Risk score ${pctLabel} out of 100, ${LEVEL_LABEL[level] || 'unknown risk'}`}
      >
        <circle
          cx="88" cy="88" r={radius}
          fill="none"
          stroke="var(--border-hairline)"
          strokeWidth="10"
        />
        <circle
          cx="88" cy="88" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 88 88)"
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
        />
        <text x="88" y="82" textAnchor="middle" className="gauge-score" fill="var(--text-primary)">
          {Math.round(pct * 100)}
        </text>
        <text x="88" y="104" textAnchor="middle" className="gauge-unit" fill="var(--text-faint)">
          / 100
        </text>
      </svg>
      <div className="gauge-level" style={{ color }}>
        {LEVEL_LABEL[level] || level}
      </div>
    </div>
  );
}
