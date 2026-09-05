# ScamShield Scanner (browser extension)

A Chrome extension that brings ScamShield's scam detection into the browser
itself — check any text without switching tabs, and get an instant heads-up
on suspicious links as you browse.

## What it does

- **Right-click check**: select any text on any page (an email, a WhatsApp
  Web message, a forum post) → right-click → **"Check with ScamShield"** →
  see the real risk score from the same ML models the web app uses.
- **Link highlighting**: a small ⚠ badge appears next to links matching
  common scam patterns (shortened URLs, sketchy free TLDs, "verify-account"
  naming tricks) as you browse — this part is a fast, local heuristic check
  (no network call, mirrors the backend's rule engine), not the full ML
  model. Click the badge to run a full check on that link.
- **Manual check**: click the extension icon any time to paste text directly.

## Load it (unpacked, for development/personal use)

This isn't published to the Chrome Web Store — load it locally:

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this `extension/` folder
5. Pin the ScamShield icon to your toolbar for easy access

## Configuration

`config.js` points at the deployed backend by default
(`https://scamshield-9ksh.onrender.com`), falling back to
`http://localhost:8000` automatically if that's unreachable — useful while
developing. If you redeploy your backend to a different URL, update
`PROD_API` in `config.js` and reload the extension.

## Privacy note

The right-click check and manual check send only the specific text you
selected or pasted to the backend — nothing else on the page. The link
badge highlighting never sends anything anywhere; it's a local pattern
match against the link URL only.
