import { Router } from 'express';
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { get, all, run } from '../db.js';
import { sanitizeText, validEmail, validPassword, hashPassword, verifyPassword } from '../security.js';
import { json, asyncH, loginLimiter, csrfRequired, authRequired } from '../middleware.js';
import { createSession, setSessionCookie, readSession, destroySession } from '../sessions.js';
import { pdfUpload, imgUpload, filePath, uploadsDir, validFileSignature } from '../uploads.js';
import { mailStatus, notifyNewMessage } from '../mailer.js';

// ============================ AUTH ============================
export const authRouter = Router();

authRouter.post('/login', loginLimiter, csrfRequired, asyncH(async (req, res) => {
  const { username, password } = req.body || {};
  const u = sanitizeText(username, 64);
  const p = typeof password === 'string' ? password.slice(0, 200) : '';
  const row = get('SELECT * FROM users WHERE username = ?', u);
  const ok = row && (await verifyPassword(p, row.pass_hash));
  if (!ok) return json(res, 401, { error: 'invalid_credentials' });
  req.session.userId = row.id;
  res.json({ ok: true, username: row.username });
}));

authRouter.post('/logout', csrfRequired, (req, res) => {
  destroySession(req.session.id);
  res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.append('Set-Cookie', `khm_admin_route=; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=0; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}`);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) return json(res, 401, { error: 'unauthorized' });
  const row = get('SELECT id, username FROM users WHERE id = ?', req.session.userId);
  res.json({ authenticated: true, username: row ? row.username : '' });
});

authRouter.post('/password', csrfRequired, authRequired, asyncH(async (req, res) => {
  const { current, next } = req.body || {};
  const cur = typeof current === 'string' ? current.slice(0, 200) : '';
  const nw = typeof next === 'string' ? next : '';
  const row = get('SELECT * FROM users WHERE id = ?', req.session.userId);
  if (!row || !(await verifyPassword(cur, row.pass_hash))) return json(res, 401, { error: 'bad_current' });
  if (!validPassword(nw)) return json(res, 400, { error: 'weak_password' });
  const hash = await hashPassword(nw);
  run('UPDATE users SET pass_hash = ? WHERE id = ?', hash, row.id);
  res.json({ ok: true });
}));

// ============================ ADMIN ============================
export const adminRouter = Router();

const fail = (res, code, msg) => {
  const safe = typeof msg === 'string' && /^(bad_|missing_|too_long_|delete_|upload_|server_|save_|weak_|pdf_|image_|media_|not_)[a-z0-9_]{0,55}$/.test(msg) ? msg : 'save_failed';
  json(res, code, { error: safe });
};

function loc(body, name, max = 400) {
  return {
    ar: sanitizeText(body?.[name + '_ar'], max),
    fr: sanitizeText(body?.[name + '_fr'], max),
    en: sanitizeText(body?.[name + '_en'], max),
  };
}
// A translated field needs at least ONE language, not three. Small schools often
// publish in Arabic only, and forcing the other two columns used to leave the
// whole form half empty. The public site falls back to the languages that do
// exist (client/src/pages/Home.jsx `L()`), so a missing translation can never
// render a blank box.
function locOK(v, name) {
  if (!v.ar && !v.fr && !v.en) throw new Error('missing_' + name);
  for (const key of ['ar', 'fr', 'en']) {
    if (Buffer.byteLength(v[key]) > 4000) throw new Error('too_long_' + name);
  }
  return v;
}
function num(v, min, max, dflt = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.round(n)));
}
function str(v, max, dflt = '') {
  const s = sanitizeText(v, max);
  return s === '' ? dflt : s;
}
const CATEGORIES = new Set(['important', 'academic', 'exams', 'activity', 'culture', 'sports', 'general']);
const TRACKS = new Set(['scientific', 'literary', 'languages', 'economics']);
const EXAM_TYPES = new Set(['devoir', 'examen', 'exam']);
const EXAM_STATUSES = new Set(['upcoming', 'done']);
function enumStr(v, allowed, max, dflt = '') {
  const s = str(v, max);
  return allowed.has(s) ? s : dflt;
}

