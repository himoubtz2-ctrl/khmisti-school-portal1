import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n.jsx';
import { useSite } from '../App.jsx';
import { api } from '../api.js';
import { track } from '../analytics.js';
import Reveal from '../components/Reveal.jsx';
import WordReveal from '../components/WordReveal.jsx';

/* ---------- helpers ---------- */
// Pick a text in the requested language, falling back to any language that has
// it (Arabic first, it is the school's main language). A field the admin left
// empty therefore never renders as a blank box on the public site.
const L = (row, field, lang) => {
  if (!row) return '';
  const value = row[`${field}_${lang}`];
  if (value != null && String(value).trim() !== '') return value;
  for (const fallback of ['ar', 'fr', 'en']) {
    const other = row[`${field}_${fallback}`];
    if (other != null && String(other).trim() !== '') return other;
  }
  return '';
};

const fmtDate = (s) => (s ? String(s).split(' ')[0] : '');

/* ---------- Hero particles ---------- */
function HeroParticles() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = Math.max(1, Math.round(w * DPR));
      canvas.height = Math.max(1, Math.round(h * DPR));
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize, { passive: true });

    const count = w < 600 ? 34 : 64;
    const dots = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.5 + 0.35,
      vx: (Math.random() - 0.5) * 0.26,
      vy: (Math.random() - 0.5) * 0.26,
      alpha: Math.random() * 0.35 + 0.12,
      phase: Math.random() * Math.PI * 2,
    }));

    const draw = (phase) => {
      ctx.clearRect(0, 0, w, h);
      for (const dot of dots) {
        if (phase != null && !reduceMotion.matches) {
          dot.x += dot.vx;
          dot.y += dot.vy;
          if (dot.x < 0) dot.x = w;
          if (dot.x > w) dot.x = 0;
          if (dot.y < 0) dot.y = h;
          if (dot.y > h) dot.y = 0;
        }
        const alpha = phase == null || reduceMotion.matches
          ? dot.alpha
          : dot.alpha * (0.55 + 0.45 * Math.sin(phase * 3 + dot.phase));
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(224, 163, 60, ${alpha})`;
        ctx.fill();
      }
    };

    if (reduceMotion.matches) {
      draw(null);
      return () => window.removeEventListener('resize', resize);
    }

    let phase = 0;
    const tick = () => {
      raf = 0;
      if (document.hidden) return;
      phase += 0.008;
      draw(phase);
      raf = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else if (!raf) raf = requestAnimationFrame(tick);
    };
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas ref={ref} className="hero-particles" aria-hidden="true" />;
}

/* ---------- Count up ---------- */
function CountUp({ to, suffix = '' }) {
  const ref = useRef(null);
  const [val, setVal] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      setVal(to);
      return undefined;
    }
    let raf = 0;
    const io = new IntersectionObserver((es) => {
      if (!es[0].isIntersecting) return;
      const start = performance.now();
      const dur = 1200;
      const step = (now) => {
        const p = Math.min(1, (now - start) / dur);
        setVal(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      io.disconnect();
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

/* ---------- Ticker ---------- */
function Ticker({ items, lang, t }) {
  if (!items.length) return null;
  const text = items.map((a) => L(a, 'title', lang)).filter(Boolean).join('   •   ');
  return (
    <div className="ticker">
      <div className="ticker-track">
        <span>{text}</span>
        <span aria-hidden="true">{text}</span>
      </div>
    </div>
  );
}

/* ---------- Section head ---------- */
function SectionHead({ kicker, title, lead, action }) {
  return (
    <Reveal className="section-head">
      <div>
        <div className="kicker">{kicker}</div>
        <WordReveal as="h2" text={title} />
        {lead && <p className="lead">{lead}</p>}
      </div>
      {action}
    </Reveal>
  );
}

/* ================= PAGE ================= */
export default function Home() {
  const { t, lang } = useI18n();
  const { site, counts } = useSite();
  const [data, setData] = useState({ announcements: [], news: [], programs: [], schedule: [], exams: [], resources: [] });
  const [showAllAnn, setShowAllAnn] = useState(false);
  const [schLevel, setSchLevel] = useState('');
  const [msg, setMsg] = useState(null);
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const [announcements, news, programs, schedule, exams, resources] = await Promise.all([
          api.get('/api/announcements'),
          api.get('/api/news'),
          api.get('/api/programs'),
          api.get('/api/schedule'),
          api.get('/api/exams'),
          api.get('/api/resources'),
        ]);
        if (!on) return;
        setData({ announcements, news, programs, schedule, exams, resources });
        const levels = [...new Set(schedule.map((s) => s.level))];
        if (levels.length) setSchLevel(levels[0]);
      } catch {}
    })();
    return () => { on = false; };
  }, []);

  useEffect(() => {
    const sectionIds = ['announcements', 'programs', 'news', 'schedule', 'exams', 'about', 'resources', 'contact'];
    track('view', 'home', langRef.current);
    if (!('IntersectionObserver' in window)) {
      for (const id of sectionIds) track('section_view', id, langRef.current);
      return undefined;
    }
    const seen = new Set();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target.id)) continue;
        seen.add(entry.target.id);
        track('section_view', entry.target.id, langRef.current);
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.18 });
    for (const id of sectionIds) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  const pinned = data.announcements.filter((a) => a.pinned);
  const annShown = showAllAnn ? data.announcements : data.announcements.slice(0, 3);
  const scheduleRows = useMemo(
    () => (schLevel ? data.schedule.filter((s) => s.level === schLevel) : data.schedule),
    [data.schedule, schLevel]
  );
  const levels = [...new Set(data.schedule.map((s) => s.level))];
  const heroImg = site?.photo || 'img/hero.jpg';

  const submitContact = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      name: fd.get('name'), email: fd.get('email'), subject: fd.get('subject'),
      body: fd.get('message'), website: fd.get('website') || '',
    };
    if (!body.name || !body.email || !body.subject || !body.message) {
      setMsg({ kind: 'err', text: t('sections.contact.invalid') });
      return;
    }
    setMsg({ kind: 'sending', text: t('sections.contact.sending') });
    try {
      await api.post('/api/messages', body);
      track('contact_submit', 'contact', lang);
      e.target.reset();
      setMsg({ kind: 'ok', text: t('sections.contact.ok') });
    } catch {
      setMsg({ kind: 'err', text: t('sections.contact.err') });
    }
  };

  const statsBand = counts
    ? [
        ['announcements', counts.announcements],
        ['news', counts.news],
        ['programs', counts.programs],
        ['exams', counts.exams],
        ['resources', counts.resources],
      ].filter(([, value]) => Number(value) > 0)
    : [];

  return (
    <>
      {/* ================= HERO ================= */}
      <section id="home" className="hero">
        <img className="hero-bg" src={heroImg} alt="" />
        <div className="hero-overlay" />
        <HeroParticles />
        <div className="container hero-inner">
          <Reveal>
            <span className="eyebrow"><i className="dot" />{t('hero.eyebrow')}</span>
            <WordReveal
              as="h1"
              className="hero-title"
              text={site?.[`school_name_${lang}`] || t('meta.title')}
              delay={90}
              stagger={70}
            />
            <p className="hero-sub">{site?.[`welcome_${lang}`] || ''}</p>
            <div className="hero-actions">
              <a className="btn primary" href="#announcements" onClick={() => track('cta_click', 'hero_announcements', lang)}>{t('hero.cta1')} →</a>
              <a className="btn ghost" href="#contact" onClick={() => track('cta_click', 'hero_contact', lang)}>{t('hero.cta2')}</a>
            </div>
          </Reveal>
        </div>
        <a className="scroll-hint" href="#quick" aria-label={t('hero.scroll')}>
          <span /><span /><span />
        </a>
      </section>

      {/* ================= TICKER ================= */}
      <Ticker items={pinned} lang={lang} t={t} />

      {/* ================= QUICK LINKS ================= */}
      <section id="quick" className="quick">
        <div className="container quick-grid">
          {[
            ['announcements', '!', 'announcements'],
            ['news', '◈', 'news'],
            ['schedule', '▦', 'schedule'],
            ['exams', '✓', 'exams'],
            ['resources', '▤', 'resources'],
          ].map(([k, icon, href], i) => (
            <Reveal key={k} delay={i * 60}>
              <a className="quick-card" href={`#${href}`} onClick={() => track('cta_click', `quick_${k}`, lang)}>
                <span className="qicon">{icon}</span>
                <span>
                  <b>{t(`quick.${k}.t`)}</b>
                  <small>{t(`quick.${k}.s`)}</small>
                </span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ================= ANNOUNCEMENTS ================= */}
      <section id="announcements" className="section">
        <div className="container">
          <SectionHead
            kicker={t('sections.announcements.kicker')}
            title={t('sections.announcements.title')}
            lead={t('sections.announcements.lead')}
            action={data.announcements.length > 3 ? (
              <button type="button" className="text-link" onClick={() => setShowAllAnn((value) => !value)}>
                {showAllAnn ? t('common.close') : t('sections.announcements.all')} →
              </button>
            ) : null}
          />
          <div className="cards">
            {annShown.map((a, i) => (
              <Reveal key={a.id} delay={i * 70} className="card">
                <span className="tag">{t(`categories.${a.category}`)}</span>
                <h3>{L(a, 'title', lang)}</h3>
                <p>{L(a, 'body', lang)}</p>
                <div className="meta">{fmtDate(a.created_at)} · {t('topbar.official')}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= PROGRAMS ================= */}
      <section id="programs" className="section programs">
        <div className="container">
          <SectionHead
            kicker={t('sections.programs.kicker')}
            title={t('sections.programs.title')}
            lead={t('sections.programs.lead')}
          />
          <div className="program-grid">
            {data.programs.map((p, i) => (
              <Reveal key={p.id} delay={i * 60} className="program-card">
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                <h3>{L(p, 'name', lang)}</h3>
                <p>{L(p, 'desc', lang)}</p>
                {p.track && <span className="chip">{t(`tracks.${p.track}`)}</span>}
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= NEWS ================= */}
      <section id="news" className="section">
        <div className="container">
          <SectionHead
            kicker={t('sections.news.kicker')}
            title={t('sections.news.title')}
            lead={t('sections.news.lead')}
          />
          <div className="cards cards--news">
            {data.news.map((n, i) => (
              <Reveal key={n.id} delay={i * 70} className="card card--media">
                {n.image && <img src={n.image} alt="" loading="lazy" />}
                <div className="card-body">
                  <span className="tag">{t(`categories.${n.category}`)}</span>
                  <h3>{L(n, 'title', lang)}</h3>
                  <p>{L(n, 'body', lang)}</p>
                  <div className="meta">{fmtDate(n.created_at)}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= SCHEDULE ================= */}
      <section id="schedule" className="section schedule">
        <div className="container">
          <SectionHead
            kicker={t('sections.schedule.kicker')}
            title={t('sections.schedule.title')}
            lead={t('sections.schedule.lead')}
          />
          {levels.length > 0 && (
            <Reveal className="schedule-toolbar">
              <label htmlFor="schedule-level">{t('sections.schedule.level')}</label>
              <select id="schedule-level" value={schLevel} onChange={(e) => setSchLevel(e.target.value)}>
                {levels.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
              </select>
            </Reveal>
          )}
          {scheduleRows.length ? (
            <Reveal className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('sections.schedule.day')}</th>
                    <th>{t('sections.schedule.section')}</th>
                    <th>{t('sections.schedule.subject')}</th>
                    <th>{t('sections.schedule.time')}</th>
                    <th>{t('sections.schedule.room')}</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleRows.map((s) => (
                    <tr key={s.id}>
                      <td><span className="day-chip">{t(`days.${s.day}`)}</span></td>
                      <td>{s.section}</td>
                      <td>{L(s, 'subject', lang)}</td>
                      <td>{s.start_time} – {s.end_time}</td>
                      <td>{s.room}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
          ) : (
            <Reveal><p className="empty-note">{t('sections.schedule.empty')}</p></Reveal>
          )}
        </div>
      </section>

      {/* ================= EXAMS ================= */}
      <section id="exams" className="section">
        <div className="container">
          <SectionHead
            kicker={t('sections.exams.kicker')}
            title={t('sections.exams.title')}
            lead={t('sections.exams.lead')}
          />
          {data.exams.length ? (
            <div className="exam-list">
              {data.exams.map((x, i) => (
                <Reveal key={x.id} delay={i * 50} className="exam-row">
                  <span className={`exam-date ${x.status === 'done' ? 'is-done' : ''}`}>
                    <b>{fmtDate(x.exam_date)}</b>
                    <small>{t(`examStatus.${x.status}`)}</small>
                  </span>
                  <div className="exam-info">
                    <h3>{L(x, 'title', lang)}</h3>
                    <span>{L(x, 'subject', lang)} · {x.level} · {t(`examTypes.${x.exam_type}`)}</span>
                  </div>
                  <span className="chip">{x.room || t('sections.exams.room')}</span>
                </Reveal>
              ))}
            </div>
          ) : (
            <Reveal><p className="empty-note">{t('sections.exams.empty')}</p></Reveal>
          )}
        </div>
      </section>

      {/* ================= ABOUT + STATS ================= */}
      <section id="about" className="section about">
        <div className="container about-grid">
          <Reveal className="about-box">
            <div className="kicker">{t('sections.about.kicker')}</div>
            <WordReveal as="h2" text={t('sections.about.title')} />
            <p>{t('sections.about.lead')}</p>
            <div className="points">
              {[
                ['p1t', 'p1s'],
                ['p2t', 'p2s'],
                ['p3t', 'p3s'],
              ].map(([tt, ss]) => (
                <div key={tt} className="point">
                  <span className="check">✓</span>
                  <div>
                    <b>{t(`sections.about.${tt}`)}</b>
                    <p>{t(`sections.about.${ss}`)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
          {statsBand.length > 0 && (
            <Reveal className="stats-band" delay={100}>
              {statsBand.map(([k, v]) => (
                <div key={k} className="stat-card">
                  <strong><CountUp to={v} /></strong>
                  <span>{t(`stats.${k}`)}</span>
                </div>
              ))}
            </Reveal>
          )}
        </div>
      </section>

      {/* ================= RESOURCES ================= */}
      <section id="resources" className="section resources">
        <div className="container">
          <SectionHead
            kicker={t('sections.resources.kicker')}
            title={t('sections.resources.title')}
            lead={t('sections.resources.lead')}
          />
          {data.resources.length ? (
            <div className="res-grid">
              {data.resources.map((r, i) => (
                <Reveal key={r.id} delay={i * 50} className="res-card">
                  <div className="res-icon">▤</div>
                  <div className="res-meta">
                    <h3>{L(r, 'title', lang)}</h3>
                    <span>{L(r, 'subject', lang)} · {r.level}</span>
                  </div>
                  <a className="btn small" href={`/api/resources/${r.id}/download?lang=${lang}`} target="_blank" rel="noopener noreferrer">
                    {t('sections.resources.download')} ↓
                  </a>
                </Reveal>
              ))}
            </div>
          ) : (
            <Reveal><p className="empty-note">{t('sections.resources.empty')}</p></Reveal>
          )}
        </div>
      </section>

      {/* ================= CONTACT ================= */}
      <section id="contact" className="section contact">
        <div className="container contact-grid">
          <Reveal>
            <div className="kicker">{t('sections.contact.kicker')}</div>
            <WordReveal as="h2" text={t('sections.contact.title')} />
            <p className="lead">{t('sections.contact.lead')}</p>
            <div className="contact-info">
              {site?.phone && <a href={`tel:${site.phone.replace(/[^\d+]/g, '')}`}><span aria-hidden="true">☏</span> <span dir="ltr">{site.phone}</span></a>}
              {site?.email && <a href={`mailto:${site.email}`}><span aria-hidden="true">✉</span> <span dir="ltr">{site.email}</span></a>}
              <div><span aria-hidden="true">◈</span> {site?.[`address_${lang}`] || ''}</div>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <form className="form" onSubmit={submitContact}>
              <div className="field-row">
                <label htmlFor="contact-name">{t('sections.contact.name')}</label>
                <input id="contact-name" name="name" maxLength={80} required />
              </div>
              <div className="field-row">
                <label htmlFor="contact-email">{t('sections.contact.email')}</label>
                <input id="contact-email" name="email" type="email" maxLength={120} required dir="ltr" />
              </div>
              <div className="field-row">
                <label htmlFor="contact-subject">{t('sections.contact.subject')}</label>
                <input id="contact-subject" name="subject" maxLength={160} required />
              </div>
              <div className="field-row">
                <label htmlFor="contact-message">{t('sections.contact.message')}</label>
                <textarea id="contact-message" name="message" rows={4} maxLength={3000} required />
              </div>
              <input name="website" type="text" className="honey" tabIndex={-1} autoComplete="off" aria-hidden="true" />
              <button className="btn primary" type="submit" disabled={msg?.kind === 'sending'}>
                {msg?.kind === 'sending' ? t('sections.contact.sending') : t('sections.contact.send')}
              </button>
              {msg && <p className={`form-msg ${msg.kind}`} aria-live="polite">{msg.text}</p>}
            </form>
          </Reveal>
        </div>
      </section>
    </>
  );
}