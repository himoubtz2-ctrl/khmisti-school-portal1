import { useI18n } from '../i18n.jsx';
import { useTheme } from '../theme.jsx';

const Sun = () => (
  <svg viewBox="0 0 24 24" className="ti ti--sun" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.3 5.3l1.9 1.9M16.8 16.8l1.9 1.9M18.7 5.3l-1.9 1.9M7.2 16.8l-1.9 1.9" />
  </svg>
);

const Moon = () => (
  <svg viewBox="0 0 24 24" className="ti ti--moon" aria-hidden="true" focusable="false">
    <path d="M20.5 14.4A8.6 8.6 0 1 1 9.6 3.5a7 7 0 0 0 10.9 10.9Z" />
  </svg>
);

/* Colour-mode switch. Keyboard reachable, announced, and it is one of the
   few controls that legitimately reflects state through aria-pressed. */
export default function ThemeToggle({ withLabel = false }) {
  const { t } = useI18n();
  const { isDark, toggle } = useTheme();
  const label = isDark ? t('theme.toLight') : t('theme.toDark');

  return (
    <button
      type="button"
      className={`theme-toggle${withLabel ? ' theme-toggle--labelled' : ''}`}
      onClick={toggle}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
    >
      <span className="theme-toggle__track" aria-hidden="true">
        <Sun />
        <Moon />
      </span>
      {withLabel && <span className="theme-toggle__label">{label}</span>}
    </button>
  );
}
