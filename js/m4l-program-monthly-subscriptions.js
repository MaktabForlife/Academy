/* Manual paid-month grid and dated historical media. No automatic billing. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const token=()=>localStorage.getItem('m4l_account_token')||'';
 const years=[2024,2025,2026],shortMonths=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 const expanded=new Set(),drafts=new Map(),students=new Map();
 let host=null,program='',owner='',generation=0,request=0,busy=false,mode='participants',data=null,search='',draftRevision=null,pending=null;
 let month='',historyRows=[],historyAfter=null,historicalDirty=false,historyRequest=null,historySequence=0;
 const key=(account,m)=>JSON.stringify([account,m]);
 const monthLabel=value=>new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T12:00:00Z'));
 const monthsIn=year=>shortMonths.map((_,i)=>year+'-'+String(i+1).padStart(2,'0'));
 const savedCell=(row,m)=>row.months[m]||{subscribed:false,revision:0,classIds:[]};
 const cell=(row,m)=>drafts.get(key(row.accountId,m))||savedCell(row,m);
 function message(text,error=false){const node=host?.querySelector('[data-pms-message]');if(node){node.textContent=text;node.setAttribute('role',error?'alert':'status');}}
 function canBrowse(allowHistory=false){
  if(busy||pending||!allowHistory&&historyRequest){message('Finish or retry this save before continuing.',true);return false;}
  if(!allowHistory&&historicalDirty){message('Add or clear the unfinished historical lesson before continuing.',true);return false;}
  return window.M4L_LESSON_MEDIA?.canLeave?.()!==false;
 }
 function canLeave(allowHistory=false){if(!canBrowse(allowHistory))return false;if(drafts.size){message('Save or discard your month changes before leaving.',true);return false;}return true;}
 async function api(action,input={},media=false){
  const current=owner,stamp=generation;
  const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+(media?'/api/academy/lesson-media/':'/api/admin/platform/program-monthly-subscriptions/')+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+current,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify({activityKey:'PROGRAM:'+program,...input})});
  const result=await response.json();if(stamp!==generation||current!==token())throw Error('Your account or Program changed. Reopen this register.');
  if(!response.ok||!result.success)throw Object.assign(Error(result.error||'Could not complete this change. Your draft is kept.'),{status:response.status,code:result.code});
  return result;
 }
 function shell(){
  if(host)return;const panel=document.getElementById('pg-people-tool');if(!panel)return;
  host=document.createElement('section');host.className='pms';
  host.innerHTML='<div class="pms-tabs" role="tablist" aria-label="Participants sections"><button type="button" role="tab" data-pms-tab="participants" aria-selected="true">Participants</button><button type="button" role="tab" data-pms-tab="monthly" aria-selected="false" hidden>Monthly subscriptions</button></div><div data-pms-panel hidden><h2>Monthly subscriptions</h2><p data-pms-message role="status" aria-live="polite"></p><div data-pms-content></div><div id="pms-media-editor" hidden></div></div>';
  panel.prepend(host);host.addEventListener('click',click);host.addEventListener('change',change);host.addEventListener('submit',submit);
  host.addEventListener('keydown',event=>{
   if(!event.target.matches('[data-pms-tab]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   const tabs=[...host.querySelectorAll('[data-pms-tab]')].filter(t=>!t.hidden),i=tabs.indexOf(event.target);event.preventDefault();
   tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length]?.focus();
  });
  host.addEventListener('input',e=>{if(e.target.closest('[data-pms-history-form]'))historicalDirty=true;});
  host.addEventListener('reset',e=>{if(!e.target.matches('[data-pms-history-form]'))return;if(historyRequest){e.preventDefault();message('Retry the pending historical lesson before clearing it.',true);return;}historicalDirty=false;delete e.target.dataset.operation;});
  host.addEventListener('toggle',e=>{if(e.target.matches('.pms-history')&&e.target.open)void history();},true);
 }
 function tabs(){
  const monthly=mode==='monthly';host.querySelector('[data-pms-panel]').hidden=!monthly;
  const people=document.getElementById('pm-main');if(people)people.hidden=monthly;
  for(const tab of host.querySelectorAll('[data-pms-tab]')){tab.setAttribute('aria-selected',String(tab.dataset.pmsTab===mode));tab.tabIndex=tab.dataset.pmsTab===mode?0:-1;}
 }
 async function select(id){
  shell();if(!host)return;if(program===id&&owner===token())return;
  reset();program=id;owner=token();const stamp=generation;
  try{await load();if(stamp!==generation)return;if(data?.available&&new URLSearchParams(location.search).get('participants')==='monthly'){mode='monthly';tabs();}}
  catch(error){if(stamp===generation)message(error.message,true);}
 }
 async function load(more=false){
  const stamp=generation,sequence=++request;busy=true;controls();message('Loading subscriptions…');
  try{
   const result=await api('grid',{years,search,...(more?{after:data.after}:{})});if(stamp!==generation||sequence!==request)return;
   const rows=more?[...(data?.students||[]),...(result.students||[])]:result.students||[];
   data={...result,students:[...new Map(rows.map(r=>[r.accountId,r])).values()]};for(const row of data.students)students.set(row.accountId,row);
   month=month||data.currentMonth||'2026-10';host.querySelector('[data-pms-tab="monthly"]').hidden=!data.available;
   render();message(drafts.size&&draftRevision!==data.policy?.revision?'The saved register changed while you were editing. Your draft is kept; save it or discard it before refreshing.':'',Boolean(drafts.size&&draftRevision!==data.policy?.revision));
  }catch(error){if(stamp===generation&&sequence===request)message(error.message,true);}
  finally{if(stamp===generation&&sequence===request){busy=false;controls();}}
 }
 function controls(){
  for(const c of host?.querySelectorAll('[data-pms-content] button,[data-pms-content] input,[data-pms-content] select,[data-pms-content] textarea')||[]){
   c.disabled=busy||Boolean(c.dataset.pmsInactive==='true')||Boolean(historyRequest&&c.closest('[data-pms-history-form]')&&c.type!=='submit')||Boolean(pending&&c.dataset.pmsAction!=='retry');
  }
 }
 const classOptions=ids=>(data?.classes||[]).map(c=>'<label><input type="checkbox" data-pms-class value="'+esc(c.class_id)+'"'+(ids.includes(c.class_id)?' checked':'')+'>'+esc(c.name)+(c.active?'':' (historical)')+'</label>').join('');
 function render(){
  const content=host.querySelector('[data-pms-content]');if(!data?.available){content.replaceChildren();return;}
  if(!data.prepared){content.innerHTML='<p>Prepare Tafseer’s register before entering paid months and earlier lessons. Preparation retains new recordings; it does not change student access yet.</p>'+(data.canConfigure?'<button type="button" data-pms-action="prepare">Prepare monthly register</button>':'<p>Ask Global Admin to prepare this register.</p>')+'<div data-pms-review></div>';return;}
  content.innerHTML='<p>'+(data.policy.enabled?'Students keep access to the lesson months checked here, including recordings added later.':'Preparation mode: enter and review paid months before activating monthly access.')+'</p>'+
   '<div class="pms-grid-toolbar"><form data-pms-search-form class="pms-search"><label>Find a student<input type="search" data-pms-search value="'+esc(search)+'" maxlength="100" placeholder="Name or account ID"></label><button type="submit">Find</button></form><div class="pms-toolbar"><button type="button" data-pms-action="save">Save changes</button><button type="button" data-pms-action="discard">Discard edits</button><button type="button" data-pms-action="refresh">Refresh</button></div></div>'+
   '<p class="pms-grid-help">Click a year to show its months. Tick paid months for any students, then save all your changes together. Student names stay on the left as you scroll.</p>'+
   '<div data-pms-grid></div><div class="pms-grid-footer"><p data-pms-delta aria-live="polite"></p><p>'+data.students.length+' student(s) shown'+(data.after?' · more available':'')+'</p>'+(data.after?'<button type="button" data-pms-action="more">Load more students</button>':'')+'</div><div data-pms-review></div>'+
   (data.canConfigure&&!data.policy.enabled?'<p><button type="button" data-pms-action="activate">Activate monthly access…</button></p>':'')+
   '<details class="pms-history"><summary>Earlier lessons and media · including 2024 / 2025</summary><p>Use the original lesson date: it determines the paid month even when media is added later. Tafseer recordings are retained beyond 14 days.</p><form data-pms-history-form><label>Original lesson date<input name="date" type="date" required></label><label>Lesson title<input name="title" maxlength="180" required></label><fieldset><legend>Lesson classes</legend>'+classOptions(data.classes.length===1?[data.classes[0].class_id]:[])+'</fieldset><button type="submit">Add historical lesson</button><button type="reset">Clear entry</button></form><label>Browse lesson media<input type="month" data-pms-history-month value="'+esc(month)+'" required></label><div data-pms-history-list></div></details>';
  renderGrid();renderHistory();controls();
 }
 function renderGrid(focusKey){
  const slot=host.querySelector('[data-pms-grid]');if(!slot)return;
  const old=slot.querySelector('.pms-grid-wrap'),left=old?.scrollLeft||0,top=old?.scrollTop||0;
  const head=years.map(y=>'<th scope="colgroup" colspan="'+(expanded.has(y)?12:1)+'"><button type="button" data-pms-year="'+y+'" aria-expanded="'+expanded.has(y)+'" aria-label="'+(expanded.has(y)?'Collapse ':'Expand ')+y+'"><span aria-hidden="true">'+(expanded.has(y)?'▾':'▸')+'</span> '+y+'</button></th>').join('');
  const monthHeads=years.map(y=>expanded.has(y)?shortMonths.map((m,i)=>'<th scope="col" aria-label="'+esc(monthLabel(monthsIn(y)[i]))+'">'+m+'</th>').join(''):'<th scope="col" class="pms-year-summary">Paid months</th>').join('');
  const rows=data.students.map(row=>'<tr><th scope="row" class="pms-student"><strong>'+esc(row.name)+'</strong><small>'+esc(row.accountId)+(row.active?'':' · Inactive')+'</small></th>'+years.map(y=>{
   if(!expanded.has(y)){const count=monthsIn(y).filter(m=>cell(row,m).subscribed).length;return '<td class="pms-year-summary">'+(count?count+' / 12':'—')+'</td>';}
   return monthsIn(y).map(m=>{
    const value=cell(row,m),edited=drafts.has(key(row.accountId,m)),inactive=!row.active&&!savedCell(row,m).subscribed;
    return '<td class="pms-month-cell'+(edited?' pms-edited':'')+'"><label><span class="pms-visually-hidden">'+esc(row.name)+' · '+esc(monthLabel(m))+'</span><input type="checkbox" data-pms-cell data-account="'+esc(row.accountId)+'" data-month="'+m+'" data-pms-inactive="'+inactive+'"'+(value.subscribed?' checked':'')+'></label></td>';
   }).join('');
  }).join('')+'</tr>').join('');
  const columns=1+years.reduce((n,y)=>n+(expanded.has(y)?12:1),0);
  slot.innerHTML='<div class="pms-grid-wrap" tabindex="0" role="region" aria-label="Tafseer paid months"><table class="pms-grid"><caption class="pms-visually-hidden">Tafseer students and subscribed months, 2024 to 2026</caption><thead><tr><th scope="col" rowspan="2" class="pms-student">Student</th>'+head+'</tr><tr>'+monthHeads+'</tr></thead><tbody>'+(rows||'<tr><td colspan="'+columns+'">No matching Tafseer students.</td></tr>')+'</tbody></table></div>';
  const wrap=slot.querySelector('.pms-grid-wrap');wrap.scrollLeft=left;wrap.scrollTop=top;
  if(focusKey){for(const control of slot.querySelectorAll('[data-pms-cell]'))if(key(control.dataset.account,control.dataset.month)===focusKey){control.focus?.({preventScroll:true});break;}}
  delta();controls();
 }
 function delta(){const node=host.querySelector('[data-pms-delta]');if(node)node.textContent=drafts.size?drafts.size+' unsaved month change(s)'+([...drafts.values()].some(e=>!data.students.some(r=>r.accountId===e.accountId))?', including students outside this search':''):'No unsaved changes';}
 function change(event){
  const control=event.target;
  if(control.matches('[data-pms-history-month]')){const next=control.value;if(!canLeave()){control.value=month;return;}if(!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(next)){message('Choose a month and year.',true);return;}month=next;historyRows=[];void history();return;}
  if(!control.matches('[data-pms-cell]')||busy||pending)return;
  const row=students.get(control.dataset.account),m=control.dataset.month,k=key(row.accountId,m),saved=savedCell(row,m),draft=drafts.get(k);
  const original=draft?.wasSubscribed??saved.subscribed;
  if(control.checked===original)drafts.delete(k);
  else{if(!drafts.size)draftRevision=data.policy.revision;drafts.set(k,{accountId:row.accountId,month:m,subscribed:control.checked,revision:draft?.revision??saved.revision,classIds:draft?.classIds??(saved.classIds.length?saved.classIds:row.suggestedClassIds[m]||[]),wasSubscribed:original});}
  if(!drafts.size)draftRevision=null;host.querySelector('[data-pms-review]').replaceChildren();renderGrid(k);
 }
 const saveInput=()=>({entries:[...drafts.values()].map(({wasSubscribed,...entry})=>entry),removalReason:host.querySelector('[data-pms-removal-reason]')?.value.trim()||''});
 function review(){
  if(!drafts.size){message('No changes to save.');return;}if(!canBrowse())return;
  const entries=[...drafts.values()],removals=entries.filter(e=>e.wasSubscribed&&!e.subscribed),unclear=entries.filter(e=>e.subscribed&&!e.classIds.length);
  if(!removals.length&&!unclear.length){void transact('grid-save',saveInput());return;}
  host.querySelector('[data-pms-review]').innerHTML='<p>Save '+entries.length+' month change(s).</p>'+(removals.length?'<label>Reason for removing '+removals.length+' paid month(s)<textarea data-pms-removal-reason maxlength="500" required></textarea></label>':'')+unclear.map(e=>'<fieldset data-pms-coverage-key="'+esc(key(e.accountId,e.month))+'"><legend>Classes for '+esc(students.get(e.accountId).name)+' · '+esc(monthLabel(e.month))+'</legend>'+classOptions(e.classIds)+'</fieldset>').join('')+'<button type="button" data-pms-action="confirm-save">Save these changes</button>';
 }
 async function transact(action,input){
  if(busy)return;pending=pending||{action,input:{...input,policyRevision:draftRevision??data?.policy?.revision??0,operationId:crypto.randomUUID()}};
  busy=true;controls();message('Saving…');const stamp=generation;
  try{await api(pending.action,pending.input);if(stamp!==generation)return;drafts.clear();draftRevision=null;pending=null;busy=false;await load();message('Saved.');}
  catch(error){if(stamp!==generation)return;busy=false;if(error.status&&error.status<500)pending=null;message(error.message,true);if(pending){const button=document.createElement('button');button.type='button';button.dataset.pmsAction='retry';button.textContent='Retry this save';host.querySelector('[data-pms-review]')?.append(button);}controls();}
 }
 async function history(){
  if(!data?.prepared)return;const stamp=generation,sequence=++historySequence;
  try{const result=await api('list',{month,view:'admin'},true);if(stamp!==generation||sequence!==historySequence)return;historyRows=result.lessons;historyAfter=result.before;renderHistory();}catch(error){if(stamp===generation&&sequence===historySequence)message(error.message,true);}
 }
 function renderHistory(){
  const list=host.querySelector('[data-pms-history-list]');if(list)list.innerHTML=historyRows.map(r=>'<p><strong>'+esc(r.date)+' · '+esc(r.title)+'</strong> <small>'+esc(r.state)+'</small> <button type="button" data-pms-edit="'+esc(r.id)+'">Attach / edit media</button></p>').join('')+(historyAfter?'<button type="button" data-pms-action="earlier-lessons">More lessons in this month</button>':'');
 }
 async function click(event){
  const tab=event.target.closest('[data-pms-tab]');if(tab){if(tab.dataset.pmsTab===mode)return;if(!canLeave()||tab.dataset.pmsTab==='monthly'&&window.M4L_PROGRAM_PEOPLE?.canLeave()===false)return;mode=tab.dataset.pmsTab;tabs();if(mode==='monthly')await load();return;}
  const year=event.target.closest('[data-pms-year]');if(year){if(busy||pending)return;const y=Number(year.dataset.pmsYear);expanded.has(y)?expanded.delete(y):expanded.add(y);renderGrid();host.querySelector('[data-pms-year="'+y+'"]')?.focus?.({preventScroll:true});return;}
  const edit=event.target.closest('[data-pms-edit]');if(edit){if(!canLeave())return;await window.M4L_LESSON_MEDIA.manage({hostId:'pms-media-editor',activityKey:'PROGRAM:'+program,lessonId:edit.dataset.pmsEdit});return;}
  const action=event.target.closest('[data-pms-action]')?.dataset.pmsAction;if(!action||busy)return;
  if(action==='retry'){if(pending)await transact(pending.action,pending.input);return;}
  if(action==='discard'){if(pending){message('Retry the pending save before discarding.',true);return;}drafts.clear();draftRevision=null;host.querySelector('[data-pms-review]').replaceChildren();renderGrid();message('Edits discarded.');return;}
  if(action==='save'){review();return;}
  if(action==='confirm-save'){
   if(!canBrowse())return;
   for(const group of host.querySelectorAll('[data-pms-coverage-key]')){const entry=drafts.get(group.dataset.pmsCoverageKey);if(entry)entry.classIds=[...group.querySelectorAll('[data-pms-class]:checked')].map(c=>c.value);}
   const input=saveInput();if(input.entries.some(e=>e.subscribed&&!e.classIds.length)){message('Choose the classes covered by each paid month.',true);return;}
   if([...drafts.values()].some(e=>e.wasSubscribed&&!e.subscribed)&&!input.removalReason){message('Enter a reason for removing paid months.',true);return;}await transact('grid-save',input);return;
  }
  if(action==='more'){if(canBrowse())await load(true);return;}
  if(!canLeave())return;
  if(action==='prepare'){await transact('configure',{mode:'prepare'});return;}
  if(action==='activate'){if(window.confirm('Activate monthly protection for Tafseer? Confirm that you reviewed all historical paid months and retained existing recordings. Students without a recorded month will lose access to that month.'))await transact('configure',{mode:'activate',reviewed:true});return;}
  if(action==='refresh')await load();
  if(action==='earlier-lessons'){const stamp=generation;try{const result=await api('list',{month,before:historyAfter,view:'admin'},true);if(stamp!==generation)return;historyRows.push(...result.lessons);historyAfter=result.before;renderHistory();}catch(error){if(stamp===generation)message(error.message,true);}}
 }
 async function submit(event){
  if(event.target.matches('[data-pms-search-form]')){event.preventDefault();if(!canBrowse())return;search=host.querySelector('[data-pms-search]').value.trim();await load();return;}
  const form=event.target.closest('[data-pms-history-form]');if(!form)return;event.preventDefault();if(!canLeave(true))return;
  const values=new FormData(form),input=historyRequest||{date:values.get('date'),title:values.get('title'),classIds:[...form.querySelectorAll('[data-pms-class]:checked')].map(c=>c.value),operationId:form.dataset.operation||crypto.randomUUID()};
  form.dataset.operation=input.operationId;historyRequest=input;busy=true;controls();message('Creating historical lesson…');const stamp=generation;
  try{
   const result=await api('historical-create',input,true);if(stamp!==generation)return;month=input.date.slice(0,7);historicalDirty=false;historyRequest=null;busy=false;delete form.dataset.operation;
   form.reset?.();form.querySelector('[type=submit]').textContent='Add historical lesson';host.querySelector('[data-pms-history-month]').value=month;await history();await window.M4L_LESSON_MEDIA.manage({hostId:'pms-media-editor',activityKey:'PROGRAM:'+program,lessonId:result.lessonId});
  }catch(error){if(stamp===generation){if(error.status&&error.status<500)historyRequest=null;message(error.message,true);const button=form.querySelector('[type=submit]');if(button&&historyRequest)button.textContent='Retry adding this lesson';}}
  finally{if(stamp===generation){busy=false;controls();}}
 }
 function reset(){
  generation++;request++;historySequence++;owner='';program='';drafts.clear();students.clear();expanded.clear();pending=null;draftRevision=null;historicalDirty=false;historyRequest=null;busy=false;data=null;search='';month='';historyRows=[];historyAfter=null;
  if(host){host.querySelector('[data-pms-content]').replaceChildren();host.querySelector('[data-pms-tab="monthly"]').hidden=true;mode='participants';tabs();}
 }
 window.M4L_PROGRAM_MONTHLY={select,canLeave,isOpen:()=>mode==='monthly',dirty:()=>drafts.size>0||Boolean(pending)||historicalDirty||Boolean(historyRequest)||busy};
 window.addEventListener('beforeunload',e=>{if(drafts.size||pending||historicalDirty||historyRequest||busy){e.preventDefault();e.returnValue='';}});
 window.addEventListener('m4l-academy-session',reset);window.addEventListener('m4l-academy-session-ended',reset);window.addEventListener('storage',e=>{if(e.key==='m4l_account_token'||e.key===null)reset();});
})();
