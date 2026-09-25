// Load .env FIRST: the seed below hashes ADMIN_PASS, so the variables must be
// present before any other module body executes (ESM import order guarantee).
import './env.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { hashPassword, validPassword } from './security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'app.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS site (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  school_name_ar TEXT NOT NULL DEFAULT '', school_name_fr TEXT NOT NULL DEFAULT '', school_name_en TEXT NOT NULL DEFAULT '',
  welcome_ar TEXT NOT NULL DEFAULT '', welcome_fr TEXT NOT NULL DEFAULT '', welcome_en TEXT NOT NULL DEFAULT '',
  address_ar TEXT NOT NULL DEFAULT '', address_fr TEXT NOT NULL DEFAULT '', address_en TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', facebook TEXT NOT NULL DEFAULT '',
  logo TEXT NOT NULL DEFAULT '', photo TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_ar TEXT NOT NULL DEFAULT '', title_fr TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
  body_ar  TEXT NOT NULL DEFAULT '', body_fr  TEXT NOT NULL DEFAULT '', body_en  TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_ar TEXT NOT NULL DEFAULT '', title_fr TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
  body_ar  TEXT NOT NULL DEFAULT '', body_fr  TEXT NOT NULL DEFAULT '', body_en  TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  image TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ord INTEGER NOT NULL DEFAULT 0,
  name_ar TEXT NOT NULL DEFAULT '', name_fr TEXT NOT NULL DEFAULT '', name_en TEXT NOT NULL DEFAULT '',
  desc_ar  TEXT NOT NULL DEFAULT '', desc_fr  TEXT NOT NULL DEFAULT '', desc_en  TEXT NOT NULL DEFAULT '',
  track    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL DEFAULT '', section TEXT NOT NULL DEFAULT '',
  day INTEGER NOT NULL DEFAULT 0,
  subject_ar TEXT NOT NULL DEFAULT '', subject_fr TEXT NOT NULL DEFAULT '', subject_en TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '', end_time TEXT NOT NULL DEFAULT '', room TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_ar TEXT NOT NULL DEFAULT '', title_fr TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
  subject_ar TEXT NOT NULL DEFAULT '', subject_fr TEXT NOT NULL DEFAULT '', subject_en TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT '', exam_type TEXT NOT NULL DEFAULT 'devoir',
  exam_date TEXT NOT NULL DEFAULT '', room TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'upcoming'
);

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_ar TEXT NOT NULL DEFAULT '', title_fr TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
  subject_ar TEXT NOT NULL DEFAULT '', subject_fr TEXT NOT NULL DEFAULT '', subject_en TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '', file_path TEXT NOT NULL DEFAULT '', size INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '', read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('view', 'section_view', 'lang_switch', 'resource_download', 'contact_submit', 'cta_click')),
  target TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('ar', 'fr', 'en')),
  visitor_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (day, type, target, language, visitor_hash)
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_day ON analytics_events(day);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_target ON analytics_events(type, target);

