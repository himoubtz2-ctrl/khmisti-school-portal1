import rateLimit from 'express-rate-limit';
import { timingSafeEqualStr } from './security.js';
import { readSession, touchSession } from './sessions.js';

export const json = (res, code, data) => res.status(code).json(data);

export function attachSession(req, res, next) {
  req.session = readSession(req);
  if (req.session) touchSession(req.session);
  next();
}

export function authRequired(req, res, next) {
  if (!req.session || !req.session.userId) {
    return json(res, 401, { error: 'unauthorized' });
  }
  next();
}

// The admin area is hidden: without the correct key the server answers 404.
export function adminKey(req, res, next) {
  const key = req.headers['x-admin-key'] || '';
  const ok = process.env.ADMIN_KEY ? timingSafeEqualStr(key, process.env.ADMIN_KEY) : false;
  if (!ok) return json(res, 404, { error: 'not_found' });
  next();
}

export function csrfRequired(req, res, next) {
  if (!req.session) return json(res, 403, { error: 'forbidden' });
  const token = req.headers['x-csrf-token'] || '';
  if (!timingSafeEqualStr(token, req.session.csrf)) {
    return json(res, 403, { error: 'forbidden' });
  }
  next();
}

export const csrfLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
});

export const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'too_many_messages' },
});

// Analytics is cookie-free and has a much higher ceiling than contact/login
// because one legitimate page visit can emit a handful of section events.
export const analyticsLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'too_many_events' },
});

export const downloadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'too_many_downloads' },
});

export function asyncH(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}