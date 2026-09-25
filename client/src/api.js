/* API client — credentials, CSRF token, hidden admin key. */
let csrfToken = null;
let adminKey = sessionStorage.getItem('khm_admin_key') || '';

export function setAdminKey(k) {
  adminKey = k || '';
  try {
    if (adminKey) sessionStorage.setItem('khm_admin_key', adminKey);
    else sessionStorage.removeItem('khm_admin_key');
  } catch {}
}
export function clearAdminKey() {
  setAdminKey('');
}
export function hasAdminKey() {
  return !!adminKey;
}

async function ensureCsrf() {
  if (csrfToken) return csrfToken;
  const res = await fetch('/api/csrf', { method: 'GET', credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  csrfToken = data.csrf || '';
  return csrfToken;
}

export async function request(method, url, body, { csrf = true } = {}) {
  const headers = {};
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (csrf) {
    try {
      const tok = await ensureCsrf();
      if (tok) headers['x-csrf-token'] = tok;
    } catch {}
  }
  if (adminKey) headers['x-admin-key'] = adminKey;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      credentials: 'include',
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const e = new Error('network');
    e.status = 0;
    throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || 'request_failed');
    e.status = res.status;
    throw e;
  }
  return data;
}

export const api = {
  get: (u) => request('GET', u, undefined, { csrf: false }),
  post: (u, b) => request('POST', u, b),
  put: (u, b) => request('PUT', u, b),
  del: (u) => request('DELETE', u),
  upload: (u, fd) => request('POST', u, fd),
};