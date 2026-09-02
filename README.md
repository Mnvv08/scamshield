# ScamShield — UPI & Digital Payment Fraud Detection

![ScamShield dashboard](docs/screenshot.png)

A full-stack app that assesses scam/fraud risk across three common attack surfaces in
Indian digital payments: suspicious **messages** (SMS/WhatsApp phishing), **transaction
patterns** (behavioural anomalies), and **UPI collect requests** (the "approve to receive
money" trick).

It combines two trained ML models with an explicit rule engine, and returns a risk score
**with a plain-language explanation** of why something was flagged — not just a number.

## Why this project

Digital payment fraud in India has grown alongside UPI adoption, and most protection is
reactive (banks flag fraud *after* the money is gone) rather than preventive. This project
is a prototype of a preventive layer: catching a scam message or a suspicious request
*before* the user acts on it.

## Architecture

```
┌─────────────┐      ┌──────────────────────────────────────────┐
│   React UI   │─────▶│  FastAPI backend                         │
│ (Vite)       │◀─────│  ┌────────────────┐  ┌──────────────────┐│
└─────────────┘      │  │ Text classifier │  │ Transaction       ││
                      │  │ (TF-IDF + LR)   │  │ anomaly model     ││
                      │  └────────────────┘  │ (Isolation Forest)││
                      │           │           └──────────────────┘│
                      │           ▼                                │
                      │  ┌────────────────────────────────────┐   │
                      │  │ Rule engine (explainable heuristics)│   │
                      │  └────────────────────────────────────┘   │
                      └──────────────────────────────────────────┘
```

- **Message classifier**: TF-IDF + Logistic Regression, trained on the real, public
  [UCI SMS Spam Collection](https://archive.ics.uci.edu/dataset/228/sms+spam+collection)
  dataset (5,572 labeled messages), extended with a small hand-curated set of UPI-scam
  phrasing patterns (fake KYC, fake refunds, "collect request" tricks) based on publicly
  documented RBI/CERT-In scam advisories.
- **Transaction risk model**: Isolation Forest anomaly detection. **No real UPI/bank
  transaction dataset exists publicly** — banks and NPCI don't release this data, for
  good reason. This model is trained on a **synthetic dataset** whose fraud-pattern logic
  (odd-hour transactions, new-payee targeting, transaction bursts, device-change
  correlation, amounts just under verification thresholds) is built from publicly
  documented fraud typologies, not real data. See `backend/app/ml/train_transaction_model.py`
  for the exact generation logic — it's fully commented and disclosed there.
- **Rule engine**: explicit, auditable checks (known scam phrasing, suspicious URLs,
  collect-request red flags) that combine with the ML score. Real fraud systems are
  hybrid for a reason — rules catch known patterns instantly and are explainable in a way
  a pure ML score isn't.

## Project structure

```
scamshield/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app + endpoints
│   │   ├── ml/
│   │   │   ├── download_dataset.py     # fetches the real base dataset
│   │   │   ├── train_text_classifier.py
│   │   │   ├── train_transaction_model.py
│   │   │   ├── rules.py                # rule engine
│   │   │   └── predict.py              # combines ML + rules
│   │   ├── models/                 # trained model artifacts (generated, gitignored)
│   │   └── data/                   # datasets (generated/downloaded, gitignored)
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── api.js
    │   └── components/
    └── package.json
```

## Setup

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Download the real base dataset, then train both models
python3 app/ml/download_dataset.py
python3 app/ml/train_text_classifier.py
python3 app/ml/train_transaction_model.py

# Run the API
uvicorn app.main:app --reload --port 8000
```

The API will be live at `http://localhost:8000`. Interactive docs at
`http://localhost:8000/docs`.

### 2. Frontend

```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env
npm run dev
```

Open `http://localhost:5173`.

## API endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/predict/message` | POST | Score a text message (`{"text": "..."}`) |
| `/predict/transaction` | POST | Score a transaction pattern |
| `/predict/upi-request` | POST | Score a UPI collect/payment request |

Each returns a `risk_score` (0–1), `risk_level` (`low`/`medium`/`high`), and a plain-language
`explanation`.

## Model performance (on held-out test data)

- **Text classifier**: 98% accuracy, 93% F1 on the scam class, 92% mean 5-fold CV F1.
- **Transaction anomaly model**: 95% F1 against synthetic ground-truth labels (see caveat
  above — this is performance against the synthetic labels it was trained to detect, not a
  real-world benchmark).

## Honest limitations

- The transaction model has never seen real transaction data and should not be presented
  as validated against real fraud — it's a prototype demonstrating the approach.
- The text classifier's base data is general 2011-era SMS spam; UPI-scam coverage comes
  from a small curated set (~24 examples), not a large labeled corpus of real UPI scams.
- This is a portfolio/learning project, not a production fraud-detection system. Don't use
  it as the sole safeguard for real financial decisions.

## Tech stack

- **Backend**: Python, FastAPI, scikit-learn, pandas
- **Frontend**: React, Vite
- **ML**: TF-IDF + Logistic Regression (text), Isolation Forest (anomaly detection)

## License

MIT
