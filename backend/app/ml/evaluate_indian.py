"""
Evaluation on Indian-context messages: Hinglish, Hindi (Devanagari), and the
bank / UPI / OTP alerts that Indian users receive every day.

Why this exists: the main test split (evaluate.py) is drawn from the same
sources as training - mostly English SMS spam. Scoring well there says nothing
about the messages ScamShield's actual users receive. This set measures that.

The set (app/data/indian_eval_set.csv) is hand-written to match documented scam
typologies and real alert formats; brands, domains and numbers are fictional.
It is an EVALUATION set only. Never train on it - if a training-data fix is
needed, write separate training examples, or these numbers stop meaning anything.

Run:  python app/ml/evaluate_indian.py          (summary)
      python app/ml/evaluate_indian.py -v       (also list every wrong call)
"""

import sys
import warnings
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
warnings.filterwarnings("ignore")

from app.ml.predict import predict_message  # noqa: E402

DATA = Path(__file__).parent.parent / "data" / "indian_eval_set.csv"
THRESHOLD = 0.35  # same cut-off the app uses for "medium" risk and above


def main(verbose=False):
    df = pd.read_csv(DATA)
    results = [predict_message(t) for t in df["text"]]
    df["score"] = [r["risk_score"] for r in results]
    df["rules"] = [",".join(r["triggered_rules"]) for r in results]
    df["flagged"] = df["score"] >= THRESHOLD
    df["correct"] = df["flagged"] == (df["label"] == "scam")

    print(f"Indian evaluation set: {len(df)} messages, threshold {THRESHOLD}\n")
    print(f"{'category':26} {'n':>3}  {'metric':16} {'value':>6}")
    print("-" * 56)
    for cat, g in df.groupby("category", sort=False):
        if g["label"].iloc[0] == "scam":
            metric, value = "caught (recall)", g["flagged"].mean()
        else:
            metric, value = "false-alarm rate", g["flagged"].mean()
        print(f"{cat:26} {len(g):>3}  {metric:16} {value:>6.0%}")

    scams, legit = df[df.label == "scam"], df[df.label == "legit"]
    print("-" * 56)
    print(f"{'ALL scams':26} {len(scams):>3}  {'caught (recall)':16} {scams.flagged.mean():>6.0%}")
    print(f"{'ALL legit':26} {len(legit):>3}  {'false-alarm rate':16} {legit.flagged.mean():>6.0%}")

    if verbose:
        wrong = df[~df["correct"]]
        print(f"\nWrong calls ({len(wrong)}):")
        for _, r in wrong.iterrows():
            kind = "MISSED " if r.label == "scam" else "FALSE+ "
            rules = f" [{r.rules}]" if r.rules else ""
            print(f"  {kind} {r.score:.2f}{rules}  {r.text[:80]}")


if __name__ == "__main__":
    main(verbose="-v" in sys.argv)
