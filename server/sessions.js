import { randHex, hmac, timingSafeEqualStr } from './security.js';

const SESS_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const IDLE_MS = 30 * 60 * 1000;          // sliding window
const ADMIN_ROUTE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_SESSIONS = 10000;

// Map<sid, {userId:number|null, csrf, exp, ip}>
const store = new Map();

function sign(sid) {
  return hmac(sid, process.env.SESSION_SECRET || 'dev-secret');
}

export function setSessionCookie(res, sid) {
  const val = sid + '.' + sign(sid);
  res.setHeader('Set-Cookie', `sid=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESS_TTL_MS / 1000)}; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}`);
}

function adminRouteSignature(exp) {
  return hmac(`admin-route:${exp}`, process.env.ADMIN_KEY || 'dev-admin-key');
}

export function grantAdminRoute(res) {
  const exp = Date.now() + ADMIN_ROUTE_TTL_MS;
  const value = `${exp}.${adminRouteSignature(exp)}`;
  // Secure only when actually on HTTPS (PUBLIC_ORIGIN starts with https://)
  const useHttps = /^https:\/\//i.test(process.env.PUBLIC_ORIGIN || '');
  const secure = useHttps ? 'Secure; ' : '';
  res.append('Set-Cookie', `khm_admin_route=${encodeURIComponent(value)}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ADMIN_ROUTE_TTL_MS / 1000)}; ${secure}`);
}

export function hasAdminRoute(req) {
  const header = req.headers.cookie || '';
  let value = '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === 'khm_admin_route') {
      try { value = decodeURIComponent(part.slice(i + 1).trim()); } catch { return false; }
      break;
    }
  }
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return false;
  const exp = Number(value.slice(0, dot));
  if (!Number.isSafeInteger(exp) || exp < Date.now()) return false;
  return timingSafeEqualStr(value.slice(dot + 1), adminRouteSignature(exp));
}

export function readSession(req) {
  const header = req.headers.cookie || '';
  let sid;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    if (k === 'sid') {
      try { sid = decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
      break;
    }
  }
  if (!sid) return null;
  const dot = sid.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = sid.slice(0, dot);
  const sig = sid.slice(dot + 1);
  if (!timingSafeEqualStr(sig, sign(id))) return null;
  const s = store.get(id);
  if (!s || s.exp < Date.now()) {
    store.delete(id);
    return null;
  }
  // Return the LIVE object so mutations (e.g. session.userId on login) persist.
  return Object.assign(s, { id });
}

export function touchSession(s) {
  const now = Date.now();
  if (s.exp - now < IDLE_MS) {
    s.exp = now + SESS_TTL_MS;
  }
}

export function createSession() {
  cleanup();
  while (store.size >= MAX_SESSIONS) {
    const oldest = store.keys().next().value;
    if (!oldest) break;
    store.delete(oldest);
  }
  const id = randHex(24);
  const s = { userId: null, csrf: randHex(24), exp: Date.now() + SESS_TTL_MS, ip: null };
  store.set(id, s);
  return { id, ...s };
}

export function destroySession(id) {
  store.delete(id);
}

export function cleanup() {
  const now = Date.now();
  for (const [id, s] of store) {
    if (s.exp < now) store.delete(id);
  }
}
setInterval(cleanup, 10 * 60 * 1000);