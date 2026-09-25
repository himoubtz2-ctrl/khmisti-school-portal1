import { Router } from 'express';
import { get, all, run } from '../db.js';
import { sanitizeText, validEmail } from '../security.js';
import { json, contactLimiter, downloadLimiter, csrfRequired, csrfLimiter } from '../middleware.js';
import { createSession, setSessionCookie } from '../sessions.js';
import { filePath } from '../uploads.js';
import { createReadStream, statSync } from 'node:fs';
import { recordResourceDownload } from '../analytics.js';
import { notifyNewMessage } from '../mailer.js';

const r = Router();

r.get('/health', (req, res) => res.json({ ok: true }));

// CSRF token for any visitor (contact form / login page)
r.get('/csrf', csrfLimiter, (req, res) => {
  const s = req.session || createSession();
  if (!req.session) setSessionCookie(res, s.id);
  res.json({ csrf: s.csrf });
});

r.get('/site', (req, res) => {
  const site = get('SELECT * FROM site WHERE id = 1');
  const counts = {
    announcements: get('SELECT COUNT(*) AS c FROM announcements').c,
    news: get('SELECT COUNT(*) AS c FROM news').c,
    programs: get('SELECT COUNT(*) AS c FROM programs').c,
    exams: get('SELECT COUNT(*) AS c FROM exams').c,
    resources: get('SELECT COUNT(*) AS c FROM resources').c,
  };
  res.json({ site, counts });
});

r.get('/announcements', (req, res) => {
  res.json(all('SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC, id DESC'));
});

r.get('/news', (req, res) => {
  res.json(all('SELECT * FROM news ORDER BY created_at DESC, id DESC'));
});

r.get('/programs', (req, res) => {
  res.json(all('SELECT * FROM programs ORDER BY ord ASC, id ASC'));
});

r.get('/schedule', (req, res) => {
  const level = sanitizeText(req.query.level, 20);
  if (level) {
    res.json(all('SELECT * FROM schedule WHERE level = ? ORDER BY day ASC, start_time ASC', level));
  } else {
    res.json(all('SELECT * FROM schedule ORDER BY day ASC, start_time ASC'));
  }
});

r.get('/schedule/levels', (req, res) => {
  res.json(all('SELECT DISTINCT level FROM schedule ORDER BY level'));
});

r.get('/exams', (req, res) => {
  res.json(all('SELECT * FROM exams ORDER BY exam_date ASC, id ASC'));
});

r.get('/resources', (req, res) => {
  res.json(all('SELECT id, title_ar, title_fr, title_en, subject_ar, subject_fr, subject_en, level, file_name, size, created_at FROM resources ORDER BY created_at DESC, id DESC'));
});

// Download a resource PDF (public)
r.get('/resources/:id/download', downloadLimiter, (req, res, next) => {
  const id = Number(req.params.id);
  const row = get('SELECT file_path, file_name FROM resources WHERE id = ?', id);
  if (!row) return json(res, 404, { error: 'not_found' });
  const full = filePath(row.file_path);
  const stat = full ? statSync(full, { throwIfNoEntry: false }) : null;
  if (!stat?.isFile()) return json(res, 404, { error: 'not_found' });
  const language = ['ar', 'fr', 'en'].includes(req.query.lang) ? req.query.lang : 'en';
  let counted = false;
  const countAfterDelivery = () => {
    if (counted || req.query.preview === '1' || res.statusCode !== 200 || res.destroyed) return;
    counted = true;
    recordResourceDownload(req, id, language);
  };
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.file_name)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const stream = createReadStream(full);
  stream.on('error', (error) => {
    if (!res.headersSent) next(error);
    else res.destroy(error);
  });
  res.on('finish', countAfterDelivery);
  stream.pipe(res);
});

// Visitor contact message (rate-limited + CSRF-protected)
r.post('/messages', contactLimiter, csrfRequired, (req, res) => {
  const { name, email, subject, body, website } = req.body || {};
  if (website) return json(res, 200, { ok: true }); // honeypot
  const n = sanitizeText(name, 80);
  const e = sanitizeText(email, 120);
  const s = sanitizeText(subject, 160);
  const b = sanitizeText(body, 3000);
  if (!n || !validEmail(e) || !s || !b) return json(res, 400, { error: 'invalid_fields' });
  // Rate limiting handles abuse; do not persist a raw visitor address in
  // contact messages. The column remains for backwards-compatible schemas.
  run('INSERT INTO messages (name, email, subject, body, ip) VALUES (?,?,?,?,?)', n, e, s, b, '');
  // Optional e-mail notification. Fire-and-forget: the visitor already has
  // their 200, and a mail outage can never fail the submission.
  notifyNewMessage({ name: n, email: e, subject: s, body: b });
  res.json({ ok: true });
});

export default r;