import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ar from './locales/ar.json';
import fr from './locales/fr.json';
import en from './locales/en.json';
import { track } from './analytics.js';

export const LANGS = { ar, fr, en };
const STORE = 'khm_lang';

/* ?lang=xx wins over the stored preference: it makes every language a real,
   shareable, indexable URL (and keeps the hreflang set honest). */
function queryLang() {
  try {
    const v = new URLSearchParams(window.location.search).get('lang');
    return v && Object.hasOwn(LANGS, v) ? v : null;
  } catch {
    return null;
  }
}

const I18nCtx = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const fromUrl = queryLang();
    if (fromUrl) return fromUrl;
    try {
      const v = localStorage.getItem(STORE);
      return Object.hasOwn(LANGS, v) ? v : 'en';
    } catch {
      return 'en';
    }
  });

  const setLang = useCallback((l) => {
    if (!Object.hasOwn(LANGS, l)) return;
    try { localStorage.setItem(STORE, l); } catch {}
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', l);
      window.history.replaceState(null, '', url);
    } catch {}
    if (lang !== l) track('lang_switch', l, l);
    setLangState(l);
  }, [lang]);

  const t = useCallback(
    (path, vars) => {
      const val = path.split('.').reduce((o, k) => (o ? o[k] : undefined), LANGS[lang]);
      let s = val !== undefined && val !== null ? String(val) : path;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      }
      return s;
    },
    [lang]
  );

  const value = useMemo(
    () => ({ lang, setLang, t, dir: lang === 'ar' ? 'rtl' : 'ltr' }),
    [lang, setLang, t]
  );

  useEffect(() => {
    document.documentElement.setAttribute('dir', value.dir);
    document.documentElement.setAttribute('lang', lang);
    document.title = t('meta.title');
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute('content', t('meta.description'));
  }, [value.dir, lang, t]);

  // keep the SEO head pointing at the language actually on screen
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', lang);
      const href = `${url.origin}${url.pathname}?lang=${lang}`;
      const canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.setAttribute('href', href);
      const ogUrl = document.querySelector('meta[property="og:url"]');
      if (ogUrl) ogUrl.setAttribute('content', href);
      const ogLocale = document.querySelector('meta[property="og:locale"]');
      if (ogLocale) ogLocale.setAttribute('content', `khm_${lang}`);
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', t('meta.title'));
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute('content', t('meta.description'));
      const twTitle = document.querySelector('meta[name="twitter:title"]');
      if (twTitle) twTitle.setAttribute('content', t('meta.title'));
      const twDesc = document.querySelector('meta[name="twitter:description"]');
      if (twDesc) twDesc.setAttribute('content', t('meta.description'));
      const ld = document.getElementById('ld-school');
      if (ld) {
        const data = JSON.parse(ld.textContent);
        data.inLanguage = [lang];
        if (data.name) data.name = t('meta.title');
        // the JSON-LD must describe THIS language page, not the default one
        if (data.url) data.url = href;
        ld.textContent = JSON.stringify(data);
      }
    } catch {}
  }, [lang, t]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);