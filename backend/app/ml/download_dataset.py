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

URL = "https://raw.githubusercontent.com/mohitgupta-1O1/Kaggle-SMS-Spam-Collection-Dataset-/master/spam.csv"

def main():
    if DEST.exists():
        print(f"Dataset already present at {DEST}, skipping download.")
        return
    print(f"Downloading SMS Spam Collection dataset to {DEST} ...")
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp, open(DEST, "wb") as f:
        f.write(resp.read())
    print("Done.")

if __name__ == "__main__":
    main()
