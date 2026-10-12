/* Keep page-level navigation visible; reuse each page's existing sign-out handler. */
(() => {
  'use strict';
  if (document.querySelector('.academy-page-actions')) return;
  const signOut = document.getElementById('academy-sign-out') || document.getElementById('ac-signout') || document.getElementById('logout-button');
  if (!signOut) return;
  const academy = Boolean(document.getElementById('academy-home-card'));
  const account = document.querySelector('.account-panel-topline');
  const host = academy ? document.querySelector('.academy-account-row') : account || document.querySelector('main');
  if (!host) return;
  const actions = document.createElement('div');
  actions.className = 'academy-page-actions';
  actions.setAttribute('role','group');
  actions.setAttribute('aria-label','Page actions');
  actions.innerHTML = `<a data-page-home href="${academy ? '#overview' : '/academy/#overview'}" aria-label="Academy home">Home</a><button data-page-refresh type="button" aria-label="Refresh this page">↻ Refresh</button>`;
  signOut.textContent = 'Sign out';
  actions.append(signOut);
  if (academy || account) host.append(actions); else host.prepend(actions);
  actions.querySelector('[data-page-refresh]').addEventListener('click', () => {
    // A page refresh must fetch a new timetable rather than restore today's snapshot.
    try { sessionStorage.removeItem('m4l_academy_daily_timetable_10610'); } catch {}
    location.reload();
  });
})();
