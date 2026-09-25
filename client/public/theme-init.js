/* Applies the stored colour theme before the first paint.
   Kept as a real file (not an inline <script>) so the strict
   script-src 'self' CSP stays intact and no flash of the wrong theme shows. */
(function () {
  var KEY = 'khm_theme';
  var theme = 'light';
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') {
      theme = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    }
  } catch (e) {
    /* storage blocked — light stays the default */
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
