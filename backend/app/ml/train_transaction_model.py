"""
Trains transaction risk models for UPI-style payments.

IMPORTANT - DATA DISCLOSURE:
No real UPI transaction dataset is publicly available anywhere (banks and NPCI
do not release this data, for good privacy/security reasons). This script
generates a SYNTHETIC dataset whose structure and fraud-pattern logic is based
on publicly documented fraud typologies (RBI Annual Fraud Reports, NPCI
advisories, CERT-In advisories on UPI fraud). This is standard practice for
portfolio/prototype fraud-detection systems when real transaction data is
(rightly) inaccessible. All metrics below are evaluated against these
synthetic labels, NOT validated against real-world fraud - that distinction
matters and should be disclosed in any write-up of this project.

APPROACH: a hybrid of two models, matching how production fraud systems
typically combine methods:
  - IsolationForest (unsupervised): flags statistically unusual transactions
    without needing labels - useful for catching novel fraud patterns a
    supervised model has never seen.
  - RandomForestClassifier (supervised): learns the specific fraud patterns
    encoded in the synthetic labels, and gives interpretable feature
    importances. Since real fraud labels are never available for training in
    practice, this supervised half is illustrative of the approach rather
    than a claim of real-world accuracy.
Both are evaluated on a proper held-out test set (the original version of
this script evaluated on the same data it trained on, which overstates
performance - fixed here).
"""

import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, f1_score

MODEL_DIR = Path(__file__).parent.parent / "models"
MODEL_DIR.mkdir(exist_ok=True)

RNG = np.random.default_rng(42)
N_LEGIT = 20000
N_FRAUD = 1200  # ~5.7% fraud rate - imbalanced on purpose, like real payment fraud


def gen_legit_transactions(n):
    hour = RNG.normal(loc=14, scale=5, size=n).clip(0, 23).astype(int)
    is_weekend = RNG.choice([0, 1], size=n, p=[0.71, 0.29])
    amount = np.round(RNG.lognormal(mean=6.0, sigma=1.0, size=n), 2).clip(10, 50000)
    is_new_payee = RNG.choice([0, 1], size=n, p=[0.85, 0.15])
    txns_last_hour = RNG.poisson(0.3, size=n).clip(0, 5)
    device_changed_recently = RNG.choice([0, 1], size=n, p=[0.97, 0.03])
    payee_risk_score = RNG.beta(1.5, 8, size=n)
    time_since_last_txn_min = RNG.exponential(scale=180, size=n).clip(1, 5000)
    # normal spending is usually close to the sender's historical average
    amount_to_avg_ratio = RNG.normal(1.0, 0.35, size=n).clip(0.1, 3.0)
    recent_failed_attempts = RNG.poisson(0.05, size=n).clip(0, 5)
    return pd.DataFrame({
        "hour": hour, "is_weekend": is_weekend, "amount": amount,
        "is_new_payee": is_new_payee, "txns_last_hour": txns_last_hour,
        "device_changed_recently": device_changed_recently, "payee_risk_score": payee_risk_score,
        "time_since_last_txn_min": time_since_last_txn_min,
        "amount_to_avg_ratio": amount_to_avg_ratio, "recent_failed_attempts": recent_failed_attempts,
        "label": 0,
    })


