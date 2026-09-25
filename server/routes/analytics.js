import { Router } from 'express';
import { analyticsLimiter } from '../middleware.js';
import { recordEvent, analyticsReport, privacyOptOut, EVENT_TYPES } from '../analytics.js';

export const trackRouter = Router();

// No CSRF token and no cookie are required: analytics never receives an
// identity token. A hidden field silently absorbs simple form spam.
trackRouter.post('/', analyticsLimiter, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { type, target, language, website } = req.body || {};
  if (website) return res.status(204).end();
  if (privacyOptOut(req)) return res.status(204).end();
  if (!EVENT_TYPES.includes(type) || typeof target !== 'string' || target.length > 80 || !['ar', 'fr', 'en'].includes(language)) {
    return res.status(400).json({ error: 'invalid_event' });
  }
  recordEvent(req, { type, target, language });
  return res.status(204).end();
});

export const adminAnalyticsRouter = Router();

adminAnalyticsRouter.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(analyticsReport(req.query.days));
});
