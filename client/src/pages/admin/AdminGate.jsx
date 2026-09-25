import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { api, setAdminKey, hasAdminKey } from '../../api.js';
import { useI18n } from '../../i18n.jsx';

export default function AdminGate() {
  const { t } = useI18n();
  const location = useLocation();
  const [params] = useSearchParams();
  const [state, setState] = useState('checking');

  useEffect(() => {
    const key = params.get('k') || sessionStorage.getItem('khm_admin_key') || '';
    setAdminKey(key);
    if (key && params.has('k')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (!key) {
      setState('denied');
      return;
    }
    api
      .get('/api/auth/me')
      .then(() => setState('ok'))
      .catch((e) => {
        if (e.status === 401) setState('login');
        else setState('denied');
      });
  }, [params]);

  if (state === 'denied') {
    return (
      <div className="nf">
        <div className="nf-code">404</div>
        <a className="btn primary" href="/">← {t('nav.home')}</a>
      </div>
    );
  }
  if (!hasAdminKey()) return <div className="admin-splash">{t('admin.subtitle')}</div>;

  if (state === 'checking') {
    return <div className="admin-splash admin-splash--blink">{t('common.loading')}</div>;
  }
  if (state === 'ok') {
    return location.pathname === '/admin/dashboard' ? <Outlet /> : <Navigate to="/admin/dashboard" replace />;
  }
  return <Outlet />;
}