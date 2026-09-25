import { useEffect, useState } from 'react';
import { useI18n } from '../i18n.jsx';
import { useSite } from '../App.jsx';
import LangSwitch from './LangSwitch.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const LINKS = ['home', 'announcements', 'news', 'programs', 'schedule', 'exams', 'resources', 'about', 'contact'];

export default function Nav() {
  const { t, lang } = useI18n();
  const { site } = useSite();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // No placeholder monogram: the mark only appears once a real logo is uploaded
  // from the admin panel, and the name always falls back to a real school name.
  const name = site?.[`school_name_${lang}`] || t('meta.title');
  const sections = LINKS.filter((k) => k !== 'home');

  return (
    <header className={`nav ${scrolled ? 'nav--scrolled' : ''}`}>
      <div className="container nav-inner">
        <a className="brand" href="#home" onClick={() => setOpen(false)}>
          {site?.logo && <span className="brand-logo"><img src={site.logo} alt="" /></span>}
          <span className="brand-text">
            <strong>{name}</strong>
            <small>{t('topbar.location')}</small>
          </span>
        </a>

        <nav id="primary-navigation" className={`nav-links ${open ? 'is-open' : ''}`}>
          {sections.map((k) => (
            <a key={k} href={`#${k}`} onClick={() => setOpen(false)}>
              {t(`nav.${k}`)}
            </a>
          ))}
        </nav>

        <div className="nav-actions">
          <ThemeToggle />
          <LangSwitch compact />
          <button
            className="nav-burger"
            aria-label={t('nav.menu')}
            aria-expanded={open}
            aria-controls="primary-navigation"
            onClick={() => setOpen((v) => !v)}
          >
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
  );
}