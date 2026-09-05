"""
Trains an anomaly-detection model for UPI-style transaction risk scoring.

IMPORTANT - DATA DISCLOSURE:
No real UPI transaction dataset is publicly available anywhere (banks and NPCI
do not release this data, for good privacy/security reasons). This script
generates a SYNTHETIC dataset whose structure and fraud-pattern logic is based
on publicly documented fraud typologies (RBI Annual Fraud Reports, NPCI
advisories, CERT-In advisories on UPI fraud):
  - Fraudulent transactions cluster at unusual hours (late night)
  - Fraud often targets first-time/new payees
  - Fraud amounts often just under common reporting/verification thresholds
  - Fraud is preceded by rapid, repeated transaction attempts (velocity)
  - Fraud often follows a device/SIM change on the account
This is standard practice for portfolio/prototype fraud-detection systems
when real transaction data is (rightly) inaccessible. It is disclosed here,
in the README, and should be disclosed in any write-up of this project -
do not claim this model was trained on real bank data.
"""

import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report

MODEL_DIR = Path(__file__).parent.parent / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

RNG = np.random.default_rng(42)
N_LEGIT = 9000
N_FRAUD = 500  # realistic fraud is a small minority - imbalanced on purpose


def gen_legit_transactions(n):
    hour = RNG.normal(loc=14, scale=5, size=n).clip(0, 23).astype(int)
    amount = np.round(RNG.lognormal(mean=6.0, sigma=1.0, size=n), 2).clip(10, 50000)
    is_new_payee = RNG.choice([0, 1], size=n, p=[0.85, 0.15])
    txns_last_hour = RNG.poisson(0.3, size=n).clip(0, 5)
    device_changed_recently = RNG.choice([0, 1], size=n, p=[0.97, 0.03])
    payee_risk_score = RNG.beta(1.5, 8, size=n)  # skewed low
    time_since_last_txn_min = RNG.exponential(scale=180, size=n).clip(1, 5000)
    return pd.DataFrame({
        "hour": hour, "amount": amount, "is_new_payee": is_new_payee,
        "txns_last_hour": txns_last_hour, "device_changed_recently": device_changed_recently,
        "payee_risk_score": payee_risk_score, "time_since_last_txn_min": time_since_last_txn_min,
        "label": 0,
    })


def gen_fraud_transactions(n):
    # late night / odd-hour bias
    hour = RNG.choice(list(range(0, 6)) + list(range(22, 24)), size=n)
    # amounts just under common soft-verification thresholds, e.g. ~9500, ~4900
    amount = RNG.choice([RNG.normal(9500, 400), RNG.normal(4900, 300), RNG.normal(1999, 200)], size=n)
    amount = np.round(np.abs(amount), 2)
    is_new_payee = RNG.choice([0, 1], size=n, p=[0.15, 0.85])  # mostly new/unknown payee
    txns_last_hour = RNG.poisson(3.0, size=n).clip(0, 15)  # burst behaviour
    device_changed_recently = RNG.choice([0, 1], size=n, p=[0.4, 0.6])  # often after device/SIM change
    payee_risk_score = RNG.beta(6, 2, size=n)  # skewed high
    time_since_last_txn_min = RNG.exponential(scale=8, size=n).clip(0.1, 200)  # rapid succession
    return pd.DataFrame({
        "hour": hour, "amount": amount, "is_new_payee": is_new_payee,
        "txns_last_hour": txns_last_hour, "device_changed_recently": device_changed_recently,
        "payee_risk_score": payee_risk_score, "time_since_last_txn_min": time_since_last_txn_min,
        "label": 1,
    })


def main():
    legit = gen_legit_transactions(N_LEGIT)
    fraud = gen_fraud_transactions(N_FRAUD)
    df = pd.concat([legit, fraud], ignore_index=True).sample(frac=1, random_state=1).reset_index(drop=True)

    features = ["hour", "amount", "is_new_payee", "txns_last_hour",
                "device_changed_recently", "payee_risk_score", "time_since_last_txn_min"]
    X = df[features]
    y = df["label"]

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # contamination ~ true fraud rate in our synthetic data
    contamination = N_FRAUD / (N_LEGIT + N_FRAUD)
    model = IsolationForest(
        n_estimators=300, contamination=contamination, random_state=42, n_jobs=-1
    )
    model.fit(X_scaled)

    raw_pred = model.predict(X_scaled)  # -1 = anomaly, 1 = normal
    pred_label = (raw_pred == -1).astype(int)

    print("=== IsolationForest performance vs synthetic ground-truth labels ===")
    print(classification_report(y, pred_label, target_names=["legit", "fraud"]))

    joblib.dump(model, MODEL_DIR / "transaction_model.joblib")
    joblib.dump(scaler, MODEL_DIR / "transaction_scaler.joblib")
    joblib.dump(features, MODEL_DIR / "transaction_features.joblib")
    df.to_csv(DATA_DIR / "synthetic_transactions.csv", index=False)
    print(f"\nSaved model, scaler, and synthetic dataset to {MODEL_DIR}")


if __name__ == "__main__":
    main()
