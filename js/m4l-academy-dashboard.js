/* Circles role homes, using the existing scoped Academy readers and tools.
 * Presentation follows AcademyStudio V108.7 shared/circles-dashboard-view.mjs. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token = () => localStorage.getItem('m4l_account_token') || '';
  const boundary = () => window.M4L_ACADEMY_WORKSPACE;
  const context = () => JSON.stringify([token(),boundary()?.current(),boundary()?.head(),boundary()?.classView()]);
  let owner = '', epoch = 0, options = null, home = null, mode = 'learn', assessments = [], enrolments = [], failures = new Map(), loading = new Set(), read = new Set(), readOwner = '', timer, fetched = 0;
  let dialog, contentsDrawer;
  const wideContents = matchMedia('(min-width:70rem)');
  const link = (href,label,classes='ad-link') => `<a class="${classes}" href="${esc(href)}">${esc(label)}</a>`;
  const key = row => row.kind + ':' + row.id;
  const activeArea = row => row.active!==false&&row.active!==0&&(!row.lifecycle||row.lifecycle==='ACTIVE')&&row.curriculumActive!==false&&row.menuAvailable!==false&&!['DRAFT','COMPLETE','CANCELLED','ARCHIVED'].includes(row.stage);
  const areas = () => (home?.personalActivities || []).filter(row => activeArea(row)&&(mode==='admin'?['PROGRAM','COURSE'].includes(row.kind):row.kind==='PROGRAM') && row.id && row.roles?.length && (mode!=='admin'||home.globalAdmin||row.roles.some(role=>['PROGRAM_ADMIN','ADMIN','GLOBAL_ADMIN'].includes(role))));
  const href = (row,tool='timetable') => options.activityHref(row,tool,mode === 'admin' ? 'teach' : mode);
  const date = value => value ? new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:home?.timezone||'Africa/Johannesburg'}).format(new Date(value)) : '';
  const announce = (text,retry=false) => { const node=$('ad-status');if(node){node.textContent=text;if(retry)node.insertAdjacentHTML('beforeend',' <button type="button" data-ad-retry>Try again</button>');} };
  const personalBase = () => boundary()?.adminRealm() ? '/academy/admin/' : '/academy/';
  function homeUrl() { return boundary()?.homeUrl?.() || personalBase()+'#dashboard'; }
  function landing(data) {
    return data.workspaceAccess?.admin||data.globalAdmin?'/academy/admin/#dashboard':'/academy/#dashboard';
  }
  const globalAdmin=()=>Boolean(home?.globalAdmin||home?.workspaceAccess?.globalAdmin&&boundary()?.adminAccess?.());
  // Use the existing account/session response for navigation metadata, not a
  // projected Learn/Teach role. Opening each destination still verifies its scope.
  function hubAreas() {
    const contexts=window.M4L_ACADEMY_LOGIN?.contexts?.(),verified=Array.isArray(contexts),rows=new Map(),blocked=new Set();
    for(const row of [...(home?.activities||[]),...(home?.personalActivities||[])]){
      if(row.kind!=='PROGRAM'||!row.id)continue;
      if(!activeArea(row)){blocked.add(row.id.toUpperCase());continue;}
      rows.set(row.id.toUpperCase(),{...row,roles:verified&&!globalAdmin()?[]:[...(row.roles||[])]});
    }
    if(verified&&!globalAdmin())for(const grant of contexts){
      const substitute=grant.scope==='SUBSTITUTE'&&grant.activityKey?.startsWith('PROGRAM:');
      if(grant.scope!=='COURSE'&&!substitute)continue;
      const id=substitute?grant.activityKey.slice(8):grant.courseId;
      if(!id||blocked.has(id.toUpperCase())||!['STUDENT','TEACHER','SENIOR','SUBSTITUTE','PROGRAM_ADMIN','ADMIN'].includes(grant.role))continue;
      const row=rows.get(id.toUpperCase())||{kind:'PROGRAM',id,name:grant.courseName,roles:[]};
      if(!row.roles.includes(grant.role))row.roles.push(grant.role);
      rows.set(id.toUpperCase(),row);
    }
    return [...rows.values()].filter(row=>globalAdmin()||row.roles.length);
  }
  function programmeHref(row,view) {
    if(view==='admin')return '/programs/manage.html?program='+encodeURIComponent(row.id);
    const admin=view.startsWith('admin-'),audience=view.replace('admin-','');
    return (admin?'/academy/admin/':'/academy/')+'#activity/PROGRAM/'+encodeURIComponent(row.id)+'/'+audience;
  }
  function chooseProgramme(view) {
    if(!['admin-learn','admin-teach'].includes(view)||!globalAdmin())return;
    const title=view==='admin-learn'?'Admin-Learn':'Admin-Teach',rows=hubAreas();
    showDialog(title,rows.length?'<p>Choose a programme.</p><ul class="ad-picker">'+rows.map(row=>'<li>'+link(programmeHref(row,view),row.name,'ad-tool-choice')+'</li>').join('')+'</ul>':'<p>No programmes are available.</p>');
  }
  function closeDialog() { if(dialog?.open)dialog.close(); window.M4L_TAFSEER_CARDS?.closeAccessPrompt?.(); }
  function closeContents(returnFocus=true) {
    const drawer=contentsDrawer;if(!drawer)return;
    const nav=drawer.querySelector('#ad-navigation');
    if(nav)document.querySelector('#dashboard .ad-sidebar')?.append(nav);
    contentsDrawer=null;
    if(drawer.open)drawer.close();
    drawer.remove();
    document.body.classList.remove('ad-contents-open');
    const toggle=document.querySelector('[data-ad-contents-toggle]');
    toggle?.setAttribute('aria-expanded','false');
    if(returnFocus&&toggle?.getClientRects().length)toggle.focus({preventScroll:true});
  }
  function openContents() {
    if(contentsDrawer)return;
    const nav=$('ad-navigation');if(!nav)return;
    const drawer=document.createElement('dialog');contentsDrawer=drawer;
    drawer.id='ad-contents-drawer';drawer.className='academy-drawer ad-contents-drawer';
    drawer.setAttribute('aria-labelledby','ad-contents-title');
    const caption='Menu';
    drawer.innerHTML='<header class="academy-drawer-heading academy-close-heading"><h2 id="ad-contents-title">'+caption+'</h2><button type="button" class="academy-close" data-ad-contents-close aria-label="Close '+caption+'" title="Close '+caption+'" autofocus>Close '+caption+'</button></header>';
    drawer.append(nav);document.body.append(drawer);
    drawer.addEventListener('cancel',event=>{event.preventDefault();closeContents();});
    drawer.addEventListener('close',()=>{if(contentsDrawer===drawer)closeContents();});
    drawer.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const choices=[...drawer.querySelectorAll('a[href],button:not(:disabled)')].filter(node=>node.getClientRects().length);
      const target=event.shiftKey?choices.at(-1):choices[0];
      if(document.activeElement===(event.shiftKey?choices[0]:choices.at(-1))){event.preventDefault();target?.focus();}
    });
    drawer.addEventListener('click',event=>{
      if(event.target.closest('[data-ad-contents-close]')){closeContents();return;}
      const bounds=drawer.getBoundingClientRect();
      if(event.target===drawer&&(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)){closeContents();return;}
      if(event.target.closest('#ad-navigation :is(a,button)')){
        closeContents();
        handleClick(event);
      }
    });
    document.querySelector('[data-ad-contents-toggle]')?.setAttribute('aria-expanded','true');
    document.body.classList.add('ad-contents-open');drawer.showModal();
  }
  wideContents.addEventListener('change',()=>{
    if(mode==='admin')return;
    const inside=contentsDrawer?.contains(document.activeElement),navFocused=$('ad-navigation')?.contains(document.activeElement);
    closeContents();
    if(wideContents.matches&&inside)$('ad-navigation')?.querySelector('a,button')?.focus({preventScroll:true});
    else if(!wideContents.matches&&(navFocused||document.activeElement===document.body)){
      const toggle=document.querySelector('[data-ad-contents-toggle]');
      if(toggle?.getClientRects().length)toggle.focus({preventScroll:true});
    }
  });
  function reset() {
    epoch++;owner='';home=null;options=null;assessments=[];enrolments=[];failures.clear();loading.clear();read.clear();readOwner='';fetched=0;clearTimeout(timer);closeContents(false);closeDialog();
    const host=$('dashboard');if(host)host.replaceChildren();
  }
  async function restoreRead() {
    const captured=owner,revision=epoch;
    const digest=await window.M4L_ACADEMY_READ_CACHE?.owner(token());
    if(captured!==owner||revision!==epoch)return;
    readOwner=digest?'m4l_dashboard_read:'+digest+':'+boundary().current():'';
    try { read=new Set(JSON.parse(localStorage.getItem(readOwner)||'[]').filter(value=>typeof value==='string').slice(-300)); } catch { read=new Set(); }
    renderMessages();
  }
  function markRead(id) { read.add(id);try{if(readOwner)localStorage.setItem(readOwner,JSON.stringify([...read].slice(-300)));}catch{}renderMessages(); }
  function revealProgramCard() {
    // WebKit can retain the previous horizontal position after a viewport resize.
    const card=document.activeElement?.closest('.ad-program-rail > .ad-tile');
    card?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  window.addEventListener('resize',()=>requestAnimationFrame(revealProgramCard));
  function mount() {
    const host=$('dashboard');if(!host)return;
    closeContents(false);
    host.classList.toggle('ad-admin-dashboard',mode==='admin');
    host.classList.add('circles-dashboard');
    host.innerHTML=`<div class="ad-layout"><aside class="ad-sidebar" aria-label="Menu"><h2>Menu</h2><nav id="ad-navigation"></nav></aside><div class="ad-main">
      <header class="ad-intro circles-dashboard-heading"><div class="ad-welcome-copy"><p class="eyebrow">YOUR ACADEMY</p><h1 id="ad-title"></h1><p id="ad-checked"></p></div><div class="ad-home-actions"><button type="button" data-ad-retry>Refresh dashboard</button><button type="button" class="ad-contents-toggle academy-menu-button" data-ad-contents-toggle aria-haspopup="dialog" aria-expanded="false" aria-controls="ad-navigation"><span>Menu</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button></div></header>
      <div id="ad-primary-actions" class="ad-actions" hidden></div><p id="ad-status" class="ad-status" role="status" aria-live="polite"></p>
      <section class="ad-hub-entry" aria-labelledby="ad-continue-title"><header><h2 id="ad-continue-title">Your programmes</h2></header><nav id="ad-hub-gateways" class="ad-hub-gateways" aria-label="Global Admin workspaces"></nav><div id="ad-areas"></div></section>
      <div class="circles-dashboard-grid">
        <section class="ad-panel circles-dashboard-panel circles-attention" aria-labelledby="ad-fya-title"><header><h2 id="ad-fya-title">For your attention</h2><span id="ad-fya-count" class="ad-count"></span></header><div id="ad-attention"></div><div class="ad-assessments"><header><h3 id="ad-assessment-title">Upcoming exams (Imtehaan)</h3><span id="ad-assessment-count" class="ad-count"></span></header><div id="ad-assessments" aria-live="polite"></div></div></section>
        <section class="ad-panel circles-dashboard-panel ad-next" aria-labelledby="ad-next-title"><header><h2 id="ad-next-title">Coming up next</h2></header><div id="ad-next"></div></section>
        <section class="ad-panel circles-dashboard-panel ad-messages" aria-labelledby="ad-messages-title"><header><h2 id="ad-messages-title">Messages <span id="ad-unread" class="ad-count"></span></h2></header><div id="ad-messages"></div><button type="button" data-ad-inbox>View inbox</button></section>
        <section class="ad-panel circles-dashboard-panel ad-week" aria-labelledby="ad-week-title"><header><h2 id="ad-week-title">This week</h2></header><div id="ad-timetable-host"></div></section>
        <section id="ad-calendar-row" class="ad-panel circles-dashboard-panel ad-calendar" aria-labelledby="ad-calendar-title"><header><h2 id="ad-calendar-title">Academy calendar</h2></header><div id="ad-calendar-host"></div></section>
        <section class="ad-panel circles-dashboard-panel ad-tools"><header><h2>Quick tools</h2></header><nav id="ad-tools" aria-label="Dashboard tools"></nav></section>
      </div>
    </div></div>`;
    host.onclick=handleClick;
    host.onfocusin=revealProgramCard;
  }
  const completionStorageKey=()=>{
    const id=window.M4L_ACADEMY_LOGIN?.currentId?.();
    return id?'m4l:note-completion:v1:'+encodeURIComponent(String(id).toUpperCase()):'';
  };
  const completionId=note=>JSON.stringify([note.activityKey,note.id,note.versionId||'original']);
  const canComplete=()=>mode==='learn'&&!boundary()?.adminRealm?.()&&Boolean(completionStorageKey());
  function completedNotes(){
    try{const data=JSON.parse(localStorage.getItem(completionStorageKey())||'[]');return new Set(Array.isArray(data)?data.filter(id=>typeof id==='string'):[]);}catch{return new Set();}
  }
  function completionButton(note,completed){return canComplete()?`<button type="button" data-ad-complete="${esc(completionId(note))}" aria-pressed="${completed}">${completed?'Mark incomplete':'Mark complete'}</button>`:'';}
  function handleClick(event) {
      if(event.target.closest('[data-ad-contents-toggle]')){openContents();return;}
      const programme=event.target.closest('[data-ad-programme-choice]');if(programme){chooseProgramme(programme.dataset.adProgrammeChoice);return;}
      const complete=event.target.closest('[data-ad-complete]');
      if(complete){
        if(!canComplete()||owner!==context()||!home)return;
        const id=complete.dataset.adComplete,allowed=notes().some(note=>completionId(note)===id);if(!allowed)return;
        const completed=completedNotes();if(completed.has(id))completed.delete(id);else completed.add(id);
        try{localStorage.setItem(completionStorageKey(),JSON.stringify([...completed]));renderAttention();}
        catch{announce('Your browser could not save completion. Allow local storage to keep this mark.');}return;
      }
      const note=event.target.closest('[data-ad-note]');
      if(note){markRead(note.dataset.adRead);void window.M4L_CLASS_NOTES?.open({activityKey:note.dataset.adArea,noteId:note.dataset.adNote});}
      const notice=event.target.closest('[data-ad-notice]');
      if(notice){markRead(notice.dataset.adRead);window.M4L_ANNOUNCEMENTS?.openNotice(notice.dataset.adNotice,notice);}
      if(event.target.closest('[data-ad-inbox]'))openInbox();
      if(event.target.closest('[data-ad-week]'))$('ad-week-title').scrollIntoView({block:'start'});
      const chooser=event.target.closest('[data-ad-choose]');if(chooser)chooseTool(chooser.dataset.adChoose);
      const command=event.target.closest('[data-ad-command]');if(command&&!command.disabled)document.getElementById(command.dataset.adCommand)?.click();
      if(event.target.closest('[data-ad-retry]')){fetched=0;void refresh(true);}
  }
  function tracker() {
    if(mode==='admin')return link('#progress-admin','Surahs and Duas Tracker');
    if(mode==='teach')return '<button type="button" data-ad-choose="surahs-duas">Surahs and Duas Tracker</button>';
    return link('/academy/#progress','Surahs and Duas Tracker');
  }
  function chooseTool(tool) {
    const rows=areas().filter(row=>tool!=='planning'||!row.substituteOnly&&row.plansRequired!==false);
    const title={'planning':'Submit plans','surahs-duas':'Surahs and Duas Tracker'}[tool]||'Open workspace';
    showDialog(title,rows.length?`<p>Choose a Program or Course.</p><ul class="ad-picker">${rows.map(row=>`<li>${link(href(row,tool),row.name,'ad-tool-choice')}</li>`).join('')}</ul>`:'<p>No assigned Programs or Courses are available in this workspace.</p>');
  }
  function showDialog(title,body) {
    if(!dialog){dialog=document.createElement('dialog');dialog.className='ad-dialog';dialog.setAttribute('aria-labelledby','ad-dialog-title');document.body.append(dialog);dialog.addEventListener('click',event=>{if(event.target.closest('[data-ad-close]'))dialog.close();if(event.target.closest('a'))dialog.close();const note=event.target.closest('[data-ad-note]');const notice=event.target.closest('[data-ad-notice]');if(note||notice){dialog.close();$('dashboard').onclick(event);}});}
    dialog.innerHTML=`<header><h2 id="ad-dialog-title">${esc(title)}</h2><button type="button" data-ad-close class="academy-close" title="Close">Close</button></header>${body}`;
    if(!dialog.open)dialog.showModal();
  }
  function renderNavigation() {
    const adminLinks=(options.adminLinks||[]).filter(row=>!/attendance/i.test(row.label+' '+(row.href||'')));
    const sidebar=document.querySelector('#dashboard .ad-sidebar'),caption='Menu';
    sidebar.setAttribute('aria-label',caption);sidebar.querySelector('h2').textContent=caption;
    document.querySelector('[data-ad-contents-toggle]>span').textContent=caption;
    const planning=areas().some(row=>!row.substituteOnly&&row.plansRequired!==false)?'<button type="button" data-ad-choose="planning">Submit plans</button>':'';
    const tools=mode==='teach'?planning:mode==='admin'?adminLinks.map(row=>row.action?'<button type="button" data-admin-public-refresh>Update timetable</button>':link(row.href,row.label)).join(''):link('/academy/enrolment/','Enrol now');
    const shared=tracker()+link('/academy/library/','Library')+link(boundary()?.readerUrl('/recorder/?academy=1')||'/recorder/?academy=1','Voice Recorder');
    const visitWebsite='<a class="ad-visit" href="/academy/#website" data-workspace-exit>Visit website ↗</a>';
    $('ad-navigation').innerHTML=mode==='admin'&&home.globalAdmin?tools+visitWebsite:link(homeUrl(),'Home')+'<button type="button" data-ad-week>Timetable</button>'+'<button type="button" data-ad-inbox>Messages</button>'+tools+shared+visitWebsite;
    $('ad-tools').innerHTML=(mode==='admin'?'':tools)+shared;
    $('ad-primary-actions').innerHTML=mode==='teach'?planning:'';
    $('ad-title').textContent='Your Academy dashboard';
    $('ad-checked').textContent='Last checked '+new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:home.timezone||'Africa/Johannesburg'}).format(new Date(home.generatedAt||Date.now()));
    $('ad-assessment-title').textContent='Upcoming exams (Imtehaan)';
  }
  function renderAreas() {
    const global=globalAdmin(),rows=hubAreas();
    $('ad-continue-title').textContent=global?'Your workspaces':'Your programmes';
    $('ad-hub-gateways').hidden=!global;
    $('ad-hub-gateways').innerHTML=global?'<button type="button" data-ad-programme-choice="admin-learn"><strong>Admin-Learn</strong><span>Choose a programme · Student class view</span></button><button type="button" data-ad-programme-choice="admin-teach"><strong>Admin-Teach</strong><span>Choose a programme · Teaching workspace</span></button><a href="/academy/admin/#administration"><strong>Management</strong><span>People, programmes and Academy tools</span></a>':'';
    $('ad-areas').hidden=global;
    $('ad-areas').innerHTML=global?'':rows.length?'<div class="ad-hub-programmes">'+rows.map(row=>{
      const roles=row.roles||[],admin=roles.some(role=>['PROGRAM_ADMIN','ADMIN'].includes(role));
      const entries=[];
      if(roles.includes('STUDENT')){const helper=options.hifzHref?.(row);entries.push(helper?'<a class="ad-hub-programme-link" href="'+esc(helper)+'" target="_blank" rel="noopener noreferrer">Learn ↗</a>':link(programmeHref(row,'learn'),'Learn','ad-hub-programme-link'));}
      if(roles.some(role=>['TEACHER','SENIOR','SUBSTITUTE'].includes(role)))entries.push(link(programmeHref(row,'teach'),'Teach','ad-hub-programme-link'));
      if(admin)entries.push(link(programmeHref(row,'admin-learn'),'Admin-Learn','ad-hub-programme-link'),link(programmeHref(row,'admin-teach'),'Admin-Teach','ad-hub-programme-link'),link(programmeHref(row,'admin'),'Admin','ad-hub-programme-link'));
      return '<article class="ad-hub-programme"><h3>'+esc(row.name)+'</h3><nav aria-label="'+esc(row.name)+' workspaces">'+entries.join('')+'</nav></article>';
    }).join('')+'</div>':'<p class="ad-empty-line">Your assigned programmes will appear here.</p>';
  }
  function notes() {
    const snapshot=window.M4L_CLASS_NOTES?.snapshot?.()||{sessions:[],status:'idle'};
    const rows=home.personalTimetable||[],result=new Map();
    for(const session of snapshot.sessions){
      const lesson=rows.find(row=>JSON.stringify([row.activityKey||row.kind+':'+row.activityId,row.sourceDate||row.date,row.sessionKey||row.mediaSessionKey])===session.ref);
      if(!lesson||Number(lesson.startsAt)<=Date.now())continue;
      for(const note of session.dueNotes||[]){const source=session.sources[0];if(!source)continue;result.set(note.id,{...note,activityKey:source.activityKey,activityName:source.activityName,startsAt:lesson.startsAt,startTime:source.startTime,readKey:'note:'+note.id+':'+note.date,title:'Class Note · '+note.title});}
    }
    return [...result.values()].sort((a,b)=>a.startsAt-b.startsAt);
  }
  function noteButton(note,label='Open Class Note') { return `<button type="button" data-ad-note="${esc(note.id)}" data-ad-area="${esc(note.activityKey)}" data-ad-read="${esc(note.readKey)}">${esc(label)} →</button>`; }
  function assessmentSummary(data) {
    const allowed=new Set(areas().map(row=>key(row).toUpperCase()));
    // Cache timetable metadata only, never marks, recipients, paper files or staff details.
    return {success:true,timezone:data.timezone,assessments:(data.assessments||[]).filter(row=>allowed.has(row.activityKey?.toUpperCase())&&row.published&&(mode==='learn'||(mode==='admin'?row.canAdmin:row.canTeach))).map(row=>({activityKey:row.activityKey,title:row.title,registerId:row.registerId,phaseId:row.phaseId,phaseName:row.phaseName,registerStatus:row.registerStatus,examDate:row.examDate,assessmentKind:row.assessmentKind,availableFrom:row.availableFrom,dueAt:row.dueAt,timezone:row.timezone,published:row.published}))};
  }
  function renderAssessments() {
    if(!home||!$('ad-assessments'))return;
    const today=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:home.timezone||'Africa/Johannesburg'}).format(new Date());
    const allowed=new Map(areas().map(row=>[key(row).toUpperCase(),row])),groups=new Map();
    const day=(value,timezone,deadline=false)=>{const instant=Date.parse(value);if(!Number.isFinite(instant))return '';try{return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:timezone||home.timezone||'Africa/Johannesburg'}).format(new Date(instant-(deadline?1:0)));}catch{return '';}};
    for(const row of assessments){
      const area=allowed.get(row.activityKey?.toUpperCase());
      if(!area||!row.published||['REGISTERED','DRAFT','COMPLETE','ARCHIVED','CANCELLED'].includes(String(row.registerStatus||'').toUpperCase()))continue;
      const assignment=row.assessmentKind==='ASSIGNMENT',first=assignment?day(row.availableFrom,row.timezone):row.examDate,last=assignment?day(row.dueAt,row.timezone,true):row.examDate;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(first||''))continue;
      const id=JSON.stringify([row.registerId||row.phaseId||row.title,key(area)]);
      if(!groups.has(id))groups.set(id,{title:row.phaseName||row.title,registerId:row.registerId,area,names:new Set(),starts:[],ends:[],openEnded:false,published:true});
      const group=groups.get(id);group.names.add(area.name);group.starts.push(first);if(last)group.ends.push(last);else group.openEnded=true;group.published&&=row.published;
    }
    const rows=[...groups.values()].map(group=>({...group,first:group.starts.sort()[0],last:group.openEnded?null:group.ends.sort().at(-1)})).filter(row=>!row.last||row.last>=today).sort((a,b)=>a.first.localeCompare(b.first)||a.title.localeCompare(b.title));
    $('ad-assessment-count').textContent=String(rows.length);
    const error=failures.get('assessments');
    const label=(value,short=false)=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',...(short?{}:{year:'numeric'}),timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
    $('ad-assessments').innerHTML=rows.length?`<ul class="ad-assessment-list" tabindex="0" aria-label="Imtehaan timetables">${rows.map(row=>{
      const base=href(row.area,'assessment'),target=base+(row.registerId?'/'+encodeURIComponent(row.registerId):''),dates=!row.last?'From '+label(row.first):label(row.first,row.last!==row.first&&row.first.slice(0,4)===row.last.slice(0,4))+(row.last!==row.first?' – '+label(row.last):''),status=(row.first<=today?'Current':'Upcoming')+(row.published?'':' · Schedule draft');
      return `<li><a class="ad-assessment-row" href="${esc(target)}" aria-label="${esc([...row.names].join(' · ')+' · '+row.title+' · '+dates+' · '+status)}"><span class="ad-assessment-program">${esc([...row.names].join(' · '))}</span><strong>${esc(row.title)}${row.published?'':' <span class="ad-assessment-draft">Draft</span>'}</strong><span class="ad-assessment-date">${esc(dates)}</span><span class="ad-assessment-open" aria-hidden="true">→</span><span class="ad-assessment-status">${esc(status)}</span></a></li>`;
    }).join('')}</ul>`:`<p class="ad-empty-line">${loading.has('assessments')?'Checking Imtehaan…':error?'Imtehaan could not be checked.':'No published Imtehaan.'}</p>`;
    if(error)$('ad-assessments').insertAdjacentHTML('beforeend',`<p class="ad-warning" role="status">${esc(error)}</p><button type="button" data-ad-retry>Try again</button>`);
  }
  function tasks() {
    const completed=canComplete()?completedNotes():new Set(),list=notes().filter(note=>!completed.has(completionId(note))).map(note=>({title:note.title,description:note.activityName+' · '+date(note.date+'T12:00:00Z')+' · '+note.startTime,badge:'Due this lesson',action:noteButton(note)+completionButton(note,false)}));
    if(mode==='admin'&&enrolments.length)list.unshift({title:'Enrolment requests need review',description:'Requests within your administrative scope',badge:enrolments.length+(enrolments.nextCursor?'+':'')+' requests',action:link('/academy/enrolment/manage/?view=requests','Review requests →')});
    return list;
  }
  function renderAttention() {
    if(!home||!$('ad-attention'))return;
    const list=tasks(),noteState=window.M4L_CLASS_NOTES?.snapshot?.(),pending=[...loading].some(name=>!['assessments'].includes(name)),errors=[...failures].filter(([name])=>!['assessments'].includes(name)).map(([,message])=>message);
    $('ad-fya-count').textContent=String(list.length);
    $('ad-attention').innerHTML=list.length?`<ul class="ad-task-list">${list.map(row=>`<li><h3>${esc(row.title)}</h3><p class="ad-muted">${esc(row.description)}</p><div class="ad-task-bottom">${row.badge?`<span class="ad-due">${esc(row.badge)}</span>`:''}${row.action}</div></li>`).join('')}</ul>`:'<p class="ad-empty-line">'+(pending||['idle','loading'].includes(noteState?.status)&&home.personalTimetable?.some(row=>row.mediaSessionKey)?'Checking your outstanding actions…':errors.length||noteState?.status==='error'?'Some actions could not be checked.':'No outstanding actions in the available Academy records.')+'</p>';
    if(canComplete()){
      const completed=completedNotes(),done=notes().filter(note=>completed.has(completionId(note)));
      if(done.length)$('ad-attention').insertAdjacentHTML('beforeend',`<details class="ad-completed-notes"><summary>Completed notes (${done.length})</summary><p class="ad-muted">Saved on this device only. Clearing browser data removes these marks.</p><ul>${done.map(note=>`<li class="ad-actions">${noteButton(note,note.title)} ${completionButton(note,true)}</li>`).join('')}</ul></details>`);
    }
    if(errors.length||['error','stale'].includes(noteState?.status))$('ad-attention').insertAdjacentHTML('beforeend','<p class="ad-warning" role="status">'+esc([...errors,noteState?.message].filter(Boolean).join(' '))+'</p><button type="button" data-ad-retry>Try again</button>');
  }
  function messages() {
    const announcements=(window.M4L_ANNOUNCEMENTS?.snapshot?.().announcements||[]).map(row=>({...row,type:'announcement',readKey:'announcement:'+row.id+':'+(row.revision||row.updatedAt||row.message||''),context:'Academy announcement'}));
    return [...notes().map(row=>({...row,type:'note',context:row.activityName+' · Class Note'})),...announcements];
  }
  function renderQueues() { renderAttention();renderAssessments(); }
  function messageRows(rows) {return rows.map(row=>`<div class="ad-message ${read.has(row.readKey)?'':'is-unread'}">${row.type==='note'?noteButton(row,row.title):`<button type="button" data-ad-notice="${esc(row.id)}" data-ad-read="${esc(row.readKey)}">${esc(row.title)}</button>`}<p>${esc(row.context)}${read.has(row.readKey)?' · Read':' · Unread'}</p></div>`).join('');}
  function renderMessages() {
    if(!home||!$('ad-messages'))return;
    if(window.M4L_MESSAGING){window.M4L_MESSAGING.renderCard($('ad-messages'),$('ad-unread'));return;}
    $('ad-messages').innerHTML='<p class="ad-empty-line">Messages could not load. Refresh Academy to try again.</p>';
  }
  function openInbox() { if(window.M4L_MESSAGING)void window.M4L_MESSAGING.open(); }
  function renderNext() {
    const now=Date.now(),allowed=new Map(areas().map(row=>[key(row).toUpperCase(),row])),next=new Map();
    const rows=(home.personalTimetable||[]).filter(row=>row.status==='SCHEDULED'&&Number.isFinite(Number(row.startsAt))&&Number(row.endsAt)>now&&allowed.has((row.kind+':'+row.activityId).toUpperCase())).sort((a,b)=>a.startsAt-b.startsAt||a.activityName.localeCompare(b.activityName));
    for(const row of rows){
      const id=mode==='admin'?JSON.stringify([row.kind,row.activityId,row.date||date(row.startsAt)]):JSON.stringify([row.kind,row.activityId,row.startsAt,row.endsAt,row.subjectName,row.moduleName]);
      if(!next.has(id))next.set(id,row);
      if(next.size===3)break;
    }
    const lessons=[...next.values()];
    $('ad-next').innerHTML=lessons.length?`<ul class="ad-next-list" aria-label="Upcoming sessions">${lessons.map(lesson=>{
      const area=allowed.get((lesson.kind+':'+lesson.activityId).toUpperCase()),helper=options.hifzHref?.(area),target=helper||href(area);
      const subject=[lesson.subjectName,lesson.moduleName].filter(Boolean).filter((name,index,all)=>all.findIndex(other=>other.toLowerCase()===name.toLowerCase())===index).join(' · ')||lesson.title||'Session';
      return `<li><a class="ad-next-row" href="${esc(target)}"${helper?' target="_blank" rel="noopener noreferrer" title="Open HifzHelper in a new tab"':''}><span class="ad-next-subject"><strong>${esc(subject)}</strong><span>${esc(lesson.activityName)}</span></span><span class="ad-next-time"><span>${esc(date(lesson.startsAt))}</span><strong>${esc(lesson.startTime)}–${esc(lesson.endTime)}</strong></span><span class="ad-next-arrow" aria-hidden="true">${helper?'↗':'→'}</span></a></li>`;
    }).join('')}</ul>`:'<p class="ad-empty-line">No upcoming session in this timetable week. Use the timetable arrows to view later weeks.</p>';
    clearTimeout(timer);const transition=lessons.flatMap(lesson=>[lesson.startsAt,lesson.endsAt]).filter(time=>time>now).sort((a,b)=>a-b)[0];
    if(transition)timer=setTimeout(()=>{if(owner===context()&&home){renderNext();renderQueues();renderMessages();void refresh();}},Math.min(2147483647,Math.max(300,transition-Date.now()+100)));
  }
  async function request(path,input) {
    const captured=context(),response=await fetch((window.M4L_CONFIG?.API_BASE||'')+path,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify(input)}),data=await response.json();
    if(captured!==context())throw new DOMException('The Academy workspace changed.','AbortError');
    if(!response.ok||!data.success){if(response.status===401)window.dispatchEvent(new Event('m4l-academy-session-ended'));throw Object.assign(Error(data.error||'Dashboard actions could not load.'),{status:response.status});}return data;
  }
  async function loadSource(name,path,input,apply,force,reader) {
    const captured=owner,ticket=epoch;loading.add(name);renderQueues();
    const current=()=>owner===captured&&ticket===epoch&&captured===context();
    const accept=data=>{if(!current())return;apply(data);loading.delete(name);failures.delete(name);if(data._cacheMessage)failures.set(name,data._cacheMessage);renderQueues();};
    const failure=(error,saved)=>{if(!current()||error.name==='AbortError')return;if(!saved)apply({});loading.delete(name);failures.set(name,(saved?'Showing saved '+name+'. ':'')+'Couldn’t check '+name+'.');renderQueues();};
    try { const cache=window.M4L_ACADEMY_READ_CACHE,result=cache?await cache.load({key:['dashboard',name,input],force,revalidate:true,fetcher:reader||(()=>request(path,input)),onUpdate:accept,onError:failure}):await (reader?reader():request(path,input));accept(result); }catch(error){failure(error,false);}
  }
  async function refresh(force=false) {
    if(!home||owner!==context())return;
    if(!force&&Date.now()-fetched<60000)return;
    fetched=Date.now();
    const work=[];
    const assessmentInput={dashboard:true,summaryVersion:2,view:mode==='admin'?'admin':mode==='teach'?'teacher':'learner'};
    work.push(loadSource('assessments',null,assessmentInput,data=>{assessments=data.assessments||[];},force,async()=>assessmentSummary(await request('/api/academy/assessments/list',assessmentInput))));
    if(mode==='admin')work.push(loadSource('enrolments','/api/admin/platform/enrolment/get',{},data=>{enrolments=data.requests||[];enrolments.nextCursor=data.nextCursor;},force));
    if(force){window.M4L_CLASS_NOTES?.invalidate();void window.M4L_ANNOUNCEMENTS?.refreshPublic(true);options.refreshTimetable?.();}
    await Promise.allSettled(work);
  }
  function open(data,settings) {
    if(!data?.signedIn||!token()||!$('dashboard'))return;
    const next=context(),returning=next===owner&&fetched===0;
    if(next!==owner){reset();owner=next;home=data;options=settings;mode=settings.mode;mount();void restoreRead();}
    else if(returning)mount();
    home=data;options=settings;mode=settings.mode;
    if(!data._cacheChecking)window.M4L_TAFSEER_ACCESS?.setLinks(data.tafseerLinks||{});
    renderNavigation();renderAreas();renderQueues();renderMessages();renderNext();
    announce(data._cacheChecking?'Showing saved dashboard. Checking for updates…':data._cacheMessage||data.warnings?.join(' ')||'',Boolean(data._cacheMessage));
    const calendar=$('ad-calendar-host');
    if(!calendar.firstElementChild){const frame=document.createElement('iframe');frame.className='academy-calendar-frame';frame.title='Academy calendar';frame.loading='lazy';frame.src=boundary().readerUrl('/academy/calendar/?embed=1&view='+mode);calendar.append(frame);}
    void refresh();
    const entry=new URL(location.href);if(entry.searchParams.get('circlesTool')==='messages'&&window.M4L_MESSAGING){entry.searchParams.delete('circlesTool');history.replaceState(null,'',entry);void window.M4L_MESSAGING.open();}
    if(returning){window.M4L_CLASS_NOTES?.invalidate();void window.M4L_ANNOUNCEMENTS?.refreshPublic();options.refreshTimetable?.(false);}
  }
  window.addEventListener('m4l-class-notes-updated',()=>{renderAttention();renderMessages();});
  window.addEventListener('m4l-announcements-updated',renderMessages);
  window.addEventListener('m4l-messaging-updated',renderMessages);
  window.addEventListener('m4l-academy-session',reset);
  window.addEventListener('m4l-academy-session-ended',reset);
  window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)reset();else if(event.key===completionStorageKey())renderAttention();});
  window.M4L_ACADEMY_DASHBOARD={isActiveArea:activeArea,leave:()=>{fetched=0;closeContents(false);closeDialog();},open,reset,landing,homeUrl,refresh,unavailable:message=>announce(message,true)};
})();
