/**
 * Server-side SEO: absolute URLs, robots.txt and sitemap.xml.
 *
 * The client ships index.html with `https://{{ORIGIN}}` placeholders and a
 * marker-wrapped JSON-LD block. Nothing is guessed at build time — the origin
 * is derived from the live request, so canonical / hreflang / og:url are always
 * correct behind any domain, proxy or preview URL.
 */
import { readFileSync } from 'node:fs';
import { get, all } from './db.js';

const LANGS = ['ar', 'fr', 'en'];
const TOKEN = 'https://{{ORIGIN}}';

export function originOf(req) {
  const proto = req.get('x-forwarded-proto')?.split(',')[0]?.trim()
    || (req.secure ? 'https' : 'http');
  const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host') || 'localhost';
  const safe = String(host).replace(/[^A-Za-z0-9.:[\]-]/g, '');
  return `${proto}://${safe}`;
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  // strip characters that would let a value break out of JSON-LD or XML
  .replace(/[\x00-\x1F\x7F]/g, '');

/** School schema built from the live settings row, so contact data is real.
 *  `lang` is the language actually being served, so a crawler that never runs
 *  JavaScript still gets a JSON-LD that matches the URL it fetched. */
export function schoolJsonLd(origin, lang = 'en') {
  const l = LANGS.includes(lang) ? lang : 'en';
  const site = get('SELECT * FROM site WHERE id = 1') || {};
  const data = {
    '@context': 'https://schema.org',
    '@type': 'School',
    '@id': `${origin}/#school`,
    url: `${origin}/?lang=${l}`,
    name: site[`school_name_${l}`] || site.school_name_en || 'Mohamed Khemisti High School',
    alternateName: [
      site.school_name_ar || 'ثانوية محمد خميستي',
      site.school_name_fr || 'Lycée Mohamed Khémisti',
    ].filter(Boolean),
    inLanguage: [l],
    description: site.about_en || undefined,
    image: `${origin}${site.photo || '/img/hero.jpg'}`,
    ...(site.logo ? { logo: `${origin}${site.logo}` } : {}),
    ...(site.email ? { email: site.email } : {}),
    ...(site.phone ? { telephone: site.phone } : {}),
    ...(site.facebook ? { sameAs: [site.facebook] } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.address_en || site.address_fr || site.address_ar || 'Chelghoum Laid',
      addressLocality: 'Chelghoum Laid',
      addressRegion: 'Mila',
      addressCountry: 'DZ',
    },
  };
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  if (data.address) {
    for (const k of Object.keys(data.address)) if (!data.address[k]) delete data.address[k];
  }
  return JSON.stringify(data).replace(/[\x00-\x1F\x7F]/g, '');
}

const LD_BLOCK = /<!--LD_START-->[\s\S]*?<!--LD_END-->/;

/* The same locale files the client uses, read once at boot. They let the server
   render <html lang>, <title>, the description and the Open Graph tags in the
   requested language, so a link preview or a crawler that never runs JavaScript
   still sees the Arabic or French page it asked for. */
const LOCALES = {};
for (const l of LANGS) {
  try {
    LOCALES[l] = JSON.parse(
      readFileSync(new URL(`../client/src/locales/${l}.json`, import.meta.url), 'utf8')
    );
  } catch { /* not shipped — fall back to the strings already in the shell */ }
}

const setAttr = (html, re, value) => html.replace(re, (m, a, b) => `${a}${esc(value)}${b}`);

/** Rewrites the shipped shell into a finished, absolute-URL document. */
export function renderDocument(html, origin, lang = 'en') {
  const l = LANGS.includes(lang) ? lang : 'en';
  const dir = l === 'ar' ? 'rtl' : 'ltr';
  const loc = LOCALES[l]?.meta || {};
  const site = (() => { try { return get('SELECT * FROM site WHERE id = 1') || {}; } catch { return {}; } })();
  const title = loc.title || site[`school_name_${l}`] || site.school_name_en || 'Mohamed Khemisti High School';
  const description = loc.description || '';
  const pageUrl = `${origin}/?lang=${l}`;

  let ld;
  try {
    ld = schoolJsonLd(origin, l);
  } catch {
    ld = '{"@context":"https://schema.org","@type":"School"}';
  }

  let out = html
    .replaceAll(TOKEN, esc(origin))
    .replace(LD_BLOCK, `<script type="application/ld+json" id="ld-school">${ld}</script>`)
    .replace(/<html\b[^>]*>/, `<html lang="${l}" dir="${dir}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${esc(pageUrl)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(pageUrl)}$2`)
    .replace(/(<meta property="og:locale" content=")[^"]*(")/, `$1khm_${l}$2`);

  out = setAttr(out, /(<meta name="description" content=")[^"]*(")/, description);
  out = setAttr(out, /(<meta property="og:title" content=")[^"]*(")/, title);
  out = setAttr(out, /(<meta property="og:site_name" content=")[^"]*(")/, title);
  out = setAttr(out, /(<meta property="og:image:alt" content=")[^"]*(")/, title);
  out = setAttr(out, /(<meta name="twitter:title" content=")[^"]*(")/, title);
  if (description) {
    out = setAttr(out, /(<meta property="og:description" content=")[^"]*(")/, description);
    out = setAttr(out, /(<meta name="twitter:description" content=")[^"]*(")/, description);
  }
  return out;
}

export function robotsTxt(origin) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    'User-agent: GPTBot',
    'Disallow: /',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

const today = () => new Date().toISOString().slice(0, 10);

function lastmod(table) {
  try {
    return get(`SELECT MAX(updated_at) AS d FROM ${table}`)?.d?.slice(0, 10) || today();
  } catch {
    return today();
  }
}

/** One entry per language, each with the full hreflang set. */
export function sitemapXml(origin) {
  const lastmods = [
    lastmod('announcements'), lastmod('news'), lastmod('programs'),
    lastmod('exams'), lastmod('resources'), lastmod('schedule'),
  ].sort().pop() || today();

  const alternates = LANGS
    .map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${esc(origin)}/?lang=${l}" />`)
    .join('\n');

  const urls = LANGS.map((l) => [
    '  <url>',
    `    <loc>${esc(origin)}/?lang=${l}</loc>`,
    `    <lastmod>${lastmods}</lastmod>`,
    '    <changefreq>daily</changefreq>',
    '    <priority>1.0</priority>',
    alternates,
    '    <xhtml:link rel="alternate" hreflang="x-default" href="' + esc(origin) + '/?lang=en" />',
    '  </url>',
  ].join('\n')).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

/** Cheap readiness probe used by the boot check. */
export function contentCount() {
  try {
    return all('SELECT COUNT(*) AS c FROM announcements')[0]?.c ?? 0;
  } catch {
    return 0;
  }
}
