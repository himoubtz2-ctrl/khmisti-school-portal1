import { useI18n } from '../i18n.jsx';
import { useSite } from '../App.jsx';
import LangSwitch from './LangSwitch.jsx';
import ThemeToggle from './ThemeToggle.jsx';

export default function Footer() {
  const { t, lang } = useI18n();
  const { site } = useSite();
  const name = site?.[`school_name_${lang}`] || t('meta.title');

  const links = [
    ['announcements', t('nav.announcements')],
    ['news', t('nav.news')],
    ['programs', t('nav.programs')],
    ['schedule', t('nav.schedule')],
    ['exams', t('nav.exams')],
    ['resources', t('nav.resources')],
  ];
  const school = [
    ['about', t('nav.about')],
    ['contact', t('nav.contact')],
  ];

  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          {site?.logo && <span className="brand-logo"><img src={site.logo} alt="" /></span>}
          <div>
            <strong>{name}</strong>
            <p>{t('footer.about')}</p>
          </div>
        </div>
        <div className="footer-col">
          <h3>{t('footer.links')}</h3>
          {links.map(([k, label]) => (
            <a key={k} href={`#${k}`}>{label}</a>
          ))}
        </div>
        <div className="footer-col">
          <h3>{t('footer.school')}</h3>
          {school.map(([k, label]) => (
            <a key={k} href={`#${k}`}>{label}</a>
          ))}
          {site?.facebook && (
            <a href={site.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>
          )}
          <div className="footer-tools">
            <ThemeToggle withLabel />
            <LangSwitch compact />
          </div>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} {name}</span>
        <span>
          {t('footer.credits')}:{' '}
          <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer">Unsplash</a>
          {' · '}
          <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer">Pexels</a>
        </span>
      </div>
    </footer>
  );
}