import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, clearAdminKey } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { AreaChart, BarChart, DonutChart, Sparkline } from '../../components/Charts.jsx';

/* ---------------- small pieces ---------------- */
const LANGS = ['ar', 'fr', 'en'];
const isLangField = (name) => /_(ar|fr|en)$/.test(name);
const langBase = (name) => name.replace(/_(ar|fr|en)$/, '');
/* which translated fields each list needs, for the completeness column */
const LANG_BASES = {
  announcements: ['title', 'body'],
  news: ['title', 'body'],
  programs: ['name', 'desc'],
  schedule: ['subject'],
  exams: ['title', 'subject'],
};
const isFilled = (value) => String(value ?? '').trim() !== '';

function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast ${toast.kind}`} role={toast.kind === 'err' ? 'alert' : 'status'} aria-live="polite">{toast.text}</div>;
}

function useCrud(url) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get(url);
      setItems(d);
    } catch (e) {
      throw e;
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => { load().catch(() => {}); }, [load]);
  return { items, setItems, load, loading };
}

/* generic modal form */
function FormModal({ title, fields, initial, onClose, onSubmit, onFilled, busy }) {
  const { t, lang } = useI18n();
  const formRef = useRef(null);
  const [v, setV] = useState(() => {
    const o = {};
    for (const f of fields) {
      const iv = initial ? initial[f.name] ?? '' : '';
      o[f.name] = f.type === 'checkbox' ? !!iv : f.type === 'select' ? String(iv) : iv;
    }
    return o;
  });
  const set = (k, val) => setV((p) => ({ ...p, [k]: val }));
  useEffect(() => {
    const previous = document.activeElement;
    const first = formRef.current?.querySelector('input, select, textarea, button');
    first?.focus();
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [onClose]);

  /* Language completeness: a form no longer forces three translations, but it
     never lets you save a completely empty text either. One click copies what
     you already typed into the empty languages. */
  const bases = useMemo(
    () => [...new Set(fields.filter((f) => isLangField(f.name)).map((f) => langBase(f.name)))],
    [fields]
  );
  const has = (base, l) => isFilled(v[`${base}_${l}`]);
  const langComplete = (l) => bases.every((b) => has(b, l));
  const emptyBases = bases.filter((b) => !LANGS.some((l) => has(b, l)));
  const allComplete = bases.length > 0 && LANGS.every(langComplete);
  const fillMissing = () => {
    setV((prev) => {
      const next = { ...prev };
      for (const b of bases) {
        const source = [lang, ...LANGS.filter((l) => l !== lang)]
          .map((l) => next[`${b}_${l}`])
          .find(isFilled);
        if (source == null) continue;
        for (const l of LANGS) if (!isFilled(next[`${b}_${l}`])) next[`${b}_${l}`] = source;
      }
      return next;
    });
    onFilled?.();
  };

  const submit = (e) => {
    e.preventDefault();
    if (emptyBases.length) return;
    onSubmit(v);
  };
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-label={title} ref={formRef} onSubmit={submit}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        <div className="modal-body">
          {bases.length > 0 && (
            <div className="modal-langs">
              <span className="modal-langs-title">{t('admin.langStatus')}</span>
              <span className="modal-langs-pills">
                {LANGS.map((l) => (
                  <span key={l} dir="ltr" className={`lang-pill ${langComplete(l) ? 'is-full' : 'is-empty'}`}>
                    {l.toUpperCase()}<i aria-hidden="true">{langComplete(l) ? '✓' : '—'}</i>
                    <span className="sr-only">{langComplete(l) ? ` — ${t('admin.langsOk')}` : ` — ${t('admin.langsMissing')}`}</span>
                  </span>
                ))}
              </span>
              <button type="button" className="mini" onClick={fillMissing} disabled={allComplete}>
                ⇉ {t('admin.fillMissing')}
              </button>
              {emptyBases.length > 0 && <span className="modal-langs-hint">{t('admin.needOneLang')}</span>}
            </div>
          )}
          {fields.map((f) => (
            <label key={f.name} className={`field ${f.wide ? 'field--wide' : ''}`}>
              <span>{f.label}</span>
              {f.type === 'textarea' ? (
                <textarea rows={3} value={v[f.name]} onChange={(e) => set(f.name, e.target.value)} required={!isLangField(f.name) && f.required} />
              ) : f.type === 'select' ? (
                <select value={v[f.name]} onChange={(e) => set(f.name, e.target.value)} required={f.required}>
                  <option value="">—</option>
                  {v[f.name] && !f.options.some((o) => String(o.value) === String(v[f.name])) && (
                    <option value={v[f.name]}>{v[f.name]}</option>
                  )}
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : f.type === 'checkbox' ? (
                <input type="checkbox" checked={!!v[f.name]} onChange={(e) => set(f.name, e.target.checked)} />
              ) : (
                <input type={f.type || 'text'} value={v[f.name]} onChange={(e) => set(f.name, e.target.value)} required={!isLangField(f.name) && f.required} />
              )}
            </label>
          ))}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn primary" disabled={busy || emptyBases.length > 0} title={emptyBases.length ? t('admin.needOneLang') : undefined}>
            {busy ? '…' : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

function DataTable({ cols, rows, empty, emptyAction, onEdit, onDelete, i18n = {} }) {
  return (
    <div className="table-wrap">
      {rows.length === 0 ? (
        <div className="empty-state">
          <p className="empty-note">{empty}</p>
          {emptyAction}
        </div>
      ) : (
        <table className="table table--admin">
          <thead><tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}<th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {cols.map((c) => <td key={c.key}>{c.render ? c.render(r) : r[c.key] != null ? String(r[c.key]) : ''}</td>)}
                <td className="row-actions">
                  <button type="button" className="mini" aria-label={i18n.edit || 'Edit'} title={i18n.edit || 'Edit'} onClick={() => onEdit(r)}>✎</button>
                  <button type="button" className="mini mini--danger" aria-label={i18n.delete || 'Delete'} title={i18n.delete || 'Delete'} onClick={() => onDelete(r)}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---------------- main ---------------- */
const TABS = [
  'overview', 'analytics', 'announcements', 'news', 'programs', 'schedule', 'exams', 'resources', 'messages', 'media', 'settings',
];
/* the one place to add something, reachable from every tab */
const ADDABLE = ['announcements', 'news', 'programs', 'schedule', 'exams', 'resources', 'media'];

export default function AdminDashboard() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [tab, setTab] = useState('overview');
  const [toast, setToast] = useState(null);
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [media, setMedia] = useState([]);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSignal, setAddSignal] = useState(0);
  const addTarget = useRef(null);
  const addWrap = useRef(null);
  const mediaInput = useRef(null);

  const notify = (kind, text) => { setToast({ kind, text }); setTimeout(() => setToast(null), 3000); };

  // auth check
  useEffect(() => {
    api.get('/api/auth/me').catch(() => nav('/admin', { replace: true }));
  }, [nav]);

  const loadAll = useCallback(async () => {
    try {
      const [s, msgs] = await Promise.all([
        api.get('/api/admin/stats'),
        api.get('/api/admin/messages'),
      ]);
      setStats(s);
      setRecent(msgs.slice(0, 5));
    } catch {
      nav('/admin', { replace: true });
    }
  }, [nav]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadMedia = useCallback(() => {
    api.get('/api/admin/media').then(setMedia).catch(() => {});
  }, []);
  useEffect(() => { loadMedia(); }, [loadMedia]);

  const loadSettings = useCallback(() => {
    api.get('/api/admin/site').then(setSettings).catch(() => {});
  }, []);
  useEffect(() => { loadSettings(); }, [loadSettings]);

  const logout = async () => {
    try { await api.post('/api/auth/logout', {}); } catch {}
    clearAdminKey();
    nav('/', { replace: true });
  };

  /* ---------- section crud ---------- */
  const isCrudTab = ['announcements', 'news', 'programs', 'schedule', 'exams'].includes(tab);
  const crudUrl = isCrudTab ? '/api/admin/' + tab : '/api/admin/stats';
  const sec = useCrud(crudUrl);

  const CATS = ['important', 'academic', 'exams', 'activity', 'culture', 'sports', 'general']
    .map((c) => ({ value: c, label: t(`categories.${c}`) }));
  const TRACKS = ['scientific', 'literary', 'languages', 'economics'].map((c) => ({ value: c, label: t(`tracks.${c}`) }));
  const DAYS = [0, 1, 2, 3, 4, 5, 6].map((i) => t(`days.${i}`));

  const fieldsOf = useMemo(() => {
    const F = t('admin.fields'); // not used directly; gather labels
    const label = (k) => t(`admin.fields.${k}`);
    if (tab === 'announcements') return [
      { name: 'title_ar', label: label('title_ar'), required: true },
      { name: 'title_fr', label: label('title_fr'), required: true },
      { name: 'title_en', label: label('title_en'), required: true },
      { name: 'body_ar', label: label('body_ar'), type: 'textarea', wide: true, required: true },
      { name: 'body_fr', label: label('body_fr'), type: 'textarea', wide: true, required: true },
      { name: 'body_en', label: label('body_en'), type: 'textarea', wide: true, required: true },
      { name: 'category', label: label('category'), type: 'select', options: CATS },
      { name: 'pinned', label: label('pinned'), type: 'checkbox' },
    ];
    if (tab === 'news') return [
      { name: 'title_ar', label: label('title_ar'), required: true },
      { name: 'title_fr', label: label('title_fr'), required: true },
      { name: 'title_en', label: label('title_en'), required: true },
      { name: 'body_ar', label: label('body_ar'), type: 'textarea', wide: true, required: true },
      { name: 'body_fr', label: label('body_fr'), type: 'textarea', wide: true, required: true },
      { name: 'body_en', label: label('body_en'), type: 'textarea', wide: true, required: true },
      { name: 'category', label: label('category'), type: 'select', options: CATS },
      { name: 'image', label: label('image'), type: 'select', options: media.map((m) => ({ value: m.url, label: m.name })) },
    ];
    if (tab === 'programs') return [
      { name: 'name_ar', label: label('name_ar'), required: true },
      { name: 'name_fr', label: label('name_fr'), required: true },
      { name: 'name_en', label: label('name_en'), required: true },
      { name: 'desc_ar', label: label('desc_ar'), type: 'textarea', wide: true, required: true },
      { name: 'desc_fr', label: label('desc_fr'), type: 'textarea', wide: true, required: true },
      { name: 'desc_en', label: label('desc_en'), type: 'textarea', wide: true, required: true },
      { name: 'track', label: label('track'), type: 'select', options: TRACKS },
      { name: 'ord', label: label('order'), type: 'number' },
    ];
    if (tab === 'schedule') return [
      { name: 'level', label: label('level'), required: true },
      { name: 'section', label: label('section'), required: true },
      { name: 'day', label: label('day'), type: 'select', options: DAYS.map((d, i) => ({ value: i, label: d })), required: true },
      { name: 'subject_ar', label: label('subject_ar'), required: true },
      { name: 'subject_fr', label: label('subject_fr'), required: true },
      { name: 'subject_en', label: label('subject_en'), required: true },
      { name: 'start_time', label: label('start_time'), required: true },
      { name: 'end_time', label: label('end_time'), required: true },
      { name: 'room', label: label('room') },
    ];
    if (tab === 'exams') return [
      { name: 'title_ar', label: label('title_ar'), required: true },
      { name: 'title_fr', label: label('title_fr'), required: true },
      { name: 'title_en', label: label('title_en'), required: true },
      { name: 'subject_ar', label: label('subject_ar'), required: true },
      { name: 'subject_fr', label: label('subject_fr'), required: true },
      { name: 'subject_en', label: label('subject_en'), required: true },
      { name: 'level', label: label('level'), required: true },
      { name: 'exam_type', label: label('exam_type'), type: 'select', options: [{ value: 'devoir', label: t('examTypes.devoir') }, { value: 'examen', label: t('examTypes.examen') }, { value: 'exam', label: t('examTypes.exam') }] },
      { name: 'exam_date', label: label('exam_date'), type: 'date', required: true },
      { name: 'room', label: label('room') },
      { name: 'status', label: label('status'), type: 'select', options: [{ value: 'upcoming', label: t('examStatus.upcoming') }, { value: 'done', label: t('examStatus.done') }] },
    ];
    return [];
  }, [tab, t, media]);

  const colsOf = useMemo(() => {
    const t3 = (r, f) => [r[f + '_ar'], r[f + '_fr'], r[f + '_en']].filter(Boolean).join(' | ');
    if (tab === 'announcements') return [
      { key: 'titles', label: 'AR · FR · EN', render: (r) => t3(r, 'title') },
      { key: 'category', label: t('admin.fields.category'), render: (r) => t(`categories.${r.category}`) },
      { key: 'pinned', label: t('admin.fields.pinned'), render: (r) => (r.pinned ? '📌' : '') },
      { key: 'created_at', label: '', render: (r) => String(r.created_at).split(' ')[0] },
    ];
    if (tab === 'news') return [
      { key: 'titles', label: 'AR · FR · EN', render: (r) => t3(r, 'title') },
      { key: 'category', label: t('admin.fields.category'), render: (r) => t(`categories.${r.category}`) },
      { key: 'image', label: '', render: (r) => (r.image ? '🖼' : '') },
      { key: 'created_at', label: '', render: (r) => String(r.created_at).split(' ')[0] },
    ];
    if (tab === 'programs') return [
      { key: 'name', label: 'AR · FR · EN', render: (r) => t3(r, 'name') },
      { key: 'track', label: t('admin.fields.track'), render: (r) => (r.track ? t(`tracks.${r.track}`) : '') },
      { key: 'ord', label: t('admin.fields.order') },
    ];
    if (tab === 'schedule') return [
      { key: 'level', label: t('admin.fields.level') },
      { key: 'section', label: t('admin.fields.section') },
      { key: 'day', label: t('admin.fields.day'), render: (r) => t(`days.${Number(r.day) || 0}`) },
      { key: 'subject', label: t('admin.fields.subject_ar'), render: (r) => t3(r, 'subject') },
      { key: 'time', label: '', render: (r) => `${r.start_time}–${r.end_time}` },
      { key: 'room', label: t('admin.fields.room') },
    ];
    if (tab === 'exams') return [
      { key: 'title', label: 'AR · FR · EN', render: (r) => t3(r, 'title') },
      { key: 'subject', label: t('admin.fields.subject_ar'), render: (r) => t3(r, 'subject') },
      { key: 'level', label: t('admin.fields.level') },
      { key: 'exam_type', label: t('admin.fields.exam_type'), render: (r) => t(`examTypes.${r.exam_type}`) },
      { key: 'exam_date', label: t('admin.fields.exam_date') },
      { key: 'status', label: t('admin.fields.status'), render: (r) => t(`examStatus.${r.status}`) },
    ];
    return [];
  }, [tab, t]);

  const missingLangs = useCallback((row) => {
    const bases = LANG_BASES[tab] || [];
    return LANGS.filter((l) => bases.some((b) => !isFilled(row[`${b}_${l}`])));
  }, [tab]);

  const langsCol = useMemo(() => {
    if (!(LANG_BASES[tab] || []).length) return null;
    return {
      key: '__langs',
      label: t('admin.langStatus'),
      render: (r) => {
        const missing = missingLangs(r);
        return missing.length ? (
          <span className="lang-cell is-warn" dir="ltr" title={t('admin.langsMissing')}>
            {missing.map((l) => l.toUpperCase()).join(' · ')}
          </span>
        ) : (
          <span className="lang-cell is-ok" dir="ltr" title={t('admin.langsOk')}>✓</span>
        );
      },
    };
  }, [tab, t, missingLangs]);

  const serialize = useCallback((v) => {
    if (tab === 'schedule') return { ...v, day: Number(v.day) || 0 };
    if (tab === 'announcements') return { ...v, pinned: v.pinned ? 1 : 0 };
    if (tab === 'programs') return { ...v, ord: Number(v.ord) || 0 };
    return v;
  }, [tab]);

  const openNew = () => setModal({ id: null, initial: null });
  const openEdit = (row) => setModal({ id: row.id, initial: row });
  const closeModal = () => setModal(null);

  /* One "add" entry point for the whole panel: jump straight to the target
     section and open its form, or focus its file picker, so nothing has to be
     hunted for in the sidebar first. */
  const startAdd = (target) => {
    setAddOpen(false);
    addTarget.current = target;
    setTab(target);
    // For tabs with inline forms (resources, media) we'll open them immediately
    // after the tab switch; for others open the modal.
    if (target === 'media') {
      // media handled in useEffect below
      setAddSignal((n) => n + 1);
    } else if (target === 'resources') {
      // resources: open modal directly after tab switch
      setTimeout(() => setModal({ id: null, initial: null }), 50);
    } else {
      setModal({ id: null, initial: null });
    }
  };
  useEffect(() => {
    if (!addSignal) return;
    if (addTarget.current === 'media' && tab === 'media') mediaInput.current?.click();
    addTarget.current = null;
  }, [addSignal, tab]);

  useEffect(() => {
    if (!addOpen) return undefined;
    const onDocDown = (e) => { if (!addWrap.current?.contains(e.target)) setAddOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setAddOpen(false); };
    document.addEventListener('pointerdown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [addOpen]);

  const [mailStatus, setMailStatus] = useState(null);
  const checkMail = useCallback(() => api.get('/api/admin/mail/status').then(setMailStatus).catch(() => {}), []);
  useEffect(() => { checkMail(); }, [checkMail]);

  const replyByEmail = async (id) => {
    const r = await api.post(`/api/admin/messages/${id}/reply`, { subject: '', body: '' });
    if (r?.mailto) window.location.href = r.mailto;
    else notify('err', t('admin.msg.reply') + ' failed');
  };

  const submitModal = async (v) => {
    setBusy(true);
    try {
      const payload = serialize(v);
      if (modal.id == null) await api.post('/api/admin/' + tab, payload);
      else await api.put('/api/admin/' + tab + '/' + modal.id, payload);
      setModal(null);
      await sec.load();
      loadAll();
      notify('ok', t('admin.saved'));
    } catch {
      notify('err', t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const deleteRow = async (row) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      await api.del('/api/admin/' + tab + '/' + row.id);
      await sec.load();
      loadAll();
      notify('ok', t('common.delete') + ' ✓');
    } catch {
      notify('err', t('common.error'));
    }
  };

  /* ---------- messages ---------- */
  const [messages, setMessages] = useState([]);
  const loadMessages = useCallback(() => {
    api.get('/api/admin/messages').then((d) => { setMessages(d); loadAll(); }).catch(() => {});
  }, [loadAll]);
  useEffect(() => { if (tab === 'messages') loadMessages(); }, [tab, loadMessages]);
  const markRead = async (id) => { try { await api.post(`/api/admin/messages/${id}/read`, {}); loadMessages(); } catch {} };
  const delMsg = async (id) => { try { await api.del(`/api/admin/messages/${id}`); loadMessages(); } catch {} };

  /* ---------- media ---------- */
  const uploadMedia = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    try {
      await api.upload('/api/admin/media', fd);
      loadMedia(); loadAll();
      notify('ok', t('admin.upload.done'));
    } catch {
      notify('err', t('common.error'));
    } finally { setBusy(false); e.target.value = ''; }
  };
  const copyMedia = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      notify('ok', t('admin.media.copied'));
    } catch {
      notify('err', t('admin.media.copyFailed'));
    }
  };
  const delMedia = async (name) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      await api.del('/api/admin/media/' + encodeURIComponent(name));
      loadMedia(); loadAll();
      notify('ok', t('admin.media.deleted'));
    } catch {
      notify('err', t('admin.media.inUse'));
    }
  };

  /* ---------- settings ---------- */
  const [pw, setPw] = useState({ current: '', next: '' });
  const saveSite = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {};
    for (const key of ['school_name_ar', 'school_name_fr', 'school_name_en', 'welcome_ar', 'welcome_fr', 'welcome_en', 'address_ar', 'address_fr', 'address_en', 'phone', 'email', 'facebook', 'logo', 'photo']) {
      payload[key] = fd.get(key) || '';
    }
    try {
      const d = await api.put('/api/admin/site', payload);
      setSettings(d.site);
      notify('ok', '✓');
    } catch { notify('err', t('common.error')); }
  };
  const changePw = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/auth/password', { current: pw.current, next: pw.next });
      setPw({ current: '', next: '' });
      notify('ok', t('admin.pw.done'));
    } catch (err) {
      notify('err', err.message === 'weak_password' ? t('admin.pw.weak') : t('admin.pw.bad'));
    }
  };
  const pickSetting = (field, url) => setSettings((s) => { const n = { ...s, [field]: url }; return n; });

  /* School-details checklist: every visitor-visible field with its real state,
     so a blank one is visible and one click away instead of silently missing
     from the public site. */
  const BUILTIN_PHOTOS = ['img/hero.jpg', 'img/activity.jpg', 'img/projects.jpg', 'img/sports.jpg'];
  const siteChecks = useMemo(() => {
    if (!settings) return [];
    const all = (keys) => keys.every((k) => isFilled(settings[k]));
    const any = (keys) => keys.some((k) => isFilled(settings[k]));
    return [
      { id: 'name', label: t('admin.check.name'), keys: ['school_name_ar', 'school_name_fr', 'school_name_en'], ok: all(['school_name_ar', 'school_name_fr', 'school_name_en']), optional: false },
      { id: 'welcome', label: t('admin.check.welcome'), keys: ['welcome_ar', 'welcome_fr', 'welcome_en'], ok: all(['welcome_ar', 'welcome_fr', 'welcome_en']), optional: false },
      { id: 'address', label: t('admin.check.address'), keys: ['address_ar', 'address_fr', 'address_en'], ok: any(['address_ar', 'address_fr', 'address_en']), optional: false },
      { id: 'contact', label: t('admin.check.contact'), keys: ['phone', 'email'], ok: any(['phone', 'email']), optional: false },
      { id: 'social', label: t('admin.check.social'), keys: ['facebook'], ok: isFilled(settings.facebook), optional: true },
      { id: 'images', label: t('admin.check.images'), keys: ['logo', 'photo'], ok: isFilled(settings.logo) || isFilled(settings.photo), optional: true },
    ];
  }, [settings, t]);
  const requiredGaps = siteChecks.filter((c) => !c.optional && !c.ok);

  const focusSetting = (keys) => {
    const inputs = keys.map((k) => document.querySelector(`[name="${k}"]`)).filter(Boolean);
    const target = inputs.find((i) => !isFilled(i.value)) || inputs[0];
    if (!target) return;
    target.focus();
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  return (
    <div className="admin">
      <div className="admin-side">
        <h1 className="admin-brand">{t('admin.title')}</h1>
        <div className="admin-addwrap" ref={addWrap}>
          <button
            type="button"
            className="admin-add"
            aria-expanded={addOpen}
            aria-controls="admin-add-menu"
            onClick={() => setAddOpen((o) => !o)}
          >
            <span>＋ {t('admin.addAnything')}</span>
            <span className="admin-add-caret" aria-hidden="true">▾</span>
          </button>
          {addOpen && (
            <div className="admin-add-menu" id="admin-add-menu">
              {ADDABLE.map((k) => (
                <button key={k} type="button" onClick={() => startAdd(k)}>
                  <span className="admin-add-icon" aria-hidden="true">＋</span>
                  {t(`admin.tabs.${k}`)}
                </button>
              ))}
            </div>
          )}
        </div>
        {mailStatus && (
          <div className="admin-mail-status" title={mailStatus.lastError || (mailStatus.enabled ? 'Mail enabled' : 'Mail not configured')}>
            <span className={mailStatus.enabled ? 'is-ok' : 'is-warn'} aria-hidden="true">{mailStatus.enabled ? '✉' : '✉'}</span>
            <span>{mailStatus.enabled ? t('admin.mail.enabled') : t('admin.mail.disabled')}</span>
            {mailStatus.lastError && <span className="err">{mailStatus.lastError}</span>}
          </div>
        )}
        <nav className="admin-tabs" role="tablist" aria-label={t('admin.title')}>
          {TABS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'is-active' : ''}`} onClick={() => setTab(k)}>
              {t(`admin.tabs.${k}`)}
              {k === 'messages' && stats?.unread > 0 && <span className="badge">{stats.unread}</span>}
            </button>
          ))}
        </nav>
        <button className="admin-logout" onClick={logout}>→ {t('admin.logout')}</button>
      </div>

      <div className="admin-main">
        {tab === 'overview' && (
          <div className="overview">
            <h2>{t('admin.tabs.overview')}</h2>
            <div className="stat-grid">
              {stats && Object.entries(stats).filter(([k]) => !['unread', 'media'].includes(k)).map(([k, v]) => (
                <div key={k} className="stat-card big">
                  <strong>{v}</strong>
                  <span>{t(`admin.tabs.${k}`)}</span>
                </div>
              ))}
              {stats && (
                <div className="stat-card big accent"><strong>{stats.unread}</strong><span>{t('admin.stats.unread')}</span></div>
              )}
            </div>
            <h3>{t('admin.tabs.messages')}</h3>
            <div className="table-wrap">
              <table className="table table--admin">
                <tbody>
                  {recent.length === 0 && <tr><td className="empty-note">{t('common.empty')}</td></tr>}
                  {recent.map((m) => (
                    <tr key={m.id} className={m.read ? '' : 'unread-row'}>
                      <td><b>{m.name}</b> · {m.email}</td>
                      <td>{m.subject}</td>
                      <td>{String(m.created_at).split(' ')[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'analytics' && <AnalyticsTab t={t} />}

        {isCrudTab && (
          <div className="crud">
            <div className="crud-head">
              <h2>{t(`admin.tabs.${tab}`)}</h2>
              <button className="btn primary" onClick={openNew}>+ {t('admin.new')}</button>
            </div>
            {sec.loading ? (
              <p className="empty-note">{t('common.loading')}</p>
            ) : (
              <DataTable
                cols={langsCol ? [langsCol, ...colsOf] : colsOf}
                rows={sec.items}
                empty={t('common.empty')}
                emptyAction={(
                  <button type="button" className="btn primary" onClick={openNew}>＋ {t('admin.firstItem')}</button>
                )}
                onEdit={openEdit}
                onDelete={deleteRow}
                i18n={{ edit: t('common.edit'), delete: t('common.delete') }}
              />
            )}
          </div>
        )}

        {tab === 'resources' && <ResourcesTab t={t} notify={notify} />}

        {tab === 'messages' && (
          <div className="crud">
            <div className="crud-head"><h2>{t('admin.tabs.messages')}</h2></div>
            <div className="table-wrap">
              <table className="table table--admin">
                <thead><tr><th>{t('sections.contact.name')}</th><th>{t('sections.contact.subject')}</th><th>{t('sections.contact.message')}</th><th>{t('sections.contact.email')}</th><th /></tr></thead>
                <tbody>
                  {messages.length === 0 && <tr><td colSpan={5} className="empty-note">{t('common.empty')}</td></tr>}
                  {messages.map((m) => (
                    <tr key={m.id} className={m.read ? '' : 'unread-row'}>
                      <td><b>{m.name}</b></td>
                      <td>{m.subject}</td>
                      <td>{m.body.slice(0, 90)}{m.body.length > 90 ? '…' : ''}</td>
                      <td>{m.email}<br /><small>{String(m.created_at).split(' ')[0]}</small></td>
                      <td className="row-actions">
                        {!m.read && <button type="button" className="mini" onClick={() => markRead(m.id)}>{t('admin.msg.mark')}</button>}
                        <button type="button" className="mini" onClick={() => replyByEmail(m.id)}>{t('admin.msg.reply')}</button>
                        <button type="button" className="mini mini--danger" aria-label={t('common.delete')} title={t('common.delete')} onClick={() => delMsg(m.id)}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'media' && (
          <div className="crud">
            <div className="crud-head">
              <h2>{t('admin.tabs.media')}</h2>
              <label
                className="btn primary upload-btn"
                role="button"
                tabIndex="0"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.currentTarget.querySelector('input')?.click();
                  }
                }}
              >
                + {t('admin.upload.add')}
                <input ref={mediaInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadMedia} hidden={false} style={{ display: 'none' }} />
              </label>
            </div>
            <div className="media-grid">
              {media.map((m) => (
                <div key={m.name} className="media-item">
                  <img src={m.url} alt="" loading="lazy" />
                  <div className="media-actions">
                    <button type="button" className="mini" aria-label={t('admin.media.copy')} title={t('admin.media.copy')} onClick={() => copyMedia(m.url)}>⧉</button>
                    <button type="button" className="mini mini--danger" aria-label={t('common.delete')} title={t('common.delete')} onClick={() => delMedia(m.name)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="crud">
            <div className="crud-head"><h2>{t('admin.tabs.settings')}</h2></div>
            {settings && (
              <>
                <div className="site-check">
                  <span className="site-check-title">{t('admin.checkTitle')}</span>
                  {siteChecks.map((c) => (
                    <span key={c.id} className={`site-check-item ${c.ok ? 'is-ok' : c.optional ? 'is-optional' : 'is-warn'}`}>
                      <i aria-hidden="true">{c.ok ? '✓' : c.optional ? '○' : '!'}</i>
                      {c.label}
                      {!c.ok && <button type="button" className="mini" onClick={() => focusSetting(c.keys)}>{t('admin.checkFill')}</button>}
                    </span>
                  ))}
                </div>
                {requiredGaps.length > 0 && (
                  <p className="site-check-note">
                    {t('admin.checkMissing')}: {requiredGaps.map((c) => c.label).join(' · ')}
                  </p>
                )}
              </>
            )}
            {settings && (
              <form className="settings-form" onSubmit={saveSite}>
                {[
                  ['school_name', 3], ['welcome', 3], ['address', 3],
                ].map(([base, n]) => (
                  <div key={base} className="field-group">
                    <h3>{t(`admin.fields.${base}_ar`)}</h3>
                    {['ar', 'fr', 'en'].map((l) => (
                      <label key={l} className="field">
                        <span>{l.toUpperCase()}</span>
                        {base === 'welcome' ? (
                          <textarea rows={2} name={`${base}_${l}`} defaultValue={settings[`${base}_${l}`]} />
                        ) : (
                          <input name={`${base}_${l}`} defaultValue={settings[`${base}_${l}`]} />
                        )}
                      </label>
                    ))}
                  </div>
                ))}

                <div className="field-group">
                  <h3>{t('admin.fields.phone')} / {t('admin.fields.email')} / Facebook</h3>
                  <label className="field"><span>{t('admin.fields.phone')}</span><input name="phone" defaultValue={settings.phone} dir="ltr" /></label>
                  <label className="field"><span>{t('admin.fields.email')}</span><input name="email" defaultValue={settings.email} dir="ltr" /></label>
                  <label className="field"><span>{t('admin.fields.facebook')}</span><input name="facebook" defaultValue={settings.facebook} dir="ltr" /></label>
                </div>

                <div className="field-group">
                  <h3>Images</h3>
                  {['logo', 'photo'].map((f) => (
                    <label key={f} className="field">
                      <span>{t(`admin.fields.${f}`)}</span>
                      <select name={f} defaultValue={settings[f]} onChange={(e) => pickSetting(f, e.target.value)}>
                        <option value="">—</option>
                        {settings[f] && !media.some((m) => m.url === settings[f]) && <option value={settings[f]}>{settings[f]}</option>}
                        {media.length > 0 && (
                          <optgroup label={t('admin.media.library')}>
                            {media.map((m) => <option key={m.name} value={m.url}>{m.name}</option>)}
                          </optgroup>
                        )}
                        {f === 'photo' && (
                          <optgroup label={t('admin.photosBuiltin')}>
                            {BUILTIN_PHOTOS.map((p) => <option key={p} value={p}>{p}</option>)}
                          </optgroup>
                        )}
                      </select>
                    </label>
                  ))}
                </div>

                <button className="btn primary" type="submit">{t('common.save')}</button>
              </form>
            )}

            <div className="field-group">
              <h3>{t('admin.pw.change')}</h3>
              <form className="settings-form" onSubmit={changePw}>
                <label className="field"><span>{t('admin.fields.current')}</span>
                  <input type="password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} autoComplete="current-password" /></label>
                <label className="field"><span>{t('admin.fields.next')}</span>
                  <input type="password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} autoComplete="new-password" /></label>
                <button className="btn primary" type="submit">{t('common.save')}</button>
              </form>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <FormModal
          title={`${t('admin.tabs.' + tab)} — ${modal.id == null ? t('admin.new') : t('common.edit')}`}
          fields={fieldsOf}
          initial={modal.initial}
          onClose={closeModal}
          onSubmit={submitModal}
          onFilled={() => notify('ok', t('admin.allFilled'))}
          busy={busy}
        />
      )}
      <Toast toast={toast} />
    </div>
  );
}

/* ---------- resources tab ---------- */
function ResourcesTab({ t, notify }) {
  const [items, setItems] = useState([]);
  const [file, setFile] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title_ar: '', title_fr: '', title_en: '', subject_ar: '', subject_fr: '', subject_en: '', level: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { api.get('/api/admin/resources').then(setItems).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!editing && !file) return notify('err', t('sections.resources.empty'));
    setBusy(true);
    try {
      if (editing) {
        await api.put(`/api/admin/resources/${editing.id}`, form);
      } else {
        const fd = new FormData();
        for (const [k, v] of Object.entries(form)) fd.append(k, v);
        fd.append('file', file);
        await api.upload('/api/admin/resources', fd);
      }
      setForm({ title_ar: '', title_fr: '', title_en: '', subject_ar: '', subject_fr: '', subject_en: '', level: '' });
      setFile(null);
      setEditing(null);
      e.target.reset();
      load();
      notify('ok', t('admin.saved'));
    } catch {
      notify('err', t('common.error'));
    } finally { setBusy(false); }
  };

  const edit = (row) => {
    setEditing(row);
    setFile(null);
    setForm({
      title_ar: row.title_ar || '', title_fr: row.title_fr || '', title_en: row.title_en || '',
      subject_ar: row.subject_ar || '', subject_fr: row.subject_fr || '', subject_en: row.subject_en || '', level: row.level || '',
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm({ title_ar: '', title_fr: '', title_en: '', subject_ar: '', subject_fr: '', subject_en: '', level: '' });
  };

  const del = async (id) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try { await api.del('/api/admin/resources/' + id); load(); } catch { notify('err', t('common.error')); }
  };

  const label = (k) => t(`admin.fields.${k}`);

  return (
    <div className="crud">
      <div className="crud-head"><h2>{t('admin.tabs.resources')}</h2></div>

      <form className="upload-form" onSubmit={submit} aria-label={editing ? t('common.edit') : t('admin.new')}>
        <div className="field-grid">
          {['title_ar', 'title_fr', 'title_en'].map((k) => (
            <label key={k} className="field"><span>{label(k)}</span>
              <input value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} required /></label>
          ))}
          {['subject_ar', 'subject_fr', 'subject_en'].map((k) => (
            <label key={k} className="field"><span>{label(k)}</span>
              <input value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} required /></label>
          ))}
          <label className="field"><span>{label('level')}</span>
            <input value={form.level} onChange={(e) => setForm((p) => ({ ...p, level: e.target.value }))} required /></label>
          <label className="field"><span>{label('file')}</span>
            <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} required={!editing} /></label>
        </div>
        <button className="btn primary" type="submit" disabled={busy}>{editing ? t('common.save') : `+ ${t('admin.new')}`}</button>
        {editing && <button className="btn ghost" type="button" onClick={cancelEdit}>{t('common.cancel')}</button>}
      </form>

      <div className="table-wrap">
        <table className="table table--admin">
          <thead><tr><th>AR · FR · EN</th><th>{label('subject_ar')}</th><th>{label('level')}</th><th>PDF</th><th>{t('admin.analytics.downloads')}</th><th /></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={6} className="empty-note">{t('common.empty')}</td></tr>}
            {items.map((r) => (
              <tr key={r.id}>
                <td>{[r.title_ar, r.title_fr, r.title_en].filter(Boolean).join(' | ')}</td>
                <td>{[r.subject_ar, r.subject_fr, r.subject_en].filter(Boolean).join(' | ')}</td>
                <td>{r.level}</td>
                <td><a href={`/api/resources/${r.id}/download?preview=1`} target="_blank" rel="noopener noreferrer">↓</a></td>
                <td>{new Intl.NumberFormat().format(Number(r.download_count || 0))}</td>
                <td className="row-actions"><button type="button" className="mini" aria-label={t('common.edit')} title={t('common.edit')} onClick={() => edit(r)}>✎</button><button type="button" className="mini mini--danger" aria-label={t('common.delete')} title={t('common.delete')} onClick={() => del(r.id)}>🗑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- privacy-first analytics tab ---------- */
function AnalyticsTab({ t }) {
  const { lang, dir } = useI18n();
  const [range, setRange] = useState(30);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
    api.get(`/api/admin/analytics?days=${range}`)
      .then((data) => { if (active) setReport(data); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range]);

  useEffect(() => load(), [load]);

  const number = (value) => new Intl.NumberFormat(lang).format(Number(value || 0));
  const eventLabel = (type) => t(`admin.analytics.events.${type}`);
  const eventData = (report?.event_types || []).map((item) => ({ label: eventLabel(item.type), value: item.count }));
  const languageData = (report?.languages || []).map((item) => ({ label: t(`langs.${item.language}`), value: item.count }));
  const cards = report ? [
    { key: 'visitors', label: t('admin.analytics.visitors'), value: report.totals.visitor_days ?? report.totals.visitors, series: report.timeline.map((d) => ({ value: d.visitors })), color: '#0B3C49' },
    { key: 'interactions', label: t('admin.analytics.interactions'), value: report.totals.interactions, series: report.timeline.map((d) => ({ value: d.total })), color: '#4A6B52' },
    { key: 'sections', label: t('admin.analytics.sectionsViewed'), value: report.totals.section_view, series: report.timeline.map((d) => ({ value: d.sections })), color: '#8C3A2E' },
    { key: 'downloads', label: t('admin.analytics.downloads'), value: report.totals.resource_download, series: report.timeline.map((d) => ({ value: d.downloads })), color: '#E0A33C' },
  ] : [];

  if (loading && !report) return <div className="crud"><p className="empty-note">{t('common.loading')}</p></div>;
  if (error && !report) {
    return (
      <div className="crud analytics-empty">
        <p className="empty-note">{t('common.error')}</p>
        <button type="button" className="btn primary" onClick={load}>{t('admin.analytics.retry')}</button>
      </div>
    );
  }
  if (!report) return null;

  return (
    <div className="crud analytics-tab">
      <div className="crud-head analytics-head">
        <div>
          <h2>{t('admin.tabs.analytics')}</h2>
          <p className="analytics-subtitle">{t('admin.analytics.subtitle')}</p>
        </div>
        <div className="range-switch" role="group" aria-label={t('admin.analytics.range')}>
          {[7, 30, 90].map((days) => (
            <button type="button" key={days} className={range === days ? 'is-active' : ''} onClick={() => setRange(days)} aria-pressed={range === days}>
              {t(`admin.analytics.ranges.${days}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="analytics-summary">
        {cards.map((card) => (
          <div className="analytics-stat" key={card.key}>
            <div><span>{card.label}</span><strong>{number(card.value)}</strong></div>
            <Sparkline data={card.series} color={card.color} label={`${card.label}: ${t('admin.analytics.rangeTrend')}`} />
          </div>
        ))}
      </div>

      {error && <button type="button" className="btn ghost analytics-retry" onClick={load}>{t('admin.analytics.retry')}</button>}

      <section className="chart-card chart-card--wide">
        <div className="chart-card-head">
          <div><h3>{t('admin.analytics.traffic')}</h3><p>{t('admin.analytics.trafficHelp')}</p></div>
          <span>{report.range.from} → {report.range.to}</span>
        </div>
        <AreaChart
          data={report.timeline}
          yKey="total"
          label={t('admin.analytics.traffic')}
          emptyLabel={t('admin.analytics.empty')}
          rtl={dir === 'rtl'}
        />
      </section>

      <div className="analytics-grid">
        <section className="chart-card">
          <div className="chart-card-head"><div><h3>{t('admin.analytics.eventTypes')}</h3><p>{t('admin.analytics.eventsHelp')}</p></div></div>
          <BarChart data={eventData} label={t('admin.analytics.eventTypes')} emptyLabel={t('admin.analytics.empty')} rtl={dir === 'rtl'} formatValue={number} />
        </section>
        <section className="chart-card">
          <div className="chart-card-head"><div><h3>{t('admin.analytics.languages')}</h3><p>{t('admin.analytics.languagesHelp')}</p></div></div>
          <DonutChart data={languageData} centerLabel={t('admin.analytics.visitors')} emptyLabel={t('admin.analytics.empty')} formatValue={number} />
        </section>
      </div>

      <div className="analytics-grid analytics-grid--rankings">
        <section className="chart-card">
          <div className="chart-card-head"><div><h3>{t('admin.analytics.topSections')}</h3><p>{t('admin.analytics.topSectionsHelp')}</p></div></div>
          {report.sections.length ? (
            <div className="ranking-list">
              {report.sections.map((item) => {
                const max = Math.max(1, ...report.sections.map((entry) => entry.count));
                return (
                  <div className="ranking-row" key={item.target}>
                    <div><span>{t(`nav.${item.target}`)}</span><b>{number(item.count)}</b></div>
                    <i><em style={{ width: `${(item.count / max) * 100}%` }} /></i>
                  </div>
                );
              })}
            </div>
          ) : <p className="empty-note">{t('admin.analytics.empty')}</p>}
        </section>

        <section className="chart-card">
          <div className="chart-card-head"><div><h3>{t('admin.analytics.topResources')}</h3><p>{t('admin.analytics.topResourcesHelp')}</p></div></div>
          {report.resources.length ? (
            <div className="table-wrap analytics-table">
              <table className="table table--admin">
                <thead><tr><th>{t('admin.tabs.resources')}</th><th>{t('admin.analytics.selectedRange')}</th><th>{t('admin.analytics.allTime')}</th></tr></thead>
                <tbody>
                  {report.resources.map((item) => (
                    <tr key={item.id}>
                      <td>{item[`title_${lang}`] || '—'}</td>
                      <td>{number(item.downloads)}</td>
                      <td>{number(item.all_time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty-note">{t('admin.analytics.noResources')}</p>}
        </section>
      </div>

      <section className="privacy-note">
        <div className="privacy-icon" aria-hidden="true">✓</div>
        <div>
          <h3>{t('admin.analytics.privacyTitle')}</h3>
          <p>{t('admin.analytics.privacyText')}</p>
          <small>{t('admin.analytics.retention', { days: report.privacy.retention_days })} · {t('admin.analytics.updated', { time: new Date(report.generated_at).toLocaleString(lang) })}</small>
        </div>
      </section>
    </div>
  );
}