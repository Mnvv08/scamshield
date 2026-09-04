const STATS = [
  { value: '98%', label: 'accuracy on held-out SMS test set' },
  { value: '3', label: 'input types covered' },
  { value: '5,596', label: 'labeled training rows' },
  { value: 'local', label: 'inference, no external API' },
];

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-radar" aria-hidden="true">
        <svg viewBox="0 0 200 200" width="200" height="200">
          <circle cx="100" cy="100" r="40" className="radar-ring radar-ring--1" />
          <circle cx="100" cy="100" r="70" className="radar-ring radar-ring--2" />
          <circle cx="100" cy="100" r="99" className="radar-ring radar-ring--3" />
          <line x1="100" y1="100" x2="100" y2="1" className="radar-sweep" />
        </svg>
      </div>

      <div className="hero-content">
        <span className="hero-eyebrow">UPI fraud detection, built as an internship project</span>
        <h1 className="hero-title">
          Screens SMS, UPI requests, and payment patterns for fraud signals.
        </h1>
        <p className="hero-subtitle">
          A fine-tuned text classifier runs next to a hand-written rule engine, and their
          scores get merged into one risk read. Trained on the UCI SMS Spam Collection,
          extended with UPI-scam phrasing documented from real reports.
        </p>

        <div className="hero-stats">
          {STATS.map((s) => (
            <div className="hero-stat" key={s.label}>
              <span className="hero-stat-value">{s.value}</span>
              <span className="hero-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}