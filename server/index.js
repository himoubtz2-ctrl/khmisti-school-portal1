// Load .env first (shared loader; db.js also imports it so the seed sees it)
import './env.js';
import { existsSync, unlinkSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';

const PORT = Number(process.env.PORT || 5000);
const isProd = process.env.NODE_ENV === 'production';
const useHttpsCsp = isProd && /^https:\/\//i.test(process.env.PUBLIC_ORIGIN || '');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY || 0) === 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", 'https://www.facebook.com'],
      frameAncestors: ["'none'"],
      ...(useHttpsCsp ? { upgradeInsecureRequests: [] } : {}),
    },
  } : false,
  crossOriginEmbedderPolicy: false,
  hsts: false, // enable behind https in production
}));

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

// ---- uploads (public files: images + PDFs) ----
import { uploadsDir, SAFE_NAME } from './uploads.js';
app.use('/uploads', (req, res, next) => {
  const name = req.path.replace(/^\/+/, '');
  if (!SAFE_NAME.test(name)) return res.status(404).end();
  next();
}, express.static(uploadsDir, { maxAge: '1h', index: false }));

// ---- API ----
import publicRouter from './routes/public.js';
import { trackRouter, adminAnalyticsRouter } from './routes/analytics.js';
import { authRouter, adminRouter } from './routes/admin.js';
import { attachSession, adminKey, authRequired, csrfRequired } from './middleware.js';
import { grantAdminRoute, hasAdminRoute, readSession } from './sessions.js';
import { timingSafeEqualStr } from './security.js';
import { startAnalyticsCleanup } from './analytics.js';

app.use('/api/track', attachSession, trackRouter);
app.use('/api', attachSession, publicRouter);
app.use('/api/auth', attachSession, adminKey, authRouter);
app.use('/api/admin/analytics', attachSession, adminKey, authRequired, adminAnalyticsRouter);
app.use('/api/admin', attachSession, adminKey, authRequired,
  (req, res, next) => (req.method === 'GET' ? next() : csrfRequired(req, res, next)),
  adminRouter);

// The document route is stealth as well: a missing/invalid key gets a real
// 404 before the SPA is served. A short-lived HttpOnly route cookie lets the
// SPA remove the key from the address bar without breaking a refresh.
app.get(/^\/admin(?:\/.*)?$/, (req, res, next) => {
  if (!isProd) return next();
  const supplied = typeof req.query.k === 'string' ? req.query.k : '';
  if (process.env.ADMIN_KEY && timingSafeEqualStr(supplied, process.env.ADMIN_KEY)) {
    grantAdminRoute(res);
    return next();
  }
  if (hasAdminRoute(req)) return next();
  // A logged-in session may outlive the short-lived route cookie during a
  // rolling restart; the API remains independently key-gated.
  if (readSession(req)?.userId) return next();
  return res.status(404).type('html').send('<!doctype html><title>Not Found</title><h1>404</h1>');
});

// ---- serve built client in production ----
import { originOf, renderDocument, robotsTxt, sitemapXml } from './seo.js';
if (isProd) {
  const dist = path.join(__dirname, '..', 'client', 'dist');
  if (existsSync(dist)) {
    // SEO endpoints must be live and cheap; no caching so content stays fresh.
    app.get('/robots.txt', (req, res) => {
      res.type('text/plain; charset=utf-8').set('Cache-Control', 'public, max-age=3600').send(robotsTxt(originOf(req)));
    });
    app.get('/sitemap.xml', (req, res) => {
      res.type('application/xml; charset=utf-8').set('Cache-Control', 'public, max-age=3600').send(sitemapXml(originOf(req)));
    });

    app.use(express.static(dist, { maxAge: '1h', index: false }));

    const shellPath = path.join(dist, 'index.html');
    let shell = readFileSync(shellPath, 'utf8');
    let shellMtime = statSync(shellPath).mtimeMs;
    app.get(/^(?!\/api\/|\/uploads\/).*/, (req, res) => {
      if (path.extname(req.path)) return res.status(404).end();
      // pick up a rebuild without a restart (rolling deploys, local testing)
      try {
        const mtime = statSync(shellPath).mtimeMs;
        if (mtime !== shellMtime) {
          shell = readFileSync(shellPath, 'utf8');
          shellMtime = mtime;
        }
      } catch {}
      // absolute URLs in canonical/hreflang/og must match the live origin, and
      // the JSON-LD has to describe the language this URL actually serves
      const lang = String(req.query.lang || '');
      const html = renderDocument(shell, originOf(req), /^(ar|fr|en)$/.test(lang) ? lang : 'en');
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html').send(html);
    });
  }
}

// ---- 404 + errors ----
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'upload_error';
    if (req.file) removeQuiet(req.file.path);
    return res.status(400).json({ error: msg });
  }
  if (err.message === 'PDF_ONLY' || err.message === 'IMAGE_ONLY') {
    return res.status(400).json({ error: err.message.toLowerCase() });
  }
  console.error('[error]', err.stack || err.message);
  if (res.headersSent) return res.destroy();
  res.status(500).json({ error: 'server_error' });
});

function removeQuiet(p) { try { unlinkSync(p); } catch {} }

// ---- boot banner ----
import { ready } from './db.js';
ready.then(() => {
  if (isProd) {
    const dist = path.join(__dirname, '..', 'client', 'dist');
    if (!existsSync(path.join(dist, 'index.html'))) {
      console.error('[startup] client/dist is missing. Run `npm run build` before starting in production.');
      process.exit(1);
    }
  }
  startAnalyticsCleanup();
  app.listen(PORT, () => {
    console.log(`\n\x1b[36mKhmisti High School — server running on http://localhost:${PORT}\x1b[0m`);
    if (!isProd) {
      console.log(`Admin URL: http://localhost:${PORT}/admin?k=${process.env.ADMIN_KEY || 'not-configured'}`);
      console.log('Admin credentials are stored in server/.env (never include that file in a ZIP).');
    }
  });
});