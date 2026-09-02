"""
Trains a scam/phishing text message classifier.

Base data: UCI SMS Spam Collection (5,572 real, labeled SMS messages - ham/spam).
Source: Almeida, T. & Hidalgo, J. (2011), UCI Machine Learning Repository.

Augmentation: The base dataset is general spam (mostly UK/US promotional spam from
2011-2012), so it under-represents modern UPI/digital-payment scam phrasing
(fake KYC updates, fake refund/cashback links, "collect request" social engineering,
courier/electricity-bill scams, impersonation of bank/RBI officials). We add a small,
hand-curated set of real-world-pattern examples (based on publicly documented RBI/CERT-In
scam advisories) as additional 'spam' class samples so the model learns these patterns
too. This is disclosed here and in the README - it is NOT part of the original UCI dataset.
"""

import pandas as pd
import numpy as np
import re
import joblib
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix

DATA_DIR = Path(__file__).parent.parent / "data"
MODEL_DIR = Path(__file__).parent.parent / "models"
MODEL_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# 1. Load base dataset (real, public)
# ---------------------------------------------------------------------------
def load_base_dataset():
    df = pd.read_csv(DATA_DIR / "sms_spam_raw.csv", encoding="latin-1")
    df = df[["v1", "v2"]].rename(columns={"v1": "label", "v2": "text"})
    df["label"] = df["label"].map({"ham": 0, "spam": 1})
    df = df.dropna(subset=["text", "label"])
    return df


# ---------------------------------------------------------------------------
# 2. UPI / digital-payment scam pattern augmentation (hand-curated, disclosed)
#    Patterns reflect publicly documented scam typologies (RBI/CERT-In advisories,
#    news reporting on UPI fraud) - not scraped from any private/real victim data.
# ---------------------------------------------------------------------------
UPI_SCAM_SAMPLES = [
    "Your KYC has expired. Update immediately to avoid account block. Click http://kyc-verify-sbi.tk",
    "Dear customer your electricity bill is unpaid, connection will be cut tonight. Pay now via UPI to avoid disconnection call 9876543210",
    "You have received a collect request of Rs 1 from Amazon Refund team. Approve to receive your cashback of Rs 5000",
    "Congratulations! You have won Rs 25,00,000 in KBC lottery. Send your UPI PIN to claim the prize",
    "Your account will be suspended. Verify your UPI PIN and OTP immediately by clicking this link",
    "Bank alert: unusual activity detected. Share OTP now to secure your account or it will be locked",
    "Hi I am from customer care, please install AnyDesk app so I can help you and share the code shown",
    "URGENT your SBI account is blocked, click here to reactivate and enter your UPI PIN http://bit.ly/sbi-verify",
    "Refund of Rs 499 initiated for your cancelled order. Accept the payment request to receive it",
    "Your parcel is held at customs, pay Rs 150 customs fee via this UPI link to release your package",
    "Dear user your Paytm KYC is pending, complete now or your wallet will be permanently blocked link inside",
    "This is RBI officer speaking, your account is linked to a money laundering case, share OTP to verify",
    "Job offer: earn Rs 5000 daily working from home, pay registration fee of Rs 500 via UPI to start",
    "Your electricity board final disconnection notice, pay bill immediately click link to avoid legal action",
    "I am your relative, I am in an emergency please send money urgently to this UPI ID, will explain later",
    "Get instant loan approved in 5 minutes no documents needed just pay processing fee via UPI",
    "Your credit card reward points are expiring today redeem now by sharing card details and OTP",
    "Income tax refund of Rs 15,750 is approved, click link and enter bank details to receive",
    "Free recharge of Rs 500 just install this app and enter your UPI PIN to claim now",
    "Sir maine galti se aapko paise bhej diye hai please turant wapas kar dijiye is UPI id par",
    "Your Google Pay account has suspicious login, verify identity now by entering UPI PIN here",
    "Vodafone: your number will be disconnected in 2 hours, pay Rs 10 to continue service click link",
    "Congratulations you are selected for cashback offer of Rs 2000 just scan this QR code to receive",
    "This is a courtesy call, we noticed a wrong transaction, please share the OTP to reverse it",
]

LEGIT_TRANSACTIONAL_SAMPLES = [
    "Your account has been debited Rs 500 on 12-04-24 towards UPI/PhonePe. Available balance Rs 12,340",
    "OTP for your transaction is 483920. Do not share this OTP with anyone including bank staff",
    "Your electricity bill of Rs 1200 has been received, thank you for using our services",
    "Hi, can you send me the money you owe for dinner last night whenever convenient",
    "Meeting rescheduled to 4pm tomorrow, please confirm your availability",
    "Your order has been shipped and will be delivered by Friday, track it on our app",
    "Reminder: your rent payment of Rs 15000 is due on the 5th of this month",
    "Your salary of Rs 45000 has been credited to your account ending 4521",
]

def build_augmented_dataset(base_df):
    rows = [(1, t) for t in UPI_SCAM_SAMPLES] + [(0, t) for t in LEGIT_TRANSACTIONAL_SAMPLES]
    aug_df = pd.DataFrame(rows, columns=["label", "text"])
    combined = pd.concat([base_df[["label", "text"]], aug_df], ignore_index=True)
    return combined.drop_duplicates(subset="text").reset_index(drop=True)


# ---------------------------------------------------------------------------
# 3. Feature engineering: TF-IDF on cleaned text
# ---------------------------------------------------------------------------
def clean_text(text: str) -> str:
    text = str(text).lower()
    text = re.sub(r"http\S+|www\S+", " URLTOKEN ", text)
    text = re.sub(r"\b\d{10}\b", " PHONETOKEN ", text)
    text = re.sub(r"[^a-z\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def main():
    print("Loading base dataset (UCI SMS Spam Collection)...")
    base_df = load_base_dataset()
    print(f"  base samples: {len(base_df)}")

    print("Augmenting with UPI/digital-payment scam patterns...")
    df = build_augmented_dataset(base_df)
    print(f"  total samples after augmentation: {len(df)}")

    df["clean_text"] = df["text"].apply(clean_text)

    X_train, X_test, y_train, y_test = train_test_split(
        df["clean_text"], df["label"], test_size=0.2, random_state=42, stratify=df["label"]
    )

    vectorizer = TfidfVectorizer(max_features=5000, ngram_range=(1, 2), min_df=2)
    X_train_vec = vectorizer.fit_transform(X_train)
    X_test_vec = vectorizer.transform(X_test)

    model = LogisticRegression(max_iter=1000, class_weight="balanced", C=2.0)
    model.fit(X_train_vec, y_train)

    y_pred = model.predict(X_test_vec)
    print("\n=== Classification Report (held-out test set) ===")
    print(classification_report(y_test, y_pred, target_names=["legit", "scam"]))
    print("Confusion matrix:\n", confusion_matrix(y_test, y_pred))

    cv_scores = cross_val_score(model, X_train_vec, y_train, cv=5, scoring="f1")
    print(f"\n5-fold CV F1 scores: {cv_scores}")
    print(f"Mean CV F1: {cv_scores.mean():.4f}")

    joblib.dump(model, MODEL_DIR / "text_classifier.joblib")
    joblib.dump(vectorizer, MODEL_DIR / "text_vectorizer.joblib")
    print(f"\nSaved model + vectorizer to {MODEL_DIR}")


if __name__ == "__main__":
    main()
