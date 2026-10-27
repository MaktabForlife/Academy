/* Manual month grants and dated historical media. No billing or automatic enrolment. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const token=()=>localStorage.getItem('m4l_account_token')||'';
 let host=null,program='',owner='',generation=0,busy=false,mode='participants',data=null,search='',after='',month='',pending=null,historyRows=[],historyAfter=null,historicalDirty=false,historyRequest=null;
 const drafts=new Map();
 const monthLabel=value=>new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T12:00:00Z'));
 function message(text,error=false){const node=host?.querySelector('[data-pms-message]');if(node){node.textContent=text;node.setAttribute('role',error?'alert':'status');}}
 function canLeave(allowHistory=false){if(busy||pending||!allowHistory&&historyRequest){message('Finish or retry this save before leaving Monthly subscriptions.',true);return false;}if(drafts.size){message('Save or discard your month changes before leaving.',true);return false;}if(!allowHistory&&historicalDirty){message('Add or clear the unfinished historical lesson before leaving.',true);return false;}return window.M4L_LESSON_MEDIA?.canLeave?.()!==false;}
 async function api(action,input={},media=false){
  const current=owner,stamp=generation;
  const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+(media?'/api/academy/lesson-media/':'/api/admin/platform/program-monthly-subscriptions/')+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+current,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify({activityKey:'PROGRAM:'+program,...input})});
  const result=await response.json();if(stamp!==generation||current!==token())throw Error('Your account or Program changed. Reopen this register.');
  if(!response.ok||!result.success)throw Object.assign(Error(result.error||'Could not complete this change. Your draft is kept.'),{status:response.status,code:result.code});
  return result;
 }
 function shell(){
  if(host)return;
  const panel=document.getElementById('pg-people-tool');if(!panel)return;
  host=document.createElement('section');host.className='pms';host.innerHTML='<div class="pms-tabs" role="tablist" aria-label="Participants sections"><button type="button" role="tab" data-pms-tab="participants" aria-selected="true">Participants</button><button type="button" role="tab" data-pms-tab="monthly" aria-selected="false" hidden>Monthly subscriptions</button></div><div data-pms-panel hidden><h2>Monthly subscriptions</h2><p data-pms-message role="status" aria-live="polite"></p><div data-pms-content></div><div id="pms-media-editor" hidden></div></div>';
  host.addEventListener('keydown',event=>{if(!event.target.matches('[data-pms-tab]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...host.querySelectorAll('[data-pms-tab]')].filter(t=>!t.hidden),i=tabs.indexOf(event.target);event.preventDefault();tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length]?.focus();});
  panel.prepend(host);host.addEventListener('click',click);host.addEventListener('change',change);host.addEventListener('submit',submit);host.addEventListener('input',e=>{if(e.target.closest('[data-pms-history-form]'))historicalDirty=true;});host.addEventListener('reset',e=>{if(!e.target.matches('[data-pms-history-form]'))return;if(historyRequest){e.preventDefault();message('Retry the pending historical lesson before clearing it.',true);return;}historicalDirty=false;delete e.target.dataset.operation;});
 }
 function tabs(){
  const monthly=mode==='monthly';host.querySelector('[data-pms-panel]').hidden=!monthly;
  const people=document.getElementById('pm-main');if(people)people.hidden=monthly;
  for(const tab of host.querySelectorAll('[data-pms-tab]')){tab.setAttribute('aria-selected',String(tab.dataset.pmsTab===mode));tab.tabIndex=tab.dataset.pmsTab===mode?0:-1;}
 }
 async function select(id){
  shell();if(!host)return;if(program===id&&owner===token())return;
  generation++;program=id;owner=token();data=null;historyRows=[];drafts.clear();pending=null;busy=false;after='';search='';mode='participants';tabs();
  const stamp=generation;host.querySelector('[data-pms-tab="monthly"]').hidden=true;
  try{data=await api('get',{month});if(stamp!==generation)return;month=data.month||data.currentMonth||month;host.querySelector('[data-pms-tab="monthly"]').hidden=!data.available;render();if(data.available&&new URLSearchParams(location.search).get('participants')==='monthly'){mode='monthly';tabs();await history();}}catch(error){if(stamp===generation&&error.status!==503)message(error.message,true);}
 }
 async function load(){
  const stamp=generation;busy=true;message('Loading subscriptions…');
  try{data=await api('get',{month,search,after});if(stamp!==generation)return;drafts.clear();pending=null;render();message('');await history();}
  catch(error){if(stamp===generation){if(error.status&&error.status<500)historyRequest=null;message(error.message,true);const button=form.querySelector('[type=submit]');if(button&&historyRequest)button.textContent='Retry adding this lesson';}}finally{if(stamp===generation){busy=false;controls();}}
 }
 function controls(){for(const c of host?.querySelectorAll('[data-pms-content] button,[data-pms-content] input,[data-pms-content] select')||[])c.disabled=busy||Boolean(historyRequest&&c.closest('[data-pms-history-form]')&&c.type!=='submit');}
 const classOptions=ids=>(data?.classes||[]).map(c=>`<label><input type="checkbox" data-pms-class value="${esc(c.class_id)}"${ids.includes(c.class_id)?' checked':''}>${esc(c.name)}${c.active?'':' (historical)'}</label>`).join('');
 function render(){
  const content=host.querySelector('[data-pms-content]');if(!data?.available){content.replaceChildren();return;}
  if(!data.prepared){content.innerHTML=`<p>Prepare Tafseer’s register before entering paid months and earlier lessons. Preparation retains new recordings; it does not change student access yet.</p>${data.canConfigure?'<button type="button" data-pms-action="prepare">Prepare monthly register</button>':'<p>Ask Global Admin to prepare this register.</p>'}`;return;}
  content.innerHTML=`<p>${data.policy.enabled?'Monthly access is active. Students keep the months recorded here.':'Preparation mode: enter and review the historical paid months before activating protection.'} New Tafseer recordings are retained beyond 14 days.</p><div class="pms-toolbar"><label>Month and year<input type="month" data-pms-month value="${esc(month)}" required></label><label>Find or add an existing student<input type="search" data-pms-search value="${esc(search)}" maxlength="100" placeholder="Name or account ID"></label><button type="button" data-pms-action="search">Find</button><button type="button" data-pms-action="refresh">Refresh</button></div><p>Showing ${esc(monthLabel(month))}. Tick the paid students and choose the classes covered by that month. Searching with two or more characters also finds former students.</p><div class="pms-students">${data.students.map(row=>`<article data-pms-account="${esc(row.accountId)}"><h3>${esc(row.name)} <small>${esc(row.accountId)}${row.active?'':' · Inactive'}</small></h3><label class="pms-subscribed"><input type="checkbox" data-pms-field="subscribed"${row.subscribed?' checked':''}>Subscribed for ${esc(monthLabel(month))}</label><fieldset><legend>Covered classes</legend>${classOptions(row.classIds.length?row.classIds:row.suggestedClassIds.length?row.suggestedClassIds:data.classes.length===1?[data.classes[0].class_id]:[])}</fieldset><label>Payment date (optional)<input type="date" data-pms-field="paymentDate" value="${esc(row.paymentDate)}"></label><label>Payment reference (optional)<input data-pms-field="paymentReference" maxlength="100" value="${esc(row.paymentReference)}"></label><label>Note / reason for removing access<input data-pms-field="note" maxlength="500" value="${esc(row.note)}"></label>${row.updatedAt?`<small>Updated ${esc(row.updatedAt.slice(0,10))} · ${esc(row.updatedBy)}</small>`:''}</article>`).join('')||'<p>No matching students. Search by name to find an existing account.</p>'}</div><p data-pms-delta>No changes</p><div class="pms-toolbar"><button type="button" data-pms-action="review">Review & save changes</button><button type="button" data-pms-action="discard">Discard edits</button>${data.after?'<button type="button" data-pms-action="next">Next students</button>':''}${after?'<button type="button" data-pms-action="first">First page</button>':''}${data.canConfigure&&!data.policy.enabled?'<button type="button" data-pms-action="activate">Activate monthly access…</button>':''}</div><div data-pms-review></div><details class="pms-history"><summary>Earlier lessons and media · including 2024 / 2025</summary><p>Enter the original lesson date. It controls the paid month, even if the recording is uploaded years later. Create the entry, attach files, then publish it in the media editor. This does not create a live timetable lesson.</p><form data-pms-history-form><label>Original lesson date<input name="date" type="date" required></label><label>Lesson title<input name="title" maxlength="180" required></label><fieldset><legend>Lesson classes</legend>${classOptions(data.classes.length===1?[data.classes[0].class_id]:[])}</fieldset><button type="submit">Add historical lesson</button><button type="reset">Clear entry</button></form><p>Lessons in ${esc(monthLabel(month))}</p><div data-pms-history-list></div></details>`;
  controls();
 }
 function change(event){
  if(event.target.matches('[data-pms-month]')){const next=event.target.value;if(!canLeave()){event.target.value=month;return;}if(!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(next)){message('Choose a month and year.',true);return;}month=next;after='';void load();return;}
  const article=event.target.closest('[data-pms-account]');if(!article)return;
  const row=data.students.find(r=>r.accountId===article.dataset.pmsAccount),entry={accountId:row.accountId,revision:row.revision,classIds:[...article.querySelectorAll('[data-pms-class]:checked')].map(c=>c.value)};
  for(const control of article.querySelectorAll('[data-pms-field]'))entry[control.dataset.pmsField]=control.type==='checkbox'?control.checked:control.value;
  drafts.set(row.accountId,entry);host.querySelector('[data-pms-delta]').textContent=drafts.size+' edited student(s). Only these entries will change.';host.querySelector('[data-pms-review]').replaceChildren();
 }
 async function transact(action,input){
  if(busy)return;pending=pending||{action,input:{...input,policyRevision:data?.policy?.revision||0,operationId:crypto.randomUUID()}};busy=true;controls();message('Saving…');
  const stamp=generation;try{await api(pending.action,pending.input);if(stamp!==generation)return;drafts.clear();pending=null;busy=false;await load();message('Saved.');}
  catch(error){if(stamp!==generation)return;busy=false;if(error.status&&error.status<500)pending=null;controls();message(error.message,true);if(pending){const button=document.createElement('button');button.type='button';button.dataset.pmsAction='retry';button.textContent='Retry this save';host.querySelector('[data-pms-review]')?.append(button);}}
 }
 async function history(){
  if(!data?.prepared)return;const stamp=generation;
  try{const result=await api('list',{month,view:'admin'},true);if(stamp!==generation)return;historyRows=result.lessons;historyAfter=result.before;renderHistory();}catch(error){if(stamp===generation)message(error.message,true);}
 }
 function renderHistory(){const list=host.querySelector('[data-pms-history-list]');if(list)list.innerHTML=historyRows.map(r=>`<p><strong>${esc(r.date)} · ${esc(r.title)}</strong> <small>${esc(r.state)}</small> <button type="button" data-pms-edit="${esc(r.id)}">Attach / edit media</button></p>`).join('')+(historyAfter?'<button type="button" data-pms-action="earlier-lessons">More lessons in this month</button>':'');}
 async function click(event){
  const tab=event.target.closest('[data-pms-tab]');if(tab){if(tab.dataset.pmsTab===mode)return;if(!canLeave()||tab.dataset.pmsTab==='monthly'&&window.M4L_PROGRAM_PEOPLE?.canLeave()===false)return;mode=tab.dataset.pmsTab;tabs();if(mode==='monthly')await load();return;}
  const edit=event.target.closest('[data-pms-edit]');if(edit){if(!canLeave())return;await window.M4L_LESSON_MEDIA.manage({hostId:'pms-media-editor',activityKey:'PROGRAM:'+program,lessonId:edit.dataset.pmsEdit});return;}
  const action=event.target.closest('[data-pms-action]')?.dataset.pmsAction;if(!action||busy)return;
  if(action==='retry'){if(pending)await transact(pending.action,pending.input);return;}
  if(action==='discard'){if(pending){message('Retry the pending save before discarding.',true);return;}drafts.clear();render();return;}
  if(['review','save'].includes(action)&&(historicalDirty||historyRequest)){message('Add or clear the historical lesson before saving month changes.',true);return;}
  if(action==='review'){
   if(!drafts.size){message('No changes to save.');return;}
   const changes=[...drafts.values()],removals=changes.filter(e=>!e.subscribed&&data.students.find(r=>r.accountId===e.accountId)?.subscribed).length;
   host.querySelector('[data-pms-review]').innerHTML=`<p>Save ${changes.length} edited entries for <strong>${esc(monthLabel(month))}</strong>, including ${removals} removal(s)? Other students and months are untouched.</p><button type="button" data-pms-action="save">Save these changes</button>`;return;
  }
  if(action==='save'){await transact('save',{month,entries:[...drafts.values()]});return;}
  if(!canLeave())return;
  if(action==='prepare'){await transact('configure',{mode:'prepare'});return;}
  if(action==='activate'){if(window.confirm('Activate monthly protection for Tafseer? Confirm that you reviewed all historical paid months and retained existing recordings. Students without a recorded month will lose access to that month.'))await transact('configure',{mode:'activate',reviewed:true});return;}
  if(action==='search'){search=host.querySelector('[data-pms-search]').value.trim();after='';await load();}
  if(action==='refresh')await load();
  if(action==='next'){after=data.after;await load();}
  if(action==='first'){after='';await load();}
  if(action==='earlier-lessons'){try{const result=await api('list',{month,before:historyAfter,view:'admin'},true);historyRows.push(...result.lessons);historyAfter=result.before;renderHistory();}catch(error){message(error.message,true);}}
 }
 async function submit(event){
  const form=event.target.closest('[data-pms-history-form]');if(!form)return;event.preventDefault();if(!canLeave(true))return;
  const values=new FormData(form),date=values.get('date'),input=historyRequest||{date,title:values.get('title'),classIds:[...form.querySelectorAll('[data-pms-class]:checked')].map(c=>c.value),operationId:form.dataset.operation||crypto.randomUUID()};form.dataset.operation=input.operationId;historyRequest=input;
  busy=true;controls();message('Creating historical lesson…');const stamp=generation;
  try{const result=await api('historical-create',input,true);if(stamp!==generation)return;month=input.date.slice(0,7);historicalDirty=false;historyRequest=null;busy=false;await load();await window.M4L_LESSON_MEDIA.manage({hostId:'pms-media-editor',activityKey:'PROGRAM:'+program,lessonId:result.lessonId});}
  catch(error){if(stamp===generation){if(error.status&&error.status<500)historyRequest=null;message(error.message,true);const button=form.querySelector('[type=submit]');if(button&&historyRequest)button.textContent='Retry adding this lesson';}}finally{if(stamp===generation){busy=false;controls();}}
 }
 function reset(){generation++;owner='';program='';drafts.clear();pending=null;historicalDirty=false;historyRequest=null;busy=false;data=null;if(host){host.querySelector('[data-pms-content]').replaceChildren();host.querySelector('[data-pms-tab="monthly"]').hidden=true;mode='participants';tabs();}}
 window.M4L_PROGRAM_MONTHLY={select,canLeave,isOpen:()=>mode==='monthly',dirty:()=>drafts.size>0||Boolean(pending)||historicalDirty||Boolean(historyRequest)||busy};
 window.addEventListener('beforeunload',e=>{if(drafts.size||pending||historicalDirty||historyRequest||busy){e.preventDefault();e.returnValue='';}});
 window.addEventListener('m4l-academy-session',reset);window.addEventListener('m4l-academy-session-ended',reset);window.addEventListener('storage',e=>{if(e.key==='m4l_account_token'||e.key===null)reset();});
})();
