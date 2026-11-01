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
  let dialog, contentsDrawer, circleDay='', circleGroups=[];
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
    epoch++;owner='';circleDay='';circleGroups=[];home=null;options=null;assessments=[];enrolments=[];failures.clear();loading.clear();read.clear();readOwner='';fetched=0;clearTimeout(timer);closeContents(false);closeDialog();
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
    host.classList.add('ad-admin-dashboard','circles-dashboard');
    mountAdmin(host);host.onclick=handleClick;host.onfocusin=revealProgramCard;
  }
  function mountAdmin(host){
    host.innerHTML=`<header class="ad-admin-intro"><p class="eyebrow">YOUR ACADEMY</p><h1 id="ad-title">Your Academy dashboard</h1><p id="ad-checked"></p></header><p id="ad-status" role="status"></p><div class="ad-admin-top"><aside class="ad-sidebar" aria-label="Menu"><h2>Your Academy</h2><nav id="ad-navigation"></nav></aside><section class="ad-admin-centre" aria-label="Your Academy circle"><div id="ad-areas" class="ad-management-row" aria-label="Management"></div><header class="ad-circle-heading"><p class="eyebrow">YOUR ACADEMY CIRCLE</p><h2>A little space for your day.</h2></header><div class="ad-circle-controls"><button type="button" data-ad-step="-1" aria-label="Previous day">←</button><strong id="ad-circle-date"></strong><button type="button" data-ad-step="1" aria-label="Next day">→</button><button type="button" data-ad-today>Today</button></div><div id="ad-admin-circle"></div></section><aside class="ad-panel circles-attention" aria-labelledby="ad-fya-title"><header><h2 id="ad-fya-title">For your attention</h2><span id="ad-fya-count" class="ad-count"></span></header><div id="ad-attention"></div><div class="ad-assessments"><header><h3 id="ad-assessment-title">Upcoming exams (Imtehaan)</h3><span id="ad-assessment-count" class="ad-count"></span></header><div id="ad-assessments"></div></div></aside></div><div class="ad-admin-support"><section class="ad-panel ad-messages"><header><h2>Messages <span id="ad-unread"></span></h2></header><div id="ad-messages"></div><button type="button" data-ad-inbox>View inbox</button></section><section class="ad-panel ad-week"><h2 id="ad-week-title">This week</h2><div id="ad-timetable-host"></div></section><section id="ad-calendar-row" class="ad-panel"><h2>Academy calendar</h2><div id="ad-calendar-host"></div></section></div><div hidden><button data-ad-contents-toggle><span>Menu</span></button><div id="ad-primary-actions"></div><div id="ad-tools"></div><h2 id="ad-continue-title"></h2><nav id="ad-hub-gateways"></nav><div id="ad-next"></div></div>`;
  }
  function adminManagement(){
    const supplied=options.adminLinks||[],spec=[['Users',/^users$/i],['Access',/^access$/i],['Curriculum',/^curriculum$/i],['Intehaan',/^(assessments|imtehaan|intehaan)$/i]];
    const rows=spec.flatMap(([label,match])=>{const row=supplied.find(item=>match.test(item.label));return row?.href?[{label,href:row.href}]:[];});
    if(home.globalAdmin||areas().length)rows.push({label:'Media',href:'#administration/media'});
    return rows;
  }
  function renderAdminCircle(){
    if(!home||!$('ad-admin-circle'))return;
    const timezone=home.timezone||'Africa/Johannesburg',today=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:timezone}).format(new Date());
    if(!circleDay||home.startDate&&circleDay<home.startDate||home.endDate&&circleDay>home.endDate)circleDay=(!home.startDate||today>=home.startDate)&&(!home.endDate||today<=home.endDate)?today:home.startDate||today;
    const allowed=new Set(areas().map(key)),groups=new Map(),model=window.M4L_PROGRAMME_WORKSPACE;
    const displayed=model?.displayRows?model.displayRows(home.personalTimetable||[],timezone):home.personalTimetable||[];
    const rows=displayed.filter(row=>row.date===circleDay&&allowed.has(row.kind+':'+row.activityId)&&Number.isFinite(row.startsAt)&&Number.isFinite(row.endsAt));
    if(mode==='admin'){
      for(const row of rows){const id=row.kind+':'+row.activityId;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row);}
      circleGroups=[...groups.values()];
    }else circleGroups=(mode==='teach'&&model?.rollupRows?model.rollupRows(rows,'teach'):rows).map(row=>row.members||[row]);
    circleGroups=circleGroups.map(rows=>rows.sort((a,b)=>a.startsAt-b.startsAt)).sort((a,b)=>a[0].startsAt-b[0].startsAt);
    $('ad-circle-date').textContent=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(circleDay+'T12:00:00Z'));
    const count=Math.max(6,circleGroups.length),point=angle=>{const r=(angle-90)*Math.PI/180;return [350+342*Math.cos(r),350+342*Math.sin(r)].join(' ');};
    const sectors=Array.from({length:count},(_,i)=>{const start=i*360/count-180/count+.7,end=start+360/count-1.4;return `<path d="M350 350 L${point(start)} A342 342 0 ${360/count>180?1:0} 1 ${point(end)} Z" class="${circleGroups[i]?'has-sessions':''}"/>`;}).join('');
    const entries=circleGroups.map((rows,i)=>{const first=rows[0],last=rows.reduce((a,b)=>a.endsAt>b.endsAt?a:b),angle=i*2*Math.PI/count,label=mode==='admin'?first.activityName:[...new Set(rows.map(r=>r.moduleName||r.subjectName||r.title||r.activityName))].join(' · ');return `<li style="--x:${50+32*Math.sin(angle)}%;--y:${50-32*Math.cos(angle)}%"><button type="button" data-ad-circle-info="${i}" aria-label="${esc(label)}: ${rows.length} session${rows.length===1?'':'s'}. View all session details"><strong>${esc(label)}</strong><span>${esc(first.startTime)}–${esc(last.endTime)}</span><small>${rows.length} session${rows.length===1?'':'s'} ⓘ</small></button>${joinButton(rows,i)}</li>`;}).join('');
    $('ad-admin-circle').innerHTML=`<div class="ad-circle-wheel${circleGroups.length>8?' ad-circle-many':''}"><svg viewBox="0 0 700 700" aria-hidden="true">${sectors}</svg><ol>${entries}</ol><div class="ad-circle-heart"><small>${circleDay===today?'TODAY':'YOUR SELECTED DAY'}</small><strong>${circleGroups.length?circleGroups.length+(mode==='admin'?' programmes':' entries'):'A little space'}</strong><span>${circleGroups.length?'Open an entry for every session':'No sessions on this day'}</span></div></div><p class="ad-circle-caption">Times follow ${esc(timezone)}</p>`;
    bindCircleJoins($('ad-admin-circle'));
  }
  const canJoin=row=>row.status==='SCHEDULED'&&Boolean(row.joinKey)&&Date.now()>=row.joinAvailableAt&&Date.now()<row.endsAt;
  function joinButton(rows,group){const index=rows.findIndex(canJoin);return index<0?'':`<button type="button" class="timetable-join" data-join="dashboard:${group}:${index}" data-ad-join-group="${group}" data-ad-join-child="${index}">Join class ↗</button>`;}
  function bindCircleJoins(host){for(const button of host.querySelectorAll('[data-ad-join-group]')){const row=circleGroups[Number(button.dataset.adJoinGroup)]?.[Number(button.dataset.adJoinChild)];if(row&&canJoin(row))options.bindJoin?.(button,row);}}
  function selectCircleDay(day){
    circleDay=day;
    if(home.startDate&&day<home.startDate||home.endDate&&day>home.endDate){
      if(options.requestDay){options.requestDay(day);return;}
      const control=$(day<home.startDate?'schedule-previous':'schedule-next');if(control&&!control.disabled)control.click();return;
    }
    renderAdminCircle();
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
      const step=event.target.closest('[data-ad-step]');if(step){selectCircleDay(new Date(Date.parse(circleDay+'T12:00:00Z')+Number(step.dataset.adStep)*86400000).toISOString().slice(0,10));return;}
      if(event.target.closest('[data-ad-today]')){selectCircleDay(new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:home.timezone||'Africa/Johannesburg'}).format(new Date()));return;}
      if(event.target.closest('[data-ad-calendar]')){showDialog('Academy calendar','<div data-ad-calendar-body></div>');const frame=document.createElement('iframe');frame.className='academy-calendar-frame';frame.title='Academy calendar';frame.src=boundary().readerUrl('/academy/calendar/?embed=1&view='+mode);dialog.querySelector('[data-ad-calendar-body]').append(frame);return;}
      const info=event.target.closest('[data-ad-circle-info]');if(info){const group=Number(info.dataset.adCircleInfo),rows=circleGroups[group];if(!rows)return;showDialog(rows[0].activityName,rows.map((row,index)=>'<section class="ad-session-detail"><h3>'+esc(row.moduleName||row.subjectName||row.title||'Session')+'</h3><p>'+esc(row.date+' · '+row.startTime+'–'+row.endTime)+'</p><p>'+esc((row.classNames||[row.className]).filter(Boolean).join(', '))+'</p><p>'+esc((row.teacherNames||[row.teacherName]).filter(Boolean).join(', '))+'</p>'+(canJoin(row)?`<button type="button" class="timetable-join" data-join="dashboard:${group}:${index}" data-ad-join-group="${group}" data-ad-join-child="${index}">Join class ↗</button>`:'')+'</section>').join(''));bindCircleJoins(dialog);return;}
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
    if(mode==='admin'){
      $('ad-navigation').innerHTML='<button type="button" data-ad-week>Timetable</button>'+link('/academy/library/','Library')+'<button type="button" data-ad-inbox>Messages</button><p class="ad-menu-caption">QUICK LINKS</p>'+link('/academy/calendar/?view=admin','Calendar')+link('/recorder/?academy=1','Recorder')+'<button type="button" data-ad-retry>Refresh</button>';
      $('ad-assessment-title').textContent='Upcoming exams (Imtehaan)';$('ad-title').textContent='Your Academy dashboard';$('ad-checked').textContent='Last checked '+new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:home.timezone||'Africa/Johannesburg'}).format(new Date(home.generatedAt||Date.now()));return;
    }
    const adminLinks=(options.adminLinks||[]).filter(row=>!/attendance/i.test(row.label+' '+(row.href||'')));
    const sidebar=document.querySelector('#dashboard .ad-sidebar'),caption='Menu';
    sidebar.setAttribute('aria-label',caption);sidebar.querySelector('h2').textContent=caption;
    document.querySelector('[data-ad-contents-toggle]>span').textContent=caption;
    const planning='';
    const tools=mode==='teach'?planning:mode==='admin'?adminLinks.map(row=>row.action?'<button type="button" data-admin-public-refresh>Update timetable</button>':link(row.href,row.label)).join(''):link('/academy/enrolment/','Enrol now');
    const shared=tracker()+link('/academy/library/','Library')+'<p class="ad-menu-caption">QUICK LINKS</p><button type="button" data-ad-calendar>Calendar</button>'+link(boundary()?.readerUrl('/recorder/?academy=1')||'/recorder/?academy=1','Voice Recorder')+'<button type="button" data-ad-retry>Refresh dashboard</button>';
    const visitWebsite='<a class="ad-visit" href="/academy/#website" data-workspace-exit>Visit website ↗</a>';
    $('ad-navigation').innerHTML=mode==='admin'&&home.globalAdmin?tools+visitWebsite:link(homeUrl(),'Home')+'<button type="button" data-ad-week>Timetable</button>'+'<button type="button" data-ad-inbox>Messages</button>'+tools+shared+visitWebsite;
    $('ad-tools').innerHTML=(mode==='admin'?'':tools)+shared;
    $('ad-primary-actions').innerHTML=mode==='teach'?planning:'';
    $('ad-title').textContent='Your Academy dashboard';
    $('ad-checked').textContent='Last checked '+new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:home.timezone||'Africa/Johannesburg'}).format(new Date(home.generatedAt||Date.now()));
    $('ad-assessment-title').textContent='Upcoming exams (Imtehaan)';
  }
  function renderAreas() {
    if(mode==='admin'){$('ad-areas').innerHTML=adminManagement().map(row=>link(row.href,row.label,'ad-management-link')).join('');return;}
    const rows=areas().filter(row=>mode!=='teach'||globalAdmin()||row.roles.some(role=>['TEACHER','SENIOR','SUBSTITUTE','PROGRAM_ADMIN','ADMIN','GLOBAL_ADMIN'].includes(role)));
    $('ad-hub-gateways').hidden=true;$('ad-hub-gateways').replaceChildren();$('ad-areas').hidden=false;
    $('ad-areas').setAttribute('aria-label','Your programmes');
    $('ad-areas').innerHTML=rows.length?rows.map(row=>{const helper=mode==='learn'&&options.hifzHref?.(row);return helper?`<a class="ad-management-link" href="${esc(helper)}" target="_blank" rel="noopener noreferrer">${esc(row.name)} ↗</a>`:link(href(row),row.name,'ad-management-link');}).join(''):'<p class="ad-empty-line">Your assigned programmes will appear here.</p>';
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
    renderAdminCircle();
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
    if(mode==='admin'){calendar.innerHTML=link('/academy/calendar/?view=admin','Edit calendar →');}else if(!calendar.firstElementChild){const frame=document.createElement('iframe');frame.className='academy-calendar-frame';frame.title='Academy calendar';frame.loading='lazy';frame.src=boundary().readerUrl('/academy/calendar/?embed=1&view='+mode);calendar.append(frame);}
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
