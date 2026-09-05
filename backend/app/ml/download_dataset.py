"""
Downloads the real, public UCI SMS Spam Collection dataset (via a GitHub mirror,
since UCI's own archive isn't reliably fetchable in all environments).

Source: Almeida, T. & Hidalgo, J. (2011). SMS Spam Collection.
UCI Machine Learning Repository. https://doi.org/10.24432/C5CC84
License: CC BY 4.0
"""
import urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DEST = DATA_DIR / "sms_spam_raw.csv"
SMISHING_DEST = DATA_DIR / "smishing_raw.csv"

URL = "https://raw.githubusercontent.com/mohitgupta-1O1/Kaggle-SMS-Spam-Collection-Dataset-/master/spam.csv"

# Second real source: SMS Phishing Dataset (Dataset_5971.csv) by Sandhya Mishra
# and Devpriya Soni, Jaypee Institute of Information Technology.
# 5,971 messages, ~13% smishing/spam.
# Original: https://data.mendeley.com/datasets/f45bkkt8pr/1
SMISHING_URL = "https://raw.githubusercontent.com/arinargh/sms-spam-detector/main/Dataset_5971.csv"


def _fetch(url, dest, name):
    if dest.exists():
        print(f"{name} already present at {dest}, skipping download.")
        return
    print(f"Downloading {name} to {dest} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp, open(dest, "wb") as f:
        f.write(resp.read())
    print("  done.")


def main():
    _fetch(URL, DEST, "UCI SMS Spam Collection")
    _fetch(SMISHING_URL, SMISHING_DEST, "SMS Phishing Dataset (Mishra & Soni)")

if __name__ == "__main__":
    main()
