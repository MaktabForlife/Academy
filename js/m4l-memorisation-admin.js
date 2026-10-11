(() => {
  'use strict';
  const $=id=>document.getElementById(id),root=$('ma-root');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token=()=>localStorage.getItem('m4l_account_token')||'',KEY='m4l_memorisation_admin_pending_v1';
  let epoch=0,session='',owner='',scope={},data=null,tab='modules',selected='',editor=null,dirty=false,upload=null,users=null,query='',offset=0,busy=false,loading=false,pending=null,conflict=false,message='',failed=false;
  const locked=()=>busy||Boolean(pending)||conflict;
  function reset(){epoch++;session='';owner='';data=null;editor=null;dirty=false;upload=null;users=null;query='';offset=0;selected='';tab='modules';busy=false;loading=false;pending=null;conflict=false;message='';root.replaceChildren();}
  function canLeave(){if(busy||pending){status('Finish or retry the pending save before leaving administration.',true);return false;}return !(dirty||upload)||window.confirm('Discard your unsaved administration changes?');}
  function status(text,error=false){message=text;failed=error;const node=$('ma-status');if(node){node.textContent=text;node.dataset.error=String(error);}}
  async function request(action,input={}){
    const s=session,g=epoch,response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/academy/progress/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s}`},body:JSON.stringify(input)});
    const result=await response.json();if(g!==epoch||s!==token())throw Object.assign(Error('The Academy account changed.'),{stale:true});
    if(!response.ok||!result.success){if(response.status===401)window.dispatchEvent(new Event('m4l-academy-session-ended'));throw Object.assign(Error(result.error||'Administration is temporarily unavailable.'),{status:response.status});}return result;
  }
  async function open(options={}){
    if(session===token()&&(data||loading)&&JSON.stringify(scope)===JSON.stringify(options))return;
    reset();scope=options;session=token();if(!session){root.innerHTML='<p>Sign in with an administrator account.</p>';return;}
    const g=epoch;loading=true;root.innerHTML='<p role="status">Loading administration…</p>';
    try{
      owner=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(session)))].map(b=>b.toString(16).padStart(2,'0')).join('');if(g!==epoch||session!==token())return;
      try{const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');if(saved?.owner===owner&&['module-save','import','card-active','activity-active'].includes(saved.action))pending=saved;else if(saved)sessionStorage.removeItem(KEY);}catch{}
      if(pending?.action==='activity-active')tab='areas';else if(pending?.action==='card-active')tab='users';else if(pending?.action==='import')tab='upload';
      await load();
    }catch(e){if(!e.stale&&g===epoch)root.innerHTML=`<p role="alert">${esc(e.message)}</p><button class="ma-secondary" data-ma="reload">Try again</button>`;}
    finally{if(g===epoch)loading=false;}
  }
  async function load(){
    data=await request('get',{view:'admin',...scope});
    if(tab==='users'&&data.canImport)users=await request('cards',{query,offset});
    if(selected){const m=data.modules.find(m=>m.id===selected);editor=m?JSON.parse(JSON.stringify(m)):null;}
    if(pending?.action==='module-save'){editor=JSON.parse(JSON.stringify(pending.input));editor.id=editor.moduleId||'';selected=editor.id;}
    if(pending?.action==='import')upload=JSON.parse(JSON.stringify(pending.input.modules));
    render();
  }
  function accessFields(model,index='module'){
    const keys=model.activityKeys||[],restricted=model.restricted??Boolean(keys.length);
    return `<fieldset class="ma-access"><legend>Who can use this module?</legend><label>Availability<select data-access-mode="${index}"><option value="PUBLIC" ${!restricted?'selected':''}>Public — everyone, including visitors</option><option value="RESTRICTED" ${restricted?'selected':''}>Selected Programs or Courses only</option></select></label>${restricted?`<p>Choose one or more learning areas. This module will be hidden from the public.</p><div class="ma-access-choices">${(data.activities||[]).map(a=>`<label><input type="checkbox" data-access-area="${index}" data-area-id="${esc(a.id)}" ${keys.includes(a.id)?'checked':''}><span>${esc(a.name)}<small>${a.kind==='PROGRAM'?'Program':'Course'}</small></span></label>`).join('')}</div>`:'<p>Visitors can try this module. Registered users can save their progress.</p>'}</fieldset>`;
  }
  function areasView(){return `<section class="ma-panel ma-areas-panel"><span class="ma-eyebrow">Class progress</span><h2>Programs and Courses</h2><p>Exclude a learning area to remove its class cards and grids. Saved personal progress is kept. Choose how many learners appear in each class card before paging. Class grids use Program classes only; Courses do not create classes here.</p><div class="ma-user-list ma-area-list">${(data.activities||[]).map(a=>`<article class="ma-user-row ma-area-row"><div><strong>${esc(a.name)}</strong><small>${a.kind==='PROGRAM'?'Program':'Course'}</small></div><label class="ma-switch"><input type="checkbox" data-activity-active="${esc(a.id)}" ${a.active?'checked':''}><span class="ma-switch-track" aria-hidden="true"></span><span>${a.active?'Included':'Excluded'}</span><span class="sr-only"> ${esc(a.name)}</span></label><label class="ma-card-limit">Learners per class card<select data-card-limit="${esc(a.id)}" ${a.kind!=='PROGRAM'?'disabled':''}>${[5,10,15,20,30,40,50].map(n=>`<option value="${n}" ${a.learnersPerCard===n?'selected':''}>${n}</option>`).join('')}</select></label></article>`).join('')}</div></section>`;}
  function moduleEditor(){
    if(!editor)return '<div class="ma-empty"><span class="ma-empty-symbol" aria-hidden="true">✧</span><h2>Make space for steady progress</h2><p>Select a module to edit its details and items, or create a new module.</p><button class="ma-primary" data-ma="new">Create a module</button></div>';
    return `<section class="ma-editor"><div class="ma-section-heading"><div><span class="ma-eyebrow">${editor.id?'Edit module':'New module'}</span><h2>${esc(editor.name||'A new beginning')}</h2></div><button class="ma-primary" data-ma="save-module" ${locked()||!dirty?'disabled':''}>Save module</button></div>
      <div class="ma-fields"><label class="ma-wide">Module name<input data-field="name" value="${esc(editor.name)}" maxlength="160" placeholder="e.g. Daily duas"></label><label>Subject<select data-field="subject"><option value="SURAHS" ${editor.subject==='SURAHS'?'selected':''}>Surahs</option><option value="DUAS" ${editor.subject==='DUAS'?'selected':''}>Duas</option></select></label><label>Level<input data-field="level" value="${esc(editor.level)}" maxlength="60" placeholder="e.g. Foundation"></label></div>
      ${accessFields(editor)}<div class="ma-section-heading ma-items-heading"><div><h3>Memorisation items</h3><p>Rename an item or move it to another module. Saved progress follows an item when it moves.</p></div><button class="ma-secondary" data-ma="add-item" ${editor.tasks.length>=100?'disabled':''}>+ Add item</button></div>
      <ol class="ma-items">${editor.tasks.map((t,i)=>`<li><span class="ma-item-number">${i+1}</span><label class="ma-item-name"><span class="sr-only">Item ${i+1} name</span><input data-item-name="${i}" value="${esc(t.name)}" maxlength="240" placeholder="Item name"></label><label class="ma-item-destination"><span class="sr-only">Destination module for item ${i+1}</span><select data-item-module="${i}"><option value="${esc(editor.id)}">This module</option>${data.modules.filter(m=>m.id!==editor.id).map(m=>`<option value="${esc(m.id)}" ${t.moduleId===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label><button class="ma-icon-button" data-remove-item="${i}" aria-label="Remove item ${i+1}">×</button></li>`).join('')}</ol>
      <details class="ma-paste"><summary>Add several items at once</summary><label>One item per line<textarea id="ma-paste-items" rows="4" placeholder="First item&#10;Second item"></textarea></label><button class="ma-secondary" data-ma="paste-items">Add to this module</button></details>
      <p class="ma-note">Removing an item also removes its saved learner progress when you save. Renaming items keeps their progress.</p></section>`;
  }
  function modulesView(){
    if(!data.canImport)return `<section class="ma-panel"><h2>Shared module catalogue</h2><p>A Global Admin manages the shared modules and user cards. Your Program’s class cards are available from Surahs and Duas in the Teach row.</p><div class="ma-readonly-modules">${data.modules.map(m=>`<article><span class="ma-eyebrow">${m.subject==='SURAHS'?'Surahs':'Duas'} · Level ${esc(m.level)}</span><h3>${esc(m.name)}</h3><p>${m.tasks.length} items</p></article>`).join('')}</div></section>`;
    return `<div class="ma-workbench"><aside class="ma-module-list" aria-label="Module list"><div class="ma-list-heading"><h2>Modules</h2><button class="ma-secondary" data-ma="new">+ New</button></div><label class="sr-only" for="ma-module-search">Find a module</label><input id="ma-module-search" placeholder="Find a module…" type="search">${['SURAHS','DUAS'].map(s=>`<h3>${s==='SURAHS'?'Surahs':'Duas'}</h3>${data.modules.filter(m=>m.subject===s).map(m=>`<button class="ma-module-choice" data-edit-module="${esc(m.id)}" aria-pressed="${selected===m.id}" data-module-name="${esc(m.name.toLowerCase())}"><strong>${esc(m.name)}</strong><span>Level ${esc(m.level)} · ${m.tasks.length} items · ${m.activityKeys?.length?'Restricted':'Public'}</span></button>`).join('')}`).join('')}</aside>${moduleEditor()}</div>`;
  }
  function uploadView(){return `<section class="ma-panel"><div class="ma-section-heading"><div><span class="ma-eyebrow">Bring your list</span><h2>Upload modules</h2><p>Choose an Excel (.xlsx) or CSV file, then review the subject and level of each module.</p></div></div><label class="ma-upload-zone">Choose a list<input id="ma-file" type="file" accept=".xlsx,.csv"></label><p class="ma-note">Use ModuleName and TaskName columns. Subject and Level are optional. The first worksheet is read.</p>${upload?`<div class="ma-section-heading"><h3>${upload.length} modules · ${upload.reduce((n,m)=>n+m.tasks.length,0)} items</h3><button class="ma-primary" data-ma="save-upload">Save modules</button></div><div class="ma-upload-preview">${upload.map((m,i)=>`<article><h3>${esc(m.name)} <small>· ${m.tasks.length} items</small></h3><div class="ma-fields"><label>Subject<select data-upload-subject="${i}"><option value="">Choose subject</option><option value="SURAHS" ${m.subject==='SURAHS'?'selected':''}>Surahs</option><option value="DUAS" ${m.subject==='DUAS'?'selected':''}>Duas</option></select></label><label>Level<input data-upload-level="${i}" value="${esc(m.level)}" maxlength="60"></label></div>${accessFields(m,i)}<details><summary>Review items</summary><ul>${m.tasks.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></details></article>`).join('')}</div><label>Import option<select id="ma-import-mode"><option value="ADD">Add new modules</option><option value="REPLACE">Replace matching modules and reset their progress</option></select></label>`:''}</section>`;}
  function usersView(){
    const roleName=r=>({GLOBAL_ADMIN:'Global Admin',PROGRAM_ADMIN:'Program Admin',TEACHER:'Teacher',STUDENT:'Student'})[r]||r;
    return `<section class="ma-panel"><div class="ma-section-heading"><div><span class="ma-eyebrow">Personal learning</span><h2>User cards</h2><p>Switch off personal memorisation cards for users who do not need them. Their saved progress and teaching access are kept.</p></div></div><form id="ma-user-search-form" class="ma-search"><label class="sr-only" for="ma-user-search">Find a user</label><input id="ma-user-search" type="search" value="${esc(query)}" placeholder="Search name or account ID" maxlength="80"><button class="ma-secondary" type="submit">Search</button></form><div class="ma-user-list">${users?.users.map(u=>`<article class="ma-user-row"><div><strong>${esc(u.name)}</strong><small>${esc(u.loginId)} · ${esc(u.roles.map(roleName).join(' · ')||'No assigned role')}${!u.accountActive?' · Account inactive':''}</small></div><label class="ma-switch"><input type="checkbox" data-user-card="${esc(u.id)}" ${u.active?'checked':''}><span class="ma-switch-track" aria-hidden="true"></span><span>Card ${u.active?'active':'inactive'}</span><span class="sr-only"> for ${esc(u.name)}</span></label></article>`).join('')||'<p>No users match your search.</p>'}</div><div class="ma-pager"><button class="ma-secondary" data-user-page="-1" ${!offset?'disabled':''}>Previous</button><span>${users?.total?`${offset+1}–${Math.min(offset+20,users.total)} of ${users.total}`:'0 users'}</span><button class="ma-secondary" data-user-page="1" ${!users||offset+20>=users.total?'disabled':''}>Next</button></div></section>`;
  }
  function render(){
    if(!data)return;
    const view=data.canImport?tab:'modules';
    root.innerHTML=`<div class="ma-shell"><nav class="ma-navigation" aria-label="Memorisation administration"><div><span class="ma-eyebrow">Manage learning</span><h2>Surahs<br>and Duas</h2></div>${[['modules','Modules'],['upload','Upload a list'],['users','User cards'],['areas','Programs and Courses']].filter(([t])=>data.canImport||t==='modules').map(([t,label])=>`<button data-tab="${t}" aria-current="${t===view?'page':'false'}">${label}</button>`).join('')}<p>One shared catalogue.<br>Personal journeys.</p></nav><div class="ma-content"><div class="ma-topline"><span>${data.modules.length} modules · ${data.modules.reduce((n,m)=>n+m.tasks.length,0)} items</span><button class="ma-secondary" data-ma="refresh">Refresh</button></div><p class="ma-status" id="ma-status" role="status" aria-live="polite" data-error="${failed}">${esc(message)}</p>${pending?'<div class="ma-recovery"><p>A save needs confirmation. Retry to check whether it was received.</p><button class="ma-primary" data-ma="retry">Retry save</button></div>':conflict?'<div class="ma-recovery"><p>Saved information changed. Refresh and review before editing again.</p></div>':''}${view==='modules'?modulesView():view==='upload'?uploadView():view==='areas'?areasView():usersView()}</div></div>`;
    root.querySelectorAll('button,input,select,textarea').forEach(n=>{if(busy||(pending||conflict)&&!['retry','refresh'].includes(n.dataset.ma))n.disabled=true;});
  }
  async function save(action,input){
    if(locked())return;pending={owner,action,input:JSON.parse(JSON.stringify({...input,operationId:crypto.randomUUID()}))};
    try{sessionStorage.setItem(KEY,JSON.stringify(pending));}catch{pending=null;status('Allow tab storage so interrupted saves can be retried safely.',true);return;}
    await transmit();
  }
  async function transmit(){
    if(!pending||busy)return;busy=true;render();status('Saving…');const g=epoch,operation=pending;
    try{
      const result=await request(operation.action,operation.input);if(g!==epoch)return;
      pending=null;sessionStorage.removeItem(KEY);dirty=false;conflict=false;upload=null;
      if(operation.action==='module-save')selected=result.moduleId;
      if(operation.action==='card-active')window.dispatchEvent(new CustomEvent('m4l-memorisation-card-updated',{detail:{own:result.accountId===data.accountId,active:result.active}}));
      message=operation.action==='activity-active'?'Class progress access updated.':operation.action==='card-active'?'User card updated.':operation.action==='import'?'Modules saved.':'Module saved.';failed=false;await load();
    }catch(e){if(e.stale||g!==epoch)return;if(e.status&&e.status<500&&e.status!==429){pending=null;sessionStorage.removeItem(KEY);conflict=e.status===409;}status(e.message,true);}
    finally{if(g===epoch){busy=false;render();}}
  }
  async function refresh(){if(busy||pending)return;if((dirty||upload)&&!window.confirm('Discard your edits and reload the saved information?'))return;dirty=false;upload=null;conflict=false;busy=true;render();try{await load();status('Saved information refreshed.');}catch(e){if(!e.stale)status(e.message,true);}finally{busy=false;render();}}
  root.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b||b.disabled)return;
    try{
      const action=b.dataset.ma;
      if(action==='retry'){await transmit();return;}if(action==='reload'){session='';await open(scope);return;}if(action==='refresh'){await refresh();return;}
      if(b.dataset.tab||b.dataset.editModule||action==='new'){
        if(!canLeave())return;dirty=false;upload=null;conflict=false;
        if(b.dataset.tab){tab=b.dataset.tab;if(tab==='users'){busy=true;render();users=await request('cards',{query,offset});busy=false;}}
        if(b.dataset.editModule){selected=b.dataset.editModule;editor=JSON.parse(JSON.stringify(data.modules.find(m=>m.id===selected)));}
        if(action==='new'){selected='';editor={id:'',name:'',subject:'DUAS',level:'',tasks:[{name:''}],activityKeys:[]};dirty=true;tab='modules';}
        render();return;
      }
      if(action==='add-item'){editor.tasks.push({name:''});dirty=true;render();root.querySelectorAll('[data-item-name]')[editor.tasks.length-1]?.focus();return;}
      if(b.dataset.removeItem!==undefined){editor.tasks.splice(Number(b.dataset.removeItem),1);dirty=true;render();return;}
      if(action==='paste-items'){const items=$('ma-paste-items').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);if(editor.tasks.length+items.length>100)throw Error('Keep each module within 100 items.');editor.tasks.push(...items.map(name=>({name})));dirty=true;render();return;}
      if(action==='save-module'){
        const old=data.modules.find(m=>m.id===editor.id),removed=old?.tasks.filter(t=>!editor.tasks.some(e=>e.id===t.id)).length||0;
        if(editor.restricted&&!editor.activityKeys?.length)throw Error('Choose at least one Program or Course for a restricted module.');
        if(removed&&!window.confirm(`Remove ${removed} items and their saved learner progress?`))return;
        await save('module-save',{catalogueRevision:data.revision,moduleId:editor.id||undefined,name:editor.name,subject:editor.subject,level:editor.level,tasks:editor.tasks,activityKeys:editor.activityKeys||[],confirmRemoval:Boolean(removed)});return;
      }
      if(action==='save-upload'){
        if(!upload?.length||upload.some(m=>!m.subject||!m.level.trim()))throw Error('Choose a subject and level for every module.');
        if(upload.some(m=>m.restricted&&!m.activityKeys?.length))throw Error('Choose a Program or Course for each restricted module.');
        const mode=$('ma-import-mode').value;if(mode==='REPLACE'&&!window.confirm('Replace matching modules and clear their learner progress?'))return;
        await save('import',{catalogueRevision:data.revision,modules:upload,mode});return;
      }
      if(b.dataset.userPage){offset+=Number(b.dataset.userPage)*20;busy=true;render();users=await request('cards',{query,offset});busy=false;render();}
    }catch(e){busy=false;if(!e.stale){status(e.message,true);render();}}
  });
  root.addEventListener('input',event=>{
    const n=event.target;if(locked())return;
    if(n.id==='ma-module-search'){root.querySelectorAll('[data-module-name]').forEach(b=>b.hidden=!b.dataset.moduleName.includes(n.value.toLowerCase()));return;}
    if(n.dataset.field){editor[n.dataset.field]=n.value;dirty=true;}
    if(n.dataset.itemName!==undefined){editor.tasks[Number(n.dataset.itemName)].name=n.value;dirty=true;}
    if(n.dataset.uploadLevel!==undefined)upload[Number(n.dataset.uploadLevel)].level=n.value;
    const saveButton=root.querySelector('[data-ma="save-module"]');if(saveButton)saveButton.disabled=!dirty;
  });
  root.addEventListener('change',async event=>{
    const n=event.target;if(locked())return;
    try{
      if(n.dataset.field){editor[n.dataset.field]=n.value;dirty=true;root.querySelector('[data-ma="save-module"]').disabled=false;}
      if(n.dataset.accessMode!==undefined){const model=n.dataset.accessMode==='module'?editor:upload[Number(n.dataset.accessMode)];model.restricted=n.value==='RESTRICTED';if(!model.restricted)model.activityKeys=[];if(model===editor)dirty=true;render();}
      if(n.dataset.accessArea!==undefined){const model=n.dataset.accessArea==='module'?editor:upload[Number(n.dataset.accessArea)];model.activityKeys=(model.activityKeys||[]).filter(k=>k!==n.dataset.areaId);if(n.checked)model.activityKeys.push(n.dataset.areaId);if(model===editor)dirty=true;root.querySelector('[data-ma="save-module"]')?.removeAttribute('disabled');}
      if(n.dataset.cardLimit){const a=data.activities.find(a=>a.id===n.dataset.cardLimit);await save('activity-active',{activityKey:a.id,active:a.active,learnersPerCard:Number(n.value),revision:a.revision});}
      if(n.dataset.activityActive){const a=data.activities.find(a=>a.id===n.dataset.activityActive);await save('activity-active',{activityKey:a.id,active:n.checked,revision:a.revision});}
      if(n.dataset.itemModule!==undefined){editor.tasks[Number(n.dataset.itemModule)].moduleId=n.value;dirty=true;root.querySelector('[data-ma="save-module"]').disabled=false;}
      if(n.dataset.uploadSubject!==undefined)upload[Number(n.dataset.uploadSubject)].subject=n.value;
      if(n.id==='ma-file'){const file=n.files[0];if(!file)return;const g=epoch;busy=true;status('Reading your list…');const parsed=await window.M4L_MEMORISATION_UPLOAD.read(file);if(g!==epoch)return;upload=parsed;busy=false;status('Review the subjects and levels before saving.');render();}
      if(n.dataset.userCard){const u=users.users.find(u=>u.id===n.dataset.userCard);await save('card-active',{accountId:u.id,revision:u.revision,active:n.checked});}
    }catch(e){busy=false;if(!e.stale){status(e.message,true);render();}}
  });
  root.addEventListener('submit',async event=>{if(event.target.id!=='ma-user-search-form')return;event.preventDefault();if(locked())return;query=$('ma-user-search').value;offset=0;busy=true;render();try{users=await request('cards',{query,offset});}catch(e){if(!e.stale)status(e.message,true);}finally{busy=false;render();}});
  window.addEventListener('beforeunload',e=>{if(dirty||upload||pending||busy){e.preventDefault();e.returnValue='';}});
  window.M4L_MEMORISATION_ADMIN={open,reset,canLeave};
})();
