/* Standalone design prototype. All content and mutations are in-memory fixtures.
 * This page deliberately makes no requests to Academy APIs and reads no account tokens.
 * Workspace filtering demonstrates the intended UI; it is not an authorization boundary.
 */
(() => {
  'use strict';
  const root = document.getElementById('academy-design');
  const main = document.getElementById('dashboard-main');
  const dialog = document.getElementById('detail-dialog');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const paths = {
    home:'<path d="m3 10 9-7 9 7v10H6V10M9 20v-7h6v7"/>',
    book:'<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h2m4 0h2"/>',
    mail:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="m3 7 9 6 9-6"/>',
    arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    clipboard:'<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6m-6 4h6"/>',
    pen:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z"/>',
    mic:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11v1a7 7 0 0 0 14 0v-1m-7 8v3m-4 0h8"/>',
    chart:'<path d="M4 3v17h17M8 15v-3m5 3V8m5 7V5"/>',
    users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m3 9v-2a6 6 0 0 0-3-5"/>',
    teacher:'<rect x="4" y="3" width="17" height="12" rx="1"/><path d="M11 7h6m-2 8 3 6M3 11v10m-2-4h7"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    play:'<path d="m8 4 12 8-12 8V4Z"/>',
    bell:'<path d="M4 17h16l-2-4V9a6 6 0 0 0-12 0v4l-2 4Zm5 3h6"/>',
    wifi:'<path d="m3 3 18 18M2 8a17 17 0 0 1 3-2m4-2a17 17 0 0 1 13 4M5 12a11 11 0 0 1 4-2m5 0a11 11 0 0 1 5 2m-11 4a6 6 0 0 1 8 0m-4 4h.01"/>',
    folder:'<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3V6Z"/>',
    file:'<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h6"/>'
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.book}</svg>`;
  const actionButton = (label, action, id = '', primary = false) => `<button type="button" class="${primary ? 'primary-button' : 'secondary-button'}" data-action="${action}"${id ? ` data-id="${esc(id)}"` : ''}>${label}</button>`;
  const linkButton = (label, action, id = '') => `<button type="button" class="section-link" data-action="${action}"${id ? ` data-id="${esc(id)}"` : ''}>${label}${icon('arrow')}</button>`;
  const profiles = {
    all: {spaces:['learn','teach','admin'], learning:true, teaching:true, admin:true, global:true, role:'Learner · Teacher · Global Admin'},
    learner: {spaces:['learn'], learning:true, role:'Learner'},
    teacher: {spaces:['learn','teach'], teaching:true, role:'Teacher'},
    scoped: {spaces:['learn','admin'], admin:true, scope:'arabic', role:'Course Admin'},
    global: {spaces:['learn','admin'], admin:true, global:true, role:'Global Admin'},
    none: {spaces:['learn'], role:'None'}
  };
  const labels = {learn:'Learn', teach:'Teach', admin:'Admin'};
  const store = {account:'all', workspace:'learn', page:'home', view:'normal', done:new Set(), read:new Set(), reviewed:0, enrolments:new Set(), toastTimer:0, homework:'', plan:'', device:'responsive'};
  const records = [
    {id:'prep',space:'learn',scope:'arabic',kind:'preparation',icon:'book',title:'Mutha’ala for tonight’s lesson',context:'Arabic foundations · Lesson 6',due:'Before 18:30 today',cta:'Open preparation',summary:'Read pages 12–14 and note two examples of a nominal sentence.',time:'09:15'},
    {id:'homework',space:'learn',scope:'arabic',kind:'homework',icon:'pen',tone:'amber',title:'Your sentence practice is due',context:'Arabic foundations · Homework',due:'Due tomorrow',cta:'Continue homework',summary:'Write three nominal sentences using vocabulary from Lesson 5.',time:'Yesterday'},
    {id:'ack',space:'learn',scope:'arabic',kind:'acknowledgement',icon:'bell',title:'Please acknowledge the class guidance',context:'Arabic foundations · Course notice',due:'Acknowledgement needed',cta:'Read & acknowledge',summary:'Please arrive five minutes before the lesson, have your workbook ready, and keep your microphone muted until invited to speak.',time:'Yesterday'},
    {id:'feedback',space:'learn',scope:'quran',kind:'feedback',icon:'check',tone:'green',title:'Your recitation feedback is ready',context:'Qur’an & tajwīd · Surah Al-Mulk',due:'New feedback',cta:'Read feedback',summary:'Your pacing is improving. Practise the stopping points marked in your lesson notes before your next recitation.',time:'Saturday'},
    {id:'register',space:'teach',scope:'arabic',kind:'register',icon:'users',tone:'amber',title:'Complete yesterday’s register',context:'Arabic foundations · Saturday’s lesson',due:'Overdue',cta:'Open register',summary:'Attendance still needs to be recorded for your Saturday class.',time:'09:00'},
    {id:'submissions',space:'teach',scope:'arabic',kind:'review',icon:'clipboard',title:'Sentence practice awaits your review',context:'Arabic foundations · Homework',due:'3 submissions',cta:'Review work',summary:'Three learners have submitted their sentence practice for feedback.',time:'08:40'},
    {id:'confirm',space:'teach',scope:'quran',kind:'memorisation',icon:'mic',title:'Confirm a memorisation entry',context:'Qur’an & tajwīd · Maryam Yusuf',due:'1 confirmation',cta:'View entry',summary:'Maryam’s Surah Al-Mulk revision entry is ready for your confirmation.',time:'Yesterday'},
    {id:'plan',space:'teach',scope:'arabic',kind:'plan',icon:'file',tone:'amber',title:'Finish the next lesson plan',context:'Arabic foundations · Lesson 7',due:'Overdue',cta:'Continue plan',summary:'Add the learning aim and preparation for Tuesday’s lesson.',time:'Yesterday'},
    {id:'enrolment',space:'admin',scope:'arabic',kind:'enrolment',icon:'users',title:'Enrolment requests need a decision',context:'Arabic foundations · Course enrolments',due:'3 requests',cta:'Review requests',summary:'Three prospective learners are waiting for a decision on their enrolment requests.',time:'09:10'},
    {id:'overdue-plan',space:'admin',scope:'arabic',kind:'overdue',icon:'file',tone:'amber',title:'A lesson plan needs follow-up',context:'Arabic foundations · Lesson 7',due:'Planning overdue',cta:'View planning',summary:'The learning aim and preparation have not yet been added to Lesson 7.',time:'08:30'},
    {id:'release',space:'admin',scope:'quran',kind:'release',icon:'shield',title:'Assessment reports are ready to release',context:'Qur’an & tajwīd · Autumn assessment',due:'2 reports',cta:'Review reports',summary:'Two checked assessment reports are awaiting release to their learners.',time:'Yesterday'},
    {id:'followup',space:'admin',scope:'arabic',kind:'followup',icon:'bell',title:'Class guidance needs follow-up',context:'Arabic foundations · Acknowledgements',due:'2 outstanding',cta:'View responses',summary:'Two learners have not yet acknowledged the updated class guidance.',time:'Yesterday'}
  ];
  const notices = [
    {id:'prep',space:'learn',scope:'arabic',title:'Mutha’ala for tonight’s lesson',sender:'Ustadha Amina · Arabic foundations',time:'09:15',action:true},
    {id:'time-change',space:'learn',scope:'arabic',title:'Tuesday’s lesson will begin at 18:45',sender:'Arabic foundations · Timetable update',time:'08:30',text:'Tuesday’s Arabic foundations lesson will start at 18:45 Riyadh time, fifteen minutes later than usual. Your timetable has been updated.'},
    {id:'ack',space:'learn',scope:'arabic',title:'Updated class guidance',sender:'Course team · Arabic foundations',time:'Yesterday',action:true},
    {id:'teach-update',space:'teach',scope:'arabic',title:'Tuesday’s room and time have changed',sender:'Course team · Arabic foundations',time:'09:20',text:'Tuesday’s lesson will use Room 2 and begin at 18:45 Riyadh time. Please check the lesson details before class.'},
    {id:'submissions',space:'teach',scope:'arabic',title:'New sentence practice submissions',sender:'Arabic foundations · Learner work',time:'08:40',action:true},
    {id:'plan',space:'teach',scope:'arabic',title:'Preparation for Lesson 7 is still needed',sender:'Course team · Lesson planning',time:'Yesterday',action:true},
    {id:'enrolment',space:'admin',scope:'arabic',title:'New enrolment requests received',sender:'Arabic foundations · Enrolments',time:'09:10',action:true},
    {id:'release',space:'admin',scope:'quran',title:'Autumn assessment checks are complete',sender:'Qur’an & tajwīd · Assessment team',time:'08:45',action:true},
    {id:'admin-calendar',space:'admin',scope:'arabic',title:'The teaching review is on Thursday',sender:'Academy office · Academic calendar',time:'Yesterday',text:'The teaching review is scheduled for Thursday, 29 October, at 17:00 Riyadh time. Bring the planning and attendance summaries for the Courses within your remit.'}
  ];
  const courses = [
    {id:'arabic',name:'Arabic foundations',kind:'Course',program:'Foundations of learning',teacher:'Ustadha Amina',lesson:'Lesson 6 · The nominal sentence',next:'Today · 18:30',day:'Sun',date:'25',time:'18:30',scope:'arabic'},
    {id:'quran',name:'Qur’an & tajwīd',kind:'Program',program:'Qur’an & tajwīd',teacher:'Ustadha Maryam',lesson:'Surah Al-Mulk · Revision',next:'Monday · 17:00',day:'Mon',date:'26',time:'17:00',scope:'quran'}
  ];
  const names = ['Maryam Yusuf','Hafsa Ali','Zaynab Hassan'];
  const profile = () => profiles[store.account];
  const hasContent = () => store.view !== 'empty' && (store.workspace === 'learn' ? profile().learning : store.workspace === 'teach' ? profile().teaching : profile().admin);
  const inScope = row => row.space === store.workspace && (!profile().scope || row.scope === profile().scope);
  const done = id => store.view === 'clear' || store.done.has(id);
  const activeRecords = () => hasContent() ? records.filter(row => inScope(row) && !done(row.id)) : [];
  const visibleNotices = () => hasContent() ? notices.filter(inScope) : [];
  const unread = () => visibleNotices().filter(row => !store.read.has(row.id)).length;
  const visibleCourses = () => hasContent() ? courses.filter(row => !profile().scope || row.scope === profile().scope) : [];
  const allowedRecord = id => hasContent() && records.find(row => row.id === id && inScope(row));
  const allowedNotice = id => hasContent() && notices.find(row => row.id === id && inScope(row));

  function announce(message) { document.getElementById('live-announcement').textContent = message; }
  function toast(message) {
    const node = document.getElementById('preview-toast');
    clearTimeout(store.toastTimer); node.textContent = message; node.classList.add('visible');
    store.toastTimer = setTimeout(() => node.classList.remove('visible'), 4000);
  }
  function closeDialog() { if (dialog.open) dialog.close(); }
  function go(page = 'home', workspace = store.workspace) {
    closeDialog();
    const safeWorkspace = profile().spaces.includes(workspace) ? workspace : profile().spaces[0];
    const hash = `#${safeWorkspace}/${page}`;
    if (location.hash === hash) render(); else location.hash = hash;
  }
  function parseRoute() {
    const [workspace, page, id] = location.hash.slice(1).split('/');
    store.workspace = profile().spaces.includes(workspace) ? workspace : profile().spaces[0];
    store.page = ['home','messages','courses','timetable','library','public','notice'].includes(page) ? page : 'home';
    return {workspace, page, id};
  }
  function renderNavigation() {
    document.getElementById('workspace-picker').innerHTML = profile().spaces.map(space => `<button type="button" data-workspace="${space}" aria-pressed="${space === store.workspace}">${icon(space === 'learn' ? 'book' : space === 'teach' ? 'teacher' : 'shield')}${labels[space]}</button>`).join('');
    const authority = store.workspace === 'admin' ? profile().global ? 'Global Admin · inherited Program Admin' : 'Course Admin · Arabic foundations' : store.workspace === 'teach' ? 'Your assigned teaching' : profile().learning ? 'Your personal learning' : 'Personal learning · role: None';
    document.getElementById('workspace-authority').innerHTML = `${icon(store.workspace === 'admin' ? 'shield' : 'users')}${authority}`;
    const nav = [
      ['home','home','Home'],
      ['courses','book',store.workspace === 'learn' ? 'My learning' : store.workspace === 'teach' ? 'My teaching' : 'Courses & Programs'],
      ['timetable','calendar',store.workspace === 'admin' ? 'Timetable' : 'My timetable'],
      ['messages','mail','Messages'],
      ['library','folder','Library']
    ];
    document.getElementById('side-nav').innerHTML = nav.map(([page, glyph, label]) => `<button type="button" class="nav-item" data-page="${page}"${store.page === page ? ' aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span>${page === 'messages' && unread() ? `<span class="nav-count" aria-label="${unread()} unread">${unread()}</span>` : ''}</button>`).join('');
    document.getElementById('mobile-nav').innerHTML = [['home','home','Home'],['timetable','calendar','Timetable'],['messages','mail','Messages'],['more','more','More']].map(([page,glyph,label]) => `<button type="button" ${page === 'more' ? 'data-action="more"' : `data-page="${page}"`}${store.page === page ? ' aria-current="page"' : ''}><span class="mobile-icon">${icon(glyph)}${page === 'messages' && unread() ? `<span class="nav-count" aria-label="${unread()} unread">${unread()}</span>` : ''}</span><span>${label}</span></button>`).join('');
    document.querySelector('.profile-name small').textContent = profile().role;
  }
  function intro(title, subtitle, eyebrow = `${labels[store.workspace]} WORKSPACE`) {
    return `<div class="page-intro"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="intro-copy">${subtitle}</p></div><span class="date-chip">${icon('calendar')}Sunday, 25 October</span></div>`;
  }
  function scopeBanner() {
    return store.workspace === 'admin' ? `<div class="admin-context">${icon('shield')}<span><strong>Administration</strong> · ${profile().global ? 'Academy-wide authority. Program Admin access is inherited in every Course and Program.' : 'Arabic foundations only. Your decisions apply to this Course.'}</span></div>` : '';
  }
  function panelHead(title, count = '', action = '', subtitle = '') {
    return `<div class="panel-head"><div class="panel-title"><h2>${title}</h2>${count !== '' ? `<span class="count-badge">${count}</span>` : ''}</div>${action}</div>${subtitle ? `<p class="panel-subtitle">${subtitle}</p>` : ''}`;
  }
  function taskDue(row) {
    if (row.id === 'submissions') return `${3 - store.reviewed} submission${3 - store.reviewed === 1 ? '' : 's'}`;
    if (row.id === 'enrolment') return `${3 - store.enrolments.size} request${3 - store.enrolments.size === 1 ? '' : 's'}`;
    return row.due;
  }
  function taskRow(row) {
    return `<li class="attention-row"><span class="item-icon ${row.tone || ''}">${icon(row.icon)}</span><div><div class="item-heading"><h3 class="item-title">${row.title}</h3></div><p class="item-context">${row.context}</p><div class="item-footer"><span class="due-label ${row.tone === 'amber' ? '' : 'neutral'}">${esc(taskDue(row))}</span>${linkButton(row.cta, 'task', row.id)}</div></div></li>`;
  }
  function emptyBlock(title, description, glyph = 'check', button = '') {
    return `<div class="empty-block"><span class="empty-icon">${icon(glyph)}</span><h3>${title}</h3><p>${description}</p>${button}</div>`;
  }
  function attentionPanel() {
    const tasks = activeRecords();
    return `<section class="panel attention-panel" aria-label="For your attention">${panelHead('For your attention',tasks.length,'','FYA · Actions that still need you')}${tasks.length ? `<ul class="attention-list">${tasks.map(taskRow).join('')}</ul>${tasks.length > 2 ? `<div class="mobile-attention-more">${linkButton(`View all ${tasks.length} actions`,'all-actions')}</div>` : ''}` : emptyBlock(hasContent() ? 'You’re up to date' : 'Nothing needs your attention', hasContent() ? 'No outstanding actions. Your next lesson and messages are still here.' : 'Assigned work and preparation will appear here when available.')}</section>`;
  }
  function nextPanel() {
    const course = visibleCourses()[0];
    const title = store.workspace === 'admin' ? 'Next scheduled lesson' : store.workspace === 'teach' ? 'Your next class' : 'Coming up next';
    if (!course) return `<section class="panel next-panel">${panelHead(title)}${emptyBlock('No lesson scheduled','Your next scheduled lesson will appear here.','calendar')}</section>`;
    const meta = store.workspace === 'learn' ? `With ${course.teacher}` : store.workspace === 'teach' ? '18 learners · Online classroom' : `${course.teacher} · 18 learners`;
    const actions = store.workspace === 'learn' ? `${actionButton(`${icon('play')}Join lesson`,'join',course.id,true)}${actionButton('Preparation','task','prep')}${actionButton('Resources','resources',course.id)}` : store.workspace === 'teach' ? `${actionButton(`${icon('play')}Open classroom`,'join',course.id,true)}${actionButton('Lesson plan','lesson-plan',course.id)}${actionButton('Resources','resources',course.id)}` : `${actionButton('View lesson','lesson',course.id,true)}${actionButton('Planning','task','overdue-plan')}${actionButton('Attendance','attendance',course.id)}`;
    return `<section class="panel next-panel" aria-label="${title}">${panelHead(title)}<div class="next-content"><div class="next-time">${icon('clock')}Today · 18:30–19:15 <span class="small-note">Riyadh</span></div><h3>${course.name}</h3><p class="next-topic">The nominal sentence · Lesson 6</p><div class="lesson-meta">${icon(store.workspace === 'learn' ? 'users' : 'teacher')}${meta}</div><div class="lesson-actions">${actions}</div><p class="next-note">${store.workspace === 'learn' ? 'Have your workbook and preparation notes ready.' : store.workspace === 'teach' ? 'Lesson 6 is planned. Your class resources are ready.' : 'Visible within your administrative scope.'}</p></div></section>`;
  }
  function messageRow(row) {
    const isUnread = !store.read.has(row.id);
    return `<li><button type="button" class="message-button ${isUnread ? 'unread' : ''}" data-action="notice" data-id="${row.id}"><span class="message-dot ${isUnread ? '' : 'read'}" aria-label="${isUnread ? 'Unread' : 'Read'}"></span><span class="message-content"><span class="message-title">${row.title}${row.action && !done(row.id) ? '<span class="has-action">Action</span>' : ''}</span><span class="message-context">${row.sender}</span></span><time class="message-time">${row.time}</time></button></li>`;
  }
  function messagesPanel() {
    const messages = visibleNotices();
    return `<section class="panel messages-panel" aria-label="Messages">${panelHead('Messages',unread() || '',linkButton('View inbox','inbox'))}${messages.length ? `<ul class="message-list">${messages.slice(0,3).map(messageRow).join('')}</ul>` : emptyBlock('No messages yet','Course notices and updates will appear here.','mail')}</section>`;
  }
  function courseTiles() {
    const list = visibleCourses();
    if (!list.length) return `<div class="panel">${emptyBlock(store.workspace === 'learn' ? 'Your learning starts here' : store.workspace === 'teach' ? 'No teaching assigned yet' : 'No learning areas to manage',store.workspace === 'learn' ? 'Explore the Academy’s Courses and Programs. Your enrolments will appear here.' : store.workspace === 'teach' ? 'Assigned Courses and Programs will appear here once you are added as a teacher.' : 'Courses and Programs within your administrative scope will appear here.','book',store.workspace === 'learn' ? actionButton('Explore the Academy','public-home','',true) : '')}</div>`;
    return `<div class="course-grid">${list.map((course,index) => `<article class="course-tile"><span class="course-kind">${course.kind}${store.workspace === 'admin' ? ' · Administration' : ''}</span><h3>${course.name}</h3><p>${store.workspace === 'learn' ? course.lesson : store.workspace === 'teach' ? `${index ? '12' : '18'} learners · ${index ? 'Revision notes ready' : 'Lesson 6 planned'}` : `${index ? `12 learners · ${done('release') ? 'Reports released' : '2 reports to release'}` : `18 learners · ${done('enrolment') ? 'Enrolments up to date' : `${3 - store.enrolments.size} enrolment requests`}`}`}</p><div class="course-bottom"><span class="course-mark">${store.workspace === 'learn' ? index ? 'Next: Monday, 17:00' : 'Continue from Lesson 5' : store.workspace === 'teach' ? course.next : profile().global ? 'Inherited Program Admin' : 'Assigned Course Admin'}</span>${linkButton(store.workspace === 'learn' ? 'Continue' : store.workspace === 'teach' ? 'Open teaching' : 'Manage','course',course.id)}</div></article>`).join('')}</div>`;
  }
  function weekEvents() {
    if (!hasContent()) return [];
    const events = [
      {day:'Sun',date:'25',title:'Arabic foundations',description:store.workspace === 'teach' ? 'Teach · Lesson 6' : store.workspace === 'admin' ? 'Lesson 6 · Ustadha Amina' : 'Lesson 6 · With Ustadha Amina',time:'18:30',scope:'arabic',action:'lesson',id:'arabic'},
      {day:'Mon',date:'26',title:store.workspace === 'teach' ? 'Lesson 7 plan due' : store.workspace === 'admin' ? 'Planning follow-up' : 'Sentence practice due',description:'Arabic foundations',time:'20:00',scope:'arabic',action:'task',id:store.workspace === 'teach' ? 'plan' : store.workspace === 'admin' ? 'overdue-plan' : 'homework'},
      {day:'Tue',date:'27',title:'Arabic foundations',description:'Updated lesson time · Room 2',time:'18:45',scope:'arabic',action:'lesson',id:'arabic'},
      {day:'Wed',date:'28',title:'Qur’an & tajwīd',description:'Surah Al-Mulk · Revision',time:'17:00',scope:'quran',action:'lesson',id:'quran'}
    ];
    return events.filter(row => !profile().scope || row.scope === profile().scope);
  }
  function weekRows(full = false) {
    return weekEvents().slice(0,full ? 7 : 3).map(row => `<li><button type="button" class="week-row" data-action="${row.action}" data-id="${row.id}" style="width:100%;text-align:left"><span class="week-day">${row.day}<strong>${row.date}</strong></span><span><span class="week-title">${row.title}</span><span class="week-description" style="display:block">${row.description}</span></span><span class="week-time">${row.time}</span></button></li>`).join('');
  }
  function weekPanel() {
    return `<section class="panel">${panelHead('This week','',linkButton('Timetable','timetable'))}<p class="panel-subtitle">25–31 October · Riyadh time</p>${hasContent() ? `<ul class="week-list">${weekRows()}</ul>` : emptyBlock('A clear week','Lessons and deadlines will appear here.','calendar')}</section>`;
  }
  function tools() {
    return store.workspace === 'learn' ? [['folder','Library','library'],['mic','Recorder','recorder'],['chart','My progress','progress'],['calendar','Attendance','attendance']] : store.workspace === 'teach' ? [['users','Attendance','attendance'],['file','Lesson planner','planner'],['folder','Library','library'],['mic','Recorder','recorder']] : [['users','Enrolments','enrolments'],['shield','Assessments','assessments'],['calendar','Academic calendar','calendar'],['chart','Reports','reports']];
  }
  function toolsPanel() { return `<section class="panel">${panelHead('Quick tools')}<div class="tools-grid">${tools().map(([glyph,label,action]) => `<button type="button" class="tool-button" data-action="${action}">${icon(glyph)}${label}</button>`).join('')}</div></section>`; }
  function home() {
    const titles = {learn:'Ahlan wa sahlan, Fatimah',teach:'Ready for your next class?',admin:'Your administration dashboard'};
    const descriptions = {learn:'Your learning, one next step at a time.',teach:'Your lessons, learner work and preparation in one place.',admin:profile().scope ? 'Decisions and follow-up for Arabic foundations.' : 'Decisions and follow-up across the Academy.'};
    const prefix = intro(titles[store.workspace],descriptions[store.workspace]) + scopeBanner();
    if (store.view === 'loading') return `${prefix}<div class="skeleton-layout" aria-hidden="true"><div class="skeleton"><span></span><span></span><span></span><span></span></div><div class="skeleton"><span></span><span></span><span></span></div></div><p class="skeleton-status" role="status">Loading your ${labels[store.workspace].toLowerCase()} workspace…</p>`;
    if (store.view === 'error') return `${prefix}<div class="connection-panel">${icon('wifi')}<h2>Your dashboard couldn’t load</h2><p>We couldn’t check your latest lessons, actions or messages. Try again when your connection is available.</p>${actionButton('Try again','retry','',true)}</div>`;
    const sectionTitle = store.workspace === 'learn' ? 'Continue learning' : store.workspace === 'teach' ? 'Continue teaching' : 'Manage Courses & Programs';
    return `${prefix}<div class="dashboard-grid">${attentionPanel()}${nextPanel()}${messagesPanel()}</div><section class="continue-section"><div class="section-heading"><h2>${sectionTitle}</h2>${linkButton('View all','courses')}</div>${courseTiles()}</section><div class="bottom-grid">${weekPanel()}${toolsPanel()}</div>`;
  }
  function pageContent() {
    if (store.page === 'messages') return `${intro('Messages',`${unread()} unread · ${store.workspace === 'admin' ? 'Notices within your administrative scope.' : 'Updates for your selected workspace.'}`)}${scopeBanner()}<section class="panel list-panel"><ul class="message-list">${visibleNotices().map(messageRow).join('')}</ul>${visibleNotices().length ? '' : emptyBlock('No messages yet','Notices for this workspace will appear here.','mail')}</section>`;
    if (store.page === 'courses') return `${intro(store.workspace === 'learn' ? 'My learning' : store.workspace === 'teach' ? 'My teaching' : 'Courses & Programs',store.workspace === 'admin' ? 'Manage only the learning areas within your authority.' : 'Your current Courses and Programs.')}${scopeBanner()}${courseTiles()}`;
    if (store.page === 'timetable') return `${intro(store.workspace === 'admin' ? 'Timetable' : 'My timetable','25–31 October 2026 · All times shown for Riyadh.')}${scopeBanner()}<section class="panel full-week">${panelHead('Lessons & deadlines')}<ul class="week-list">${weekRows(true)}</ul>${hasContent() ? '' : emptyBlock('No lessons scheduled','Your lessons and deadlines will appear here.','calendar')}</section>`;
    if (store.page === 'library') return `${intro('Library','Resources for your selected workspace.')}${scopeBanner()}<section class="panel list-panel"><ul class="simple-list">${hasContent() ? `<li><button type="button" data-action="resources" data-id="arabic">Arabic foundations · Workbook and lesson resources</button></li>${profile().scope ? '' : '<li><button type="button" data-action="resources" data-id="quran">Qur’an & tajwīd · Revision notes</button></li>'}` : '<li><button type="button" data-action="public-home">Explore the public Academy catalogue</button></li>'}</ul></section>`;
    if (store.page === 'public') return `<div class="public-intro"><div class="eyebrow">ACADEMY HOMEPAGE · DESIGN PREVIEW</div><h1>A place to learn and grow</h1><p>Explore the Academy’s Courses and Programs.</p>${actionButton('Return to your dashboard','home','',true)}</div><div class="course-grid">${courses.map(course => `<article class="course-tile"><span class="course-kind">${course.kind}</span><h3>${course.name}</h3><p>${course.teacher} · Live lessons and guided study</p>${linkButton('Explore','public-course',course.id)}</article>`).join('')}</div>`;
    return home();
  }
  function render() {
    const route = parseRoute(); renderNavigation(); main.innerHTML = pageContent();
    document.title = `${labels[store.workspace]} · ${store.page === 'home' || store.page === 'notice' ? 'Dashboard' : store.page[0].toUpperCase() + store.page.slice(1)} · Academy design`;
    if (store.page === 'notice') openNotice(route.id);
  }
  function openDialog(context, title, content, actions = '') {
    document.getElementById('dialog-context').textContent = context;
    document.getElementById('dialog-content').innerHTML = `<h2 id="dialog-heading">${title}</h2>${content}${actions ? `<div class="dialog-actions">${actions}</div>` : ''}`;
    if (!dialog.open) dialog.showModal();
  }
  function unavailable() { openDialog('Access','This item isn’t available', '<p>This account does not have access to that item in the selected workspace.</p>',actionButton('Back to dashboard','home','',true)); }
  function complete(id, message) {
    const row = allowedRecord(id); if (!row) return unavailable();
    store.done.add(id); closeDialog(); renderNavigation(); main.innerHTML = pageContent(); announce(message); toast(message);
  }
  function recordMeta(row) { return `<div class="detail-meta"><span>${esc(row.context)}</span><span>· ${esc(taskDue(row))}</span>${done(row.id) ? '<span class="count-badge">Completed</span>' : ''}</div>`; }
  function openNotice(id) {
    const notice = allowedNotice(id); if (!notice) return unavailable();
    store.read.add(id); renderNavigation(); main.innerHTML = pageContent();
    const record = allowedRecord(id);
    const body = `<p>${notice.sender} · ${notice.time}</p><div class="detail-body"><p>${esc(notice.text || record?.summary || '')}</p></div>${record ? `<p class="dialog-tip">${done(id) ? 'The action for this notice is complete.' : id === 'prep' ? 'Preparation remains in For your attention until the lesson starts, even after you read this notice.' : 'Reading this message clears its unread indicator. Its action stays in For your attention until completed.'}</p>` : ''}`;
    openDialog('Messages',notice.title,body,record && !done(id) ? actionButton(record.cta,'task',id,true) : actionButton('Close','close'));
    announce('Message marked as read.');
  }
  function openTask(id) {
    const row = allowedRecord(id); if (!row) return unavailable();
    let content = recordMeta(row), actions = '';
    if (done(id)) return openDialog('For your attention',row.title,content + '<p>This action is complete.</p>',actionButton('Close','close'));
    if (id === 'prep') {
      content += '<div class="detail-body"><h3>The nominal sentence · Mutha’ala</h3><ol><li>Read pages 12–14 of your workbook.</li><li>Underline the subject and predicate in two examples.</li><li>Bring one question to discuss in class.</li></ol></div><p class="dialog-tip">For today’s 18:30 lesson. This preparation remains in FYA until the lesson starts.</p>';
      actions = actionButton('Open workbook','workbook','arabic',true) + actionButton('View lesson','lesson','arabic');
    } else if (id === 'ack') {
      content += `<div class="detail-body"><p>${esc(row.summary)}</p></div><p class="dialog-tip">Acknowledge to confirm that you have read and understood this guidance.</p>`;
      actions = actionButton('I acknowledge','acknowledge',id,true);
    } else if (id === 'homework') {
      content += `<p>${row.summary}</p><label class="dialog-field">Your answer<textarea id="homework-answer" placeholder="Write your three sentences…">${esc(store.homework)}</textarea></label><p id="homework-error" class="error-message" role="alert" hidden>Write your answer before submitting.</p>`;
      actions = actionButton('Submit homework','submit-homework',id,true) + actionButton('Save draft','save-homework',id);
    } else if (id === 'feedback') {
      content += `<div class="detail-body"><h3>Feedback from Ustadha Maryam</h3><p>${row.summary}</p><p>Next step: revise the marked stopping points, then record another reading.</p></div>`;
      actions = actionButton('Mark as reviewed','review-feedback',id,true);
    } else if (id === 'register') {
      content += '<p>Saturday, 24 October · Lesson 5</p>' + names.map((name,index) => `<label class="detail-row"><span>${name}</span><select data-register="${index}" aria-label="Attendance for ${name}"><option value="">Not marked</option><option>Present</option><option>Absent</option><option>Late</option></select></label>`).join('') + '<p id="register-error" class="error-message" role="alert" hidden>Choose attendance for every learner before saving.</p><p class="dialog-tip">Three sample learners shown in this design preview.</p>';
      actions = actionButton('Save register','save-register',id,true);
    } else if (id === 'submissions') {
      const learner = names[Math.min(store.reviewed,2)];
      content += `<p>${learner} · Sentence practice</p><div class="detail-body"><p>Sample learner work: three nominal sentences identifying the subject and predicate.</p></div><label class="dialog-field">Your feedback<textarea id="review-feedback" placeholder="Add feedback for ${learner}…"></textarea></label><p id="review-error" class="error-message" role="alert" hidden>Add feedback before saving.</p>`;
      actions = actionButton('Save feedback','save-review',id,true);
    } else if (id === 'confirm') {
      content += '<div class="detail-body"><h3>Maryam Yusuf · Surah Al-Mulk</h3><p>Revision entry: verses 1–10, recited during Monday’s class.</p><p>Check the recorded lesson notes before confirming this entry.</p></div><label class="check-line"><input type="checkbox" id="confirm-entry"><span>I have checked this entry against the lesson notes.</span></label><p id="confirm-error" class="error-message" role="alert" hidden>Confirm that you checked the lesson notes.</p>';
      actions = actionButton('Confirm entry','confirm-entry',id,true);
    } else if (id === 'plan' || id === 'overdue-plan') {
      content += '<div class="detail-body"><h3>Lesson 7 · Questions and answers</h3><p>Tuesday, 27 October · 18:45–19:30</p><p>Still needed: the learning aim and preparation instructions.</p></div>';
      if (store.workspace === 'teach') {
        content += `<label class="dialog-field">Learning aim and preparation<textarea id="lesson-plan">${esc(store.plan)}</textarea></label><p id="plan-error" class="error-message" role="alert" hidden>Add the learning aim and preparation before saving.</p>`;
        actions = actionButton('Save lesson plan','save-plan',id,true);
      } else content += '<p class="dialog-tip">This stays in FYA until the missing planning is completed. Opening it does not resolve the follow-up.</p>';
    } else if (id === 'enrolment') {
      content += '<p>Review requests for Arabic foundations.</p>' + names.filter(name => !store.enrolments.has(name)).map(name => `<div class="detail-row"><div>${name}<small>Requested learner enrolment</small></div>${actionButton('Review','review-enrolment',name)}</div>`).join('');
    } else if (id === 'release') {
      content += '<div class="detail-body"><h3>Autumn assessment · Qur’an & tajwīd</h3><p>Maryam Yusuf · Checked by the assessment team</p><p>Hafsa Ali · Checked by the assessment team</p></div><label class="check-line"><input type="checkbox" id="release-confirm"><span>I have reviewed both reports and they are ready for their learners.</span></label><p id="release-error" class="error-message" role="alert" hidden>Review and confirm before releasing the reports.</p>';
      actions = actionButton('Release 2 reports','release-reports',id,true);
    } else if (id === 'followup') {
      content += '<p>Class guidance · Arabic foundations</p><div class="detail-row"><div>Maryam Yusuf<small>Acknowledgement outstanding</small></div><span class="due-label">Pending</span></div><div class="detail-row"><div>Hafsa Ali<small>Acknowledgement outstanding</small></div><span class="due-label">Pending</span></div><p class="dialog-tip">This stays in FYA while acknowledgements are outstanding.</p>';
    }
    openDialog('For your attention',row.title,content,actions || actionButton('Close','close'));
  }
  function scopedCourse(id) { return visibleCourses().find(course => course.id === id); }
  function openLesson(id) {
    const course = scopedCourse(id); if (!course) return unavailable();
    const isArabic = id === 'arabic';
    openDialog(store.workspace === 'admin' ? 'Administration · Scheduled lesson' : 'Lesson details',course.name,`<p>${isArabic ? 'The nominal sentence · Lesson 6' : course.lesson}</p><div class="detail-body"><p>${course.next}–${isArabic ? '19:15' : '17:45'} · Riyadh time</p><p>${course.teacher} · Online classroom</p></div>`,store.workspace === 'learn' ? actionButton('Preparation','task',isArabic ? 'prep' : 'feedback',true) + actionButton('Resources','resources',id) : store.workspace === 'teach' ? actionButton('Open classroom','join',id,true) + actionButton('Resources','resources',id) : actionButton('View planning','lesson-plan',id,true));
  }
  function openResources(id) {
    const course = scopedCourse(id); if (!course) return unavailable();
    openDialog(`${labels[store.workspace]} · Resources`,course.name,`<ul class="simple-list"><li><button type="button" data-action="workbook" data-id="${course.id}">${id === 'arabic' ? 'Arabic workbook · Pages 12–14' : 'Surah Al-Mulk · Revision notes'}</button></li><li><button type="button" data-action="resource-notes" data-id="${course.id}">Lesson notes</button></li></ul>`);
  }
  function setError(id) { const error = document.getElementById(id); if (error) error.hidden = false; }
  function handleAction(action, id = '') {
    if (['home','inbox','courses','timetable','library','public-home'].includes(action)) return go({inbox:'messages','public-home':'public'}[action] || action);
    if (action === 'close') return closeDialog();
    if (action === 'all-actions') return openDialog(`${labels[store.workspace]} · FYA`,'For your attention',`<ul class="attention-list">${activeRecords().map(taskRow).join('')}</ul>`);
    if (action === 'task') return openTask(id);
    if (action === 'notice') return openNotice(id);
    if (action === 'retry') { store.view = 'normal'; document.getElementById('state-preview').value = 'normal'; render(); return toast('Your dashboard is available again.'); }
    if (action === 'acknowledge') { store.read.add(id); return complete(id,'Guidance acknowledged. Removed from FYA.'); }
    if (action === 'review-feedback') return complete(id,'Feedback reviewed. Removed from FYA.');
    if (action === 'save-homework' || action === 'submit-homework') {
      if (!allowedRecord('homework') || !document.getElementById('homework-answer')) return unavailable();
      store.homework = document.getElementById('homework-answer').value.trim();
      if (action === 'submit-homework' && !store.homework) return setError('homework-error');
      if (action === 'submit-homework') return complete('homework','Homework submitted in this preview.');
      closeDialog(); return toast('Draft kept in this preview. Homework remains in FYA.');
    }
    if (action === 'save-register') {
      if (!allowedRecord('register')) return unavailable();
      if ([...dialog.querySelectorAll('[data-register]')].some(select => !select.value)) return setError('register-error');
      return complete('register','Register saved. Removed from FYA.');
    }
    if (action === 'save-review') {
      if (!allowedRecord('submissions')) return unavailable();
      if (!document.getElementById('review-feedback')?.value.trim()) return setError('review-error');
      store.reviewed += 1;
      if (store.reviewed >= 3) return complete('submissions','All three submissions reviewed.');
      renderNavigation(); main.innerHTML = pageContent(); openTask('submissions'); return toast(`Feedback saved. ${3 - store.reviewed} submissions remain.`);
    }
    if (action === 'confirm-entry') {
      if (!document.getElementById('confirm-entry')?.checked) return setError('confirm-error');
      return complete('confirm','Memorisation entry confirmed.');
    }
    if (action === 'save-plan') {
      if (!allowedRecord('plan')) return unavailable();
      store.plan = document.getElementById('lesson-plan')?.value.trim() || '';
      if (!store.plan) return setError('plan-error');
      store.done.add('overdue-plan');
      return complete('plan','Lesson plan saved. Removed from FYA.');
    }
    if (action === 'review-enrolment') {
      if (!allowedRecord('enrolment') || !names.includes(id) || store.enrolments.has(id)) return unavailable();
      return openDialog('Course Admin · Enrolment request',esc(id),'<p>Requested learner enrolment · Arabic foundations</p><div class="detail-body"><p>Application complete. Review the learner’s suitability and available class places before deciding.</p></div>',actionButton('Approve enrolment','approve-enrolment',id,true) + actionButton('Decline request','decline-enrolment',id));
    }
    if (action === 'approve-enrolment' || action === 'decline-enrolment') {
      if (!allowedRecord('enrolment') || !names.includes(id)) return unavailable();
      store.enrolments.add(id);
      if (store.enrolments.size >= 3) return complete('enrolment','All enrolment requests reviewed.');
      renderNavigation(); main.innerHTML = pageContent(); openTask('enrolment'); return toast(`${id}: ${action === 'approve-enrolment' ? 'approved' : 'declined'} in this preview.`);
    }
    if (action === 'release-reports') {
      if (!document.getElementById('release-confirm')?.checked) return setError('release-error');
      return complete('release','Two reports released in this preview.');
    }
    if (action === 'lesson') return openLesson(id);
    if (action === 'resources') return openResources(id || 'arabic');
    if (action === 'workbook' || action === 'resource-notes') {
      const course = scopedCourse(id); if (!course) return unavailable();
      return openDialog(course.name,action === 'workbook' ? 'Workbook · Lesson 6' : 'Lesson notes','<div class="detail-body"><h3>The nominal sentence</h3><p>A nominal sentence begins with a noun. Identify the subject and the information given about it.</p><p dir="rtl" lang="ar" style="font:24px/1.8 Georgia,serif">الْبَيْتُ كَبِيرٌ</p><p>The house is big. Identify the subject and predicate, then write an example of your own.</p></div><p class="dialog-tip">Sample resource content for this design preview.</p>');
    }
    if (action === 'join') {
      const course = scopedCourse(id); if (!course || store.workspace === 'admin') return unavailable();
      return openDialog(`${labels[store.workspace]} · Classroom`,course.name,'<p>Today · 18:30–19:15 · Riyadh time</p><div class="detail-body"><p>The Join action opens the lesson’s saved classroom link when available.</p></div><p class="dialog-tip">This is a local design preview; no meeting will be opened.</p>',actionButton('Back to dashboard','home','',true));
    }
    if (action === 'lesson-plan') {
      const course = scopedCourse(id); if (!course || store.workspace === 'learn') return unavailable();
      return openDialog(`${labels[store.workspace]} · Lesson plan`,'The nominal sentence · Lesson 6','<div class="detail-body"><h3>Learning aim</h3><p>Identify the subject and predicate in a simple nominal sentence.</p><h3 style="margin-top:16px">Preparation</h3><p>Mutha’ala: read pages 12–14 and prepare two examples.</p><h3 style="margin-top:16px">Class sequence</h3><p>Recap · Guided examples · Paired practice · Review</p></div>',actionButton('Resources','resources',id));
    }
    if (action === 'course') {
      const course = scopedCourse(id); if (!course) return unavailable();
      return openDialog(`${labels[store.workspace]} · ${course.kind}`,course.name,`<p>${course.program} · ${store.workspace === 'admin' ? 'Administrative view' : store.workspace === 'teach' ? 'Assigned Teacher' : 'Enrolled Learner'}</p><div class="detail-body"><h3>${store.workspace === 'learn' ? 'Continue from your last lesson' : store.workspace === 'teach' ? 'Teaching workspace' : 'Manage this learning area'}</h3><p>${store.workspace === 'admin' ? 'Enrolments, planning, attendance and assessment release.' : course.lesson}</p></div>`,store.workspace === 'admin' ? actionButton('Review enrolments','enrolments','',true) + actionButton('Attendance','attendance',id) : actionButton(store.workspace === 'learn' ? 'Open lesson' : 'Open class','lesson',id,true) + actionButton('Resources','resources',id));
    }
    if (action === 'public-course') return openDialog('Academy catalogue',esc(courses.find(course => course.id === id)?.name || 'Course'),'<p>Course overview, entry requirements and enrolment information appear on the public Academy homepage.</p>',actionButton('Return to dashboard','home','',true));
    if (action === 'enrolments') return store.workspace === 'admin' && allowedRecord('enrolment') ? openTask('enrolment') : unavailable();
    if (action === 'assessments') return store.workspace === 'admin' && allowedRecord('release') ? openTask('release') : openDialog('Administration','No assessment releases pending','<p>No assessment reports await release within your administrative scope.</p>');
    if (action === 'planner') return store.workspace === 'teach' && allowedRecord('plan') ? openTask('plan') : unavailable();
    if (action === 'attendance') {
      if (!hasContent()) return openDialog('Attendance','No attendance records yet','<p>Attendance appears here once lessons have been recorded.</p>');
      if (store.workspace === 'teach' && !done('register')) return openTask('register');
      return openDialog(`${labels[store.workspace]} · Attendance`,store.workspace === 'learn' ? 'My attendance' : 'Course attendance',`<p>${store.workspace === 'learn' ? 'Your own attendance records.' : 'Arabic foundations · Within your assigned scope.'}</p><div class="detail-row"><span>Saturday, 24 October</span><span>${store.workspace === 'learn' ? 'Present' : 'Register ' + (done('register') ? 'completed' : 'awaiting completion')}</span></div><div class="detail-row"><span>Tuesday, 20 October</span><span>${store.workspace === 'learn' ? 'Present' : 'Register completed'}</span></div>`);
    }
    if (action === 'progress') return store.workspace === 'learn' && profile().learning && hasContent() ? openDialog('Learn · Personal progress','My progress','<p>Your own learning record.</p><div class="detail-body"><h3>Arabic foundations</h3><p>Continue from Lesson 5. Your next step is the preparation for Lesson 6.</p></div>',actionButton('Open preparation','task','prep',true)) : openDialog('Learn · Personal progress','No learning record yet','<p>Your progress appears here after you enrol in a Course or Program.</p>');
    if (action === 'recorder') return openDialog(`${labels[store.workspace]} · Recorder`,'Voice recorder','<p>Record recitation or oral practice and attach it to the relevant lesson or submission.</p><p class="dialog-tip">The full Academy recorder opens from this shortcut in the connected product.</p>',actionButton('Back to dashboard','home','',true));
    if (action === 'reports' || action === 'calendar') return store.workspace === 'admin' ? action === 'calendar' ? go('timetable') : openDialog('Administration · Reports','Course summaries','<p>Reports cover only the Courses and Programs within your administrative authority.</p><div class="detail-row"><span>Arabic foundations</span><span>Attendance & planning</span></div>' + (profile().scope ? '' : '<div class="detail-row"><span>Qur’an & tajwīd</span><span>Assessment release</span></div>')) : unavailable();
    if (action === 'profile') return openDialog('Your account','Fatimah Ahmed',`<p>${profile().role}</p><div class="detail-body"><p>${profile().global ? 'Global Admin authority is inherited across the Academy. Personal learning and assigned teaching remain separate workspaces.' : profile().scope ? 'Course Admin authority is limited to Arabic foundations.' : 'Your workspace options reflect the roles assigned to this sample account.'}</p></div>`,actionButton('Sign out of preview','signout'));
    if (action === 'more') return openDialog(`${labels[store.workspace]} · Navigation`,'Your workspace',`<ul class="simple-list"><li><button type="button" data-action="courses">${store.workspace === 'admin' ? 'Manage Courses & Programs' : store.workspace === 'teach' ? 'My teaching' : 'My learning'}</button></li><li><button type="button" data-action="library">Library</button></li>${tools().map(([,label,toolAction]) => `<li><button type="button" data-action="${toolAction}">${label}</button></li>`).join('')}<li><button type="button" data-action="public-home">Academy homepage ↗</button></li></ul>`);
    if (action === 'signout') return showSignIn(false);
    if (action === 'preview-signin') { const destination = id === 'notice' ? 'notice/prep' : 'home'; go(destination,id === 'notice' ? 'learn' : store.workspace); return toast(id === 'notice' ? 'Returned to the notice after sign-in.' : 'Signed in to your dashboard.'); }
  }
  function showSignIn(deepLink) {
    closeDialog();
    openDialog('Sign-in flow · Design preview','Ahlan wa sahlan',`<p>${deepLink ? 'Sign in to view your preparation notice.' : 'Sign in to continue to your dashboard.'}</p><div class="detail-body"><p>Sample account: Fatimah Ahmed</p><p>${profile().role}</p></div>`,actionButton('Continue with sample account','preview-signin',deepLink ? 'notice' : 'home',true));
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-workspace')) { go('home',button.dataset.workspace); announce(`${labels[button.dataset.workspace]} workspace selected.`); }
    else if (button.hasAttribute('data-page')) go(button.dataset.page);
    else if (button.hasAttribute('data-home')) go('home');
    else if (button.dataset.action) handleAction(button.dataset.action,button.dataset.id);
  });
  document.getElementById('close-dialog').addEventListener('click',closeDialog);
  dialog.addEventListener('close',() => { if (store.page === 'notice') go('home'); });
  dialog.addEventListener('click',event => { if (event.target === dialog) { const rect=dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(); } });
  document.getElementById('options-button').addEventListener('click',event => { const options=document.getElementById('design-options'); options.hidden = !options.hidden; event.currentTarget.setAttribute('aria-expanded',String(!options.hidden)); });
  document.querySelectorAll('[data-device]').forEach(button => button.addEventListener('click',() => { store.device=button.dataset.device; root.classList.toggle('phone-preview',store.device === 'phone'); document.querySelectorAll('[data-device]').forEach(node => node.setAttribute('aria-pressed',String(node === button))); }));
  document.getElementById('account-preview').addEventListener('change',event => { closeDialog(); store.account=event.target.value; store.view='normal'; document.getElementById('state-preview').value='normal'; const preferred=store.account === 'teacher' ? 'teach' : ['global','scoped'].includes(store.account) ? 'admin' : 'learn'; go('home',preferred); announce('Preview account changed. Available workspaces updated.'); });
  document.getElementById('state-preview').addEventListener('change',event => { closeDialog(); store.view=event.target.value; go('home'); });
  document.getElementById('sign-in-preview').addEventListener('click',() => showSignIn(false));
  document.getElementById('deep-link-preview').addEventListener('click',() => showSignIn(true));
  document.getElementById('reset-preview').addEventListener('click',() => { closeDialog(); store.done.clear(); store.read.clear(); store.enrolments.clear(); store.reviewed=0; store.homework=''; store.plan=''; store.view='normal'; document.getElementById('state-preview').value='normal'; go('home'); toast('Sample actions reset.'); });
  window.addEventListener('hashchange',render);
  if (!location.hash) history.replaceState(null,'','#learn/home');
  render();
})();
