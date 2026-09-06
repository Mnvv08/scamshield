const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function extractErrorMessage(body, status) {
  if (typeof body.detail === 'string') return body.detail;
  if (Array.isArray(body.detail) && body.detail.length) {
    const first = body.detail[0];
    const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : null;
    return field ? `${field}: ${first.msg}` : first.msg || `Request failed (${status})`;
  }
  if (typeof body.error === 'string') {
    return status === 429
      ? "You're checking things a bit fast — wait a moment and try again."
      : body.error;
  }
  return `Request failed (${status})`;
}

const NETWORK_ERROR_STRINGS = [
  'failed to fetch',
  'networkerror',
  'load failed',
  'network request failed',
];

function isNetworkFailure(err) {
  const raw = (err?.message || '').toLowerCase();
  return NETWORK_ERROR_STRINGS.some((s) => raw.includes(s));
}

const FRIENDLY_NETWORK_MESSAGE =
  "Couldn't reach the server. If you haven't used ScamShield in a while, " +
  'it may be waking up — this can take up to a minute on the first try. ' +
  'Check your connection and try again.';

async function post(path, body) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(isNetworkFailure(err) ? FRIENDLY_NETWORK_MESSAGE : err.message);
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(extractErrorMessage(errBody, res.status));
  }
  return res.json();
}

export const checkMessage = (text) => post('/predict/message', { text });
export const checkTransaction = (payload) => post('/predict/transaction', payload);
export const checkUpiRequest = (payload) => post('/predict/upi-request', payload);
export const sendChatMessage = (messages) => post('/chat', { messages });
