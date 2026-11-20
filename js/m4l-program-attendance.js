(()=>{'use strict';
  const v2=location.origin==='https://ummabbadacademy.app'&&document.querySelector('meta[name="uaa-auth-version"]')?.content==='2';let auth=null,optionsProof=null;const forms=new Map(),classRoots=new Map(),readRoots=[];
  const view=()=>window.M4L_ACADEMY_WORKSPACE?.current?.()||'TEACH';
  const nativeClient=async()=>{if(auth)return auth;auth=await window.M4L_ACADEMY_AUTH.ready;for(const id of ['pa-programs','pa-summary','pa-title']){const root=document.getElementById(id);if(root){auth.registerPrivateRoot(root);readRoots.push(root);}}return auth;};
  const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');
  const native=()=>window.M4L_CONFIG?.NATIVE_ATTENDANCE===true;
  const $=id=>document.getElementById(id);
  const embedded=$('pa-main')?.dataset?.embedded==='true';
  let hostedOptions=null;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const token=()=>v2?(window.M4L_ACADEMY_AUTH?.ownerKey()||''):localStorage.getItem('m4l_account_token')||'';
  const state={programs:[],id:'',accountPath:'',session:'',owner:'',data:null,busy:false,pending:null,stale:false,selection:new Map(),draft:new Map(),draftBase:new Map()};
  let generation=0;
  const current=run=>run===generation&&state.session===token();
  const pendingKey=()=>`m4l-program-attendance-pending:${window.M4L_ACADEMY_WORKSPACE?.current()||'TEACH'}:${native()?'NATIVE_V1':'v2'}:${state.owner}:${state.id}`;
  const message=(value,error=false)=>{$('pa-message').textContent=value;$('pa-message').classList.toggle('is-error',error);};
  const clearDraft=()=>{state.draft.clear();state.draftBase.clear();};
  const discard=()=>!state.draft.size||window.confirm('Discard your unsubmitted attendance changes?');
  async function api(path,body={}){
    const session=state.session;
    if(v2){const client=await nativeClient();if(path==='academy/attendance/get'||path==='academy/attendance/roster-get'){await client.prepareBusiness();if(!client.isCurrentResult(optionsProof)){optionsProof=await client.request('/api/academy/attendance/options',{}, {headers:{'X-Academy-Workspace':view()}});state.programs=(optionsProof.programs||[]).filter(row=>['GLOBAL_ADMIN','PROGRAM_ADMIN','ADMIN','TEACHER','SENIOR','SUBSTITUTE'].includes(row.role));nativeControls();if(!state.programs.some(row=>row.id===state.id))throw Error('This learning area is outside your current teaching access.');}}const result=await client.request('/api/'+path,body,{headers:{'X-Academy-Workspace':view()}});if(session!==token())throw Error('Your Academy account changed. Reload attendance.');if(path==='academy/attendance/options')optionsProof=result;return result;}
    if(!session)throw Error('Sign in to your Academy account first.');
    const response=await fetch(`${String(window.M4L_CONFIG?.API_BASE||'').replace(/\/$/,'')}/api/${path}`,{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session}`},body:JSON.stringify(body)});
    let result;try{result=await response.json();}catch{throw Error('The response could not be read. Retry the same submission.');}
    if(session!==token())throw Error('Your Academy account changed. Reload attendance.');
    if(!response.ok||!result.success)throw Object.assign(Error(result.error||'Attendance could not be saved.'),{status:response.status,retryable:result.retryable});
    return result;
  }
  const attendance=(action,body={})=>api(`${native()?'academy/attendance':'program-attendance'}/${action}`,{id:state.id,...(native()?{activityKey:state.programs.find(p=>p.id===state.id)?.activityKey}:{}),...body});
  const lessonName=row=>row.lesson.moduleName||row.lesson.subjectName||'Lesson';
  const rowsFor=classId=>{
    const rows=state.data?.lessons.filter(row=>row.lesson.classId===classId)||[];
    const selected=state.selection.get(classId)||'ALL';
    return selected==='ALL'?rows:rows.filter(row=>row.lesson.anchor===selected);
  };
  const markValue=(row,mark)=>state.draft.get(`${row.lesson.anchor}|${mark.accountId}`)||mark.status||'PRESENT';
  function classHTML(html){if(!v2){$('pa-classes').innerHTML=html;return;}const template=document.createElement('template');template.innerHTML=html;const nodes=[];for(const incoming of template.content.children){const id=incoming.dataset.nativeClass;if(!id){nodes.push(incoming);continue;}const existing=classRoots.get(id);if(existing){existing.innerHTML=incoming.innerHTML;nodes.push(existing);}else{classRoots.set(id,incoming);nodes.push(incoming);}}for(const [id,root]of classRoots)if(!nodes.includes(root)){forms.get(id)?.form.dispose();forms.delete(id);classRoots.delete(id);}$('pa-classes').replaceChildren(...nodes);}
  const classSnapshot=classId=>{const anchors=new Set(rowsFor(classId).map(row=>row.lesson.anchor));return {draft:[...state.draft].filter(([key])=>[...anchors].some(anchor=>key.startsWith(anchor+'|'))),base:[...state.draftBase].filter(([anchor])=>anchors.has(anchor)),selection:state.selection.get(classId)||'ALL'};};
  function classDirty(classId){const anchors=rowsFor(classId).map(row=>row.lesson.anchor);return [...state.draft.keys()].some(key=>anchors.some(anchor=>key.startsWith(anchor+'|')));}
  function applyClass(classId,snapshot){if(!snapshot||!Array.isArray(snapshot.draft)||!Array.isArray(snapshot.base))throw Error('The retained attendance grid is invalid.');const anchors=new Set(rowsFor(classId).map(row=>row.lesson.anchor));for(const key of [...state.draft.keys()])if([...anchors].some(anchor=>key.startsWith(anchor+'|')))state.draft.delete(key);for(const [key,value]of snapshot.draft)if([...anchors].some(anchor=>key.startsWith(anchor+'|'))&&['PRESENT','ABSENT'].includes(value))state.draft.set(key,value);for(const [anchor,value]of snapshot.base)if(anchors.has(anchor))state.draftBase.set(anchor,value);render();}
  function persistClass(classId){const entry=forms.get(classId);if(!entry)return;const snapshot=classSnapshot(classId),version=auth.getState().viewVersion;entry.checkpoint=entry.form.checkpoint(snapshot).catch(error=>{if(auth.getState().viewVersion!==version)return;classRoots.get(classId).inert=true;message(error.message,true);throw error;});entry.checkpoint.catch(()=>{});}
  async function prepareClasses(data,{restore=true}={}){const client=await nativeClient();for(const klass of data.classes||[]){const root=classRoots.get(klass.id),rows=rowsFor(klass.id);if(!root)continue;if(data.readOnly||!rows.some(row=>row.canSubmit)){client.registerPrivateRoot(root);client.revealResult(data,{roots:[root]});continue;}const choice=state.selection.get(klass.id)||'ALL',resource={type:'academy-attendance',activityKey:state.programs.find(row=>row.id===state.id).activityKey,date:data.date,classId:klass.id,workspace:view(),scope:choice==='ALL'?'day':'lesson',anchor:choice==='ALL'?null:choice},identity=JSON.stringify(resource);let entry=forms.get(klass.id);if(entry&&entry.identity!==identity){entry.form.dispose();forms.delete(klass.id);entry=null;}if(!entry){entry={identity,version:await digest([data.generation,data.date,rows.map(row=>[row.lesson.anchor,row.registerId])]),checkpoint:Promise.resolve()};const {createAcademyNativeForm}=await import('/js/m4l-v111-editor.mjs');entry.form=await createAcademyNativeForm({client,resource,capture:()=>classSnapshot(klass.id),baseVersion:()=>entry.version,isDirty:()=>classDirty(klass.id),applyRetained:snapshot=>applyClass(klass.id,snapshot),applyCurrent:async latest=>{entry.version=await digest([latest.generation,latest.date,latest.lessons.filter(row=>row.lesson.classId===klass.id).map(row=>[row.lesson.anchor,row.registerId])]);state.data=latest;for(const row of rowsFor(klass.id)){state.draftBase.delete(row.lesson.anchor);for(const key of [...state.draft.keys()])if(key.startsWith(row.lesson.anchor+'|'))state.draft.delete(key);}state.pending=null;render();client.revealResult(latest,{roots:readRoots});},readCurrent:()=>attendance('get',{date:data.date}),roots:[root],host:document.body,status:message});forms.set(klass.id,entry);}entry.version=await digest([data.generation,data.date,rows.map(row=>[row.lesson.anchor,row.registerId])]);await entry.form.open(data,{restore});}}
  async function saveV2(payload){const entry=forms.get(payload.classId);if(!entry){message('Prepare the protected attendance grid before submitting.',true);return;}const run=generation;let attempt;state.busy=true;render();try{await entry.checkpoint;attempt=await entry.form.beforeMutation({action:'submit',input:payload},{sensitive:view()==='ADMIN'});let result=await attendance('submit',payload);if(!current(run))return;result=await entry.form.completeNativeMutation(attempt,result,{operationId:payload.operationId});for(const anchor of Object.keys(payload.exceptions)){state.draftBase.delete(anchor);for(const key of [...state.draft.keys()])if(key.startsWith(anchor+'|'))state.draft.delete(key);}state.pending=null;await entry.form.saved();state.busy=false;await load(payload.date);message(`${result.submittedLessons} submitted, ${result.editedLessons||0} updated.`);}catch(error){if(!current(run))return;state.busy=false;if(attempt)await entry.form.unknown(attempt);message(error.message,true);}finally{if(current(run)){state.busy=false;render();}}}
  function render(){
    const locked=state.busy||Boolean(state.pending),program=state.programs.find(row=>row.id===state.id);
    const admin=['GLOBAL_ADMIN','PROGRAM_ADMIN','ADMIN'].includes(program?.role);
    if(!embedded){
      $('pa-account').hidden=!state.accountPath;$('pa-account').href=state.accountPath||'https://maktab4life.org/';
      $('pa-return').textContent=admin?'Back to Program management':'Back to Program';
      const hifz=state.id===window.M4L_CONFIG?.HIFZ_PROGRAM_ID;
      $('pa-return').href=state.id?(admin?`/programs/?program=${encodeURIComponent(state.id)}`:hifz?'/academy/#timetable/teach':`/academy/#activity/PROGRAM/${encodeURIComponent(state.id)}`):'https://maktab4life.org/';
      if(hifz&&!admin)$('pa-return').textContent='Back to TEACH';
      if(state.id)window.M4L_PROGRAM_MANAGEMENT_NAV?.select(state.id);
      $('pa-programs').innerHTML=state.programs.map(row=>`<button type="button" data-program="${esc(row.id)}" aria-pressed="${row.id===state.id}" ${locked?'disabled':''}>${esc(row.name)}</button>`).join('');
    }
    $('pa-pending').hidden=!state.pending;$('pa-retry').disabled=state.busy;
    $('pa-date').disabled=locked;$('pa-refresh').disabled=locked;
    const data=state.data;
    $('pa-workspace').hidden=!data;
    if(!data){$('pa-classes').innerHTML='';$('pa-summary').innerHTML='';if(!embedded)$('pa-title').textContent='Attendance';return;}
    if(!embedded)$('pa-title').textContent=`${data.program.name} attendance`;
    $('pa-date').max=data.today;$('pa-date').value=data.date;
    $('pa-prepare').hidden=data.prepared||!data.canPrepare;$('pa-prepare').disabled=locked;
    if(!data.prepared){$('pa-completion').textContent='Attendance storage needs preparation.';$('pa-classes').innerHTML='';$('pa-summary').innerHTML='';return;}
    $('pa-completion').textContent=data.scheduledLessons?
      `${data.submittedLessons} of ${data.scheduledLessons} class lesson registers submitted · ${data.complete?'Complete':'Incomplete'}`:
      'No published lessons scheduled for this date.';
    classHTML((data.classes||[]).map(klass=>{
      const rows=data.lessons.filter(row=>row.lesson.classId===klass.id),choice=state.selection.get(klass.id)||'ALL';
      const selected=choice==='ALL'?rows:rows.filter(row=>row.lesson.anchor===choice),learners=new Map();
      for(const row of selected)for(const mark of row.marks){
        if(!learners.has(mark.accountId))learners.set(mark.accountId,{name:mark.name,statuses:new Set()});
        learners.get(mark.accountId).statuses.add(markValue(row,mark));
      }
      const canSave=!data.readOnly&&selected.some(row=>native()?row.canSubmit:row.submitted||data.date===data.today);
      const options=[`<option value="ALL" ${choice==='ALL'?'selected':''}>All lessons</option>`,
        ...rows.map(row=>`<option value="${esc(row.lesson.anchor)}" ${choice===row.lesson.anchor?'selected':''}>${esc(lessonName(row))} · ${esc(row.lesson.startTime)}–${esc(row.lesson.endTime)}</option>`)].join('');
      const marks=[...learners].sort((a,b)=>a[1].name.localeCompare(b[1].name)).map(([accountId,learner])=>{
        const values=[...learner.statuses],value=values.length===1?values[0]:'MIXED';
        return `<li><strong>${esc(learner.name)}</strong><select data-mark data-class="${esc(klass.id)}" data-account="${esc(accountId)}" aria-label="${esc(learner.name)} attendance in ${esc(klass.name)}" ${locked||state.stale||!canSave?'disabled':''}>${value==='MIXED'?'<option value="MIXED" selected>Mixed · keep</option>':''}<option value="PRESENT" ${value==='PRESENT'?'selected':''}>Present</option><option value="ABSENT" ${value==='ABSENT'?'selected':''}>Absent</option>${native()?'':`<option value="EXCUSED" ${value==='EXCUSED'?'selected':''}>Excused</option>`}</select></li>`;
      }).join('');
      const status=selected.map(row=>`<span class="${row.submitted?'pa-submitted':'pa-unknown'}">${esc(lessonName(row))}: ${row.submitted?'Submitted':'Not submitted · unknown'}</span>`).join('');
      return `<section class="pa-class" data-native-class="${esc(klass.id)}"><h2>${esc(klass.name)}</h2>${klass.id==='COMBINED'?'<p class="pa-help">An earlier shared lesson submission, kept together for corrections.</p>':''}<label class="pa-lesson-label">Lesson<select data-lesson data-class="${esc(klass.id)}" ${locked||!rows.length?'disabled':''}>${options}</select></label><button class="pa-submit" data-submit="${esc(klass.id)}" type="button" ${locked||state.stale||!canSave?'disabled':''}>${selected.some(row=>row.submitted)?'Save changes':'Submit'}</button><p class="pa-register-state">${status||'No lessons scheduled for this class.'}</p><ul class="pa-learners">${marks||'<li class="pa-empty">No learners in this selection. Check class enrolments if learners are missing.</li>'}</ul></section>`;
    }).join('')||'<p class="pa-empty">No classes are assigned to you for this Program.</p>');
    $('pa-summary').innerHTML=data.learners.length?`<ul>${data.learners.map(row=>`<li><span>${esc(row.name)}</span><strong>${esc(row.status==='UNKNOWN'?'Unknown':row.status[0]+row.status.slice(1).toLowerCase())}</strong></li>`).join('')}</ul>`:'<p>No learners have a scheduled or submitted lesson in this view.</p>';
  }
  async function load(date){
    const run=generation;state.busy=true;message('Loading attendance…');render();
    try{
      const data=await attendance('get',date?{date}:{});
      if(!current(run))return false;
      if(!Array.isArray(data.classes))throw Error('Attendance is updating. Refresh in a moment.');
      for(const [classId,anchor] of state.selection)if(anchor!=='ALL'&&!data.lessons.some(row=>row.lesson.classId===classId&&row.lesson.anchor===anchor))state.selection.delete(classId);
      state.data=data;state.stale=false;if(v2){render();await prepareClasses(data);auth.revealResult(data,{roots:readRoots});}
      message(state.pending?'Retry the pending submission to confirm its saved result.':data.complete?'All visible class registers are submitted.':'Choose a lesson, mark exceptions, then submit attendance.');
      return true;
    }catch(error){if(current(run)){state.stale=true;message(error.message,true);}return false;}
    finally{if(current(run)){state.busy=false;render();}}
  }
  function restorePending(){
    if(v2){state.pending=null;return;}
    try{state.pending=JSON.parse(sessionStorage.getItem(pendingKey())||'null');}catch{state.pending=null;}
  }
  function chooseProgram(id){
    if(state.busy||state.pending||id===state.id||!state.programs.some(row=>row.id===id)||!discard())return;
    state.id=id;state.data=null;state.selection.clear();clearDraft();restorePending();
    if(!embedded)history.replaceState(null,'',`${location.pathname}?program=${encodeURIComponent(id)}`);
    window.dispatchEvent?.(new Event('m4l-program-selection'));
    render();if(native())nativeControls();void load(state.pending?.date);
  }
  function submission(classId){
    const rows=rowsFor(classId),selected=native()?rows.filter(row=>row.canSubmit):state.data.date===state.data.today?rows:rows.filter(row=>row.submitted);
    if(!selected.length)return null;
    const exceptions={},baseRegisterIds={};
    for(const row of selected){
      baseRegisterIds[row.lesson.anchor]=state.draftBase.get(row.lesson.anchor)??row.registerId??'';
      exceptions[row.lesson.anchor]=row.marks.flatMap(mark=>{
        const status=markValue(row,mark);return status==='PRESENT'?[]:[{accountId:mark.accountId,status}];
      });
    }
    const choice=state.selection.get(classId)||'ALL';
    return {...(native()?{generation:state.data.generation}:{}),date:state.data.date,classId,scope:choice==='ALL'?'day':'lesson',...(choice==='ALL'?{}:{anchor:choice}),
      exceptions,baseRegisterIds,operationId:crypto.randomUUID()};
  }
  async function save(payload){
    if(state.busy||!payload||state.pending&&payload!==state.pending)return;
    if(v2)return saveV2(payload);
    const run=generation;
    try{sessionStorage.setItem(pendingKey(),JSON.stringify(payload));}
    catch{message('This browser could not keep the retry details. Allow session storage and try again.',true);return;}
    state.pending=payload;state.busy=true;render();message('Submitting attendance…');
    try{
      const result=await attendance('submit',payload);
      if(!current(run))return;
      state.pending=null;sessionStorage.removeItem(pendingKey());
      for(const anchor of Object.keys(payload.exceptions)){
        state.draftBase.delete(anchor);
        for(const key of state.draft.keys())if(key.startsWith(`${anchor}|`))state.draft.delete(key);
      }
      const refreshed=await load(payload.date);
      if(current(run)&&refreshed)message(`${result.submittedLessons} submitted, ${result.editedLessons||0} updated.`);
    }catch(error){
      if(!current(run))return;
      if(error.status&&error.status<500&&error.retryable!==true){
        state.pending=null;sessionStorage.removeItem(pendingKey());
        // The server rejected this revision; do not silently refresh the base underneath a draft.
        state.stale=true;
      }
      message(error.message+(state.stale?' Refresh before submitting again.':''),true);
    }finally{if(current(run)){state.busy=false;render();}}
  }
  if(!embedded)$('pa-programs').addEventListener('click',event=>{const id=event.target.closest('[data-program]')?.dataset.program;if(id)chooseProgram(id);});
  $('pa-classes').addEventListener('change',event=>{
    if(state.busy||state.pending)return;
    if(event.target.matches('[data-lesson]')){state.selection.set(event.target.dataset.class,event.target.value);render();if(v2)void prepareClasses(state.data).catch(error=>message(error.message,true));return;}
    if(event.target.matches('[data-mark]')&&!state.stale&&['PRESENT','ABSENT','EXCUSED'].includes(event.target.value)){
      const classId=event.target.dataset.class,accountId=event.target.dataset.account;
      for(const row of rowsFor(classId))if(row.marks.some(mark=>mark.accountId===accountId)){
        if(!state.draftBase.has(row.lesson.anchor))state.draftBase.set(row.lesson.anchor,row.registerId||'');
        state.draft.set(`${row.lesson.anchor}|${accountId}`,event.target.value);
      }if(v2)persistClass(classId);
    }
  });
  $('pa-classes').addEventListener('click',event=>{const classId=event.target.closest('[data-submit]')?.dataset.submit;if(classId&&!state.busy&&!state.pending&&!state.stale&&state.data)void save(submission(classId));});
  $('pa-refresh').addEventListener('click',()=>{if(!state.busy&&!state.pending&&discard()){clearDraft();void(async()=>{await window.M4L_ACADEMY_WORKSPACE?.readyPublication(true);await load(state.data?.date);})();}});
  $('pa-date').addEventListener('change',event=>{
    if(state.busy||state.pending||!discard()){render();return;}
    const date=event.target.value;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>state.data.today){render();return;}
    clearDraft();state.selection.clear();state.data=null;void load(date);
  });
  $('pa-retry').addEventListener('click',()=>state.pending&&void save(state.pending));
  $('pa-prepare').addEventListener('click',async()=>{
    if(state.busy||state.pending)return;
    const run=generation;state.busy=true;render();
    try{await attendance('prepare');if(current(run))await load(state.data?.date);}
    catch(error){if(current(run))message(error.message,true);}
    finally{if(current(run)){state.busy=false;render();}}
  });
  function nativeControls(){
    let controls=$('pa-native-controls');if(!controls){controls=document.createElement('div');controls.id='pa-native-controls';controls.className='workspace-actions';$('pa-message').after(controls);}
    if(v2&&auth){if(!controls.dataset.v2Root){auth.registerPrivateRoot(controls);controls.dataset.v2Root='true';}if(auth.isCurrentResult(optionsProof))auth.revealResult(optionsProof,{roots:[controls]});}
    const selected=state.programs.find(p=>p.id===state.id),admin=window.M4L_ACADEMY_WORKSPACE?.current?.()==='ADMIN';
    controls.innerHTML=(hostedOptions?.admin?`<label>Learning area <select id="pa-native-area">${state.programs.map(p=>`<option value="${esc(p.id)}" ${p.id===state.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>`:'')+(admin?'<button type="button" id="pa-substitute" class="button secondary">Manage substitute</button>':'')+(admin&&selected?.kind==='COURSE'?'<button type="button" id="pa-delivery-roster" class="button secondary">Review delivery roster</button>':'');
    if($('pa-native-area'))$('pa-native-area').onchange=e=>chooseProgram(e.target.value);
    if($('pa-substitute'))$('pa-substitute').onclick=()=>adminDialog('substitute');
    if($('pa-delivery-roster'))$('pa-delivery-roster').onclick=()=>adminDialog('roster');
    $('pa-date-help').textContent='Everyone starts Present. Mark Absent exceptions, then submit. Attendance stays unknown until a register is submitted. Past first submissions require a reliable dated roster.';
  }
  async function adminDialog(kind){
    if(!state.data||state.busy||state.pending)return;
    const dialog=document.createElement('dialog');dialog.className='academy-dialog';document.body.append(dialog);let rosterForm=null,rosterCheckpoint=Promise.resolve(),manual=false,unregister=null;const client=v2?await nativeClient():null;if(v2&&kind!=='roster')unregister=client.registerPrivateRoot(dialog);
    const field=(name,label,type='text',value='')=>`<label>${esc(label)} <input name="${name}" type="${type}" value="${esc(value)}"></label>`;
    let roster=null;let runId=state.data.runs?.[0]?.id||'';
    const refresh=async()=>{
      rosterForm?.dispose();rosterForm=null;
      if(kind==='roster'){
        if(!runId)throw Error('This Course has no accepted delivery.');roster=await attendance('roster-get',{runId});
        const intervals=roster.intervals.filter(i=>i.state==='VALID');if(!intervals.length&&!roster.revision)intervals.push(...roster.prefill);
        dialog.innerHTML=`<form><h2>Review delivery roster</h2><label>Delivery <select name="run">${state.data.runs.map(r=>`<option value="${esc(r.id)}" ${r.id===runId?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label><p>Review each learner and their inclusive attendance dates. This changes attendance only. Recorded rosters remain preserved.</p><div data-intervals>${intervals.map(row=>intervalRow(row)).join('')}</div><button type="button" data-add>Add learner</button><p role="status"></p><button>Save reviewed roster</button><button type="button" data-close>Cancel</button></form>`;
        dialog.querySelector('[name=run]').onchange=async e=>{runId=e.target.value;try{await refresh();}catch(e){dialog.querySelector('[role=status]').textContent=e.message;}};
        dialog.querySelector('[data-add]').onclick=()=>dialog.querySelector('[data-intervals]').insertAdjacentHTML('beforeend',intervalRow({}));
      }else{
        dialog.innerHTML=`<form><h2>Manage substitute</h2><label>Session <select name="session">${state.data.lessons.map(r=>`<option value="${esc(r.lesson.stableKey)}">${esc(r.lesson.className||r.lesson.classNames?.join(', '))} · ${esc(lessonName(r))} · ${esc(r.lesson.startTime)}</option>`).join('')}</select></label>${field('accountLink','Substitute account link')}<p>The assignment permits only this session’s joining and attendance, with its recorded time limits.</p><div>${(state.data.substitutes||[]).filter(g=>!g.revoked).map(g=>`<p>${esc(g.name)} · First until ${esc(g.firstUntil)} <button type="button" data-revoke="${esc(g.id)}" data-revision="${g.revision}">Revoke</button><button type="button" data-reopen="${esc(g.id)}" data-revision="${g.revision}">Reopen corrections for 24 hours</button></p>`).join('')}</div><p role="status"></p><button>Assign substitute</button><button type="button" data-close>Cancel</button></form>`;
        for(const b of dialog.querySelectorAll('[data-revoke],[data-reopen]'))b.onclick=async()=>{try{if(v2)await client.prepareSensitive();await attendance(b.dataset.revoke?'substitute-revoke':'substitute-reopen',{generation:state.data.generation,assignmentId:b.dataset.revoke||b.dataset.reopen,revision:Number(b.dataset.revision),hours:24,operationId:crypto.randomUUID()});dialog.close();await load(state.data.date);}catch(e){dialog.querySelector('[role=status]').textContent=e.message;}};
      }
      if(v2&&kind==='roster'){const capture=()=>({runId,intervals:[...dialog.querySelectorAll('[data-interval]')].map(row=>({id:row.dataset.id||undefined,revision:Number(row.dataset.revision||0),accountId:row.dataset.account||undefined,accountLink:row.querySelector('[name=accountLink]').value,joinDate:row.querySelector('[name=joinDate]').value,leaveDate:row.querySelector('[name=leaveDate]').value,state:row.querySelector('[name=include]').checked?'VALID':'VOID'}))}),{createAcademyNativeForm}=await import('/js/m4l-v111-editor.mjs');let version=roster.revision||0;rosterForm=await createAcademyNativeForm({client,resource:{type:'academy-attendance-roster',activityKey:state.programs.find(p=>p.id===state.id).activityKey,runId,workspace:'ADMIN'},capture,baseVersion:()=>version,isDirty:()=>dialog.dataset.dirty==='true',applyRetained:saved=>{if(saved?.runId!==runId||!Array.isArray(saved.intervals))throw Error('The retained roster is invalid.');dialog.querySelector('[data-intervals]').innerHTML=saved.intervals.map(row=>intervalRow({...row,state:row.state})).join('');dialog.dataset.dirty='true';},applyCurrent:value=>{roster=value;version=value.revision||0;dialog.querySelector('[data-intervals]').innerHTML=value.intervals.filter(row=>row.state==='VALID').map(intervalRow).join('');dialog.dataset.dirty='false';},readCurrent:()=>attendance('roster-get',{runId}),roots:[dialog],host:document.body,status:message});dialog.oninput=()=>{dialog.dataset.dirty='true';rosterCheckpoint=rosterForm.checkpoint(capture());rosterCheckpoint.catch(error=>message(error.message,true));};dialog.onchange=event=>{if(event.target.name!=='run')dialog.oninput();};await rosterForm.open(roster);}else if(v2)client.revealResult(state.data,{roots:[dialog]});
      dialog.querySelector('[data-close]').onclick=()=>dialog.close();
      dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const submit=event.submitter;if(submit)submit.disabled=true;let attempt;try{
        if(v2){if(rosterForm){await rosterCheckpoint;attempt=await rosterForm.beforeMutation({action:'roster-save'},{sensitive:true});}else await client.prepareSensitive();}
        const input={generation:state.data.generation,operationId:crypto.randomUUID()};
        if(kind==='roster'){Object.assign(input,{runId,revision:roster.revision,prefillRevision:roster.prefillRevision,intervals:[...dialog.querySelectorAll('[data-interval]')].map(row=>({id:row.dataset.id||undefined,revision:Number(row.dataset.revision||0),accountId:row.dataset.account||undefined,accountLink:row.querySelector('[name=accountLink]').value,joinDate:row.querySelector('[name=joinDate]').value,leaveDate:row.querySelector('[name=leaveDate]').value,state:row.querySelector('[name=include]').checked?'VALID':'VOID'})).filter(r=>r.accountId||r.accountLink)});}else Object.assign(input,{date:state.data.date,stableKey:dialog.querySelector('[name=session]').value,accountLink:dialog.querySelector('[name=accountLink]').value});
        let result=await attendance(kind==='roster'?'roster-save':'substitute-save',input);if(attempt){result=await rosterForm.completeNativeMutation(attempt,result,{operationId:input.operationId});dialog.dataset.dirty='false';await rosterForm.saved();}dialog.close();await load(state.data.date);
      }catch(e){if(attempt){manual=true;dialog.close();await rosterForm.unknown(attempt);manual=false;if(dialog.isConnected)dialog.showModal();}dialog.querySelector('[role=status]').textContent=e.message+(v2&&!attempt?' Read current attendance before another deliberate change.':'');}finally{if(submit)submit.disabled=false;}};
    };
    function intervalRow(row){return `<fieldset data-interval data-id="${esc(row.id||'')}" data-revision="${row.revision||0}" data-account="${esc(row.accountId||'')}"><legend>${esc(row.name||'Learner')}</legend><label><input name="include" type="checkbox" ${row.state==='VOID'?'':'checked'}> Include</label>${field('accountLink',row.accountId?'Account link (optional)':'Account link')}${field('joinDate','Join date','date',row.joinDate||'')}${field('leaveDate','Leave date','date',row.leaveDate||'')}</fieldset>`;}
    dialog.onclose=()=>{if(manual)return;rosterForm?.dispose();unregister?.();dialog.remove();};try{await refresh();dialog.showModal();}catch(e){dialog.remove();message(e.message,true);}
  }
  async function initialise(options){
    if(v2){await nativeClient();await auth.prepareBusiness();for(const entry of forms.values())entry.form.dispose();forms.clear();}
    const run=++generation;
    state.session=token();state.id='';state.programs=[];state.accountPath='';state.data=null;state.pending=null;state.owner='';state.stale=false;state.busy=true;state.selection.clear();clearDraft();render();
    message(state.session?'Loading Programs…':'Sign in to your Academy account first.');
    if(!state.session){state.busy=false;render();return;}
    try{
      // A reload may retry only the submission belonging to this authenticated session.
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(state.session));
      if(!current(run))return;
      state.owner=[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
      const result=native()?await api('academy/attendance/options'):options?{programs:options.programs,store:'D1'}:await api('program-library/available');
      if(!current(run))return;
      state.programs=(result.programs||[]).filter(row=>['GLOBAL_ADMIN','PROGRAM_ADMIN','ADMIN','TEACHER','SENIOR','SUBSTITUTE'].includes(row.role)||result.store!=='D1'&&!row.role);
      state.accountPath=result.accountPath||'';
      if(!state.programs.length){message('No teaching Programs are available to your account.');return;}
      const requested=options?.id||new URLSearchParams(location.search).get('program');
      if(requested&&!state.programs.some(row=>row.id===requested)){message('This Program is unavailable to your account. Select one of your teaching Programs.',true);return;}
      state.id=requested||state.programs[0].id;restorePending();if(native())nativeControls();
      if(!embedded)history.replaceState(null,'',`${location.pathname}?program=${encodeURIComponent(state.id)}`);
      const loaded=await load(state.pending?.date||options?.date);
      if(loaded&&!state.pending&&options?.anchor){const row=state.data.lessons.find(row=>row.lesson.anchor===options.anchor);if(row)state.selection.set(row.lesson.classId,row.lesson.anchor);}
    }catch(error){if(current(run))message(error.message,true);}
    finally{if(current(run)){state.busy=false;render();}}
  }
  function reset(){
    for(const entry of forms.values())entry.form.dispose();forms.clear();
    generation++;hostedOptions=null;state.session=token();state.id='';state.programs=[];state.data=null;state.pending=null;state.busy=false;state.stale=false;state.selection.clear();clearDraft();render();message('');
  }
  window.M4L_PROGRAM_ATTENDANCE={
    open(options){
      hostedOptions=options;
      if(state.id===options.id&&state.session===token()&&(state.busy||state.pending||state.data&&(!options.date||options.date===state.data.date)))return;
      void initialise(options);
    },
    canLeave(){
      if(!hostedOptions)return true;
      if(state.busy||state.pending){message(state.pending?'Retry the pending submission before leaving Attendance.':'Wait for attendance to finish loading or saving.');return false;}
      return discard();
    },
    reset
  };
  window.addEventListener('beforeunload',event=>{if(state.draft.size||state.pending){event.preventDefault();event.returnValue='';}});
  const sessionChanged=()=>{if(v2&&state.session===token())return;return embedded?reset():void initialise();};
  if(!v2)window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)sessionChanged();});
  window.addEventListener('m4l-academy-session',sessionChanged);
  if(!v2)window.addEventListener('pageshow',event=>{if(event.persisted)sessionChanged();});
  if(v2)window.addEventListener('academy-v2-revalidate',()=>{if(!state.id)return;void (async()=>{for(const entry of forms.values())await entry.form.revalidate();if(!forms.size)await load(state.data?.date);})().catch(error=>message(error.message,true));});
  if(!embedded)void initialise();
})();
