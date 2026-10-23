(() => {
  'use strict';
  if(location.pathname.startsWith('/academy/calendar/')&&new URLSearchParams(location.search).get('embed')==='1')return;
  // The standalone recorder remains unchanged outside its Academy entry point.
  if (location.pathname.startsWith('/recorder/') && new URLSearchParams(location.search).get('academy') !== '1') return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const roles = (values = []) => values.includes('GLOBAL_ADMIN') ? 'Global Admin' : values.some(role=>['PROGRAM_ADMIN','ADMIN'].includes(role)) ? 'Program Admin' : values.some(role=>['TEACHER','SENIOR'].includes(role)) ? 'Teacher' : values.includes('STUDENT') ? 'Student' : '';
  const token = () => localStorage.getItem('m4l_account_token') || '';
  const side = document.createElement('aside');
  side.className = 'academy-connected-sidebar';
  side.setAttribute('aria-label', 'Academy');
  side.innerHTML = `<a class="academy-connected-brand" href="/academy/#overview"><img src="/ummabbadacademy.png" alt=""><span><strong>Umm Abbad<br>Academy</strong><span class="site-version">Website V107.31</span></span></a>
    <nav aria-label="Academy navigation"><a href="/academy/#overview">Academy home</a><a href="/activities/surahs-in-my-heart/">Surahs in my Heart</a><a href="/activities/kaaba-puzzle/">Kaaba puzzle</a><a id="ac-recorder" href="/academy/#recorder" hidden>Voice Recorder</a><a id="ac-library" href="/academy/open-library/">Library</a><a id="ac-calendar" href="/academy/calendar/" hidden>Academic Calendar</a><a href="/academy/#about">About</a><a href="/academy/#contact">Contact</a></nav>
    <div class="academy-connected-footer"><a href="https://ummabbadacademy.com" target="_blank" rel="noopener noreferrer">Original Academy site ↗</a><button id="ac-signout" type="button" hidden>Sign out</button></div>`;
  const strip = document.createElement('nav');
  strip.className = 'academy-connected-activities';
  strip.setAttribute('aria-label', 'Your subscribed Programs and Courses');
  strip.hidden = true;
  document.body.classList.add('academy-connected');
  document.body.prepend(side, strip);
  const $ = id => document.getElementById(id);
  let currentProgram = new URLSearchParams(location.search).get('program');
  const isLibrary = location.pathname.includes('/library/') || location.pathname.startsWith('/academy/open-library/');
  if (isLibrary) $('ac-library').setAttribute('aria-current', 'page');
  if (location.pathname.startsWith('/recorder/')) $('ac-recorder').setAttribute('aria-current', 'page');
  for(const a of side.querySelectorAll('a[href]'))if(a.getAttribute('href')===location.pathname)a.setAttribute('aria-current','page');
  let generation = 0;
  let d1Session = '';
  const sessionRequests=new Map();

  function sessionNavigation(result){
    if(!result?.success||!result.account||!Array.isArray(result.contexts))return null;
    const contexts=result.contexts,activities=new Map();
    for(const context of contexts){
      if(!context.courseId||!['COURSE','GLOBAL'].includes(context.scope)||!roles([context.role]))continue;
      const kind=context.scope==='COURSE'?'PROGRAM':'COURSE',key=kind+':'+context.courseId;
      if(!activities.has(key))activities.set(key,{id:context.courseId,name:context.courseName||'Learning area',kind,roles:[]});
      if(!activities.get(key).roles.includes(context.role))activities.get(key).roles.push(context.role);
    }
    return {success:true,signedIn:true,sessionStore:result.sessionStore,profile:{name:result.account.displayName||'Academy member',uniqueid:result.account.uniqueid||''},
      globalAdmin:contexts.some(c=>c.scope==='PLATFORM'&&c.role==='GLOBAL_ADMIN'),student:contexts.some(c=>c.role==='STUDENT'),
      workspaceRoles:[...new Set(contexts.filter(c=>roles([c.role])).map(c=>c.role))],personalActivities:[...activities.values()]};
  }

  function useSession(result,session){
    const next=sessionNavigation(result);if(!session||session!==token()||!next)return false;
    ++generation;render(next,session);return true;
  }
  async function accountSession(session){
    if(!session||session!==token())throw Error('Your Academy account changed. Open this page again.');
    if(sessionRequests.has(session))return sessionRequests.get(session);
    const pending=(async()=>{
      const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/account/session`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session}`},body:'{}'});
      const result=await response.json();
      if(session!==token())throw Error('Your Academy account changed. Open this page again.');
      if(!response.ok||!result.success||!sessionNavigation(result))throw Object.assign(Error(result.error||'Your Academy account could not load.'),{status:response.status,code:result.code});
      useSession(result,session);return result;
    })();
    sessionRequests.set(session,pending);
    try{return await pending;}finally{if(sessionRequests.get(session)===pending)sessionRequests.delete(session);}
  }
  window.M4L_ACADEMY_NAVIGATION={session:accountSession,useSession};

  function clear() {
    window.M4L_ACADEMY_SHELL_DATA=null;window.M4L_ACADEMY_SHELL?.update(null);
    strip.replaceChildren();
    strip.hidden = true;
    $('ac-library').href = '/academy/open-library/';
    $('ac-recorder').hidden = true;
    if($('ac-calendar'))$('ac-calendar').hidden = true;
    $('ac-signout').hidden = !token();
    if ($('library-for-you')) $('library-for-you').hidden = true;
  }

  function render(result,session){
      d1Session = result.sessionStore === 'D1' ? session : '';
      $('ac-library').href = '/academy/library/';
      $('ac-recorder').hidden = !result.student;
      if($('ac-calendar'))$('ac-calendar').hidden = false;
      $('ac-signout').hidden = false;
      if ($('library-for-you')) $('library-for-you').hidden = false;
      const activities = (result.personalActivities || []).filter(row => ['PROGRAM', 'COURSE'].includes(row.kind) && row.menuAvailable!==false && ![row.stage,row.status,row.lifecycle].some(value=>['CANCELLED','ARCHIVED'].includes(String(value||'').toUpperCase())) && row.id && (result.globalAdmin || roles(row.roles)));
      const programs = activities.filter(row => row.kind === 'PROGRAM');
      const courses = activities.filter(row => row.kind === 'COURSE');
      strip.innerHTML = programs.map(row => {
        if(row.id===window.M4L_CONFIG?.HIFZ_PROGRAM_ID){
          const loginId=result.profile?.uniqueid||'',url=window.M4L_CONFIG?.HIFZHELPER_URL;
          if(!/^[A-Za-z0-9]+$/.test(loginId)||typeof url!=='string'||!/^https:\/\//.test(url))return '';
          return `<a href="${esc(url.replace(/\/$/,'')+'/'+encodeURIComponent(loginId)+'?academy='+encodeURIComponent(window.M4L_CONFIG?.HIFZ_ENTRY_SOURCE||'1'))}" target="_blank" rel="noopener noreferrer" aria-label="HifzHelper (opens in a new tab)">HifzHelper ↗</a>`;
        }
        return `<a data-academy-program="${esc(row.id)}" href="/academy/#activity/${row.kind}/${encodeURIComponent(row.id)}"${row.id === currentProgram ? ' aria-current="page"' : ''}><span>${esc(row.name)}</span><small>${esc(roles(result.globalAdmin ? ['GLOBAL_ADMIN'] : row.roles))}</small></a>`;
      }).join('') +
        (result.signedIn && (result.globalAdmin || courses.some(row=>row.roles?.length)) ? `<a href="/academy/#workshops"><span>Courses</span><small>${esc(roles(result.globalAdmin ? ['GLOBAL_ADMIN','PROGRAM_ADMIN'] : [...new Set(courses.flatMap(row => row.roles))]) || 'None')}</small></a>` : '');
      strip.hidden = !result.signedIn;
      window.M4L_ACADEMY_SHELL_DATA=result;window.M4L_ACADEMY_SHELL?.update(result);
  }

  async function refresh() {
    const pending = ++generation, session = token();
    if (d1Session !== session) d1Session = '';
    clear();
    if (!session) return;
    try {
      let result, owner = '';
      try {
        owner = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(session)))].map(b=>b.toString(16).padStart(2,'0')).join('');
        const saved = JSON.parse(sessionStorage.getItem('m4l_academy_daily_timetable_10669') || 'null');
        const home = saved?.owner === owner && saved.entries?.HOME;
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:home?.timezone || 'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
        if (home?.cacheDay === `${parts.year}-${parts.month}-${parts.day}` && home.signedIn) result = home;
      } catch {}
      if (!result) {
        // Shared banners need account authority, not a complete timetable.
        await accountSession(session);return;
      }
      if (pending !== generation || session !== token() || !result.success || !result.signedIn) return;
      render(result,session);
    } catch { /* Public navigation stays available while account information is unavailable. */ }
  }

  $('ac-signout').addEventListener('click', () => {
    const session = token(), revoke = session && d1Session === session;
    d1Session = '';
    ++generation;
    clear();
    if (revoke) {
      void fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/account/logout`, {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session}` }, body: '{}'
      }).catch(() => { /* Browser sign-out still completes if the connection is unavailable. */ });
    }
    sessionStorage.removeItem('m4l_academy_signed_in');
    for (const key of ['m4l_account_token', 'm4l_account_context', 'm4l_account_contexts', 'm4l_account_workspace', 'maktab_token', 'maktab_user_type']) localStorage.removeItem(key);
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith('m4l_library_v1:') && key.includes(':personal:')) localStorage.removeItem(key);
      if (key && ['m4l_app_cache_', 'maktab_timetable_cache_', 'm4l_academy_timetable_'].some(prefix => key.startsWith(prefix))) localStorage.removeItem(key);
    }
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key?.startsWith('m4l_admin_progress_dashboard_') || key?.startsWith('m4l_academy_daily_timetable_')) sessionStorage.removeItem(key);
    }
    window.dispatchEvent(new Event('m4l-academy-session'));
    location.href = '/academy/#overview';
  });
  window.addEventListener('storage', event => { if (event.key === 'm4l_account_token' || event.key === null) void refresh(); });
  window.addEventListener('m4l-academy-session', () => { void refresh(); });
  window.addEventListener('m4l-program-selection', () => {
    currentProgram = new URLSearchParams(location.search).get('program');
    for (const link of strip.querySelectorAll('[data-academy-program]')) {
      if (link.dataset.academyProgram === currentProgram) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) void refresh(); });
  void refresh();
})();
