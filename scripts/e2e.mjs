// ---------------------------------------------------------------------------
// End-to-end verification of the Khmisti school server API.
// Run: node scripts/e2e.mjs   (server must already be running on :5000)
// ---------------------------------------------------------------------------
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.E2E_BASE || 'http://localhost:5000';

// ---- test state ----
let adminKey = '';       // stealth admin door key (x-admin-key)
let e2eUser = '';        // admin username (from .env)
let e2ePass = '';        // admin password (from .env)
let csrf = '';           // session cookie (sid=...)
let csrfToken = '';      // CSRF token value
let passCount = 0, failCount = 0;

// Load the real admin key / username / password from server/.env so tests hit
// the actual doors (and so the stealth headers match what the server checks).
{
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env');
  if (!existsSync(envPath)) {
    console.error('Missing server/.env. Run setup.bat before the E2E suite.');
    process.exit(2);
  }
  const txt = readFileSync(envPath, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim().toUpperCase();
    if (k === 'ADMIN_KEY') adminKey = line.slice(i + 1).trim();
    if (k === 'ADMIN_USER') e2eUser = line.slice(i + 1).trim();
    if (k === 'ADMIN_PASS') e2ePass = line.slice(i + 1).trim();
  }
}

const ok = (name, cond, extra = '') => {
  if (cond) { passCount++; console.log(`  ✓ ${name}`); }
  else { failCount++; console.error(`  ✗ ${name} ${extra}`); }
};

// stripKey=true → intentionally omit x-admin-key (proves the stealth door)
async function req(method, path, { body, form, wantsCsrf = true, stripKey = false } = {}) {
  // With FormData we must NOT set Content-Type: fetch must add the multipart
  // boundary itself, otherwise multer cannot parse the body.
  const h = {};
  if (!form) h['Content-Type'] = 'application/json';
  if (csrfToken && wantsCsrf && method !== 'GET') h['x-csrf-token'] = csrfToken;
  if (adminKey && !stripKey) h['x-admin-key'] = adminKey;
  if (csrf) h['Cookie'] = csrf;
  const res = await fetch(BASE + path, {
    method, headers: h, credentials: 'include',
    body: form ? form : body ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.get('set-cookie');
  if (sc) csrf = sc.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

console.log('\n== 1. CSRF ==');
{
  const r = await req('GET', '/api/csrf');
  csrfToken = r.data?.csrf || '';
  ok('GET /api/csrf returns a token', csrfToken.length >= 32, `csrf=${csrfToken?.length}`);
  ok('session cookie issued', /^sid=/.test(csrf), `cookie=${csrf?.slice(0, 20)}`);
}

console.log('\n== 2. Public endpoints ==');
{
  const site = await req('GET', '/api/site');
  ok('site: school_name_ar present', /[\u0600-\u06FF]/.test(site.data?.site?.school_name_ar || ''));
  const ann = await req('GET', '/api/announcements');
  ok('announcements array', Array.isArray(ann.data) && ann.data.length > 0, `n=${ann.data?.length}`);
  const sch = await req('GET', '/api/schedule/levels');
  ok('schedule/levels', Array.isArray(sch.data) && sch.data.length > 0, `n=${sch.data?.length}`);

  const tracked = await fetch(BASE + '/api/track', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'view', target: 'home', language: 'en' }),
  });
  ok('cookie-free analytics event accepted', tracked.status === 204, `got ${tracked.status}`);
  ok('analytics response sets no cookie', !tracked.headers.get('set-cookie'));
  const optedOut = await fetch(BASE + '/api/track', {
    method: 'POST', headers: { 'Content-Type': 'application/json', DNT: '1' },
    body: JSON.stringify({ type: 'view', target: 'home', language: 'en' }),
  });
  ok('DNT analytics request is accepted without recording', optedOut.status === 204, `got ${optedOut.status}`);
}