adminRouter.get('/stats', (req, res) => {
  const q = (sql) => get(sql).c;
  const unread = q('SELECT COUNT(*) AS c FROM messages WHERE read = 0');
  res.json({
    announcements: q('SELECT COUNT(*) AS c FROM announcements'),
    news: q('SELECT COUNT(*) AS c FROM news'),
    programs: q('SELECT COUNT(*) AS c FROM programs'),
    schedule: q('SELECT COUNT(*) AS c FROM schedule'),
    exams: q('SELECT COUNT(*) AS c FROM exams'),
    resources: q('SELECT COUNT(*) AS c FROM resources'),
    media: readdirSync(uploadsDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).length,
    messages: q('SELECT COUNT(*) AS c FROM messages'),
    unread,
  });
});

// ---------- announcements ----------
adminRouter.get('/announcements', (req, res) => res.json(all('SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC, id DESC')));
adminRouter.post('/announcements', (req, res) => {
  try {
    const t = locOK(loc(req.body, 'title', 200), 'title');
    const b = locOK(loc(req.body, 'body', 4000), 'body');
    const cat = enumStr(req.body?.category, CATEGORIES, 30, 'general');
    const pinned = num(req.body?.pinned, 0, 1, 0);
    const info = run('INSERT INTO announcements (title_ar,title_fr,title_en,body_ar,body_fr,body_en,category,pinned) VALUES (?,?,?,?,?,?,?,?)',
      t.ar, t.fr, t.en, b.ar, b.fr, b.en, cat, pinned);
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  } catch (e) { return fail(res, 400, e.message); }
});
adminRouter.put('/announcements/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!get('SELECT id FROM announcements WHERE id = ?', id)) return fail(res, 404, 'not_found');
    const t = locOK(loc(req.body, 'title', 200), 'title');
    const b = locOK(loc(req.body, 'body', 4000), 'body');
    const cat = enumStr(req.body?.category, CATEGORIES, 30, 'general');
    const pinned = num(req.body?.pinned, 0, 1, 0);
    run('UPDATE announcements SET title_ar=?,title_fr=?,title_en=?,body_ar=?,body_fr=?,body_en=?,category=?,pinned=?,updated_at=datetime(\'now\') WHERE id=?',
      t.ar, t.fr, t.en, b.ar, b.fr, b.en, cat, pinned, id);
    res.json({ ok: true });
  } catch (e) { return fail(res, 400, e.message); }
});
adminRouter.delete('/announcements/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = run('DELETE FROM announcements WHERE id = ?', id);
  if (!info.changes) return fail(res, 404, 'not_found');
  res.json({ ok: true });
});

// ---------- news ----------
adminRouter.get('/news', (req, res) => res.json(all('SELECT * FROM news ORDER BY created_at DESC, id DESC')));
adminRouter.post('/news', (req, res) => {
  try {
    const t = locOK(loc(req.body, 'title', 200), 'title');
    const b = locOK(loc(req.body, 'body', 4000), 'body');
    const cat = enumStr(req.body?.category, CATEGORIES, 30, 'general');
    const img = str(req.body?.image, 200);
    const info = run('INSERT INTO news (title_ar,title_fr,title_en,body_ar,body_fr,body_en,category,image) VALUES (?,?,?,?,?,?,?,?)',
      t.ar, t.fr, t.en, b.ar, b.fr, b.en, cat, img);
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  } catch (e) { return fail(res, 400, e.message); }
});
adminRouter.put('/news/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!get('SELECT id FROM news WHERE id = ?', id)) return fail(res, 404, 'not_found');
    const t = locOK(loc(req.body, 'title', 200), 'title');
    const b = locOK(loc(req.body, 'body', 4000), 'body');
    const cat = enumStr(req.body?.category, CATEGORIES, 30, 'general');
    const img = str(req.body?.image, 200);
    run('UPDATE news SET title_ar=?,title_fr=?,title_en=?,body_ar=?,body_fr=?,body_en=?,category=?,image=? WHERE id=?',
      t.ar, t.fr, t.en, b.ar, b.fr, b.en, cat, img, id);
    res.json({ ok: true });
  } catch (e) { return fail(res, 400, e.message); }
});
adminRouter.delete('/news/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = run('DELETE FROM news WHERE id = ?', id);
  if (!info.changes) return fail(res, 404, 'not_found');
  res.json({ ok: true });
});

