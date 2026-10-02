const STATS = [
  { value: '98%', label: 'accuracy on held-out SMS test set' },
  { value: '4', label: 'input types covered' },
  { value: '6,840', label: 'real, deduplicated training messages' },
  { value: '2 real', label: 'public SMS datasets, plus hand-written Indian messages' },
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
          Screens SMS, UPI requests, QR codes, and payment patterns for fraud signals.
        </h1>
        <p className="hero-subtitle">
          A text classifier runs next to a hand-written rule engine, and their scores get
          merged into one risk read. Trained on two real public SMS datasets plus
          hand-written Hindi, Hinglish and Indian-alert messages based on real scam reports.
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