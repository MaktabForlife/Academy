/* Signed-in dashboards use the existing scoped Academy readers and tools. */
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
  const openCardIcon = external => '<span class="ad-tile-open" title="'+(external?'Open in a new tab':'Open')+'"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(external?'M7 17 17 7M7 7h10v10':'M5 12h14m-6-6 6 6-6 6')+'"/></svg><span class="ad-open-label">'+(external?'Open in a new tab':'Open')+'</span></span>';
  const highestRole = (roles=[]) => roles.some(role=>['GLOBAL_ADMIN','PROGRAM_ADMIN','ADMIN'].includes(role))?'Admin':roles.some(role=>['TEACHER','SENIOR'].includes(role))?'Teacher':roles.includes('SUBSTITUTE')?'Substitute Teacher':roles.includes('STUDENT')?'Student':'None';
  const activeArea = row => row.active!==false&&row.active!==0&&(!row.lifecycle||row.lifecycle==='ACTIVE')&&row.curriculumActive!==false&&row.menuAvailable!==false&&!['DRAFT','COMPLETE','CANCELLED','ARCHIVED'].includes(row.stage);
  const areas = () => (home?.personalActivities || []).filter(row => activeArea(row)&&['PROGRAM','COURSE'].includes(row.kind) && row.id && row.roles?.length && (mode!=='admin'||home.globalAdmin||row.roles.some(role=>['PROGRAM_ADMIN','ADMIN','GLOBAL_ADMIN'].includes(role))));
  const href = (row,tool='timetable') => options.activityHref(row,tool,mode === 'admin' ? 'teach' : mode);
  const date = value => value ? new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:home?.timezone||'Africa/Johannesburg'}).format(new Date(value)) : '';
  const announce = (text,retry=false) => { const node=$('ad-status');if(node){node.textContent=text;if(retry)node.insertAdjacentHTML('beforeend',' <button type="button" data-ad-retry>Try again</button>');} };
  const personalBase = () => boundary()?.adminRealm() ? '/academy/admin/' : '/academy/';
  function homeUrl() { return boundary()?.homeUrl?.() || personalBase() + (mode === 'admin' ? '#administration' : '#timetable/' + mode); }
  function landing(data) {
    const access=data.workspaceAccess||{};
    const selected=access.admin||data.globalAdmin?'admin':access.teach?'teach':'learn';
    return selected==='admin'?'/academy/admin/#administration':'/academy/#timetable/'+selected;
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
    if(contentsDrawer||mode!=='admin'&&(wideContents.matches||!document.body.classList.contains('academy-learning-layout')))return;
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
    host.innerHTML=`<div class="ad-layout"><aside class="ad-sidebar" aria-label="Menu"><h2>Menu</h2><nav id="ad-navigation"></nav></aside><div class="ad-main"><header class="ad-intro"><div class="ad-welcome"><div class="ad-welcome-copy"><h1 id="ad-title"></h1></div><button type="button" class="ad-contents-toggle academy-menu-button" data-ad-contents-toggle aria-haspopup="dialog" aria-expanded="false" aria-controls="ad-navigation"><span>Menu</span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button></div><div id="ad-primary-actions" class="ad-actions"></div></header><p id="ad-status" class="ad-status" role="status" aria-live="polite"></p><div class="ad-grid"><div class="ad-stack"><section class="ad-panel ad-attention" aria-labelledby="ad-fya-title"><header><h2 id="ad-fya-title">For your attention</h2><span id="ad-fya-count" class="ad-count"></span></header><div id="ad-attention"></div></section><section class="ad-panel ad-assessments" aria-labelledby="ad-assessment-title"><header><h2 id="ad-assessment-title">Imtehaan</h2><span id="ad-assessment-count" class="ad-count"></span></header><div id="ad-assessments" aria-live="polite"></div></section></div><div class="ad-stack"><section class="ad-panel ad-next" aria-labelledby="ad-next-title"><header><h2 id="ad-next-title">Coming up next</h2></header><div id="ad-next"></div></section><section class="ad-panel ad-messages" aria-labelledby="ad-messages-title"><header><h2 id="ad-messages-title">Messages <span id="ad-unread" class="ad-count"></span></h2><button type="button" data-ad-inbox>View inbox →</button></header><div id="ad-messages"></div></section></div></div><section class="ad-continue"><h2 id="ad-continue-title">Continue learning</h2><div id="ad-areas"></div></section><section id="ad-tafseer" class="tf-section" aria-labelledby="ad-tafseer-title"><header class="tf-section-heading"><span class="tf-eyebrow">QUR’AN STUDIES</span><h2 id="ad-tafseer-title">Tafseer &amp; Tadabbur</h2><p>Explore a surah, reflect on its guidance, and carry its lessons into your day.</p></header><div id="ad-tafseer-cards" class="tf-card-grid"></div></section><section class="ad-week" aria-labelledby="ad-week-title"><header><h2 id="ad-week-title">This week</h2></header><div id="ad-timetable-host"></div></section><div id="ad-calendar-row" class="ad-calendar-row"><section class="ad-panel ad-calendar" aria-labelledby="ad-calendar-title"><header><h2 id="ad-calendar-title">Academy calendar</h2></header><div id="ad-calendar-host"></div></section></div><section class="ad-panel ad-tools"><header><h2>Quick tools</h2></header><nav id="ad-tools" aria-label="Dashboard tools"></nav></section></div></div>`;
    if(mode!=='admin'){
      const main=host.querySelector('.ad-main');
      main.insertBefore(host.querySelector('.ad-next'),host.querySelector('.ad-grid'));
    }
    host.onclick=handleClick;
    host.onfocusin=revealProgramCard;
  }
  function handleClick(event) {
      if(event.target.closest('[data-ad-contents-toggle]')){openContents();return;}
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
    if(mode==='admin')for(const [index,item] of [...$('ad-tools').children].entries()){
      const label=item.textContent,kind=['heart','library','recorder'][index],icon=document.createElement('span'),caption=document.createElement('span');
      icon.className='quicklink-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML=window.M4L_ACADEMY_SHELL?.icon(kind)||'';caption.className='quicklink-label';caption.textContent=label;item.dataset.quickKind=kind;item.replaceChildren(icon,caption);
    }
    $('ad-primary-actions').innerHTML=mode==='teach'?planning:'';
    $('ad-title').innerHTML=mode==='learn'?'Ahlan wa sahlan<span class="ad-greeting-name">, '+esc(home.profile?.name||'Academy member')+'</span>':mode==='teach'?'Your teaching dashboard':'Dashboard';
    $('ad-assessment-title').textContent='Imtehaan';
  }
  function renderAreas() {
    $('ad-continue-title').textContent=mode==='teach'?'Continue teaching':mode==='admin'?'Manage Programs and Courses':'Continue learning';
    const rows=areas();
    $('ad-areas').innerHTML=rows.length?['PROGRAM','COURSE'].map(kind=>{
      const group=rows.filter(row=>row.kind===kind);if(!group.length)return '';
      const rail=kind==='PROGRAM'&&mode!=='admin';
      return `<section class="ad-area-group"><h3>${kind==='PROGRAM'?'Programs':'Courses'}</h3><div class="ad-tiles${rail?' ad-program-rail':''}"${rail?' role="region" aria-label="Programs" tabindex="0"':''}>${group.map(row=>{
        const helper=options.hifzHref?.(row),target=helper||href(row),external=Boolean(helper);
        const roles=mode==='admin'&&home.globalAdmin?'Admin':highestRole(row.roles);
        const website=window.M4L_COURSE_COMPANION?.href(row,'course-website',mode);
        if(website)return `<div class="ad-tile ad-kahf-course"><span class="ad-tile-kind">${window.M4L_COURSE_COMPANION?.isKahf(row)?'SURAH AL KAHF BOOTCAMP':'COURSE WEBSITE'}</span><strong><a href="${esc(website)}">${esc(row.name)}</a></strong>${window.M4L_COURSE_COMPANION?.isKahf(row)?'<span class="ad-kahf-theme">A complete nurturing from my Rabb.</span>':''}<span class="ad-kahf-materials">Readings · Recordings · Course PDFs</span><span class="ad-tile-role">${esc(row.studentPreview?'Admin student view':roles)}</span><a class="ad-tile-open" href="${esc(website)}"> <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg><span class="ad-open-label">Open course website</span></a>${mode==='learn'?'':`<a class="ad-kahf-workspace-link" href="${esc(target)}">${mode==='admin'?'Manage course':'Teaching tools'} →</a>`}</div>`;
        return `<a class="ad-tile" href="${esc(target)}"${external?' target="_blank" rel="noopener noreferrer"':''}><span class="ad-tile-kind">${kind==='PROGRAM'?'Program':'Course'}</span><strong>${esc(row.name)}</strong><span class="ad-tile-role">${esc(row.studentPreview?'Admin student view':roles)}</span>${openCardIcon(external)}</a>`;
      }).join('')}</div></section>`;
    }).join(''):`<div class="ad-empty"><h3>${mode==='teach'?'No teaching assigned yet':mode==='admin'?'No assigned learning areas':'Your learning starts here'}</h3><p>${mode==='learn'?'Your enrolled Programs and Courses will appear here.':'Assigned Programs and Courses will appear here.'}</p>${mode==='learn'?'<a href="/academy/#website" data-workspace-exit>Visit website →</a>':''}</div>`;
  }
  function renderTafseerCards() {
    const section=$('ad-tafseer'),cards=window.M4L_TAFSEER_CARDS;
    if(section)section.hidden=!cards;
    cards?.mount($('ad-tafseer-cards'),{context:mode,links:home?.tafseerLinks||options?.tafseerLinks||{}});
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
    const rows=[...groups.values()].map(group=>({...group,first:group.starts.sort()[0],last:group.openEnded?null:group.ends.sort().at(-1)})).sort((a,b)=>a.first.localeCompare(b.first)||a.title.localeCompare(b.title));
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
    const list=notes().map(note=>({title:note.title,description:note.activityName+' · '+date(note.date+'T12:00:00Z')+' · '+note.startTime,badge:'Due this lesson',action:noteButton(note)}));
    if(mode==='admin'&&enrolments.length)list.unshift({title:'Enrolment requests need review',description:'Requests within your administrative scope',badge:enrolments.length+(enrolments.nextCursor?'+':'')+' requests',action:link('/academy/enrolment/manage/?view=requests','Review requests →')});
    return list;
  }
  function renderAttention() {
    if(!home||!$('ad-attention'))return;
    const list=tasks(),noteState=window.M4L_CLASS_NOTES?.snapshot?.(),pending=[...loading].some(name=>!['assessments'].includes(name)),errors=[...failures].filter(([name])=>!['assessments'].includes(name)).map(([,message])=>message);
    $('ad-fya-count').textContent=String(list.length);
    $('ad-attention').innerHTML=list.length?`<ul class="ad-task-list">${list.map(row=>`<li><h3>${esc(row.title)}</h3><p class="ad-muted">${esc(row.description)}</p><div class="ad-task-bottom">${row.badge?`<span class="ad-due">${esc(row.badge)}</span>`:''}${row.action}</div></li>`).join('')}</ul>`:'<p class="ad-empty-line">'+(pending||['idle','loading'].includes(noteState?.status)&&home.personalTimetable?.some(row=>row.mediaSessionKey)?'Checking your outstanding actions…':errors.length||noteState?.status==='error'?'Some actions could not be checked.':'No outstanding actions in the available Academy records.')+'</p>';
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
    const now=Date.now(),allowed=new Map(areas().filter(row=>mode!=='admin'||row.kind==='COURSE').map(row=>[key(row).toUpperCase(),row])),next=new Map();
    const rows=(home.personalTimetable||[]).filter(row=>row.status==='SCHEDULED'&&Number.isFinite(Number(row.startsAt))&&Number(row.endsAt)>now&&allowed.has((row.kind+':'+row.activityId).toUpperCase())).sort((a,b)=>a.startsAt-b.startsAt||a.activityName.localeCompare(b.activityName));
    for(const row of rows){
      const id=mode==='admin'?(row.kind+':'+row.activityId).toUpperCase():JSON.stringify([row.kind,row.activityId,row.startsAt,row.endsAt,row.subjectName,row.moduleName]);
      if(!next.has(id))next.set(id,row);
      if(next.size===(mode==='admin'?4:3))break;
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
    renderNavigation();renderAreas();renderTafseerCards();renderQueues();renderMessages();renderNext();
    announce(data._cacheChecking?'Showing saved dashboard. Checking for updates…':data._cacheMessage||data.warnings?.join(' ')||'',Boolean(data._cacheMessage));
    const calendar=$('ad-calendar-host');
    if(!calendar.firstElementChild){const frame=document.createElement('iframe');frame.className='academy-calendar-frame';frame.title='Academy calendar';frame.loading='lazy';frame.src=boundary().readerUrl('/academy/calendar/?embed=1&view='+mode);calendar.append(frame);}
    void refresh();
    if(returning){window.M4L_CLASS_NOTES?.invalidate();void window.M4L_ANNOUNCEMENTS?.refreshPublic();options.refreshTimetable?.(false);}
  }
  window.addEventListener('m4l-class-notes-updated',()=>{renderAttention();renderMessages();});
  window.addEventListener('m4l-announcements-updated',renderMessages);
  window.addEventListener('m4l-messaging-updated',renderMessages);
  window.addEventListener('m4l-academy-session',reset);
  window.addEventListener('m4l-academy-session-ended',reset);
  window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)reset();});
  window.M4L_ACADEMY_DASHBOARD={isActiveArea:activeArea,leave:()=>{fetched=0;closeContents(false);closeDialog();},open,reset,landing,homeUrl,refresh,unavailable:message=>announce(message,true)};
})();
