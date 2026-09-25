import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Route, Routes, Outlet } from 'react-router-dom';
import { I18nProvider, useI18n } from './i18n.jsx';
import { ThemeProvider } from './theme.jsx';
import { api } from './api.js';
import Nav from './components/Nav.jsx';
import Footer from './components/Footer.jsx';
import Home from './pages/Home.jsx';
import NotFound from './pages/NotFound.jsx';
import AdminGate from './pages/admin/AdminGate.jsx';
import AdminLogin from './pages/admin/AdminLogin.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';

const SiteCtx = createContext(null);
export const useSite = () => useContext(SiteCtx);

function SiteProvider({ children }) {
  const [site, setSite] = useState(null);
  const [counts, setCounts] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get('/api/site');
      setSite(d.site);
      setCounts(d.counts);
    } catch {
      setSite(null);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const value = useMemo(() => ({ site, counts, reload: load }), [site, counts, load]);
  return <SiteCtx.Provider value={value}>{children}</SiteCtx.Provider>;
}

function PublicLayout() {
  const { t } = useI18n();
  return (
    <>
      <a className="skip-link" href="#main-content">{t('common.skip')}</a>
      <Nav />
      <main id="main-content">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <SiteProvider>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<Home />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="/admin" element={<AdminGate />}>
              <Route index element={<AdminLogin />} />
              <Route path="dashboard" element={<AdminDashboard />} />
            </Route>
          </Routes>
        </SiteProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}