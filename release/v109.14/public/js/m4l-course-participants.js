/* Course-only Participants. Core supplies people; the registered owner saves access. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let panel=null;
 const token=()=>localStorage.getItem('m4l_account_token')||'';
 const current=p=>panel===p&&p.token===token()&&p.context.current()&&p.root.isConnected;
 const unsettled=p=>Boolean(p&&(p.busy||p.pending||p.job||p.drafts.size||p.policyDirty||p.selected.size));
 function reset(){if(panel){panel.dialog?.remove();panel.root.remove();panel.cache.clear();panel.people.clear();panel.selected.clear();}panel=null;}
 function assert(p){if(!current(p))throw new DOMException('The account or Course changed.','AbortError');}
 async function api(p,command){
  assert(p);const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/admin/platform/studio-access',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+p.token,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify({activityKey:p.activityKey,command})}),value=await response.json();assert(p);
  if(!response.ok||!value.success)throw Object.assign(Error(value.error||'The access change could not be confirmed.'),{status:response.status,code:value.code});return value;
 }
 function tell(p,message){if(current(p)){p.notice=message;p.root.querySelector('[data-cp-status]')?.replaceChildren(document.createTextNode(message));p.dialog?.querySelector('[data-cp-dialog-status]')?.replaceChildren(document.createTextNode(message));}}
 async function perform(p,fn){if(p.busy)return;p.busy=true;render(p);try{await fn();}catch(error){if(!current(p))return;if([401,403].includes(error.status)){p.people.clear();p.data=null;p.cache.clear();p.dialog?.close();p.root.innerHTML='<p role="alert">Your account or access changed. Reopen Participants.</p>';}else{if(['CHANGE_CONFLICT','RETRY_CONFLICT'].includes(error.code)){p.pending=null;if(p.job){p.job=null;p.selected.clear();p.results=null;p.cache.clear();tell(p,'Course access changed. Refresh Participants, then search again and select any remaining users.');p.dialog?.close();return;}}tell(p,error.message);}}finally{p.busy=false;if(current(p)&&p.data)render(p);}}
 async function search(p,query='',after=''){
  const key=JSON.stringify([query,after]);const cached=p.cache.get(key);if(cached&&Date.now()-cached.at<43200000)return cached.value;
  const result=await api(p,{action:'course-user-search',search:query,after});p.cache.set(key,{at:Date.now(),value:result});return result;
 }
 async function load(p,{refresh=false,after=''}={}){
  const value=await api(p,{action:'read',after,...(!refresh&&p.data?.revision!==undefined&&p.after===after?{known:{revision:p.data.revision,after,accountId:null}}:{})});
  if(!value.notModified)p.data=value;else p.data={...p.data,...value};p.after=after;p.checkedAt=Date.now();
  if(value.legacyOnly){p.root.hidden=true;return;}
  for(const row of p.data.participants||[])p.people.set(row.account_id,row);
  if(!p.policyDirty||p.pending?.kind==='policy')p.policyModel=p.data.coursePolicy?.model||'PAID';p.error=null;
  if(p.policyModel==='FREE'&&p.data.canLinkAccount)p.freePage=await search(p,'',after);
  render(p);
 }
 function render(p){
  if(!current(p)||!p.data)return;const d=p.data;if(d.legacyOnly){p.root.hidden=true;return;}p.root.hidden=false;
  if(d.blocked||d.ownership?.authority!=='WEBSITE'||d.ownership?.phase!=='COMMITTED'){p.root.innerHTML='<p role="status">Course access setup is pending. Existing access is preserved.</p>';return;}
  const free=p.policyModel==='FREE',locked=p.busy||Boolean(p.pending||p.job),rows=free&&p.freePage?p.freePage.accounts.map(a=>({account_id:a.accountId,display_name:a.displayName,automatic:true})):[...p.people.values()].filter(a=>a.purchased||p.drafts.has(a.account_id));
  rows.sort((a,b)=>a.display_name.localeCompare(b.display_name)||a.account_id.localeCompare(b.account_id));
  p.root.innerHTML=`<fieldset class="cp-policy"${locked?' disabled':''}><legend>This Course is</legend>${['FREE','PAID'].map(model=>`<label><input type="radio" name="cp-policy" value="${model}"${p.policyModel===model?' checked':''}> ${model==='FREE'?'Free':'Paid'}</label>`).join('')}<button type="button" data-cp="policy-save"${(p.policyDirty||p.pending?.kind==='policy')&&!p.busy?'':' disabled'}>${p.pending?.kind==='policy'?'Retry save':'Save Course access'}</button></fieldset><p class="cp-policy-note">${p.policyDirty?'Save the Free or Paid setting to apply it.':free?'Free access is included for eligible signed-in users. Existing purchases are retained.':'Ticked students have Course access. Untick a student, then save to remove their access.'}</p><div class="cp-toolbar"><h3>Students with access</h3><button type="button" data-cp="add"${!d.canLinkAccount||free||locked?' disabled':''}>+ Add user</button><button type="button" class="pb-secondary" data-cp="refresh"${locked?' disabled':''}>Refresh</button></div><p role="status" aria-live="polite" data-cp-status>${esc(p.notice||'')}</p><div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Student</th><th>User ID</th></tr></thead><tbody>${rows.map(a=>`<tr><td><label class="cp-person"><input type="checkbox" data-cp-person="${esc(a.account_id)}" aria-label="${esc(a.display_name)} · Course access"${free||p.drafts.get(a.account_id)===true||!p.drafts.has(a.account_id)&&a.purchased?' checked':''}${free||locked?' disabled':''}><span>${esc(a.display_name)}</span></label></td><td>${esc(a.account_id)}</td></tr>`).join('')||'<tr><td colspan="2">No students with access on this page.</td></tr>'}</tbody></table></div><div class="cp-footer"><span>${p.drafts.size?`${p.drafts.size} unsaved access ${p.drafts.size===1?'change':'changes'}`:free?'Access is automatic while this Course is Free.':'Access records are up to date.'}</span>${(free?p.freePage?.more:d.more)?`<button type="button" class="pb-secondary" data-cp="more"${locked?' disabled':''}>More users</button>`:''}<button type="button" data-cp="save"${(p.drafts.size||p.pending?.kind==='access')&&!p.busy?'':' disabled'}>${p.pending?.kind==='access'?'Retry save':'Save access changes'}</button></div>${!d.canLinkAccount&&!free?'<p class="cm-hint">A Global Admin can add existing users. Current student access can be reviewed here.</p>':''}`;
  if(p.dialog?.open){renderDialog(p);if(p.focusSearch&&!p.busy){p.dialog.querySelector('[name=cp-search]')?.focus();p.focusSearch=false;}}
 }
 async function savePolicy(p){
  if(p.drafts.size||p.job)throw Error('Save the student changes before changing Free or Paid.');
  if(!p.pending)p.pending={kind:'policy',command:{action:'save',revision:p.data.revision,change:{action:'course-policy',operationId:crypto.randomUUID(),accessModel:p.policyModel}}};
  if(p.pending.kind!=='policy')throw Error('Finish the pending access save first.');
  await api(p,p.pending.command);p.cache.clear();await load(p,{refresh:true});p.pending=null;p.policyDirty=false;
  window.dispatchEvent(new window.CustomEvent('m4l-course-policy-saved',{detail:{activityKey:p.activityKey,coursePolicy:p.data.coursePolicy}}));tell(p,'Course access saved.');
 }
 async function saveStudents(p){
  if(p.policyDirty)throw Error('Save the Free or Paid setting first.');
  if(!p.pending){const entries=[...p.drafts].slice(0,40);if(!entries.length)return;const changes=entries.map(([accountId,on])=>({action:'participant',accountId,enrolled:on,live:on,purchased:on,cohort:p.people.get(accountId)?.cohort||'',reason:on?'Added in Course Participants':'Course access unchecked in Participants'}));p.pending={kind:'access',entries,command:{action:'save',revision:p.data.revision,change:{action:'access-batch',operationId:crypto.randomUUID(),changes}}};}
  if(p.pending.kind!=='access')throw Error('Finish the pending Course setting save first.');
  const pending=p.pending;await api(p,pending.command);await load(p,{refresh:true});
  for(const [id,on]of pending.entries){p.drafts.delete(id);const person=p.people.get(id);if(person)Object.assign(person,{purchased:Number(on),enrolled:Number(on),live:Number(on)});}p.pending=null;tell(p,p.drafts.size?'Saved this group. Save the remaining changes when ready.':'Student access saved.');
 }
 function dialog(p){
  if(p.policyDirty||p.drafts.size||p.pending)throw Error('Save the current access changes first.');
  if(!p.dialog){const d=document.createElement('dialog');d.className='cp-dialog';d.setAttribute('aria-labelledby','cp-dialog-title');d.addEventListener('cancel',event=>{if(p.busy||p.job)event.preventDefault();else p.selected.clear();});d.addEventListener('click',event=>{const b=event.target.closest('[data-cp-dialog]');if(!b)return;event.preventDefault();const action=b.dataset.cpDialog,searchValue=action==='search'?d.querySelector('[name=cp-search]').value.trim():null;if(action==='cancel'){if(!p.busy&&!p.job){p.selected.clear();d.close();}return;}void perform(p,async()=>{if(action==='search'){p.query=searchValue;p.results=await search(p,p.query);renderDialog(p);}if(action==='more'){p.results=await search(p,p.query,p.results.nextCursor);renderDialog(p);}if(action==='add')await addSelected(p);});});d.addEventListener('submit',e=>{e.preventDefault();d.querySelector('[data-cp-dialog=search]').click();});d.addEventListener('change',e=>{if(!e.target.dataset.cpCandidate||p.busy||p.job)return;const person=p.results.accounts.find(a=>a.accountId===e.target.dataset.cpCandidate);if(e.target.checked)p.selected.set(person.accountId,person);else p.selected.delete(person.accountId);renderDialog(p);});document.body.append(d);p.dialog=d;}
  p.query='';p.results=null;p.selected.clear();renderDialog(p);p.dialog.showModal();p.focusSearch=true;if(!p.busy)p.dialog.querySelector('[name=cp-search]').focus();
 }
 function renderDialog(p){
  const locked=p.busy||Boolean(p.job);p.dialog.innerHTML=`<h2 id="cp-dialog-title">Add users</h2><p>Find existing users and select everyone to add.</p><form class="cp-search"><label>Find a user<input name="cp-search" type="search" maxlength="80" autocomplete="off" value="${esc(p.query||'')}"${locked?' disabled':''}></label><button data-cp-dialog="search" type="submit"${locked?' disabled':''}>Search</button></form><p role="status" data-cp-dialog-status>${esc(p.notice||'')}</p><div class="cp-results">${p.results?p.results.accounts.map(a=>`<label class="cp-candidate"><input type="checkbox" data-cp-candidate="${esc(a.accountId)}"${p.selected.has(a.accountId)||p.people.get(a.accountId)?.purchased?' checked':''}${locked||p.people.get(a.accountId)?.purchased?' disabled':''}><span>${esc(a.displayName)}<small>${esc(a.uniqueId||a.accountId)}${p.people.get(a.accountId)?.purchased?' · Already has access':''}</small></span></label>`).join('')||'<p>No matching users in this group.</p>':'<p>Search by name or User ID.</p>'}</div>${p.results?.more?`<button type="button" class="pb-secondary" data-cp-dialog="more"${locked?' disabled':''}>Search more users</button>`:''}<footer><span>${p.selected.size} selected</span><button type="button" class="pb-secondary" data-cp-dialog="cancel"${locked?' disabled':''}>Cancel</button><button type="button" data-cp-dialog="add"${(p.selected.size||p.job)&&!p.busy?'':' disabled'}>${p.job?'Retry adding users':'Add selected users'}</button></footer>`;
 }
 async function addSelected(p){
  if(!p.job)p.job={index:0,items:[...p.selected.values()].map(a=>({...a,stage:'inspect',linkOperation:crypto.randomUUID(),grantOperation:crypto.randomUUID()}))};
  while(p.job.index<p.job.items.length){const item=p.job.items[p.job.index];tell(p,`Adding users · ${p.job.index+1} of ${p.job.items.length}`);
   if(item.stage==='inspect'){try{item.facts=await api(p,{action:'read',accountId:item.accountId});item.stage='prepare';}catch(e){if(e.status!==404)throw e;item.stage='link';}}
   if(item.stage==='link'){await api(p,{action:'provision',input:{operationId:item.linkOperation,accountId:item.accountId}});item.stage='resume';}
   if(item.stage==='resume'){await api(p,{action:'resume',input:{jobId:item.linkOperation}});item.facts=await api(p,{action:'read',accountId:item.accountId});item.stage='prepare';}
   if(item.stage==='prepare'){const person=item.facts.person;if(!person)throw Error('Reopen the selected user before adding access.');if(person.purchased){p.people.set(person.account_id,person);item.stage='done';}else{item.command={action:'save',revision:item.facts.revision,change:{action:'participant',operationId:item.grantOperation,accountId:item.accountId,enrolled:true,live:true,purchased:true,cohort:person.cohort||'',reason:'Added in Course Participants'}};item.stage='grant';}}
   if(item.stage==='grant'){await api(p,item.command);p.people.set(item.accountId,{...item.facts.person,enrolled:1,live:1,purchased:1});item.stage='done';}
   p.job.index++;
  }
  const count=p.job.items.length;await load(p,{refresh:true});p.job=null;p.selected.clear();p.dialog.close();tell(p,`Access confirmed for ${count} ${count===1?'user':'users'}.`);
 }
 function attach(host,activityKey,context={current:()=>true}){
  const key=JSON.stringify([token(),activityKey,context.selectionKey]);if(!panel||panel.key!==key){reset();const root=document.createElement('section');root.className='cm-course-participants';panel={key,token:token(),activityKey,context,root,data:null,people:new Map(),drafts:new Map(),selected:new Map(),cache:new Map(),after:'',busy:false,pending:null,job:null,policyDirty:false,notice:''};const p=panel;
   root.addEventListener('change',e=>{if(p.busy||p.pending||p.job)return;if(e.target.name==='cp-policy'){p.policyModel=e.target.value;p.policyDirty=p.policyModel!==p.data.coursePolicy.model;render(p);}if(e.target.dataset.cpPerson){const id=e.target.dataset.cpPerson,on=e.target.checked;if(on===Boolean(p.people.get(id)?.purchased))p.drafts.delete(id);else p.drafts.set(id,on);render(p);}});
   root.addEventListener('click',e=>{const b=e.target.closest('[data-cp]');if(!b)return;e.preventDefault();void perform(p,async()=>{const action=b.dataset.cp;if(action==='save')await saveStudents(p);if(action==='policy-save')await savePolicy(p);if(action==='refresh'){if(p.pending||p.job)throw Error('Retry the pending save first.');p.cache.clear();await load(p,{refresh:true});}if(action==='more'){if(unsettled({...p,busy:false}))throw Error('Save the current changes before loading more users.');await load(p,{after:p.policyModel==='FREE'?p.freePage.nextCursor:p.data.next});}if(action==='add')dialog(p);});});
  }
  const p=panel;p.context=context;host.append(p.root);if((!p.data||Date.now()-p.checkedAt>=43200000)&&!p.loading){p.root.innerHTML='<p role="status">Loading Course access…</p>';p.loading=load(p).catch(e=>{if(current(p)){p.error=e;p.root.innerHTML='<p role="alert">'+esc(e.message)+'</p><button type="button" data-cp="refresh">Retry</button>';}}).finally(()=>{p.loading=null;});}else render(p);return p;
 }
 async function ensure(host,activityKey,context){const p=attach(host,activityKey,context);if(p.loading)await p.loading;return p.error?'UNAVAILABLE':p.data?.legacyOnly?'ACADEMY':p.data?.ownership?.authority||'UNAVAILABLE';}
 window.M4L_COURSE_PARTICIPANTS={attach,ensure,reset,canLeave:()=>!unsettled(panel)};
 const changed=()=>{if(panel&&panel.token!==token())reset();};window.addEventListener('storage',changed);window.addEventListener('pageshow',changed);window.addEventListener('m4l-academy-session',changed);window.addEventListener('beforeunload',e=>{if(unsettled(panel)){e.preventDefault();e.returnValue='';}});
})();
