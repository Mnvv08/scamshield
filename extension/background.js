importScripts("config.js");

let resolvedApiBase = null;

async function getApiBase() {
  if (resolvedApiBase) return resolvedApiBase;
  try {
    // Render free tier can take ~50s to wake. Time out fast, but still
    // prefer PROD on failure - falling back to localhost silently breaks
    // the extension for anyone who is not running a local backend.
    const res = await fetch(`${SCAMSHIELD_CONFIG.PROD_API}/`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      resolvedApiBase = SCAMSHIELD_CONFIG.PROD_API;
      return resolvedApiBase;
    }
  } catch (e) {
    /* prod unreachable, fall through to dev */
  }
  resolvedApiBase = SCAMSHIELD_CONFIG.DEV_API;
  return resolvedApiBase;
}

chrome.runtime.onInstalled.addListener(() => {
  // removeAll first: create() throws "duplicate id" if the menu already exists,
  // which happens every time the extension is reloaded during development.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "scamshield-check-selection",
      title: 'Check "%s" with ScamShield',
      contexts: ["selection"],
    });
  });
});

function extractErrorMessage(body, status) {
  if (typeof body.detail === "string") return body.detail;
  if (Array.isArray(body.detail) && body.detail.length) {
    const first = body.detail[0];
    const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : null;
    return field ? `${field}: ${first.msg}` : first.msg || `Request failed (${status})`;
  }
  if (typeof body.error === "string") {
    return status === 429
      ? "You're checking things a bit fast \u2014 wait a moment and try again."
      : body.error;
  }
  return `Request failed (${status})`;
}

async function checkText(text) {
  const base = await getApiBase();
  const res = await fetch(`${base}/predict/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(extractErrorMessage(errBody, res.status));
  }
  return res.json();
}

async function runCheckAndStore(text, tabId) {
  await chrome.storage.local.set({
    lastCheck: { text, loading: true, result: null, error: null },
  });
  if (tabId != null) {
    chrome.action.setBadgeText({ text: "", tabId });
  }
  try {
    const result = await checkText(text);
    await chrome.storage.local.set({
      lastCheck: { text, loading: false, result, error: null, tabId },
    });
    if (tabId != null) {
      const level = result.risk_level;
      const badgeColor = level === "high" ? "#E15B4F" : level === "medium" ? "#E3A73E" : "#4FB784";
      chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId });
      chrome.action.setBadgeText({ text: String(Math.round(result.risk_score * 100)), tabId });
    }
  } catch (err) {
    await chrome.storage.local.set({
      lastCheck: { text, loading: false, result: null, error: err.message, tabId },
    });
    if (tabId != null) {
      chrome.action.setBadgeText({ text: "", tabId });
    }
  }
  // Open the popup automatically so the person sees the result right away.
  try {
    await chrome.action.openPopup();
  } catch (e) {
    /* openPopup isn't available in every context (e.g. no active window focus) - that's fine */
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "scamshield-check-selection" && info.selectionText) {
    runCheckAndStore(info.selectionText, tab ? tab.id : null);
  }
});

// Allow the popup and content script to trigger a check too (e.g. from a
// flagged-link badge click).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SCAMSHIELD_CHECK_TEXT") {
    runCheckAndStore(message.text, sender.tab ? sender.tab.id : null).then(() => sendResponse({ ok: true }));
    return true; // keep the message channel open for the async response
  }
});
