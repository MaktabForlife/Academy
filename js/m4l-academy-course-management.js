/* Course delivery workspace. Authority, revisions and publication checks are server-owned. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const enrolmentPanel=document.createElement('section');enrolmentPanel.className='enrolment-embedded';
  const token=()=>localStorage.getItem('m4l_account_token')||'',base='/api/admin/platform/courses/';
  const state={token:'',session:null,generation:0,selection:0,courses:[],categories:[],teachers:[],timezone:'Africa/Johannesburg',capabilities:{},course:null,draft:null,cardDraft:null,dirty:false,tab:'list',busy:false,review:null,calendarWarnings:[],media:[],participants:null,personDrafts:new Map(),peopleSearch:'',assignedOnly:false,pending:null,filters:{search:'',status:''}};
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const labels={DRAFT:'Draft',PUBLISHED:'Published',ACTIVE:'Active',COMPLETE:'Complete',CANCELLED:'Cancelled',ARCHIVED:'Archived'};
  const copy=value=>JSON.parse(JSON.stringify(value));
  const selected=()=>state.course?{courseId:state.course.courseId,runId:state.course.runId}:{};
  const cardDirty=()=>JSON.stringify(state.cardDraft)!==JSON.stringify(state.course?.publicCard??null);
  const hasUnsavedChanges=()=>window.M4L_COURSE_MEDIA?.canLeave()===false||state.dirty||state.personDrafts.size>0||cardDirty()||window.M4L_COURSE_PARTICIPANTS?.canLeave()===false;
  const editable=()=>state.course?.stage==='DRAFT';
  const reviewAccepted=()=>Boolean(!state.dirty&&state.review?.valid&&state.course?.acceptedToken===state.review.token);
  const tell=(message,error=false)=>{$('course-message').textContent=message||'';$('course-message').classList.toggle('is-error',error);};
  function lock(message){window.M4L_COURSE_MEDIA?.reset();window.M4L_COURSE_PARTICIPANTS?.reset();window.M4L_STUDIO_ACCESS?.reset();window.M4L_LESSON_MEDIA?.reset();window.M4L_ENROLMENT_WORKSPACE?.reset(enrolmentPanel);state.token='';state.session=null;state.course=null;state.draft=null;state.cardDraft=null;state.dirty=false;state.courses=[];state.participants=null;state.personDrafts.clear();state.pending=null;state.review=null;state.media=[];state.calendarWarnings=[];state.busy=false;state.tab='list';state.selection++;$('course-workspace').hidden=true;$('course-editor').replaceChildren();$('course-list').replaceChildren();$('course-dialog').close();$('course-dialog').replaceChildren();$('course-account-name').textContent='';$('course-access-message').textContent=message;tell('');}
  async function api(path,input={},authToken=state.token){
    const generation=state.generation;
    if(!authToken||authToken!==token()||path!=='/api/account/session'&&!state.session)throw Error('Sign in with an authorised Academy administrator account.');
    if(path==='/api/account/session'&&window.M4L_ACADEMY_NAVIGATION?.session){
      const result=await window.M4L_ACADEMY_NAVIGATION.session(authToken);
      if(generation!==state.generation||authToken!==token())throw Error('Your Academy account changed. Open this page again.');
      return result;
    }
    const response=await fetch(`${String(window.M4L_CONFIG?.API_BASE||'').replace(/\/$/,'')}${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+authToken},body:JSON.stringify(input)});
    const result=await response.json();
    if(generation!==state.generation||authToken!==token())throw Error('Your Academy account changed. Open this page again.');
    if(!response.ok||result.success===false){
      if([401,403].includes(response.status))lock('Course management requires a current Global Admin or assigned Course Program Admin account. Return to Academy home to sign in.');
      throw Object.assign(Error(result.error||'The Course request could not be completed.'),result,{status:response.status});
    }
    void window.M4L_REFRESH_AFTER_SAVE?.(result,authToken);return result;
  }
  async function mutate(action,input){
    const key=JSON.stringify({action,input});
    if(state.pending?.key!==key)state.pending={key,input:{...input,operationId:crypto.randomUUID()}};
    const result=await api(base+action,state.pending.input);state.pending=null;return result;
  }
  const disabledBeforeBusy=new WeakMap();
  function busy(value){state.busy=value;for(const node of document.querySelectorAll('[data-cm-mutation],.cm-list-settings input,#course-new,#course-refresh,#course-editor input,#course-editor select,#course-editor textarea')){if(value){if(!disabledBeforeBusy.has(node))disabledBeforeBusy.set(node,node.disabled);node.disabled=true;}else if(disabledBeforeBusy.has(node)){node.disabled=disabledBeforeBusy.get(node);disabledBeforeBusy.delete(node);}}}
  function pill(stage){return `<span class="cm-pill" data-stage="${esc(stage)}">${esc(labels[stage]||stage)}</span>`;}
  const currentFilters=()=>({search:$('course-search').value,status:$('course-status-filter').value});
  const courseGroup=c=>({ACTIVE:0,PUBLISHED:0,DRAFT:1,COMPLETE:2,CANCELLED:3,ARCHIVED:4}[c.stage]??5);
  const accessGroup=c=>c.accessModel==='PAID'?0:c.accessModel==='FREE'?1:2;
  const groupName=c=>(['Current / active','Draft','Completed','Cancelled','Archived','Other'][courseGroup(c)])+' · '+(c.accessModel==='PAID'?'Paid':c.accessModel==='FREE'?'Free':'Access not set');
  function visibleCourses(filters=currentFilters()){
    const search=filters.search.trim().toLowerCase(),status=filters.status;
    return state.courses.filter(c=>(!search||c.name.toLowerCase().includes(search))&&(!status||(status==='AVAILABLE'?!['ARCHIVED','CANCELLED'].includes(c.stage):c.stage===status))).sort((a,b)=>courseGroup(a)-courseGroup(b)||accessGroup(a)-accessGroup(b)||(b.startDate||'').localeCompare(a.startDate||'')||a.name.localeCompare(b.name)||a.courseId.localeCompare(b.courseId)||a.runId.localeCompare(b.runId));
  }
  function renderList(){
    const rows=visibleCourses(),groups=new Map();
    for(const c of rows){const key=groupName(c);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
    $('course-count').textContent=`${rows.length} ${rows.length===1?'Course':'Courses'}`;
    $('course-list').innerHTML=rows.length?`<table class="cm-course-list"><caption class="cm-visually-hidden">Courses grouped by status and saved access, newest start date first</caption><thead><tr><th scope="col">Course</th><th scope="col">Status</th><th scope="col">Start date</th><th scope="col">Course settings</th><th scope="col"><span class="cm-visually-hidden">Open Course</span></th></tr></thead>${[...groups].map(([name,items])=>`<tbody><tr class="cm-course-group"><th scope="rowgroup" colspan="5">${esc(name)}</th></tr>${items.map(c=>{const selected=state.course?.courseId===c.courseId&&state.course?.runId===c.runId,attrs=` data-course="${esc(c.courseId)}" data-run="${esc(c.runId)}"`;return `<tr${selected?' class="is-selected"':''}><th scope="row">${esc(c.name)}</th><td>${pill(c.stage)}</td><td class="cm-course-dates">${c.startDate?`<time datetime="${esc(c.startDate)}">${esc(c.startDate)}</time>`:'<span class="cm-hint">Not set</span>'}</td><td class="cm-list-settings"><fieldset><legend class="cm-visually-hidden">${esc(c.name)} settings</legend>${['FREE','PAID'].map(model=>`<label><input type="checkbox" data-cm-action="list-policy" data-model="${model}"${attrs}${c.accessModel===model?' checked':''} aria-label="${esc(c.name)} · ${model==='FREE'?'Free':'Paid'}"> ${model==='FREE'?'Free':'Paid'}</label>`).join('')}<label><input type="checkbox" data-cm-action="list-archive"${attrs}${c.stage==='ARCHIVED'?' checked disabled':''} aria-label="${esc(c.name)} · Archive"> Archive</label></fieldset></td><td><button class="pb-secondary cm-course-open" type="button" data-cm-action="select"${attrs} aria-label="Open ${esc(c.name)}" aria-pressed="${selected}">Open</button></td></tr>`;}).join('')}</tbody>`).join('')}</table>`:'<p class="cm-hint">No Courses match this view.</p>';
  }
  const options=(items,value,empty='Choose…')=>`<option value="">${esc(empty)}</option>`+items.map(i=>`<option value="${esc(i.value)}"${i.value===value?' selected':''}>${esc(i.label)}</option>`).join('');
  const teacherOptions=value=>options(state.teachers.map(t=>({value:t.accountId,label:t.name})),value,'Choose a teacher')+(value&&!state.teachers.some(t=>t.accountId===value)?`<option value="${esc(value)}" selected disabled>Previously selected · teacher designation needed</option>`:'');
  const field=(name,label,type='text',span='',hint='')=>`<label class="cm-field ${span}"><span>${label}</span><input data-field="${name}" type="${type==='time'?'text':type}"${type==='time'?' data-time24 placeholder="HH:mm" autocomplete="off" maxlength="8"':''} value="${esc(state.draft[name])}"${name==='name'?' maxlength="160" required':''}${name==='zoomLink'?' placeholder="https://…"':''}${editable()?'':' disabled'}>${hint?`<small>${hint}</small>`:''}</label>`;
  function detailsTab(){
    const d=state.draft,disabled=editable()?'':' disabled';
    return `<div class="cm-details-columns"><section class="cm-details-column" aria-label="Course details"><h3>Details</h3>${field('name','Course name <span aria-hidden="true">*</span>')}<label class="cm-field">Subject / Module category<select data-field="categoryKey"${disabled}>${options(state.categories.map(c=>({value:c.key,label:c.type+' · '+c.name+(c.area?' — '+c.area:'')})),d.categoryKey,'No category')}${d.categoryKey&&!state.categories.some(c=>c.key===d.categoryKey)?`<option value="${esc(d.categoryKey)}" selected>Category no longer available</option>`:''}</select><small>For categorisation only.</small></label><div class="cm-date-fields">${field('startDate','Start date','date')}${field('endDate','End date','date')}</div><p class="cm-hint">Free or Paid is managed in <button type="button" class="cm-inline-link" data-cm-action="tab" data-tab="participants">Participants</button>.</p></section><section class="cm-details-column" aria-label="Course schedule"><h3>Schedule</h3><fieldset class="cm-fieldset"${disabled}><legend>Schedule days</legend><div class="cm-days">${[0,1,2,3,4,5,6].map(n=>`<label><input type="checkbox" data-day="${n}"${d.weekdays.includes(n)?' checked':''}><span>${days[n]}</span></label>`).join('')}</div></fieldset><div class="cm-date-fields">${field('startTime','Start time','time')}${field('endTime','Finish time','time')}</div><label class="cm-field">Teacher<select data-field="teacherId"${disabled}>${teacherOptions(d.teacherId)}</select></label>${field('zoomLink','Zoom meeting link','url')}<p class="cm-hint">${editable()?'Validate the schedule, review the sessions below, then accept before publishing.':'Published schedules are protected. Create a revision to make changes.'}</p></section></div><section id="cm-sessions" class="cm-details-section" aria-label="Course sessions">${sessionsTab()}</section><section id="cm-review" class="cm-details-section" aria-label="Course review and publication">${reviewTab()}</section>`;
  }
  function publicCardPreview(){
    const card=state.cardDraft||{time:'',title:'',description:''};
    return card.title?`<strong>${esc(card.time)}</strong><div><b>${esc(card.title)}</b><p>${esc(card.description).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')}</p></div>`:'<span class="cm-hint">Enter a display time, title and description to preview your card.</span>';
  }
  function publicCardControls(){
    const preview=$('cm-card-preview');if(preview)preview.innerHTML=publicCardPreview();
    for(const button of document.querySelectorAll('[data-cm-action="save-card"],[data-cm-action="discard-card"]'))button.disabled=state.busy||!cardDirty();
    const status=$('cm-card-status');if(status)status.textContent=cardDirty()?'Unsaved card changes':state.course.publicCard?'Card saved':'Using session summaries until a card is saved';
  }
  function publicCardTab(){
    if(!state.course.courseId)return '<p class="cm-hint">Save the Course draft before creating its public timetable card.</p>';
    const card=state.cardDraft||{time:'',title:'',description:''};
    return `<h3>Public timetable card</h3><p class="cm-hint">Use the same summary card as Programs. It appears once per scheduled day after the Course is published. The card applies to all deliveries of this Course. Its display time does not change the lesson times. Leave all three fields empty to hide the public card.</p><div class="cm-form-grid cm-card-fields">${[['time','Display time',12],['title','Card title',80],['description','Description',240]].map(([key,label,limit])=>`<label class="cm-field ${key==='description'?'cm-span-4':key==='title'?'cm-span-2':''}">${label}${key==='description'?`<textarea data-card-field="${key}" maxlength="${limit}" rows="3">${esc(card[key])}</textarea>`:`<input data-card-field="${key}" maxlength="${limit}" value="${esc(card[key])}">`}</label>`).join('')}</div><div id="cm-card-preview" class="cm-card-preview" aria-label="Public timetable card preview">${publicCardPreview()}</div><div class="cm-actions cm-card-actions"><button type="button" data-cm-action="save-card" data-cm-mutation${cardDirty()?'':' disabled'}>Save public card</button><button type="button" class="pb-secondary" data-cm-action="discard-card" data-cm-mutation${cardDirty()?'':' disabled'}>Discard card changes</button><small id="cm-card-status">${cardDirty()?'Unsaved card changes':state.course.publicCard?'Card saved':'Using session summaries until a card is saved'}</small></div>`;
  }
  function sessionsTab(){
    const canEdit=editable(),d=state.draft,disabled=canEdit?'':' disabled';
    const holidays=new Set(state.calendarWarnings.map(w=>w.date));
    return `<div class="cm-section-toolbar"><h3>Sessions<span class="cm-session-count">${d.sessions.filter(s=>s.status==='SCHEDULED').length} scheduled · ${d.sessions.filter(s=>s.status==='CANCELLED').length} cancelled · ${esc(d.timezone)}</span></h3>${canEdit?`<button type="button" class="pb-secondary" data-cm-action="generate" data-cm-mutation>${d.sessions.length?'Regenerate from schedule':'Validate & generate sessions'}</button><button type="button" data-cm-action="add-session" data-cm-mutation>+ Add session</button>`:''}</div><p class="cm-hint" style="margin-bottom:12px">Review the sessions generated from your schedule. Academy holidays and teacher clashes are highlighted after validation. Edit any exception, validate again, then accept your review before publishing.</p>${d.sessions.length?`<div class="cm-table-wrap"><table class="cm-table cm-sessions"><thead><tr><th>Date</th><th>Start</th><th>Finish</th><th>Teacher</th><th>Session title</th><th>Zoom link</th><th>Status</th>${canEdit?'<th><span class="cm-hint">Remove</span></th>':''}</tr></thead><tbody>${d.sessions.map((s,i)=>`<tr data-session-row="${esc(s.id)}" class="${holidays.has(s.date)?'cm-holiday ':''}${s.status==='CANCELLED'?'cm-cancelled':''}"><td><input aria-label="Session ${i+1} date" type="date" data-session="${esc(s.id)}" data-session-field="date" value="${esc(s.date)}"${disabled}>${holidays.has(s.date)?'<small class="cm-session-count">Academy holiday</small>':''}</td><td><input aria-label="Session ${i+1} start time" type="text" data-time24 placeholder="HH:mm" autocomplete="off" maxlength="8" data-session="${esc(s.id)}" data-session-field="startTime" value="${esc(s.startTime)}"${disabled}></td><td><input aria-label="Session ${i+1} finish time" type="text" data-time24 placeholder="HH:mm" autocomplete="off" maxlength="8" data-session="${esc(s.id)}" data-session-field="endTime" value="${esc(s.endTime)}"${disabled}></td><td><select class="cm-teacher" aria-label="Session ${i+1} teacher" data-session="${esc(s.id)}" data-session-field="teacherId"${disabled}>${teacherOptions(s.teacherId)}</select></td><td><input class="cm-title" aria-label="Session ${i+1} title" data-session="${esc(s.id)}" data-session-field="title" value="${esc(s.title)}" maxlength="400"${disabled}></td><td><input class="cm-link" aria-label="Session ${i+1} Zoom link" type="url" data-session="${esc(s.id)}" data-session-field="zoomLink" value="${esc(s.zoomLink)}"${disabled}></td><td><select aria-label="Session ${i+1} status" data-session="${esc(s.id)}" data-session-field="status"${disabled}>${options([{value:'SCHEDULED',label:'Scheduled'},{value:'CANCELLED',label:'Cancelled'}],s.status,'')}</select></td>${canEdit?`<td><button class="cm-remove" type="button" aria-label="Remove session ${i+1}" data-cm-action="remove-session" data-id="${esc(s.id)}" data-cm-mutation>×</button></td>`:''}</tr>`).join('')}</tbody></table></div>`:'<div class="cm-media-empty"><h3>No sessions yet</h3><p>Set your schedule in Details, then select Validate & generate sessions. Each date, time, teacher and Zoom link will be filled in for you.</p></div>'}${canEdit&&state.review?.valid?`<div class="cm-session-review"><p>${state.review.warnings.length?`${state.review.warnings.length} warnings to review before acceptance.`:'Sessions checked. Review the dates and times above before accepting.'}</p><button type="button" data-cm-action="tab" data-tab="review" data-cm-mutation>${reviewAccepted()?'Continue to publish':'Review & accept sessions'} →</button></div>`:''}`;
  }
  const participantStatus=()=>state.personDrafts.size?`${state.personDrafts.size} ${state.personDrafts.size===1?'user has':'users have'} unsaved changes`:'All participant changes saved';
  const saveState=()=>state.dirty?'Unsaved changes':state.personDrafts.size?'Unsaved participant changes':state.course.courseId?'Saved':'Name required · everything else can wait';
  function participantActions(){
    return `<div class="cm-participant-actions"><span data-participant-status>${participantStatus()}</span><button type="button" data-cm-action="save-participants" data-cm-mutation${state.personDrafts.size?'':' disabled'}>Save participants</button></div>`;
  }
  function updateParticipantControls(){
    for(const node of document.querySelectorAll('[data-participant-status]'))node.textContent=participantStatus();
    for(const button of document.querySelectorAll('[data-cm-action="save-participants"]'))button.disabled=state.busy||!state.personDrafts.size;
    for(const button of document.querySelectorAll('[data-cm-action="save-person"]'))button.disabled=state.busy||!state.personDrafts.has(button.dataset.account);
    const indicator=$('course-editor').querySelector('[data-cm-save-state]');if(indicator)indicator.textContent=saveState();
  }
  function peopleTab(){
    if(state.participants?.studio)return window.M4L_COURSE_PARTICIPANTS?'':'<p class="cm-hint">Learning access is managed below. Staff roles remain in Academy User profiles.</p>';
    const model=state.draft.accessModel,policy=`<fieldset class="cp-policy"${editable()?'':' disabled'}><legend>This Course is</legend>${['FREE','PAID'].map(value=>`<label><input type="radio" name="course-policy" data-field="accessModel" value="${value}"${model===value?' checked':''}> ${value==='FREE'?'Free':'Paid'}</label>`).join('')}</fieldset>`;
    if(!state.course.courseId)return policy+'<p class="cm-hint">Save the Course draft before adding students.</p>';
    if(!state.participants)return '<p class="cm-hint">Loading students…</p>';
    const free=model==='FREE',rows=state.participants.accounts.filter(a=>(free&&a.active||a.assignment.roles.includes('STUDENT')||state.personDrafts.has(a.accountId))&&(!state.peopleSearch||a.displayName.toLowerCase().includes(state.peopleSearch.toLowerCase())));
    return policy+`<div class="cm-section-toolbar"><h3>Students with access</h3><input class="cm-person-search" id="course-people-search" type="search" placeholder="Find a student…" aria-label="Find a student" value="${esc(state.peopleSearch)}"><button type="button" data-cm-action="add-user" data-cm-mutation${free?' disabled':''}>+ Add user</button></div><p class="cm-hint">${free?'Free access is included for eligible signed-in users.':'Untick a student, then save to remove Course access.'}${state.course.draftAccessHeld?' Draft selections take effect after publication.':''}</p>${state.course.legacySharedAccess?'<p class="cm-inline-note warning">Existing deliveries share these participants. Changes apply to those deliveries.</p>':''}${participantActions()}<div class="cm-table-wrap"><table class="cm-table cm-people"><thead><tr><th>Student</th><th>User ID</th></tr></thead><tbody>${rows.map(a=>{const roles=state.personDrafts.get(a.accountId)||a.assignment.roles;return `<tr><td><label class="cp-person"><input type="checkbox" aria-label="${esc(a.displayName)} · Student" data-person="${esc(a.accountId)}" data-role="STUDENT"${free||roles.includes('STUDENT')?' checked':''}${free?' disabled':''}> ${esc(a.displayName)}</label>${!a.active?'<small>Inactive account</small>':''}</td><td>${esc(a.accountId)}</td></tr>`;}).join('')||'<tr><td colspan="2">No students match this view.</td></tr>'}</tbody></table></div>`;
  }
  function existingUsersDialog(){
    const el=$('course-dialog'),chosen=new Set(),available=state.participants.accounts.filter(a=>a.active&&!a.assignment.roles.includes('STUDENT'));
    el.innerHTML='<h2 id="course-dialog-title">Add users</h2><label class="cm-field">Find a user<input id="cm-user-search" type="search" autocomplete="off" placeholder="Search existing users…"></label><div id="cm-user-results"></div><div class="cm-actions"><span id="cm-user-count">0 selected</span><button type="button" class="pb-secondary" data-users-cancel>Cancel</button><button type="button" data-users-add disabled>Add selected users</button></div>';
    const draw=()=>{const q=$('cm-user-search').value.trim().toLowerCase();$('cm-user-results').innerHTML=available.filter(a=>!q||[a.displayName,a.accountId].some(v=>v.toLowerCase().includes(q))).map(a=>`<label class="cp-candidate"><input type="checkbox" data-existing-user="${esc(a.accountId)}"${chosen.has(a.accountId)?' checked':''}><span>${esc(a.displayName)}<small>${esc(a.accountId)}</small></span></label>`).join('')||'<p>No matching users.</p>';};
    $('cm-user-search').oninput=draw;el.querySelector('#cm-user-results').onchange=e=>{const id=e.target.dataset.existingUser;if(!id)return;if(e.target.checked)chosen.add(id);else chosen.delete(id);$('cm-user-count').textContent=chosen.size+' selected';el.querySelector('[data-users-add]').disabled=!chosen.size;};
    el.querySelector('[data-users-cancel]').onclick=()=>el.close();el.querySelector('[data-users-add]').onclick=()=>{for(const id of chosen){const account=available.find(a=>a.accountId===id);state.personDrafts.set(id,[...new Set([...account.assignment.roles,'STUDENT'])]);}el.close();renderEditor();tell('Selected users added to the table. Save participants to confirm access.');};draw();el.showModal();$('cm-user-search').focus();
  }
  function mediaTab(){return state.course?.courseId?'<section id="course-lesson-media" aria-label="Course lesson media"></section>':'<p>Save this Course and its sessions before attaching media.</p>';}

  function reviewTab(){
    if(!editable())return `<h3 class="cm-review-title">${esc(labels[state.course.stage]||state.course.stage)} Course</h3><p class="cm-hint">${state.course.stage==='PUBLISHED'?'These sessions are published to the Academy timetable. Select Create revision to prepare changes for validation and review.':['COMPLETE','ARCHIVED'].includes(state.course.stage)?'The Course and its participant records are retained. Repeat as a new Course to schedule another delivery.':'This Course is no longer on the timetable. Its participant records are retained.'}</p>`;
    const r=state.review,accepted=reviewAccepted();
    if(!r)return `<h3 class="cm-review-title">Validate your schedule first</h3><p class="cm-hint">Save the draft and set its schedule. Validation generates the sessions automatically, then checks dates, teachers, Zoom links, overlapping sessions and Academy holidays. Review and accept the sessions before publishing.</p><button style="margin-top:18px" type="button" data-cm-action="validate" data-cm-mutation${editable()?'':' disabled'}>Validate &amp; generate sessions</button>`;
    return `<h3 class="cm-review-title">${accepted?'Review accepted':r.valid?'Accept your session review':'A few details need attention'}</h3><p class="cm-hint">${r.valid?`${state.draft.sessions.filter(s=>s.status==='SCHEDULED').length} scheduled sessions checked. ${accepted?'You can now publish them to the Academy timetable.':'Review each session, then accept this saved version.'}`:'Resolve these issues and validate again. Sessions will be generated from your schedule when it is ready.'}</p><ul class="cm-review-list">${r.errors.map(e=>`<li class="error">${esc(e.message)}<button type="button" data-cm-action="tab" data-tab="${e.sessionId||e.field==='sessions'?'sessions':'details'}">Review ${e.sessionId?'session':'details'} →</button></li>`).join('')}${r.warnings.map(w=>`<li class="warning">${esc(w.message)}<button type="button" data-cm-action="tab" data-tab="sessions">Review sessions →</button></li>`).join('')}${r.valid&&!r.warnings.length?'<li>No publication issues found.</li>':''}</ul>${r.valid?`<div class="cm-publish-bar"><div><p><strong>${esc(state.draft.name)}</strong> · ${state.draft.accessModel==='FREE'?'Free':'Paid'}</p>${!accepted&&r.warnings.length?'<label class="cm-toggle" style="margin-top:10px"><input id="course-ack-warnings" type="checkbox">I have reviewed the warnings and want to keep these sessions.</label>':`<p class="cm-hint">${accepted?'The accepted saved sessions are ready to publish.':'Accept only after reviewing the generated sessions.'}</p>`}</div><button type="button" data-cm-action="${accepted?'publish':'accept'}" data-cm-mutation>${accepted?'Publish Course':'Accept reviewed sessions'}</button></div>`:''}`;
  }
  function workflow(){
    if(!['DRAFT','PUBLISHED'].includes(state.course.stage))return '';
    if(state.course.stage==='PUBLISHED')return '<p class="cm-published-note">✓ Published Academy timetable</p>';
    const current=state.course.stage!=='DRAFT'?5:state.dirty||!state.course.courseId?0:!state.review?.valid?1:reviewAccepted()?5:3;
    return `<ol class="cm-workflow" aria-label="Course publication steps">${['Draft','Validate','Generate sessions','Review','Accept','Publish'].map((label,index)=>`<li class="${index<current?'is-done':index===current?'is-current':''}"${index===current?' aria-current="step"':''}><span>${index+1}</span>${label}</li>`).join('')}</ol>`;
  }
  const normalTab=tab=>['sessions','review'].includes(tab)?'details':tab;
  const tabs=[['list','List of courses'],['details','Details'],['participants','Participants'],['public-card','Public card'],['media','Media'],['enrolment','Enrolment requests · Coming soon']];
  function renderTabs(){
    const focused=document.activeElement?.id;
    $('course-tabs').innerHTML=tabs.map(([tab,label])=>`<button id="cm-tab-${tab}" type="button" role="tab" tabindex="${state.tab===tab?0:-1}" aria-selected="${state.tab===tab}" aria-controls="${tab==='list'?'course-list-panel':'course-editor'}" data-cm-action="tab" data-tab="${tab}"${tab!=='list'&&!state.course||tab==='enrolment'&&!state.course?.courseId?' disabled':''}>${label}${tab==='sessions'&&state.draft?.sessions.length?' · '+state.draft.sessions.length:''}</button>`).join('');
    $('course-list-panel').hidden=state.tab!=='list';
    $('course-editor').hidden=Boolean(state.course&&state.tab==='list');
    $('course-editor').setAttribute('aria-labelledby','cm-tab-'+state.tab);
    if(focused?.startsWith('cm-tab-'))$(focused)?.focus?.({preventScroll:true});
    revealTab();
  }
  function revealTab(){
    const strip=$('course-tabs'),active=$('cm-tab-'+state.tab);
    if(active?.offsetLeft<strip.scrollLeft)strip.scrollLeft=active.offsetLeft;
    else if(active?.offsetLeft+active?.offsetWidth>strip.scrollLeft+strip.clientWidth)strip.scrollLeft=active.offsetLeft+active.offsetWidth-strip.clientWidth;
  }
  function renderEditor(){
    window.M4L_LESSON_MEDIA?.reset();window.M4L_COURSE_MEDIA?.reset();
    renderTabs();
    if(state.course&&state.tab==='list')return;
    if(!state.course){$('course-editor').innerHTML='<div class="cm-empty"><h2>Select a course</h2></div>';return;}
    const c=state.course,d=state.draft,isDraft=editable();
    const transitions=!c.courseId?[]:c.stage==='PUBLISHED'?[['revise','Create revision'],['complete','Mark complete'],['cancel','Cancel Course']]:c.stage==='DRAFT'?[['cancel','Cancel Course'],['archive','Archive draft']]:c.stage==='COMPLETE'||c.stage==='CANCELLED'?[['archive','Archive Course']]:[];
    if(['COMPLETE','ARCHIVED'].includes(c.stage)&&state.capabilities.create)transitions.push(['repeat','Repeat as new Course']);
    $('course-editor').innerHTML=`<header class="cm-editor-heading"><div><h2>${esc(d.name||'New Course')}</h2>${state.tab==='participants'&&c.courseId?`<small class="cm-course-id">Course ID ${esc(c.courseId)}</small>`:''}<div class="cm-heading-meta">${pill(c.displayStage||c.stage)}<small data-cm-save-state>${saveState()}</small>${c.currentPublication&&isDraft?'<small>Current timetable remains published</small>':''}</div></div><div class="cm-actions">${state.tab==='details'?`<button type="button" class="pb-secondary" data-cm-action="show-review">Review</button><button type="button" data-cm-action="publish" data-cm-mutation${isDraft&&reviewAccepted()?'':' disabled'}>Publish</button>`:''}${isDraft?`<button type="button" class="pb-secondary" data-cm-action="save" data-cm-mutation>Save draft</button><button type="button" data-cm-action="validate" data-cm-mutation>${d.sessions.length?'Validate &amp; review':'Validate &amp; generate sessions'}</button>`:''}${transitions.map(([action,label])=>`<button type="button" class="pb-secondary cm-status-action${['archive','repeat'].includes(action)?' cm-primary-status':''}${action==='cancel'?' cm-cancel-action':''}" data-cm-action="${action}" data-cm-mutation>${label}</button>`).join('')}</div></header>${c.studioSetup?`<div class="cm-studio-setup" role="status"><p>${esc(c.studioSetup.message)}</p>${c.studioSetup.pending?'<button type="button" class="pb-secondary" data-cm-action="studio-resume" data-cm-mutation>Resume Studio setup</button>':''}</div>`:''}${state.tab==='details'?workflow():''}<div id="cm-panel" class="cm-tab-content">${state.tab==='details'?detailsTab():state.tab==='sessions'?sessionsTab():state.tab==='participants'?peopleTab():state.tab==='public-card'?publicCardTab():state.tab==='media'?mediaTab():state.tab==='enrolment'?'<section class="cm-coming-soon"><h3>Enrolment requests</h3><p>Coming soon</p></section>':reviewTab()}</div><footer class="cm-footer"><span>${state.tab==='participants'?'':c.courseId?`Course ID <span class="cm-id">${esc(c.courseId)}</span>`:'New draft'}</span><span>${c.completedAt?'Completed '+esc(c.completedAt.slice(0,10)):state.personDrafts.size?`${state.personDrafts.size} unsaved participant ${state.personDrafts.size===1?'change':'changes'}`:'All times use the Course timezone'}</span></footer>`;
    if(state.tab==='participants'&&c.courseId)(window.M4L_COURSE_PARTICIPANTS||window.M4L_STUDIO_ACCESS)?.attach($('cm-panel'),'COURSE:'+c.courseId,participantContext());
    if(state.tab==='media'&&c.courseId)window.M4L_COURSE_MEDIA?.open({hostId:'course-lesson-media',activityKey:'COURSE:'+c.courseId,courseName:d.name,current:()=>state.tab==='media'&&state.course?.courseId===c.courseId&&state.token===token()});

    if(state.busy)busy(true);
  }
  function dirty(){state.dirty=true;state.review=null;state.pending=null;for(const button of document.querySelectorAll('[data-cm-action=publish],[data-cm-action=accept]'))button.disabled=true;const indicator=$('course-editor').querySelector('.cm-heading-meta small');if(indicator)indicator.textContent='Unsaved changes';}
  async function list(){const result=await api(base+'list');Object.assign(state,{courses:result.courses,categories:result.categories,teachers:result.teachers,timezone:result.timezone,capabilities:result.capabilities});state.filters=currentFilters();$('course-new').hidden=!state.capabilities.create;renderList();}
  function rememberSelection(){
    const query=new URLSearchParams(location.search);
    if(state.course?.courseId){query.set('course',state.course.courseId);query.set('run',state.course.runId);query.set('tab',state.tab);}
    else{query.delete('course');query.delete('run');query.delete('tab');}
    if(state.tab==='sessions')query.set('view','scheduling');else query.delete('view');
    window.history?.replaceState(null,'',query.size?'?'+query:'/academy/courses/manage/');
  }
  function clearSelection(){
    state.selection++;Object.assign(state,{course:null,draft:null,cardDraft:null,dirty:false,tab:'list',review:null,calendarWarnings:[],media:[],participants:null,pending:null,peopleSearch:'',assignedOnly:false});state.personDrafts.clear();rememberSelection();renderEditor();
  }
  function filterCourses(){
    const next=currentFilters(),restore=filters=>{$('course-search').value=filters.search;$('course-status-filter').value=filters.status;};
    if(state.busy||state.pending){restore(state.filters);if(state.pending)tell('Finish or retry the pending Course change before changing this view.',true);return;}
    const hidesSelected=state.course?.courseId&&!visibleCourses(next).some(c=>c.courseId===state.course.courseId&&c.runId===state.course.runId);
    const apply=()=>{restore(next);state.filters=next;if(!state.course||hidesSelected)clearSelection();renderList();};
    if(hidesSelected&&hasUnsavedChanges()){restore(state.filters);reviewDiscard(apply);}else apply();
  }
  async function select(courseId,runId,tab='details'){
    const sequence=++state.selection,generation=state.generation;
    const result=await api(base+'get',{courseId,runId});
    if(sequence!==state.selection||generation!==state.generation)return;
    Object.assign(state,{course:result.course,draft:copy(result.course.details),cardDraft:copy(result.course.publicCard??null),dirty:false,tab:normalTab(tab),review:result.validation||null,calendarWarnings:result.calendarWarnings,media:result.media,participants:null});state.personDrafts.clear();rememberSelection();renderList();renderEditor();
    if(tab==='participants')await loadParticipants();
  }
  function participantContext(){const selection=state.selection,generation=state.generation,activity=state.course?.activityKey;return {selectionKey:selection,current:()=>state.selection===selection&&state.generation===generation&&state.course?.activityKey===activity&&state.tab==='participants'&&state.token===token()};}
  async function loadParticipants(){
    if(!state.course?.courseId)return;
    const sequence=state.selection;
    const owner=await (window.M4L_COURSE_PARTICIPANTS||window.M4L_STUDIO_ACCESS)?.ensure($('cm-panel'),'COURSE:'+state.course.courseId,participantContext());if(sequence!==state.selection)return;if(owner&&owner!=='ACADEMY'){state.participants={studio:true,accounts:[]};if(state.tab==='participants')renderEditor();return;}
    const result=await api(base+'participants',selected());
    if(sequence!==state.selection)return;
    state.participants=result;if(state.tab==='participants')renderEditor();
    const accountId=new URLSearchParams(location.search).get('account'),account=result.accounts.find(a=>a.accountId===accountId);
    if(account&&state.tab==='participants'){state.peopleSearch=account.displayName;renderEditor();}
  }
  async function open(){
    const generation=++state.generation,authToken=token();lock('Loading Course management…');$('course-access-retry').hidden=true;
    if(!authToken){lock('Sign in with an authorised Academy administrator account, then open Course management.');return;}
    try{
      const session=await api('/api/account/session',{},authToken);if(generation!==state.generation)return;
      const globalAdmin=session.contexts?.some(c=>c.scope==='PLATFORM'&&c.role==='GLOBAL_ADMIN');
      if(!globalAdmin&&!session.courseManagement){lock('Course management is available to Global Admins and assigned Course Program Admins.');return;}
      state.token=authToken;state.session=session;$('course-account-name').textContent=session.account?.displayName||'';$('course-access-message').textContent='';$('course-workspace').hidden=false;
      $('course-management-back').textContent=globalAdmin?'← Academy administration':'← My Courses';$('course-management-back').href=globalAdmin?'/academy/admin/#administration':'/academy/#workshops';
      await list();if(generation!==state.generation)return;
      const query=new URLSearchParams(location.search),courseId=query.get('course'),runId=query.get('run'),requested=courseId&&state.courses.find(c=>c.courseId===courseId&&(!runId||c.runId===runId));
      if(requested)await select(requested.courseId,requested.runId,tabs.some(([tab])=>tab===normalTab(query.get('tab')))?normalTab(query.get('tab')):'details');else renderEditor();
    }catch(error){if(generation!==state.generation)return;lock(error.message);$('course-access-retry').hidden=false;}
  }
  function beginNew(){
    dialog('New Course','<p>Start blank, or copy an existing Course into a separate editable draft.</p><label class="cm-field">Start from<select id="cm-copy-source"><option value="">Blank Course</option>'+state.courses.map((c,i)=>`<option value="${i+1}">${esc(c.name)} · ${esc(labels[c.stage]||c.stage)}${c.startDate?' · '+esc(c.startDate):''}</option>`).join('')+'</select></label><div id="cm-copy-options" hidden><label class="cm-field">New Course name<input id="cm-dialog-name" maxlength="160"></label><label class="cm-toggle"><input id="cm-copy-schedule" type="checkbox" checked>Copy timetable, dates, sessions and teacher selection</label><label class="cm-toggle"><input id="cm-copy-enrolments" type="checkbox">Copy learner enrolments</label><p>Course details, curriculum and public card are copied into an editable draft. Review its dates, sessions and learners before publishing. Academy-owned learner assignments can be copied. Studio-managed Courses start with an empty roster. Purchases are not copied; each paid Course requires its own purchase.</p></div>','Continue',async input=>{
      if(!input.source){newCourse();return;}
      const source=state.courses[Number(input.source)-1];if(!source)throw Error('Choose an existing Course.');if(!input.name.trim())throw Error('Enter the new Course name.');
      const current=await api(base+'get',{courseId:source.courseId,runId:source.runId});const result=await mutate('copy',{courseId:source.courseId,runId:source.runId,baseRevision:current.course.revision,name:input.name,copySchedule:input.copySchedule,copyTimetable:input.copySchedule,copyEnrollments:input.copyEnrollments,reuseMedia:false});
      $('course-search').value='';$('course-status-filter').value='AVAILABLE';await list();await select(result.courseId,result.runId);tell('Course copied as a new draft. Review its dates, sessions and learners before publishing.');
    });
    $('cm-copy-source').onchange=()=>{const source=state.courses[Number($('cm-copy-source').value)-1];$('cm-copy-options').hidden=!source;$('cm-dialog-name').value=source?source.name.slice(0,153)+' (copy)':'';};
  }
  function newCourse(){state.selection++;state.course={courseId:'',runId:'',stage:'DRAFT',displayStage:'DRAFT',revision:'0'};state.cardDraft=null;state.draft={name:'',categoryKey:'',accessModel:'PAID',timezone:state.timezone,weekdays:[],startDate:'',endDate:'',startTime:'',endTime:'',teacherId:'',zoomLink:'',sessions:[]};state.dirty=false;state.review=null;state.participants=null;state.personDrafts.clear();state.media=[];state.calendarWarnings=[];state.tab='details';rememberSelection();renderList();renderEditor();$('course-editor').querySelector('[data-field="name"]')?.focus();}
  async function save(){
    if(!state.draft.name.trim()){state.tab='details';renderEditor();$('course-editor').querySelector('[data-field="name"]')?.focus();throw Error('Enter a Course name to save the draft.');}
    for(const row of [state.draft,...state.draft.sessions])for(const key of ['startTime','endTime'])row[key]=window.M4L_TIME.parse(row[key])||row[key];
    const result=await mutate('save',{...selected(),baseRevision:state.course.revision,details:copy(state.draft)}),tab=state.tab;
    Object.assign(state.course,{courseId:result.courseId,runId:result.runId,revision:result.revision,hasDraft:true});state.dirty=false;
    // A draft save does not discard unsaved participant role selections.
    const personDrafts=new Map(state.personDrafts),cardDraft=cardDirty()?{draft:copy(state.cardDraft),saved:copy(state.course.publicCard??null),revision:state.course.publicCardRevision}:null;await list();await select(result.courseId,result.runId,tab);state.personDrafts=personDrafts;if(cardDraft){state.cardDraft=cardDraft.draft;state.course.publicCard=cardDraft.saved;state.course.publicCardRevision=cardDraft.revision;}renderEditor();return result;
  }
  async function validate(regenerate=false){
    if(state.personDrafts.size||cardDirty())throw Error('Save your participant and public card changes before validating the Course.');
    if(state.dirty||!state.course.courseId||!state.course.hasDraft)await save();
    let result;
    try{result=await mutate('validate',{...selected(),baseRevision:state.course.revision,regenerate});}
    catch(error){if(error.code!=='SCHEDULE_CHANGED')throw error;dialog('Regenerate the sessions?','<p>The schedule in Details has changed. Regenerating fills every session from that schedule and replaces individual session edits. Cancel to keep the existing sessions while you review the schedule.</p>','Regenerate sessions',()=>validate(true));return null;}
    state.course.revision=result.revision;state.course.validationToken=result.validation.valid?result.validation.token:'';state.course.acceptedToken='';state.draft=copy(result.details);state.dirty=false;state.review=result.validation;state.calendarWarnings=result.validation.warnings.filter(w=>w.code==='HOLIDAY');state.tab='details';renderEditor();document.getElementById(result.validation.valid?'cm-sessions':'cm-review')?.scrollIntoView?.({block:'start'});tell(result.message);return result;
  }
  function dialog(title,body,button,onConfirm){
    const el=$('course-dialog');el.innerHTML=`<h2 id="course-dialog-title">${esc(title)}</h2>${body}<div class="cm-actions"><button type="button" class="pb-secondary" data-dialog-cancel>Cancel</button><button type="button" data-dialog-confirm>${esc(button)}</button></div>`;
    el.querySelector('[data-dialog-cancel]').addEventListener('click',()=>el.close());
    el.querySelector('[data-dialog-confirm]').addEventListener('click',()=>{const input={name:el.querySelector('#cm-dialog-name')?.value||'',reuseMedia:Boolean(el.querySelector('#cm-dialog-reuse')?.checked),source:el.querySelector('#cm-copy-source')?.value||'',copySchedule:Boolean(el.querySelector('#cm-copy-schedule')?.checked),copyEnrollments:Boolean(el.querySelector('#cm-copy-enrolments')?.checked)};el.close();void perform(()=>onConfirm(input));});el.showModal();
  }
  function reviewDiscard(action){if(window.M4L_COURSE_MEDIA?.canLeave()===false)return;if(window.M4L_LESSON_MEDIA?.canLeave()===false)return;window.M4L_LESSON_MEDIA?.reset();if(!hasUnsavedChanges()){void perform(action);return;}dialog('Unsaved changes','<p>Discard your unfinished changes and continue? Saved Course and participant records will be kept.</p>','Discard changes',()=>{state.dirty=false;state.personDrafts.clear();state.cardDraft=copy(state.course?.publicCard??null);return action();});}
  async function generate(){
    if(state.draft.sessions.length)dialog('Replace the draft sessions?','<p>The Course schedule will be validated and sessions generated from its dates, days, times, teacher and Zoom link. Individual session edits will be replaced.</p>','Regenerate sessions',()=>validate(true));
    else await validate();
  }
  async function savePerson(accountId,feedback=true){
    const account=state.participants.accounts.find(a=>a.accountId===accountId),roles=state.personDrafts.get(accountId);if(!account||!roles)return;
    const result=await mutate('participants-save',{...selected(),accountId,roles,baseRevision:account.assignment.revision,scopeRevision:state.participants.scope.revision});account.assignment=result.assignment;state.personDrafts.delete(accountId);state.review=null;
    if(feedback){renderEditor();tell('Participant access saved.');}
  }
  async function saveParticipants(){
    const accounts=[...state.personDrafts.keys()];if(!accounts.length)return;
    let saved=0;
    try{
      // Use the existing guarded row saves sequentially. Stop on a failure and
      // retain remaining drafts and the pending retry identifier.
      for(const accountId of accounts){tell(`Saving participants · ${saved+1} of ${accounts.length}…`);await savePerson(accountId,false);saved++;}
      tell(`Participant changes saved for ${saved} ${saved===1?'user':'users'}.`);
    }catch(error){
      error.message=`${saved?`${saved} of ${accounts.length} users saved. `:''}${error.message} Remaining participant changes are kept.`;throw error;
    }finally{if(state.session&&state.course)renderEditor();}
  }
  async function status(stage){
    const result=await mutate('status',{...selected(),baseRevision:state.course.revision,stage}),selection=selected(),tab=stage==='DRAFT'?'details':state.tab;await list();await select(selection.courseId,selection.runId,tab);tell(result.message);
  }
  async function perform(fn){if(state.busy)return;busy(true);try{await fn();}catch(error){tell(error.message+(error.code==='ROW_CHANGED'?' Refresh and review the saved Course. Your unfinished changes are kept.':''),true);}finally{busy(false);if(state.participants)updateParticipantControls();}}
  async function listSetting(name,el){
    const courseId=el.dataset.course,runId=el.dataset.run,model=el.dataset.model;
    if(!state.courses.some(c=>c.courseId===courseId&&c.runId===runId))throw Error('Refresh the Course list before changing its settings.');
    if(window.M4L_STUDIO_ACCESS?.canLeave()===false)throw Error('Finish the learning-access change before selecting another Course.');
    await select(courseId,runId,'list');
    if(state.course?.courseId!==courseId||state.course?.runId!==runId||state.token!==token())return;
    if(name==='list-archive'){if(!['DRAFT','COMPLETE','CANCELLED'].includes(state.course.stage))throw Error('Archive is not available for this Course stage. Use its existing lifecycle controls.');await action('archive',el);return;}
    if(!['FREE','PAID'].includes(model))throw Error('Choose Free or Paid.');
    if(state.course.details.accessModel===model){tell('This Course is already '+(model==='FREE'?'Free.':'Paid.'));return;}
    if(state.course.studioManagedAccess){
      if(!window.M4L_STUDIO_ACCESS?.editCoursePolicy)throw Error('Reopen Course management to load the current access controls.');
      const modal=$('course-dialog'),host=document.createElement('section');host.className='cm-list-policy-editor';
      modal.innerHTML='<h2 id="course-dialog-title">Change Course access</h2><p>The owning access service checks this change. Existing purchases are retained.</p><div class="cm-actions"><button type="button" class="pb-secondary" data-list-policy-cancel>Cancel</button><button type="button" data-list-policy-save disabled>Save Course access</button></div>';
      modal.querySelector('.cm-actions').before(host);modal.showModal();
      let editor;
      const cancel=()=>{if(editor&&!editor.canLeave()){tell('Retry the pending access change before leaving this Course.',true);return false;}editor?.discard();modal.close();return true;};
      modal.querySelector('[data-list-policy-cancel]').onclick=cancel;
      modal.oncancel=event=>{if(!cancel())event.preventDefault();};
      try{editor=await window.M4L_STUDIO_ACCESS.editCoursePolicy(host,'COURSE:'+courseId,model,{current:()=>state.token===token()&&state.course?.courseId===courseId&&state.course?.runId===runId&&modal.open});}
      catch(error){modal.close();if([401,403].includes(error.status))lock(error.message);throw error;}
      if(!modal.open){editor.discard();return;}
      const confirm=modal.querySelector('[data-list-policy-save]');confirm.disabled=false;
      confirm.onclick=()=>void perform(async()=>{
        confirm.disabled=true;
        try{
          const policy=await editor.save();
          if(state.token!==token()||state.course?.courseId!==courseId||state.course?.runId!==runId)return;
          editor.discard();modal.close();await list();await select(courseId,runId,'list');tell('Course access saved as '+(policy.model==='FREE'?'Free.':'Paid.')+' Existing purchases are retained.');
        }catch(error){
          if([401,403].includes(error.status))lock(error.message);
          else if(['CHANGE_CONFLICT','ROW_CHANGED','RETRY_CONFLICT'].includes(error.code)){await list();await select(courseId,runId,'list');}
          throw error;
        }finally{if(modal.open)confirm.disabled=false;}
      });
      return;
    }
    if(!editable())throw Error('This Academy-owned Course needs an editable draft before changing Free or Paid. Open its existing Course controls.');
    dialog('Change draft access?',`<p>Save this Course draft as ${model==='FREE'?'Free':'Paid'}? Published timetable details, participants and media are retained. Draft settings take effect through the existing publication workflow.</p>`,'Save draft',async()=>{
      if(state.token!==token()||state.course?.courseId!==courseId||state.course?.runId!==runId)return;
      state.draft.accessModel=model;dirty();const result=await save();tell(result.message);
    });
  }
  async function action(name,el){
    if(window.M4L_COURSE_PARTICIPANTS?.canLeave()===false)throw Error('Finish or retry the Participants save before leaving these changes.');
    if(['list-policy','list-archive'].includes(name)){if(state.pending)throw Error('Finish or retry the pending Course save before changing its settings.');if(window.M4L_STUDIO_ACCESS?.canLeave()===false)throw Error('Finish the learning-access change first.');reviewDiscard(()=>listSetting(name,el));return;}
    if(name==='select'){if(window.M4L_STUDIO_ACCESS?.canLeave()===false)throw Error('Finish the learning-access change before selecting another Course.');const tab=!state.course&&new URLSearchParams(location.search).get('view')==='scheduling'?'sessions':'details';reviewDiscard(()=>select(el.dataset.course,el.dataset.run,tab));return;}
    if(name==='tab'){if(window.M4L_STUDIO_ACCESS?.canLeave()===false)throw Error('Finish the learning-access Save before leaving this tab.');if(state.tab==='media'&&(window.M4L_LESSON_MEDIA?.canLeave()===false||window.M4L_COURSE_MEDIA?.canLeave()===false))return;const nextTab=normalTab(el.dataset.tab);if(!tabs.some(([tab])=>tab===nextTab)||nextTab!=='list'&&!state.course||nextTab==='enrolment'&&!state.course?.courseId)return;if(!window.M4L_ENROLMENT_WORKSPACE.canLeave(enrolmentPanel))throw Error('Finish or retry the enrolment request change before leaving this tab.');state.tab=nextTab;rememberSelection();renderEditor();if(state.tab==='participants'&&!state.participants)await loadParticipants();if(['sessions','review'].includes(el.dataset.tab))document.getElementById('cm-'+el.dataset.tab)?.scrollIntoView?.({block:'start'});return;}
    if(name==='show-review'){state.tab='details';renderEditor();$('cm-review')?.scrollIntoView?.({block:'start'});return;}
    if(name==='save-card'){
      const result=await mutate('public-card-save',{...selected(),baseCardRevision:state.course.publicCardRevision,publicCard:copy(state.cardDraft)});Object.assign(state.course,{publicCard:result.publicCard,publicCardRevision:result.publicCardRevision});state.cardDraft=copy(result.publicCard);renderEditor();tell(result.message);return;
    }
    if(name==='discard-card'){state.cardDraft=copy(state.course.publicCard??null);renderEditor();return;}
    if(name==='save'){const result=await save();tell(result.message);return;}
    if(name==='validate'){await validate();return;}
    if(name==='accept'){
      if(state.dirty||!state.review?.valid)throw Error('Validate and review the saved sessions before accepting.');
      if(state.review.warnings.length&&!$('course-ack-warnings')?.checked)throw Error('Review and acknowledge the warnings before accepting.');
      const result=await mutate('accept',{...selected(),baseRevision:state.course.revision,validationToken:state.course.validationToken,acknowledgeWarnings:Boolean($('course-ack-warnings')?.checked)});state.course.revision=result.revision;state.course.acceptedToken=result.acceptedToken;renderEditor();tell(result.message);return;
    }
    if(name==='studio-resume'){if(state.dirty||state.personDrafts.size||cardDirty())throw Error('Save or discard your current edits before resuming Studio setup.');const result=await api(base+'studio-resume',selected());state.course.studioSetup=result.studioSetup;renderEditor();tell(result.studioSetup?.message||'No Studio setup is pending.');return;}
    if(name==='publish'){
      if(!reviewAccepted()||state.personDrafts.size||cardDirty())throw Error('Validate, review and accept the current saved sessions before publishing.');
      const result=await mutate('publish',{...selected(),baseRevision:state.course.revision,validationToken:state.course.validationToken,acknowledgeWarnings:Boolean($('course-ack-warnings')?.checked)}),selection=selected();await list();await select(selection.courseId,selection.runId,'sessions');tell(result.message);return;
    }
    if(name==='generate'){await generate();return;}
    if(name==='add-session'){state.draft.sessions.push({id:'CMSESSION-'+crypto.randomUUID(),date:state.draft.startDate,startTime:state.draft.startTime,endTime:state.draft.endTime,teacherId:state.draft.teacherId,zoomLink:state.draft.zoomLink,title:state.draft.name,status:'SCHEDULED'});dirty();renderEditor();return;}
    if(name==='remove-session'){state.draft.sessions=state.draft.sessions.filter(s=>s.id!==el.dataset.id);dirty();renderEditor();return;}
    if(name==='save-person'){await savePerson(el.dataset.account);return;}
    if(name==='save-participants'){await saveParticipants();return;}
    if(name==='add-user'){existingUsersDialog();return;}
    if(name==='repeat'){
      dialog('Repeat as a new Course','<p>A separate Course ID and an empty participant list will be created. Set new dates before publishing.</p><label class="cm-field">Course name<input id="cm-dialog-name" maxlength="160" value="'+esc(state.draft.name)+'"></label>'+(state.media.length?'<label class="cm-toggle"><input id="cm-dialog-reuse" type="checkbox">Reuse the existing media records</label>':'<p class="cm-hint">No existing media records to reuse.</p>'),'Create new draft',async input=>{const result=await mutate('repeat',{...selected(),baseRevision:state.course.revision,name:input.name,reuseMedia:input.reuseMedia});await list();await select(result.courseId,result.runId);tell(result.message);});return;
    }
    if(['revise','complete','cancel','archive'].includes(name)){
      if(hasUnsavedChanges())throw Error('Save or discard unfinished changes before changing Course status.');
      const target={revise:'DRAFT',complete:'COMPLETE',cancel:'CANCELLED',archive:'ARCHIVED'}[name];
      dialog({revise:'Create a revision?',complete:'Complete this Course?',cancel:'Cancel this Course?',archive:'Archive this Course?'}[name],`<p>${name==='revise'?'The current timetable remains published while you prepare and validate a new draft.':name==='complete'?'This records Course completion. Student assignments and media records are retained. Published lesson media remains available to assigned learners.':name==='cancel'?'The Course will be removed from the timetable. Participant and media records will be retained.':'The Course will be kept in the archive with its participants and media. Completed Course access is retained.'}</p>`,{revise:'Create revision',complete:'Mark complete',cancel:'Cancel Course',archive:'Archive Course'}[name],()=>status(target));
    }
  }
  function input(event){
    const el=event.target;
    if(el.dataset.cardField){state.cardDraft={time:'',title:'',description:'',...state.cardDraft,[el.dataset.cardField]:el.value};state.pending=null;publicCardControls();return;}
    if(el.dataset.field&&editable()){state.draft[el.dataset.field]=el.value;dirty();}
    if(el.dataset.day!==undefined&&editable()){const day=Number(el.dataset.day);state.draft.weekdays=state.draft.weekdays.filter(d=>d!==day);if(el.checked)state.draft.weekdays.push(day);dirty();}
    if(el.dataset.session&&editable()){const row=state.draft.sessions.find(s=>s.id===el.dataset.session);if(row){row[el.dataset.sessionField]=el.value;dirty();}}
    if(el.dataset.person){const account=state.participants.accounts.find(a=>a.accountId===el.dataset.person);let roles=[...(state.personDrafts.get(account.accountId)||account.assignment.roles)].filter(r=>r!==el.dataset.role);if(el.checked)roles.push(el.dataset.role);roles=['STUDENT','TEACHER','PROGRAM_ADMIN'].filter(r=>roles.includes(r));if(JSON.stringify(roles)===JSON.stringify(account.assignment.roles))state.personDrafts.delete(account.accountId);else state.personDrafts.set(account.accountId,roles);updateParticipantControls();}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $('course-tabs').addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||state.busy)return;
      const available=tabs.filter(([tab])=>tab==='list'||state.course&&(tab!=='enrolment'||state.course.courseId)).map(([tab])=>tab),index=available.indexOf(state.tab);
      const tab=event.key==='Home'?available[0]:event.key==='End'?available.at(-1):available[(index+(event.key==='ArrowRight'?1:-1)+available.length)%available.length];
      event.preventDefault();void perform(async()=>{await action('tab',{dataset:{tab}});$('cm-tab-'+tab)?.focus?.({preventScroll:true});});
    });
    $('course-access-retry').addEventListener('click',()=>{void open();});
    $('course-new').addEventListener('click',()=>reviewDiscard(beginNew));
    $('course-refresh').addEventListener('click',()=>reviewDiscard(async()=>{const current=selected(),tab=state.tab;await list();if(current.courseId&&visibleCourses().some(c=>c.courseId===current.courseId&&c.runId===current.runId))await select(current.courseId,current.runId,tab);else clearSelection();tell('Courses refreshed.');}));
    $('course-search').addEventListener('input',filterCourses);$('course-status-filter').addEventListener('change',filterCourses);
    document.addEventListener('click',event=>{const el=event.target.closest?.('[data-cm-action]');if(!el)return;event.preventDefault();if(state.busy)return;if(['select','list-policy','list-archive'].includes(el.dataset.cmAction)){void action(el.dataset.cmAction,el).catch(error=>tell(error.message,true));return;}void perform(()=>action(el.dataset.cmAction,el));});
    document.addEventListener('input',event=>{if(event.target.id==='course-people-search'){state.peopleSearch=event.target.value;const start=event.target.selectionStart;renderEditor();const search=$('course-people-search');search.focus();search.setSelectionRange(start,start);return;}if(event.target.type!=='checkbox'&&event.target.tagName!=='SELECT')input(event);});
    document.addEventListener('change',event=>{if(event.target.id==='course-assigned-only'){state.assignedOnly=event.target.checked;renderEditor();return;}if(event.target.type==='checkbox'||event.target.tagName==='SELECT'||event.target.hasAttribute?.('data-time24'))input(event);});
    void open();
  });
  function sessionChanged(){if(token()===state.token&&state.session)return;++state.generation;lock('Your Academy account changed. Return to Academy home and open Course management again.');}
  window.addEventListener('m4l-course-policy-saved',event=>{
    const {activityKey,coursePolicy}=event.detail||{};
    if(state.token!==token()||!state.course?.studioManagedAccess||state.course.activityKey!==activityKey||!['FREE','PAID'].includes(coursePolicy?.model))return;
    if(state.course.details.accessModel===coursePolicy.model&&state.draft?.accessModel===coursePolicy.model)return;
    state.course.details.accessModel=coursePolicy.model;if(state.draft)state.draft.accessModel=coursePolicy.model;state.review=null;state.course.acceptedToken=null;
    for(const course of state.courses)if(course.courseId===state.course.courseId)course.accessModel=coursePolicy.model;
    const control=document.querySelector('[data-field="accessModel"]');if(control)control.value=coursePolicy.model;renderList();
  });
  window.addEventListener('resize',revealTab);
  window.addEventListener('storage',e=>{if(e.key==='m4l_account_token'||e.key===null)sessionChanged();});window.addEventListener('m4l-academy-session',sessionChanged);
  window.addEventListener('pageshow',e=>{if(e.persisted){sessionChanged();if(state.session&&!hasUnsavedChanges())void open();}});
  window.addEventListener('beforeunload',e=>{if(hasUnsavedChanges()){e.preventDefault();e.returnValue='';}});
  window.M4LCourses={open,select,newCourse,save,validate,hasUnsavedChanges};
})();
