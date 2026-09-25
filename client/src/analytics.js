const TYPES = new Set([
  'view', 'section_view', 'lang_switch', 'resource_download',
  'contact_submit', 'cta_click',
]);

export function analyticsAllowed() {
  if (typeof navigator === 'undefined') return false;
  return navigator.doNotTrack !== '1' && navigator.globalPrivacyControl !== true;
}

/** Fire-and-forget, first-party, cookie-free analytics. */
export function track(type, target, language, website = '') {
  if (!analyticsAllowed() || !TYPES.has(type) || !['ar', 'fr', 'en'].includes(language)) return;
  try {
    fetch('/api/track', {
      method: 'POST',
      credentials: 'omit',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, target, language, website }),
    }).catch(() => {});
  } catch {}
}
