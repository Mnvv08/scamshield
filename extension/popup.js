const el = (id) => document.getElementById(id);

function showOnly(id) {
  ["emptyState", "resultState", "errorState", "loadingState"].forEach((s) => {
    el(s).classList.toggle("hidden", s !== id);
  });
}

function renderResult(text, result) {
  showOnly("resultState");
  const gauge = el("gauge");
  gauge.className = `gauge risk-${result.risk_level}`;
  el("gaugeScore").textContent = Math.round(result.risk_score * 100);
  el("riskLevel").textContent =
    result.risk_level === "high" ? "High risk" : result.risk_level === "medium" ? "Medium risk" : "Low risk";
  el("checkedText").textContent = text.length > 300 ? text.slice(0, 300) + "…" : text;
  el("explanation").textContent = result.explanation;

  const chipsWrap = el("ruleChips");
  chipsWrap.innerHTML = "";
  (result.triggered_rules || []).forEach((r) => {
    const chip = document.createElement("span");
    chip.className = "rule-chip";
    chip.textContent = r.replaceAll("_", " ");
    chipsWrap.appendChild(chip);
  });
}

function renderError(message) {
  showOnly("errorState");
  el("errorText").textContent = `Couldn't reach the analysis engine: ${message}`;
}

async function loadLastCheck() {
  const { lastCheck } = await chrome.storage.local.get("lastCheck");
  if (!lastCheck) {
    showOnly("emptyState");
    return;
  }

  let isStale = false;
  if (lastCheck.tabId != null) {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      isStale = activeTab?.id !== lastCheck.tabId;
    } catch (e) {
      /* tabs API unavailable - treat as not stale */
    }
  }
  el("staleNotice").classList.toggle("hidden", !isStale);

  if (lastCheck.loading) {
    showOnly("loadingState");
  } else if (lastCheck.error) {
    renderError(lastCheck.error);
  } else if (lastCheck.result) {
    renderResult(lastCheck.text, lastCheck.result);
  } else {
    showOnly("emptyState");
  }
}

async function pingApi() {
  const dot = el("statusDot");
  dot.className = "status-dot checking";
  dot.title = "Checking connection\u2026";

  const withTimeout = (url, ms) =>
    fetch(url, { signal: AbortSignal.timeout(ms) });

  try {
    const start = Date.now();
    const res = await withTimeout(`${SCAMSHIELD_CONFIG.PROD_API}/`, 8000);
    const tookLong = Date.now() - start > 3000;
    if (res.ok) {
      dot.className = "status-dot online";
      dot.title = tookLong
        ? "Connected (server was waking up, now ready)"
        : "Connected";
    } else {
      dot.className = "status-dot offline";
      dot.title = `Server responded with an error (${res.status})`;
    }
    return;
  } catch (e) {
    /* fast failure vs. still-waking server look identical here; fall through */
  }

  dot.className = "status-dot checking";
  dot.title = "Server may still be waking up\u2026 trying local backend";
  try {
    const res = await withTimeout(`${SCAMSHIELD_CONFIG.DEV_API}/`, 3000);
    dot.className = res.ok ? "status-dot online" : "status-dot offline";
    dot.title = res.ok ? "Connected (local backend)" : `Local backend error (${res.status})`;
  } catch (e2) {
    dot.className = "status-dot offline";
    dot.title = "Can't reach the server. It may still be waking up (can take up to a minute) or you may be offline.";
  }
}

el("manualForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = el("manualInput").value.trim();
  if (!text) return;
  const btn = el("manualSubmit");
  btn.disabled = true;
  showOnly("loadingState");
  chrome.runtime.sendMessage({ type: "SCAMSHIELD_CHECK_TEXT", text }, () => {
    loadLastCheck();
    btn.disabled = false;
  });
});

// Live-update if a check completes while the popup happens to still be open.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.lastCheck) loadLastCheck();
});

loadLastCheck();
pingApi();


// content.js is not auto-injected everywhere (activeTab only grants access
// when the user acts), so link scanning happens on demand from here rather
// than running on every page the user visits.
el("scanPageBtn")?.addEventListener("click", async () => {
  const btn = el("scanPageBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Scanning...";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
    window.close(); // let the person go look at the highlighted links
  } catch (e) {
    btn.textContent = "Couldn't scan this page";
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2000);
  }
});