// ---------- programs ----------
adminRouter.get('/programs', (req, res) => res.json(all('SELECT * FROM programs ORDER BY ord ASC, id ASC')));
adminRouter.post('/programs', (req, res) => {
  try {
    const n = locOK(loc(req.body, 'name', 120), 'name');
    const d = locOK(loc(req.body, 'desc', 500), 'desc');
    const track = enumStr(req.body?.track, TRACKS, 30);
    const ord = num(req.body?.ord, 0, 999, 0);
    const info = run('INSERT INTO programs (name_ar,name_fr,name_en,desc_ar,desc_fr,desc_en,track,ord) VALUES (?,?,?,?,?,?,?,?)',
      n.ar, n.fr, n.en, d.ar, d.fr, d.en, track, ord);
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  } catch (e) { return fail(res, 400, e.message); }
});
adminRouter.put('/programs/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!get('SELECT id FROM programs WHERE id = ?', id)) return fail(res, 404, 'not_found');
    const n = locOK(loc(req.body, 'name', 120), 'name');
    const d = locOK(loc(req.body, 'desc', 500), 'desc');
    const track = enumStr(req.body?.track, TRACKS, 30);
    const ord = num(req.body?.ord, 0, 999, 0);
    run('UPDATE programs SET name_ar=?,name_fr=?,name_en=?,desc_ar=?,desc_fr=?,desc_en=?,track=?,ord=? WHERE id=?',
      n.ar, n.fr, n.en, d.ar, d.fr, d.en, track, ord, id);
    res.json({ ok: true });
  } catch (e) { return fail(res, 400, e.message); }
});
adminRouter.delete('/programs/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = run('DELETE FROM programs WHERE id = ?', id);
  if (!info.changes) return fail(res, 404, 'not_found');
  res.json({ ok: true });
});

// ---------- schedule ----------
adminRouter.get('/schedule', (req, res) => res.json(all('SELECT * FROM schedule ORDER BY day ASC, start_time ASC')));
adminRouter.post('/schedule', (req, res) => {
  try {
    const s = locOK(loc(req.body, 'subject', 120), 'subject');
    const level = str(req.body?.level, 20);
    const section = str(req.body?.section, 20);
    const day = num(req.body?.day, 0, 6, 0);
    const st = str(req.body?.start_time, 5);
    const et = str(req.body?.end_time, 5);
    const room = str(req.body?.room, 20);
    if (!level || !st || !et) return fail(res, 400, 'missing_fields');
    const info = run('INSERT INTO schedule (subject_ar,subject_fr,subject_en,level,section,day,start_time,end_time,room) VALUES (?,?,?,?,?,?,?,?,?)',
      s.ar, s.fr, s.en, level, section, day, st, et, room);
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  } catch (e) { return fail(res, 400, e.message); }
});
adminRouter.put('/schedule/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!get('SELECT id FROM schedule WHERE id = ?', id)) return fail(res, 404, 'not_found');
    const s = locOK(loc(req.body, 'subject', 120), 'subject');
    const level = str(req.body?.level, 20);
    const section = str(req.body?.section, 20);
    const day = num(req.body?.day, 0, 6, 0);
    const st = str(req.body?.start_time, 5);
    const et = str(req.body?.end_time, 5);
    const room = str(req.body?.room, 20);
    run('UPDATE schedule SET subject_ar=?,subject_fr=?,subject_en=?,level=?,section=?,day=?,start_time=?,end_time=?,room=? WHERE id=?',
      s.ar, s.fr, s.en, level, section, day, st, et, room, id);
    res.json({ ok: true });
  } catch (e) { return fail(res, 400, e.message); }
});
adminRouter.delete('/schedule/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = run('DELETE FROM schedule WHERE id = ?', id);
  if (!info.changes) return fail(res, 404, 'not_found');
  res.json({ ok: true });
});

