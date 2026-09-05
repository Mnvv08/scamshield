import joblib
import numpy as np
from pathlib import Path
from .rules import score_message_rules, score_upi_request_rules
from .train_text_classifier import clean_text

MODEL_DIR = Path(__file__).parent.parent / "models"

# Loaded lazily and cached, so the API can be imported and tested without
# requiring a full training pass first.
_cache = {}


def _load(name):
    if name not in _cache:
        path = MODEL_DIR / f"{name}.joblib"
        if not path.exists():
            raise RuntimeError(
                f"Model artifact '{path.name}' not found. Run the training scripts first."
            )
        _cache[name] = joblib.load(path)
    return _cache[name]


def _risk_bucket(score: float) -> str:
    if score >= 0.7:
        return "high"
    if score >= 0.35:
        return "medium"
    return "low"


def predict_message(text: str) -> dict:
    cleaned = clean_text(text)
    vec = _load("text_vectorizer").transform([cleaned])
    ml_prob = float(_load("text_classifier").predict_proba(vec)[0][1])

    rules = score_message_rules(text)
    combined = min(1.0, ml_prob * 0.75 + rules["rule_boost"])

    return {
        "risk_score": round(combined, 3),
        "risk_level": _risk_bucket(combined),
        "ml_probability": round(ml_prob, 3),
        "triggered_rules": rules["triggered_rules"],
        "explanation": _explain_message(rules["triggered_rules"], ml_prob),
    }


def _explain_message(triggered_rules, ml_prob):
    if not triggered_rules and ml_prob < 0.35:
        return "No known scam patterns detected. Message looks routine."
    parts = []
    labels = {
        "suspicious_url": "contains a shortened or suspicious-looking link",
        "urgency_language": "uses urgency/pressure language typical of scams",
        "credential_request": "asks for OTP, PIN, or remote-access software",
        "authority_impersonation": "impersonates a bank/government official",
    }
    for r in triggered_rules:
        if r in labels:
            parts.append(labels[r])
    if ml_prob >= 0.5:
        parts.append("the wording statistically matches known scam messages")
    if not parts:
        parts.append("the message's phrasing statistically resembles known scam patterns")
    return "Flagged because it " + "; ".join(parts) + "."


def derive_payee_features(features: dict) -> dict:
    """
    Turn a caller-supplied list of recent transfers to the same payee into the
    24h rolling features the model expects.

    The API is stateless: it does not store transaction history, so the caller
    passes what it knows. `recent_payee_txns` is a list of {amount, minutes_ago}.
    When it is absent we fall back to "this is the only transfer to this payee",
    which is the correct neutral assumption rather than a guess.
    """
    f = dict(features)
    recent = f.pop("recent_payee_txns", None) or []
    amount = f.get("amount", 0) or 0

    within_24h = [t for t in recent if (t.get("minutes_ago") or 0) <= 1440]
    prior_amounts = [t.get("amount", 0) or 0 for t in within_24h]

    f["payee_txn_count_24h"] = len(prior_amounts) + 1          # +1 for this one
    f["payee_total_24h"] = sum(prior_amounts) + amount
    if prior_amounts:
        avg = sum(prior_amounts) / len(prior_amounts)
        f["amount_to_payee_avg_ratio"] = amount / avg if avg > 0 else 1.0
    else:
        f["amount_to_payee_avg_ratio"] = 1.0
    return f


def predict_transaction(features: dict) -> dict:
    features = derive_payee_features(features)
    x = np.array([[features.get(f, 0) for f in _load("transaction_features")]])
    x_scaled = _load("transaction_scaler").transform(x)
    raw_score = _load("transaction_model").decision_function(x_scaled)[0]  # higher = more normal
    anomaly = _load("transaction_model").predict(x_scaled)[0] == -1

    # convert decision_function output (~[-0.5, 0.5]) to a 0-1 risk score
    risk = float(np.clip(0.5 - raw_score, 0, 1))

    return {
        "risk_score": round(risk, 3),
        "risk_level": _risk_bucket(risk),
        "flagged_anomaly": bool(anomaly),
        "explanation": _explain_transaction(features, risk),
    }


def _explain_transaction(f, risk):
    reasons = []
    if f.get("hour", 12) in list(range(0, 6)) + [22, 23]:
        reasons.append("unusual hour of transaction")
    if f.get("is_new_payee"):
        reasons.append("first-time/new payee")
    if f.get("txns_last_hour", 0) >= 2:
        reasons.append("multiple rapid transactions in short succession")
    if f.get("device_changed_recently"):
        reasons.append("recent device/SIM change on the account")
    if f.get("payee_risk_score", 0) > 0.5:
        reasons.append("payee has an elevated risk profile")
    if f.get("payee_txn_count_24h", 1) >= 10:
        reasons.append(f"{int(f['payee_txn_count_24h'])} transfers to this payee in 24h")
    if f.get("amount_to_payee_avg_ratio", 1) >= 3:
        reasons.append("amount is far larger than usual for this payee")
    if not reasons:
        return "Transaction pattern looks consistent with normal usage."
    return "Flagged due to: " + ", ".join(reasons) + "."


def predict_upi_request(payload: dict) -> dict:
    rules = score_upi_request_rules(payload)
    risk = rules["rule_boost"]
    return {
        "risk_score": round(risk, 3),
        "risk_level": _risk_bucket(risk),
        "triggered_rules": rules["triggered_rules"],
        "explanation": _explain_upi_request(rules["triggered_rules"]),
    }


def _explain_upi_request(triggered_rules):
    labels = {
        "collect_request": "this is a payment REQUEST (you'd be sending money), not money being sent to you",
        "unverified_payee": "the payee could not be verified",
        "suspicious_vpa_naming": "the payee ID uses naming tricks common in refund/reward scams",
        "suspicious_note_text": "the request note contains suspicious wording",
        "token_amount_trick": "a very small amount is often used to trick users into approving a bigger scam later",
    }
    if not triggered_rules:
        return "No known scam patterns detected in this request."
    parts = [labels[r] for r in triggered_rules if r in labels]
    return "Flagged because " + "; ".join(parts) + "."
