import { db, get, all, run } from './db.js';
import { hmac } from './security.js';

export const RETENTION_DAYS = 90;
export const EVENT_TYPES = Object.freeze([
  'view',
  'section_view',
  'lang_switch',
  'resource_download',
  'contact_submit',
  'cta_click',
]);

const LANGUAGES = new Set(['ar', 'fr', 'en']);
const SECTIONS = new Set([
  'home', 'announcements', 'news', 'programs', 'schedule',
  'exams', 'about', 'resources', 'contact',
]);
const CTA_TARGETS = new Set([
  'hero_announcements', 'hero_contact',
  'quick_announcements', 'quick_news', 'quick_schedule',
  'quick_exams', 'quick_resources',
]);

export function privacyOptOut(req) {
  return req.get('DNT') === '1' || req.get('Sec-GPC') === '1';
}

export function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function normalizedTarget(type, target) {
  if (type === 'view') return target === 'home' ? target : '';
  if (type === 'section_view') return SECTIONS.has(target) && target !== 'home' ? target : '';
  if (type === 'lang_switch') return LANGUAGES.has(target) ? target : '';
  if (type === 'resource_download') {
    const match = /^resource:([1-9]\d{0,9})$/.exec(target || '');
    if (!match || !get('SELECT id FROM resources WHERE id = ?', Number(match[1]))) return '';
    return `resource:${Number(match[1])}`;
  }
  if (type === 'contact_submit') return target === 'contact' ? target : '';
  if (type === 'cta_click') return CTA_TARGETS.has(target) ? target : '';
  return '';
}

/**
 * Record one privacy-preserving, daily-unique interaction.
 * No raw IP address is persisted. The rotating visitor hash cannot be linked
 * across days and is used only to prevent a single visitor inflating totals.
 */
