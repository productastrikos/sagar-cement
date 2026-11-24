const API_BASE = process.env.REACT_APP_API_URL || '/api';
export const TOKEN_KEY = 'clinkeriq_token';

function token() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export async function request(path, options = {}) {
  const t = token();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `The server returned ${res.status}. Try again in a moment.`);
    err.status = res.status;
    if (res.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('clinkeriq:unauthorised'));
    throw err;
  }
  return res.json();
}

export const get = (path, params) => {
  const q = params ? Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'All').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : '';
  return request(q ? `${path}${path.includes('?') ? '&' : '?'}${q}` : path);
};
export const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) });