// ---------- exams ----------
adminRouter.get('/exams', (req, res) => res.json(all('SELECT * FROM exams ORDER BY exam_date ASC, id ASC')));
adminRouter.post('/exams', (req, res) => {
  try {
    const t = locOK(loc(req.body, 'title', 200), 'title');
    const s = locOK(loc(req.body, 'subject', 120), 'subject');
    const level = str(req.body?.level, 20);
    const type = enumStr(req.body?.exam_type, EXAM_TYPES, 20, 'devoir');
    const date = str(req.body?.exam_date, 20);
    const room = str(req.body?.room, 20);
    const status = enumStr(req.body?.status, EXAM_STATUSES, 20, 'upcoming');
    if (!date) return fail(res, 400, 'missing_date');
    const info = run('INSERT INTO exams (title_ar,title_fr,title_en,subject_ar,subject_fr,subject_en,level,exam_type,exam_date,room,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      t.ar, t.fr, t.en, s.ar, s.fr, s.en, level, type, date, room, status);
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  } catch (e) { return fail(res, 400, e.message); }
});
adminRouter.put('/exams/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!get('SELECT id FROM exams WHERE id = ?', id)) return fail(res, 404, 'not_found');
    const t = locOK(loc(req.body, 'title', 200), 'title');
    const s = locOK(loc(req.body, 'subject', 120), 'subject');
    const level = str(req.body?.level, 20);
    const type = enumStr(req.body?.exam_type, EXAM_TYPES, 20, 'devoir');
    const date = str(req.body?.exam_date, 20);
    const room = str(req.body?.room, 20);
    const status = enumStr(req.body?.status, EXAM_STATUSES, 20, 'upcoming');
    run('UPDATE exams SET title_ar=?,title_fr=?,title_en=?,subject_ar=?,subject_fr=?,subject_en=?,level=?,exam_type=?,exam_date=?,room=?,status=? WHERE id=?',
      t.ar, t.fr, t.en, s.ar, s.fr, s.en, level, type, date, room, status, id);
    res.json({ ok: true });
  } catch (e) { return fail(res, 400, e.message); }
});
adminRouter.delete('/exams/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = run('DELETE FROM exams WHERE id = ?', id);
  if (!info.changes) return fail(res, 404, 'not_found');
  res.json({ ok: true });
});

// ---------- resources ----------
adminRouter.get('/resources', (req, res) => res.json(all('SELECT * FROM resources ORDER BY created_at DESC, id DESC')));
adminRouter.post('/resources', pdfUpload.single('file'), (req, res) => {
  try {
    const t = locOK(loc(req.body, 'title', 200), 'title');
    const s = locOK(loc(req.body, 'subject', 120), 'subject');
    const level = str(req.body?.level, 20);
    if (!req.file) return fail(res, 400, 'file_required');
    if (!validFileSignature(req.file.path, 'pdf')) {
      try { unlinkSync(req.file.path); } catch {}
      return fail(res, 400, 'pdf_signature_invalid');
    }
    const info = run('INSERT INTO resources (title_ar,title_fr,title_en,subject_ar,subject_fr,subject_en,level,file_name,file_path,size) VALUES (?,?,?,?,?,?,?,?,?,?)',
      t.ar, t.fr, t.en, s.ar, s.fr, s.en, level, req.file.originalname, req.file.filename, req.file.size);
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  } catch (e) {
    if (req.file) { try { unlinkSync(req.file.path); } catch {} }
    return fail(res, 400, e.message === 'PDF_ONLY' ? 'pdf_only' : e.message);
  }
});
adminRouter.put('/resources/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!get('SELECT id FROM resources WHERE id = ?', id)) return fail(res, 404, 'not_found');
    const t = locOK(loc(req.body, 'title', 200), 'title');
    const s = locOK(loc(req.body, 'subject', 120), 'subject');
    const level = str(req.body?.level, 20);
    if (!level) return fail(res, 400, 'missing_fields');
    run('UPDATE resources SET title_ar=?,title_fr=?,title_en=?,subject_ar=?,subject_fr=?,subject_en=?,level=? WHERE id=?',
      t.ar, t.fr, t.en, s.ar, s.fr, s.en, level, id);
    res.json({ ok: true });
  } catch (e) { return fail(res, 400, e.message); }
});

adminRouter.delete('/resources/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = get('SELECT * FROM resources WHERE id = ?', id);
  if (!row) return fail(res, 404, 'not_found');
  const full = filePath(row.file_path);
  if (full && existsSync(full)) { try { unlinkSync(full); } catch {} }
  run('DELETE FROM resources WHERE id = ?', id);
  res.json({ ok: true });
});

// ---------- messages ----------
adminRouter.get('/messages', (req, res) => res.json(all('SELECT * FROM messages ORDER BY created_at DESC, id DESC')));
adminRouter.post('/messages/:id/read', (req, res) => {
  const id = Number(req.params.id);
  const info = run('UPDATE messages SET read = 1 WHERE id = ?', id);
  if (!info.changes) return fail(res, 404, 'not_found');
  res.json({ ok: true });
});
adminRouter.delete('/messages/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = run('DELETE FROM messages WHERE id = ?', id);
  if (!info.changes) return fail(res, 404, 'not_found');
  res.json({ ok: true });
});