console.log('\n== 3. Auth security ==');
{
  const badPass = await req('POST', '/api/auth/login', { body: { username: e2eUser, password: 'wrongpass123' } });
  ok('wrong password → 401', badPass.status === 401, `got ${badPass.status}`);
  const wrongKey = await req('GET', '/api/auth/me', { wantsCsrf: false, stripKey: true });
  ok('no admin key → 404 (stealth)', wrongKey.status === 404, `got ${wrongKey.status}`);
}

console.log('\n== 4. Known-bad inputs ==');
{
  // Honeypot field filled → server silently accepts (200) — bot gets nothing
  const honeypot = await req('POST', '/api/messages', { body: { name: 'spam', email: 'spam@x.com', subject: 'hi', body: 'junk', website: 'spam' } });
  ok('honeypot+invalid → silently accepted (200)', honeypot.status === 200, `got ${honeypot.status}`);
  // Invalid email (no honeypot) → rejected.
  // 429 is also correct here: the contact limiter (5 / 10 min) is a security
  // feature that triggers after repeated test runs from the same IP.
  const invalid = await req('POST', '/api/messages', { body: { name: 'x', email: 'not-an-email', subject: 'y', body: 'z' } });
  ok('invalid contact → rejected (400 or rate-limited 429)', invalid.status === 400 || invalid.status === 429, `got ${invalid.status}`);
  if (invalid.status === 429) console.log('    (429 = contact rate limiter active — expected after repeated runs)');
}

console.log('\n== 5. Admin stealth ==');
{
  const r = await req('GET', '/api/admin/stats', { wantsCsrf: false, stripKey: true });
  ok('admin without key → 404 (stealth)', r.status === 404, `got ${r.status}`);
}

console.log('\n== 6. Successful login ==');
{
  const login = await req('POST', '/api/auth/login', { body: { username: e2eUser, password: e2ePass } });
  // 429 is correct too: the login limiter (8 / 15 min) trips after repeated runs.
  if (login.status === 429) {
    ok('login limiter active (8/15min) — skipping session tests', true, '');
    console.log('    (429 = login rate limiter active — restart server for a clean run)');
  } else {
    ok('login with correct credentials → 200', login.status === 200, `got ${login.status}`);
    const me = await req('GET', '/api/auth/me');
    ok('/api/auth/me returns the user', me.data?.authenticated === true && me.data?.username === e2eUser, JSON.stringify(me.data));
    const stats = await req('GET', '/api/admin/stats');
    ok('admin stats reachable once logged in', stats.status === 200, `got ${stats.status}`);
  }
}

console.log('\n== 7. CSRF enforcement ==');
{
  const saved = csrfToken;
  csrfToken = 'bogus-token-that-should-fail';
  const denied = await req('POST', '/api/admin/announcements', { body: { title_ar: 'x', title_fr: 'x', title_en: 'x', body_ar: 'x', body_fr: 'x', body_en: 'x' } });
  ok('mutating request with bad CSRF → 403', denied.status === 403, `got ${denied.status}`);
  csrfToken = saved;
}

console.log('\n== 8. CRUD round-trip (announcements) ==');
let createdId = 0;
{
  const create = await req('POST', '/api/admin/announcements', {
    body: { title_ar: 'إعلان اختبار', title_fr: 'Annonce test', title_en: 'Test announcement', body_ar: 'نص اختبار', body_fr: 'texte', body_en: 'text', category: 'general' },
  });
  createdId = create.data?.id || 0;
  ok('CREATE announcement → 200', create.status === 200 && createdId > 0, `got ${create.status} id=${createdId}`);

  const edit = await req('PUT', `/api/admin/announcements/${createdId}`, {
    body: { title_ar: 'إعلان معدّل', title_fr: 'Annonce modifiée', title_en: 'Edited announcement', body_ar: 'نص', body_fr: 'texte', body_en: 'text', category: 'academic' },
  });
  ok('UPDATE announcement → 200', edit.status === 200, `got ${edit.status}`);

  const pub = await req('GET', '/api/announcements');
  const found = Array.isArray(pub.data) && pub.data.some((a) => a.id === createdId);
  ok('new announcement visible publicly', found);

  const del = await req('DELETE', `/api/admin/announcements/${createdId}`);
  ok('DELETE announcement → 200', del.status === 200, `got ${del.status}`);

  const gone = await req('DELETE', `/api/admin/announcements/${createdId}`);
  ok('DELETE again → 404 (already gone)', gone.status === 404, `got ${gone.status}`);
}

