(()=>{'use strict';
  const $=id=>document.getElementById(id);
  const embedded=$('pa-main')?.dataset?.embedded==='true';
  let hostedOptions=null;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const token=()=>localStorage.getItem('m4l_account_token')||'';
  const state={programs:[],id:'',accountPath:'',session:'',owner:'',data:null,busy:false,pending:null,stale:false,selection:new Map(),draft:new Map(),draftBase:new Map()};
  let generation=0;
  const current=run=>run===generation&&state.session===token();
  const pendingKey=()=>`m4l-program-attendance-pending:v2:${state.owner}:${state.id}`;
  const message=(value,error=false)=>{$('pa-message').textContent=value;$('pa-message').classList.toggle('is-error',error);};
  const clearDraft=()=>{state.draft.clear();state.draftBase.clear();};
  const discard=()=>!state.draft.size||window.confirm('Discard your unsubmitted attendance changes?');
  async function api(path,body={}){
    const session=state.session;
    if(!session)throw Error('Sign in to your Academy account first.');
    const response=await fetch(`${String(window.M4L_CONFIG?.API_BASE||'').replace(/\/$/,'')}/api/${path}`,{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session}`},body:JSON.stringify(body)});
    let result;try{result=await response.json();}catch{throw Error('The response could not be read. Retry the same submission.');}
    if(session!==token())throw Error('Your Academy account changed. Reload attendance.');
    if(!response.ok||!result.success)throw Object.assign(Error(result.error||'Attendance could not be saved.'),{status:response.status,retryable:result.retryable});
    return result;
  }
  const attendance=(action,body={})=>api(`program-attendance/${action}`,{id:state.id,...body});
  const lessonName=row=>row.lesson.moduleName||row.lesson.subjectName||'Lesson';
  const rowsFor=classId=>{
    const rows=state.data?.lessons.filter(row=>row.lesson.classId===classId)||[];
    const selected=state.selection.get(classId)||'ALL';
    return selected==='ALL'?rows:rows.filter(row=>row.lesson.anchor===selected);
  };
  const markValue=(row,mark)=>state.draft.get(`${row.lesson.anchor}|${mark.accountId}`)||mark.status||'PRESENT';
  function render(){
    const locked=state.busy||Boolean(state.pending),program=state.programs.find(row=>row.id===state.id);
    const admin=['GLOBAL_ADMIN','PROGRAM_ADMIN','ADMIN'].includes(program?.role);
    if(!embedded){
      $('pa-account').hidden=!state.accountPath;$('pa-account').href=state.accountPath||'/academy/#overview';
      $('pa-return').textContent=admin?'Back to Program management':'Back to Program';
      const hifz=state.id===window.M4L_CONFIG?.HIFZ_PROGRAM_ID;
      $('pa-return').href=state.id?(admin?`/programs/?program=${encodeURIComponent(state.id)}`:hifz?'/academy/#timetable/teach':`/academy/#activity/PROGRAM/${encodeURIComponent(state.id)}`):'/academy/#overview';
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
    $('pa-classes').innerHTML=(data.classes||[]).map(klass=>{
      const rows=data.lessons.filter(row=>row.lesson.classId===klass.id),choice=state.selection.get(klass.id)||'ALL';
      const selected=choice==='ALL'?rows:rows.filter(row=>row.lesson.anchor===choice),learners=new Map();
      for(const row of selected)for(const mark of row.marks){
        if(!learners.has(mark.accountId))learners.set(mark.accountId,{name:mark.name,statuses:new Set()});
        learners.get(mark.accountId).statuses.add(markValue(row,mark));
      }
      const canSave=selected.some(row=>row.submitted||data.date===data.today);
      const options=[`<option value="ALL" ${choice==='ALL'?'selected':''}>All lessons</option>`,
        ...rows.map(row=>`<option value="${esc(row.lesson.anchor)}" ${choice===row.lesson.anchor?'selected':''}>${esc(lessonName(row))} · ${esc(row.lesson.startTime)}–${esc(row.lesson.endTime)}</option>`)].join('');
      const marks=[...learners].sort((a,b)=>a[1].name.localeCompare(b[1].name)).map(([accountId,learner])=>{
        const values=[...learner.statuses],value=values.length===1?values[0]:'MIXED';
        return `<li><strong>${esc(learner.name)}</strong><select data-mark data-class="${esc(klass.id)}" data-account="${esc(accountId)}" aria-label="${esc(learner.name)} attendance in ${esc(klass.name)}" ${locked||state.stale||!canSave?'disabled':''}>${value==='MIXED'?'<option value="MIXED" selected>Mixed · keep</option>':''}<option value="PRESENT" ${value==='PRESENT'?'selected':''}>Present</option><option value="ABSENT" ${value==='ABSENT'?'selected':''}>Absent</option><option value="EXCUSED" ${value==='EXCUSED'?'selected':''}>Excused</option></select></li>`;
      }).join('');
      const status=selected.map(row=>`<span class="${row.submitted?'pa-submitted':'pa-unknown'}">${esc(lessonName(row))}: ${row.submitted?'Submitted':'Not submitted · unknown'}</span>`).join('');
      return `<section class="pa-class"><h2>${esc(klass.name)}</h2>${klass.id==='COMBINED'?'<p class="pa-help">An earlier shared lesson submission, kept together for corrections.</p>':''}<label class="pa-lesson-label">Lesson<select data-lesson data-class="${esc(klass.id)}" ${locked||!rows.length?'disabled':''}>${options}</select></label><button class="pa-submit" data-submit="${esc(klass.id)}" type="button" ${locked||state.stale||!canSave?'disabled':''}>${selected.some(row=>row.submitted)?'Save changes':'Submit'}</button><p class="pa-register-state">${status||'No lessons scheduled for this class.'}</p><ul class="pa-learners">${marks||'<li class="pa-empty">No learners in this selection. Check class enrolments if learners are missing.</li>'}</ul></section>`;
    }).join('')||'<p class="pa-empty">No classes are assigned to you for this Program.</p>';
    $('pa-summary').innerHTML=data.learners.length?`<ul>${data.learners.map(row=>`<li><span>${esc(row.name)}</span><strong>${esc(row.status==='UNKNOWN'?'Unknown':row.status[0]+row.status.slice(1).toLowerCase())}</strong></li>`).join('')}</ul>`:'<p>No learners have a scheduled or submitted lesson in this view.</p>';
  }
  async function load(date){
    const run=generation;state.busy=true;message('Loading attendance…');render();
    try{
      const data=await attendance('get',date?{date}:{});
      if(!current(run))return false;
      if(!Array.isArray(data.classes))throw Error('Attendance is updating. Refresh in a moment.');
      for(const [classId,anchor] of state.selection)if(anchor!=='ALL'&&!data.lessons.some(row=>row.lesson.classId===classId&&row.lesson.anchor===anchor))state.selection.delete(classId);
      state.data=data;state.stale=false;
      message(state.pending?'Retry the pending submission to confirm its saved result.':data.complete?'All visible class registers are submitted.':'Choose a lesson, mark exceptions, then submit attendance.');
      return true;
    }catch(error){if(current(run)){state.stale=true;message(error.message,true);}return false;}
    finally{if(current(run)){state.busy=false;render();}}
  }
  function restorePending(){
    try{state.pending=JSON.parse(sessionStorage.getItem(pendingKey())||'null');}catch{state.pending=null;}
  }
  function chooseProgram(id){
    if(state.busy||state.pending||id===state.id||!state.programs.some(row=>row.id===id)||!discard())return;
    state.id=id;state.data=null;state.selection.clear();clearDraft();restorePending();
    history.replaceState(null,'',`${location.pathname}?program=${encodeURIComponent(id)}`);
    window.dispatchEvent?.(new Event('m4l-program-selection'));
    render();void load(state.pending?.date);
  }
  function submission(classId){
    const rows=rowsFor(classId),selected=state.data.date===state.data.today?rows:rows.filter(row=>row.submitted);
    if(!selected.length)return null;
    const exceptions={},baseRegisterIds={};
    for(const row of selected){
      baseRegisterIds[row.lesson.anchor]=state.draftBase.get(row.lesson.anchor)??row.registerId??'';
      exceptions[row.lesson.anchor]=row.marks.flatMap(mark=>{
        const status=markValue(row,mark);return status==='PRESENT'?[]:[{accountId:mark.accountId,status}];
      });
    }
    const choice=state.selection.get(classId)||'ALL';
    return {date:state.data.date,classId,scope:choice==='ALL'?'day':'lesson',...(choice==='ALL'?{}:{anchor:choice}),
      exceptions,baseRegisterIds,operationId:crypto.randomUUID()};
  }
  async function save(payload){
    if(state.busy||!payload||state.pending&&payload!==state.pending)return;
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
    if(event.target.matches('[data-lesson]')){state.selection.set(event.target.dataset.class,event.target.value);render();return;}
    if(event.target.matches('[data-mark]')&&!state.stale&&['PRESENT','ABSENT','EXCUSED'].includes(event.target.value)){
      const classId=event.target.dataset.class,accountId=event.target.dataset.account;
      for(const row of rowsFor(classId))if(row.marks.some(mark=>mark.accountId===accountId)){
        if(!state.draftBase.has(row.lesson.anchor))state.draftBase.set(row.lesson.anchor,row.registerId||'');
        state.draft.set(`${row.lesson.anchor}|${accountId}`,event.target.value);
      }
    }
  });
  $('pa-classes').addEventListener('click',event=>{const classId=event.target.closest('[data-submit]')?.dataset.submit;if(classId&&!state.busy&&!state.pending&&!state.stale&&state.data)void save(submission(classId));});
  $('pa-refresh').addEventListener('click',()=>{if(!state.busy&&!state.pending&&discard()){clearDraft();void load(state.data?.date);}});
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
  async function initialise(options){
    const run=++generation;
    state.session=token();state.id='';state.programs=[];state.accountPath='';state.data=null;state.pending=null;state.owner='';state.stale=false;state.busy=true;state.selection.clear();clearDraft();render();
    message(state.session?'Loading Programs…':'Sign in to your Academy account first.');
    if(!state.session){state.busy=false;render();return;}
    try{
      // A reload may retry only the submission belonging to this authenticated session.
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(state.session));
      if(!current(run))return;
      state.owner=[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
      const result=options?{programs:options.programs,store:'D1'}:await api('program-library/available');
      if(!current(run))return;
      state.programs=(result.programs||[]).filter(row=>['GLOBAL_ADMIN','PROGRAM_ADMIN','ADMIN','TEACHER','SENIOR'].includes(row.role)||result.store!=='D1'&&!row.role);
      state.accountPath=result.accountPath||'';
      if(!state.programs.length){message('No teaching Programs are available to your account.');return;}
      const requested=options?.id||new URLSearchParams(location.search).get('program');
      if(requested&&!state.programs.some(row=>row.id===requested)){message('This Program is unavailable to your account. Select one of your teaching Programs.',true);return;}
      state.id=requested||state.programs[0].id;restorePending();
      if(!embedded)history.replaceState(null,'',`${location.pathname}?program=${encodeURIComponent(state.id)}`);
      await load(state.pending?.date);
    }catch(error){if(current(run))message(error.message,true);}
    finally{if(current(run)){state.busy=false;render();}}
  }
  function reset(){
    generation++;hostedOptions=null;state.session=token();state.id='';state.programs=[];state.data=null;state.pending=null;state.busy=false;state.stale=false;state.selection.clear();clearDraft();render();message('');
  }
  window.M4L_PROGRAM_ATTENDANCE={
    open(options){
      hostedOptions=options;
      if(state.id===options.id&&state.session===token()&&(state.data||state.busy||state.pending))return;
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
  const sessionChanged=()=>embedded?reset():void initialise();
  window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)sessionChanged();});
  window.addEventListener('m4l-academy-session',sessionChanged);
  window.addEventListener('pageshow',event=>{if(event.persisted)sessionChanged();});
  if(!embedded)void initialise();
})();
