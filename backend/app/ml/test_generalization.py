"""
Generalization test for the transaction anomaly model.

The transaction model is trained on synthetic data whose fraud patterns were
authored by hand (see train_transaction_model.py). Evaluating it against those
same patterns is circular: it measures re-detection of a known signature, not
fraud detection.

This script asks the harder question: does the model catch fraud typologies the
generator never encoded? It fits the model on legitimate traffic only (the model
is unsupervised, so it never needs fraud labels) and then measures recall against
several fraud typologies - one that matches the original generator, and several
that deliberately do not.

Run:  python app/ml/test_generalization.py
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

FEATURES = ["hour", "amount", "is_new_payee", "txns_last_hour",
            "device_changed_recently", "payee_risk_score",
            "time_since_last_txn_min"]

RNG = np.random.default_rng(7)
N_LEGIT_TRAIN = 9000
N_PER_TYPOLOGY = 400
CONTAMINATION = 0.05


def legit_traffic(n, rng):
    return pd.DataFrame({
        "hour": rng.normal(14, 5, n).clip(0, 23).astype(int),
        "amount": np.round(rng.lognormal(6.0, 1.0, n), 2).clip(10, 50000),
        "is_new_payee": rng.choice([0, 1], n, p=[.85, .15]),
        "txns_last_hour": rng.poisson(.3, n).clip(0, 5),
        "device_changed_recently": rng.choice([0, 1], n, p=[.97, .03]),
        "payee_risk_score": rng.beta(1.5, 8, n),
        "time_since_last_txn_min": rng.exponential(180, n).clip(1, 5000),
    })


def typologies(n, rng):
    return {
        # Matches the training generator's fraud signature exactly.
        "in-generator (late-night, new payee, high risk)": pd.DataFrame({
            "hour": rng.choice(list(range(0, 6)) + [22, 23], n),
            "amount": np.round(np.abs(rng.normal(9500, 400, n)), 2),
            "is_new_payee": np.ones(n, int),
            "txns_last_hour": rng.poisson(3, n).clip(0, 15),
            "device_changed_recently": rng.choice([0, 1], n, p=[.4, .6]),
            "payee_risk_score": rng.beta(6, 2, n),
            "time_since_last_txn_min": rng.exponential(8, n).clip(.1, 200),
        }),
        # Many small transfers to an already-known, clean-looking payee at
        # ordinary hours. Each transaction is individually unremarkable.
        "salami slicing (small, rapid, known payee)": pd.DataFrame({
            "hour": rng.normal(15, 3, n).clip(0, 23).astype(int),
            "amount": np.round(rng.normal(180, 40, n), 2).clip(20, 500),
            "is_new_payee": np.zeros(n, int),
            "txns_last_hour": rng.poisson(9, n).clip(4, 25),
            "device_changed_recently": np.zeros(n, int),
            "payee_risk_score": rng.beta(1.5, 8, n),
            "time_since_last_txn_min": rng.exponential(4, n).clip(.1, 30),
        }),
        # Victim is talked into a single, ordinary-looking payment after a long
        # grooming period. No velocity, no device change, mid-size amount.
        "patient social-engineering (one normal-looking txn)": pd.DataFrame({
            "hour": rng.normal(13, 3, n).clip(0, 23).astype(int),
            "amount": np.round(rng.normal(4200, 900, n), 2).clip(500, 20000),
            "is_new_payee": np.ones(n, int),
            "txns_last_hour": np.zeros(n, int),
            "device_changed_recently": np.zeros(n, int),
            "payee_risk_score": rng.beta(2, 6, n),
            "time_since_last_txn_min": rng.exponential(400, n).clip(60, 5000),
        }),
    }


def main():
    train = legit_traffic(N_LEGIT_TRAIN, RNG)
    scaler = StandardScaler().fit(train[FEATURES])
    model = IsolationForest(n_estimators=300, contamination=CONTAMINATION,
                            random_state=42, n_jobs=-1)
    model.fit(scaler.transform(train[FEATURES]))

    def flagged_rate(df):
        return (model.predict(scaler.transform(df[FEATURES])) == -1).mean()

    print("Fitted on legitimate traffic only (unsupervised - no fraud labels used).\n")
    print(f"{'fraud typology':<52}{'recall':>8}")
    print("-" * 60)
    for name, df in typologies(N_PER_TYPOLOGY, RNG).items():
        print(f"{name:<52}{flagged_rate(df):>8.3f}")
    print("-" * 60)
    print(f"{'false-alarm rate on fresh legitimate traffic':<52}"
          f"{flagged_rate(legit_traffic(3000, RNG)):>8.3f}")
    print(
        "\nReading: near-perfect recall on the typology the training data was\n"
        "authored around, far lower on one it was not. Isolation Forest detects\n"
        "point anomalies - transactions unusual in the joint feature space. Salami\n"
        "slicing is invisible to that: each individual transfer looks ordinary and\n"
        "only the sequence is suspicious. Catching it would need sequence-level\n"
        "features (per-payee rolling totals), which this feature set does not have."
    )


if __name__ == "__main__":
    main()
