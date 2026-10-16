(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const token = () => localStorage.getItem('m4l_account_token') || '';
  const state = { publicData:null,publicDay:'',publicPending:null,publicStartDate:'', home: null, activity: null, scheduleTimetable: [], activityTimer: null, generation: 0, scheduleGeneration: 0, activityGeneration: 0, information: {}, startDate: '', courseCatalogue: null, courseCatalogueAt: 0, coursePending: null, courseGeneration: 0 };
  const pageCache = { epoch: 0, snapshot: null, pending: new Map() };
  const PAGE_CACHE_MS = 60000;
  const ACTIVITY_CACHE_MS = 86400000;
  const profileLabelRevision=()=>{try{return localStorage.getItem('m4l_academy_profile_labels_revision')||'';}catch{return '';}};
  const dailyCache = { session: '', owner:'', entries: {},profileRevision:profileLabelRevision() };
  let labelsVersion,labelsCheckedAt=0,labelsPending=null;
  async function checkRemoteProfileLabels(force=false){
    if(!token()||!force&&Date.now()-labelsCheckedAt<60000)return false;
    if(labelsPending)return labelsPending;
    const session=token();
    labelsPending=(async()=>{
      try{
        const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/academy/profile-labels-version`,{cache:'no-cache'}),result=await response.json();
        if(session!==token()||!response.ok||!result.success||typeof result.profileLabelsVersion!=='string')return false;
        labelsCheckedAt=Date.now();
        const previous=labelsVersion;labelsVersion=result.profileLabelsVersion;
        if(previous!==undefined&&previous!==labelsVersion){dailyCache.entries={};pageCache.snapshot=null;return true;}
      }catch{labelsCheckedAt=Date.now();/* Keep cached information; no retry loop. */}
      return false;
    })();
    try{return await labelsPending;}finally{labelsPending=null;}
  }
  function checkProfileLabels(){const revision=profileLabelRevision();if(revision!==dailyCache.profileRevision){dailyCache.profileRevision=revision;dailyCache.entries={};pageCache.snapshot=null;}return revision;}
  const MEMORISATION_RETURN_KEY='m4l_academy_memorisation_return_v1';
  const DAILY_CACHE_KEY = 'm4l_academy_daily_timetable_10683';
  let planningSelection=null;
  const academyDay = (timezone, instant = Date.now()) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:timezone || 'Africa/Johannesburg',
      year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant)).map(part=>[part.type,part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const addWeekDays=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
  const sunday=date=>addWeekDays(date,-new Date(date+'T12:00:00Z').getUTCDay());
  const currentWeek=()=>sunday(academyDay(state.home?.timezone));
  const scheduleCard=$('academy-schedule');
  function dockTimetable(target){if(target&&scheduleCard.parentElement!==target)target.appendChild(scheduleCard);}
  function weekButtons(){for(const id of ['schedule-previous','activity-previous'])$(id).disabled=!state.startDate||state.startDate<=currentWeek();for(const id of ['schedule-next','activity-next'])$(id).disabled=!token()&&state.startDate>=addWeekDays(state.home?.availableEndDate||state.home?.endDate||state.startDate,-6);}
  function roleRows(data){const rows=scheduleRows(data),teach=location.hash==='#timetable/teach';if(!teach||data.globalAdmin)return rows;const areas=new Set((data.personalActivities||[]).filter(r=>staffRoles(r.roles||[])).map(r=>r.kind+':'+r.id));return rows.filter(r=>areas.has(r.kind+':'+r.activityId));}
  function workspaceAreaLinks(mode,current,activities=state.home?.personalActivities||[]){
    const rows=activities.filter(row=>menuActivity(row)&&(state.home?.globalAdmin||mode!=='teach'||staffRoles(row.roles||[])));
    return [['PROGRAM','Programs'],['COURSE','Courses']].map(([kind,label])=>{
      const links=rows.filter(row=>row.kind===kind).map(row=>{
        const selected=Boolean(current&&row.kind===current.kind&&row.id===current.id);
        return activityPill(workspaceHref(row,'timetable',mode),row.name,row.roles,selected)+hifzHelperLink(row,'workspace-helper-link');
      }).join('');
      return links?`<div class="workspace-area-group" role="group" aria-label="${label}"><h2>${label}</h2><div class="workspace-area-links">${links}</div></div>`:'';
    }).join('');
  }
  function renderUpcomingCourses(){
    const host=$('upcoming-courses'),list=$('upcoming-course-list'),data=state.home;
    const rows=data?.signedIn&&location.hash==='#timetable/teach'?data.upcomingCourses||[]:[];
    host.hidden=!rows.length;
    list.innerHTML=rows.map(row=>{
      const course={kind:'COURSE',id:row.id},dates=`${formatDate(row.startDate)}${row.endDate&&row.endDate!==row.startDate?' – '+formatDate(row.endDate):''}`;
      return `<li class="upcoming-course"><div><h3><a href="${workspaceHref(course,'timetable','teach')}">${esc(row.name)}</a></h3><p>${esc(dates)}${row.stage==='DRAFT'?' · Draft':''}</p></div><div class="workspace-actions">${row.stage!=='DRAFT'?`<button type="button" class="button secondary" data-upcoming-week="${esc(row.startDate)}">Show starting week</button>`:''}${row.canPlan?`<a class="button secondary" href="${workspaceHref(course,'planning','teach')}" data-upcoming-plan="${esc(row.id)}" data-plan-start="${esc(row.startDate)}" data-plan-run="${esc(row.runId)}">Planning</a>`:''}${row.canManage?`<a class="text-link" href="/academy/courses/manage/?course=${encodeURIComponent(row.id)}&amp;run=${encodeURIComponent(row.runId)}">Manage</a>`:''}</div></li>`;
    }).join('');
  }
  function renderRoleLinks(){
    const teach=location.hash==='#timetable/teach',mode=teach?'teach':'learn',data=state.home;
    const host=$('timetable-quicklinks'),areas=$('timetable-areas');
    $('timetable').dataset.workspaceMode=data?.signedIn?mode:'public';
    $('full-timetable-title').textContent=data?.signedIn?(teach?'TEACH':'LEARN'):'Academy timetable';
    $('learn-enrolment-entry').hidden=!data?.signedIn||teach;
    renderUpcomingCourses();
    if(!data?.signedIn){host.innerHTML='<a href="#overview">Academy home</a>';areas.replaceChildren();return;}
    const rows=(data.personalActivities||[]).filter(r=>menuActivity(r)&&(data.globalAdmin||!teach||staffRoles(r.roles||[]))),first=rows[0];
    const link=(href,text)=>'<a href="'+esc(href)+'">'+esc(text)+'</a>';
    areas.innerHTML=workspaceAreaLinks(mode);areas.setAttribute('aria-label',teach?'Your teaching Programs and Courses':'Your learning Programs and Courses');
    host.innerHTML='<div class="role-shortcuts">'+link('#overview','Academy home')+link('/academy/library/','Library')+link('/academy/calendar/?view='+mode,'Academic Calendar')+link('#overview','Announcements')+link('#assessments','My assessments')+link('#progress','Surahs and Duas')+link('/activities/surahs-in-my-heart/','Surahs in my Heart')+link('/activities/kaaba-puzzle/','Kaaba puzzle')+link('#about','About')+link('#contact','Contact')+(data.student?link('#recorder','Voice Recorder'):'')+(teach?link('/academy/teaching/','Edit availability')+(first?link(workspaceHref(first,'attendance','teach'),'Attendance')+link(workspaceHref(first,'planning','teach'),'Planning'):''):'')+'</div>';
  }
  const homeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7"/><path d="M5 9v12h5v-7h4v7h5V9"/></svg>';
  const TIMETABLE_RETURN_KEY = 'm4l_academy_timetable_return';
  let workspaceFocusId = '';
  let lastRouteHash = '', navigationSession = token(), memorisationReturn = null, restoreMemorisation = null;
  const memorisationHash = hash => ['#progress','#hifz','#hifdh'].includes(hash) || hash.startsWith('#progress-admin') || hash.endsWith('/surahs-duas') || hash.endsWith('/assessment') || hash.startsWith('#assessment-admin') || hash.startsWith('#assessments');
  const validReturnHash = hash => typeof hash === 'string' && (hash !== '#timetable' && Boolean(titles[hash.slice(1).split('/')[0]]) || /^#activity\/(PROGRAM|COURSE)\/[^/#]+(?:\/(?:learn|teach))?(?:\/(?:attendance|surahs-duas|assessment|library|planning))?$/.test(hash));
  const titles = { overview: 'Academy home', timetable: 'Academy timetable', learning: 'Programs and Courses', workshops: 'Courses', activity: 'Activity',
    prospectus: '2026 Prospectus', about: 'About', contact: 'Contact', hifz:'Surahs and Duas', hifdh:'Surahs and Duas', progress: 'Surahs and Duas', 'progress-admin':'Manage Surahs and Duas', 'assessment-admin':'Manage Assessments', assessments:'My assessments', recorder: 'Voice Recorder', administration: 'Manage Academy' };
  const activityHref = row => `#activity/${row.kind}/${encodeURIComponent(row.id)}`;
  const staffRoles = roles => roles.some(role => ['TEACHER', 'PROGRAM_ADMIN', 'ADMIN', 'SENIOR', 'GLOBAL_ADMIN'].includes(role));
  const roleName = roles => roles.map(role => ({ GLOBAL_ADMIN: 'Global Admin', PROGRAM_ADMIN: 'Program Admin', ADMIN: 'Program Admin', SENIOR: 'Senior', TEACHER: 'Teacher', STUDENT: 'Student' })[role]).filter(Boolean).join(' · ') || 'None';
  const menuActivity=row=>row.menuAvailable!==false&&![row.stage,row.status,row.lifecycle].some(value=>['CANCELLED','ARCHIVED'].includes(String(value||'').toUpperCase()));
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
    const assessments = location.hash.endsWith('/assessment');
    const assessmentAdmin = location.hash.startsWith('#assessment-admin');
    const pill = activityPill(assessmentAdmin?`#assessment-admin/${row.kind}/${encodeURIComponent(row.id)}`:administration?`#progress-admin/${row.kind}/${encodeURIComponent(row.id)}`:activityHref(row) + (attendance ? '/attendance' : teaching?'/surahs-duas':assessments?'/assessment':''), row.name, row.roles, current);
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
    checkProfileLabels();
    await checkRemoteProfileLabels(force);
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
      if (saved?.owner === owner && saved.profileRevision === dailyCache.profileRevision && (labelsVersion===undefined||saved.labelsVersion===labelsVersion)) dailyCache.entries = {...saved.entries,...dailyCache.entries};
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
        if (owner) try { sessionStorage.setItem(DAILY_CACHE_KEY,JSON.stringify({owner,profileRevision:dailyCache.profileRevision,labelsVersion,entries:dailyCache.entries})); } catch {}
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
    checkProfileLabels();
    const snapshot = pageCache.snapshot, now = new Date().getTime();
    if (!snapshot || snapshot.session !== token() || now < snapshot.at || now - snapshot.at >= ACTIVITY_CACHE_MS) return null;
    const result = snapshot.result;
    const clock = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: result.timezone,
      year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
    if (result.startDate !== sunday(`${clock.year}-${clock.month}-${clock.day}`)) return null;
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
      state.home = result;state.homeDay=academyDay(result.timezone);
      state.startDate = result.startDate;
      state.scheduleTimetable = scheduleRows(result);
      $('schedule-date').value = result.startDate;
      $('schedule-range').textContent = `${formatDate(result.startDate)} – ${formatDate(result.endDate)}`;
      renderCalendar(result);
      $('entrance-message').textContent = result.warnings.join(' ');
      $('entrance-retry').hidden = !result.warnings.length;
      renderHome();
      void loadPublicHome();
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
      const result = !token()&&state.home?{...state.home,startDate:state.startDate,endDate:addWeekDays(state.startDate,6)}:!force&&state.startDate===state.home?.startDate?state.home:state.startDate === state.home?.startDate ? await dailyTimetable({}, force) : await dailyTimetable({ startDate: state.startDate }, force);
      if (generation !== state.scheduleGeneration) return;
      if (result.startDate === state.home?.startDate) { state.home=result;rememberPages(result);renderHome(); }
      state.startDate = result.startDate;
      $('schedule-date').value = result.startDate;
      $('schedule-range').textContent = `${formatDate(result.startDate)} – ${formatDate(result.endDate)}`;
      renderCalendar(result);
      $('schedule-message').textContent = result.warnings.join(' ');
      state.scheduleTimetable = scheduleRows(result);
      renderSchedule('academy-sessions', roleRows(result));
      if(location.hash.startsWith('#activity/'))renderActivityTimetable();
      weekButtons();
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

  async function loadPublicHome() {
    try {
      if(state.home?.signedIn===false&&state.home.snapshotDate===academyDay(state.home.timezone)){state.publicData=state.home;state.publicDay=academyDay(state.home.timezone);}
      if(!state.publicData||state.publicDay!==academyDay(state.publicData.timezone)) {
        if(!state.publicPending)state.publicPending=(async()=>{
          const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/academy/entrance/public-snapshot`,{method:'GET',cache:'no-cache'}),data=await response.json();
          if(!response.ok||!data.success||data.signedIn!==false||!Array.isArray(data.timetable))throw Error('The public timetable is currently unavailable.');
          state.publicData=data;state.publicDay=academyDay(data.timezone);
        })().finally(()=>{state.publicPending=null;});
        await state.publicPending;
      }
      const first=sunday(academyDay(state.publicData.timezone));
      if(!state.publicStartDate||state.publicStartDate<first)state.publicStartDate=first;
      renderPublicHome();armScheduleClock();
    } catch(error){$('academy-public-sessions').textContent=error.message;}
  }
  const publicMobileView=matchMedia('(max-width:999px)');
  publicMobileView.addEventListener?.('change',()=>{if(state.publicData)renderPublicHome();});
  function publicWeekHeading(){
    const nextWeek=state.publicStartDate===addWeekDays(sunday(academyDay(state.publicData.timezone)),7);
    $('public-timetable-title').textContent=nextWeek?'What’s on next week':'What’s on this week';
    $('public-timetable-range').textContent=formatDate(state.publicStartDate)+' – '+formatDate(addWeekDays(state.publicStartDate,6));
    $('public-home-previous').hidden=$('public-home-previous').disabled=!nextWeek;
    $('public-home-next').hidden=$('public-home-next').disabled=nextWeek;
  }
  function renderPublicHome(){
    const data=state.publicData;if(!data)return;
    const first=sunday(academyDay(data.timezone)),last=addWeekDays(first,7);
    if(state.publicStartDate!==first&&state.publicStartDate!==last)state.publicStartDate=first;
    const host=$('academy-public-sessions'),left=host.scrollLeft||0;
    renderSchedule('academy-public-sessions',data.timetable,false,true,{public:true,startDate:publicMobileView.matches?first:state.publicStartDate,days:publicMobileView.matches?14:7});
    if(publicMobileView.matches)host.scrollLeft=left;
    publicWeekHeading();
  }

  function renderHome() {
    const data = state.home;
    $('academy-recorder-nav').hidden = !(data.signedIn && data.student);
    const activities = data.signedIn ? data.personalActivities : [];
    renderAcademyMenu();
    renderSubscriptions(activities);
    renderWorkshops();
    const personalSchedule = scheduleRows(data);
    $('schedule-title').textContent = data.signedIn ? 'My Timetable' : 'Academy timetable';
    if($('teaching-availability-link'))$('teaching-availability-link').hidden=!data.signedIn||!(data.globalAdmin||(data.personalActivities||[]).some(r=>r.roles?.some(role=>['TEACHER','PROGRAM_ADMIN','ADMIN'].includes(role))));
    $('full-timetable-title').textContent = data.signedIn ? (location.hash==='#timetable/teach'?'TEACH':'LEARN') : 'Academy timetable';
    $('preview-title').textContent = data.signedIn ? 'My Academy timetable' : 'Coming up';
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
    renderSchedule('academy-sessions', roleRows(data));
    weekButtons();
  }

  function workspaceContext(row) {
    const parts = location.hash.slice(1).split('/'), explicit = ['learn','teach'].includes(parts[3]);
    const staff = Boolean(state.home?.globalAdmin || staffRoles(row.roles || []));
    const mode = explicit ? parts[3] === 'teach' && staff ? 'teach' : 'learn' : staff ? 'teach' : 'learn';
    const requested = (explicit ? parts[4] : parts[3]) || 'timetable';
    const tools = mode === 'teach' ? ['timetable','attendance','planning','assessment','library','surahs-duas'] : ['timetable','assessment','library'];
    const tool = tools.includes(requested) ? requested : 'timetable';
    return {mode,tool,explicit,staff};
  }
  function workspaceHref(row, tool = 'timetable', mode = '') {
    const context = workspaceContext(row), role = mode || (context.explicit ? context.mode : '');
    return activityHref(row) + (role ? '/'+role : '') + (tool === 'timetable' ? '' : '/'+tool);
  }
  function renderAcademyMenu() {
    const data = state.home, activities = data?.signedIn ? data.personalActivities : [];
    const global = Boolean(data?.signedIn && data.globalAdmin), roles = [...new Set(activities.flatMap(row => row.roles || []))];
    const available = {learn:global || Boolean(highestAccess(roles)), teach:global || staffRoles(roles), admin:global || adminRoles(roles)};
    const choices = ['learn','teach','admin'].filter(key => data?.signedIn && available[key]);
    const parts = location.hash.slice(1).split('/'), home = !parts[0] || ['overview','learning'].includes(parts[0]);
    const requested = parts[0]==='timetable'?parts[1]||'learn':['administration','assessment-admin','progress-admin'].includes(parts[0]) ? 'admin' : parts[0] === 'activity' && state.activity ? workspaceContext(state.activity).mode : home ? parts[1] : '';
    if (choices.includes(requested)) state.academyTab = requested;
    if (!choices.includes(state.academyTab)) state.academyTab = choices[0] || '';
    const panel = $('academy-role-panel');
    window.M4L_ACADEMY_SHELL_DATA=data;window.M4L_ACADEMY_SHELL?.update(data);
    $('progress').hidden=Boolean(data?.signedIn&&data.memorisationActive===false);
    const helper=$('hifdh-helper'), loginId=window.M4L_ACADEMY_LOGIN?.currentId() || '', helperBase=window.M4L_CONFIG?.HIFZHELPER_URL;
    helper.hidden=!(data?.signedIn && /^[A-Za-z0-9]+$/.test(loginId) && /^https:\/\//.test(helperBase||''));
    if(!helper.hidden)helper.href=helperBase.replace(/\/$/,'')+'/'+encodeURIComponent(loginId);
    $('academy-account-role').textContent = data?.signedIn ? highestAccess(roles) || 'None' : '';
    $('academy-access-empty').hidden = !data?.signedIn || Boolean(choices.length);
    for (const key of ['learn','teach','admin']) {
      const tab = $('academy-tab-'+key), active = !home && key === state.academyTab;
      tab.hidden = !choices.includes(key);tab.setAttribute('aria-pressed', String(active));tab.setAttribute('aria-controls',key === 'admin' ? 'administration' : 'timetable');tab.tabIndex = 0;
    }
    panel.hidden = true;
    panel.setAttribute('aria-labelledby', 'academy-tab-'+state.academyTab);
    if (!choices.length || state.academyTab === 'admin') {panel.replaceChildren();return;}
    const mode = state.academyTab, rows = activities.filter(row => menuActivity(row) && (global || (mode === 'teach' ? staffRoles(row.roles || []) : adminRoles(row.roles||[])||row.roles?.includes('STUDENT'))));
    panel.innerHTML = `<p class="academy-chooser-heading">Select a Program or Course to ${mode === 'teach' ? 'teach' : 'learn'}</p><div class="academy-choices">${rows.map(row => {
      const pill = row.kind === 'PROGRAM' && row.id === window.M4L_CONFIG?.HIFZ_PROGRAM_ID ? '' : activityPill(workspaceHref(row,'timetable',mode),row.name,row.roles);
      const helper = hifzHelperLink(row,'activity-pill-shortcut');
      return `<div class="academy-choice"><span class="academy-choice-kind">${row.kind === 'PROGRAM' ? 'Program' : 'Course'}</span>${pill}${helper}</div>`;
    }).join('')}</div>${rows.length ? '' : `<p class="muted">No ${mode === 'teach' ? 'teaching' : 'learning'} Programs or Courses are assigned to this account.</p>`}`;
  }

  function renderSubscriptions(activities, current) {
    const view = location.hash.slice(1).split('/')[0];
    const strip = $('activity-switcher');
    if (view && !titles[view]) {
      strip.replaceChildren();
      strip.hidden = true;
      return;
    }
    const programs = activities.filter(item => item.kind === 'PROGRAM'&&menuActivity(item));
    const courses = activities.filter(item => item.kind === 'COURSE'&&menuActivity(item));
    strip.innerHTML = programs.map(item => programPill(item,
      Boolean(current && item.id === current.id && current.kind === 'PROGRAM'))).join('') +
      (state.home?.signedIn && (state.home.globalAdmin || courses.some(row=>row.roles.length)) ? activityPill('#workshops', 'Courses', state.home.globalAdmin ? ['GLOBAL_ADMIN', 'PROGRAM_ADMIN'] : [...new Set(courses.flatMap(item => item.roles))],
        view === 'workshops' || current?.kind === 'COURSE') : '');
    strip.hidden = !state.home?.signedIn;
  }

  const adminRoles = roles => roles.some(role => ['GLOBAL_ADMIN','PROGRAM_ADMIN','ADMIN'].includes(role));
  function catalogueTools(row) {
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
      link('Courses', global || row.kind !== 'PROGRAM' ? '/academy/courses/manage/' : '') + (row.kind==='PROGRAM'?link('Surahs and Duas',`#progress-admin/PROGRAM/${encodeURIComponent(row.id)}`):'') + link('Assessments',row.id?`#assessment-admin/${row.kind}/${encodeURIComponent(row.id)}`:'#assessment-admin/COURSE') + tool('Academy','academy')) : '') +
      (staff ? group('Teach', hifzHelper + (row.kind === 'PROGRAM' ? `<a href="${activityHref(row)}/attendance" aria-expanded="${location.hash.endsWith('/attendance')}" aria-controls="pa-main">Attendance</a>` + link('Surahs and Duas',`${activityHref(row)}/surahs-duas`) : tool('Attendance','attendance')) + link('Assessment',row.id?`${activityHref(row)}/assessment`:'#assessments/COURSE') + link('Planning',`${activityHref(row)}/planning`) + tool('Announcements','announcements') + link('My Timetable','#timetable') + link('Edit availability','/academy/teaching/')) : '') +
      (learner && !staff ? group('Learn', (!staff?hifzHelper:'') + link('Library','/academy/library/') + link('My Assessment',row.id?`${activityHref(row)}/assessment`:'#assessments/COURSE') + tool('Calendar','calendar') + tool('Announcements','announcements') + link('My Timetable','#timetable')) : '');
  }

  function roleTools(row) {
    if (!row.id) return catalogueTools(row);
    const context = workspaceContext(row), tools = context.mode === 'teach'
      ? [['timetable','Timetable','activity-schedule'],['attendance','Attendance',row.kind === 'COURSE' ? 'activity-planning' : 'pa-main'],['planning','Planning','activity-planning'],['assessment','Assessment','as-panel'],['library','Library','activity-library']]
      : [['timetable','Timetable','activity-schedule'],['assessment','Assessment','as-panel'],['library','Library','activity-library']];
    return `<nav class="workspace-tabs" aria-label="${context.mode === 'teach' ? 'Teach' : 'Learn'} tools" role="tablist">${tools.map(([key,label,panel]) => `<a id="activity-tab-${key}" role="tab" href="${key==='library'?'/academy/library/':workspaceHref(row,key)}" aria-controls="${panel}" aria-selected="${context.tool === key}" tabindex="${context.tool === key ? 0 : -1}">${label}</a>`).join('')}</nav>${hifzHelperLink(row,'workspace-helper')}`;
  }
  function supportSections(row, mode) {
    const staff = mode !== 'learn';
    const tracker = mode === 'teach' && row
      ? `<details class="academy-support-card academy-progress-section" data-progress-activity="${esc(row.kind+':'+row.id)}"><summary><span>Surahs and Duas Tracker</span><small>Class progress</small></summary><div id="activity-progress-host" class="academy-inline-progress" aria-label="Surahs and Duas class progress"></div></details>`
      : '<a class="academy-support-card academy-tracker-link" href="#progress-admin"><strong>Surahs and Duas Tracker</strong><small>Manage progress</small><span aria-hidden="true">›</span></a>';
    return `<details class="academy-support-card academy-messages"><summary><span>${staff ? 'Reminders' : 'Messages'}</span><small>Coming soon</small></summary><p class="muted">${staff ? 'Editing and sending reminders' : 'Academy messaging'} is coming soon.</p></details>
      <details class="academy-support-card academy-calendar-section" data-calendar-program="${row?.kind==='PROGRAM'?esc(row.id):''}" data-calendar-view="${esc(mode)}"><summary><span>Academy calendar</span><small>This month</small></summary><div class="academy-inline-calendar" aria-label="Academic Calendar"></div></details>
      ${staff ? tracker : ''}`;
  }
  function syncWorkspace(row) {
    const context = workspaceContext(row), permitted = Boolean(state.home?.signedIn && row.roles?.length && !row.unavailable);
    const library = $('activity-library'), planning = $('activity-planning'), support = $('activity-support');
    library.hidden = !permitted || context.tool !== 'library';
    library.innerHTML = library.hidden ? '' : '<h2>Library</h2><p class="muted">Open your Academy resources or browse the public collection.</p><div class="workspace-actions"><a class="button" href="/academy/library/">For me</a><a class="button secondary" href="/academy/open-library/">Browse</a></div>';
    planning.hidden = !permitted || context.mode !== 'teach' || context.tool !== 'planning';
    planning.setAttribute('aria-labelledby',context.tool === 'attendance' ? 'activity-tab-attendance' : 'activity-tab-planning');
    support.hidden = !permitted;
    const oldTracker = support.querySelector?.('.academy-progress-section'), trackerOpen = oldTracker?.open && oldTracker.dataset.progressActivity === `${row.kind}:${row.id}`;
    if (permitted) support.innerHTML = supportSections(row,context.mode); else support.replaceChildren();
    if (trackerOpen && context.mode === 'teach') support.querySelector('.academy-progress-section').open = true;
    if (context.tool === 'attendance' && row.kind === 'COURSE' && permitted && context.mode === 'teach') {
      planning.hidden = false;planning.innerHTML = '<h2>Attendance</h2><p class="muted">Course attendance tools are coming soon.</p>';
    } else if(permitted && context.mode==='teach' && context.tool==='planning') window.M4L_PLANNING?.open({hostId:'activity-planning',view:'teacher',activityKey:`${row.kind}:${row.id}`,...(planningSelection?.id===row.id?planningSelection:{})});
    else if(context.tool!=='planning')planning.replaceChildren();
    renderAcademyMenu();
  }

  function syncMemorisation(row){
    const teaching=location.hash.startsWith('#activity/')&&workspaceContext(row).tool === 'surahs-duas'&&state.home?.signedIn&&!row.unavailable&&(state.home.globalAdmin||staffRoles(row.roles||[]));
    $('mp-teach-panel').hidden=!teaching;
    if(teaching){$('mp-teach-close').href=workspaceHref(row);window.M4L_ACADEMY_PROGRESS?.open({view:'teach',hostId:'mp-teach-host',activityKey:`${row.kind}:${row.id}`,kind:row.kind});}
    if(location.hash.startsWith('#progress-admin')){
      $('mp-admin-context').textContent=row.name;
      $('mp-admin-close').href='#administration';
      window.M4L_MEMORISATION_ADMIN?.open({activityKey:row.id?`${row.kind}:${row.id}`:'',kind:row.kind||''});
      $('current-view').textContent=`${row.name} · Manage Surahs and Duas`;
    }
  }

  function syncAssessment(row){
    const embedded=location.hash.startsWith('#activity/') && workspaceContext(row).tool === 'assessment';
    $('as-panel').hidden=!embedded;
    if(!embedded&&!location.hash.startsWith('#assessment-admin'))return;
    const admin=location.hash.startsWith('#assessment-admin');
    const close=admin?$('as-admin-close'):$('as-close');
    close.href=admin?'#administration':workspaceHref(row);
    window.M4L_ACADEMY_ASSESSMENTS?.open({hostId:admin?'as-admin-host':'as-host',view:admin?'admin':workspaceContext(row).mode==='learn'&&(state.home?.globalAdmin||adminRoles(row.roles||[]))?'learner':'activity',activityKey:row.id?`${row.kind}:${row.id}`:'',kind:row.id?'':row.kind});
  }

  function syncAttendance(row) {
    const open = location.hash.startsWith('#activity/') && workspaceContext(row).tool === 'attendance' && row.kind === 'PROGRAM' && !row.unavailable && state.home?.signedIn && (state.home.globalAdmin || staffRoles(row.roles || []));
    $('pa-main').hidden = !open;
    if (!open) { window.M4L_PROGRAM_ATTENDANCE?.reset(); return; }
    $('pa-close').href = workspaceHref(row);
    window.M4L_PROGRAM_ATTENDANCE?.open({id:row.id,programs:state.home.personalActivities.filter(item=>menuActivity(item)&&item.kind==='PROGRAM' && (state.home.globalAdmin || staffRoles(item.roles || []))).map(item=>({id:item.id,name:item.name,role:state.home.globalAdmin?'GLOBAL_ADMIN':item.roles.find(role=>['PROGRAM_ADMIN','ADMIN','TEACHER','SENIOR'].includes(role))}))});
  }

  function openWorkspaceTool(key) {
    const row = location.hash.startsWith('#activity/') ? state.activity : {name:'Courses',roles:state.home?.personalActivities.filter(a=>a.kind==='COURSE').flatMap(a=>a.roles)||[]};
    if (!state.home?.signedIn || !row || !(row.roles?.length || state.home.globalAdmin)) return;
    const names = {academy:'Academy',attendance:'Attendance',progress:'Progress',assessment:'Assessment',plan:'Planning',announcements:'Announcements',calendar:'Calendar'};
    if (!names[key] || key === 'academy' && !(state.home.globalAdmin || adminRoles(row.roles))) return;
    if (['attendance','plan'].includes(key) && !staffRoles(row.roles) && !state.home.globalAdmin) return;
    if (key === 'calendar') { $('workspace-tool').close(); location.href='/academy/calendar/'+(row.kind==='PROGRAM'?'?program='+encodeURIComponent(row.id)+'&view='+workspaceContext(row).mode:'?view='+workspaceContext(row).mode); return; }
    if (key === 'progress') { $('workspace-tool').close(); location.hash = row.id?`${activityHref(row)}/surahs-duas`:'#workshops/surahs-duas'; return; }
    $('workspace-tool-title').textContent = names[key];
    if (key === 'academy') {
      $('workspace-tool-body').innerHTML = (state.home.globalAdmin ? '<div class="academy-tool-pills"><a href="/academy/subjects/">Subjects &amp; Modules</a></div>' : '') +
        `<div class="academy-tool-pills"><button type="button" data-workspace-tool="calendar">Calendar</button><button type="button" data-workspace-tool="announcements">Announcements</button><a href="${row.id?'#progress-admin/'+row.kind+'/'+encodeURIComponent(row.id):'#progress-admin/COURSE'}">Surahs and Duas</a>`+ (state.home.globalAdmin?'<button id="public-timetable-refresh" type="button">Update public timetable</button>':'')+'</div><p id="public-timetable-refresh-message" role="status" aria-live="polite"></p>';
      bindPublicTimetableRefresh();
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
    const rows = data.courses.filter(row => menuActivity(row) && (all || row.personal) && (stage === 'ALL' || row.stage === stage) && (!query || row.name.toLocaleLowerCase().includes(query)));
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
    if (row.kind === 'PROGRAM' && state.home?.signedIn) return true;
    if (typeof row.summarize === 'boolean') return row.summarize;
    // Retain the same presentation during a staggered frontend/backend release.
    return Boolean(state.home?.globalAdmin || state.home?.personalActivities.some(activity =>
      row.kind === activity.kind && activity.id === row.activityId &&
      activity.roles.some(role => ['PROGRAM_ADMIN', 'ADMIN'].includes(role))));
  }

  function renderSchedule(id, rows, detailed = false, compact = false, options = {}) {
    const start=options.startDate||state.startDate||state.home?.startDate,dayCount=options.days||7,end=addWeekDays(start,dayCount-1);
    rows=rows.filter(row=>row.date>=start&&row.date<=end);
    const personal = !options.public&&(detailed || state.home?.signedIn);
    const now = new Date().getTime();
    if(!personal){
      const programs=new Map(),publicRows=[];
      const joiningPriority=row=>row.publicJoin&&row.endsAt>now?(row.joinAvailableAt<=now?2:1):0;
      for(const row of rows){
        if(row.status&&row.status!=='SCHEDULED')continue;
        if(row.kind!=='PROGRAM'&&!(row.kind==='COURSE'&&row.publicCard)){publicRows.push(row);continue;}
        if(!row.publicCard?.time||!row.publicCard.title||!row.publicCard.description)continue;
        // The public description represents a Program or Course's whole day. Prefer its
        // currently joinable lesson, then its next free lesson, for Join checks.
        const key=JSON.stringify([row.date,row.kind,row.activityId]),index=programs.get(key);
        if(index===undefined){programs.set(key,publicRows.length);publicRows.push(row);continue;}
        const previous=publicRows[index],priority=joiningPriority(row),before=joiningPriority(previous);
        if(priority>before||priority===1&&before===1&&row.startsAt<previous.startsAt)publicRows[index]=row;
      }
      rows=publicRows;
    }
    state.information[id] = rows.slice();
    const next = personal ? rows.findIndex(row => row.status === 'SCHEDULED' && row.endsAt > now) : -1;
    if (personal) { renderPersonalWeek(id, rows, detailed, next, now); return; }
    if (compact || !personal) {
      const days = new Map(Array.from({length:dayCount},(_,i)=>[addWeekDays(start,i),[]]));
      rows.forEach(row => {
        if (!days.has(row.date)) days.set(row.date, []);
        days.get(row.date).push({...row,publicIndex:rows.indexOf(row)});
      });
      $(id).innerHTML = `<ol class="upcoming-days preview-days">${[...days].map(([date, lessons]) => `<li class="upcoming-day"><time datetime="${esc(date)}">${esc(formatDate(date))}</time><ul class="upcoming-items"${id==='academy-public-sessions'?` tabindex="0" aria-label="${esc(formatDate(date))} schedule"`:''}>${lessons.length?lessons.map(row => {
        const card=row.publicCard;
        if((row.kind==='PROGRAM'||card)&&(!card?.time||!card.title||!card.description))return '';
        const label = esc(card?.title || row.activityName || row.title);
        const open=row.publicJoin&&row.joinKey&&now>=row.joinAvailableAt&&now<row.endsAt;
        return `<li class="preview-pill${open?' is-open':''}"><span class="preview-copy"><span class="preview-name" title="${label}">${label}</span>${card?`<span class="preview-description">${esc(card.description).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')}</span>`:''}</span><span class="preview-controls">${card?`<span class="preview-clock"><span>${esc(card.time)}</span></span>`:previewTime(row.startTime)}${row.publicJoin&&now<row.endsAt?`<button type="button" data-public-join="${id}:${row.publicIndex}" ${open?'':'disabled'} aria-label="Join ${label}">${open?'Join':'Opens 5 min before'}</button>`:''}</span></li>`;
      }).join(''):'<li class="timetable-empty">No lessons</li>'}</ul></li>`).join('')}</ol>`;
      return;
    }
    $(id).innerHTML = `<ol class="schedule-list">${rows.map(row => `<li><time datetime="${esc(row.date)}">${esc(formatDate(row.date))}</time><div>${esc(row.startTime)}–${esc(row.endTime)}</div><div class="lesson-name">${esc(row.title)}</div></li>`).join('')}</ol>`;
  }

  function renderPersonalWeek(id, rows, detailed, next, now) {
    const scrollLeft = $(id).scrollLeft || 0;
    const timezone = state.home?.timezone || rows[0]?.timezone || 'Africa/Johannesburg';
    const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const clock = instant => {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
      return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
    };
    const days = new Map(), roomGroups = new Map();
    const start = state.startDate || state.home?.startDate || rows[0].date;
    for (let offset = 0; offset < 7; offset++)
      days.set(new Date(Date.parse(`${start}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10), new Map());
    rows.map((original, index) => ({ original, index })).sort((a, b) => a.original.startsAt - b.original.startsAt).forEach(({ original, index }) => {
      const begins = clock(original.startsAt), ends = clock(original.endsAt);
      const row = { ...original, sourceDate: original.date, date: begins.date, startTime: begins.time, endTime: ends.time, endDate: ends.date };
      if (!days.has(row.date)) return;
      const groups = days.get(row.date);
      // Combine overlapping/contiguous Program lessons only within one Program,
      // day and room. A gap, different Program or missing link starts a new card.
      let key = `lesson:${index}`;
      if (summarizeLesson(row) && row.meetingGroup) {
        const roomKey = JSON.stringify([row.date,row.kind,row.activityId,row.meetingGroup]);
        const previous = roomGroups.get(roomKey);
        if (previous && (row.kind !== 'PROGRAM' || row.startsAt <= previous.endsAt)) {
          key = previous.key;
          previous.endsAt = Math.max(previous.endsAt,row.endsAt);
        } else {
          key = `room:${index}`;
          roomGroups.set(roomKey,{key,endsAt:row.endsAt});
        }
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ row, index });
    });
    const participation = entries => {
      const roles = [...new Set(entries.map(entry => entry.row.involvement).filter(Boolean))];
      return roles.length > 1 ? 'mixed' : roles[0] || '';
    };
    const renderGroup = entries => {
      const first = entries[0].row;
      const last = entries.reduce((latest,entry) => entry.row.endsAt > latest.endsAt ? entry.row : latest,first);
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
      return `<li class="preview-pill timetable-pill ${nextEntry ? 'next-lesson ' : ''}${participation(entries)}${joinable ? ' join-open' : ''}"><button type="button" class="timetable-pill-details" data-information="${id}:${infoIndex}" aria-label="${esc(label)}${subtitle ? ' · ' + esc(subtitle) : ''}, ${esc(first.startTime)}–${esc(last.endTime)}${status ? ', ' + status : ''}. View lesson details">${previewTime(first.startTime)}<span class="timetable-pill-copy"><strong class="preview-name">${esc(label)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}${status ? `<small class="timetable-pill-status">${status}</small>` : ''}</span></button>${join}</li>`;
    };
    $(id).innerHTML = `<ol class="upcoming-days preview-days timetable-days">${[...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, groups]) => `<li class="upcoming-day"><time datetime="${esc(date)}">${esc(formatDate(date))}</time><ul class="upcoming-items">${groups.size ? [...groups.values()].map(renderGroup).join('') : '<li class="timetable-empty">No lessons</li>'}</ul></li>`).join('')}</ol>`;
    $(id).scrollLeft = scrollLeft;
  }

  function activityRows() {
    return state.activity && state.home?.signedIn ? state.scheduleTimetable.filter(lesson=>lesson.kind===state.activity.kind && lesson.activityId===state.activity.id) : [];
  }

  function renderActivityTimetable() {
    $('activity-schedule').hidden = workspaceContext(state.activity || {roles:[]}).tool !== 'timetable' || !state.home?.signedIn || !state.activity?.roles.length || state.activity?.unavailable;
    $('activity-schedule-title').textContent = `${state.activity?.name || ''} timetable`;
    renderSchedule('activity-sessions', activityRows());
    $('activity-week-range').textContent=formatDate(state.startDate)+' – '+formatDate(addWeekDays(state.startDate,6));
    weekButtons();
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
      if (!cached) state.home = result;
      state.startDate=result.startDate;state.scheduleTimetable=scheduleRows(result);
      $('activity-back-link').href = '#timetable/'+workspaceContext(row).mode;
      $('activity-back-link').innerHTML = homeIcon;
      $('activity-back-link').classList.toggle('academy-home-icon',true);
      $('activity-back-link').classList.toggle('text-link',false);
      $('activity-back-link').setAttribute('aria-label','Change Program or Course');
      $('activity-back-link').setAttribute('title','Change Program or Course');
      $('activity-title').textContent = row.name;
      $('activity-kind').textContent = row.kind === 'PROGRAM' ? 'Program' : 'Course';
      $('activity-role').textContent = '';
      $('activity-back-link').hidden=true;
      renderSubscriptions(result.signedIn ? result.personalActivities : [], row);
      $('activity-areas').innerHTML=result.signedIn&&row.roles.length?workspaceAreaLinks(workspaceContext(row).mode,row,result.personalActivities):'';
      $('current-view').textContent = row.name;
      const message = row.unavailable ? 'This activity is temporarily unavailable. Please try again.' : !row.roles.length ? 'Sign in with an authorised Academy account to open protected lessons and tools.' : '';
      $('activity-status').textContent = [message,...result.warnings.filter(warning => !$('entrance-message').textContent.includes(warning))].filter(Boolean).join(' ');
      $('activity-menu').innerHTML = row.roles.length ? roleTools(row) : '';
      syncAttendance(row);
      renderActivityTimetable();
      syncMemorisation(row);
      syncAssessment(row);
      syncWorkspace(row);
      revealWorkspaceTab();
      const mediaContext=workspaceContext(row);
      if(mediaContext.tool === 'timetable'&&location.hash.startsWith('#activity/')&&row.kind==='PROGRAM'&&row.id===window.M4L_LESSON_MEDIA?.programId&&result.signedIn&&!row.unavailable&&row.roles.length)
        window.M4L_LESSON_MEDIA.open({hostId:'mou-lesson-media',programId:row.id,learnerView:mediaContext.mode==='learn'});
      else window.M4L_LESSON_MEDIA?.reset();
      if(restoreMemorisation){const saved=restoreMemorisation;restoreMemorisation=null;$('activity-sessions').scrollLeft=saved.left;window.requestAnimationFrame?.(()=>window.scrollTo?.(0,saved.top));}
    } catch (error) {
      if (generation !== state.activityGeneration) return;
      pageCache.snapshot = null;
      state.activity = null;
      $('activity-title').textContent = 'Activity unavailable';
      $('activity-status').textContent = error.message;
      $('activity-areas').replaceChildren();
      $('activity-menu').replaceChildren();
      $('activity-sessions').replaceChildren();
      $('activity-schedule').hidden = true;
      for (const id of ['activity-library','activity-planning','activity-support']) {$(id).hidden=true;$(id).replaceChildren();}
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
    if(location.hash.endsWith('/surahs-duas')||location.hash.endsWith('/assessment')||location.hash.startsWith('#assessment-admin')||location.hash.startsWith('#progress-admin')){clearTimeout(state.activityTimer);return;}
    const view = location.hash.slice(1).split('/')[0];
    if (view === 'activity' && state.activity) {
      const rows = activityRows();
      armTimetableClock(rows, () => renderSchedule('activity-sessions', rows));
    } else if (view === 'timetable'||location.hash==='#administration') {
      armTimetableClock(state.scheduleTimetable, () => {
        renderSchedule('academy-sessions',roleRows({...state.home,personalTimetable:state.scheduleTimetable,timetable:state.scheduleTimetable}));
      });

    } else if(!view||view==='overview'||view==='learning'){
      const rows=(state.publicData?.timetable||[]).filter(row=>row.publicJoin&&row.date>=state.publicStartDate&&row.date<=addWeekDays(state.publicStartDate,6));
      if(rows.length)armTimetableClock(rows,renderPublicHome);else clearTimeout(state.activityTimer);
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
      if (academyDay(state.home.timezone) !== day) { void loadHome(); return; }
      render();
      armTimetableClock(rows, render);
    }, delay);
  }

  function route() {
    let hash = location.hash || '#overview';
    if (hash === '#administration/assessments' && state.home?.signedIn) {
      const area = adminAreas()[0];
      if (state.home.globalAdmin || area) {
        hash = state.home.globalAdmin ? '#assessment-admin' : `#assessment-admin/${area.kind}/${encodeURIComponent(area.id)}`;
        history.replaceState(null,'',hash);
      }
    }
    if (lastRouteHash && hash !== lastRouteHash) {
      if (window.M4L_PROGRAM_ATTENDANCE?.canLeave() === false || window.M4L_ACADEMY_PROGRESS?.canLeave() === false || window.M4L_MEMORISATION_ADMIN?.canLeave() === false || window.M4L_ACADEMY_ASSESSMENTS?.canLeave() === false || window.M4L_LESSON_MEDIA?.canLeave() === false || window.M4L_PLANNING?.canLeave() === false || window.M4L_ANNOUNCEMENTS?.canLeave() === false) { history.replaceState(null,'',lastRouteHash); workspaceFocusId='';renderAcademyMenu();return; }
      if(!memorisationHash(lastRouteHash)&&memorisationHash(hash)){memorisationReturn={hash:lastRouteHash,top:window.scrollY||0,left:$('activity-sessions').scrollLeft||0};if(dailyCache.owner)try{sessionStorage.setItem(MEMORISATION_RETURN_KEY,JSON.stringify({...memorisationReturn,owner:dailyCache.owner}));}catch{}}
      if(memorisationHash(lastRouteHash)&&hash===memorisationReturn?.hash)restoreMemorisation=memorisationReturn;
      window.M4L_PROGRAM_ATTENDANCE?.reset();
      window.M4L_ACADEMY_PROGRESS?.reset();
      window.M4L_MEMORISATION_ADMIN?.reset();
      window.M4L_ACADEMY_ASSESSMENTS?.reset();
      window.M4L_LESSON_MEDIA?.reset();window.M4L_PLANNING?.reset();window.M4L_ANNOUNCEMENTS?.reset();
      $('as-panel').hidden=true;
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
    const name = ['hifz','hifdh','progress'].includes(requested) ? 'overview' : requested === 'learning' ? 'overview' : titles[requested] ? requested : 'overview';
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === name));
    document.querySelectorAll('[data-nav]').forEach(button => {
      const current = button.dataset.nav === requested || name === 'overview' && button.dataset.nav === 'overview';
      button.classList.toggle('active', current);
      if (current) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    $('current-view').textContent = titles[name];
    if (requested === 'learning' && !state.home?.signedIn) $('learning').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    if (name === 'overview') {
      const opening=window.M4L_ACADEMY_PROGRESS?.open();
      if (['hifz','hifdh','progress'].includes(requested)) void Promise.resolve(opening).then(()=>{if(location.hash===hash)$('progress').scrollIntoView({block:'start'});});
    }
    if (name === 'workshops') renderWorkshops();
    if (name === 'activity' && encodedId && state.home) { try { void loadActivity(decodeURIComponent(encodedId)); } catch { $('activity-status').textContent = 'This activity link is invalid.'; } }
    if(name==='progress-admin'&&state.home){if(encodedId){try{void loadActivity(decodeURIComponent(encodedId));}catch{$('mp-admin-context').textContent='Invalid learning area.';}}else syncMemorisation({kind:hash.includes('/COURSE')?'COURSE':'',name:hash.includes('/COURSE')?'Courses':'Academy',roles:[],tools:{}});}
    if(name==='assessments'&&state.home){$('as-general-close').href='#workshops';void window.M4L_ACADEMY_ASSESSMENTS?.open({hostId:'as-general-host',view:'activity',kind:hash.includes('/COURSE')?'COURSE':''});}
    if(name==='assessment-admin'&&state.home){if(encodedId){try{void loadActivity(decodeURIComponent(encodedId));}catch{$('as-admin-host').textContent='Invalid learning area.';}}else syncAssessment({kind:hash.includes('/COURSE')?'COURSE':'',name:'Academy',roles:[]});}
    if (name === 'recorder') $('recorder-card').innerHTML = state.home?.student ? '<p>Select an existing lesson image, record your voice, then preview and share your video.</p><a class="button" href="/recorder/?academy=1">Open Voice Recorder →</a>' : '<p>Voice Recorder is available to signed-in Academy students.</p>';
    if(name!=='administration')dockTimetable($('timetable-card-home'));
    if(name==='overview'&&state.home)void loadPublicHome();
    if(name==='timetable'){renderRoleLinks();if(state.home){renderSchedule('academy-sessions',roleRows({...state.home,personalTimetable:state.scheduleTimetable,timetable:state.scheduleTimetable}));$('schedule-range').textContent=formatDate(state.startDate)+' – '+formatDate(addWeekDays(state.startDate,6));weekButtons();}}
    if (name === 'administration') renderAdministration();
    renderAcademyMenu();
    if (requested !== 'activity') armScheduleClock();
  }

  function adminAreas() {
    return (state.home?.personalActivities || []).filter(row => state.home.globalAdmin || adminRoles(row.roles || []));
  }
  function renderAdministration() {
    dockTimetable($('timetable-card-home'));
    const view = $('administration'), global = Boolean(state.home?.signedIn && state.home.globalAdmin), areas = state.home?.signedIn ? adminAreas() : [];
    if (!global && !areas.length) {view.innerHTML='<div class="page-heading"><h1>Manage Academy</h1></div><p role="status">'+(!state.home&&token()?'Loading your Academy administration…':'Sign in with an authorised Academy admin account to open management tools.')+'</p>';return;}
    const tabs = [['users','Users'],['attendance','Attendance'],['planning','Planning'],...(global?[['announcements','Announcements']]:[]),['assessments','Assessments'],['library','Library'],['curriculum','Curriculum'],['programs','Programs'],['courses','Courses']];
    const requested = location.hash.split('/')[1], key = tabs.some(([id]) => id === requested) ? requested : 'users';
    const link = (href,label) => `<a class="button secondary" href="${esc(href)}">${esc(label)}</a>`;
    const scoped = (filter,href) => areas.filter(filter).map(row => link(href(row),row.name)).join('');
    const programs = row => row.kind === 'PROGRAM', courses = row => row.kind === 'COURSE';
    const manage = row => row.kind === 'PROGRAM' ? `/programs/manage.html?program=${encodeURIComponent(row.id)}` : `/academy/courses/manage/?course=${encodeURIComponent(row.id)}`;
    const panels = {
      users:global ? link('/users/','Manage user profiles') : scoped(()=>true,row=>manage(row)+(programs(row)?'&tab=profiles':'&tab=participants')),
      attendance:'<p class="muted">Admin Attendance is coming soon, in shaa Allah.</p>',
      planning:'<div id="admin-planning"></div>',
      announcements:'<div id="admin-announcements"></div>',
      assessments:global ? link('#assessment-admin','Manage assessments') : scoped(()=>true,row=>`#assessment-admin/${row.kind}/${encodeURIComponent(row.id)}`),
      library:global ? link('/academy/library/manage/','Manage Library')+link('/academy/pdf-tools/','PDF tool defaults') : link('/academy/library/','Open my Library'),
      curriculum:global ? link('/academy/subjects/','Manage Subjects and Modules') : scoped(programs,manage),
      programs:global ? link('/programs/','Manage Programs') : scoped(programs,manage),
      courses:global ? link('/academy/courses/manage/','Manage Courses')+link('/academy/courses/manage/?view=scheduling','Course scheduling') : scoped(courses,manage)
    };
    const firstProgram=areas.find(programs), firstArea=areas[0];
    const direct={users:global?'/users/':firstArea?manage(firstArea)+(programs(firstArea)?'&tab=profiles':'&tab=participants'):'#administration/users',attendance:'#administration/attendance',planning:'#administration/planning',announcements:'#administration/announcements',assessments:global?'#assessment-admin':firstArea?`#assessment-admin/${firstArea.kind}/${encodeURIComponent(firstArea.id)}`:'#assessment-admin',library:global?'/academy/library/manage/':'/academy/library/',curriculum:global?'/academy/subjects/':firstProgram?manage(firstProgram):'#administration/curriculum',programs:global?'/programs/':firstProgram?manage(firstProgram):'#administration/programs',courses:'/academy/courses/manage/'};
    view.innerHTML = `<div class="page-heading admin-heading"><h1>${requested?'Manage '+tabs.find(([id])=>id===key)[1]:'Manage Academy'}</h1></div>
      <nav class="workspace-tabs admin-management-menu" aria-label="Administration tools">${tabs.map(([id,label])=>`<a id="admin-tab-${id}" href="${esc(direct[id])}"${id===requested?' aria-current="page"':''}>${label}</a>`).join('')}${global?'<button id="public-timetable-refresh" type="button">Update timetable</button>':''}</nav>${global?'<p id="public-timetable-refresh-message" class="tiny muted" role="status" aria-live="polite"></p>':''}${!requested?'<div id="admin-timetable-home"></div>':''}
      ${requested?`<section class="card card-pad" id="admin-workspace"><div class="workspace-actions">${panels[key]||'<p class="muted">No assigned areas are available here.</p>'}</div></section>`:''}<div class="academy-support">${supportSections(null,'admin')}</div>`;
    if(requested==='planning')window.M4L_PLANNING?.open({hostId:'admin-planning',view:'admin'});
    if(requested==='announcements'&&global)window.M4L_ANNOUNCEMENTS?.open({hostId:'admin-announcements'});
    if(!requested){dockTimetable($('admin-timetable-home'));renderSchedule('academy-sessions',state.scheduleTimetable);weekButtons();}
    bindPublicTimetableRefresh();
    revealWorkspaceTab();
  }
  function revealWorkspaceTab() {
    const selected = document.querySelector('.view.active .workspace-tabs [aria-selected="true"]');
    if (selected) {const strip=selected.parentElement;if(selected.offsetLeft < strip.scrollLeft)strip.scrollLeft=selected.offsetLeft;else if(selected.offsetLeft+selected.offsetWidth>strip.scrollLeft+strip.clientWidth)strip.scrollLeft=selected.offsetLeft+selected.offsetWidth-strip.clientWidth;}
    if (workspaceFocusId) {$(workspaceFocusId)?.focus();workspaceFocusId='';}
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
        state.publicData=null;state.publicDay='';
        status.textContent='Public timetable refreshed. Visitors will see the update within one minute.';
      }catch(error){if(session===token()&&epoch===pageCache.epoch)status.textContent=error.message;}
      finally{button.disabled=false;}
    };
  }

  function clearPersonal() {
    // Keep shared timetable elements attached before clearing their Admin host.
    dockTimetable($('timetable-card-home'));
    window.M4L_LESSON_MEDIA?.reset();window.M4L_PLANNING?.reset();window.M4L_ANNOUNCEMENTS?.reset();
    window.M4L_ACADEMY_ASSESSMENTS?.reset();$('as-panel').hidden=true;
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
    $('learn-enrolment-entry').hidden=true;
    planningSelection=null;
    $('upcoming-courses').hidden=true;$('upcoming-course-list').replaceChildren();
    $('timetable-areas').replaceChildren();$('activity-areas').replaceChildren();
    state.activity = null;
    state.courseCatalogue = null;
    state.courseCatalogueAt = 0;
    state.courseGeneration++;
    state.coursePending = null;
    state.scheduleTimetable = [];
    clearTimeout(state.activityTimer);
    const publicRows=state.information['academy-public-sessions'];state.information = {'academy-public-sessions':publicRows||[]};
    state.academyTab = '';
    workspaceFocusId = '';
    $('administration').replaceChildren();
    renderAcademyMenu();
    $('academy-recorder-nav').hidden = true;
    for (const id of ['workshop-pills', 'academy-preview-sessions', 'academy-sessions', 'activity-switcher', 'activity-menu', 'activity-sessions', 'workshop-tools', 'recorder-card']) $(id).replaceChildren();
    $('activity-switcher').hidden = true;
    for (const id of ['activity-library','activity-planning','activity-support']) {$(id).hidden = true;$(id).replaceChildren();}
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
    if(location.hash.startsWith('#administration'))renderAdministration();
  }

  window.addEventListener('m4l-memorisation-card-updated',event=>{
    if(!event.detail?.own||!state.home)return;
    state.home.memorisationActive=event.detail.active;
    if(pageCache.snapshot)pageCache.snapshot.result.memorisationActive=event.detail.active;
    dailyCache.entries={};try{sessionStorage.removeItem(DAILY_CACHE_KEY);}catch{}
    renderHome();if(state.activity){$('activity-menu').innerHTML=roleTools(state.activity);renderSubscriptions(state.home.personalActivities,state.activity);}
  });

  document.addEventListener('toggle', event => {
    const section = event.target;
    if (!section.matches?.('.academy-progress-section') || !section.open || !section.isConnected) return;
    const row = state.activity;
    if (!location.hash.startsWith('#activity/') || !row || workspaceContext(row).mode !== 'teach' || !state.home?.signedIn || row.unavailable || !(state.home.globalAdmin || staffRoles(row.roles || [])) || section.dataset.progressActivity !== `${row.kind}:${row.id}`) return;
    void window.M4L_ACADEMY_PROGRESS?.open({view:'teach',hostId:'activity-progress-host',activityKey:`${row.kind}:${row.id}`,kind:row.kind});
  }, true);

  document.addEventListener('visibilitychange', () => {
    clearTimeout(state.activityTimer);
    if(document.visibilityState==='visible'&&state.home)void loadPublicHome();
    if(document.visibilityState==='visible'&&!token()&&state.home){renderHome();armScheduleClock();return;}
    if (document.visibilityState === 'visible' && token()) {
      checkReturnedPage();
      if(location.hash.startsWith('#timetable')){if(state.homeDay!==academyDay(state.home.timezone))void loadHome();else{renderSchedule('academy-sessions',roleRows({...state.home,personalTimetable:state.scheduleTimetable,timetable:state.scheduleTimetable}));armScheduleClock();}}
      else if (location.hash.startsWith('#activity/') && state.activity && state.homeDay === academyDay(state.home.timezone)) renderActivityTimetable();
      else if (['#overview', ''].includes(location.hash) || location.hash.startsWith('#activity/')) void loadHome();
    }
  });

  document.addEventListener('click', event => {
    const upcomingWeek=event.target.closest('[data-upcoming-week]');
    if(upcomingWeek){state.startDate=sunday(upcomingWeek.dataset.upcomingWeek);void loadSchedule();$('academy-schedule').scrollIntoView({block:'start'});}
    const upcomingPlan=event.target.closest('[data-upcoming-plan]');
    if(upcomingPlan)planningSelection={id:upcomingPlan.dataset.upcomingPlan,weekStart:upcomingPlan.dataset.planStart,runId:upcomingPlan.dataset.planRun};
    const workspaceTab=event.target.closest('.workspace-tabs [role=tab]');
    if(workspaceTab) {workspaceFocusId=workspaceTab.id;if(workspaceTab.getAttribute('href')===location.hash)revealWorkspaceTab();}
    const nav = event.target.closest('[data-nav]');
    if (nav) { event.preventDefault();const next='#'+nav.dataset.nav;if(location.hash===next)route();else location.hash=next; }
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
  document.addEventListener('keydown', event => {
    const tab = event.target.closest?.('.workspace-tabs [role=tab]');
    if (!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const tabs = [...tab.parentElement.querySelectorAll('[role=tab]')], current=tabs.indexOf(tab);
    const next = event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    event.preventDefault();workspaceFocusId=tabs[next].id;const hash=tabs[next].getAttribute('href');if(hash===location.hash)revealWorkspaceTab();else location.hash=hash;
  });
  $('academy-role-tabs')?.addEventListener('click', event => {
    const tab = event.target.closest('[data-academy-tab]');
    if (!tab || tab.hidden || !state.home?.signedIn) return;
    if(tab.dataset.academyTab !== 'admin' && window.M4L_ACADEMY_SHELL){window.M4L_ACADEMY_SHELL.openRole(tab.dataset.academyTab);return;}
    state.academyTab = tab.dataset.academyTab;
    const next=state.academyTab === 'admin' ? '#administration' : '#timetable/'+state.academyTab;
    if(location.hash===next)route();else location.hash=next;
  });
  $('academy-role-tabs')?.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const tabs = ['learn','teach','admin'].map(key => $('academy-tab-'+key)).filter(tab => !tab.hidden);
    const current = tabs.indexOf(event.target);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
  });
  $('workspace-tool-close').addEventListener('click', () => $('workspace-tool').close());
  $('activity-refresh').addEventListener('click', () => void loadHome(true));
  $('lesson-information-close').addEventListener('click', () => $('lesson-information').close());
  for (const [id, direction, target] of [['upcoming-previous', -1, 'academy-preview-sessions'], ['upcoming-next', 1, 'academy-preview-sessions'], ['learning-previous', -1, 'learning-catalogue'], ['learning-next', 1, 'learning-catalogue']]) $(id).addEventListener('click', () => {
    const strip = $(target);
    strip.scrollBy({ left: direction * strip.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  for (const id of ['course-list-search', 'course-list-stage', 'course-list-scope']) $(id).addEventListener('input', renderCourseList);
  $('course-list-retry').addEventListener('click', () => void loadCourses());
  $('entrance-retry').addEventListener('click', () => void loadHome(true));
  $('timetable-refresh').addEventListener('click', () => void loadHome(true));
  $('schedule-refresh').addEventListener('click', () => void loadSchedule(true));
  $('schedule-date').addEventListener('change', () => { state.startDate = $('schedule-date').value; void loadSchedule(); });
  for (const [id, days] of [['schedule-previous', -7], ['schedule-next', 7], ['activity-previous',-7], ['activity-next',7]]) $(id).addEventListener('click', () => {
    if (!state.startDate||days<0&&state.startDate<=currentWeek()) return;
    state.startDate = new Date(Date.parse(`${state.startDate}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    void loadSchedule();
  });
  for(const [id,days] of [['public-home-previous',-7],['public-home-next',7]])$(id).addEventListener('click',()=>{
    if(!state.publicData||$(id).disabled)return;
    const first=sunday(academyDay(state.publicData.timezone));
    state.publicStartDate=days>0?addWeekDays(first,7):first;renderPublicHome();if(publicMobileView.matches){const columns=$('academy-public-sessions').querySelectorAll('.upcoming-day');$('academy-public-sessions').scrollTo({left:days>0?columns[7].offsetLeft-columns[0].offsetLeft:0,behavior:'auto'});}armScheduleClock();
  });
  $('academy-public-sessions').addEventListener('scroll',()=>{if(!publicMobileView.matches||!state.publicData)return;const columns=$('academy-public-sessions').querySelectorAll('.upcoming-day');if(columns.length!==14)return;const first=sunday(academyDay(state.publicData.timezone));state.publicStartDate=$('academy-public-sessions').scrollLeft>=columns[7].offsetLeft-columns[0].offsetLeft-1?addWeekDays(first,7):first;publicWeekHeading();},{passive:true});
  window.addEventListener('hashchange', route);
  window.addEventListener('m4l-academy-session', () => { if (!token()) { dailyCache.session='';dailyCache.entries={};try { sessionStorage.removeItem(DAILY_CACHE_KEY); } catch {} } clearPersonal(); void loadHome(); });
  const checkReturnedPage=()=>{if(document.visibilityState!=='hidden'&&token())void checkRemoteProfileLabels().then(async changed=>{
    if(!changed)return;
    if(location.hash.startsWith('#timetable')){void loadSchedule(true);return;}
    if(location.hash.startsWith('#activity/')){
      // Update lesson labels without reopening tools or replacing a plan draft.
      try{const result=await dailyTimetable({startDate:state.startDate},true);rememberPages(result);state.home=result;state.scheduleTimetable=scheduleRows(result);renderActivityTimetable();}catch{/* Existing controls remain; joining rechecks current access. */}
    }else if(['#overview',''].includes(location.hash))void loadHome(true);
  });};
  window.addEventListener('focus',checkReturnedPage);
  window.addEventListener('storage', event => { if (event.key === 'm4l_account_token') { clearPersonal(); void loadHome(); } });
  window.addEventListener('pageshow', event => { if (event.persisted) { clearPersonal(); void loadHome(); } });

  route();
  renderCatalogue();
  if(token())void loadPublicHome();
  void loadHome();
})();
