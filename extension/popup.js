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
  el("checkedText").textContent = text;
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
  try {
    const res = await fetch(`${SCAMSHIELD_CONFIG.PROD_API}/`);
    dot.className = res.ok ? "status-dot online" : "status-dot offline";
  } catch (e) {
    try {
      const res = await fetch(`${SCAMSHIELD_CONFIG.DEV_API}/`);
      dot.className = res.ok ? "status-dot online" : "status-dot offline";
    } catch (e2) {
      dot.className = "status-dot offline";
    }
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
