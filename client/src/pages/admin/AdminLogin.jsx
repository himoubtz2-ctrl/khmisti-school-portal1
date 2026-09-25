import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';

export default function AdminLogin() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.post('/api/auth/login', { username: user, password: pass });
      nav('/admin/dashboard', { replace: true });
    } catch {
      setErr(t('admin.loginErr'));
      setBusy(false);
    }
  };

  return (
    <div className="admin-login">
      <form className="admin-card" onSubmit={submit}>
        <h1 className="admin-logo">{t('admin.title')}</h1>
        <p className="admin-sub">{t('admin.subtitle')}</p>
        <label>
          <span>{t('admin.user')}</span>
          <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" autoFocus />
        </label>
        <label>
          <span>{t('admin.pass')}</span>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
        </label>
        {err && <p className="admin-err">{err}</p>}
        <button className="btn primary" type="submit" disabled={busy || !user || !pass}>
          {busy ? t('common.loading') : t('admin.login')}
        </button>
      </form>
    </div>
  );
}