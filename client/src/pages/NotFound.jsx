import { useI18n } from '../i18n.jsx';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <section className="nf">
      <div className="nf-code">404</div>
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.lead')}</p>
      <a className="btn primary" href="/">← {t('nav.home')}</a>
    </section>
  );
}