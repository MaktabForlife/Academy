/* A neutral handover screen contains no account data or permission decisions. */
(() => {
  'use strict';
  const root = document.documentElement;
  const session = () => { try { return localStorage.getItem('m4l_account_token'); } catch { return ''; } };
  const programme = () => /^#activity\/(?:PROGRAM|COURSE)\/[^/]+(?:\/|$)/.test(location.hash);
  const entry = () => programme() || /^(?:#(?:overview|login|dashboard|timetable\/(?:learn|teach)|administration))?$/.test(location.hash);
  const restoring = Boolean(session());
  function begin() {
    if (!session() || !entry()) return;
    root.classList.add('academy-opening');
    root.classList.toggle('academy-opening-programme', programme());
    root.classList.remove('academy-opening-failed');
    document.getElementById('academy-startup-title')?.replaceChildren(programme() ? 'Opening your learning…' : 'Opening your dashboard…');
  }
  function complete() { root.classList.remove('academy-opening', 'academy-opening-failed', 'academy-opening-programme'); }
  function fail() {
    if (!root.classList.contains('academy-opening')) return;
    root.classList.add('academy-opening-failed');
    document.getElementById('academy-startup-title')?.replaceChildren(programme() ? 'Your programme couldn’t open' : 'Your dashboard couldn’t open');
  }
  window.M4L_ACADEMY_STARTUP = Object.freeze({ begin, complete, fail, entry, restoring });
  begin();
})();
