(() => {
  'use strict';
  const $=id=>document.getElementById(id),root=$('ma-root');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const v2=location.origin==='https://ummabbadacademy.app'&&document.querySelector('meta[name=uaa-auth-version]')?.content==='2';let auth=null,nativeForm=null,nativeModel=null,nativeReady=false,nativeReviewing=false,readUnregister=null,viewResult=null,checkpoint=Promise.resolve(),checkpointPending=false;const client=async()=>auth||(auth=await window.M4L_ACADEMY_AUTH.ready);
  const token=()=>v2?(window.M4L_ACADEMY_AUTH?.ownerKey()||''):localStorage.getItem('m4l_account_token')||'',KEY='m4l_memorisation_admin_pending_v1';
  let epoch=0,session='',owner='',scope={},data=null,tab='sets',selected='',editor=null,dirty=false,upload=null,users=null,query='',offset=0,busy=false,loading=false,pending=null,conflict=false,message='',failed=false;
  const locked=()=>busy||Boolean(pending)||conflict||nativeReviewing;
  function reset(){clearNative();checkpoint=Promise.resolve();checkpointPending=false;nativeReviewing=false;epoch++;session='';owner='';data=null;editor=null;dirty=false;upload=null;users=null;query='';offset=0;selected='';tab='sets';busy=false;loading=false;pending=null;conflict=false;message='';root.replaceChildren();}
  function canLeave(){if(v2&&checkpointPending){status('Finishing the encrypted draft. Please try leaving again in a moment.');return false;}if(busy||pending||nativeReviewing){status('Finish or retry the pending save before leaving administration.',true);return false;}return !(dirty||upload)||window.confirm(v2?'Leave these edits and keep their encrypted draft for this session?':'Discard your unsaved administration changes?');}
  function status(text,error=false){message=text;failed=error;const node=$('ma-status');if(node){node.textContent=text;node.dataset.error=String(error);}}
  function clearNative(){nativeForm?.dispose();nativeForm=null;nativeModel=null;nativeReady=false;readUnregister?.();readUnregister=null;}
  const cleanSet=e=>e?JSON.parse(JSON.stringify({id:e.id||'',name:e.name||'',subject:e.subject||'',level:e.level||'',tasks:(e.tasks||[]).map(t=>typeof t==='string'?t:{id:t.id,name:t.name,moduleId:t.moduleId}),activityKeys:[...(e.activityKeys||[])],restricted:Boolean(e.restricted)})):null;
  function snapshot(model=nativeModel){return model?.kind==='catalogue'?{selected,editor:cleanSet(editor),sets:upload?upload.map(cleanSet):null,tab:['sets','upload'].includes(tab)?tab:'sets'}:{change:model?.change?structuredClone(model.change):null};}
  function persist(){if(!v2||!nativeForm||!nativeModel)return;const saved=snapshot();nativeModel.last=structuredClone(saved);const model=nativeModel,pendingWrite=nativeForm.checkpoint(saved);checkpoint=pendingWrite;checkpointPending=true;pendingWrite.then(()=>{if(checkpoint===pendingWrite)checkpointPending=false;},e=>{if(checkpoint===pendingWrite)checkpointPending=false;if(nativeModel===model)status(e.message,true);});}
  function reveal(value){if(!v2)return;if(!auth.isCurrentResult(value))throw Object.assign(Error('The administration view changed.'),{stale:true});if(!nativeForm){readUnregister?.();root.style.visibility='';root.inert=false;readUnregister=auth.registerPrivateRoot(root);}auth.revealResult(value,{root});window.M4L_ACADEMY_STARTUP?.complete?.();}
  async function readNative(model){let result;if(model.kind==='card'){result=await request('card-get',{accountId:model.resource.accountId});model.row=result;model.version=result.revision;if(users){const row=users.users.find(x=>x.id===result.accountId);if(row)Object.assign(row,{active:result.active,revision:result.revision});}}else{result=await request('get',{view:'admin',...scope});data=result;if(tab==='users'&&data.canImport)users=await request('cards',{query,offset});if(model.kind==='activity'){model.row=result.activities.find(x=>x.id===model.resource.activityKey);if(!model.row)throw Error('This learning area is no longer available.');model.version=model.row.revision;}else model.version=data.revision;}viewResult=result;render();return result;}
  async function prepareNative(kind='catalogue',change=null){const c=await client(),resource=kind==='card'?{type:'academy-memorisation-user-card',accountId:change.accountId}:kind==='activity'?{type:'academy-memorisation-activity',activityKey:change.activityKey}:{type:'academy-memorisation-catalogue'};
   if(nativeForm&&JSON.stringify(nativeModel.resource)===JSON.stringify(resource)){if(change)nativeModel.change=structuredClone(change);return {};}
   await c.prepareBusiness();clearNative();root.style.visibility='';root.inert=false;readUnregister=c.registerPrivateRoot(root);const model={kind,resource,epoch,change:change?structuredClone(change):null,row:null,version:0,last:null};nativeModel=model;const value=await readNative(model);model.last=snapshot(model);const {createAcademyNativeForm}=await import('/js/m4l-v111-editor.mjs');if(model.epoch!==epoch||nativeModel!==model)throw Object.assign(Error('The administration view changed.'),{stale:true});readUnregister?.();readUnregister=null;root.style.visibility='';root.inert=false;const candidate=await createAcademyNativeForm({client:c,resource,roots:[root],host:document.body,capture:()=>model.epoch===epoch?snapshot(model):model.last,baseVersion:()=>model.version,isDirty:()=>kind==='catalogue'?dirty||Boolean(upload):Boolean(model.change),readCurrent:()=>readNative(model),applyCurrent:async result=>{if(kind==='catalogue'){editor=selected?cleanSet(data.sets.find(x=>x.id===selected)):null;dirty=false;upload=null;}else model.change=null;viewResult=result;render();},applyRetained:saved=>{if(kind==='catalogue'){selected=typeof saved.selected==='string'?saved.selected:'';editor=cleanSet(saved.editor);upload=Array.isArray(saved.sets)?saved.sets.map(cleanSet):null;tab=saved.tab==='upload'?'upload':'sets';dirty=Boolean(editor);}else{model.change=saved.change?structuredClone(saved.change):null;if(model.change&&model.row)model.change.revision=model.row.revision;}render();},status});if(model.epoch!==epoch||nativeModel!==model){candidate.dispose();throw Object.assign(Error('The administration view changed.'),{stale:true});}nativeForm=candidate;const opened=await nativeForm.open(value);nativeReady=true;render();return opened;
  }
  async function saveNative(action,input){if(busy||nativeReviewing)return;const kind=action==='card-active'?'card':action==='activity-active'?'activity':'catalogue',g=epoch;busy=true;render();let attempt;try{await checkpoint;const opened=await prepareNative(kind,input);if(opened?.manualReview)return;if(!nativeReady)throw Error('Prepare protected native recovery before saving.');await checkpoint;const packet={...JSON.parse(JSON.stringify(input)),operationId:crypto.randomUUID()};attempt=await nativeForm.beforeMutation({action,input:packet},{sensitive:true});let result=await request(action,packet);if(g!==epoch)return;result=await nativeForm.completeNativeMutation(attempt,result,{operationId:packet.operationId});dirty=false;upload=null;nativeModel.change=null;await nativeForm.saved();if(['set-save','module-save'].includes(action))selected=result.moduleId;if(action==='card-active')window.dispatchEvent(new CustomEvent('m4l-memorisation-card-updated',{detail:{own:result.accountId===data.accountId,active:result.active}}));clearNative();await load();message=action==='activity-active'?'Class progress access updated.':action==='card-active'?'User card updated.':action==='import'?'Sets saved.':'Set saved.';failed=false;}catch(e){if(e.stale||g!==epoch)return;if(attempt){nativeReviewing=true;await nativeForm.unknown(attempt);nativeReviewing=false;}status(e.message,true);}finally{if(g===epoch){busy=false;nativeReviewing=false;render();}}
  }
  async function request(action,input={}){
    const s=session,g=epoch;if(v2){const c=await client(),result=await c.request('/api/academy/progress/'+action,input,{headers:{'X-Academy-Workspace':'ADMIN'}});if(g!==epoch||s!==token()||!c.isCurrentResult(result))throw Object.assign(Error('The administration view changed.'),{stale:true});return result;}const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/academy/progress/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s}`},body:JSON.stringify(input)});
    const result=await response.json();if(g!==epoch||s!==token())throw Object.assign(Error('The Academy account changed.'),{stale:true});
    if(!response.ok||!result.success){if(response.status===401)window.dispatchEvent(new Event('m4l-academy-session-ended'));throw Object.assign(Error(result.error||'Administration is temporarily unavailable.'),{status:response.status});}return result;
  }
  async function open(options={}){
    if(v2){await client();await auth.ensureFresh();}
    if(session===token()&&(data||loading)&&JSON.stringify(scope)===JSON.stringify(options))return;
    reset();scope=options;session=token();if(!session){root.innerHTML='<p>Sign in with an administrator account.</p>';return;}
    const g=epoch;loading=true;root.innerHTML='<p role="status">Loading administration…</p>';
    try{
      owner=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(session)))].map(b=>b.toString(16).padStart(2,'0')).join('');if(g!==epoch||session!==token())return;
      if(!v2)try{const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');if(saved?.owner===owner&&['set-save','module-save','import','card-active','activity-active'].includes(saved.action))pending=saved;else if(saved)sessionStorage.removeItem(KEY);}catch{}
      if(pending?.action==='activity-active')tab='areas';else if(pending?.action==='card-active')tab='users';else if(pending?.action==='import')tab='upload';
      await load();
    }catch(e){if(!e.stale&&g===epoch)root.innerHTML=`<p role="alert">${esc(e.message)}</p><button class="ma-secondary" data-ma="reload">Try again</button>`;}
    finally{if(g===epoch)loading=false;}
  }
  async function load(){
    data=await request('get',{view:'admin',...scope});viewResult=data;
    if(tab==='users'&&data.canImport)users=await request('cards',{query,offset});
    if(selected){const m=data.sets.find(m=>m.id===selected);editor=m?JSON.parse(JSON.stringify(m)):null;}
    if(['set-save','module-save'].includes(pending?.action)){editor=JSON.parse(JSON.stringify(pending.input));editor.id=editor.moduleId||'';selected=editor.id;}
    if(pending?.action==='import')upload=JSON.parse(JSON.stringify((pending.input.sets||pending.input.modules)));
    render();if(v2){if(data.canImport)await prepareNative();else reveal(data);}
  }
  function accessFields(model,index='set'){
    const keys=model.activityKeys||[],restricted=model.restricted??Boolean(keys.length);
    return `<fieldset class="ma-access"><legend>Who can use this set?</legend><label>Availability<select data-access-mode="${index}"><option value="PUBLIC" ${!restricted?'selected':''}>Public — everyone, including visitors</option><option value="RESTRICTED" ${restricted?'selected':''}>Selected Programs or Courses only</option></select></label>${restricted?`<p>Choose one or more learning areas. This set will be hidden from the public.</p><div class="ma-access-choices">${(data.activities||[]).map(a=>`<label><input type="checkbox" data-access-area="${index}" data-area-id="${esc(a.id)}" ${keys.includes(a.id)?'checked':''}><span>${esc(a.name)}<small>${a.kind==='PROGRAM'?'Program':'Course'}</small></span></label>`).join('')}</div>`:'<p>Visitors can try this set. Registered users can save their progress.</p>'}</fieldset>`;
  }
  function areasView(){return `<section class="ma-panel ma-areas-panel"><span class="ma-eyebrow">Class progress</span><h2>Programs and Courses</h2><p>Exclude a learning area to remove its class cards and grids. Saved personal progress is kept. Choose how many learners appear in each class card before paging. Class grids use Program classes only; Courses do not create classes here.</p><div class="ma-user-list ma-area-list">${(data.activities||[]).map(a=>`<article class="ma-user-row ma-area-row"><div><strong>${esc(a.name)}</strong><small>${a.kind==='PROGRAM'?'Program':'Course'}</small></div><label class="ma-switch"><input type="checkbox" data-activity-active="${esc(a.id)}" ${a.active?'checked':''}><span class="ma-switch-track" aria-hidden="true"></span><span>${a.active?'Included':'Excluded'}</span><span class="sr-only"> ${esc(a.name)}</span></label><label class="ma-card-limit">Learners per class card<select data-card-limit="${esc(a.id)}" ${a.kind!=='PROGRAM'?'disabled':''}>${[5,10,15,20,30,40,50].map(n=>`<option value="${n}" ${a.learnersPerCard===n?'selected':''}>${n}</option>`).join('')}</select></label></article>`).join('')}</div></section>`;}
  function moduleEditor(){
    if(!editor)return '<div class="ma-empty"><span class="ma-empty-symbol" aria-hidden="true">✧</span><h2>Make space for steady progress</h2><p>Select a set to edit its details and items, or create a new set. These memorisation sets are separate from curriculum modules.</p><button class="ma-primary" data-ma="new">Create a set</button></div>';
    return `<section class="ma-editor"><div class="ma-section-heading"><div><span class="ma-eyebrow">${editor.id?'Edit set':'New set'}</span><h2>${esc(editor.name||'A new beginning')}</h2></div><button class="ma-primary" data-ma="save-set" ${locked()||!dirty?'disabled':''}>Save set</button></div>
      <div class="ma-fields"><label class="ma-wide">Set name<input data-field="name" value="${esc(editor.name)}" maxlength="160" placeholder="e.g. Daily duas"></label><label>Subject<select data-field="subject"><option value="SURAHS" ${editor.subject==='SURAHS'?'selected':''}>Surahs</option><option value="DUAS" ${editor.subject==='DUAS'?'selected':''}>Duas</option></select></label><label>Level<input data-field="level" value="${esc(editor.level)}" maxlength="60" placeholder="e.g. Foundation"></label></div>
      ${accessFields(editor)}<div class="ma-section-heading ma-items-heading"><div><h3>Memorisation items</h3><p>Rename an item or move it to another set. Saved progress follows an item when it moves.</p></div><button class="ma-secondary" data-ma="add-item" ${editor.tasks.length>=100?'disabled':''}>+ Add item</button></div>
      <ol class="ma-items">${editor.tasks.map((t,i)=>`<li><span class="ma-item-number">${i+1}</span><label class="ma-item-name"><span class="sr-only">Item ${i+1} name</span><input data-item-name="${i}" value="${esc(t.name)}" maxlength="240" placeholder="Item name"></label><label class="ma-item-destination"><span class="sr-only">Destination set for item ${i+1}</span><select data-item-set="${i}"><option value="${esc(editor.id)}">This set</option>${data.sets.filter(m=>m.id!==editor.id).map(m=>`<option value="${esc(m.id)}" ${t.moduleId===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label><button class="ma-icon-button" data-remove-item="${i}" aria-label="Remove item ${i+1}">×</button></li>`).join('')}</ol>
      <details class="ma-paste"><summary>Add several items at once</summary><label>One item per line<textarea id="ma-paste-items" rows="4" placeholder="First item&#10;Second item"></textarea></label><button class="ma-secondary" data-ma="paste-items">Add to this set</button></details>
      <p class="ma-note">Removing an item also removes its saved learner progress when you save. Renaming items keeps their progress.</p></section>`;
  }
  function modulesView(){
    if(!data.canImport)return `<section class="ma-panel"><h2>Memorisation set catalogue</h2><p>A Global Admin manages the shared sets and user cards. Your Program’s class cards are available from Surahs and Duas in the Teach row.</p><div class="ma-readonly-sets">${data.sets.map(m=>`<article><span class="ma-eyebrow">${m.subject==='SURAHS'?'Surahs':'Duas'} · Level ${esc(m.level)}</span><h3>${esc(m.name)}</h3><p>${m.tasks.length} items</p></article>`).join('')}</div></section>`;
    return `<div class="ma-workbench"><aside class="ma-set-list" aria-label="Set list"><div class="ma-list-heading"><h2>Sets</h2><button class="ma-secondary" data-ma="new">+ New</button></div><label class="sr-only" for="ma-set-search">Find a set</label><input id="ma-set-search" placeholder="Find a set…" type="search">${['SURAHS','DUAS'].map(s=>`<h3>${s==='SURAHS'?'Surahs':'Duas'}</h3>${data.sets.filter(m=>m.subject===s).map(m=>`<button class="ma-set-choice" data-edit-set="${esc(m.id)}" aria-pressed="${selected===m.id}" data-set-name="${esc(m.name.toLowerCase())}"><strong>${esc(m.name)}</strong><span>Level ${esc(m.level)} · ${m.tasks.length} items · ${m.activityKeys?.length?'Restricted':'Public'}</span></button>`).join('')}`).join('')}</aside>${moduleEditor()}</div>`;
  }
  function uploadView(){return `<section class="ma-panel"><div class="ma-section-heading"><div><span class="ma-eyebrow">Bring your list</span><h2>Upload sets</h2><p>Choose an Excel (.xlsx) or CSV file, then review the subject and level of each set.</p></div></div><label class="ma-upload-zone">Choose a list<input id="ma-file" type="file" accept=".xlsx,.csv"></label><p class="ma-note">Use SetName and TaskName columns (older ModuleName lists also work). Subject and Level are optional. The first worksheet is read.</p>${upload?`<div class="ma-section-heading"><h3>${upload.length} sets · ${upload.reduce((n,m)=>n+m.tasks.length,0)} items</h3><button class="ma-primary" data-ma="save-upload">Save sets</button></div><div class="ma-upload-preview">${upload.map((m,i)=>`<article><h3>${esc(m.name)} <small>· ${m.tasks.length} items</small></h3><div class="ma-fields"><label>Subject<select data-upload-subject="${i}"><option value="">Choose subject</option><option value="SURAHS" ${m.subject==='SURAHS'?'selected':''}>Surahs</option><option value="DUAS" ${m.subject==='DUAS'?'selected':''}>Duas</option></select></label><label>Level<input data-upload-level="${i}" value="${esc(m.level)}" maxlength="60"></label></div>${accessFields(m,i)}<details><summary>Review items</summary><ul>${m.tasks.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></details></article>`).join('')}</div><label>Import option<select id="ma-import-mode"><option value="ADD">Add new sets</option><option value="REPLACE">Replace matching sets and reset their progress</option></select></label>`:''}</section>`;}
  function usersView(){
    const roleName=r=>({GLOBAL_ADMIN:'Global Admin',PROGRAM_ADMIN:'Program Admin',TEACHER:'Teacher',STUDENT:'Student'})[r]||r;
    return `<section class="ma-panel"><div class="ma-section-heading"><div><span class="ma-eyebrow">Personal learning</span><h2>User cards</h2><p>Switch off personal memorisation cards for users who do not need them. Their saved progress and teaching access are kept.</p></div></div><form id="ma-user-search-form" class="ma-search"><label class="sr-only" for="ma-user-search">Find a user</label><input id="ma-user-search" type="search" value="${esc(query)}" placeholder="Search name or account ID" maxlength="80"><button class="ma-secondary" type="submit">Search</button></form><div class="ma-user-list">${users?.users.map(u=>`<article class="ma-user-row"><div><strong>${esc(u.name)}</strong><small>${esc(u.loginId)} · ${esc(u.roles.map(roleName).join(' · ')||'No assigned role')}${!u.accountActive?' · Account inactive':''}</small></div><label class="ma-switch"><input type="checkbox" data-user-card="${esc(u.id)}" ${u.active?'checked':''}><span class="ma-switch-track" aria-hidden="true"></span><span>Card ${u.active?'active':'inactive'}</span><span class="sr-only"> for ${esc(u.name)}</span></label></article>`).join('')||'<p>No users match your search.</p>'}</div><div class="ma-pager"><button class="ma-secondary" data-user-page="-1" ${!offset?'disabled':''}>Previous</button><span>${users?.total?`${offset+1}–${Math.min(offset+20,users.total)} of ${users.total}`:'0 users'}</span><button class="ma-secondary" data-user-page="1" ${!users||offset+20>=users.total?'disabled':''}>Next</button></div></section>`;
  }
  function render(){
    if(!data)return;
    const view=data.canImport?tab:'sets';
    root.innerHTML=`<div class="ma-shell"><nav class="ma-navigation" aria-label="Memorisation administration"><div><span class="ma-eyebrow">Set catalogue</span><h2>Surahs<br>and Duas</h2></div>${[['sets','Sets'],['upload','Upload a list'],['users','User cards'],['areas','Programs and Courses']].filter(([t])=>data.canImport||t==='sets').map(([t,label])=>`<button data-tab="${t}" aria-current="${t===view?'page':'false'}">${label}</button>`).join('')}<p>Memorisation sets.<br>Personal journeys.</p></nav><div class="ma-content"><div class="ma-topline"><span>${data.sets.length} sets · ${data.sets.reduce((n,m)=>n+m.tasks.length,0)} items</span><button class="ma-secondary" data-ma="refresh" data-page-content-refresh>Refresh</button></div><p class="ma-status" id="ma-status" role="status" aria-live="polite" data-error="${failed}">${esc(message)}</p>${v2&&nativeModel?.kind!=='catalogue'&&nativeModel?.change?'<p><button type="button" class="ma-primary" data-ma="save-reviewed-setting">Save reviewed setting</button></p>':''}${pending?'<div class="ma-recovery"><p>A save needs confirmation. Retry to check whether it was received.</p><button class="ma-primary" data-ma="retry">Retry save</button></div>':conflict?'<div class="ma-recovery"><p>Saved information changed. Refresh and review before editing again.</p></div>':''}${view==='sets'?modulesView():view==='upload'?uploadView():view==='areas'?areasView():usersView()}</div></div>`;
    root.querySelectorAll('button,input,select,textarea').forEach(n=>{if(busy||v2&&data.canImport&&!nativeReady||(pending||conflict)&&!['retry','refresh'].includes(n.dataset.ma))n.disabled=true;});
  }
  async function save(action,input){
    if(v2)return saveNative(action,input);
    if(locked())return;pending={owner,action,input:JSON.parse(JSON.stringify({...input,operationId:crypto.randomUUID()}))};
    try{sessionStorage.setItem(KEY,JSON.stringify(pending));}catch{pending=null;status('Allow tab storage so interrupted saves can be retried safely.',true);return;}
    await transmit();
  }
  async function transmit(){
    if(v2)return;if(!pending||busy)return;busy=true;render();status('Saving…');const g=epoch,operation=pending;
    try{
      const result=await request(operation.action,operation.input);if(g!==epoch)return;
      pending=null;sessionStorage.removeItem(KEY);dirty=false;conflict=false;upload=null;
      if(['set-save','module-save'].includes(operation.action))selected=result.moduleId;
      if(operation.action==='card-active')window.dispatchEvent(new CustomEvent('m4l-memorisation-card-updated',{detail:{own:result.accountId===data.accountId,active:result.active}}));
      message=operation.action==='activity-active'?'Class progress access updated.':operation.action==='card-active'?'User card updated.':operation.action==='import'?'Sets saved.':'Set saved.';failed=false;await load();
    }catch(e){if(e.stale||g!==epoch)return;if(e.status&&e.status<500&&e.status!==429){pending=null;sessionStorage.removeItem(KEY);conflict=e.status===409;}status(e.message,true);}
    finally{if(g===epoch){busy=false;render();}}
  }
  async function refresh(){if(v2&&nativeForm){if(!busy&&!nativeReviewing)await nativeForm.revalidate();render();return;}if(busy||pending)return;if((dirty||upload)&&!window.confirm('Discard your edits and reload the saved information?'))return;dirty=false;upload=null;conflict=false;busy=true;render();try{await load();status('Saved information refreshed.');}catch(e){if(!e.stale)status(e.message,true);}finally{busy=false;render();}}
  root.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b||b.disabled)return;
    try{
      const action=b.dataset.ma;
      if(action==='retry'){if(!v2)await transmit();return;}if(action==='save-reviewed-setting'){if(nativeModel?.change)await saveNative(nativeModel.kind==='card'?'card-active':'activity-active',nativeModel.change);return;}if(action==='reload'){session='';await open(scope);return;}if(action==='refresh'){await refresh();return;}
      if(b.dataset.tab||b.dataset.editSet||action==='new'){
        if(!canLeave())return;dirty=false;upload=null;conflict=false;
        if(b.dataset.tab){tab=b.dataset.tab;if(tab==='users'){busy=true;render();users=await request('cards',{query,offset});busy=false;}}
        if(b.dataset.editSet){selected=b.dataset.editSet;editor=JSON.parse(JSON.stringify(data.sets.find(m=>m.id===selected)));}
        if(action==='new'){selected='';editor={id:'',name:'',subject:'DUAS',level:'',tasks:[{name:''}],activityKeys:[]};dirty=true;tab='sets';}
        render();persist();return;
      }
      if(action==='add-item'){editor.tasks.push({name:''});dirty=true;render();persist();root.querySelectorAll('[data-item-name]')[editor.tasks.length-1]?.focus();return;}
      if(b.dataset.removeItem!==undefined){editor.tasks.splice(Number(b.dataset.removeItem),1);dirty=true;render();persist();return;}
      if(action==='paste-items'){const items=$('ma-paste-items').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);if(editor.tasks.length+items.length>100)throw Error('Keep each set within 100 items.');editor.tasks.push(...items.map(name=>({name})));dirty=true;render();persist();return;}
      if(action==='save-set'){
        const old=data.sets.find(m=>m.id===editor.id),removed=old?.tasks.filter(t=>!editor.tasks.some(e=>e.id===t.id)).length||0;
        if(editor.restricted&&!editor.activityKeys?.length)throw Error('Choose at least one Program or Course for a restricted set.');
        if(removed&&!window.confirm(`Remove ${removed} items and their saved learner progress?`))return;
        await save('set-save',{catalogueRevision:data.revision,moduleId:editor.id||undefined,name:editor.name,subject:editor.subject,level:editor.level,tasks:editor.tasks,activityKeys:editor.activityKeys||[],confirmRemoval:Boolean(removed)});return;
      }
      if(action==='save-upload'){
        if(!upload?.length||upload.some(m=>!m.subject||!m.level.trim()))throw Error('Choose a subject and level for every set.');
        if(upload.some(m=>m.restricted&&!m.activityKeys?.length))throw Error('Choose a Program or Course for each restricted set.');
        const mode=$('ma-import-mode').value;if(mode==='REPLACE'&&!window.confirm('Replace matching sets and clear their learner progress?'))return;
        await save('import',{catalogueRevision:data.revision,sets:upload,mode});return;
      }
      if(b.dataset.userPage){offset+=Number(b.dataset.userPage)*20;busy=true;render();users=await request('cards',{query,offset});busy=false;render();}
    }catch(e){busy=false;if(!e.stale){status(e.message,true);render();}}
  });
  root.addEventListener('input',event=>{
    const n=event.target;if(locked())return;
    if(n.id==='ma-set-search'){root.querySelectorAll('[data-set-name]').forEach(b=>b.hidden=!b.dataset.setName.includes(n.value.toLowerCase()));return;}
    if(n.dataset.field){editor[n.dataset.field]=n.value;dirty=true;}
    if(n.dataset.itemName!==undefined){editor.tasks[Number(n.dataset.itemName)].name=n.value;dirty=true;}
    if(n.dataset.uploadLevel!==undefined)upload[Number(n.dataset.uploadLevel)].level=n.value;
    if(v2&&n.id!=='ma-set-search')persist();
    const saveButton=root.querySelector('[data-ma="save-set"]');if(saveButton)saveButton.disabled=!dirty;
  });
  root.addEventListener('change',async event=>{
    const n=event.target;if(locked())return;
    try{
      if(n.dataset.field){editor[n.dataset.field]=n.value;dirty=true;root.querySelector('[data-ma="save-set"]').disabled=false;}
      if(n.dataset.accessMode!==undefined){const model=n.dataset.accessMode==='set'?editor:upload[Number(n.dataset.accessMode)];model.restricted=n.value==='RESTRICTED';if(!model.restricted)model.activityKeys=[];if(model===editor)dirty=true;render();}
      if(n.dataset.accessArea!==undefined){const model=n.dataset.accessArea==='set'?editor:upload[Number(n.dataset.accessArea)];model.activityKeys=(model.activityKeys||[]).filter(k=>k!==n.dataset.areaId);if(n.checked)model.activityKeys.push(n.dataset.areaId);if(model===editor)dirty=true;root.querySelector('[data-ma="save-set"]')?.removeAttribute('disabled');}
      if(n.dataset.cardLimit){const a=data.activities.find(a=>a.id===n.dataset.cardLimit);await save('activity-active',{activityKey:a.id,active:a.active,learnersPerCard:Number(n.value),revision:a.revision});}
      if(n.dataset.activityActive){const a=data.activities.find(a=>a.id===n.dataset.activityActive);await save('activity-active',{activityKey:a.id,active:n.checked,revision:a.revision});}
      if(n.dataset.itemSet!==undefined){editor.tasks[Number(n.dataset.itemSet)].moduleId=n.value;dirty=true;root.querySelector('[data-ma="save-set"]').disabled=false;}
      if(n.dataset.uploadSubject!==undefined)upload[Number(n.dataset.uploadSubject)].subject=n.value;
      if(n.id==='ma-file'){const file=n.files[0];if(!file)return;const g=epoch;busy=true;status('Reading your list…');const version=v2?auth.getState().viewVersion:null,parsed=await window.M4L_MEMORISATION_UPLOAD.read(file);if(g!==epoch||v2&&(version!==auth.getState().viewVersion||!auth.isCurrentResult(viewResult)))return;upload=parsed;busy=false;status('Review the subjects and levels before saving.');render();persist();}
      if(n.dataset.userCard){const u=users.users.find(u=>u.id===n.dataset.userCard);await save('card-active',{accountId:u.id,revision:u.revision,active:n.checked});}
      if(v2&&n.id!=='ma-file')persist();
    }catch(e){busy=false;if(!e.stale){status(e.message,true);render();}}
  });
  root.addEventListener('submit',async event=>{if(event.target.id!=='ma-user-search-form')return;event.preventDefault();if(locked())return;query=$('ma-user-search').value;offset=0;busy=true;render();try{users=await request('cards',{query,offset});}catch(e){if(!e.stale)status(e.message,true);}finally{busy=false;render();}});
  if(v2){window.addEventListener('academy-v2-mask',e=>{if(e.detail?.masked)for(const n of root.querySelectorAll('input[type=file]'))n.value='';});window.addEventListener('academy-v2-revalidate',()=>{if(!session||busy)return;void (nativeForm?nativeForm.revalidate():load()).catch(e=>status(e.message,true));});window.addEventListener('m4l-academy-session-ended',reset);}
  window.addEventListener('beforeunload',e=>{if(dirty||upload||pending||busy){e.preventDefault();e.returnValue='';}});
  window.M4L_MEMORISATION_ADMIN={open,reset,canLeave};
})();
