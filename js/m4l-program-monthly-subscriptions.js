/* Manual paid-month grid and dated historical media. No automatic billing. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const v2=location.origin==='https://ummabbadacademy.app'&&document.querySelector('meta[name="uaa-auth-version"]')?.content==='2';let auth=null,unregisterPolicy=null,monthsForm=null,grantsForm=null,historicalForm=null,historicalVersion=null,historicalCheckpoint=Promise.resolve(),monthsReady=false,grantsReady=false,monthsVersion=0,grantsVersion=0,checkpoint=Promise.resolve(),grantCheckpoint=Promise.resolve();
 const token=()=>v2?(window.M4L_ACADEMY_AUTH?.ownerKey()||''):localStorage.getItem('m4l_account_token')||'';
 const nativeClient=async()=>auth||(auth=await window.M4L_ACADEMY_AUTH.ready);
 const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const monthsSnapshot=()=>({entries:[...drafts.values()].map(row=>structuredClone(row)),draftRevision,removalReason:host?.querySelector('[data-pms-removal-reason]')?.value||''});
 const grantSnapshot=()=>({selected:[...grantEditor.selected],note:grantEditor.note});
 function persist(grants=false){if(!v2)return;const form=grants?grantsForm:monthsForm;if(!form)return;const snapshot=grants?grantSnapshot():monthsSnapshot(),view=auth.getState().viewVersion;const work=form.checkpoint(snapshot).catch(error=>{if(auth.getState().viewVersion!==view)return;message(error.message,true);throw error;});work.catch(()=>{});if(grants)grantCheckpoint=work;else checkpoint=work;}
 const historicalSnapshot=()=>{const form=host?.querySelector('[data-pms-history-form]');return {date:form?.elements.date.value||'',title:form?.elements.title.value||'',classIds:[...form?.querySelectorAll('[data-pms-class]:checked')||[]].map(field=>field.value)};};
 async function historicalRead(){await (await nativeClient()).prepareBusiness();return api('feed',{contentFlow:true},true);}
 async function installHistorical(){if(!v2||external||!data.prepared)return;historicalForm?.dispose();historicalForm=null;const result=await historicalRead();historicalVersion=result.cacheRevision;const root=host.querySelector('[data-pms-history-form]'),{createAcademyNativeForm}=await import('/js/m4l-v111-editor.mjs');historicalForm=await createAcademyNativeForm({client:auth,resource:{type:'academy-historical-media',activityKey:'PROGRAM:'+program},capture:historicalSnapshot,baseVersion:()=>historicalVersion,isDirty:()=>historicalDirty,applyRetained:saved=>{if(typeof saved?.date!=='string'||typeof saved?.title!=='string'||!Array.isArray(saved.classIds))throw Error('The retained original lesson is invalid.');root.elements.date.value=saved.date;root.elements.title.value=saved.title;for(const field of root.querySelectorAll('[data-pms-class]'))field.checked=saved.classIds.includes(field.value);historicalDirty=true;},applyCurrent:value=>{historicalVersion=value.cacheRevision;root.reset();historicalDirty=false;historyRequest=null;},readCurrent:historicalRead,roots:[root],host:document.body,status:message});await historicalForm.open(result);}
 function persistHistorical(){if(!historicalForm)return;const snapshot=historicalSnapshot(),view=auth.getState().viewVersion;historicalCheckpoint=historicalForm.checkpoint(snapshot).catch(error=>{if(auth.getState().viewVersion!==view)return;message(error.message,true);throw error;});historicalCheckpoint.catch(()=>{});}
 async function submitHistoricalV2(form){const stamp=generation;let attempt;busy=true;controls();try{if(!historicalForm)throw Error('Prepare protected original-lesson recovery before sending.');await historicalCheckpoint;const input={...historicalSnapshot(),operationId:crypto.randomUUID()};attempt=await historicalForm.beforeMutation({action:'historical-create',input},{sensitive:true});let result=await api('historical-create',input,true);if(stamp!==generation)return;result=await historicalForm.completeNativeMutation(attempt,result,{operationId:input.operationId});historicalDirty=false;historyRequest=null;form.reset();await historicalForm.saved();month=input.date.slice(0,7);await historicalRead();await history();message('Historical lesson created. Attach media deliberately from its checked native record.');}catch(error){if(stamp!==generation)return;if(attempt)await historicalForm.unknown(attempt);message(error.message,true);}finally{if(stamp===generation){busy=false;controls();}}}
 async function policyForm(mode){if(policyForms.has(mode))return policyForms.get(mode);const root=document.createElement('section');document.body.append(root);const {createAcademyNativeForm}=await import('/js/m4l-v111-editor.mjs'),form=await createAcademyNativeForm({client:await nativeClient(),resource:{type:'academy-program-subscription-policy',activityKey:'PROGRAM:'+program,mode},capture:()=>({mode}),baseVersion:()=>data?.policy?.revision||0,isDirty:()=>false,applyRetained:()=>{},applyCurrent:value=>{data=value;},readCurrent:()=>gridRead(),roots:[root],host:document.body,status:message});const entry={form,root};policyForms.set(mode,entry);return entry;}
 async function recoverPolicy(){if(!v2||!data?.canConfigure)return;for(const mode of ['prepare','activate']){const {form}=await policyForm(mode);if(await form.hasRetained())await form.open(data);}}
 async function gridRead(input={}){const client=await nativeClient();await client.prepareBusiness();return api('grid',{years,search,...input});}
 async function installMonths(result,{restore=true}={}){if(!v2||!result.prepared)return;monthsReady=false;monthsForm?.dispose();monthsForm=null;monthsVersion=await digest({policy:result.policy,students:result.students.map(row=>({accountId:row.accountId,months:row.months}))});const {createAcademyNativeForm}=await import('/js/m4l-v111-editor.mjs');monthsForm=await createAcademyNativeForm({client:await nativeClient(),resource:external?.v2Resource||{type:'academy-program-subscriptions',activityKey:'PROGRAM:'+program,editor:'months'},capture:monthsSnapshot,baseVersion:()=>monthsVersion,isDirty:()=>drafts.size>0,applyRetained:saved=>{if(!Array.isArray(saved?.entries))throw Error('The retained monthly register is invalid.');drafts.clear();for(const row of saved.entries)drafts.set(key(row.accountId,row.month),row);draftRevision=saved.draftRevision;renderGrid();if(saved.removalReason){review();const field=host.querySelector('[data-pms-removal-reason]');if(field)field.value=saved.removalReason;}},applyCurrent:async value=>{data=value;students.clear();for(const row of value.students||[])students.set(row.accountId,row);drafts.clear();draftRevision=null;pending=null;monthsVersion=await digest({policy:value.policy,students:value.students.map(row=>({accountId:row.accountId,months:row.months}))});host.querySelector('[data-pms-review]')?.replaceChildren();renderGrid();controls();},readCurrent:()=>gridRead(),roots:[...host.querySelectorAll('.pms-grid-toolbar,.pms-grid-help,[data-pms-grid],.pms-grid-footer,[data-pms-review]')],host:document.body,status:message});await monthsForm.open(result,{restore});monthsReady=true;}
 async function installGrants(result){grantsReady=false;grantsForm?.dispose();grantsForm=null;grantsVersion=await digest({policy:result.policyRevision,surahs:result.surahs});const accountId=result.student.accountId,{createAcademyNativeForm}=await import('/js/m4l-v111-editor.mjs');grantsForm=await createAcademyNativeForm({client:await nativeClient(),resource:{type:'academy-program-surah-grants',activityKey:'PROGRAM:'+program,accountId},capture:grantSnapshot,baseVersion:()=>grantsVersion,isDirty:grantDirty,applyRetained:saved=>{if(!Array.isArray(saved?.selected)||typeof saved.note!=='string')throw Error('The retained Surah changes are invalid.');grantEditor.selected=new Map(saved.selected);grantEditor.note=saved.note;renderGrants();},applyCurrent:async value=>{grantEditor={data:value,selected:new Map(value.surahs.map(row=>[row.id,row.additional])),note:'',pending:null};grantsVersion=await digest({policy:value.policyRevision,surahs:value.surahs});renderGrants();},readCurrent:async()=>{await auth.prepareBusiness();return api('surah-grants',{accountId});},roots:[host.querySelector('[data-pms-grants-slot]')],host:document.body,status:message});await grantsForm.open(result);grantsReady=true;}

 let years=[2024,2025,2026];const shortMonths=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 const expanded=new Set(),drafts=new Map(),students=new Map(),policyForms=new Map();
 let host=null,program='',owner='',generation=0,request=0,busy=false,mode='participants',data=null,search='',draftRevision=null,pending=null;
 let grantEditor=null,external=null;
 let month='',historyRows=[],historyAfter=null,historicalDirty=false,historyRequest=null,historySequence=0;
 const key=(account,m)=>JSON.stringify([account,m]);
 const monthLabel=value=>new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T12:00:00Z'));
 const monthsIn=year=>shortMonths.map((_,i)=>year+'-'+String(i+1).padStart(2,'0'));
 const savedCell=(row,m)=>row.months[m]||{subscribed:false,revision:0,classIds:[]};
 const cell=(row,m)=>drafts.get(key(row.accountId,m))||savedCell(row,m);
 function message(text,error=false){const node=host?.querySelector('[data-pms-message]');if(node){node.textContent=text;node.setAttribute('role',error?'alert':'status');}}
 function canBrowse(allowHistory=false){
  if(grantEditor){message('Save or close additional Surah access before continuing.',true);return false;}
  if(busy||pending||!allowHistory&&historyRequest){message('Finish or retry this save before continuing.',true);return false;}
  if(!allowHistory&&historicalDirty){message('Add or clear the unfinished historical lesson before continuing.',true);return false;}
  return window.M4L_LESSON_MEDIA?.canLeave?.()!==false;
 }
 function canLeave(allowHistory=false){if(!canBrowse(allowHistory))return false;if(drafts.size){message('Save or discard your month changes before leaving.',true);return false;}return true;}
 async function api(action,input={},media=false){
  const current=owner,stamp=generation;
  if(v2){const client=await nativeClient();if(external&&!external.nativeSource&&(!external.v2Resource||typeof external.transport!=='function'))throw Error('The linked access editor is awaiting its own checked recovery integration.');const result=external&&!external.nativeSource?await external.transport(action,input):await client.request((media?'/api/academy/lesson-media/':'/api/admin/platform/program-monthly-subscriptions/')+action,{activityKey:'PROGRAM:'+program,...input},{headers:{'X-Academy-Workspace':'ADMIN'}});if(stamp!==generation||current!==token()||!client.isCurrentResult(result))throw Error('Your account or Program changed. Reopen this register.');return result;}
  if(external){const result=await external.transport(action,input);if(stamp!==generation||current!==token())throw Error('Your account or programme changed. Reopen this register.');return result;}
  const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+(media?'/api/academy/lesson-media/':'/api/admin/platform/program-monthly-subscriptions/')+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+current,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify({activityKey:'PROGRAM:'+program,...input})});
  const result=await response.json();if(stamp!==generation||current!==token())throw Error('Your account or Program changed. Reopen this register.');
  if(!response.ok||!result.success)throw Object.assign(Error(result.error||'Could not complete this change. Your draft is kept.'),{status:response.status,code:result.code});
  return result;
 }
 function shell(){
  if(host)return;const panel=external?.host||document.getElementById('pg-people-tool');if(!panel)return;
  host=document.createElement('section');host.className='pms';
  host.innerHTML='<div class="pms-tabs" role="tablist" aria-label="Participants sections"><button type="button" role="tab" data-pms-tab="participants" aria-selected="true">Participants</button><button type="button" role="tab" data-pms-tab="monthly" aria-selected="false" hidden>Monthly subscriptions</button></div><div data-pms-panel hidden><h2>Monthly subscriptions</h2><p data-pms-message role="status" aria-live="polite"></p><div data-pms-content></div><div id="pms-media-editor" hidden></div></div>';
  panel.prepend(host);if(external){host.classList.add('pms-access-matrix');host.querySelector('.pms-tabs').hidden=true;host.querySelector('h2').textContent='Student monthly access';}host.addEventListener('click',click);host.addEventListener('change',change);host.addEventListener('submit',submit);
  host.addEventListener('keydown',event=>{
   if(!event.target.matches('[data-pms-tab]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   const tabs=[...host.querySelectorAll('[data-pms-tab]')].filter(t=>!t.hidden),i=tabs.indexOf(event.target);event.preventDefault();
   tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length]?.focus();
  });
  host.addEventListener('input',e=>{if(e.target.closest('[data-pms-history-form]')){historicalDirty=true;if(v2)persistHistorical();}if(e.target.matches('[data-pms-grant-note]')&&grantEditor)grantEditor.note=e.target.value;if(v2&&(e.target.matches('[data-pms-grant-note]')||e.target.matches('[data-pms-removal-reason]')))persist(e.target.matches('[data-pms-grant-note]'));});
  host.addEventListener('reset',e=>{if(!e.target.matches('[data-pms-history-form]'))return;if(historyRequest){e.preventDefault();message('Retry the pending historical lesson before clearing it.',true);return;}historicalDirty=false;delete e.target.dataset.operation;});
  host.addEventListener('toggle',e=>{if(e.target.matches('.pms-history')&&e.target.open)void history();},true);
 }
 function tabs(){
  const monthly=mode==='monthly';host.querySelector('[data-pms-panel]').hidden=!monthly;
  const people=external?null:document.getElementById('pm-main');if(people)people.hidden=monthly;
  for(const tab of host.querySelectorAll('[data-pms-tab]')){tab.setAttribute('aria-selected',String(tab.dataset.pmsTab===mode));tab.tabIndex=tab.dataset.pmsTab===mode?0:-1;}
 }
 async function select(id){
  shell();if(!host)return;if(program===id&&owner===token())return;
  if(v2){await nativeClient();await auth.prepareBusiness();}reset();program=id;owner=token();if(external){mode='monthly';tabs();}const stamp=generation;
  try{await load();if(stamp!==generation)return;if(data?.available&&(external||new URLSearchParams(location.search).get('participants')==='monthly')){mode='monthly';tabs();}}
  catch(error){if(stamp===generation)message(error.message,true);}
 }
 async function load(more=false){
  const stamp=generation,sequence=++request;busy=true;controls();message('Loading subscriptions…');
  try{
   const result=await (v2?gridRead(more?{after:data.after}:{}):api('grid',{years,search,...(more?{after:data.after}:{})}));if(stamp!==generation||sequence!==request)return;
   const merge=more&&(!v2||auth.isCurrentResult(data)),rows=merge?[...(data?.students||[]),...(result.students||[])]:result.students||[];if(!merge)students.clear();
   data={...result,students:[...new Map(rows.map(r=>[r.accountId,r])).values()]};if(v2)auth.trackResult(data,result);for(const row of data.students)students.set(row.accountId,row);
   month=month||data.currentMonth||'2026-10';host.querySelector('[data-pms-tab="monthly"]').hidden=!data.available;
   render();if(v2){const beforePolicy=data;await recoverPolicy();if(data!==beforePolicy)render();const panel=host.querySelector('[data-pms-panel]');if(data.prepared){if(unregisterPolicy){unregisterPolicy();unregisterPolicy=null;panel.style.visibility='';panel.inert=false;}await installMonths(data);await installHistorical();}else {unregisterPolicy?.();unregisterPolicy=auth.registerPrivateRoot(panel);auth.revealResult(data,{roots:[panel]});}}message(drafts.size&&draftRevision!==data.policy?.revision?'The saved register changed while you were editing. Your draft is kept; save it or discard it before refreshing.':'',Boolean(drafts.size&&draftRevision!==data.policy?.revision));
  }catch(error){if(stamp===generation&&sequence===request)message(error.message,true);}
  finally{if(stamp===generation&&sequence===request){busy=false;controls();}}
 }
 function controls(){
  if(v2)for(const tab of host?.querySelectorAll('[data-pms-tab]')||[])tab.disabled=busy;
  for(const c of host?.querySelectorAll('[data-pms-content] button,[data-pms-content] input,[data-pms-content] select,[data-pms-content] textarea')||[]){
   c.disabled=busy||Boolean(v2&&data?.prepared&&(!monthsReady||c.closest('[data-pms-grant-editor]')&&!grantsReady))||Boolean(grantEditor&&!c.closest('[data-pms-grant-editor]'))||Boolean(grantEditor?.pending&&c.dataset.pmsGrantAction!=='retry')||Boolean(c.dataset.pmsInactive==='true')||Boolean(historyRequest&&c.closest('[data-pms-history-form]')&&c.type!=='submit')||Boolean(pending&&c.dataset.pmsAction!=='retry');
  }
 }
 const classOptions=ids=>(data?.classes||[]).map(c=>'<label><input type="checkbox" data-pms-class value="'+esc(c.class_id)+'"'+(ids.includes(c.class_id)?' checked':'')+'>'+esc(c.name)+(c.active?'':' (historical)')+'</label>').join('');
 function render(){
  const content=host.querySelector('[data-pms-content]');if(!data?.available){content.replaceChildren();return;}
  if(!data.prepared){content.innerHTML='<p>Prepare Tafseer’s register before entering paid months and earlier lessons. Preparation retains new recordings; it does not change student access yet.</p>'+(data.canConfigure?'<button type="button" data-pms-action="prepare">Prepare monthly register</button>':'<p>Ask Global Admin to prepare this register.</p>')+'<div data-pms-review></div>';return;}
  content.innerHTML='<p>'+(data.policy.enabled?esc(external?.description||'Students keep access to the lesson months checked here, including recordings added later.'):'Preparation mode: enter and review paid months before activating monthly access.')+'</p>'+
   '<div class="pms-grid-toolbar"><form data-pms-search-form class="pms-search"><label>Find a student<input type="search" data-pms-search value="'+esc(search)+'" maxlength="100" placeholder="Name or account ID"></label><button type="submit">Find</button></form><div class="pms-toolbar"><button type="button" data-pms-action="save">Save changes</button><button type="button" data-pms-action="discard">Discard edits</button><button type="button" data-pms-action="refresh">Refresh</button></div></div>'+
   '<p class="pms-grid-help">Click a year to show its months. Use each student’s All checkbox for a whole year, or tick individual months. Save all your changes together. Student names stay on the left as you scroll.</p>'+
   '<div data-pms-grants-slot></div><div data-pms-grid></div><div class="pms-grid-footer"><p data-pms-delta aria-live="polite"></p><p>'+data.students.length+' student(s) shown'+(data.after?' · more available':'')+'</p>'+(data.after?'<button type="button" data-pms-action="more">Load more students</button>':'')+'</div><div data-pms-review></div>'+
   (data.canConfigure&&!data.policy.enabled?'<p><button type="button" data-pms-action="activate">Activate monthly access…</button></p>':'')+
   (external?'':'<details class="pms-history"><summary>Earlier lessons and media · including 2024 / 2025</summary><p>Use the original lesson date: it determines the paid month even when media is added later. Tafseer recordings are retained beyond 14 days.</p><form data-pms-history-form><label>Original lesson date<input name="date" type="date" required></label><label>Lesson title<input name="title" maxlength="180" required></label><fieldset><legend>Lesson classes</legend>'+classOptions(data.classes.length===1?[data.classes[0].class_id]:[])+'</fieldset><button type="submit">Add historical lesson</button><button type="reset">Clear entry</button></form><label>Browse lesson media<input type="month" data-pms-history-month value="'+esc(month)+'" required></label><div data-pms-history-list></div></details>');
  renderGrid();renderHistory();controls();
 }
 function renderGrid(focusKey){
  const slot=host.querySelector('[data-pms-grid]');if(!slot)return;
  const old=slot.querySelector('.pms-grid-wrap'),left=old?.scrollLeft||0,top=old?.scrollTop||0;
  const head=years.map(y=>'<th scope="colgroup" colspan="'+(expanded.has(y)?13:1)+'"><button type="button" data-pms-year="'+y+'" aria-expanded="'+expanded.has(y)+'" aria-label="'+(expanded.has(y)?'Collapse ':'Expand ')+y+'"><span aria-hidden="true">'+(expanded.has(y)?'▾':'▸')+'</span> '+y+'</button></th>').join('');
  const monthHeads=years.map(y=>expanded.has(y)?'<th scope="col" class="pms-year-select" aria-label="All 12 months of '+y+'">All</th>'+shortMonths.map((m,i)=>'<th scope="col" aria-label="'+esc(monthLabel(monthsIn(y)[i]))+'">'+m+'</th>').join(''):'<th scope="col" class="pms-year-summary">All months</th>').join('');
  const rows=data.students.map(row=>'<tr><th scope="row" class="pms-student"><strong>'+esc(row.name)+'</strong><small>'+esc(row.accountId)+(row.active?'':' · Inactive')+'</small></th>'+years.map(y=>{
   const count=monthsIn(y).filter(m=>cell(row,m).subscribed).length,edited=monthsIn(y).some(m=>drafts.has(key(row.accountId,m)));
   const wholeYear='<td class="pms-year-select'+(expanded.has(y)?'':' pms-year-summary')+(edited?' pms-edited':'')+'"><label><span class="pms-visually-hidden">'+esc(row.name)+' · All 12 months of '+y+'</span><input type="checkbox" data-pms-year-cell data-account="'+esc(row.accountId)+'" data-year="'+y+'" data-pms-inactive="'+!row.active+'" aria-checked="'+(count===12?'true':count?'mixed':'false')+'"'+(count===12?' checked':'')+'>'+(expanded.has(y)?'':'<span aria-hidden="true">'+count+' / 12</span>')+'</label></td>';
   if(!expanded.has(y))return wholeYear;
   return wholeYear+monthsIn(y).map(m=>{
    const value=cell(row,m),edited=drafts.has(key(row.accountId,m)),inactive=!row.active&&!savedCell(row,m).subscribed;
    return '<td class="pms-month-cell'+(edited?' pms-edited':'')+'"><label><span class="pms-visually-hidden">'+esc(row.name)+' · '+esc(monthLabel(m))+'</span><input type="checkbox" data-pms-cell data-account="'+esc(row.accountId)+'" data-month="'+m+'" data-pms-inactive="'+inactive+'"'+(value.subscribed?' checked':'')+'></label></td>';
   }).join('');
  }).join('')+(data.surahGrantsAvailable?'<td><button type="button" data-pms-grants="'+esc(row.accountId)+'" aria-label="Additional Surah access for '+esc(row.name)+'">Additional Surah access</button></td>':'')+'</tr>').join('');
  const columns=1+Number(Boolean(data.surahGrantsAvailable))+years.reduce((n,y)=>n+(expanded.has(y)?13:1),0);
  slot.innerHTML='<div class="pms-grid-wrap" tabindex="0" role="region" aria-label="'+esc(external?.label||'Tafseer')+' paid months"><table class="pms-grid"><caption class="pms-visually-hidden">'+esc(external?.label||'Tafseer')+' students and subscribed months, '+years[0]+' to '+years.at(-1)+'</caption><thead><tr><th scope="col" rowspan="2" class="pms-student">Student</th>'+head+(data.surahGrantsAvailable?'<th scope="col" rowspan="2">Surah websites</th>':'')+'</tr><tr>'+monthHeads+'</tr></thead><tbody>'+(rows||'<tr><td colspan="'+columns+'">No matching students on this page.</td></tr>')+'</tbody></table></div>';
  const wrap=slot.querySelector('.pms-grid-wrap');wrap.scrollLeft=left;wrap.scrollTop=top;
  for(const control of slot.querySelectorAll('[data-pms-year-cell]'))control.indeterminate=control.getAttribute('aria-checked')==='mixed';
  if(focusKey){for(const control of slot.querySelectorAll('[data-pms-cell],[data-pms-year-cell]'))if(key(control.dataset.account,control.dataset.month||'YEAR:'+control.dataset.year)===focusKey){control.focus?.({preventScroll:true});break;}}
  delta();controls();
 }
 function delta(){const node=host.querySelector('[data-pms-delta]');if(node)node.textContent=drafts.size?drafts.size+' unsaved month change(s)'+([...drafts.values()].some(e=>!data.students.some(r=>r.accountId===e.accountId))?', including students outside this search':''):'No unsaved changes';}
 function change(event){
  const control=event.target;
  if(control.matches('[data-pms-grant]')){if(grantEditor&&!busy&&!grantEditor.pending){grantEditor.selected.set(control.dataset.pmsGrant,control.checked);persist(true);}return;}
  if(control.matches('[data-pms-history-month]')){const next=control.value;if(!canLeave()){control.value=month;return;}if(!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(next)){message('Choose a month and year.',true);return;}month=next;historyRows=[];void history();return;}
  if(!control.matches('[data-pms-cell],[data-pms-year-cell]')||control.disabled||busy||pending)return;
  const row=students.get(control.dataset.account),wholeYear=control.hasAttribute('data-pms-year-cell');
  for(const m of wholeYear?monthsIn(Number(control.dataset.year)):[control.dataset.month])stageCell(row,m,control.checked);
  if(!drafts.size)draftRevision=null;host.querySelector('[data-pms-review]').replaceChildren();renderGrid(key(row.accountId,wholeYear?'YEAR:'+control.dataset.year:control.dataset.month));persist();
 }
 function stageCell(row,m,subscribed){
  const k=key(row.accountId,m),saved=savedCell(row,m),draft=drafts.get(k),original=draft?.wasSubscribed??saved.subscribed;
  if(subscribed===original)drafts.delete(k);
  else{if(!drafts.size)draftRevision=data.policy.revision;drafts.set(k,{accountId:row.accountId,month:m,subscribed,revision:draft?.revision??saved.revision,classIds:draft?.classIds??(saved.classIds.length?saved.classIds:row.suggestedClassIds[m]||[]),wasSubscribed:original});}
 }
 const saveInput=()=>({entries:[...drafts.values()].map(({wasSubscribed,...entry})=>entry),removalReason:host.querySelector('[data-pms-removal-reason]')?.value.trim()||''});
 function review(){
  if(!drafts.size){message('No changes to save.');return;}if(!canBrowse())return;
  const entries=[...drafts.values()],removals=entries.filter(e=>e.wasSubscribed&&!e.subscribed),unclear=entries.filter(e=>e.subscribed&&!e.classIds.length);
  if(!removals.length&&!unclear.length){void transact('grid-save',saveInput());return;}
  host.querySelector('[data-pms-review]').innerHTML='<p>Save '+entries.length+' month change(s).</p>'+(removals.length?'<label>Reason for removing '+removals.length+' paid month(s)<textarea data-pms-removal-reason maxlength="500" required></textarea></label>':'')+unclear.map(e=>'<fieldset data-pms-coverage-key="'+esc(key(e.accountId,e.month))+'"><legend>Classes for '+esc(students.get(e.accountId).name)+' · '+esc(monthLabel(e.month))+'</legend>'+classOptions(e.classIds)+'</fieldset>').join('')+'<button type="button" data-pms-action="confirm-save">Save these changes</button>';
 }
 async function transactV2(action,input){const stamp=generation,client=await nativeClient();let attempt;const packet={...input,policyRevision:draftRevision??data?.policy?.revision??0,operationId:crypto.randomUUID()};busy=true;controls();message('Saving…');try{if(action==='grid-save'){await checkpoint;if(!monthsReady||!monthsForm)throw Error('Prepare protected monthly recovery before saving.');attempt=await monthsForm.beforeMutation({action,input:packet},{sensitive:true});}else if(action==='configure'){const {form}=await policyForm(input.mode);const opened=await form.open(data,{restore:false});if(opened?.manualReview)return;attempt=await form.beforeMutation({action,input:packet},{sensitive:true});}else throw Error('This monthly action has no protected native editor.');let result=await api(action,packet);if(stamp!==generation)return;if(attempt)result=await (action==='configure'?(await policyForm(input.mode)).form:monthsForm).completeNativeMutation(attempt,result,{operationId:packet.operationId});drafts.clear();draftRevision=null;pending=null;busy=false;await load();if(monthsForm)await monthsForm.saved();message('Saved.');}catch(error){if(stamp!==generation)return;busy=false;if(attempt)await (action==='configure'?(await policyForm(input.mode)).form:monthsForm).unknown(attempt);else message(action==='configure'?'The configuration outcome needs a fresh read before another deliberate action. '+error.message:error.message,true);pending=null;controls();}finally{if(stamp===generation){busy=false;controls();}}}
 async function transact(action,input){
  if(busy)return;if(v2)return transactV2(action,input);pending=pending||{action,input:{...input,policyRevision:draftRevision??data?.policy?.revision??0,operationId:crypto.randomUUID()}};
  busy=true;controls();message('Saving…');const stamp=generation;
  try{await api(pending.action,pending.input);if(stamp!==generation)return;drafts.clear();draftRevision=null;pending=null;busy=false;await load();message('Saved.');}
  catch(error){if(stamp!==generation)return;busy=false;if(error.status&&error.status<500)pending=null;message(error.message,true);if(pending){const button=document.createElement('button');button.type='button';button.dataset.pmsAction='retry';button.textContent='Retry this save';host.querySelector('[data-pms-review]')?.append(button);}controls();}
 }
 const grantDirty=()=>Boolean(grantEditor&&(grantEditor.pending||grantEditor.note||grantEditor.data.surahs.some(r=>Boolean(grantEditor.selected.get(r.id))!==r.additional)));
 function renderGrants(){
  const slot=host.querySelector('[data-pms-grants-slot]');if(!slot)return;
  if(!grantEditor){slot.replaceChildren();return;}
  const {student,surahs,monthlyEnabled}=grantEditor.data;
  slot.innerHTML='<section data-pms-grant-editor aria-labelledby="pms-grant-title"><h3 id="pms-grant-title">Additional Surah access · '+esc(student.name)+'</h3><p>Paid months remain the normal access rule. These additional grants open selected published Surah websites and their website attachments. Lesson recordings keep their existing access rules.</p>'+
   (!student.active?'<p>This account is inactive. Existing additional grants can be removed.</p>':'')+
   (surahs.length?'<fieldset><legend>Additional website access</legend>'+surahs.map(r=>'<label class="pms-grant-row"><input type="checkbox" data-pms-grant="'+esc(r.id)+'"'+(grantEditor.selected.get(r.id)?' checked':'')+' data-pms-inactive="'+Boolean(r.public||(!student.active||!r.active)&&!r.additional)+'"> <strong>'+esc(r.name)+'</strong> · '+(r.public?'Public website':r.paidMonth?(monthlyEnabled?'Paid month access':'Paid month recorded · protection not activated'):'No paid month recorded')+(r.additional?' · Additional grant':'')+(!r.active?' · Inactive':!r.published?' · Not published':'')+'</label>').join('')+'</fieldset><label>Reason (optional)<textarea data-pms-grant-note maxlength="500">'+esc(grantEditor.note)+'</textarea></label><button type="button" data-pms-grant-action="save">Save additional access</button>':'<p>No Surahs have been entered yet.</p>')+
   '<button type="button" data-pms-grant-action="close">Close / discard edits</button><p data-pms-grant-message role="status" aria-live="polite"></p></section>';
  controls();
 }
 async function openGrants(accountId){
  if(!canLeave())return;const stamp=generation;busy=true;controls();message('Loading additional Surah access…');
  try{if(v2)await (await nativeClient()).prepareBusiness();const result=await api('surah-grants',{accountId});if(stamp!==generation)return;grantEditor={data:result,selected:new Map(result.surahs.map(r=>[r.id,r.additional])),note:'',pending:null};renderGrants();if(v2)await installGrants(result);message('');host.querySelector('[data-pms-grant-editor] button')?.focus();}
  catch(error){if(stamp===generation)message(error.message,true);}
  finally{if(stamp===generation){busy=false;controls();}}
 }
 async function saveGrantsV2(editor){let attempt;const stamp=generation;busy=true;controls();try{await grantCheckpoint;if(!grantsReady||!grantsForm)throw Error('Prepare protected Surah recovery before saving.');const input={accountId:editor.data.student.accountId,entries:editor.data.surahs.map(row=>({id:row.id,active:Boolean(editor.selected.get(row.id)),revision:row.revision})),note:editor.note,policyRevision:editor.data.policyRevision,operationId:crypto.randomUUID()};attempt=await grantsForm.beforeMutation({action:'surah-grants-save',input},{sensitive:true});let result=await api('surah-grants-save',input);if(stamp!==generation)return;result=await grantsForm.completeNativeMutation(attempt,result,{operationId:input.operationId});editor.note='';editor.pending=null;for(const row of editor.data.surahs)row.additional=Boolean(editor.selected.get(row.id));await grantsForm.saved();grantsForm.dispose();grantsForm=null;grantEditor=null;renderGrants();await load();message('Additional Surah access saved.');}catch(error){if(stamp!==generation)return;if(attempt)await grantsForm.unknown(attempt);message(error.message,true);}finally{if(stamp===generation){busy=false;controls();}}}
 async function saveGrants(){
  if(busy||!grantEditor)return;
  const editor=grantEditor;if(v2)return saveGrantsV2(editor);
  if(!editor.pending){
   const entries=editor.data.surahs.map(r=>({id:r.id,active:Boolean(editor.selected.get(r.id)),revision:r.revision}));
   if(!entries.some(e=>e.active!==editor.data.surahs.find(r=>r.id===e.id).additional)){message('No additional access changes to save.');return;}
   editor.pending={accountId:editor.data.student.accountId,entries,note:editor.note,policyRevision:editor.data.policyRevision,operationId:crypto.randomUUID()};
  }
  const stamp=generation;busy=true;controls();message('Saving additional Surah access…');
  try{await api('surah-grants-save',editor.pending);if(stamp!==generation)return;grantEditor=null;renderGrants();message('Additional Surah access saved. Paid months are unchanged.');}
  catch(error){if(stamp!==generation)return;if(error.status&&error.status<500)editor.pending=null;const node=host.querySelector('[data-pms-grant-message]');if(node){node.textContent=error.message;node.setAttribute('role','alert');if(editor.pending){const retry=document.createElement('button');retry.type='button';retry.dataset.pmsGrantAction='retry';retry.textContent='Retry this save';node.append(retry);}}message(error.message,true);}
  finally{if(stamp===generation){busy=false;controls();}}
 }
 async function history(){
  if(!data?.prepared)return;const stamp=generation,sequence=++historySequence;
  try{const result=await api('list',{month,view:'admin'},true);if(stamp!==generation||sequence!==historySequence)return;historyRows=result.lessons;historyAfter=result.before;renderHistory();}catch(error){if(stamp===generation&&sequence===historySequence)message(error.message,true);}
 }
 function renderHistory(){
  const list=host.querySelector('[data-pms-history-list]');if(list)list.innerHTML=historyRows.map(r=>'<p><strong>'+esc(r.date)+' · '+esc(r.title)+'</strong> <small>'+esc(r.state)+'</small> <button type="button" data-pms-edit="'+esc(r.id)+'">Attach / edit media</button></p>').join('')+(historyAfter?'<button type="button" data-pms-action="earlier-lessons">More lessons in this month</button>':'');
 }
 async function click(event){
  const grantAction=event.target.closest('[data-pms-grant-action]')?.dataset.pmsGrantAction;
  if(grantAction){if(busy)return;if(grantAction==='save'||grantAction==='retry'){await saveGrants();return;}if(grantAction==='close'&&grantEditor){if(grantEditor.pending){message('Retry the pending save before closing.',true);return;}if(v2){await grantsForm?.discard();grantsForm?.dispose();grantsForm=null;grantsReady=false;}grantEditor=null;renderGrants();controls();message('');}return;}
  const grant=event.target.closest('[data-pms-grants]');if(grant){if(!busy)await openGrants(grant.dataset.pmsGrants);return;}
  const tab=event.target.closest('[data-pms-tab]');if(tab){if(tab.dataset.pmsTab===mode)return;if((tab.dataset.pmsTab==='monthly'?!canBrowse(true):!canLeave())||tab.dataset.pmsTab==='monthly'&&window.M4L_PROGRAM_PEOPLE?.canLeave()===false)return;mode=tab.dataset.pmsTab;tabs();if(mode==='monthly')await load();return;}
  const year=event.target.closest('[data-pms-year]');if(year){if(busy||pending)return;const y=Number(year.dataset.pmsYear);expanded.has(y)?expanded.delete(y):expanded.add(y);renderGrid();host.querySelector('[data-pms-year="'+y+'"]')?.focus?.({preventScroll:true});return;}
  const edit=event.target.closest('[data-pms-edit]');if(edit){if(!canLeave())return;await window.M4L_LESSON_MEDIA.manage({hostId:'pms-media-editor',activityKey:'PROGRAM:'+program,lessonId:edit.dataset.pmsEdit});return;}
  const action=event.target.closest('[data-pms-action]')?.dataset.pmsAction;if(!action||busy)return;
  if(action==='retry'){if(v2)return;if(pending)await transact(pending.action,pending.input);return;}
  if(action==='discard'){if(v2){await monthsForm?.discard();renderGrid();return;}if(pending){message('Retry the pending save before discarding.',true);return;}drafts.clear();draftRevision=null;host.querySelector('[data-pms-review]').replaceChildren();renderGrid();message('Edits discarded.');return;}
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
  if(v2){await submitHistoricalV2(form);return;}
  const values=new FormData(form),input=historyRequest||{date:values.get('date'),title:values.get('title'),classIds:[...form.querySelectorAll('[data-pms-class]:checked')].map(c=>c.value),operationId:form.dataset.operation||crypto.randomUUID()};
  form.dataset.operation=input.operationId;historyRequest=input;busy=true;controls();message('Creating historical lesson…');const stamp=generation;
  try{
   const result=await api('historical-create',input,true);if(stamp!==generation)return;month=input.date.slice(0,7);historicalDirty=false;historyRequest=null;busy=false;delete form.dataset.operation;
   form.reset?.();form.querySelector('[type=submit]').textContent='Add historical lesson';host.querySelector('[data-pms-history-month]').value=month;await history();await window.M4L_LESSON_MEDIA.manage({hostId:'pms-media-editor',activityKey:'PROGRAM:'+program,lessonId:result.lessonId});
  }catch(error){if(stamp===generation){if(error.status&&error.status<500)historyRequest=null;message(error.message,true);const button=form.querySelector('[type=submit]');if(button&&historyRequest)button.textContent='Retry adding this lesson';}}
  finally{if(stamp===generation){busy=false;controls();}}
 }
 function reset(){
  for(const entry of policyForms.values()){entry.form.dispose();entry.root.remove();}policyForms.clear();unregisterPolicy?.();unregisterPolicy=null;historicalForm?.dispose();historicalForm=null;historicalVersion=null;historicalCheckpoint=Promise.resolve();monthsForm?.dispose();grantsForm?.dispose();monthsForm=null;grantsForm=null;monthsReady=false;grantsReady=false;checkpoint=Promise.resolve();grantCheckpoint=Promise.resolve();generation++;request++;historySequence++;owner='';program='';grantEditor=null;drafts.clear();students.clear();expanded.clear();pending=null;draftRevision=null;historicalDirty=false;historyRequest=null;busy=false;data=null;search='';month='';historyRows=[];historyAfter=null;
  if(host){host.querySelector('[data-pms-content]').replaceChildren();host.querySelector('[data-pms-tab="monthly"]').hidden=true;mode='participants';tabs();}
 }
 async function manageGrants(accountId){if(!canLeave()||window.M4L_PROGRAM_PEOPLE?.canLeave()===false)return;if(!data?.surahGrantsAvailable||!data?.prepared){message('Prepare the Tafseer monthly register before adding Surah access.',true);return;}mode='monthly';tabs();await openGrants(accountId);}
 async function mount(container,id,options){if(!canLeave())return false;unmount();external={...options,host:container};const year=new Date().getFullYear();years=[year-2,year-1,year];await select(id);return true;}
 function unmount(){reset();years=[2024,2025,2026];if(external){host?.remove();host=null;external=null;}}
 window.M4L_PROGRAM_MONTHLY={mount,unmount,select,manageGrants,canLeave,isOpen:()=>mode==='monthly',dirty:()=>grantDirty()||drafts.size>0||Boolean(pending)||historicalDirty||Boolean(historyRequest)||busy};
 if(v2)window.addEventListener('academy-v2-revalidate',()=>{if(!program)return;void (async()=>{if(grantEditor&&grantsForm)await grantsForm.revalidate();else if(monthsForm){await monthsForm.revalidate();if(historicalForm)await historicalForm.revalidate();}else await load();controls();})().catch(error=>message(error.message,true));});
 window.addEventListener('beforeunload',e=>{if(grantDirty()||drafts.size||pending||historicalDirty||historyRequest||busy){e.preventDefault();e.returnValue='';}});
 window.addEventListener('m4l-academy-session',reset);window.addEventListener('m4l-academy-session-ended',reset);window.addEventListener('storage',e=>{if(e.key==='m4l_account_token'||e.key===null)reset();});
})();