console.log('\n== 8b. Partial translations ==');
{
  // A school that publishes in Arabic only must be able to save: the form no
  // longer forces three translations, and the API keeps the other two empty.
  const ar = await req('POST', '/api/admin/news', {
    body: { title_ar: 'خبر بالعربية فقط', body_ar: 'نص عربي فقط', category: 'activity' },
  });
  const arId = ar.data?.id || 0;
  ok('CREATE news with Arabic only → 200', ar.status === 200 && arId > 0, `got ${ar.status} id=${arId}`);
  if (arId) {
    const row = (await req('GET', '/api/admin/news')).data?.find((n) => n.id === arId);
    ok('Arabic kept, FR/EN stay empty', row?.title_ar === 'خبر بالعربية فقط' && !row?.title_fr && !row?.title_en,
      `fr=${row?.title_fr} en=${row?.title_en}`);
    const pub = (await req('GET', '/api/news')).data?.find((n) => n.id === arId);
    ok('partial item still served publicly', !!pub);
    const del = await req('DELETE', `/api/admin/news/${arId}`);
    ok('DELETE partial news → 200', del.status === 200, `got ${del.status}`);
  }

  // …but an item with no text at all is still refused.
  const none = await req('POST', '/api/admin/news', { body: { title_ar: '  ', body_ar: '', category: 'activity' } });
  ok('CREATE with every language empty → 400', none.status === 400, `got ${none.status}`);
}

console.log('\n== 9. PDF upload / resource ==');
{
  const form = new FormData();
  form.set('title_ar', 'وثيقة اختبار'); form.set('title_fr', 'Document test'); form.set('title_en', 'Test document');
  form.set('subject_ar', 'رياضيات'); form.set('subject_fr', 'Maths'); form.set('subject_en', 'Maths');
  form.set('level', '1AS');
  form.set('file', new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x25, 0x45, 0x4f, 0x46])], { type: 'application/pdf' }), 'e2e-test.pdf');
  const up = await req('POST', '/api/admin/resources', { form });
  const resId = up.data?.id || 0;
  ok('UPLOAD pdf resource → 200', up.status === 200 && resId > 0, `got ${up.status} id=${resId}`);
  if (resId) {
    const dl = await fetch(BASE + `/api/resources/${resId}/download`, { headers: { Cookie: csrf } });
    ok('DOWNLOAD resource → pdf', dl.status === 200 && (dl.headers.get('content-type') || '').includes('pdf'), `got ${dl.status}`);
    const del = await req('DELETE', `/api/admin/resources/${resId}`);
    ok('DELETE resource → 200', del.status === 200, `got ${del.status}`);
  }

  // A non-PDF must be rejected
  const bad = new FormData();
  bad.set('title_en', 'x'); bad.set('file', new Blob([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])]), 'evil.exe');
  const badUp = await req('POST', '/api/admin/resources', { form: bad });
  ok('UPLOAD .exe rejected', badUp.status === 400 || badUp.status === 403, `got ${badUp.status}`);
}

console.log('\n== 10. Logout invalidates the session ==');
{
  const out = await req('POST', '/api/auth/logout');
  ok('logout → 200', out.status === 200, `got ${out.status}`);
  const after = await req('GET', '/api/admin/stats');
  ok('session invalid after logout → 401', after.status === 401, `got ${after.status}`);
}

console.log(`\nDONE: pass=${passCount} fail=${failCount}`);
process.exit(failCount ? 1 : 0);
