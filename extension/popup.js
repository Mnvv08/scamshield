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