def gen_fraud_transactions(n):
    hour = RNG.choice(list(range(0, 6)) + list(range(22, 24)), size=n)
    is_weekend = RNG.choice([0, 1], size=n, p=[0.55, 0.45])  # slightly more weekend fraud
    amount = RNG.choice([RNG.normal(9500, 400), RNG.normal(4900, 300), RNG.normal(1999, 200)], size=n)
    amount = np.round(np.abs(amount), 2)
    is_new_payee = RNG.choice([0, 1], size=n, p=[0.15, 0.85])
    txns_last_hour = RNG.poisson(3.0, size=n).clip(0, 15)
    device_changed_recently = RNG.choice([0, 1], size=n, p=[0.4, 0.6])
    payee_risk_score = RNG.beta(6, 2, size=n)
    time_since_last_txn_min = RNG.exponential(scale=8, size=n).clip(0.1, 200)
    # fraud amounts are often wildly out of line with the sender's usual pattern
    amount_to_avg_ratio = RNG.lognormal(mean=1.3, sigma=0.7, size=n).clip(0.5, 15.0)
    # often preceded by failed PIN/OTP attempts (attacker guessing / social-engineering retries)
    recent_failed_attempts = RNG.poisson(1.2, size=n).clip(0, 8)
    return pd.DataFrame({
        "hour": hour, "is_weekend": is_weekend, "amount": amount,
        "is_new_payee": is_new_payee, "txns_last_hour": txns_last_hour,
        "device_changed_recently": device_changed_recently, "payee_risk_score": payee_risk_score,
        "time_since_last_txn_min": time_since_last_txn_min,
        "amount_to_avg_ratio": amount_to_avg_ratio, "recent_failed_attempts": recent_failed_attempts,
        "label": 1,
    })


FEATURES = [
    "hour", "is_weekend", "amount", "is_new_payee", "txns_last_hour",
    "device_changed_recently", "payee_risk_score", "time_since_last_txn_min",
    "amount_to_avg_ratio", "recent_failed_attempts",
]


def main():
    legit = gen_legit_transactions(N_LEGIT)
    fraud = gen_fraud_transactions(N_FRAUD)
    df = pd.concat([legit, fraud], ignore_index=True).sample(frac=1, random_state=1).reset_index(drop=True)
    print(f"Generated {len(df)} synthetic transactions ({N_FRAUD} fraud, {N_LEGIT} legit)")

    X = df[FEATURES]
    y = df["label"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # --- Unsupervised: IsolationForest ---
    contamination = N_FRAUD / (N_LEGIT + N_FRAUD)
    iso_model = IsolationForest(n_estimators=300, contamination=contamination, random_state=42, n_jobs=-1)
    iso_model.fit(X_train_scaled)
    iso_pred = (iso_model.predict(X_test_scaled) == -1).astype(int)

    print("\n=== IsolationForest (unsupervised) - held-out test set ===")
    print(classification_report(y_test, iso_pred, target_names=["legit", "fraud"]))
    print(f"F1 (fraud class): {f1_score(y_test, iso_pred):.4f}")

    # --- Supervised: RandomForestClassifier ---
    rf_model = RandomForestClassifier(
        n_estimators=300, max_depth=8, class_weight="balanced", random_state=42, n_jobs=-1
    )
    rf_model.fit(X_train_scaled, y_train)
    rf_pred = rf_model.predict(X_test_scaled)

    print("\n=== RandomForestClassifier (supervised) - held-out test set ===")
    print(classification_report(y_test, rf_pred, target_names=["legit", "fraud"]))
    print("Confusion matrix:\n", confusion_matrix(y_test, rf_pred))
    print(f"F1 (fraud class): {f1_score(y_test, rf_pred):.4f}")

    print("\n=== RandomForest feature importances ===")
    importances = sorted(zip(FEATURES, rf_model.feature_importances_), key=lambda x: -x[1])
    for name, imp in importances:
        print(f"  {name:28s} {imp:.4f}")

    joblib.dump(iso_model, MODEL_DIR / "transaction_model.joblib")
    joblib.dump(rf_model, MODEL_DIR / "transaction_rf_model.joblib")
    joblib.dump(scaler, MODEL_DIR / "transaction_scaler.joblib")
    joblib.dump(FEATURES, MODEL_DIR / "transaction_features.joblib")
    df.to_csv(Path(__file__).parent.parent / "data" / "synthetic_transactions.csv", index=False)
    print(f"\nSaved both models, scaler, and synthetic dataset to {MODEL_DIR}")


if __name__ == "__main__":
    main()
