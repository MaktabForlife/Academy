/* Signed-in dashboards use the existing scoped Academy readers and tools. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token = () => localStorage.getItem('m4l_account_token') || '';
  const boundary = () => window.M4L_ACADEMY_WORKSPACE;
  const context = () => JSON.stringify([token(),boundary()?.current(),boundary()?.head(),boundary()?.classView()]);
  let owner = '', epoch = 0, options = null, home = null, mode = 'learn', plans = [], assessments = [], enrolments = [], attendance = [], attendanceWarning = '', attendanceRange = '', failures = new Map(), loading = new Set(), read = new Set(), readOwner = '', timer, fetched = 0;
  let dialog;
  const link = (href,label,classes='ad-link') => `<a class="${classes}" href="${esc(href)}">${esc(label)}</a>`;
  const key = row => row.kind + ':' + row.id;
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
  function closeDialog() { if(dialog?.open)dialog.close(); }
  function reset() {
    epoch++;owner='';home=null;options=null;plans=[];assessments=[];enrolments=[];attendance=[];attendanceWarning='';attendanceRange='';failures.clear();loading.clear();read.clear();readOwner='';fetched=0;clearTimeout(timer);closeDialog();
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
  function mount() {
    const host=$('dashboard');if(!host)return;
    host.innerHTML=`<div class="ad-layout"><aside class="ad-sidebar" aria-label="Your workspace"><h2>Your workspace</h2><button type="button" class="ad-menu-toggle" data-ad-nav-toggle aria-expanded="false" aria-controls="ad-navigation">Your workspace <span aria-hidden="true">⌄</span></button><nav id="ad-navigation"></nav></aside><div class="ad-main"><header class="ad-intro"><div><p class="ad-eyebrow" id="ad-workspace"></p><h1 id="ad-title"></h1><p class="ad-muted" id="ad-description"></p></div><div id="ad-primary-actions" class="ad-actions"></div></header><p id="ad-scope" class="ad-scope" hidden></p><p id="ad-status" class="ad-status" role="status" aria-live="polite"></p><div class="ad-grid"><div class="ad-stack"><section class="ad-panel ad-attention" aria-labelledby="ad-fya-title"><header><h2 id="ad-fya-title">For your attention</h2><span id="ad-fya-count" class="ad-count"></span></header><p class="ad-muted">FYA · Outstanding actions</p><div id="ad-attention"></div></section><section class="ad-panel ad-assessments" aria-labelledby="ad-assessment-title"><header><h2 id="ad-assessment-title">Assessments</h2><span id="ad-assessment-count" class="ad-count"></span></header><p class="ad-muted">Current and upcoming Imtihaan</p><div id="ad-assessments" aria-live="polite"></div></section></div><div class="ad-stack"><section class="ad-panel ad-next" aria-labelledby="ad-next-title"><header><h2 id="ad-next-title">Coming up next</h2></header><div id="ad-next"></div></section><section class="ad-panel ad-messages" aria-labelledby="ad-messages-title"><header><h2 id="ad-messages-title">Messages <span id="ad-unread" class="ad-count"></span></h2><button type="button" data-ad-inbox>View inbox →</button></header><div id="ad-messages"></div></section></div></div><section class="ad-continue"><h2 id="ad-continue-title">Continue learning</h2><div id="ad-areas"></div></section><section class="ad-week" aria-labelledby="ad-week-title"><header><h2 id="ad-week-title">This week</h2><span class="ad-muted">Your existing Academy timetable</span></header><div id="ad-timetable-host"></div></section><div id="ad-calendar-row" class="ad-calendar-row"><section class="ad-panel ad-calendar" aria-labelledby="ad-calendar-title"><header><h2 id="ad-calendar-title">Academy calendar</h2></header><div id="ad-calendar-host"></div></section><div id="ad-calendar-actions" class="ad-calendar-actions" hidden><section id="ad-attendance-panel" class="ad-panel ad-queue" aria-labelledby="ad-attendance-title"><header><h2 id="ad-attendance-title">Mark attendance</h2><span id="ad-attendance-count" class="ad-count"></span></header><p class="ad-muted">Displayed timetable · through today</p><div id="ad-attendance" class="ad-queue-body" tabindex="0" role="region" aria-labelledby="ad-attendance-title"></div></section><section id="ad-plans-panel" class="ad-panel ad-queue" aria-labelledby="ad-plans-title"><header><h2 id="ad-plans-title">Lesson plans due</h2><span id="ad-plans-count" class="ad-count"></span></header><div id="ad-plans" class="ad-queue-body" tabindex="0" role="region" aria-labelledby="ad-plans-title"></div></section></div></div><section class="ad-panel ad-tools"><header><h2>Quick tools</h2></header><nav id="ad-tools" aria-label="Dashboard tools"></nav></section></div></div>`;
    host.onclick=event=>{
      const toggle=event.target.closest('[data-ad-nav-toggle]');if(toggle){const expanded=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(expanded));toggle.closest('.ad-sidebar').dataset.navOpen=String(expanded);}
      const note=event.target.closest('[data-ad-note]');
      if(note){markRead(note.dataset.adRead);void window.M4L_CLASS_NOTES?.open({activityKey:note.dataset.adArea,noteId:note.dataset.adNote});}
      const notice=event.target.closest('[data-ad-notice]');
      if(notice){markRead(notice.dataset.adRead);window.M4L_ANNOUNCEMENTS?.openNotice(notice.dataset.adNotice,notice);}
      if(event.target.closest('[data-ad-inbox]'))openInbox();
      if(event.target.closest('[data-ad-week]'))$('ad-week-title').scrollIntoView({block:'start'});
      const queue=event.target.closest('[data-ad-queue]');if(queue)$('ad-'+queue.dataset.adQueue+'-title')?.scrollIntoView({block:'start'});
      const chooser=event.target.closest('[data-ad-choose]');if(chooser)chooseTool(chooser.dataset.adChoose);
      const command=event.target.closest('[data-ad-command]');if(command&&!command.disabled)document.getElementById(command.dataset.adCommand)?.click();
      if(event.target.closest('[data-ad-retry]')){fetched=0;void refresh(true);}
    };
  }
  function tracker() {
    if(mode==='admin')return link('#progress-admin','Surahs and Duas Tracker');
    if(mode==='teach')return '<button type="button" data-ad-choose="surahs-duas">Surahs and Duas Tracker</button>';
    return link('/academy/#progress','Surahs and Duas Tracker');
  }
  function chooseTool(tool) {
    const rows=areas().filter(row=>tool!=='planning'||!row.substituteOnly);
    const title={'attendance':'Mark attendance','planning':'Submit plans','surahs-duas':'Surahs and Duas Tracker'}[tool]||'Open workspace';
    showDialog(title,rows.length?`<p>Choose a Program or Course.</p><ul class="ad-picker">${rows.map(row=>`<li>${link(href(row,tool),row.name,'ad-tool-choice')}</li>`).join('')}</ul>`:'<p>No assigned Programs or Courses are available in this workspace.</p>');
  }
  function showDialog(title,body) {
    if(!dialog){dialog=document.createElement('dialog');dialog.className='ad-dialog';dialog.setAttribute('aria-labelledby','ad-dialog-title');document.body.append(dialog);dialog.addEventListener('click',event=>{if(event.target.closest('[data-ad-close]'))dialog.close();if(event.target.closest('a'))dialog.close();const note=event.target.closest('[data-ad-note]');const notice=event.target.closest('[data-ad-notice]');if(note||notice){dialog.close();$('dashboard').onclick(event);}});}
    dialog.innerHTML=`<header><h2 id="ad-dialog-title">${esc(title)}</h2><button type="button" data-ad-close>Close</button></header>${body}`;
    if(!dialog.open)dialog.showModal();
  }
  function renderNavigation() {
    const adminLinks=options.adminLinks||[];
    const tools=mode==='teach'?'<button type="button" data-ad-choose="attendance">Mark attendance</button><button type="button" data-ad-choose="planning">Submit plans</button>':mode==='admin'?adminLinks.map(row=>row.action?'<button type="button" data-admin-public-refresh>Update timetable</button>':link(row.href,row.label)).join(''):link('/academy/enrolment/','Enrol now');
    const shared=tracker()+link('/academy/library/','Library')+link(boundary()?.readerUrl('/recorder/?academy=1')||'/recorder/?academy=1','Voice Recorder');
    $('ad-navigation').innerHTML=link(homeUrl(),'Home')+'<button type="button" data-ad-week>Timetable</button>'+'<button type="button" data-ad-inbox>Messages</button>'+tools+shared+'<a class="ad-visit" href="/academy/#website" data-workspace-exit>Visit website ↗</a>';
    $('ad-tools').innerHTML=(mode==='admin'?'':tools)+shared;
    $('ad-primary-actions').innerHTML=mode==='admin'?'<button type="button" class="ad-primary" data-ad-queue="attendance">Review attendance</button><button type="button" data-ad-queue="plans">Review Lesson Plans</button>':mode==='teach'?'<button type="button" class="ad-primary" data-ad-choose="attendance">Mark attendance</button><button type="button" class="ad-secondary" data-ad-choose="planning">Submit plans</button>':'';
    $('ad-workspace').textContent=(boundary()?.adminRealm()&&mode!=='admin'?'ADMIN · ':'')+mode.toUpperCase()+' WORKSPACE';
    $('ad-title').textContent=mode==='learn'?'Ahlan wa sahlan, '+(home.profile?.name||'Academy member'):mode==='teach'?'Your teaching dashboard':'Your administration dashboard';
    $('ad-description').textContent=mode==='learn'?'Your learning, one next step at a time.':mode==='teach'?'Your lessons, attendance and planning in one place.':'Decisions and follow-up within your administrative scope.';
    $('ad-scope').hidden=!boundary()?.adminRealm();
    $('ad-scope').textContent=mode==='admin'?(home.globalAdmin?'Global Admin · Program Admin authority is inherited across every Program and Course.':'Administration · Your assigned Programs and Courses only.'):'Admin '+mode+' view · Administrative authority is separate from personal learning and teaching.';
  }
  function renderAreas() {
    $('ad-continue-title').textContent=mode==='teach'?'Continue teaching':mode==='admin'?'Manage Programs and Courses':'Continue learning';
    const rows=areas();
    $('ad-areas').innerHTML=rows.length?['PROGRAM','COURSE'].map(kind=>{
      const group=rows.filter(row=>row.kind===kind);if(!group.length)return '';
      return `<section class="ad-area-group"><h3>${kind==='PROGRAM'?'Programs':'Courses'}</h3><div class="ad-tiles">${group.map(row=>{
        const helper=options.hifzHref?.(row),target=helper||href(row),external=Boolean(helper);
        const roles=(row.roles||[]).map(role=>({STUDENT:'Student',TEACHER:'Teacher',SUBSTITUTE:'Substitute Teacher',PROGRAM_ADMIN:'Program Admin',GLOBAL_ADMIN:'Global Admin'})[role]).filter(Boolean).join(' · ')||'None';
        return `<a class="ad-tile" href="${esc(target)}"${external?' target="_blank" rel="noopener noreferrer"':''}><span class="ad-tile-kind">${kind==='PROGRAM'?'Program':'Course'}</span><strong>${esc(row.name)}</strong><span>${esc(row.studentPreview?'Admin student view':roles)}</span><span class="ad-tile-open">${external?'Open HifzHelper ↗':mode==='admin'?'Manage →':'Open workspace →'}</span></a>`;
      }).join('')}</div></section>`;
    }).join(''):`<div class="ad-empty"><h3>${mode==='teach'?'No teaching assigned yet':mode==='admin'?'No assigned learning areas':'Your learning starts here'}</h3><p>${mode==='learn'?'Your enrolled Programs and Courses will appear here.':'Assigned Programs and Courses will appear here.'}</p>${mode==='learn'?'<a href="/academy/#website" data-workspace-exit>Visit website →</a>':''}</div>`;
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
    return {success:true,timezone:data.timezone,assessments:(data.assessments||[]).filter(row=>allowed.has(row.activityKey?.toUpperCase())&&(row.assessmentKind||'EXAM')==='EXAM'&&(mode==='learn'?row.published:mode==='admin'?row.canAdmin:row.canTeach)).map(row=>({activityKey:row.activityKey,title:row.title,registerId:row.registerId,phaseId:row.phaseId,phaseName:row.phaseName,registerStatus:row.registerStatus,examDate:row.examDate,published:row.published}))};
  }
  function renderAssessments() {
    if(!home||!$('ad-assessments'))return;
    const today=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:home.timezone||'Africa/Johannesburg'}).format(new Date());
    const allowed=new Map(areas().map(row=>[key(row).toUpperCase(),row])),groups=new Map();
    for(const row of assessments){
      const area=allowed.get(row.activityKey?.toUpperCase());
      if(!area||!/^\d{4}-\d{2}-\d{2}$/.test(row.examDate)||['COMPLETE','RELEASED','ARCHIVED','CANCELLED'].includes(row.registerStatus))continue;
      const id=JSON.stringify([row.registerId||row.phaseId||row.title,mode==='admin'?'':key(area)]);
      if(!groups.has(id))groups.set(id,{title:row.phaseName||row.title,registerId:row.registerId,area,names:new Set(),dates:[],published:true});
      const group=groups.get(id);group.names.add(area.name);group.dates.push(row.examDate);group.published&&=row.published;
    }
    const rows=[...groups.values()].map(group=>({...group,first:group.dates.sort()[0],last:group.dates.at(-1)})).filter(row=>row.last>=today).sort((a,b)=>a.first.localeCompare(b.first)||a.title.localeCompare(b.title));
    $('ad-assessment-count').textContent=String(rows.length);
    const error=failures.get('assessments');
    $('ad-assessments').innerHTML=rows.length?`<ul class="ad-assessment-list" tabindex="0" aria-label="Imtihaan timetables">${rows.map(row=>{
      const base=mode==='admin'?'#assessment-admin/'+row.area.kind+'/'+encodeURIComponent(row.area.id):href(row.area,'assessment');
      const target=base+(row.registerId?'/'+encodeURIComponent(row.registerId):''),dates=date(row.first+'T12:00:00Z')+(row.last!==row.first?' – '+date(row.last+'T12:00:00Z'):'');
      return `<li><a class="ad-assessment-row" href="${esc(target)}"><span class="ad-assessment-status">${row.first<=today?'Current':'Upcoming'}${row.published?'':' · Schedule draft'}</span><strong>${esc(row.title)}</strong><span>${esc([...row.names].join(' · '))}</span><span>${esc(dates)}</span><span class="ad-assessment-open">View timetable →</span></a></li>`;
    }).join('')}</ul>`:`<p class="ad-empty-line">${loading.has('assessments')?'Checking Imtihaan timetables…':error?'Imtihaan timetables could not be checked.':'No current or upcoming Imtihaan.'}</p>`;
    if(error)$('ad-assessments').insertAdjacentHTML('beforeend',`<p class="ad-warning" role="status">${esc(error)}</p><button type="button" data-ad-retry>Try again</button>`);
  }
  function tasks() {
    const list=notes().map(note=>({title:note.title,description:note.activityName+' · '+date(note.date+'T12:00:00Z')+' · '+note.startTime,badge:'Due this lesson',action:noteButton(note)}));
    if(mode==='admin'&&enrolments.length)list.unshift({title:'Enrolment requests need review',description:'Requests within your administrative scope',badge:enrolments.length+(enrolments.nextCursor?'+':'')+' requests',action:link('/academy/enrolment/manage/?view=requests','Review requests →')});
    return list;
  }
  function renderAttention() {
    if(!home||!$('ad-attention'))return;
    const list=tasks(),noteState=window.M4L_CLASS_NOTES?.snapshot?.(),pending=[...loading].some(name=>!['planning','attendance','assessments'].includes(name)),errors=[...failures].filter(([name])=>!['planning','attendance','assessments'].includes(name)).map(([,message])=>message);
    $('ad-fya-count').textContent=String(list.length);
    $('ad-attention').innerHTML=list.length?`<ul class="ad-task-list">${list.map(row=>`<li><h3>${esc(row.title)}</h3><p class="ad-muted">${esc(row.description)}</p><div class="ad-task-bottom"><span class="ad-due">${esc(row.badge)}</span>${row.action}</div></li>`).join('')}</ul>`:'<p class="ad-empty-line">'+(pending||['idle','loading'].includes(noteState?.status)&&home.personalTimetable?.some(row=>row.mediaSessionKey)?'Checking your outstanding actions…':errors.length||noteState?.status==='error'?'Some actions could not be checked.':'No outstanding actions in the available Academy records.')+'</p>';
    if(errors.length||['error','stale'].includes(noteState?.status))$('ad-attention').insertAdjacentHTML('beforeend','<p class="ad-warning" role="status">'+esc([...errors,noteState?.message].filter(Boolean).join(' '))+'</p><button type="button" data-ad-retry>Try again</button>');
  }
  function messages() {
    const announcements=(window.M4L_ANNOUNCEMENTS?.snapshot?.().announcements||[]).map(row=>({...row,type:'announcement',readKey:'announcement:'+row.id+':'+(row.revision||row.updatedAt||row.message||''),context:'Academy announcement'}));
    return [...notes().map(row=>({...row,type:'note',context:row.activityName+' · Class Note'})),...announcements];
  }
  function taskList(rows) {
    return `<ul class="ad-task-list">${rows.map(row=>`<li><h3>${esc(row.title)}</h3><p class="ad-muted">${esc(row.description)}</p><div class="ad-task-bottom"><span class="ad-due">${esc(row.badge)}</span>${row.action}</div></li>`).join('')}</ul>`;
  }
  function renderQueue(name,rows,empty) {
    $('ad-'+name+'-count').textContent=String(rows.length);
    const source=name==='plans'?'planning':'attendance',error=failures.get(source)||(name==='attendance'?attendanceWarning:'');
    $('ad-'+name).innerHTML=rows.length?taskList(rows):`<p class="ad-empty-line">${loading.has(source)?'Checking…':error?'This list could not be fully checked.':esc(empty)}</p>`;
    if(error)$('ad-'+name).insertAdjacentHTML('beforeend',`<p class="ad-warning" role="status">${esc(error)}</p><button type="button" data-ad-retry>Try again</button>`);
  }
  function renderQueues() {
    renderAttention();renderAssessments();if(!home||!$('ad-plans'))return;
    const staff=mode!=='learn';$('ad-calendar-actions').hidden=!staff;$('ad-calendar-row').dataset.queues=String(staff);if(!staff)return;
    $('ad-plans-title').textContent=mode==='admin'?'Review Lesson Plans':'Lesson plans due';
    $('ad-attendance-title').textContent=mode==='admin'?'Review attendance':'Mark attendance';
    const planRows=[];
    for(const plan of plans.filter(row=>mode==='admin'||['DUE','OVERDUE'].includes(row.status)&&row.canSubmit)){
      const area=areas().find(row=>key(row).toUpperCase()===plan.activityKey.toUpperCase());if(!area)continue;
      const status={DUE:plan.dueAt?'Due '+date(plan.dueAt):'Plan due',OVERDUE:'Overdue',SUBMITTED:'Submitted',SUBMITTED_LATE:'Submitted late',SUBMITTED_ON_TIME:'Submitted on time'}[plan.status]||plan.status;
      planRows.push({title:plan.activityName,description:[plan.teacherName,plan.period==='WEEKLY'&&plan.weekStart?'Week of '+date(plan.weekStart+'T12:00:00Z'):plan.runName].filter(Boolean).join(' · '),badge:status,action:link(mode==='admin'?'#administration/planning':href(area,'planning'),mode==='admin'?'Review plan →':'Open planning →')});
    }
    renderQueue('plans',planRows,mode==='admin'?'No plans in the available review period.':'No lesson plans due.');
    const registers=attendance.filter(row=>mode==='admin'||!row.submitted).map(row=>({title:row.moduleName||row.subjectName||'Lesson',description:[row.activityName,row.className,date(row.date+'T12:00:00Z'),row.startTime].filter(Boolean).join(' · '),badge:row.submitted?'Submitted':row.canSubmit?'Not marked':'Roster review needed',action:link(attendanceHref(row),mode==='admin'?'Review register →':'Open register →')}));
    renderQueue('attendance',registers,mode==='admin'?'No started lessons in this timetable week.':'No unmarked lessons in this timetable week.');
  }
  function attendanceHref(row) {
    const suffix=row.date+'/'+encodeURIComponent(row.anchor);
    return mode==='admin'?'#administration/attendance/'+row.kind+'/'+encodeURIComponent(row.activityId)+'/'+suffix:href({kind:row.kind,id:row.activityId},'attendance')+'/'+suffix;
  }
  function attendanceUnits() {
    if(mode==='learn'||!home)return [];
    const allowed=new Set(areas().map(row=>key(row).toUpperCase()));
    return [...new Map((home.personalTimetable||[]).filter(row=>row.status==='SCHEDULED'&&Number.isFinite(Number(row.startsAt))&&Number(row.startsAt)<=Date.now()&&allowed.has((row.kind+':'+row.activityId).toUpperCase())).map(row=>{const unit={activityKey:row.kind+':'+row.activityId,date:row.date};return [JSON.stringify(unit),unit];})).values()];
  }
  async function readAttendance(units) {
    const captured=owner,lessons=[],errors=[];let cursor=0;
    await Promise.all(Array.from({length:Math.min(3,units.length)},async()=>{
      while(cursor<units.length){
        if(captured!==context())throw new DOMException('The Academy workspace changed.','AbortError');
        const unit=units[cursor++];
        try {
          const data=await request('/api/academy/attendance/get',unit);if(data.readOnly)continue;
          // Keep register metadata only; learner names, marks and rosters never
          // enter the dashboard cache.
          const clock=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:data.timezone||home.timezone}).format(new Date());
          for(const row of data.lessons||[]){const lesson=row.lesson;if(!lesson||data.date===data.today&&lesson.startTime>clock)continue;lessons.push({kind:data.program.kind,activityId:data.program.id,activityName:data.program.name,date:data.date,anchor:lesson.anchor,subjectName:lesson.subjectName,moduleName:lesson.moduleName,className:lesson.className||lesson.classNames?.join(', '),startTime:lesson.startTime,submitted:Boolean(row.submitted),canSubmit:Boolean(row.canSubmit)});}
        }catch(error){if(error.name==='AbortError'||[401,403,404].includes(error.status))throw error;errors.push(unit.activityKey);}
      }
    }));
    lessons.sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.activityName.localeCompare(b.activityName));
    return {success:true,lessons,warning:errors.length?'Some attendance registers could not be checked. The visible list may be incomplete.':''};
  }
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
    for(const row of rows){const id=(row.kind+':'+row.activityId).toUpperCase();if(!next.has(id))next.set(id,row);}
    const lessons=[...next.values()];
    $('ad-next').innerHTML=lessons.length?`<ul class="ad-next-list">${lessons.map(lesson=>{
      const area=allowed.get((lesson.kind+':'+lesson.activityId).toUpperCase()),helper=options.hifzHref?.(area),target=helper||href(area);
      const subject=[lesson.subjectName,lesson.moduleName].filter(Boolean).filter((name,index,all)=>all.findIndex(other=>other.toLowerCase()===name.toLowerCase())===index).join(' · ')||lesson.title||'Session';
      return `<li><a class="ad-next-row" href="${esc(target)}"${helper?' target="_blank" rel="noopener noreferrer" title="Open HifzHelper in a new tab"':''}><span class="ad-next-subject"><strong>${esc(subject)}</strong><span>${esc(lesson.activityName)}</span></span><span class="ad-next-time"><span>${esc(date(lesson.startsAt))}</span><strong>${esc(lesson.startTime)}–${esc(lesson.endTime)}</strong><small>${esc(lesson.timezone||home.timezone)}</small></span><span class="ad-next-arrow" aria-hidden="true">${helper?'↗':'→'}</span></a></li>`;
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
    const units=attendanceUnits(),range=JSON.stringify(units);
    if(!force&&Date.now()-fetched<60000&&range===attendanceRange)return;
    attendanceRange=range;
    fetched=Date.now();
    const work=[];
    const assessmentInput={dashboard:true,view:mode==='admin'?'admin':mode==='teach'?'teacher':'learner'};
    work.push(loadSource('assessments',null,assessmentInput,data=>{assessments=data.assessments||[];},force,async()=>assessmentSummary(await request('/api/academy/assessments/list',assessmentInput))));
    if(mode!=='learn')work.push(loadSource('planning','/api/academy/planning/list',{view:mode==='admin'?'admin':'teacher',...(mode==='admin'?{weekCount:3}:{})},data=>{plans=data.plans||[];},force));
    if(mode!=='learn'&&window.M4L_CONFIG?.NATIVE_ATTENDANCE)work.push(loadSource('attendance',null,units,data=>{attendance=data.lessons||[];attendanceWarning=data.warning||'';},force,()=>readAttendance(units)));
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
    renderNavigation();renderAreas();renderQueues();renderMessages();renderNext();
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
  window.M4L_ACADEMY_DASHBOARD={isActiveArea:activeArea,leave:()=>{fetched=0;closeDialog();},open,reset,landing,homeUrl,refresh,unavailable:message=>announce(message,true)};
})();
