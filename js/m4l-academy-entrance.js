(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const token = () => localStorage.getItem('m4l_account_token') || '';
  const state = { home: null, activity: null, scheduleTimetable: [], activityTimer: null, generation: 0, scheduleGeneration: 0, activityGeneration: 0, information: {}, startDate: '', courseCatalogue: null, courseCatalogueAt: 0, coursePending: null, courseGeneration: 0 };
  const pageCache = { epoch: 0, snapshot: null, pending: new Map() };
  const PAGE_CACHE_MS = 60000;
  const ACTIVITY_CACHE_MS = 86400000;
  const dailyCache = { session: '', owner:'', entries: {} };
  const MEMORISATION_RETURN_KEY='m4l_academy_memorisation_return_v1';
  const DAILY_CACHE_KEY = 'm4l_academy_daily_timetable_10610';
  const academyDay = (timezone, instant = Date.now()) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:timezone || 'Africa/Johannesburg',
      year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant)).map(part=>[part.type,part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const homeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7"/><path d="M5 9v12h5v-7h4v7h5V9"/></svg>';
  const TIMETABLE_RETURN_KEY = 'm4l_academy_timetable_return';
  let lastRouteHash = '', navigationSession = token(), memorisationReturn = null, restoreMemorisation = null;
  const memorisationHash = hash => hash === '#progress' || hash.startsWith('#progress-admin') || hash.endsWith('/surahs-duas');
  const validReturnHash = hash => typeof hash === 'string' && (hash !== '#timetable' && Boolean(titles[hash.slice(1)]) || /^#activity\/(PROGRAM|COURSE)\/[^/#]+(?:\/(?:attendance|surahs-duas))?$/.test(hash));
  const titles = { overview: 'Academy home', timetable: 'Academy timetable', learning: 'Programs and Courses', workshops: 'Courses', activity: 'Activity',
    prospectus: '2026 Prospectus', about: 'About', contact: 'Contact', progress: 'Surahs and Duas', 'progress-admin':'Surahs and Duas administration', recorder: 'Voice Recorder', administration: 'Academy administration' };
  const activityHref = row => `#activity/${row.kind}/${encodeURIComponent(row.id)}`;
  const staffRoles = roles => roles.some(role => ['TEACHER', 'PROGRAM_ADMIN', 'ADMIN', 'SENIOR', 'GLOBAL_ADMIN'].includes(role));
  const roleName = roles => roles.map(role => ({ GLOBAL_ADMIN: 'Global Admin', PROGRAM_ADMIN: 'Program Admin', ADMIN: 'Program Admin', SENIOR: 'Senior', TEACHER: 'Teacher', STUDENT: 'Student' })[role]).filter(Boolean).join(' · ') || 'None';
  const highestAccess = roles => state.home?.globalAdmin || roles.includes('GLOBAL_ADMIN') ? 'Global Admin' : roles.some(role=>['PROGRAM_ADMIN','ADMIN'].includes(role)) ? 'Program Admin' : roles.some(role=>['TEACHER','SENIOR'].includes(role)) ? 'Teacher' : roles.includes('STUDENT') ? 'Student' : '';
  const activityPill = (href, name, roles, current = false) => highestAccess(roles) ? `<a href="${href}"${current ? ' aria-current="page"' : ''}><span>${esc(name)}</span><small>${esc(highestAccess(roles))}</small></a>` : '';
  function hifzHelperLink(row, className = '') {
    const roles = row.roles || [], url = window.M4L_CONFIG?.HIFZHELPER_URL;
    const loginId = window.M4L_ACADEMY_LOGIN?.currentId() || '';
    if (!state.home?.signedIn || row.kind !== 'PROGRAM' || row.id !== window.M4L_CONFIG?.HIFZ_PROGRAM_ID ||
      !(state.home.globalAdmin || staffRoles(roles) || roles.includes('STUDENT')) || !/^[A-Za-z0-9]+$/.test(loginId) ||
      typeof url !== 'string' || !/^https:\/\//.test(url)) return '';
    return `<a${className ? ` class="${className}"` : ''} href="${esc(url.replace(/\/$/, '') + '/' + encodeURIComponent(loginId))}" target="_blank" rel="noopener noreferrer" aria-label="HifzHelper (opens in a new tab)">HifzHelper ↗</a>`;
  }
  function programPill(row, current = false) {
    if (!highestAccess(row.roles || [])) return '';
    const attendance = location.hash.endsWith('/attendance') && (state.home?.globalAdmin || staffRoles(row.roles || []));
    const teaching = location.hash.endsWith('/surahs-duas') && (state.home?.globalAdmin || staffRoles(row.roles || []));
    const administration = location.hash.startsWith('#progress-admin') && (state.home?.globalAdmin || adminRoles(row.roles || []));
    const pill = activityPill(administration?`#progress-admin/${row.kind}/${encodeURIComponent(row.id)}`:activityHref(row) + (attendance ? '/attendance' : teaching?'/surahs-duas':''), row.name, row.roles, current);
    const shortcut = hifzHelperLink(row, 'activity-pill-shortcut');
    return shortcut ? `<div class="activity-pill-with-shortcut"${current ? ' data-current="true"' : ''}>${pill}${shortcut}</div>` : pill;
  }
  const safeLink = url => typeof url === 'string' && (/^https:\/\//.test(url) || /^\/(?!\/)/.test(url));
  const scheduleRows = data => {
    const rows = data.signedIn ? data.personalTimetable : data.timetable;
    if (!Array.isArray(rows)) throw new Error('Your Academy timetable is temporarily unavailable. Please try again.');
    return rows;
  };
  const originalActivities = [
    { kind: 'PROGRAM', name: 'Reboot', image: '/academy/learning-images/reboot.jpeg' },
    { kind: 'PROGRAM', name: 'Aalimiya', image: '/ummabbadacademy.png' },
    { kind: 'PROGRAM', name: 'Ma’had Arwa · Hifz', image: '/academy/course-images/HIFZ-CHALLENGES-MEMORIZING-WITH-LOVE.webp' },
    { kind: 'COURSE', name: 'Tafseer & Tadabbur', image: '/academy/learning-images/tafseer.jpeg' },
    { kind: 'COURSE', name: 'Classical & Conversational Arabic', image: '/academy/learning-images/arabic.png' },
    { kind: 'COURSE', name: 'Mothers of the Ummah', image: '/academy/learning-images/mothers.jpg' }
  ];

  function renderCatalogue() {
    $('learning-catalogue').innerHTML = `<ul class="learning-cards">${originalActivities.map(row => `<li class="card activity-card"><div class="activity-art"><img src="${esc(row.image)}" alt="Academy artwork for ${esc(row.name)}" loading="lazy"></div><div class="card-pad"><span class="eyebrow">${row.kind === 'PROGRAM' ? 'Program' : 'Course'}</span><h3>${esc(row.name)}</h3></div></li>`).join('')}</ul>`;
  }

  async function dailyTimetable(body, force = false) {
    const session = token(), epoch = pageCache.epoch;
    if (!session) return request(body);
    const key = body.startDate || 'HOME';
    if (dailyCache.session !== session) {
      dailyCache.session = session;
      dailyCache.entries = {};
    }
    // Bind tab-local storage to this session without storing another bearer token.
    let owner = '';
    try {
      owner = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session)))].map(b=>b.toString(16).padStart(2,'0')).join('');
      if (token() !== session || pageCache.epoch !== epoch) throw new Error('The Academy account has changed.');
      const saved = JSON.parse(sessionStorage.getItem(DAILY_CACHE_KEY) || 'null');
      dailyCache.owner=owner;
      if(!memorisationReturn&&memorisationHash(location.hash)){const back=JSON.parse(sessionStorage.getItem(MEMORISATION_RETURN_KEY)||'null');if(back?.owner===owner&&validReturnHash(back.hash)&&!memorisationHash(back.hash)&&Number.isFinite(back.left)&&Number.isFinite(back.top))memorisationReturn=back;}
      if (saved?.owner === owner) dailyCache.entries = {...saved.entries,...dailyCache.entries};
      else sessionStorage.removeItem(DAILY_CACHE_KEY);
    } catch { /* A blocked/full tab store falls back to this page's memory cache. */ }
    if (token() !== session || pageCache.epoch !== epoch) throw new Error('The Academy account has changed.');
    const cached = dailyCache.entries[key];
    if (!force && cached?.signedIn && cached.cacheDay === academyDay(cached.timezone)) return cached;
    delete dailyCache.entries[key];
    try {
      const result = await request(body);
      if (result.signedIn && (result.timetableComplete ?? !result.warnings.length)) {
        // Keep only today's date ranges and a small number of explicitly browsed weeks.
        dailyCache.entries = Object.fromEntries(Object.entries(dailyCache.entries).filter(([,value])=>value.cacheDay===academyDay(value.timezone)).slice(-7));
        const cacheable = JSON.parse(JSON.stringify(result,(field,value)=>field==='joinUrl'?undefined:value));
        dailyCache.entries[key] = {...cacheable,cacheDay:academyDay(result.timezone)};
        if (owner) try { sessionStorage.setItem(DAILY_CACHE_KEY,JSON.stringify({owner,entries:dailyCache.entries})); } catch {}
      }
      return result;
    } catch (error) {
      if (session === token() && epoch === pageCache.epoch) {
        delete dailyCache.entries[key];
        try { sessionStorage.removeItem(DAILY_CACHE_KEY); } catch {}
      }
      throw error;
    }
  }

  async function request(body) {
    const session = token(), epoch = pageCache.epoch, key = JSON.stringify([session, body]);
    if (pageCache.pending.has(key)) return pageCache.pending.get(key);
    const pending = (async () => {
      const response = await fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/academy/entrance${session ? '' : '/public-snapshot'}`, session ? { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session}` }, body: JSON.stringify(body) } : {method:'GET',cache:'no-cache'});
      const result = await response.json();
      if (token() !== session || pageCache.epoch !== epoch) throw new Error('The Academy account has changed.');
      if (!response.ok || !result.success) {
        pageCache.snapshot = null;
        if (response.status === 401) window.dispatchEvent(new Event('m4l-academy-session-ended'));
        throw Object.assign(new Error(result.error || 'Academy information is temporarily unavailable.'),{code:result.code,status:response.status});
      }
      return result;
    })();
    pageCache.pending.set(key, pending);
    try { return await pending; }
    catch (error) {
      if (pageCache.epoch === epoch && token() === session) pageCache.snapshot = null;
      throw error;
    }
    finally { if (pageCache.pending.get(key) === pending) pageCache.pending.delete(key); }
  }

  function rememberPages(result) {
    pageCache.snapshot = result.signedIn && Array.isArray(result.activityPages) && (result.timetableComplete ?? !result.warnings.length)
      ? { session: token(), at: new Date().getTime(), result } : null;
  }

  function cachedActivity(id) {
    const snapshot = pageCache.snapshot, now = new Date().getTime();
    if (!snapshot || snapshot.session !== token() || now < snapshot.at || now - snapshot.at >= ACTIVITY_CACHE_MS) return null;
    const result = snapshot.result;
    const clock = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: result.timezone,
      year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
    if (result.startDate !== `${clock.year}-${clock.month}-${clock.day}`) return null;
    const activity = result.activityPages.find(row => row.id === id && !row.unavailable);
    return activity ? { ...result, activity } : null;
  }

  async function loadHome(force = false) {
    const generation = ++state.generation;
    $('entrance-message').textContent = 'Loading Academy information…';
    $('entrance-retry').hidden = true;
    try {
      const result = await dailyTimetable({}, force);
      if (generation !== state.generation) return;
      rememberPages(result);
      state.home = result;
      state.startDate = result.startDate;
      state.scheduleTimetable = scheduleRows(result);
      $('schedule-date').value = result.startDate;
      $('schedule-range').textContent = `${formatDate(result.startDate)} – ${formatDate(result.endDate)}`;
      renderCalendar(result);
      $('entrance-message').textContent = result.warnings.join(' ');
      $('entrance-retry').hidden = !result.warnings.length;
      renderHome();
      route();
    } catch (error) {
      if (generation !== state.generation) return;
      $('entrance-message').textContent = error.message;
      $('entrance-retry').hidden = false;
      if (!state.home || state.home.signedIn) {
        clearTimeout(state.activityTimer);
        state.scheduleTimetable = [];
        state.information['academy-preview-sessions'] = [];
        state.information['academy-sessions'] = [];
        if (state.home) state.home = { ...state.home, personalTimetable: [] };
        $('academy-preview-sessions').replaceChildren();
        $('academy-sessions').replaceChildren();
        $('activity-sessions').replaceChildren();
        state.information['activity-sessions'] = [];
        $('activity-schedule').hidden = true;
        if (location.hash.startsWith('#activity/')) $('activity-status').textContent = error.message;
        $('lesson-information').close();
        const message=error.code==='ACADEMY_D1_DAILY_READ_LIMIT'?error.message:'The Academy timetable is currently unavailable.';
        $('academy-preview-sessions').textContent = message;
        $('academy-sessions').textContent = message;
      }
    }
  }

  async function loadSchedule(force = false) {
    const generation = ++state.scheduleGeneration;
    $('schedule-message').textContent = 'Loading Academy timetable…';
    try {
      const result = state.startDate === state.home?.startDate ? await dailyTimetable({}, force) : await dailyTimetable({ startDate: state.startDate }, force);
      if (generation !== state.scheduleGeneration) return;
      if (result.startDate === state.home?.startDate) { state.home=result;rememberPages(result);renderHome(); }
      state.startDate = result.startDate;
      $('schedule-date').value = result.startDate;
      $('schedule-range').textContent = `${formatDate(result.startDate)} – ${formatDate(result.endDate)}`;
      renderCalendar(result);
      $('schedule-message').textContent = result.warnings.join(' ');
      renderSchedule('academy-sessions', scheduleRows(result));
      state.scheduleTimetable = scheduleRows(result);
      armScheduleClock();
    } catch (error) {
      if (generation !== state.scheduleGeneration) return;
      $('schedule-message').textContent = error.message;
      $('academy-sessions').replaceChildren();
      renderCalendar({});
      state.information['academy-sessions'] = [];
      state.scheduleTimetable = [];
    }
  }

  function renderCalendar(data) {
    const target = $('academy-calendar-context');
    if (!target) return;
    const events = Array.isArray(data.calendarEvents) ? data.calendarEvents : [];
    target.hidden = !events.length;
    target.innerHTML = events.map(event => {
      const dates = event.startDate === event.endDate ? formatDate(event.startDate) : `${formatDate(event.startDate)} – ${formatDate(event.endDate)}`;
      return `<li><strong>${esc(event.description)}</strong> · ${esc(dates)}${event.islamicDate ? ` · ${esc(event.islamicDate)}` : ''}${event.teachingImpact === 'NO_TEACHING' ? ' · No teaching' : ''}</li>`;
    }).join('');
  }

  function renderHome() {
    const data = state.home;
    $('personal-activities').hidden = !data.signedIn;
    $('academy-progress-nav').hidden = data.signedIn && data.memorisationActive===false;
    $('academy-recorder-nav').hidden = !(data.signedIn && data.student);
    const activities = data.signedIn ? data.personalActivities : [];
    const courses = activities.filter(row => row.kind === 'COURSE');
    $('personal-empty').hidden = Boolean(activities.length || data.globalAdmin);
    $('personal-pills').innerHTML = activities.filter(row => row.kind === 'PROGRAM')
      .map(row => programPill(row)).join('') +
      (data.signedIn && (data.globalAdmin || courses.some(row=>row.roles.length)) ? activityPill('#workshops', 'Courses', data.globalAdmin ? ['GLOBAL_ADMIN', 'PROGRAM_ADMIN'] : [...new Set(courses.flatMap(row => row.roles))]) : '') +
      (data.globalAdmin ? activityPill('#administration', 'Academy administration', ['GLOBAL_ADMIN']) : '');
    renderSubscriptions(activities);
    renderWorkshops();
    const personalSchedule = scheduleRows(data);
    $('schedule-title').textContent = data.signedIn && !data.globalAdmin ? 'My Academy timetable' : 'Academy timetable';
    if($('teaching-availability-link'))$('teaching-availability-link').hidden=!data.signedIn||!(data.globalAdmin||(data.personalActivities||[]).some(r=>r.roles?.some(role=>['TEACHER','PROGRAM_ADMIN','ADMIN'].includes(role))));
    $('full-timetable-title').textContent = data.signedIn && !data.globalAdmin ? 'My Academy timetable' : 'Full Academy timetable';
    const preview = data.signedIn ? personalSchedule : upcomingItems(data.timetable);
    renderSchedule('academy-preview-sessions', preview, false, true);
    if (!preview.length) $('academy-preview-sessions').textContent = data.signedIn
      ? 'No lessons are scheduled for you in this date range.' : 'No upcoming published lessons in this public preview.';
    $('public-snapshot-note').hidden = data.signedIn || !data.snapshotDate;
    $('public-snapshot-note').textContent = data.snapshotDate ? `Schedule preview · ${formatDate(data.snapshotDate)}` : '';
    $('preview-timetable-link').hidden = !data.signedIn;
    $('timetable-refresh').hidden = !data.signedIn;
    $('schedule-refresh').hidden = !data.signedIn;
    $('schedule-message').textContent = '';
    renderSchedule('academy-sessions', personalSchedule);
  }

  function renderSubscriptions(activities, current) {
    const view = location.hash.slice(1).split('/')[0];
    const strip = $('activity-switcher');
    if (!titles[view] || view === 'overview' || view === 'learning') {
      strip.replaceChildren();
      strip.hidden = true;
      return;
    }
    const programs = activities.filter(item => item.kind === 'PROGRAM');
    const courses = activities.filter(item => item.kind === 'COURSE');
    strip.innerHTML = programs.map(item => programPill(item,
      Boolean(current && item.id === current.id && current.kind === 'PROGRAM'))).join('') +
      (state.home?.signedIn && (state.home.globalAdmin || courses.some(row=>row.roles.length)) ? activityPill('#workshops', 'Courses', state.home.globalAdmin ? ['GLOBAL_ADMIN', 'PROGRAM_ADMIN'] : [...new Set(courses.flatMap(item => item.roles))],
        view === 'workshops' || current?.kind === 'COURSE') : '');
    strip.hidden = !state.home?.signedIn;
  }

  const adminRoles = roles => roles.some(role => ['GLOBAL_ADMIN','PROGRAM_ADMIN','ADMIN'].includes(role));
  function roleTools(row) {
    const roles = row.roles || [], global = Boolean(state.home?.globalAdmin), admin = global || adminRoles(roles);
    const staff = admin || staffRoles(roles), learner = roles.includes('STUDENT');
    const hifzHelper = hifzHelperLink(row);
    const link = (name, href) => safeLink(href) || href?.startsWith('#') ? `<a href="${esc(href)}">${esc(name)}</a>` : '';
    const tool = (name, key) => `<button type="button" data-workspace-tool="${key}">${esc(name)}</button>`;
    const group = (name, content) => `<nav class="academy-tool-row" aria-label="${name} tools"><span class="academy-tool-label">${name}</span><div class="academy-tool-pills">${content}</div></nav>`;
    const manage = row.kind === 'PROGRAM' ? row.tools?.manage : row.kind === 'COURSE' && row.id ? `/academy/courses/manage/?course=${encodeURIComponent(row.id)}` : '/academy/courses/manage/';
    const users = global ? '/users/' : row.kind === 'PROGRAM' ? manage && `${manage}&tab=profiles` : row.id ? `${manage}&tab=participants` : '/academy/courses/manage/';
    return (admin ? group('Admin', link('Users', users) + link('Library', global ? '/academy/library/manage/' : row.tools?.resources || '/academy/library/') +
      link('Programs', global ? '/programs/' : row.kind === 'PROGRAM' && row.id ? `/programs/timetable.html?program=${encodeURIComponent(row.id)}` : '') +
      link('Courses', global || row.kind !== 'PROGRAM' ? '/academy/courses/manage/' : '') + (row.kind==='PROGRAM'?link('Surahs and Duas',`#progress-admin/PROGRAM/${encodeURIComponent(row.id)}`):'') + tool('Academy','academy')) : '') +
      (staff ? group('Teach', hifzHelper + (row.kind === 'PROGRAM' ? `<a href="${activityHref(row)}/attendance" aria-expanded="${location.hash.endsWith('/attendance')}" aria-controls="pa-main">Attendance</a>` + link('Surahs and Duas',`${activityHref(row)}/surahs-duas`) : tool('Attendance','attendance')) + tool('Assessment','assessment') + tool('Planning','plan') + tool('Announcements','announcements') + link('My Timetable','#timetable') + link('Edit availability','/academy/teaching/')) : '') +
      (learner && !staff ? group('Learn', (!staff?hifzHelper:'') + link('Library','/academy/library/') + (state.home?.memorisationActive!==false?link('Surahs and Duas','#progress'):'') + tool('My Assessment','assessment') + tool('Calendar','calendar') + tool('Announcements','announcements') + link('My Timetable','#timetable')) : '');
  }

  function syncMemorisation(row){
    const teaching=location.hash===`${activityHref(row)}/surahs-duas`&&state.home?.signedIn&&!row.unavailable&&(state.home.globalAdmin||staffRoles(row.roles||[]));
    $('mp-teach-panel').hidden=!teaching;
    if(teaching){$('mp-teach-close').href=activityHref(row);window.M4L_ACADEMY_PROGRESS?.open({view:'teach',hostId:'mp-teach-host',activityKey:`${row.kind}:${row.id}`,kind:row.kind});}
    if(location.hash.startsWith('#progress-admin')){
      $('mp-admin-context').textContent=row.name;
      $('mp-admin-close').href=memorisationReturn?.hash||(row.id?activityHref(row):row.kind==='COURSE'?'#workshops':'#overview');
      window.M4L_MEMORISATION_ADMIN?.open({activityKey:row.id?`${row.kind}:${row.id}`:'',kind:row.kind||''});
      $('current-view').textContent=`${row.name} · Surahs and Duas administration`;
    }
  }

  function syncAttendance(row) {
    const open = location.hash === `${activityHref(row)}/attendance` && row.kind === 'PROGRAM' && !row.unavailable && state.home?.signedIn && (state.home.globalAdmin || staffRoles(row.roles || []));
    $('pa-main').hidden = !open;
    if (!open) { window.M4L_PROGRAM_ATTENDANCE?.reset(); return; }
    $('pa-close').href = activityHref(row);
    window.M4L_PROGRAM_ATTENDANCE?.open({id:row.id,programs:state.home.personalActivities.filter(item=>item.kind==='PROGRAM' && (state.home.globalAdmin || staffRoles(item.roles || []))).map(item=>({id:item.id,name:item.name,role:state.home.globalAdmin?'GLOBAL_ADMIN':item.roles.find(role=>['PROGRAM_ADMIN','ADMIN','TEACHER','SENIOR'].includes(role))}))});
  }

  function openWorkspaceTool(key) {
    const row = location.hash.startsWith('#activity/') ? state.activity : {name:'Courses',roles:state.home?.personalActivities.filter(a=>a.kind==='COURSE').flatMap(a=>a.roles)||[]};
    if (!state.home?.signedIn || !row || !(row.roles?.length || state.home.globalAdmin)) return;
    const names = {academy:'Academy',attendance:'Attendance',progress:'Progress',assessment:'Assessment',plan:'Planning',announcements:'Announcements',calendar:'Calendar'};
    if (!names[key] || key === 'academy' && !(state.home.globalAdmin || adminRoles(row.roles))) return;
    if (['attendance','plan'].includes(key) && !staffRoles(row.roles) && !state.home.globalAdmin) return;
    if (key === 'progress') { $('workspace-tool').close(); location.hash = row.id?`${activityHref(row)}/surahs-duas`:'#workshops/surahs-duas'; return; }
    $('workspace-tool-title').textContent = names[key];
    if (key === 'academy') {
      $('workspace-tool-body').innerHTML = (state.home.globalAdmin ? '<div class="academy-tool-pills"><a href="/academy/subjects/">Subjects &amp; Modules</a></div>' : '') +
        `<div class="academy-tool-pills"><button type="button" data-workspace-tool="calendar">Calendar</button><button type="button" data-workspace-tool="announcements">Announcements</button><a href="${row.id?'#progress-admin/'+row.kind+'/'+encodeURIComponent(row.id):'#progress-admin/COURSE'}">Surahs and Duas</a>`+ (state.home.globalAdmin?'<button id="public-timetable-refresh" type="button">↻ Refresh public timetable</button>':'')+'</div><p id="public-timetable-refresh-message" role="status" aria-live="polite"></p>';
      bindPublicTimetableRefresh();
    } else if (key === 'calendar') {
      const events = state.home.calendarEvents || [];
      $('workspace-tool-body').innerHTML = events.length ? `<ul class="activity-calendar-list">${events.map(event=>`<li><strong>${esc(event.description)}</strong> · ${esc(formatDate(event.startDate))}${event.endDate!==event.startDate?' – '+esc(formatDate(event.endDate)):''}</li>`).join('')}</ul>` : '<p>No Academy events in this week.</p>';
    } else $('workspace-tool-body').innerHTML = `<p>${esc(names[key])} for ${esc(row.name)} is coming soon.</p>`;
    if (!$('workspace-tool').open) $('workspace-tool').showModal();
  }

  function renderWorkshops() {
    const signedIn = state.home?.signedIn, activities = signedIn ? state.home.personalActivities : [];
    const roles = state.home?.globalAdmin ? ['GLOBAL_ADMIN','PROGRAM_ADMIN'] : [...new Set(activities.filter(a=>a.kind==='COURSE').flatMap(a=>a.roles))];
    $('workshop-tools').innerHTML = signedIn ? roleTools({kind:'COURSE',roles,tools:{}}) : '';
    $('workshops-message').textContent = signedIn ? '' : 'Sign in to open your Courses.';
    renderCourseList();
    if (signedIn && location.hash === '#workshops' && (!state.courseCatalogue || Date.now() - state.courseCatalogueAt >= PAGE_CACHE_MS)) void loadCourses();
  }

  async function loadCourses() {
    if (state.coursePending) return state.coursePending;
    const session = token(), generation = ++state.courseGeneration;
    if (!session) return;
    $('course-list-message').textContent = 'Loading Courses…';
    $('course-list-retry').hidden = true;
    const pending = (async () => {
      try {
        const response = await fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/academy/courses/catalogue`, {method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${session}`}, body:'{}'});
        const result = await response.json();
        if (session !== token() || generation !== state.courseGeneration) return;
        if (!response.ok || !result.success || !Array.isArray(result.courses)) throw new Error(result.error || 'Courses are temporarily unavailable.');
        const first = !state.courseCatalogue;
        state.courseCatalogue = result;
        state.courseCatalogueAt = Date.now();
        if (first && result.canViewAll) $('course-list-scope').value = 'ALL';
        renderCourseList();
      } catch (error) {
        if (session !== token() || generation !== state.courseGeneration) return;
        state.courseCatalogue = null;
        $('workshop-pills').replaceChildren();
        $('course-list-message').textContent = error.message;
        $('course-list-retry').hidden = false;
      } finally { if (state.coursePending === pending) state.coursePending = null; }
    })();
    state.coursePending = pending;
    return pending;
  }

  function renderCourseList() {
    const data = state.courseCatalogue;
    $('course-list-scope-wrap').hidden = !data?.canViewAll;
    if (!state.home?.signedIn || !data) { $('workshop-pills').replaceChildren(); return; }
    const all = data.canViewAll && $('course-list-scope').value === 'ALL';
    const query = $('course-list-search').value.trim().toLocaleLowerCase(), stage = $('course-list-stage').value;
    const rows = data.courses.filter(row => (all || row.personal) && (stage === 'ALL' || row.stage === stage) && (!query || row.name.toLocaleLowerCase().includes(query)));
    const stages = {PUBLISHED:'Scheduled',ACTIVE:'Active',COMPLETE:'Complete',ARCHIVED:'Archived',DRAFT:'Draft',CANCELLED:'Cancelled'};
    $('course-list-title').textContent = all ? 'All Courses' : 'My Courses';
    $('course-list-message').textContent = rows.length ? `${rows.length} ${rows.length === 1 ? 'Course' : 'Courses'}` : 'No Courses match this view.';
    $('workshop-pills').innerHTML = rows.map(row => {
      const name = row.canOpenActivity ? `<a class="course-list-name" href="${activityHref({kind:'COURSE',id:row.id})}">${esc(row.name)}</a>` : `<strong class="course-list-name">${esc(row.name)}</strong>`;
      const dates = row.startDate ? `${formatDate(row.startDate)}${row.endDate && row.endDate !== row.startDate ? ` – ${formatDate(row.endDate)}` : ''}` : 'Dates to be confirmed';
      return `<article class="course-list-row">${name}<span class="course-stage">${esc(stages[row.stage] || row.stage)}</span><span class="course-list-dates">${esc(dates)}</span><div class="course-list-actions"><button type="button" disabled title="${esc(row.mediaMessage)}">Media${['COMPLETE','ARCHIVED'].includes(row.stage) ? ' · coming soon' : ' · after completion'}</button>${row.canManage ? `<a href="/academy/courses/manage/?course=${encodeURIComponent(row.id)}${row.runId ? `&amp;run=${encodeURIComponent(row.runId)}` : ''}">Manage</a>` : ''}</div></article>`;
    }).join('');
  }

  function upcomingItems(rows, now = new Date()) {
    const clocks = new Map(), seen = new Set();
    return rows.slice().sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .filter(row => {
        if (row.status && row.status !== 'SCHEDULED') return false;
        if (!clocks.has(row.timezone)) {
          const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: row.timezone,
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
            .formatToParts(now).map(part => [part.type, part.value]));
          clocks.set(row.timezone, { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` });
        }
        const clock = clocks.get(row.timezone);
        const endDate = row.endTime <= row.startTime
          ? new Date(Date.parse(`${row.date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10) : row.date;
        if (endDate < clock.date || endDate === clock.date && row.endTime <= clock.time) return false;
        const identity = `${row.date}:${row.kind}:${row.activityId}`;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      });
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
  }

  function previewTime(value) {
    const clock = String(value).slice(0, 5);
    return `<time class="preview-clock" datetime="${esc(value)}" aria-label="${esc(clock)}"><span>${esc(clock)}</span></time>`;
  }

  function summarizeLesson(row) {
    if (typeof row.summarize === 'boolean') return row.summarize;
    // Retain the same presentation during a staggered frontend/backend release.
    return Boolean(state.home?.globalAdmin || state.home?.personalActivities.some(activity =>
      row.kind === activity.kind && activity.id === row.activityId &&
      activity.roles.some(role => ['PROGRAM_ADMIN', 'ADMIN'].includes(role))));
  }

  function renderSchedule(id, rows, detailed = false, compact = false) {
    const personal = detailed || state.home?.signedIn;
    if(!personal)rows=rows.filter(row=>row.kind!=='PROGRAM'||row.publicCard?.time&&row.publicCard.title&&row.publicCard.description);
    state.information[id] = rows.slice();
    if (!rows.length) { $(id).textContent = personal && !state.home?.globalAdmin ? 'No lessons are scheduled for you in this date range.' : 'No published lessons in this date range.'; return; }
    const now = new Date().getTime();
    const next = personal ? rows.findIndex(row => row.status === 'SCHEDULED' && row.endsAt > now) : -1;
    if (personal) { renderPersonalWeek(id, rows, detailed, next, now); return; }
    if (compact || !personal) {
      const days = new Map();
      rows.forEach(row => {
        if (!days.has(row.date)) days.set(row.date, []);
        days.get(row.date).push({...row,publicIndex:rows.indexOf(row)});
      });
      $(id).innerHTML = `<ol class="upcoming-days preview-days">${[...days].map(([date, lessons]) => `<li class="upcoming-day"><time datetime="${esc(date)}">${esc(formatDate(date))}</time><ul class="upcoming-items">${lessons.map(row => {
        const card=row.kind==='PROGRAM'?row.publicCard:null;
        if(row.kind==='PROGRAM'&&(!card?.time||!card.title||!card.description))return '';
        const label = esc(card?.title || row.activityName || row.title);
        const open=row.publicJoin&&row.joinKey&&now>=row.joinAvailableAt&&now<row.endsAt;
        return `<li class="preview-pill${open?' is-open':''}"><span class="preview-copy"><span class="preview-name" title="${label}">${label}</span>${card?`<span class="preview-description">${esc(card.description).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')}</span>`:''}</span><span class="preview-controls">${card?`<span class="preview-clock"><span>${esc(card.time)}</span></span>`:previewTime(row.startTime)}${row.publicJoin?`<button type="button" data-public-join="${id}:${row.publicIndex}" ${open?'':'disabled'} aria-label="Join ${label}">${open?'Join':'Opens 5 min before'}</button>`:''}</span></li>`;
      }).join('')}</ul></li>`).join('')}</ol>`;
      return;
    }
    $(id).innerHTML = `<ol class="schedule-list">${rows.map(row => `<li><time datetime="${esc(row.date)}">${esc(formatDate(row.date))}</time><div>${esc(row.startTime)}–${esc(row.endTime)}</div><div class="lesson-name">${esc(row.title)}</div></li>`).join('')}</ol>`;
  }

  function renderPersonalWeek(id, rows, detailed, next, now) {
    const scrollLeft = $(id).scrollLeft || 0;
    const timezone = state.home?.timezone || rows[0].timezone;
    const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const clock = instant => {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
      return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
    };
    const days = new Map();
    const start = (id === 'academy-sessions' ? state.startDate : state.home?.startDate) || rows[0].date;
    for (let offset = 0; offset < 7; offset++)
      days.set(new Date(Date.parse(`${start}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10), new Map());
    rows.map((original, index) => ({ original, index })).sort((a, b) => a.original.startsAt - b.original.startsAt).forEach(({ original, index }) => {
      const begins = clock(original.startsAt), ends = clock(original.endsAt);
      const row = { ...original, sourceDate: original.date, date: begins.date, startTime: begins.time, endTime: ends.time, endDate: ends.date };
      if (!days.has(row.date)) days.set(row.date, new Map());
      const groups = days.get(row.date);
      // Missing room information must never combine unrelated lessons.
      const key = summarizeLesson(row) && row.meetingGroup ? `room:${row.meetingGroup}` : `lesson:${index}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ row, index });
    });
    const participation = entries => {
      const roles = [...new Set(entries.map(entry => entry.row.involvement).filter(Boolean))];
      return roles.length > 1 ? 'mixed' : roles[0] || '';
    };
    const renderGroup = entries => {
      const first = entries[0].row;
      const summary = summarizeLesson(first);
      const activities = [...new Set(entries.map(entry => entry.row.activityName))];
      const label = activities.join(' · ');
      const lessonTitle = first.moduleName || first.subjectName || first.title || first.activityName;
      const nextEntry = entries.find(entry => entry.index === next);
      const infoIndex = state.information[id].push({ title: label, lessons: entries.map(entry => entry.row) }) - 1;
      const joinable = entries.find(({ row }) => row.status === 'SCHEDULED' && now >= row.joinAvailableAt && now < row.endsAt && row.joinKey);
      const join = joinable ? `<button type="button" class="timetable-join" data-join="${id}:${infoIndex}:${entries.indexOf(joinable)}">Join lesson</button>` : '';
      const status = nextEntry ? nextEntry.row.startsAt <= now ? 'In progress' : 'Next lesson' : '';
      const subtitle = summary && entries.length > 1 ? `${entries.length} lessons` : lessonTitle !== label ? lessonTitle : '';
      return `<li class="preview-pill timetable-pill ${nextEntry ? 'next-lesson ' : ''}${participation(entries)}${joinable ? ' join-open' : ''}"><button type="button" class="timetable-pill-details" data-information="${id}:${infoIndex}" aria-label="${esc(label)}${subtitle ? ' · ' + esc(subtitle) : ''}, ${esc(first.startTime)}–${esc(first.endTime)}${status ? ', ' + status : ''}. View lesson details">${previewTime(first.startTime)}<span class="timetable-pill-copy"><strong class="preview-name">${esc(label)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}${status ? `<small class="timetable-pill-status">${status}</small>` : ''}</span></button>${join}</li>`;
    };
    $(id).innerHTML = `<ol class="upcoming-days preview-days timetable-days">${[...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, groups]) => `<li class="upcoming-day"><time datetime="${esc(date)}">${esc(formatDate(date))}</time><ul class="upcoming-items">${groups.size ? [...groups.values()].map(renderGroup).join('') : '<li class="timetable-empty">No lessons</li>'}</ul></li>`).join('')}</ol>`;
    $(id).scrollLeft = scrollLeft;
  }

  function activityRows() {
    return state.activity && state.home?.signedIn ? scheduleRows(state.home).filter(lesson=>lesson.kind===state.activity.kind && lesson.activityId===state.activity.id) : [];
  }

  function renderActivityTimetable() {
    $('activity-schedule').hidden = location.hash.endsWith('/surahs-duas') || !state.home?.signedIn || !state.activity?.roles.length || state.activity?.unavailable;
    $('activity-schedule-title').textContent = `${state.activity?.name || ''} timetable`;
    renderSchedule('activity-sessions', activityRows());
    armScheduleClock();
  }

  async function loadActivity(id, refresh = false) {
    clearTimeout(state.activityTimer);
    const generation = ++state.activityGeneration;
    const cached = !refresh && cachedActivity(id);
    if (!cached) {
      state.activity = null;
      $('activity-title').textContent = 'Opening activity…';
      $('activity-role').textContent = '';
      $('activity-menu').replaceChildren();
      $('activity-sessions').replaceChildren();
      $('activity-schedule').hidden = true;
    }
    try {
      const result = cached || await request({ id });
      if (generation !== state.activityGeneration) return;
      if (!cached) rememberPages(result);
      const row = state.activity = result.activity;
      if (!row) throw new Error('This activity is unavailable.');
      // The same authorised Academy snapshot supplies every scoped timetable.
      if (!cached) { state.home = result; state.scheduleTimetable = scheduleRows(result); }
      $('activity-back-link').href = row.kind === 'COURSE' ? '#workshops' : '#overview';
      $('activity-back-link').innerHTML = row.kind === 'COURSE' ? '← Courses' : homeIcon;
      $('activity-back-link').classList.toggle('academy-home-icon',row.kind !== 'COURSE');
      $('activity-back-link').classList.toggle('text-link',row.kind === 'COURSE');
      $('activity-back-link').setAttribute('aria-label',row.kind === 'COURSE'?'Back to Courses':'Academy home');
      $('activity-back-link').setAttribute('title',row.kind === 'COURSE'?'Back to Courses':'Academy home');
      $('activity-title').textContent = row.name;
      $('activity-kind').textContent = row.kind === 'PROGRAM' ? 'Program' : 'Course';
      $('activity-role').textContent = roleName(row.roles);
      renderSubscriptions(result.signedIn ? result.personalActivities : [], row);
      $('current-view').textContent = row.name;
      const message = row.unavailable ? 'This activity is temporarily unavailable. Please try again.' : !row.roles.length ? 'Sign in with an authorised Academy account to open protected lessons and tools.' : '';
      $('activity-status').textContent = [message,...result.warnings].filter(Boolean).join(' ');
      $('activity-menu').innerHTML = row.roles.length ? roleTools(row) : '';
      syncAttendance(row);
      renderActivityTimetable();
      syncMemorisation(row);
      if(restoreMemorisation){const saved=restoreMemorisation;restoreMemorisation=null;$('activity-sessions').scrollLeft=saved.left;window.requestAnimationFrame?.(()=>window.scrollTo?.(0,saved.top));}
    } catch (error) {
      if (generation !== state.activityGeneration) return;
      pageCache.snapshot = null;
      state.activity = null;
      $('activity-title').textContent = 'Activity unavailable';
      $('activity-status').textContent = error.message;
      $('activity-menu').replaceChildren();
      $('activity-sessions').replaceChildren();
      $('activity-schedule').hidden = true;
      $('pa-main').hidden = true;
      $('mp-teach-panel').hidden = true;
      window.M4L_PROGRAM_ATTENDANCE?.reset();
    }
  }

  async function joinLesson(button) {
    const publicJoin=Boolean(button.dataset.publicJoin);
    const [group,index,lessonIndex] = (button.dataset.publicJoin||button.dataset.join).split(':');
    const lesson = publicJoin?state.information[group]?.[Number(index)]:state.information[group]?.[Number(index)]?.lessons?.[Number(lessonIndex)];
    const session = token(), epoch = pageCache.epoch;
    if (!lesson?.joinKey || !publicJoin&&!session || button.disabled) return;
    // Open synchronously so the browser permits the window; never put a cached meeting URL in it.
    const popup = window.open('about:blank','_blank');
    if (popup) popup.opener = null;
    button.disabled = true;
    button.textContent = 'Checking access…';
    const message = group === 'activity-sessions' ? $('activity-status') : group === 'academy-sessions' ? $('schedule-message') : $('entrance-message');
    try {
      const response = await fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/academy/${publicJoin?'public-lesson':'lesson'}/join`,{method:'POST',
        headers:{'Content-Type':'application/json',...(!publicJoin?{Authorization:`Bearer ${session}`}:{})},body:JSON.stringify({joinKey:lesson.joinKey,date:lesson.sourceDate || lesson.date})});
      const result = await response.json();
      if (session !== token() || epoch !== pageCache.epoch) { popup?.close(); return; }
      if (!response.ok || !result.success || !safeLink(result.joinUrl)) {
        if (response.status === 401) window.dispatchEvent(new Event('m4l-academy-session-ended'));
        throw new Error(result.error || 'This lesson is unavailable. Refresh the timetable.');
      }
      message.textContent = '';
      if (popup) popup.location.replace(result.joinUrl);
      else window.location.assign(result.joinUrl);
    } catch (error) {
      popup?.close();
      if (session === token() && epoch === pageCache.epoch) message.textContent = error.message;
    } finally { button.disabled=false;button.textContent=publicJoin?'Join':'Join lesson'; }
  }

  function armScheduleClock() {
    if(location.hash.endsWith('/surahs-duas')||location.hash.startsWith('#progress-admin')){clearTimeout(state.activityTimer);return;}
    const view = location.hash.slice(1).split('/')[0];
    if (view === 'activity' && state.activity) {
      const rows = activityRows();
      armTimetableClock(rows, () => renderSchedule('activity-sessions', rows));
    } else if (view === 'timetable') {
      armTimetableClock(state.scheduleTimetable, () => {
        renderSchedule('academy-sessions', state.scheduleTimetable);
      });
    } else if (!view || ['overview', 'learning'].includes(view)) {
      const rows = state.home ? scheduleRows(state.home) : [];
      armTimetableClock(rows, () => {
        renderSchedule('academy-preview-sessions', state.home.signedIn?rows:upcomingItems(rows), false, true);
        renderSchedule('academy-sessions', rows);
      });
    }
  }

  function armTimetableClock(rows, render) {
    clearTimeout(state.activityTimer);
    if (document.visibilityState !== 'visible' || !state.home || !state.home.signedIn&&!rows.some(row=>row.publicJoin)) return;
    const generation = state.activityGeneration, epoch = pageCache.epoch, session = token(), hash = location.hash;
    const now = new Date().getTime();
    let midnight = now + 3600000;
    while (academyDay(state.home.timezone, midnight) === academyDay(state.home.timezone, now)) midnight += 3600000;
    let low = midnight - 3600000, high = midnight;
    while (high - low > 1000) { const mid = Math.floor((low + high) / 2); if (academyDay(state.home.timezone, mid) === academyDay(state.home.timezone, now)) low = mid; else high = mid; }
    const transitions = rows.flatMap(row => [row.joinAvailableAt, row.startsAt, row.endsAt]).filter(time => time > now);
    const delay = Math.max(250, Math.min(high - now, ...transitions.map(time => time - now)));
    const day = academyDay(state.home.timezone, now);
    state.activityTimer = setTimeout(() => {
      if (token() !== session || epoch !== pageCache.epoch || document.visibilityState !== 'visible' || generation !== state.activityGeneration || location.hash !== hash) return;
      // Lesson boundaries only change presentation. Fetch once when the Academy day changes.
      if (academyDay(state.home.timezone) !== day && state.home.signedIn) { void loadHome(); return; }
      render();
      armTimetableClock(rows, render);
    }, delay);
  }

  function route() {
    const hash = location.hash || '#overview';
    if (lastRouteHash && hash !== lastRouteHash) {
      if (window.M4L_PROGRAM_ATTENDANCE?.canLeave() === false || window.M4L_ACADEMY_PROGRESS?.canLeave() === false || window.M4L_MEMORISATION_ADMIN?.canLeave() === false) { history.replaceState(null,'',lastRouteHash); return; }
      if(!memorisationHash(lastRouteHash)&&memorisationHash(hash)){memorisationReturn={hash:lastRouteHash,top:window.scrollY||0,left:$('activity-sessions').scrollLeft||0};if(dailyCache.owner)try{sessionStorage.setItem(MEMORISATION_RETURN_KEY,JSON.stringify({...memorisationReturn,owner:dailyCache.owner}));}catch{}}
      if(memorisationHash(lastRouteHash)&&hash===memorisationReturn?.hash)restoreMemorisation=memorisationReturn;
      window.M4L_PROGRAM_ATTENDANCE?.reset();
      window.M4L_ACADEMY_PROGRESS?.reset();
      window.M4L_MEMORISATION_ADMIN?.reset();
      $('pa-main').hidden = true;
      $('mp-teach-panel').hidden = true;
      if($('workspace-tool').open)$('workspace-tool').close();
    }
    if(hash === '#timetable'){
      let previous = '#overview';
      try{previous = sessionStorage.getItem(TIMETABLE_RETURN_KEY) || previous;}catch{}
      if(lastRouteHash && lastRouteHash !== hash)previous = lastRouteHash;
      if(!validReturnHash(previous))previous = '#overview';
      $('timetable-close').href = previous;
      if(token())try{sessionStorage.setItem(TIMETABLE_RETURN_KEY,previous);}catch{}
    }
    lastRouteHash = hash;
    const [requested, , encodedId] = location.hash.slice(1).split('/');
    if (requested !== 'activity') { clearTimeout(state.activityTimer); state.activityGeneration++; renderSubscriptions(state.home?.signedIn ? state.home.personalActivities : []); }
    const name = requested === 'learning' ? 'overview' : titles[requested] ? requested : 'overview';
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === name));
    document.querySelectorAll('[data-nav]').forEach(button => {
      const current = button.dataset.nav === requested || !requested && button.dataset.nav === 'overview';
      button.classList.toggle('active', current);
      if (current) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    $('current-view').textContent = titles[name];
    if (requested === 'learning') $('learning').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    if (name === 'progress') { $('mp-personal-close').href=memorisationReturn?.hash||'#overview';void window.M4L_ACADEMY_PROGRESS?.open(); }
    if (name === 'workshops') renderWorkshops();
    if (name === 'activity' && encodedId && state.home) { try { void loadActivity(decodeURIComponent(encodedId)); } catch { $('activity-status').textContent = 'This activity link is invalid.'; } }
    if(name==='progress-admin'&&state.home){if(encodedId){try{void loadActivity(decodeURIComponent(encodedId));}catch{$('mp-admin-context').textContent='Invalid learning area.';}}else syncMemorisation({kind:hash.includes('/COURSE')?'COURSE':'',name:hash.includes('/COURSE')?'Courses':'Academy',roles:[],tools:{}});}
    if (name === 'recorder') $('recorder-card').innerHTML = state.home?.student ? '<p>Select an existing lesson image, record your voice, then preview and share your video.</p><a class="button" href="/recorder/?academy=1">Open Voice Recorder →</a>' : '<p>Voice Recorder is available to signed-in Academy students.</p>';
    if (name === 'administration') renderAdministration();
    if (requested !== 'activity') armScheduleClock();
  }

  function renderAdministration() {
    let view = $('administration');
    if (!view) { view = document.createElement('section'); view.id = 'administration'; view.className = 'view active'; document.querySelector('.container').appendChild(view); }
    view.classList.add('active');
    view.innerHTML = '<div class="page-heading"><h1>Academy administration</h1></div>' + (state.home?.globalAdmin ? '<div class="activity-pills"><a href="/users/">User profiles</a><a href="/academy/subjects/">Subjects &amp; Modules</a><a href="#progress-admin">Surahs and Duas</a><a href="/programs/">Manage Programs</a><a href="/academy/courses/manage/">Course management</a><a href="/academy/courses/manage/?view=scheduling">Course scheduling</a><a href="/academy/library/manage/">Manage Library</a></div>' : '<p>This page requires an authenticated Global Admin account.</p>');
  }

  function bindPublicTimetableRefresh(){
    const button=$('public-timetable-refresh');
    if(button)button.onclick=async()=>{
      if(button.disabled)return;const session=token(),epoch=pageCache.epoch;button.disabled=true;
      const status=$('public-timetable-refresh-message');status.textContent='Refreshing the public timetable…';
      try{
        const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/admin/platform/public-timetable/refresh`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session}`},body:'{}'}),result=await response.json();
        if(session!==token()||epoch!==pageCache.epoch)return;
        if(!response.ok||!result.success)throw Error(result.error||'The public timetable could not be refreshed.');
        status.textContent='Public timetable refreshed. Visitors will see the update within one minute.';
      }catch(error){if(session===token()&&epoch===pageCache.epoch)status.textContent=error.message;}
      finally{button.disabled=false;}
    };
  }

  function clearPersonal() {
    memorisationReturn=null;restoreMemorisation=null;$('mp-teach-panel').hidden=true;$('mp-admin-context').textContent='';window.M4L_MEMORISATION_ADMIN?.reset();
    window.M4L_ACADEMY_PROGRESS?.reset();
    window.M4L_PROGRAM_ATTENDANCE?.reset();
    $('pa-main').hidden = true;
    lastRouteHash = '';
    if(!token() || navigationSession !== token())try{sessionStorage.removeItem(TIMETABLE_RETURN_KEY);sessionStorage.removeItem(MEMORISATION_RETURN_KEY);dailyCache.owner='';}catch{}
    navigationSession = token();
    $('timetable-close').href = '#overview';
    pageCache.epoch++;
    pageCache.snapshot = null;
    pageCache.pending.clear();
    state.generation++;
    state.scheduleGeneration++;
    state.activityGeneration++;
    state.home = null;
    state.activity = null;
    state.courseCatalogue = null;
    state.courseCatalogueAt = 0;
    state.courseGeneration++;
    state.coursePending = null;
    state.scheduleTimetable = [];
    clearTimeout(state.activityTimer);
    state.information = {};
    $('personal-activities').hidden = true;
    $('academy-progress-nav').hidden = false;
    $('academy-recorder-nav').hidden = true;
    for (const id of ['personal-pills', 'workshop-pills', 'academy-preview-sessions', 'academy-sessions', 'activity-switcher', 'activity-menu', 'activity-sessions', 'workshop-tools', 'recorder-card']) $(id).replaceChildren();
    $('activity-switcher').hidden = true;
    $('schedule-title').textContent = 'Academy timetable';
    $('full-timetable-title').textContent = 'Full Academy timetable';
    $('workshops-message').textContent = '';
    $('course-list-message').textContent = '';
    $('course-list-search').value = '';
    $('course-list-stage').value = 'ALL';
    $('course-list-scope').value = 'MINE';
    $('course-list-scope-wrap').hidden = true;
    $('course-list-retry').hidden = true;
    $('activity-back-link').href = '#overview';
    $('activity-back-link').innerHTML = homeIcon;
    $('activity-back-link').classList.add('academy-home-icon');
    $('activity-back-link').classList.remove('text-link');
    $('activity-back-link').setAttribute('aria-label','Academy home');
    $('activity-back-link').setAttribute('title','Academy home');
    $('preview-timetable-link').hidden = true;
    $('timetable-refresh').hidden = true;
    $('schedule-refresh').hidden = true;
    $('public-snapshot-note').hidden = true;
    $('schedule-message').textContent = '';
    $('activity-title').textContent = '';
    $('activity-role').textContent = '';
    $('activity-status').textContent = '';
    $('activity-kind').textContent = '';
    $('current-view').textContent = 'Academy home';
    $('activity-schedule').hidden = true;
    if ($('workspace-tool').open) $('workspace-tool').close();
    $('workspace-tool-body').replaceChildren();
    if ($('administration')) $('administration').replaceChildren();
    if ($('lesson-information').open) $('lesson-information').close();
    $('lesson-information-body').replaceChildren();
  }

  window.addEventListener('m4l-memorisation-card-updated',event=>{
    if(!event.detail?.own||!state.home)return;
    state.home.memorisationActive=event.detail.active;
    if(pageCache.snapshot)pageCache.snapshot.result.memorisationActive=event.detail.active;
    dailyCache.entries={};try{sessionStorage.removeItem(DAILY_CACHE_KEY);}catch{}
    renderHome();if(state.activity){$('activity-menu').innerHTML=roleTools(state.activity);renderSubscriptions(state.home.personalActivities,state.activity);}
  });

  document.addEventListener('visibilitychange', () => {
    clearTimeout(state.activityTimer);
    if(document.visibilityState==='visible'&&!token()&&state.home){renderHome();armScheduleClock();return;}
    if (document.visibilityState === 'visible' && token()) {
      if (location.hash === '#timetable') void loadSchedule();
      else if (location.hash.startsWith('#activity/') && state.activity && state.home?.startDate === academyDay(state.home.timezone)) renderActivityTimetable();
      else if (['#overview', ''].includes(location.hash) || location.hash.startsWith('#activity/')) void loadHome();
    }
  });

  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-nav]');
    if (nav) { event.preventDefault(); location.hash = nav.dataset.nav; route(); }
    const tool = event.target.closest('[data-workspace-tool]');
    if (tool) openWorkspaceTool(tool.dataset.workspaceTool);
    const join = event.target.closest('[data-join]') || event.target.closest('[data-public-join]');
    if (join) void joinLesson(join);
    const info = event.target.closest('[data-information]');
    if (info) {
      const [group, index] = info.dataset.information.split(':');
      const row = state.information[group]?.[Number(index)];
      if (!row) return;
      $('lesson-information-title').textContent = row.title;
      $('lesson-information-body').innerHTML = (row.lessons || [row]).map(lesson => {
        const classes = (lesson.classNames || [lesson.group]).filter(Boolean).join(', ');
        const teachers = (lesson.teacherNames || [lesson.teacherName]).filter(Boolean).join(', ');
        return `<section class="combined-lesson"><h3>${esc(lesson.moduleName || lesson.subjectName || lesson.title)}</h3><div class="lesson-info-meta">${classes ? `<p class="lesson-info-class">${esc(classes)}</p>` : ''}<p class="lesson-info-time">${esc(lesson.startTime)}–${esc(lesson.endTime)}</p></div>${teachers ? `<p class="lesson-info-teacher">${esc(teachers)}</p>` : ''}</section>`;
      }).join('');
      $('lesson-information').showModal();
    }
  });
  $('workspace-tool-close').addEventListener('click', () => $('workspace-tool').close());
  $('activity-refresh').addEventListener('click', () => void loadHome(true));
  $('lesson-information-close').addEventListener('click', () => $('lesson-information').close());
  for (const [id, direction, target] of [['upcoming-previous', -1, 'academy-preview-sessions'], ['upcoming-next', 1, 'academy-preview-sessions'], ['learning-previous', -1, 'learning-catalogue'], ['learning-next', 1, 'learning-catalogue'], ['activity-previous', -1, 'activity-sessions'], ['activity-next', 1, 'activity-sessions']]) $(id).addEventListener('click', () => {
    const strip = $(target);
    strip.scrollBy({ left: direction * strip.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  for (const id of ['course-list-search', 'course-list-stage', 'course-list-scope']) $(id).addEventListener('input', renderCourseList);
  $('course-list-retry').addEventListener('click', () => void loadCourses());
  $('entrance-retry').addEventListener('click', () => void loadHome(true));
  $('timetable-refresh').addEventListener('click', () => void loadHome(true));
  $('schedule-refresh').addEventListener('click', () => void loadSchedule(true));
  $('schedule-date').addEventListener('change', () => { state.startDate = $('schedule-date').value; void loadSchedule(); });
  for (const [id, days] of [['schedule-previous', -7], ['schedule-next', 7]]) $(id).addEventListener('click', () => {
    if (!state.startDate) return;
    state.startDate = new Date(Date.parse(`${state.startDate}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    void loadSchedule();
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('m4l-academy-session', () => { if (!token()) { dailyCache.session='';dailyCache.entries={};try { sessionStorage.removeItem(DAILY_CACHE_KEY); } catch {} } clearPersonal(); void loadHome(); });
  window.addEventListener('storage', event => { if (event.key === 'm4l_account_token') { clearPersonal(); void loadHome(); } });
  window.addEventListener('pageshow', event => { if (event.persisted) { clearPersonal(); void loadHome(); } });

  route();
  renderCatalogue();
  void loadHome();
})();