// ---------- site settings ----------
adminRouter.get('/site', (req, res) => res.json(get('SELECT * FROM site WHERE id = 1')));
adminRouter.put('/site', (req, res) => {
  const b = req.body || {};
  const fields = {
    school_name_ar: sanitizeText(b.school_name_ar, 150),
    school_name_fr: sanitizeText(b.school_name_fr, 150),
    school_name_en: sanitizeText(b.school_name_en, 150),
    welcome_ar: sanitizeText(b.welcome_ar, 1200),
    welcome_fr: sanitizeText(b.welcome_fr, 1200),
    welcome_en: sanitizeText(b.welcome_en, 1200),
    address_ar: sanitizeText(b.address_ar, 300),
    address_fr: sanitizeText(b.address_fr, 300),
    address_en: sanitizeText(b.address_en, 300),
    phone: sanitizeText(b.phone, 40),
    email: sanitizeText(b.email, 120),
    facebook: sanitizeText(b.facebook, 300),
    logo: sanitizeText(b.logo, 200),
    photo: sanitizeText(b.photo, 200),
  };
  if (!fields.school_name_ar || !fields.school_name_fr || !fields.school_name_en) return fail(res, 400, 'missing_school_name');
  if (!fields.welcome_ar || !fields.welcome_fr || !fields.welcome_en) return fail(res, 400, 'missing_welcome');
  if (fields.email && !validEmail(fields.email)) return fail(res, 400, 'bad_email');
  run(`UPDATE site SET school_name_ar=?,school_name_fr=?,school_name_en=?,welcome_ar=?,welcome_fr=?,welcome_en=?,
        address_ar=?,address_fr=?,address_en=?,phone=?,email=?,facebook=?,logo=?,photo=?,updated_at=datetime('now') WHERE id=1`,
    ...Object.values(fields));
  res.json({ ok: true, site: get('SELECT * FROM site WHERE id = 1') });
});

// ---------- media (site images) ----------
adminRouter.get('/media', (req, res) => {
  const files = readdirSync(uploadsDir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort()
    .map((f) => {
      const full = filePath(f);
      let size = 0;
      try { size = full ? statSync(full).size : 0; } catch {}
      return { name: f, url: '/uploads/' + f, size };
    });
  res.json(files);
});
adminRouter.post('/media', imgUpload.single('file'), (req, res) => {
  if (!req.file) return fail(res, 400, 'file_required');
  if (!validFileSignature(req.file.path, 'image')) {
    try { unlinkSync(req.file.path); } catch {}
    return fail(res, 400, 'image_signature_invalid');
  }
  res.json({ ok: true, name: req.file.filename, url: '/uploads/' + req.file.filename });
});
adminRouter.delete('/media/:name', (req, res) => {
  const full = filePath(req.params.name);
  if (!full) return fail(res, 400, 'bad_name');
  if (!/\.(jpe?g|png|webp)$/i.test(req.params.name)) return fail(res, 400, 'bad_name');
  if (!existsSync(full)) return fail(res, 404, 'not_found');
  const url = '/uploads/' + req.params.name;
  const inUse = get(
    'SELECT 1 AS used FROM site WHERE logo = ? OR photo = ? UNION ALL SELECT 1 AS used FROM news WHERE image = ? LIMIT 1',
    url, url, url
  );
  if (inUse) return fail(res, 409, 'media_in_use');
  try { unlinkSync(full); } catch (e) { return fail(res, 500, 'delete_failed'); }
  res.json({ ok: true });
});

// Mail status (admin panel only)
adminRouter.get('/mail/status', (req, res) => res.json(mailStatus()));

// Reply by email: generates mailto: link with full context for the admin's client
adminRouter.post('/messages/:id/reply', asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const row = get('SELECT * FROM messages WHERE id = ?', id);
  if (!row) return fail(res, 404, 'not_found');
  const { subject, body } = req.body || {};
  const baseSubject = row.subject || '(no subject)';
  const replySubject = (subject && subject.trim()) ? subject.trim() : `Re: ${baseSubject}`;
  const quote = (row.body || '').split('\n').map(l => '> ' + l).join('\n');
  const replyBody = (body && body.trim()) ? body.trim() : `On ${new Date(row.created_at).toLocaleString()} ${row.name} <${row.email}> wrote:\n${quote}`;
  const mailto = `mailto:${encodeURIComponent(row.email)}?subject=${encodeURIComponent(replySubject)}&body=${encodeURIComponent(replyBody)}`;
  res.json({ ok: true, mailto });
}));

export default adminRouter;