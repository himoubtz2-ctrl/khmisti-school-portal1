import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { track } from './analytics.js';

const STORE = 'khm_theme';
const COLORS = { light: '#fbfaf7', dark: '#0a141a' };
const ThemeCtx = createContext(null);

/* theme-init.js already stamped <html data-theme>, so the first render is correct */
function initialTheme() {
  if (typeof document === 'undefined') return 'light';
  const stamped = document.documentElement.getAttribute('data-theme');
  return stamped === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem(STORE, theme); } catch {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COLORS[theme]);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      track('theme_switch', next, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, isDark: theme === 'dark', setTheme, toggle }), [theme, toggle]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
