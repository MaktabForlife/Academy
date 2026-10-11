(() => {
  'use strict';
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token=()=>localStorage.getItem('m4l_account_token')||'',KEY='m4l_memorisation_pending_v1';
  let generation=0,owner='',session='',data=null,mode='',group=0,moduleId='',grid=null,offset=0,busy=false,loading=false,pending=null,conflict=false,upload=null,dialogModule='',message='',error=false;
  const drafts=new Map(),key=(a,t)=>`${a}:${t}`;
  const record=(a,t)=> (mode==='classes'?grid?.records:data?.records)?.find(r=>r.accountId===a&&r.taskId===t)||{accountId:a,taskId:t,revision:0,complete:false,confirmed:false};
  const current=(a,t)=>({...record(a,t),...drafts.get(key(a,t))});
  const locked=()=>busy||Boolean(pending)||conflict;
  function status(text,failed=false){message=text;error=failed;const node=$('mp-status');if(node){node.textContent=text;node.dataset.error=String(failed);}const d=$('mp-dialog-status');if(d)d.textContent=text;}
  async function request(action,input){
    const s=session,g=generation;
    const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/academy/progress/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s}`},body:JSON.stringify(input)});
    const result=await response.json();if(g!==generation||s!==token())throw Object.assign(Error('The Academy account changed.'),{stale:true});
    if(!response.ok||!result.success){if(response.status===401)window.dispatchEvent(new Event('m4l-academy-session-ended'));throw Object.assign(Error(result.error||'Progress could not be saved.'),{status:response.status,code:result.code});}return result;
  }
  function clearPending(){pending=null;try{sessionStorage.removeItem(KEY);}catch{}}
  function canLeave(){
    if(busy||pending){status('Finish or retry the pending save before leaving Progress.',true);return false;}
    if((drafts.size||upload)&&!window.confirm('Leave Progress and discard your unsaved changes?'))return false;
    return true;
  }
  function reset(){
    generation++;$('mp-dialog')?.close();$('mp-root')?.replaceChildren();session='';owner='';data=null;grid=null;mode='';drafts.clear();pending=null;upload=null;busy=false;loading=false;conflict=false;dialogModule='';message='';
  }
  async function open(){
    if(session===token()&&(data||loading))return;
    reset();session=token();if(!session){$('mp-root').innerHTML='<p>Sign in to view your memorisation progress.</p>';return;}
    const g=generation;loading=true;$('mp-root').innerHTML='<p role="status">Loading memorisation progress…</p>';
    try{
      owner=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(session)))].map(b=>b.toString(16).padStart(2,'0')).join('');
      if(g!==generation||session!==token())return;
      try{const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');if(saved?.owner===owner&&['mark','confirm','import'].includes(saved.action))pending=saved;else if(saved)sessionStorage.removeItem(KEY);}catch{pending=null;}
      await load();
    }catch(e){if(!e.stale&&g===generation){$('mp-root').innerHTML=`<p class="mp-status" role="alert">${esc(e.message)}</p><button type="button" class="mp-secondary" data-mp="reload">Try again</button>`;}}
    finally{if(g===generation)loading=false;}
  }
  async function load(){
    data=await request('get',{});if(!mode)mode=data.student?'self':data.classes.length?'classes':'self';
    if(pending)mode=pending.action==='import'?'import':pending.action==='confirm'?'classes':'self';
    if(pending?.action==='confirm'){const index=data.classes.findIndex(c=>c.activityKey===pending.input.activityKey&&c.id===pending.input.classId);if(index>=0)group=index;const selected=data.modules.find(m=>m.tasks.some(t=>t.id===pending.input.updates[0]?.taskId));if(selected)moduleId=selected.id;}
    if(group>=data.classes.length)group=0;
    if(!data.modules.some(m=>m.id===moduleId))moduleId=data.modules[0]?.id||'';
    if(mode==='classes'&&data.classes.length)await loadGrid();else render();
  }
  async function loadGrid(){
    const c=data.classes[group];if(!c||!moduleId){grid=null;render();return;}
    grid=await request('grid',{activityKey:c.activityKey,classId:c.id,moduleId,offset});render();
  }
  function recovery(){return pending?'<div class="mp-recovery"><p>A save is awaiting confirmation. Retry it to check whether it was received.</p><button type="button" class="mp-primary" data-mp="retry">Retry save</button></div>':conflict?'<div class="mp-recovery"><p>Your changes are kept. Refresh the saved progress, review your choices, then save again.</p><button type="button" class="mp-primary" data-mp="refresh">Refresh saved progress</button></div>':'';}
  function render(){
    if(!data)return;const positions=Object.fromEntries(['SURAHS','DUAS'].map(s=>[s,$('mp-row-'+s)?.scrollLeft||0]));
    const wasOpen=$('mp-dialog')?.open,gridPosition=$('mp-root').querySelector('.mp-grid-wrap'),gridScroll=gridPosition?{left:gridPosition.scrollLeft,top:gridPosition.scrollTop}:null,focused=document.activeElement,focusAccount=focused?.dataset.confirmAccount,focusTask=focused?.dataset.confirmTask;
    $('mp-root').innerHTML=`<div class="mp-toolbar"><div class="mp-tabs" aria-label="Progress views"><button data-mp="self" aria-pressed="${mode==='self'}">${data.student?'My progress':'Module cards'}</button>${data.classes.length?`<button data-mp="classes" aria-pressed="${mode==='classes'}">Class grids</button>`:''}${data.canImport?`<button data-mp="import" aria-pressed="${mode==='import'}">Add modules</button>`:''}</div><button class="mp-secondary" data-mp="refresh" ${busy||pending?'disabled':''}>Refresh</button></div>
      <p id="mp-status" class="mp-status" role="status" aria-live="polite" data-error="${error}">${esc(message)}</p>${recovery()}
      ${mode==='self'?cards():mode==='classes'?classGrid():importView()}
      <dialog id="mp-dialog" aria-labelledby="mp-dialog-title"></dialog>`;
    for(const [subject,left] of Object.entries(positions))if($('mp-row-'+subject))$('mp-row-'+subject).scrollLeft=left;
    if(wasOpen&&dialogModule)openModule(dialogModule);
    const newGrid=$('mp-root').querySelector('.mp-grid-wrap');if(newGrid&&gridScroll){newGrid.scrollLeft=gridScroll.left;newGrid.scrollTop=gridScroll.top;}
    if(focusTask)Array.from($('mp-root').querySelectorAll('[data-confirm-task]')).find(n=>n.dataset.confirmTask===focusTask&&n.dataset.confirmAccount===focusAccount)?.focus({preventScroll:true});
    $('mp-dialog').addEventListener('cancel',e=>{if(busy||pending){e.preventDefault();return;}if(drafts.size&&!window.confirm('Close this module and discard unsaved changes?')){e.preventDefault();return;}drafts.clear();dialogModule='';});
    $('mp-root').querySelectorAll('button,input,select').forEach(n=>{if(busy||(pending||conflict)&&!['retry','refresh','close'].includes(n.dataset.mp))n.disabled=true;});
  }
  function cards(){
    const records=data.records,total=data.modules.reduce((n,m)=>n+m.tasks.length,0),complete=records.filter(r=>r.complete&&data.modules.some(m=>m.tasks.some(t=>t.id===r.taskId))).length,confirmed=records.filter(r=>r.confirmed&&data.modules.some(m=>m.tasks.some(t=>t.id===r.taskId))).length;
    return `<div class="mp-intro"><h2>Your memorisation, one step at a time</h2><p>${data.student?'Open a module and tick each surah or dua you have memorised. You can untick it whenever you need to revisit it. Your teacher will confirm your memorisation.':'Browse the Academy memorisation modules. Use Class grids to confirm your learners’ memorisation.'}</p>${data.student?`<div class="mp-summary"><div><strong>${complete}<span> / ${total}</span></strong><span>Marked memorised</span></div><div><strong>${confirmed}</strong><span>Teacher confirmed</span></div></div>`:''}</div>
      ${['SURAHS','DUAS'].map(subject=>`<section class="mp-row-section" aria-labelledby="mp-heading-${subject}"><div class="mp-row-heading"><div><h2 id="mp-heading-${subject}">${subject==='SURAHS'?'Surah modules':'Dua modules'}</h2><p>Swipe to explore your modules</p></div><div class="mp-arrows"><button data-scroll="${subject}:-1" aria-label="Previous ${subject==='SURAHS'?'Surah':'Dua'} modules">‹</button><button data-scroll="${subject}:1" aria-label="Next ${subject==='SURAHS'?'Surah':'Dua'} modules">›</button></div></div><div class="mp-row" id="mp-row-${subject}" tabindex="0" aria-label="${subject==='SURAHS'?'Surah':'Dua'} modules">${data.modules.filter(m=>m.subject===subject).map(m=>{
        const n=m.tasks.filter(t=>record(data.accountId,t.id).complete).length,c=m.tasks.filter(t=>record(data.accountId,t.id).confirmed).length;
        return `<article class="mp-card"><div class="mp-card-top"><span class="mp-level">Level ${esc(m.level)}</span><h3>${esc(m.name)}</h3><p>${m.tasks.length} ${subject==='SURAHS'?'surahs':'duas'}</p></div><div class="mp-card-bottom"><div class="mp-count"><span>${data.student?`${n} of ${m.tasks.length} memorised`:'Explore this module'}</span>${data.student?`<strong>${Math.round(100*n/m.tasks.length)}%</strong>`:''}</div><div class="mp-meter" role="progressbar" aria-label="${esc(m.name)} memorised" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${m.tasks.length}"><span style="width:${100*n/m.tasks.length}%"></span></div><div class="mp-confirmed-count">${data.student?`${c} teacher confirmed`:'Surahs and duas for your learning'}</div><button data-module="${esc(m.id)}">${data.student?'Open my module':'View tasks'}</button></div></article>`;
      }).join('')||'<p>No modules have been added yet.</p>'}</div></section>`).join('')}`;
  }
  function openModule(id){
    const m=data.modules.find(m=>m.id===id);if(!m)return;dialogModule=id;const dialog=$('mp-dialog'),top=dialog.scrollTop,focusedTask=document.activeElement?.dataset.task;
    dialog.innerHTML=`<div class="mp-heading"><div><span class="mp-level">Level ${esc(m.level)}</span><h2 id="mp-dialog-title">${esc(m.name)}</h2><p>Tick the items you have memorised</p></div><button class="mp-secondary" data-mp="close">Close</button></div><ul class="mp-task-list">${m.tasks.map(t=>{
      const r=current(data.accountId,t.id);return `<li><label><input type="checkbox" data-task="${esc(t.id)}" ${r.complete?'checked':''} ${!data.student||locked()?'disabled':''}><span class="mp-task-copy">${esc(t.name)}<small>${r.confirmed?'Confirmed by your teacher':r.complete?'Awaiting teacher confirmation':'Ready when you are'}</small></span>${r.confirmed?'<span class="mp-badge">Confirmed</span>':''}</label></li>`;
    }).join('')}</ul><div class="mp-actions"><span id="mp-dialog-status" role="status">${esc(message)}</span>${pending?'<button class="mp-primary" data-mp="retry">Retry save</button>':conflict?'<button class="mp-primary" data-mp="refresh">Refresh saved progress</button>':''}${data.student?`<button class="mp-primary" data-mp="save" ${locked()||!drafts.size?'disabled':''}>Save changes</button>`:''}</div>`;
    if(!dialog.open)dialog.showModal();dialog.scrollTop=top;
    if(focusedTask)Array.from(dialog.querySelectorAll('[data-task]')).find(n=>n.dataset.task===focusedTask)?.focus({preventScroll:true});
  }
  function classGrid(){
    const c=data.classes[group];return `<p>Confirm memorisation for learners in your classes. Each learner has one record across the Academy.</p><div class="mp-class-pills" aria-label="Your classes">${data.classes.map((c,i)=>`<button data-class="${i}" aria-pressed="${i===group}">${esc(c.name)}<small>${esc(c.activityName)}</small></button>`).join('')}</div>${!c?'<p>No classes are assigned to you.</p>':`<section class="mp-grid-card"><h2>${esc(c.name)}</h2><div class="mp-grid-controls"><label>Module<select id="mp-grid-module">${data.modules.map(m=>`<option value="${esc(m.id)}" ${m.id===moduleId?'selected':''}>${esc(m.name)} · Level ${esc(m.level)}</option>`).join('')}</select></label><button class="mp-primary" data-mp="save" ${locked()||!drafts.size?'disabled':''}>Save confirmations</button></div><p class="mp-legend">Gold: learner marked memorised. Green tick: teacher confirmed. Empty: not yet marked.</p>${grid?`<div class="mp-grid-wrap" tabindex="0" aria-label="${esc(c.name)} memorisation grid"><table class="mp-grid"><thead><tr><th scope="col">Learner</th>${grid.module.tasks.map(t=>`<th scope="col">${esc(t.name)}</th>`).join('')}</tr></thead><tbody>${grid.learners.map(a=>`<tr><th scope="row">${esc(a.name)}</th>${grid.module.tasks.map(t=>{const r=current(a.id,t.id);return `<td data-state="${r.confirmed?'confirmed':r.complete?'pending':'empty'}">${r.complete?`<label class="mp-grid-cell"><input type="checkbox" data-confirm-account="${esc(a.id)}" data-confirm-task="${esc(t.id)}" aria-label="Confirm ${esc(t.name)} for ${esc(a.name)}" ${r.confirmed?'checked':''} ${locked()?'disabled':''}></label>`:'<span class="mp-empty-cell" aria-label="Not yet marked">—</span>'}</td>`;}).join('')}</tr>`).join('')||`<tr><td colspan="${grid.module.tasks.length+1}">No active learners in this class. Check class enrolments.</td></tr>`}</tbody></table></div><div class="mp-pager"><button class="mp-secondary" data-page="-1" ${!offset||locked()?'disabled':''}>Previous</button><span>${grid.total?`${offset+1}–${Math.min(offset+20,grid.total)} of ${grid.total} learners`:'0 learners'}</span><button class="mp-secondary" data-page="1" ${offset+20>=grid.total||locked()?'disabled':''}>Next</button></div>`:'<p>No modules are available.</p>'}</section>`}`;
  }
  function importView(){return `<section class="mp-import"><h2>Add memorisation modules</h2><p>Upload an Excel (.xlsx) or CSV list with <strong>ModuleName</strong> and <strong>TaskName</strong> columns. The first worksheet is read. Optional Subject and Level columns are supported.</p><p>Review each module, choose Surahs or Duas and assign a level before saving.</p><input id="mp-file" type="file" accept=".xlsx,.csv" aria-label="Module workbook" ${locked()?'disabled':''}>${upload?`<p>${upload.length} modules · ${upload.reduce((n,m)=>n+m.tasks.length,0)} tasks</p><div class="mp-import-preview">${upload.map((m,i)=>`<article class="mp-import-module"><h3>${esc(m.name)} · ${m.tasks.length} tasks</h3><div class="mp-import-fields"><label>Subject<select data-import-subject="${i}"><option value="">Choose a subject</option><option value="SURAHS" ${m.subject==='SURAHS'?'selected':''}>Surahs</option><option value="DUAS" ${m.subject==='DUAS'?'selected':''}>Duas</option></select></label><label>Level<input type="text" data-import-level="${i}" value="${esc(m.level)}" maxlength="60" placeholder="e.g. 1"></label></div><details><summary>Review tasks</summary><ul>${m.tasks.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></details></article>`).join('')}</div><label class="mp-import-mode">Import option <select id="mp-import-mode"><option value="ADD">Add new modules</option><option value="REPLACE">Replace matching modules and reset their progress</option></select></label><button class="mp-primary" data-mp="upload" ${locked()?'disabled':''}>Save modules</button>`:''}</section>`;}
  async function save(action){
    if(locked())return;
    let input;
    if(action==='import'){
      if(!upload?.length)return;if(upload.some(m=>!m.subject||!m.level.trim())){status('Choose a subject and level for every module.',true);return;}
      const importMode=$('mp-import-mode').value;if(importMode==='REPLACE'&&!window.confirm('Replace matching modules? Their existing learner task progress will be cleared. Other modules stay as they are.'))return;
      input={catalogueRevision:data.revision,modules:upload,mode:importMode,operationId:crypto.randomUUID()};
    }else{
      const updates=[...drafts].map(([k,v])=>{const split=k.indexOf(':');const a=k.slice(0,split),t=k.slice(split+1);return {accountId:a,taskId:t,revision:record(a,t).revision,...v};});
      if(!updates.length)return;const c=data.classes[group];
      input={catalogueRevision:data.revision,updates,operationId:crypto.randomUUID(),...(action==='confirm'?{activityKey:c.activityKey,classId:c.id}:{})};
    }
    pending=JSON.parse(JSON.stringify({owner,action,input}));try{sessionStorage.setItem(KEY,JSON.stringify(pending));}catch{pending=null;status('Your browser cannot keep a safe retry. Allow tab storage before saving.',true);return;}
    await transmit();
  }
  async function transmit(){
    if(!pending||busy)return;busy=true;render();status('Saving…');const g=generation,operation=pending;
    try{
      await request(operation.action,operation.input);if(g!==generation)return;
      clearPending();drafts.clear();conflict=false;upload=null;message=operation.action==='import'?'Modules saved.':'Progress saved.';error=false;
      await load();
    }catch(e){
      if(e.stale||g!==generation)return;
      if(e.status&&e.status<500&&e.status!==429){clearPending();conflict=e.status===409;}
      status(e.message,true);render();
    }finally{if(g===generation){busy=false;render();}}
  }
  async function refresh(){
    if(busy||pending)return;
    if(!conflict&&drafts.size&&!window.confirm('Refresh and discard your unsaved changes?'))return;
    if(!conflict)drafts.clear();busy=true;render();
    try{
      await load();const tasks=new Set(data.modules.flatMap(m=>m.tasks.map(t=>t.id)));let removed=0;
      for(const [k,v] of drafts){const split=k.indexOf(':'),a=k.slice(0,split),t=k.slice(split+1),r=record(a,t);
        if(!tasks.has(t)||mode==='classes'&&(!grid?.learners.some(l=>l.id===a)||!r.complete&&v.confirmed)||Object.keys(v).filter(f=>f==='complete'||f==='confirmed').every(f=>v[f]===r[f])){drafts.delete(k);removed++;}}
      conflict=false;status(removed?'Saved progress refreshed. Tasks that are no longer eligible or already match your choices were removed from this draft. Review before saving.':drafts.size?'Saved progress refreshed. Review your choices, then save.':'Progress refreshed.');
    }
    catch(e){if(!e.stale)status(e.message,true);}finally{busy=false;render();}
  }
  $('mp-root').addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b||b.disabled)return;
    try{
      if(b.dataset.module){openModule(b.dataset.module);return;}
      if(b.dataset.scroll){const [s,d]=b.dataset.scroll.split(':');$('mp-row-'+s).scrollBy({left:Number(d)*272,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return;}
      const action=b.dataset.mp;
      if(action==='retry'){await transmit();return;}if(action==='reload'){session='';await open();return;}
      if(action==='close'){if(busy)return;if(pending){dialogModule='';$('mp-dialog').close();return;}if(drafts.size&&!window.confirm('Close this module and discard unsaved changes?'))return;drafts.clear();dialogModule='';$('mp-dialog').close();return;}
      if(action==='save'){await save(mode==='classes'?'confirm':'mark');return;}if(action==='upload'){await save('import');return;}if(action==='refresh'){await refresh();return;}
      if(['self','classes','import'].includes(action)||b.dataset.class!==undefined||b.dataset.page){
        if(!canLeave())return;drafts.clear();upload=null;conflict=false;dialogModule='';
        if(action)mode=action;if(b.dataset.class!==undefined){group=Number(b.dataset.class);offset=0;}if(b.dataset.page)offset+=Number(b.dataset.page)*20;else offset=0;
        if(mode==='classes'){busy=true;render();await loadGrid();busy=false;}render();
      }
    }catch(e){busy=false;if(!e.stale){status(e.message,true);render();}}
  });
  $('mp-root').addEventListener('change',async event=>{
    const n=event.target;if(locked())return;
    if((n.dataset.task||n.dataset.confirmTask)&&drafts.size>=100&&!drafts.has(key(n.dataset.confirmAccount||data.accountId,n.dataset.confirmTask||n.dataset.task))){n.checked=!n.checked;status('Save your current 100 changes before marking more tasks.',true);return;}
    try{
      if(n.dataset.task){const t=n.dataset.task,r=record(data.accountId,t);if(n.checked===r.complete)drafts.delete(key(data.accountId,t));else drafts.set(key(data.accountId,t),{complete:n.checked,confirmed:false});openModule(dialogModule);return;}
      if(n.dataset.confirmTask){const a=n.dataset.confirmAccount,t=n.dataset.confirmTask,r=record(a,t);if(n.checked===r.confirmed)drafts.delete(key(a,t));else drafts.set(key(a,t),{confirmed:n.checked});render();return;}
      if(n.id==='mp-grid-module'){const next=n.value;if(!canLeave()){n.value=moduleId;return;}drafts.clear();moduleId=next;offset=0;busy=true;render();await loadGrid();busy=false;render();return;}
      if(n.id==='mp-file'){
        const file=n.files[0];if(!file)return;upload=null;status('Reading module list…');const g=generation;
        const parsed=await window.M4L_MEMORISATION_UPLOAD.read(file);if(g!==generation)return;upload=parsed;status('Review the subjects and levels, then save your modules.');render();return;
      }
      if(n.dataset.importSubject!==undefined)upload[Number(n.dataset.importSubject)].subject=n.value;
      if(n.dataset.importLevel!==undefined)upload[Number(n.dataset.importLevel)].level=n.value;
    }catch(e){busy=false;if(!e.stale){status(e.message,true);render();}}
  });
  window.addEventListener('beforeunload',event=>{if(drafts.size||pending||busy){event.preventDefault();event.returnValue='';}});
  window.M4L_ACADEMY_PROGRESS={open,reset,canLeave};
})();
