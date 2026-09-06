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

const MAX_BADGES_PER_SCAN = 200;

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
    const raw = `${link.textContent.trim()} ${link.href}`.trim();
    const text = raw.length > 2000 ? raw.slice(0, 2000) : raw;
    chrome.runtime.sendMessage({ type: "SCAMSHIELD_CHECK_TEXT", text });
  });
  return badge;
}

let badgesThisPage = 0;

function scanLinks(root) {
  if (badgesThisPage >= MAX_BADGES_PER_SCAN) return;
  const links = root.querySelectorAll("a[href]:not([data-scamshield-scanned])");
  for (const link of links) {
    link.setAttribute("data-scamshield-scanned", "1");
    try {
      if (isSuspiciousUrl(link.href)) {
        link.insertAdjacentElement("afterend", makeBadge(link));
        badgesThisPage++;
        if (badgesThisPage >= MAX_BADGES_PER_SCAN) break;
      }
    } catch (e) {
      /* malformed href, skip */
    }
  }
}

scanLinks(document.body);

let scanTimer = null;
const observer = new MutationObserver((mutations) => {
  if (badgesThisPage >= MAX_BADGES_PER_SCAN) {
    observer.disconnect();
    return;
  }
  const hasAddedNodes = mutations.some((m) => m.addedNodes.length > 0);
  if (!hasAddedNodes) return;
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => scanLinks(document.body), 300);
});
observer.observe(document.body, { childList: true, subtree: true });
