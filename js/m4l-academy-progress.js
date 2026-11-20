(() => {
  'use strict';
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const root=$('mp-root');
  const v2=location.origin==='https://ummabbadacademy.app'&&document.querySelector('meta[name=uaa-auth-version]')?.content==='2';let auth=null,nativeForm=null,nativeModel=null,nativeReady=false,nativeReviewing=false,readUnregister=null,dialogUnregister=null,viewResult=null,checkpoint=Promise.resolve(),checkpointPending=false;const client=async()=>auth||(auth=await window.M4L_ACADEMY_AUTH.ready);
  const token=()=>v2?(window.M4L_ACADEMY_AUTH?.ownerKey()||''):localStorage.getItem('m4l_account_token')||'',KEY='m4l_memorisation_pending_v1';
  let generation=0,owner='',session='',data=null,mode='',group=-1,moduleId='',subject='',grid=null,offset=0,busy=false,loading=false,pending=null,conflict=false,upload=null,dialogModule='',message='',error=false;
  let context={view:'self',hostId:'mp-personal-host',activityKey:'',kind:''};
  const drafts=new Map(),key=(a,t)=>v2?JSON.stringify([a,t]):`${a}:${t}`;
  const parts=k=>v2?JSON.parse(k):[k.slice(0,k.indexOf(':')),k.slice(k.indexOf(':')+1)];
  const record=(a,t)=> (mode==='classes'?grid?.records:data?.records)?.find(r=>r.accountId===a&&r.taskId===t)||{accountId:a,taskId:t,revision:0,complete:false,confirmed:false};
  const current=(a,t)=>({...record(a,t),...drafts.get(key(a,t))});
  const locked=()=>busy||Boolean(pending)||conflict||nativeReviewing;
  function status(text,failed=false){message=text;error=failed;const node=$('mp-status');if(node){node.textContent=text;node.dataset.error=String(failed);}const d=$('mp-dialog-status');if(d)d.textContent=text;}
  async function request(action,input){
    const s=session,g=generation;
    if(v2&&action!=='preview'){const c=await client(),result=await c.request('/api/academy/progress/'+action,input,{headers:{'X-Academy-Workspace':context.view==='admin'?'ADMIN':context.view==='teach'?'TEACH':'LEARN'}});if(g!==generation||s!==token()||!c.isCurrentResult(result))throw Object.assign(Error('The Progress view changed.'),{stale:true});return result;}
    const response=await fetch(`${v2?'':window.M4L_CONFIG?.API_BASE||''}/api/academy/progress/${action}`,action==='preview'?{method:'GET'}:{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s}`},body:JSON.stringify(input)});
    const result=await response.json();if(g!==generation||s!==token())throw Object.assign(Error('The Academy account changed.'),{stale:true});
    if(!response.ok||!result.success){if(response.status===401)window.dispatchEvent(new Event('m4l-academy-session-ended'));throw Object.assign(Error(result.error||'Progress could not be saved.'),{status:response.status,code:result.code});}return result;
  }
  const digest=async x=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const nativeSnapshot=()=>({entries:[...drafts].map(([k,value])=>{const [accountId,taskId]=parts(k);return {accountId,taskId,...value};}),...(upload?{sets:structuredClone(upload)}:{})});
  function clearNative(){nativeForm?.dispose();nativeForm=null;nativeModel=null;nativeReady=false;readUnregister?.();readUnregister=null;dialogUnregister?.();dialogUnregister=null;}
  function persistNative(){if(!v2||!nativeForm||!nativeModel)return;const snapshot=nativeSnapshot();nativeModel.last=structuredClone(snapshot);const model=nativeModel,pendingWrite=nativeForm.checkpoint(snapshot);checkpoint=pendingWrite;checkpointPending=true;pendingWrite.then(()=>{if(checkpoint===pendingWrite)checkpointPending=false;},e=>{if(checkpoint===pendingWrite)checkpointPending=false;if(nativeModel===model)status(e.message,true);});}
  function revealRead(value){if(!v2||!session||data?.visitor)return;if(!auth.isCurrentResult(value))throw Object.assign(Error('This Progress view is no longer current.'),{stale:true});if(!nativeForm){readUnregister?.();root.style.visibility='';root.inert=false;readUnregister=auth.registerPrivateRoot(root);}auth.revealResult(value,{root});window.M4L_ACADEMY_STARTUP?.complete?.();}
  async function readNative(model){const fresh=await request('get',{view:context.view,activityKey:context.activityKey,kind:context.kind});data=fresh;viewResult=fresh;if(model.resource.type==='academy-memorisation-class'){group=data.classes.findIndex(c=>c.activityKey===model.resource.activityKey&&c.id===model.resource.classId);if(group<0)throw Error('This class is no longer available.');grid=await request('grid',{activityKey:model.resource.activityKey,classId:model.resource.classId,moduleId:model.resource.moduleId,offset});viewResult=grid;model.version=await digest({catalogue:grid.catalogueRevision,records:grid.records,learners:grid.learners.map(x=>x.id),tasks:grid.set.tasks.map(x=>x.id),offset});}else model.version=await digest({catalogue:data.revision,records:data.records,module:model.resource.moduleId||null});render();return viewResult;}
  async function prepareNative(kind,id){if(!v2||data?.visitor)return null;const c=await client(),cl=data.classes[group],resource=kind==='class'?{type:'academy-memorisation-class',activityKey:cl.activityKey,classId:cl.id,moduleId:id,workspace:context.view==='admin'?'ADMIN':'TEACH'}:kind==='catalogue'?{type:'academy-memorisation-catalogue'}:{type:'academy-memorisation-personal',moduleId:id};if(nativeForm&&JSON.stringify(nativeModel.resource)===JSON.stringify(resource))return {};
   await checkpoint;clearNative();nativeReady=false;root.style.visibility='';root.inert=false;readUnregister=c.registerPrivateRoot(root);const model={resource,generation,version:await digest({catalogue:kind==='class'?grid.catalogueRevision:data.revision,records:kind==='class'?grid.records:data.records,module:id||null,...kind==='class'?{learners:grid.learners.map(x=>x.id),tasks:grid.set.tasks.map(x=>x.id),offset}:{}}),last:nativeSnapshot()};nativeModel=model;const {createAcademyNativeForm}=await import('/js/m4l-v111-editor.mjs');if(model.generation!==generation)throw Object.assign(Error('The Progress view changed.'),{stale:true});readUnregister?.();readUnregister=null;root.style.visibility='';root.inert=false;const candidate=await createAcademyNativeForm({client:c,resource,roots:[root],host:document.body,capture:()=>model.generation===generation?nativeSnapshot():model.last,baseVersion:()=>model.version,isDirty:()=>drafts.size>0||Boolean(upload),readCurrent:()=>readNative(model),applyCurrent:async value=>{drafts.clear();upload=null;viewResult=value;render();},applyRetained:saved=>{if(!Array.isArray(saved.entries))throw Error('Invalid retained task choices.');drafts.clear();for(const x of saved.entries){if(typeof x.accountId!=='string'||typeof x.taskId!=='string')throw Error('Invalid retained task reference.');drafts.set(key(x.accountId,x.taskId),{...x,revision:record(x.accountId,x.taskId).revision});}if(resource.type==='academy-memorisation-catalogue'&&Array.isArray(saved.sets))upload=saved.sets;render();},status});if(model.generation!==generation||nativeModel!==model){candidate.dispose();throw Object.assign(Error('The Progress view changed.'),{stale:true});}nativeForm=candidate;const result=await nativeForm.open(viewResult);nativeReady=true;render();return result;
  }
  async function saveNative(action,input){if(!nativeForm||!nativeReady)throw Error('Open this protected task editor before saving.');const g=generation;let attempt;busy=true;render();status('Saving…');try{await checkpoint;attempt=await nativeForm.beforeMutation({action,input},{sensitive:action==='import'});let result=await request(action,input);if(g!==generation)return;result=await nativeForm.completeNativeMutation(attempt,result,{operationId:input.operationId});drafts.clear();upload=null;await nativeForm.saved();clearNative();await load();if(mode==='self'&&dialogModule&&data.student&&data.sets.some(x=>x.id===dialogModule)){await prepareNative('personal',dialogModule);openModule(dialogModule);}status(action==='import'?'Sets saved.':'Progress saved.');}catch(e){if(g!==generation)return;busy=false;if(attempt){nativeReviewing=true;await nativeForm.unknown(attempt);nativeReviewing=false;}status(e.message,true);}finally{if(g===generation){nativeReviewing=false;busy=false;render();}}}
  function clearPending(){pending=null;if(v2)return;try{sessionStorage.removeItem(KEY);}catch{}}
  function canLeave(){
    if(v2&&checkpointPending){status('Finishing the encrypted draft. Please try leaving again in a moment.');return false;}
    if(busy||pending||nativeReviewing){status('Finish or retry the pending save before leaving Progress.',true);return false;}
    if((drafts.size||upload)&&!window.confirm(v2?'Leave Progress and keep its encrypted draft for this session? Nothing will be sent.':'Leave Progress and discard your unsaved changes?'))return false;
    return true;
  }
  function reset(){
    clearNative();checkpoint=Promise.resolve();checkpointPending=false;nativeReviewing=false;generation++;$('mp-dialog')?.close();root?.replaceChildren();session='';owner='';data=null;grid=null;mode='';group=-1;subject='';moduleId='';offset=0;drafts.clear();pending=null;upload=null;busy=false;loading=false;conflict=false;dialogModule='';message='';error=false;
  }
  async function open(options={}){
    if(v2){await client();try{await auth.ensureFresh();}catch(e){if(e.code!=='PIN_REQUIRED')throw e;}}
    const next={view:'self',hostId:'mp-personal-host',activityKey:'',kind:'',...options};
    if(root)$(next.hostId)?.appendChild(root);
    if(session===token()&&(data||loading)&&JSON.stringify(next)===JSON.stringify(context))return;
    reset();context=next;
    session=token();if(!session&&context.view!=='self'){root.innerHTML='<p>Sign in to view class progress.</p>';return;}
    const g=generation;loading=true;root.innerHTML='<p role="status">Loading memorisation progress…</p>';
    try{
      if(session)owner=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(session)))].map(b=>b.toString(16).padStart(2,'0')).join('');
      if(g!==generation||session!==token())return;
      if(session&&!v2)try{const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');if(saved?.owner===owner&&['mark','confirm','import'].includes(saved.action))pending=saved;else if(saved)sessionStorage.removeItem(KEY);}catch{pending=null;}
      await load();
    }catch(e){if(!e.stale&&g===generation){root.innerHTML=`<p class="mp-status" role="alert">${esc(e.message)}</p><button type="button" class="mp-secondary" data-mp="reload">Try again</button>`;}}
    finally{if(g===generation)loading=false;}
  }
  async function load(){
    data=await request(session?'get':'preview',{view:context.view,activityKey:context.activityKey,kind:context.kind});viewResult=data;
    mode=context.view==='teach'?'classes':'self';
    if(mode==='self'&&$('progress'))$('progress').hidden=data.personalActive===false;
    if(mode==='classes'&&pending?.action==='confirm'){const index=data.classes.findIndex(c=>c.activityKey===pending.input.activityKey&&c.id===pending.input.classId);if(index>=0){group=index;offset=Number(pending.cardOffset||0);const selected=data.sets.find(m=>m.tasks.some(t=>t.id===pending.input.updates[0]?.taskId));if(selected){moduleId=selected.id;subject=selected.subject;}}}
    if(group>=data.classes.length)group=-1;
    if(!data.sets.some(m=>m.id===moduleId))moduleId=data.sets.find(m=>m.subject===subject)?.id||'';
    if(mode==='classes'&&group>=0)await loadGrid();else {render();if(v2&&session)revealRead(data);}
  }
  async function loadGrid(){
    const c=data.classes[group];if(!c||!moduleId){grid=null;render();return;}
    const signature=JSON.stringify([c.activityKey,c.id,moduleId,offset]),result=await request('grid',{activityKey:c.activityKey,classId:c.id,moduleId,offset});if(signature!==JSON.stringify([data.classes[group]?.activityKey,data.classes[group]?.id,moduleId,offset]))return;if(v2&&!auth.isCurrentResult(data)){data=await request('get',{view:context.view,activityKey:context.activityKey,kind:context.kind});group=data.classes.findIndex(x=>x.activityKey===c.activityKey&&x.id===c.id);if(group<0)throw Error('This class is no longer available.');}grid=result;viewResult=result;render();if(v2&&!grid.readOnly)await prepareNative('class',moduleId);else if(v2)revealRead(result);
  }
  function recovery(){return pending?'<div class="mp-recovery"><p>A save is awaiting confirmation. Retry it to check whether it was received.</p><button type="button" class="mp-primary" data-mp="retry">Retry save</button></div>':conflict?'<div class="mp-recovery"><p>Your changes are kept. Refresh the saved progress, review your choices, then save again.</p><button type="button" class="mp-primary" data-mp="refresh">Refresh saved progress</button></div>':'';}
  function render(){
    if(!data)return;const positions=Object.fromEntries(['SURAHS','DUAS'].map(s=>[s,$('mp-row-'+s)?.scrollLeft||0]));
    const moduleScroll=root.querySelector('.mp-set-pills')?.scrollLeft||0;
    const wasOpen=$('mp-dialog')?.open,gridPosition=root.querySelector('.mp-grid-wrap'),gridScroll=gridPosition?{left:gridPosition.scrollLeft,top:gridPosition.scrollTop}:null,focused=document.activeElement,focusAccount=focused?.dataset.confirmAccount,focusTask=focused?.dataset.confirmTask;
    dialogUnregister?.();dialogUnregister=null;root.innerHTML=`<div class="mp-toolbar"><div>${mode==='classes'&&group>=0?'<button class="mp-secondary" data-mp="class-cards">← Class cards</button>':''}</div><button class="mp-secondary" data-mp="refresh" data-page-content-refresh ${busy||pending?'disabled':''}>Refresh</button></div>
      <p id="mp-status" class="mp-status" role="status" aria-live="polite" data-error="${error}">${esc(message)}</p>${recovery()}
      ${mode==='self'?cards():group<0?classCards():classGrid()}
      <dialog id="mp-dialog" aria-labelledby="mp-dialog-title"></dialog>`;
    for(const [subject,left] of Object.entries(positions))if($('mp-row-'+subject))$('mp-row-'+subject).scrollLeft=left;
    const modulePills=root.querySelector('.mp-set-pills');if(modulePills)modulePills.scrollLeft=moduleScroll;
    if((wasOpen||v2&&nativeForm)&&dialogModule&&!nativeReviewing)openModule(dialogModule);
    const newGrid=root.querySelector('.mp-grid-wrap');if(newGrid&&gridScroll){newGrid.scrollLeft=gridScroll.left;newGrid.scrollTop=gridScroll.top;}
    if(focusTask)Array.from(root.querySelectorAll('[data-confirm-task]')).find(n=>n.dataset.confirmTask===focusTask&&n.dataset.confirmAccount===focusAccount)?.focus({preventScroll:true});
    $('mp-dialog').addEventListener('cancel',async e=>{if(v2){e.preventDefault();if(busy||nativeReviewing)return;if(drafts.size&&!window.confirm('Close this set and keep its encrypted draft?'))return;await checkpoint;clearNative();drafts.clear();dialogModule='';$('mp-dialog')?.close();render();if(viewResult)revealRead(viewResult);return;}if(busy||pending){e.preventDefault();return;}if(drafts.size&&!window.confirm('Close this set and discard unsaved changes?')){e.preventDefault();return;}drafts.clear();dialogModule='';});
    root.querySelectorAll('button,input,select').forEach(n=>{if(busy||(pending||conflict)&&!['retry','refresh','close'].includes(n.dataset.mp))n.disabled=true;});
  }
  function cards(){
    if(data.personalActive===false)return '';
    const records=data.records,total=data.sets.reduce((n,m)=>n+m.tasks.length,0),complete=records.filter(r=>r.complete&&data.sets.some(m=>m.tasks.some(t=>t.id===r.taskId))).length,confirmed=records.filter(r=>r.confirmed&&data.sets.some(m=>m.tasks.some(t=>t.id===r.taskId))).length;
    return `<div class="mp-intro"><h2>Your memorisation, one step at a time</h2><p>All registered users have free access to these surah and dua memorisation trackers.</p>${data.visitor?'<p class="mp-preview-notice" role="note"><strong>Visitor preview</strong> · Try the cards below.</p>':''}${data.visitor?'<p>Register to save your progress</p>':data.student?`<div class="mp-summary"><div><strong>${complete}<span> / ${total}</span></strong><span>Marked memorised</span></div><div><strong>${confirmed}</strong><span>Teacher confirmed</span></div></div>`:''}</div>
      ${['SURAHS','DUAS'].map(subject=>`<section class="mp-row-section" aria-labelledby="mp-heading-${subject}"><div class="mp-row-heading"><div><h2 id="mp-heading-${subject}">${subject==='SURAHS'?'Surah sets':'Dua sets'}</h2><p>Swipe to explore your sets</p></div><div class="mp-arrows"><button data-scroll="${subject}:-1" aria-label="Previous ${subject==='SURAHS'?'Surah':'Dua'} sets">‹</button><button data-scroll="${subject}:1" aria-label="Next ${subject==='SURAHS'?'Surah':'Dua'} sets">›</button></div></div><div class="mp-row" id="mp-row-${subject}" tabindex="0" aria-label="${subject==='SURAHS'?'Surah':'Dua'} sets">${data.sets.filter(m=>m.subject===subject).map(m=>{
        const n=m.tasks.filter(t=>record(data.accountId,t.id).complete).length,c=m.tasks.filter(t=>record(data.accountId,t.id).confirmed).length;
        return `<article class="mp-card"><div class="mp-card-top"><span class="mp-level">Level ${esc(m.level)}</span><h3>${esc(m.name)}</h3><p>${m.tasks.length} ${subject==='SURAHS'?'surahs':'duas'}</p></div><div class="mp-card-bottom"><div class="mp-count"><span>${data.student?`${n} of ${m.tasks.length} memorised`:'Explore this set'}</span>${data.student?`<strong>${Math.round(100*n/m.tasks.length)}%</strong>`:''}</div><div class="mp-meter" role="progressbar" aria-label="${esc(m.name)} memorised" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${m.tasks.length}"><span style="width:${100*n/m.tasks.length}%"></span></div><div class="mp-confirmed-count">${data.student?`${c} teacher confirmed`:'Surahs and duas for your learning'}</div><button data-set="${esc(m.id)}">${data.student?'Open my set':'View tasks'}</button></div></article>`;
      }).join('')||'<p>No sets have been added yet.</p>'}</div></section>`).join('')}`;
  }
  function openModule(id){
    const m=data.sets.find(m=>m.id===id);if(!m)return;dialogModule=id;const dialog=$('mp-dialog'),top=dialog.scrollTop,focusedTask=document.activeElement?.dataset.task;
    dialogUnregister?.();dialogUnregister=null;if(v2&&session){dialog.style.visibility='';dialog.inert=false;dialogUnregister=auth.registerPrivateRoot(dialog);}
    dialog.innerHTML=`<div class="mp-heading"><div><span class="mp-level">Level ${esc(m.level)}</span><h2 id="mp-dialog-title">${esc(m.name)}</h2><p>Tick the items you have memorised</p></div><button class="mp-secondary academy-close" data-mp="close" title="Close">Close</button></div><ul class="mp-task-list">${m.tasks.map(t=>{
      const r=current(data.accountId,t.id);return `<li><label><input type="checkbox" data-task="${esc(t.id)}" ${r.complete?'checked':''} ${!data.student||locked()?'disabled':''}><span class="mp-task-copy">${esc(t.name)}<small>${data.visitor?(r.complete?'Selected in this preview only':'Try ticking this item'):r.complete&&r.confirmed?'You and your teacher have confirmed':r.confirmed?'Teacher confirmed · record your own progress when ready':r.complete?'You marked this as memorised':'Ready when you are'}</small></span></label><div class="mp-task-confirmations">${r.complete?`<span class="mp-badge mp-learner-badge">✓ ${data.visitor?'Selected':'Memorised'}</span>`:''}${r.confirmed?'<span class="mp-badge mp-teacher-badge">✓ Teacher confirmed</span>':''}</div></li>`;
    }).join('')}</ul><div class="mp-actions"><span id="mp-dialog-status" role="status">${esc(message)}</span>${pending?'<button class="mp-primary" data-mp="retry">Retry save</button>':conflict?'<button class="mp-primary" data-mp="refresh">Refresh saved progress</button>':''}${data.student&&!data.visitor?`<button class="mp-primary" data-mp="save" ${locked()||!drafts.size?'disabled':''}>Save changes</button>`:''}</div>`;
    if(v2&&session){if(!auth.isCurrentResult(viewResult))return;auth.revealResult(viewResult,{root:dialog});}if(!dialog.open)dialog.showModal();dialog.scrollTop=top;
    if(focusedTask)Array.from(dialog.querySelectorAll('[data-task]')).find(n=>n.dataset.task===focusedTask)?.focus({preventScroll:true});
  }
  const classModules=(s,c=data.classes[group])=>data.sets.filter(m=>m.subject===s&&(!m.activityKeys?.length||m.activityKeys.includes(c?.activityKey)));
  function classCards(){
    return `<div class="mp-intro"><h2>Memorisation with your class</h2><p>Choose a class card to view its learners and confirm their memorisation.</p></div>${['SURAHS','DUAS'].map(s=>{
      const sets=data.sets.filter(m=>m.subject===s),name=s==='SURAHS'?'Surahs':'Duas';
      return `<section class="mp-row-section" aria-labelledby="mp-heading-${s}"><div class="mp-row-heading"><div><h2 id="mp-heading-${s}">${name}</h2><p>Swipe to explore your classes</p></div><div class="mp-arrows"><button data-scroll="${s}:-1" aria-label="Previous ${name} classes">‹</button><button data-scroll="${s}:1" aria-label="Next ${name} classes">›</button></div></div><div class="mp-row" id="mp-row-${s}" tabindex="0" aria-label="${name} class cards">${data.classes.flatMap((c,i)=>{const sets=classModules(s,c),limit=c.learnersPerCard||20,pages=Math.max(1,Math.ceil(c.learnerCount/limit));return Array.from({length:pages},(_,page)=>`<article class="mp-card mp-class-card"><div class="mp-card-top"><span class="mp-level">${name}</span><h3>${esc(c.name)}${pages>1?` - ${page+1}`:''}</h3><p>${esc(c.activityName)}</p></div><div class="mp-card-bottom"><button data-class="${i}" data-offset="${page*limit}" data-subject="${s}" ${!sets.length?'disabled':''}>Open class ${name.toLowerCase()}</button></div></article>`);}).join('')||'<p>No classes are assigned to you in this learning area.</p>'}</div></section>`;
    }).join('')}`;
  }
  function classGrid(){
    const c=data.classes[group];if(!c)return classCards();return `<section class="mp-grid-card"><h2>${esc(c.name)}${(grid?.total||c.learnerCount)>(grid?.pageSize||c.learnersPerCard||20)?` - ${Math.floor(offset/(grid?.pageSize||c.learnersPerCard||20))+1}`:''} · ${subject==='SURAHS'?'Surahs':'Duas'}</h2><div class="mp-grid-controls"><nav class="mp-set-pills" aria-label="${subject==='SURAHS'?'Surah':'Dua'} sets">${classModules(subject).map(m=>`<button type="button" data-grid-set="${esc(m.id)}" aria-pressed="${m.id===moduleId}">${esc(m.name)}<small>Level ${esc(m.level)}</small></button>`).join('')}</nav><button class="mp-primary" data-mp="save" ${locked()||!drafts.size?'disabled':''}>Save confirmations</button></div><p class="mp-legend">Gold tick: learner marked memorised. Green tick: teacher confirmed. These are independent; both ticks appear when both have confirmed.</p>${grid?`<div class="mp-grid-wrap" tabindex="0" aria-label="${esc(c.name)} memorisation grid"><table class="mp-grid"><thead><tr><th scope="col">Learner</th>${grid.set.tasks.map(t=>`<th scope="col">${esc(t.name)}</th>`).join('')}</tr></thead><tbody>${grid.learners.map(a=>`<tr><th scope="row">${esc(a.name)}</th>${grid.set.tasks.map(t=>{const r=current(a.id,t.id);return `<td data-state="${r.complete&&r.confirmed?'both':r.confirmed?'confirmed':r.complete?'pending':'empty'}"><div class="mp-dual-confirmations"><span class="mp-learner-mark" data-learner-mark="${r.complete}" role="img" aria-label="${r.complete?'Learner marked memorised':'Learner has not marked memorised'}">${r.complete?'✓':'—'}</span><label class="mp-grid-cell"><input type="checkbox" data-confirm-account="${esc(a.id)}" data-confirm-task="${esc(t.id)}" aria-label="Teacher confirmation: ${esc(t.name)} for ${esc(a.name)}" ${r.confirmed?'checked':''} ${locked()||grid?.readOnly?'disabled':''}></label></div></td>`;}).join('')}</tr>`).join('')||`<tr><td colspan="${grid.set.tasks.length+1}">No active learners in this class. Check class enrolments.</td></tr>`}</tbody></table></div>`:'<p>No sets are available.</p>'}</section>`;
  }
  async function save(action){
    if(locked()||data?.visitor)return;
    let input;
    if(action==='import'){
      if(!upload?.length)return;if(upload.some(m=>!m.subject||!m.level.trim())){status('Choose a subject and level for every set.',true);return;}
      const importMode=$('mp-import-mode').value;if(importMode==='REPLACE'&&!window.confirm('Replace matching sets? Their existing learner task progress will be cleared. Other sets stay as they are.'))return;
      input={catalogueRevision:data.revision,sets:upload,mode:importMode,operationId:crypto.randomUUID()};
    }else{
      const updates=[...drafts].map(([k,v])=>{const [a,t]=parts(k);return {accountId:a,taskId:t,revision:record(a,t).revision,...v};});
      if(!updates.length)return;const c=data.classes[group];
      input={catalogueRevision:data.revision,updates,operationId:crypto.randomUUID(),...(action==='confirm'?{activityKey:c.activityKey,classId:c.id}:{})};
    }
    if(v2)return saveNative(action,input);
    pending=JSON.parse(JSON.stringify({owner,action,input,cardOffset:offset}));try{sessionStorage.setItem(KEY,JSON.stringify(pending));}catch{pending=null;status('Your browser cannot keep a safe retry. Allow tab storage before saving.',true);return;}
    await transmit();
  }
  async function transmit(){
    if(v2)return;if(!pending||busy)return;busy=true;render();status('Saving…');const g=generation,operation=pending;
    try{
      await request(operation.action,operation.input);if(g!==generation)return;
      clearPending();drafts.clear();conflict=false;upload=null;message=operation.action==='import'?'Sets saved.':'Progress saved.';error=false;
      await load();
    }catch(e){
      if(e.stale||g!==generation)return;
      if(e.status&&e.status<500&&e.status!==429){clearPending();conflict=e.status===409;}
      status(e.message,true);render();
    }finally{if(g===generation){busy=false;render();}}
  }
  async function refresh(){
    if(v2&&nativeForm){if(!busy&&!nativeReviewing)await nativeForm.revalidate();render();return;}
    if(busy||pending)return;
    if(!conflict&&drafts.size&&!window.confirm('Refresh and discard your unsaved changes?'))return;
    if(!conflict)drafts.clear();busy=true;render();status('Refreshing…');
    try{
      await load();const tasks=new Set(data.sets.flatMap(m=>m.tasks.map(t=>t.id)));let removed=0;
      for(const [k,v] of drafts){const [a,t]=parts(k),r=record(a,t);
        if(!tasks.has(t)||mode==='classes'&&(!grid?.learners.some(l=>l.id===a))||Object.keys(v).filter(f=>f==='complete'||f==='confirmed').every(f=>v[f]===r[f])){drafts.delete(k);removed++;}}
      conflict=false;status(removed?'Saved progress refreshed. Tasks that are no longer eligible or already match your choices were removed from this draft. Review before saving.':drafts.size?'Saved progress refreshed. Review your choices, then save.':'Progress refreshed.');
    }
    catch(e){if(!e.stale)status(e.message,true);}finally{busy=false;render();}
  }
  root.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b||b.disabled)return;
    try{
      if(b.dataset.set){if(v2&&!data.visitor){if(busy||nativeReviewing)return;if(dialogModule!==b.dataset.set&&drafts.size&&!canLeave())return;busy=true;dialogModule=b.dataset.set;try{await prepareNative('personal',b.dataset.set);}finally{busy=false;render();}}openModule(b.dataset.set);return;}
      if(b.dataset.gridSet){
        const next=b.dataset.gridSet;if(next===moduleId||!canLeave())return;clearNative();drafts.clear();conflict=false;moduleId=next;busy=true;render();await loadGrid();busy=false;render();
        Array.from(root.querySelectorAll('[data-grid-set]')).find(n=>n.dataset.gridSet===next)?.focus({preventScroll:true});return;
      }
      if(b.dataset.scroll){const [s,d]=b.dataset.scroll.split(':');$('mp-row-'+s).scrollBy({left:Number(d)*272,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return;}
      const action=b.dataset.mp;
      if(action==='retry'){await transmit();return;}if(action==='reload'){session='';await open(context);return;}
      if(action==='close'){if(v2){if(busy||nativeReviewing)return;if(drafts.size&&!window.confirm('Close this set and keep its encrypted draft?'))return;await checkpoint;clearNative();drafts.clear();dialogModule='';$('mp-dialog')?.close();render();if(viewResult)revealRead(viewResult);return;}if(busy)return;if(pending){dialogModule='';$('mp-dialog').close();return;}if(drafts.size&&!window.confirm('Close this set and discard unsaved changes?'))return;drafts.clear();dialogModule='';$('mp-dialog').close();return;}
      if(action==='save'){await save(mode==='classes'?'confirm':'mark');return;}if(action==='upload'){await save('import');return;}if(action==='refresh'){await refresh();return;}
      if(action==='class-cards'||b.dataset.class!==undefined){
        if(context.view!=='teach'||!canLeave())return;clearNative();drafts.clear();conflict=false;grid=null;
        if(action==='class-cards'){group=-1;subject='';moduleId='';render();if(v2)revealRead(data);return;}
        if(b.dataset.class!==undefined){group=Number(b.dataset.class);subject=b.dataset.subject;moduleId=classModules(subject)[0]?.id||'';offset=Number(b.dataset.offset||0);}
        busy=true;render();await loadGrid();busy=false;render();
      }
    }catch(e){busy=false;if(!e.stale){status(e.message,true);render();}}
  });
  root.addEventListener('change',async event=>{
    const n=event.target;if(locked())return;if(v2&&!data?.visitor&&(n.dataset.task||n.dataset.confirmTask)&&!nativeReady){n.checked=!n.checked;status('Prepare protected task recovery before editing.',true);return;}
    if((n.dataset.task||n.dataset.confirmTask)&&drafts.size>=100&&!drafts.has(key(n.dataset.confirmAccount||data.accountId,n.dataset.confirmTask||n.dataset.task))){n.checked=!n.checked;status('Save your current 100 changes before marking more tasks.',true);return;}
    try{
      if(n.dataset.task){const t=n.dataset.task,r=record(data.accountId,t);if(data.visitor){data.records=data.records.filter(r=>r.taskId!==t);if(n.checked)data.records.push({accountId:data.accountId,taskId:t,complete:true,confirmed:false,revision:0});render();return;}if(n.checked===r.complete)drafts.delete(key(data.accountId,t));else drafts.set(key(data.accountId,t),{complete:n.checked,...v2?{revision:r.revision}:{}});persistNative();openModule(dialogModule);return;}
      if(n.dataset.confirmTask){const a=n.dataset.confirmAccount,t=n.dataset.confirmTask,r=record(a,t);if(n.checked===r.confirmed)drafts.delete(key(a,t));else drafts.set(key(a,t),{confirmed:n.checked,...v2?{revision:r.revision}:{}});persistNative();render();return;}
      if(n.id==='mp-file'){
        const file=n.files[0];if(!file)return;upload=null;status('Reading set list…');const g=generation;
        const parsed=await window.M4L_MEMORISATION_UPLOAD.read(file);if(g!==generation)return;upload=parsed;status('Review the subjects and levels, then save your sets.');render();return;
      }
      if(n.dataset.importSubject!==undefined)upload[Number(n.dataset.importSubject)].subject=n.value;
      if(n.dataset.importLevel!==undefined)upload[Number(n.dataset.importLevel)].level=n.value;
    }catch(e){busy=false;if(!e.stale){status(e.message,true);render();}}
  });
  if(v2){window.addEventListener('academy-v2-mask',e=>{if(e.detail?.masked)$('mp-dialog')?.close();});window.addEventListener('academy-v2-revalidate',()=>{if(!session)return;void (nativeForm?nativeForm.revalidate():load()).catch(e=>status(e.message,true));});window.addEventListener('m4l-academy-session-ended',reset);}
  window.addEventListener('beforeunload',event=>{if(drafts.size||pending||busy){event.preventDefault();event.returnValue='';}});
  window.M4L_ACADEMY_PROGRESS={open,reset,canLeave};
})();
