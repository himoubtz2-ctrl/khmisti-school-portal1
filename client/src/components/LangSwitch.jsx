import { useI18n } from '../i18n.jsx';

const ORDER = ['en', 'fr', 'ar'];

export default function LangSwitch({ compact = false }) {
  const { lang, setLang, t } = useI18n();

  return (
    <div className={`langs ${compact ? 'langs--compact' : ''}`} role="group" aria-label={t('langs.choose')}>
      {ORDER.map((l) => (
        <button
          key={l}
          className={`lang-btn ${lang === l ? 'is-active' : ''}`}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          lang={l}
          title={t(`langs.${l}`)}
        >
          {/* the full word while there is room, the ISO code when there is not —
              whichever one CSS shows is also the one a screen reader reads.
              No mount guard: the app is client-rendered only, so the full name
              is correct on the very first paint. */}
          <span className="lang-btn__long">{t(`langs.${l}`)}</span>
          <span className="lang-btn__short">{l.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}