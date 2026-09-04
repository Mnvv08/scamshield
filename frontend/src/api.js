const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export const checkMessage = (text) => post('/predict/message', { text });
export const checkTransaction = (payload) => post('/predict/transaction', payload);
export const checkUpiRequest = (payload) => post('/predict/upi-request', payload);
export const sendChatMessage = (messages) => post('/chat', { messages });