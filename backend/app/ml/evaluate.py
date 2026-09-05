"""
Evaluation harness for the message classifier.

Answers two questions the README makes claims about:

  1. Does the rule layer actually improve detection over the ML model alone?
  2. Is the deployed risk threshold the right operating point?

Run:  python app/ml/evaluate.py
Requires trained artifacts (they are committed; retrain with the train_* scripts).
"""

import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (confusion_matrix, f1_score, precision_score,
                             recall_score)
from sklearn.model_selection import train_test_split

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.ml.rules import score_message_rules  # noqa: E402
from app.ml.train_text_classifier import (build_augmented_dataset,  # noqa: E402
                                          clean_text, load_base_dataset,
                                          load_smishing_dataset)

MODEL_DIR = Path(__file__).parent.parent / "models"

# Cost asymmetry: in fraud detection a missed scam is far more damaging than a
# false alarm. A false negative can cost someone their savings; a false positive
# costs them a few seconds of annoyance. F1 weights these equally, which is the
# wrong objective here - so we report F2 as well (recall weighted 2x).
FN_COST_MULTIPLIER = 10


def fbeta(precision, recall, beta):
    if precision + recall == 0:
        return 0.0
    b2 = beta ** 2
    return (1 + b2) * precision * recall / (b2 * precision + recall)


def load_test_split():
    base = load_base_dataset()
    smish = load_smishing_dataset()
    if smish is not None:
        base = pd.concat([base, smish], ignore_index=True)
    df = build_augmented_dataset(base)
    df["clean_text"] = df["text"].apply(clean_text)
    _, X_test, _, y_test = train_test_split(
        df["clean_text"], df["label"], test_size=0.2, random_state=42,
        stratify=df["label"],
    )
    return X_test, y_test, df.loc[X_test.index, "text"]


def report(name, y_true, scores, threshold):
    pred = (scores >= threshold).astype(int)
    p = precision_score(y_true, pred, zero_division=0)
    r = recall_score(y_true, pred, zero_division=0)
    tn, fp, fn, tp = confusion_matrix(y_true, pred).ravel()
    return {
        "variant": name, "threshold": threshold, "precision": p, "recall": r,
        "f1": f1_score(y_true, pred, zero_division=0), "f2": fbeta(p, r, 2),
        "missed_scams": fn, "false_alarms": fp,
    }


def main():
    X_test, y_test, raw_test = load_test_split()
    print(f"Held-out test set: {len(y_test)} messages, {int(y_test.sum())} scam\n")

    model = joblib.load(MODEL_DIR / "text_classifier.joblib")
    vec = joblib.load(MODEL_DIR / "text_vectorizer.joblib")
    ml_prob = model.predict_proba(vec.transform(X_test))[:, 1]
    boosts = np.array([score_message_rules(t)["rule_boost"] for t in raw_test])
    combined = np.minimum(1.0, ml_prob * 0.75 + boosts)

    print("=" * 78)
    print("1. ABLATION - does the rule layer earn its place?")
    print("=" * 78)
    rows = [
        report("ML only", y_test, ml_prob, 0.5),
        report("Rules only", y_test, boosts, 0.001),
        report("Hybrid (deployed)", y_test, combined, 0.35),
    ]
    hdr = f"{'variant':<20}{'thr':>6}{'P':>8}{'R':>8}{'F1':>8}{'F2':>8}{'missed':>8}{'alarms':>8}"
    print(hdr)
    for r in rows:
        print(f"{r['variant']:<20}{r['threshold']:>6.2f}{r['precision']:>8.3f}"
              f"{r['recall']:>8.3f}{r['f1']:>8.3f}{r['f2']:>8.3f}"
              f"{r['missed_scams']:>8d}{r['false_alarms']:>8d}")

    ml, hy = rows[0], rows[2]
    print(f"\n  F1:  hybrid {hy['f1']:.3f} vs ML {ml['f1']:.3f} "
          f"({'+' if hy['f1'] >= ml['f1'] else ''}{hy['f1'] - ml['f1']:+.3f})")
    print(f"  F2:  hybrid {hy['f2']:.3f} vs ML {ml['f2']:.3f} "
          f"({hy['f2'] - ml['f2']:+.3f})   <- recall-weighted, the metric that fits the problem")
    print(f"  Missed scams: hybrid {hy['missed_scams']} vs ML {ml['missed_scams']}")
    print(f"  False alarms: hybrid {hy['false_alarms']} vs ML {ml['false_alarms']}")

    print("\n" + "=" * 78)
    print("2. THRESHOLD SWEEP - is 0.35 the right operating point?")
    print("=" * 78)
    print(f"{'thr':>6}{'P':>8}{'R':>8}{'F1':>8}{'F2':>8}{'missed':>8}{'alarms':>8}{'cost':>9}")
    best = None
    for thr in np.arange(0.20, 0.71, 0.05):
        r = report("", y_test, combined, thr)
        cost = r["missed_scams"] * FN_COST_MULTIPLIER + r["false_alarms"]
        marker = ""
        if best is None or cost < best[0]:
            best = (cost, thr)
        print(f"{thr:>6.2f}{r['precision']:>8.3f}{r['recall']:>8.3f}{r['f1']:>8.3f}"
              f"{r['f2']:>8.3f}{r['missed_scams']:>8d}{r['false_alarms']:>8d}{cost:>9d}{marker}")
    print(f"\n  Lowest cost at threshold {best[1]:.2f} "
          f"(cost = missed x {FN_COST_MULTIPLIER} + false alarms)")
    print("  Deployed threshold is 0.35.")


if __name__ == "__main__":
    main()