export function recordEvent(req, { type, target, language }) {
  if (!EVENT_TYPES.includes(type)) return false;
  if (!LANGUAGES.has(language)) return false;
  const cleanTarget = normalizedTarget(type, target);
  if (!cleanTarget || privacyOptOut(req)) return false;

  const day = utcDay();
  const ip = String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
  const ua = String(req.get('user-agent') || '').slice(0, 300);
  const visitorHash = hmac(`${day}\n${ip}\n${ua}`, process.env.SESSION_SECRET || 'local-development-secret');

  db.exec('BEGIN IMMEDIATE');
  try {
    const inserted = db.prepare(`
      INSERT OR IGNORE INTO analytics_events (day, type, target, language, visitor_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(day, type, cleanTarget, language, visitorHash);

    if (Number(inserted.changes) > 0) {
      db.prepare(`
        INSERT INTO analytics_daily (day, type, target, language, count)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(day, type, target, language)
        DO UPDATE SET count = count + 1, updated_at = datetime('now')
      `).run(day, type, cleanTarget, language);
    }
    db.exec('COMMIT');
    return Number(inserted.changes) > 0;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

export function recordResourceDownload(req, resourceId, language = 'en') {
  if (privacyOptOut(req)) return false;
  const recorded = recordEvent(req, {
    type: 'resource_download',
    target: `resource:${resourceId}`,
    language,
  });
  // The all-time counter counts actual successful download requests. It still
  // follows the same privacy choice: DNT/GPC visitors never increment it.
  run('UPDATE resources SET download_count = download_count + 1 WHERE id = ?', resourceId);
  return recorded;
}

function numberValue(value) {
  return Number(value || 0);
}

function dateSeries(days) {
  const out = [];
  const now = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    out.push(utcDay(new Date(now.getTime() - offset * 86400000)));
  }
  return out;
}

export function analyticsReport(requestedDays = 30) {
  const days = [7, 30, 90].includes(Number(requestedDays)) ? Number(requestedDays) : 30;
  const series = dateSeries(days);
  const cutoff = series[0];
  const today = series[series.length - 1];

  const timelineMap = new Map(series.map((day) => [day, {
    day, total: 0, visitors: 0, views: 0, sections: 0, downloads: 0,
  }]));
  for (const row of all(`
    SELECT day, type, SUM(count) AS count
    FROM analytics_daily
    WHERE day >= ? AND day <= ?
    GROUP BY day, type
  `, cutoff, today)) {
    const point = timelineMap.get(row.day);
    if (!point) continue;
    const count = numberValue(row.count);
    point.total += count;
    if (row.type === 'view') point.views += count;
    if (row.type === 'section_view') point.sections += count;
    if (row.type === 'resource_download') point.downloads += count;
  }
  for (const row of all(`
    SELECT day, COUNT(DISTINCT visitor_hash) AS count
    FROM analytics_events
    WHERE day >= ? AND day <= ?
    GROUP BY day
  `, cutoff, today)) {
    const point = timelineMap.get(row.day);
    if (point) point.visitors = numberValue(row.count);
  }

  const typeCounts = Object.fromEntries(EVENT_TYPES.map((type) => [type, 0]));
  for (const row of all(`
    SELECT type, SUM(count) AS count FROM analytics_daily
    WHERE day >= ? AND day <= ? GROUP BY type
  `, cutoff, today)) typeCounts[row.type] = numberValue(row.count);

  const languageCounts = Object.fromEntries([...LANGUAGES].map((language) => [language, 0]));
  for (const row of all(`
    SELECT language, COUNT(DISTINCT visitor_hash) AS count FROM analytics_events
    WHERE day >= ? AND day <= ? AND type IN ('view', 'section_view')
    GROUP BY language
  `, cutoff, today)) languageCounts[row.language] = numberValue(row.count);

  const sections = all(`
    SELECT target, SUM(count) AS count FROM analytics_daily
    WHERE day >= ? AND day <= ? AND type = 'section_view'
    GROUP BY target ORDER BY count DESC, target ASC LIMIT 8
  `, cutoff, today).map((row) => ({ target: row.target, count: numberValue(row.count) }));

  const resourceRows = all(`
    SELECT id, title_ar, title_fr, title_en, download_count FROM resources
  `);
  const resourceDownloads = new Map();
  for (const row of all(`
    SELECT target, SUM(count) AS count FROM analytics_daily
    WHERE day >= ? AND day <= ? AND type = 'resource_download'
    GROUP BY target
  `, cutoff, today)) {
    const id = Number(String(row.target).replace('resource:', ''));
    resourceDownloads.set(id, numberValue(row.count));
  }
  const resources = resourceRows
    .map((row) => ({
      id: row.id,
      title_ar: row.title_ar,
      title_fr: row.title_fr,
      title_en: row.title_en,
      downloads: resourceDownloads.get(row.id) || 0,
      all_time: numberValue(row.download_count),
    }))
    .filter((row) => row.downloads > 0)
    .sort((a, b) => b.downloads - a.downloads || a.id - b.id)
    .slice(0, 8);

  const totalsRow = get(`
    SELECT
      COUNT(DISTINCT visitor_hash) AS visitors,
      COUNT(*) AS interactions
    FROM analytics_events WHERE day >= ? AND day <= ?
  `, cutoff, today);
  const todayRow = get(`
    SELECT
      COUNT(DISTINCT visitor_hash) AS visitors,
      COUNT(*) AS interactions
    FROM analytics_events WHERE day = ?
  `, today);

  return {
    generated_at: new Date().toISOString(),
    range: { days, from: cutoff, to: today },
    privacy: {
      first_party: true,
      visitor_cookies: false,
      respects_dnt: true,
      respects_gpc: true,
      raw_ip_stored: false,
      daily_rotating_hash: true,
      retention_days: RETENTION_DAYS,
    },
    totals: {
      visitors: numberValue(totalsRow?.visitors),
      visitor_days: numberValue(totalsRow?.visitors),
      interactions: numberValue(totalsRow?.interactions),
      ...typeCounts,
    },
    today: {
      visitors: numberValue(todayRow?.visitors),
      interactions: numberValue(todayRow?.interactions),
    },
    timeline: series.map((day) => timelineMap.get(day)),
    languages: [...LANGUAGES].map((language) => ({ language, count: languageCounts[language] })),
    sections,
    event_types: EVENT_TYPES.map((type) => ({ type, count: typeCounts[type] })),
    resources,
  };
}

export function cleanupAnalytics() {
  const result = db.prepare(`DELETE FROM analytics_events WHERE day < date('now', ?)`)
    .run(`-${RETENTION_DAYS} days`);
  run(`DELETE FROM analytics_daily WHERE day < date('now', ?)`, `-${RETENTION_DAYS} days`);
  return Number(result.changes || 0);
}

let cleanupTimer = null;
export function startAnalyticsCleanup() {
  cleanupAnalytics();
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanupAnalytics, 6 * 60 * 60 * 1000);
  cleanupTimer.unref?.();
}