CREATE TABLE IF NOT EXISTS analytics_daily (
  day TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('view', 'section_view', 'lang_switch', 'resource_download', 'contact_submit', 'cta_click')),
  target TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('ar', 'fr', 'en')),
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, type, target, language)
);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_day_type ON analytics_daily(day, type);
`);

// Lightweight migrations for databases created by an earlier version.
function ensureColumn(table, column, definition) {
  const columns = all(`PRAGMA table_info(${table})`);
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// convenience helpers
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);
ensureColumn('resources', 'download_count', 'INTEGER NOT NULL DEFAULT 0');
// Legacy local databases may contain raw contact-form addresses; remove them
// on startup because the current privacy policy never stores that field.
run("UPDATE messages SET ip = '' WHERE ip IS NOT NULL AND ip <> ''");

// ---------- seed ----------
function seedIfEmpty() {
  if (get('SELECT COUNT(*) AS c FROM site').c === 0) {
    run(`INSERT INTO site (id, school_name_ar, school_name_fr, school_name_en, welcome_ar, welcome_fr, welcome_en,
           address_ar, address_fr, address_en, phone, email, facebook, photo)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?)`,
      'ثانوية محمد خميستي المختلطة', 'Lycée Mohamed Khémisti', 'Mohamed Khémisti High School',
      'منصة رقمية رسمية تجمع إعلانات المؤسسة، الموارد التعليمية، التوقيت والاختبارات في تجربة واحدة واضحة وسهلة للتلميذ والزائر.',
      'Une plateforme numérique officielle qui rassemble les annonces, les ressources pédagogiques, les emplois du temps et les examens dans une expérience claire et simple.',
      'An official digital platform gathering school announcements, learning resources, schedules and exams in one clear, simple experience.',
      'شلغوم العيد، ولاية ميلة، الجزائر', 'Chelghoum Laïd, Wilaya de Mila, Algérie', 'Chelghoum Laïd, Mila Province, Algeria',
      'https://www.facebook.com/groups/1687919744812925/',
      // the bundled cover photo, so the "main photo" field is never blank on a
      // fresh install; the admin can swap it for an uploaded one at any time
      '/img/hero.jpg');
  }

  if (get('SELECT COUNT(*) AS c FROM programs').c === 0) {
    const prog = (ord, n, d, t) =>
      run('INSERT INTO programs (ord, name_ar, name_fr, name_en, desc_ar, desc_fr, desc_en, track) VALUES (?,?,?,?,?,?,?,?)',
        ord, n.ar, n.fr, n.en, d.ar, d.fr, d.en, t);
    prog(1, { ar: 'علوم تجريبية', fr: 'Sciences expérimentales', en: 'Experimental Sciences' },
      { ar: 'مسار علمي يركز على العلوم الطبيعية والفيزيائية.', fr: 'Filière scientifique axée sur les sciences naturelles et physiques.', en: 'A science track focused on natural and physical sciences.' },
      'scientific');
    prog(2, { ar: 'رياضيات', fr: 'Mathématiques', en: 'Mathematics' },
      { ar: 'مسار علمي متقدم في الرياضيات والعلوم الدقيقة.', fr: 'Filière scientifique avancée en mathématiques.', en: 'An advanced science track in mathematics and exact sciences.' },
      'scientific');
    prog(3, { ar: 'آداب وفلسفة', fr: 'Lettres et Philosophie', en: 'Literature and Philosophy' },
      { ar: 'مسار أدبي يهتم باللغة والأدب والفكر.', fr: 'Filière littéraire centrée sur langue, littérature et pensée.', en: 'A literary track focused on language, literature and thought.' },
      'literary');
    prog(4, { ar: 'لغات أجنبية', fr: 'Langues étrangères', en: 'Foreign Languages' },
      { ar: 'مسار لغوي لتعميق اللغات الأجنبية.', fr: 'Filière linguistique pour approfondir les langues étrangères.', en: 'A language track to deepen foreign languages.' },
      'languages');
    prog(5, { ar: 'تسيير واقتصاد', fr: 'Gestion et Économie', en: 'Management and Economics' },
      { ar: 'مسار اقتصادي يغطي التسيير والعلوم الاقتصادية.', fr: 'Filière économique couvrant gestion et sciences économiques.', en: 'An economics track covering management and economic sciences.' },
      'economics');
  }

  if (get('SELECT COUNT(*) AS c FROM announcements').c === 0) {
    const ins = (cat, pinned, t, b) => run(
      'INSERT INTO announcements (category, pinned, title_ar, title_fr, title_en, body_ar, body_fr, body_en) VALUES (?,?,?,?,?,?,?,?)',
      cat, pinned, t.ar, t.fr, t.en, b.ar, b.fr, b.en);
    ins('important', 1,
      { ar: 'مرحباً بكم في المنصة الرقمية للثانوية', fr: 'Bienvenue sur la plateforme numérique du lycée', en: 'Welcome to the school digital platform' },
      { ar: 'واجهة جديدة للوصول إلى الإعلانات والمعلومات والموارد التعليمية بسهولة، مع تحديثها باستمرار من طرف إدارة الموقع.',
        fr: 'Une nouvelle interface pour accéder facilement aux annonces, informations et ressources pédagogiques, mise à jour régulièrement par l\'administration.',
        en: 'A new interface to easily access announcements, information and learning resources, regularly updated by the site administration.' });
    ins('academic', 0,
      { ar: 'تنظيم جداول الحصص', fr: 'Organisation des emplois du temps', en: 'Class schedules organization' },
      { ar: 'يمكن للتلاميذ الاطلاع على جدول التوقيت الخاص بمستواهم وقسمهم من قسم «التوقيت».',
        fr: 'Les élèves peuvent consulter l\'emploi du temps de leur niveau et de leur classe dans la rubrique « Emploi du temps ».',
        en: 'Students can check the schedule of their level and class in the "Schedule" section.' });
    ins('exams', 0,
      { ar: 'رزنامة الفروض والاختبارات', fr: 'Calendrier des devoirs et examens', en: 'Tests and exams calendar' },
      { ar: 'سيتم نشر المواعيد والمواد والقاعات عبر قسم الاختبارات في المنصة.',
        fr: 'Les dates, matières et salles seront publiées dans la rubrique « Examens » de la plateforme.',
        en: 'Dates, subjects and rooms will be published in the "Exams" section of the platform.' });
  }

  if (get('SELECT COUNT(*) AS c FROM news').c === 0) {
    const ins = (cat, t, b, img) => run(
      'INSERT INTO news (category, title_ar, title_fr, title_en, body_ar, body_fr, body_en, image) VALUES (?,?,?,?,?,?,?,?)',
      cat, t.ar, t.fr, t.en, b.ar, b.fr, b.en, img);
    ins('activity',
      { ar: 'فعاليات علمية وثقافية', fr: 'Activités scientifiques et culturelles', en: 'Scientific and cultural activities' },
      { ar: 'قسم مخصص لتغطية الأنشطة والمسابقات والتكريمات داخل المؤسسة.',
        fr: 'Une rubrique dédiée aux activités, concours et cérémonies au sein de l\'établissement.',
        en: 'A section dedicated to activities, competitions and ceremonies inside the school.' },
      'img/activity.jpg');
    ins('culture',
      { ar: 'مشاريع ومبادرات التلاميذ', fr: 'Projets et initiatives des élèves', en: 'Students projects and initiatives' },
      { ar: 'واجهة قابلة للتوسع لعرض المبادرات والإنجازات التعليمية.',
        fr: 'Une interface extensible pour présenter les initiatives et réussites éducatives.',
        en: 'An extensible interface showcasing educational initiatives and achievements.' },
      'img/projects.jpg');
    ins('sports',
      { ar: 'النشاطات الرياضية', fr: 'Activités sportives', en: 'Sports activities' },
      { ar: 'مكان منظم لنشر الأخبار المتعلقة بالنشاطات والمسابقات الرياضية.',
        fr: 'Un espace organisé pour les actualités des activités et compétitions sportives.',
        en: 'An organized space for news about sports activities and competitions.' },
      'img/sports.jpg');
  }

  if (get('SELECT COUNT(*) AS c FROM exams').c === 0) {
    const ins = (t, s, lvl, type, date, room) => run(
      'INSERT INTO exams (title_ar, title_fr, title_en, subject_ar, subject_fr, subject_en, level, exam_type, exam_date, room) VALUES (?,?,?,?,?,?,?,?,?,?)',
      t.ar, t.fr, t.en, s.ar, s.fr, s.en, lvl, type, date, room);
    ins({ ar: 'الفرض الأول في الرياضيات', fr: 'Premier devoir de Mathématiques', en: 'First test in Mathematics' },
      { ar: 'رياضيات', fr: 'Mathématiques', en: 'Mathematics' }, '1AS', 'devoir', '2026-10-12', 'A2');
    ins({ ar: 'الفرض الأول في العلوم الفيزيائية', fr: 'Premier devoir de Physique', en: 'First test in Physics' },
      { ar: 'علوم فيزيائية', fr: 'Physique', en: 'Physics' }, '2AS', 'devoir', '2026-10-15', 'B1');
    ins({ ar: 'اختبار في اللغة العربية', fr: 'Composition d\'Arabe', en: 'Examination in Arabic' },
      { ar: 'لغة عربية', fr: 'Arabe', en: 'Arabic' }, '3AS', 'examen', '2026-11-03', 'C3');
  }

  if (get('SELECT COUNT(*) AS c FROM schedule').c === 0) {
    const ins = (lvl, sec, day, s, st, et, rm) => run(
      'INSERT INTO schedule (level, section, day, subject_ar, subject_fr, subject_en, start_time, end_time, room) VALUES (?,?,?,?,?,?,?,?,?)',
      lvl, sec, day, s.ar, s.fr, s.en, st, et, rm);
    ins('1AS', '1', 0, { ar: 'العلوم الطبيعية', fr: 'Sciences naturelles', en: 'Natural Sciences' }, '08:00', '09:00', '12');
    ins('1AS', '1', 0, { ar: 'اللغة العربية', fr: 'Arabe', en: 'Arabic' }, '09:00', '10:00', '12');
    ins('2AS', '3', 1, { ar: 'الرياضيات', fr: 'Mathématiques', en: 'Mathematics' }, '10:00', '11:00', '7');
    ins('3AS', 'SE-1', 2, { ar: 'العلوم الفيزيائية', fr: 'Physique', en: 'Physics' }, '08:00', '10:00', 'L2');
  }
}

function assertProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  const required = ['ADMIN_USER', 'ADMIN_PASS', 'ADMIN_KEY', 'SESSION_SECRET'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`missing production configuration: ${missing.join(', ')}`);
  if (!validPassword(process.env.ADMIN_PASS)) throw new Error('ADMIN_PASS is too weak');
  if (process.env.ADMIN_KEY.length < 16) throw new Error('ADMIN_KEY is too short');
  if (process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET is too short');
  if (String(process.env.ADMIN_PASS).startsWith('replace_')) throw new Error('ADMIN_PASS is still a placeholder');
}

export async function seed() {
  assertProductionConfig();
  seedIfEmpty();
  const count = get('SELECT COUNT(*) AS c FROM users WHERE username = ?', process.env.ADMIN_USER || 'khmisti').c;
  if (count === 0) {
    const hash = await hashPassword(process.env.ADMIN_PASS || 'ChangeMe1234!');
    run('INSERT INTO users (username, pass_hash) VALUES (?, ?)', process.env.ADMIN_USER || 'khmisti', hash);
  }
}

export const ready = seed().catch((e) => {
  console.error('[DB] seed failed:', e);
  process.exit(1);
});