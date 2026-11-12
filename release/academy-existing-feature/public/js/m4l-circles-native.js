/* One navigation contract for Source-hosted Circles tools. It is never authority. */
(() => {
  'use strict';
  if (window.M4L_CIRCLES_NATIVE) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const publicOrigin = local ? location.origin : window.M4L_CONFIG?.PORTAL_ORIGIN || location.origin;
  const toolHosts = new Set(['/academy/', '/academy/index.html', '/academy/admin/', '/academy/admin/index.html']);
  const modes = new Set(['learn', 'teach', 'admin']);
  const publicSections = {about:'academy-story', contact:'contact', prospectus:'prospectus', learning:'programmes', workshops:'my-courses'};
  const id = '[A-Za-z0-9._~%-]+';
  // Retained from the retired dashboard renderer: timetable eligibility is
  // a native data rule and must not depend on loading a second dashboard.
  const isActiveArea = row => row.active!==false&&row.active!==0&&(!row.lifecycle||row.lifecycle==='ACTIVE')&&row.curriculumActive!==false&&row.menuAvailable!==false&&!['DRAFT','COMPLETE','CANCELLED','ARCHIVED'].includes(row.stage);
  const nativeHash = value => value === '#login' || /^#timetable(?:\/(?:learn|teach))?$/.test(value) || /^#(?:progress|hifz|hifdh)$/.test(value) || new RegExp('^#activity/(?:PROGRAM|COURSE)/'+id+'(?:/(?:learn|teach))?(?:/(?:timetable|attendance|surahs-duas|assessment|library|planning|lesson-media)(?:/'+id+')*)?$').test(value) || /^#(?:assessment-admin|progress-admin|assessments)(?:\/(?:PROGRAM|COURSE)(?:\/[A-Za-z0-9._~%-]+)?)?$/.test(value) || /^#administration\/(?:access|media|users|attendance|planning|announcements|assessments|library|programs|courses|enrolments|settings|curriculum)(?:\/(?:PROGRAM|COURSE)\/[A-Za-z0-9._~%-]+(?:\/[A-Za-z0-9._~%-]+)*)?$/.test(value) || value === '#recorder';
  function mode() {
    const workspace = window.M4L_ACADEMY_WORKSPACE;
    if (workspace) return workspace.current() === 'ADMIN' ? 'admin' : workspace.audience().toLowerCase();
    const hashMode = location.hash.match(/^#(?:timetable\/(learn|teach)|activity\/[^/]+\/[^/]+\/(learn|teach)(?:\/|$))/);
    if (hashMode) return hashMode[1] || hashMode[2];
    const query = (new URLSearchParams(location.search).get('workspace') || '').replace(/^ADMIN_/i, '').toLowerCase();
    return modes.has(query) ? query : location.pathname.startsWith('/academy/admin/') ? 'admin' : 'learn';
  }
  function home({workspace = mode(), publicPage = false, section = ''} = {}) {
    // Academy Feature owns its native page; no unbuilt root dashboard or child return target.
    if (publicPage) return '/';
    if (section === 'login') return '/academy/?signin=1#login';
    const selected = modes.has(workspace) ? workspace : mode();
    const path = selected === 'admin' ? '/academy/admin/' : '/academy/';
    return path + '#timetable/' + (selected === 'teach' ? 'teach' : 'learn');
  }
  function canLeave() {
    const keys = ['M4L_COURSE_WEBSITES','M4L_CLASS_NOTES','M4L_ACADEMY_SETTINGS','M4L_PROGRAM_ATTENDANCE','M4L_ACADEMY_PROGRESS','M4L_MEMORISATION_ADMIN','M4L_ACADEMY_ASSESSMENTS','M4L_LESSON_MEDIA','M4L_PLANNING','M4L_ANNOUNCEMENTS','M4L_PDF_READER','M4L_CIRCLES_ACCESS','M4L_STUDIO_ACCESS','M4L_PROGRAM_MONTHLY','M4L_PROGRAM_SURAHS','M4L_MOU_PLAYLISTS'];
    return keys.every(key => window[key]?.canLeave?.() !== false);
  }
  function openHome(options = {}, replace = false) {
    if (!canLeave()) return false;
    const href = home(options);
    window.M4L_ACADEMY_HISTORY?.prepare?.(href);
    location[replace ? 'replace' : 'assign'](href);
    return true;
  }
  function legacyDestination(hash = location.hash) {
    const [name, requested] = hash.replace(/^#/, '').split('/');
    if (['overview','website','dashboard',''].includes(name) || name === 'administration' && !requested) return home({workspace:modes.has(requested)?requested:mode()});
    if(name==='workshops')return new URL('/studio/?view=collections&collection=courses',publicOrigin).href;
    if(name==='prospectus')return new URL('/prospectus-2027.html',publicOrigin).href;
    if (publicSections[name]) return home({publicPage:true,section:publicSections[name]});
    return '';
  }
  let protectedHost = false;
  function recovery(message = 'Sign in with your Academy account to continue.', {retry = false} = {}) {
    if (!document.body) { document.addEventListener('DOMContentLoaded', () => recovery(message, {retry}), {once:true}); return; }
    let panel = document.getElementById('circles-native-recovery');
    if (!panel) {
      panel = document.createElement('section'); panel.id = 'circles-native-recovery'; panel.className = 'card card-pad circles-recovery'; panel.setAttribute('role', 'status');
      const title = document.createElement('h1'); title.textContent = 'Your Academy';
      const text = document.createElement('p'); text.dataset.recoveryMessage = '';
      const actions = document.createElement('div'); actions.className = 'workspace-actions';
      const signIn = document.createElement('button'); signIn.type = 'button'; signIn.className = 'button'; signIn.textContent = 'Sign in'; signIn.dataset.recoveryLogin = '';
      signIn.onclick = () => { const login = document.getElementById('academy-login'); if (login?.tagName === 'BUTTON') login.click(); else openHome({section:'login'}); };
      const back = document.createElement('a'); back.href = home(); back.textContent = 'Home'; back.className = 'button secondary'; back.dataset.pageHome = ''; back.dataset.workspaceExit = '';
      const again = document.createElement('button'); again.type = 'button'; again.textContent = 'Try again'; again.className = 'button secondary'; again.dataset.recoveryRetry = ''; again.onclick = () => { if (canLeave()) location.reload(); };
      actions.append(signIn, back, again); panel.append(title, text, actions);
      (document.querySelector('main .container, main') || document.body).prepend(panel);
    }
    panel.querySelector('[data-recovery-message]').textContent = message;
    panel.querySelector('[data-recovery-retry]').hidden = !retry;
    let signed=false;try{signed=Boolean(localStorage.getItem('m4l_account_token'));}catch{}
    panel.querySelector('[data-recovery-login]').hidden = retry||signed;
    panel.hidden = false;
    if (toolHosts.has(location.pathname)) document.querySelectorAll('.view.active').forEach(view => view.classList.remove('active'));
    return panel;
  }
  function routeEntry() {
    if (!toolHosts.has(location.pathname)) return false;
    const destination = legacyDestination();
    if (destination) { if(canLeave())location.replace(destination); return true; }
    if (!nativeHash(location.hash)) { recovery('This link is no longer available. Open Home to choose your learning.'); return true; }
    protectedHost = true;
    return false;
  }
  window.M4L_CIRCLES_NATIVE = Object.freeze({home, isActiveArea, courses:()=>new URL('/studio/?view=collections&collection=courses',publicOrigin).href, mode, openHome, canLeave, nativeHash, legacyDestination, recovery, routeEntry});
  document.documentElement.dataset.circlesNative = 'true';
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || event.defaultPrevented) return;
    let url; try { url = new URL(link.href, location.href); } catch { return; }
    if (url.origin === location.origin && toolHosts.has(url.pathname)) {
      const [name, requested] = url.hash.replace(/^#/, '').split('/');
      if (['overview','website','dashboard',''].includes(name) || name === 'administration' && !requested || publicSections[name]) {
        link.href = name==='workshops'?new URL('/studio/?view=collections&collection=courses',publicOrigin).href:name==='prospectus'?new URL('/prospectus-2027.html',publicOrigin).href:publicSections[name]?home({publicPage:true,section:publicSections[name]}):home();
      }
    }
    if ((link.hasAttribute('data-workspace-exit') || link.hasAttribute('data-page-home')) && !canLeave()) event.preventDefault();
  }, true);
  window.addEventListener('m4l-academy-session', () => {
    const panel = document.getElementById('circles-native-recovery');
    let signed = false; try { signed = Boolean(localStorage.getItem('m4l_account_token')); } catch {}
    if (signed) { if (panel) panel.hidden = true; }
    else if (protectedHost) recovery();
  });
  window.addEventListener('m4l-academy-session-ended', () => { if (protectedHost) recovery('Your sign-in has ended. Sign in again to continue.'); });
})();
