// Lightweight, client-side link scanning. This mirrors the suspicious-URL
// heuristics in the backend's rules.py (shortened links, sketchy free TLDs,
// verify/secure-update naming tricks) but runs entirely locally for instant
// feedback - no network call, no page content ever leaves the browser for
// this part. Clicking a flagged badge sends just that link's text to the
// real backend for a full ML + rules check, same as the right-click menu.

const SUSPICIOUS_URL_PATTERNS = [
  /bit\.ly/i, /tinyurl/i, /\.tk(\/|$)/i, /\.xyz(\/|$)/i, /\.top(\/|$)/i,
  /kyc-?verify/i, /-verify\d*\./i, /secure-?update/i, /account-?block/i,
];

function isSuspiciousUrl(href) {
  return SUSPICIOUS_URL_PATTERNS.some((p) => p.test(href));
}

function makeBadge(link) {
  const badge = document.createElement("span");
  badge.className = "scamshield-badge";
  badge.title = "Possible scam link — click to check with ScamShield";
  badge.textContent = "⚠";
  badge.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = `${link.textContent.trim()} ${link.href}`.trim();
    chrome.runtime.sendMessage({ type: "SCAMSHIELD_CHECK_TEXT", text });
  });
  return badge;
}

function scanLinks(root) {
  const links = root.querySelectorAll("a[href]:not([data-scamshield-scanned])");
  links.forEach((link) => {
    link.setAttribute("data-scamshield-scanned", "1");
    try {
      if (isSuspiciousUrl(link.href)) {
        link.insertAdjacentElement("afterend", makeBadge(link));
      }
    } catch (e) {
      /* malformed href, skip */
    }
  });
}

// Initial scan, then watch for content added dynamically (SPAs, infinite scroll, webmail, etc.)
scanLinks(document.body);
const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.addedNodes.length) {
      scanLinks(document.body);
      break;
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });
