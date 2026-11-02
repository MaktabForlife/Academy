/* A neutral handover screen contains no account data or permission decisions. */
(() => {
  'use strict';
  const root = document.documentElement;
  const session = () => { try { return localStorage.getItem('m4l_account_token'); } catch { return ''; } };
  const connector = /^\/academy\/website-platform\/connect\//.test(location.pathname);
  const programme = () => connector || /^#activity\/(?:PROGRAM|COURSE)\/[^/]+(?:\/|$)/.test(location.hash);
  const entry = () => programme() || /^(?:#(?:overview|login|dashboard|timetable\/(?:learn|teach)))?$/.test(location.hash) || /^#(?:administration|assessment-admin|progress-admin)(?:\/|$)/.test(location.hash);
  const restoring = Boolean(session());
  let attempt = null, timer = null;
  const scope = () => JSON.stringify([session(), location.hash]);
  function stopTimer() { if (timer !== null) clearTimeout(timer); timer = null; }
  function renderFailure() {
    if (!attempt?.error) return;
    const panel = document.getElementById('academy-startup');
    if (!panel) return;
    document.getElementById('academy-startup-title')?.replaceChildren(programme() ? 'Your programme couldn’t open' : 'Your dashboard couldn’t open');
    let message = document.getElementById('academy-startup-error');
    if (!message) { message = document.createElement('p'); message.id = 'academy-startup-error'; message.setAttribute('role', 'alert'); panel.append(message); }
    message.textContent = attempt.error;
    let retry = document.getElementById('academy-startup-retry');
    if (!retry) { retry = document.createElement('button'); retry.id = 'academy-startup-retry'; retry.type = 'button'; retry.className = 'button secondary'; panel.append(retry); }
    retry.textContent = connector ? 'Return to dashboard' : 'Try again';
    retry.onclick = () => {
      // A connector code is single-use. Return to its opener for a new checked
      // handoff; reloading this connector cannot safely replay the old code.
      if (connector) {
        if (window.opener && !window.opener.closed) { window.opener.focus(); window.close(); }
        else message.textContent = 'Return to your dashboard and select Academy again.';
      } else location.reload();
    };
  }
  function begin({force = false} = {}) {
    if ((!session() && !connector) || !entry()) return;
    const key = scope();
    // Repeated render/session events must not restart an indefinite wait or
    // replace a useful error with another spinner for the same navigation.
    if (!force && attempt?.key === key) return;
    stopTimer();
    const current = attempt = {key};
    root.classList.add('academy-opening');
    root.classList.toggle('academy-opening-programme', programme());
    root.classList.remove('academy-opening-failed');
    document.getElementById('academy-startup-title')?.replaceChildren(programme() ? 'Opening your learning…' : 'Opening your dashboard…');
    // This only changes presentation: no polling, reauthentication or retries.
    timer = setTimeout(() => {
      if (attempt === current && scope() === key) fail('Opening Academy is taking longer than expected. Please try again.');
    }, 30000);
  }
  function complete() { stopTimer(); attempt = null; root.classList.remove('academy-opening', 'academy-opening-failed', 'academy-opening-programme'); }
  function fail(message) {
    if (!root.classList.contains('academy-opening')) return;
    stopTimer();
    attempt = {key: scope(), error: typeof message === 'string' && message.trim() ? message.slice(0, 1000) : 'Academy could not open. Please try again.'};
    root.classList.add('academy-opening-failed');
    document.getElementById('academy-startup-title')?.replaceChildren(programme() ? 'Your programme couldn’t open' : 'Your dashboard couldn’t open');
    renderFailure();
  }
  window.M4L_ACADEMY_STARTUP = Object.freeze({ begin, complete, fail, entry, restoring });
  document.addEventListener('DOMContentLoaded', renderFailure, {once: true});
  begin();
})();
