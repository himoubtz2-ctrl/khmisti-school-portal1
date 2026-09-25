import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export const BCRYPT_ROUNDS = 12;

// ---------- strings ----------
export function sanitizeText(s, max = 5000) {
  if (typeof s !== 'string') return '';
  let t = s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // control chars
    .replace(/<\s*\/?\s*(script|iframe|object|embed|style|link|meta|form)\b[^>]*>/gi, '')
    .replace(/\u200B/g, '')
    .trim();
  if (t.length > max) t = t.slice(0, max);
  return t;
}

export function validEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
}

export function validPassword(p) {
  return typeof p === 'string' && p.length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p);
}

export function validUsername(u) {
  return typeof u === 'string' && /^[a-zA-Z0-9_]{3,32}$/.test(u);
}

// ---------- bcrypt ----------
export async function hashPassword(pw) {
  return bcrypt.hash(pw, BCRYPT_ROUNDS);
}
export async function verifyPassword(pw, hash) {
  try {
    return await bcrypt.compare(pw, hash);
  } catch {
    return false;
  }
}

// ---------- crypto ----------
export const randHex = (bytes = 16) => crypto.randomBytes(bytes).toString('hex');
export const randB64 = (bytes = 8) => crypto.randomBytes(bytes).toString('base64url');

export function hmac(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex').slice(0, 32);
}

export function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}