/* Academy Admin owns this screen; its server routes access to the current owner. */
(() => {
 'use strict';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const panels=new Map(),cache=new Map(),pending=new Map();let owner='';
 function reset(){for(const p of panels.values())p.root.remove();panels.clear();cache.clear();pending.clear();owner='';}
 function canLeave(){return ![...panels.values()].some(p=>p.dirty||p.liveDirty||p.livePending||p.pending||p.job||p.busy);}
 async function api(activityKey,command){
  const token=localStorage.getItem('m4l_account_token');if(!token)throw Error('Sign in to Academy to manage access.');
  const key=JSON.stringify([token,activityKey,command]);if(pending.has(key))return pending.get(key);
  const promise=(async()=>{const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/admin/platform/studio-access',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify({activityKey,command})});
   const result=await response.json();if(token!==localStorage.getItem('m4l_account_token')){reset();throw Error('Your account changed. Reopen access management.');}if(!response.ok||!result.success)throw Object.assign(Error(result.error||'The access change could not be confirmed.'),{status:response.status,code:result.code});return result;
  })().finally(()=>pending.delete(key));pending.set(key,promise);return promise;
 }
 function attach(host,activityKey){
  if(!host||!activityKey)return;const token=localStorage.getItem('m4l_account_token')||'';if(token!==owner){reset();owner=token;}
  let p=panels.get(activityKey);if(!p){const root=document.createElement('section');root.className='studio-access';root.setAttribute('aria-label','Learning access');p={root,activityKey,after:'',accountId:null,data:null,dirty:false,busy:false,pending:null};panels.set(activityKey,p);root.addEventListener('click',e=>click(p,e));root.addEventListener('submit',e=>e.preventDefault());root.addEventListener('change',e=>{if(e.target.name==='enrolled'&&!e.target.checked){const live=e.target.form?.elements.live;if(live)live.checked=false;}if(e.target.closest('[data-access-live]'))p.liveDirty=true;else if(e.target.closest('[data-access-person],[data-access-new]'))p.dirty=true;});root.addEventListener('input',e=>{if(e.target.closest('[data-access-live]'))p.liveDirty=true;else if(e.target.closest('[data-access-person],[data-access-new]'))p.dirty=true;});}
  host.append(p.root);if(!p.data&&!p.busy)p.loading=load(p);else if(!p.dirty&&!p.liveDirty&&!p.pending&&!p.livePending&&!p.job)render(p);return p;
 }
 function tell(p,message){p.root.querySelector('[data-access-status]')?.replaceChildren(document.createTextNode(message));}
 function deny(p){p.root.replaceChildren(document.createTextNode('Your Academy session or access changed. Reopen Academy Admin to continue.'));p.data=null;p.pending=null;p.livePending=null;p.job=null;p.dirty=false;p.liveDirty=false;cache.clear();}
 async function perform(p,fn){if(p.busy)return;p.busy=true;for(const node of p.root.querySelectorAll('input,select,button'))if(!node.disabled){node.dataset.accessTemporaryLock='';node.disabled=true;}try{await fn();}catch(error){if([401,403].includes(error.status)){deny(p);}else tell(p,error.message);}finally{p.busy=false;for(const node of p.root.querySelectorAll('[data-access-temporary-lock]')){node.disabled=Boolean((p.pending||p.livePending)&&node.matches('input,select'));delete node.dataset.accessTemporaryLock;}}}
 async function load(p,{refresh=false}={}){
  p.busy=true;const selection=JSON.stringify([p.after,p.accountId]),saved=cache.get(p.activityKey+selection);
  if(!p.data)p.root.innerHTML='<h3>Learning access</h3><p data-access-status role="status">Loading access…</p>';
  try{const data=await api(p.activityKey,{action:'read',after:p.after,...(p.accountId?{accountId:p.accountId}:{}),...(!refresh&&saved?{known:{revision:saved.revision,after:p.after,accountId:p.accountId}}:{})});
   if(selection!==JSON.stringify([p.after,p.accountId])||owner!==localStorage.getItem('m4l_account_token'))return;
   p.data=data.notModified?{...saved,...(data.liveAllocation?{liveAllocation:data.liveAllocation}:{})}:data;if(!data.notModified)cache.set(p.activityKey+selection,data);p.dirty=false;p.liveDirty=false;p.liveWindow=null;render(p);
   if(p.data.ownership?.authority==='WEBSITE')for(const child of p.root.parentElement?.children||[])if(child!==p.root)child.hidden=true;
  }catch(error){if([401,403].includes(error.status)){deny(p);return;}tell(p,error.code==='STUDIO_SCOPE_UNMAPPED'?'This programme continues to use Academy access controls.':error.message);if(error.status===404)p.root.hidden=true;}
  finally{p.busy=false;}
 }
 const checked=value=>value?' checked':'';
 function render(p){
  const d=p.data;if(!d)return;const editable=d.ownership?.authority==='WEBSITE'&&d.ownership?.phase==='COMMITTED',person=d.person;
  p.root.innerHTML=`<header><h3>Learning access</h3><button type="button" data-access-action="refresh">Refresh records</button><button type="button" data-access-action="reopen">Discard edits and reopen</button></header><p>${editable?'Manage participation and acquired learning materials here.':'Access is currently managed by the existing Academy controls. This view is read only until the offering is handed over.'} Accounts, PINs, suspension, class memberships and timetable details remain in their existing Academy screens.</p><p role="status" aria-live="polite" data-access-status></p>
  <div class="studio-access-tools"><label>Academy account ID <input data-access-find maxlength="180" value="${esc(p.accountId||'')}"></label><button type="button" data-access-action="find">Find account</button><button type="button" data-access-action="first">First page</button>${d.more?'<button type="button" data-access-action="next">Next 25</button>':''}${editable?'<button type="button" data-access-action="new">Add learner</button>':''}</div>
  <div class="studio-access-scroll"><table><thead><tr><th>User</th><th>Participation</th><th>Purchase</th><th>Staff</th><th></th></tr></thead><tbody>${d.participants.map(a=>`<tr><td>${esc(a.display_name)}<small>${esc(a.account_id)}</small>${!a.active||!a.admitted?'<small>Account blocked in Academy</small>':''}</td><td>${a.enrolled?'Enrolled':'Former / materials only'}</td><td>${a.purchased?'Whole Course retained':'—'}</td><td>${esc(a.role||'—')}</td><td><button type="button" data-access-action="person" data-account="${esc(a.account_id)}">Open</button></td></tr>`).join('')||'<tr><td colspan="5">No participants on this page.</td></tr>'}</tbody></table></div>
  ${(d.pendingJobs||[]).map(j=>`<p>Pending enrolment: ${esc(j.state)} <button type="button" data-access-action="resume" data-job="${esc(j.operation_id)}">Resume enrolment</button></p>`).join('')}
  ${person?`<form data-access-person><h4>${esc(person.display_name)}</h4><fieldset${editable?'':' disabled'}><legend>Participation and materials</legend><label><input type="checkbox" name="enrolled"${checked(person.enrolled)}> Enrolled</label><label><input type="checkbox" name="live"${checked(person.live)}> Current live participation</label>${d.kind==='COURSE'?`<label><input type="checkbox" name="purchased"${checked(person.purchased)}> Whole-Course purchase, including recordings and PDFs</label>`:''}<p>Leaving the programme keeps acquired materials. Removing a purchase or paid month requires a reason. Live entry still checks the current class, dates and session window.</p>
  ${d.kind==='TAFSEER'?`<h4>Paid months and original class</h4><div class="studio-access-scroll"><table data-access-months><thead><tr><th>Paid</th><th>Month</th><th>Original class / cohort</th></tr></thead><tbody>${person.months.map(m=>`<tr data-month="${esc(m.month)}" data-cohort="${esc(m.cohort)}" data-original="true"><td><input type="checkbox" data-paid checked aria-label="Paid ${esc(m.month)} ${esc(m.cohort)}"></td><td>${esc(m.month)}</td><td>${esc(m.cohort)}</td></tr>`).join('')}</tbody></table></div><div class="studio-access-tools"><label>Month <input type="month" data-new-month></label><label>Original class / cohort <input data-new-cohort maxlength="180"></label><button type="button" data-access-action="month">Add paid month</button></div><h4>Additional Surah websites</h4><p>These grants include the website and its website files. They never grant lesson recordings.</p>${d.websites.map(w=>`<label><input type="checkbox" data-grant="${esc(w.website_id)}"${checked(person.grants.some(g=>g.website_id===w.website_id))}> ${esc(w.title)}${w.enabled?'':' (withdrawn)'}</label>`).join('')}`:''}
  ${d.canChangeStaff?`<label>Staff role <select name="staff"><option value="">No scoped staff role</option><option value="TEACHER"${person.role==='TEACHER'?' selected':''}>Teacher</option><option value="ADMIN"${person.role==='ADMIN'?' selected':''}>Programme / Course Admin</option></select></label><label><input type="checkbox" name="createAccount"${checked(person.can_create_account)}> May create Academy accounts</label>`:''}
  <label>Reason for changes <input name="reason" maxlength="500"></label><button type="button" data-access-action="save">Save access changes</button></fieldset></form>`:''}${person&&d.liveAllocation?liveForm(p):''}`;
  p.root.hidden=false;
 }
 async function click(p,event){
  const b=event.target.closest('[data-access-action]');if(!b||p.busy)return;const action=b.dataset.accessAction;
  if(!['save','month','new','resume','provision','reopen','live-save'].includes(action)&&(p.dirty||p.liveDirty)){tell(p,'Save or reopen the current account before leaving these edits.');return;}
  await perform(p,async()=>{
   if(action==='person'||action==='find'){p.accountId=action==='person'?b.dataset.account:p.root.querySelector('[data-access-find]').value.trim();await load(p);}
   if(action==='refresh'){await load(p,{refresh:true});}
   if(action==='reopen'){if(p.pending||p.livePending)throw Error('Confirm the pending Save by retrying it before discarding edits.');p.dirty=false;p.liveDirty=false;await load(p,{refresh:true});}
   if(action==='first'||action==='next'){p.after=action==='next'?p.data.next:'';p.accountId=null;await load(p);}
   if(action==='month'){
    const month=p.root.querySelector('[data-new-month]').value,cohort=p.root.querySelector('[data-new-cohort]').value.trim();if(!month||!cohort)throw Error('Choose the paid month and original class or cohort.');
    if([...p.root.querySelectorAll('[data-month]')].some(r=>r.dataset.month===month&&r.dataset.cohort===cohort))throw Error('That month and cohort is already listed.');
    const row=document.createElement('tr');row.dataset.month=month;row.dataset.cohort=cohort;row.dataset.original='false';row.innerHTML=`<td><input type="checkbox" data-paid checked aria-label="Paid ${esc(month)} ${esc(cohort)}"></td><td>${esc(month)}</td><td>${esc(cohort)}</td>`;p.root.querySelector('[data-access-months] tbody').append(row);p.dirty=true;
   }
   if(action==='save'){if(p.liveDirty)throw Error('Save or discard the class allocation first.');await save(p);}
   if(action==='live-edit'){p.liveWindow=p.data.liveAllocation.windows.find(w=>w.enrollment_id===b.dataset.window)||null;render(p);}
   if(action==='live-save')await saveLive(p);
   if(action==='new')newLearner(p);
   if(action==='provision')await provision(p);
   if(action==='resume'){if(b.dataset.job)p.job={operationId:b.dataset.job};await resume(p);}
  });
 }
 function liveForm(p){
  const {classes,windows}=p.data.liveAllocation,w=p.liveWindow;
  return `<form data-access-live><h4>Live class allocation</h4><p>Academy manages the class and dates. Save learning access before assigning a new learner. This does not grant recordings or paid months.</p><table><thead><tr><th>Class</th><th>From</th><th>Through</th><th></th></tr></thead><tbody>${windows.map(row=>`<tr><td>${esc(classes.find(c=>c.class_id===row.class_id)?.name||row.class_id)}</td><td>${esc(row.start_date||'Ongoing')}</td><td>${esc(row.end_date||'Ongoing')}</td><td><button type="button" data-access-action="live-edit" data-window="${esc(row.enrollment_id)}">Edit allocation</button></td></tr>`).join('')||'<tr><td colspan="4">No current class allocation.</td></tr>'}</tbody></table><label>Class <select name="liveClass"><option value="">Choose a class</option>${classes.map(c=>`<option value="${esc(c.class_id)}"${w?.class_id===c.class_id?' selected':''}>${esc(c.name)}</option>`).join('')}${w&&!classes.some(c=>c.class_id===w.class_id)?`<option value="${esc(w.class_id)}" selected>${esc(w.class_id)} (inactive)</option>`:''}</select></label><label>From (optional) <input type="date" name="liveStart" value="${esc(w?.start_date||'')}"></label><label>Through (optional) <input type="date" name="liveEnd" value="${esc(w?.end_date||'')}"></label><label><input type="checkbox" name="liveActive"${checked(w?w.active:true)}> Active allocation</label><button type="button" data-access-action="live-save">Save class allocation</button></form>`;
 }
 async function saveLive(p){
  if(p.dirty)throw Error('Save learning access before saving the class allocation.');
  if(!p.livePending){const form=p.root.querySelector('[data-access-live]');p.livePending={action:'live-allocation',operationId:crypto.randomUUID(),accountId:p.data.person.account_id,classId:form.elements.liveClass.value,start:form.elements.liveStart.value||null,end:form.elements.liveEnd.value||null,active:form.elements.liveActive.checked,...(p.liveWindow?{enrollmentId:p.liveWindow.enrollment_id,base:p.liveWindow}:{})};}
  try{await api(p.activityKey,p.livePending);p.livePending=null;p.liveDirty=false;await load(p,{refresh:true});tell(p,'Class allocation saved in Academy. Live entry uses the confirmed class and dates.');}catch(error){if(error.status===400||error.code==='CHANGE_CONFLICT'||error.code==='RETRY_CONFLICT')p.livePending=null;throw error;}
 }
 async function save(p){
  const d=p.data,a=d.person,form=p.root.querySelector('[data-access-person]'),reason=form.elements.reason.value.trim();
  if(!p.pending){const changes=[],base={enrolled:!!a.enrolled,live:!!a.live,purchased:!!a.purchased},next={enrolled:form.elements.enrolled.checked,live:form.elements.live.checked,purchased:form.elements.purchased?.checked||false};
   if(JSON.stringify(base)!==JSON.stringify(next))changes.push({action:'participant',accountId:a.account_id,...next,cohort:a.cohort||'',reason});
   const months=[...form.querySelectorAll('[data-month]')].filter(r=>r.querySelector('[data-paid]').checked!==(r.dataset.original==='true')).map(r=>({accountId:a.account_id,month:r.dataset.month,cohort:r.dataset.cohort,paid:r.querySelector('[data-paid]').checked,reason}));if(months.length)changes.push({action:'paid-months',changes:months});
   for(const check of form.querySelectorAll('[data-grant]'))if(check.checked!==a.grants.some(g=>g.website_id===check.dataset.grant))changes.push({action:'surah-grant',accountId:a.account_id,websiteId:check.dataset.grant,enabled:check.checked,reason});
   if(d.canChangeStaff&&(form.elements.staff.value!==(a.role||'')||form.elements.createAccount.checked!==!!a.can_create_account))changes.push({action:'staff',accountId:a.account_id,role:form.elements.staff.value||null,canCreateAccount:form.elements.createAccount.checked});
   if(!changes.length){p.dirty=false;tell(p,'No access changes to save.');return;}
   p.pending={action:'save',revision:d.revision,change:{action:'access-batch',operationId:crypto.randomUUID(),changes}};
  }
  try{await api(p.activityKey,p.pending);p.pending=null;p.dirty=false;p.liveDirty=false;await load(p,{refresh:true});tell(p,'Access changes saved.');}catch(e){if(e.status===400){p.pending=null;throw e;}if([401,403].includes(e.status))throw e;if(e.code==='CHANGE_CONFLICT'||e.code==='RETRY_CONFLICT'){p.pending=null;throw Error('The saved access or your authority changed. Refresh and review it before saving. Your entries remain on screen.');}throw Error(e.message+' Your Save is kept; retry the same Save to confirm it.');}
 }
 function newLearner(p){
  if(p.dirty||p.pending)throw Error('Finish the current access change first.');
  p.root.querySelector('[data-access-person]')?.remove();const form=document.createElement('form');form.dataset.accessNew='';form.innerHTML='<h4>Add learner</h4>'+ (p.data.canLinkAccount?'<label>Existing Academy account ID (to link an existing person) <input name="accountId" maxlength="180"></label><p>Use an existing account ID, or enter a name below to create a new master account.</p>':'')+'<label>Display name <input name="displayName" maxlength="160"></label><button type="button" data-access-action="provision">Create Academy account and enrol</button><p>The Academy master account is created first. A pending enrolment can be retried without creating another account. New enrolment does not grant a purchase.</p>';p.root.append(form);
 }
 async function provision(p){const form=p.root.querySelector('[data-access-new]');if(!p.job){const accountId=form.elements.accountId?.value.trim(),displayName=form.elements.displayName.value.trim();if(accountId&&displayName)throw Error('Choose an existing account ID or a new name.');if(!accountId&&!displayName)throw Error('Enter an existing account ID or the new learner’s name.');p.job={operationId:crypto.randomUUID(),...(accountId?{accountId}:{displayName})};}await api(p.activityKey,{action:'provision',input:p.job});await resume(p);}
 async function resume(p){
  try{const result=await api(p.activityKey,{action:'resume',input:{jobId:p.job.operationId}});p.accountId=result.accountId;p.job=null;await load(p,{refresh:true});tell(p,'Academy account confirmed and enrolment saved. Grant any purchase separately.');if(result.loginPath){const link=document.createElement('a');link.href=result.loginPath;link.textContent=' Open Academy account link';p.root.querySelector('[data-access-status]').append(link);}}
  catch(error){if(!p.root.querySelector('[data-access-action="resume"]'))p.root.insertAdjacentHTML('beforeend','<button type="button" data-access-action="resume">Retry pending enrolment</button>');throw error;}
 }
 async function ensure(host,activityKey){const p=attach(host,activityKey);if(p?.loading)await p.loading;return p?.data?.ownership?.authority||null;}
 window.M4L_STUDIO_ACCESS={attach,ensure,reset,canLeave};
 window.addEventListener('storage',e=>{if(e.key==='m4l_account_token')reset();});
 window.addEventListener('beforeunload',e=>{if(!canLeave()){e.preventDefault();e.returnValue='';}});
 if(!document.querySelector('link[data-studio-access-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/css/m4l-studio-access.css';link.dataset.studioAccessStyle='';document.head.append(link);}
})();
