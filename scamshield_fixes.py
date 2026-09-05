#!/usr/bin/env python3
"""Applies all ScamShield fixes. Run from repo root."""
import re, sys
from pathlib import Path

root = Path.cwd()
changed = []

# --- FIX 1: README - remove nonexistent Random Forest claims ---
p = root / "README.md"
t = p.read_text()

old_arch = """- **Transaction risk model**: a hybrid of an unsupervised Isolation Forest (catches
  statistically unusual transactions without needing labels) and a supervised Random
  Forest (learns the specific fraud patterns in the training labels, with interpretable
  feature importances), blended into one risk score. **No real UPI/bank transaction"""
new_arch = """- **Transaction risk model**: an unsupervised Isolation Forest, which catches
  statistically unusual transactions without needing labels. **No real UPI/bank transaction"""
if old_arch in t:
    t = t.replace(old_arch, new_arch); changed.append("README: architecture claim")

old_perf = """- **Transaction model**: 98% F1 (Isolation Forest, unsupervised) and 100% F1 (Random
  Forest, supervised) against synthetic ground-truth labels on a proper held-out test
  split (see caveat"""
new_perf = """- **Transaction model**: Isolation Forest evaluated against synthetic ground-truth
  labels (see caveat"""
if old_perf in t:
    t = t.replace(old_perf, new_perf); changed.append("README: performance claim")

t = t.replace("Both models are trained on a **synthetic dataset**",
              "The model is trained on a **synthetic dataset**")
p.write_text(t)

# --- FIX 2: main.py - remove debug logging block ---
p = root / "backend/app/main.py"
t = p.read_text()
t = re.sub(r'\n+import os, logging\n_k = os\.getenv\("GEMINI_API_KEY", ""\)\nlogging\.warning\(f"GEMINI KEY CHECK.*?\n', '\n', t, flags=re.S)
if "GEMINI KEY CHECK" not in t:
    changed.append("main.py: removed debug key logging")

# --- FIX 3: main.py - log real error server-side before generic 502 ---
if "logging.exception" not in t:
    t = t.replace("import os\nfrom fastapi import", "import os\nimport logging\nfrom fastapi import")
    t = t.replace(
        '    except Exception as e:\n        raise HTTPException(status_code=502, detail="Assistant temporarily unavailable")',
        '    except Exception:\n        logging.exception("Gemini call failed")\n        raise HTTPException(status_code=502, detail="Assistant temporarily unavailable")')
    changed.append("main.py: log errors server-side")

# --- FIX 4: main.py - remove 3 dead transaction fields ---
for dead in ['    is_weekend: bool = False\n',
             '    amount_to_avg_ratio: float = Field(1.0, ge=0)\n',
             '    recent_failed_attempts: int = Field(0, ge=0)\n']:
    if dead in t:
        t = t.replace(dead, ''); changed.append(f"main.py: removed dead field {dead.split(':')[0].strip()}")
p.write_text(t)

# --- FIX 5: extension - context menu duplicate id crash ---
p = root / "extension/background.js"
t = p.read_text()
old_menu = """chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "scamshield-check-selection",
    title: 'Check "%s" with ScamShield',
    contexts: ["selection"],
  });
});"""
new_menu = """chrome.runtime.onInstalled.addListener(() => {
  // removeAll first: create() throws "duplicate id" if the menu already exists,
  // which happens every time the extension is reloaded during development.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "scamshield-check-selection",
      title: 'Check "%s" with ScamShield',
      contexts: ["selection"],
    });
  });
});"""
if old_menu in t:
    t = t.replace(old_menu, new_menu); changed.append("extension: context menu duplicate-id fix")

# --- FIX 6: extension - timeout on prod probe so it doesn't hang/fall back wrongly ---
old_probe = '    const res = await fetch(`${SCAMSHIELD_CONFIG.PROD_API}/`, { method: "GET" });'
new_probe = ('    // Render free tier can take ~50s to wake. Time out fast, but still\n'
             '    // prefer PROD on failure - falling back to localhost silently breaks\n'
             '    // the extension for anyone who is not running a local backend.\n'
             '    const res = await fetch(`${SCAMSHIELD_CONFIG.PROD_API}/`, {\n'
             '      method: "GET",\n'
             '      signal: AbortSignal.timeout(3000),\n'
             '    });')
if old_probe in t:
    t = t.replace(old_probe, new_probe); changed.append("extension: probe timeout")
p.write_text(t)

# --- FIX 7: trainer creates its own data dir ---
p = root / "backend/app/ml/train_transaction_model.py"
t = p.read_text()
if 'DATA_DIR' not in t:
    t = t.replace('MODEL_DIR = Path(__file__).parent.parent / "models"\nMODEL_DIR.mkdir(exist_ok=True)',
                  'MODEL_DIR = Path(__file__).parent.parent / "models"\nMODEL_DIR.mkdir(parents=True, exist_ok=True)\nDATA_DIR = Path(__file__).parent.parent / "data"\nDATA_DIR.mkdir(parents=True, exist_ok=True)')
    t = t.replace('df.to_csv(Path(__file__).parent.parent / "data" / "synthetic_transactions.csv", index=False)',
                  'df.to_csv(DATA_DIR / "synthetic_transactions.csv", index=False)')
    changed.append("trainer: creates data dir (no more FileNotFoundError standalone)")
p.write_text(t)

print("\n".join(f"  [ok] {c}" for c in changed) or "  nothing changed")
print(f"\n{len(changed)} fixes applied")
