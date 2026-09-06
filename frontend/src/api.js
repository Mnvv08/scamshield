const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Turns a FastAPI/slowapi error body into a plain, displayable message.
// Three shapes actually occur, and the previous code only handled one:
//   - normal errors:      { detail: "some string" }
//   - validation errors:  { detail: [{ msg, loc, type, ... }, ...] }  (Pydantic)
//   - rate limit errors:  { error: "Rate limit exceeded: ..." }        (slowapi)
// Passing the array straight into `new Error()` stringifies it as
// "[object Object]", which is what a validation failure looked like
// before this fix.
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

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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
