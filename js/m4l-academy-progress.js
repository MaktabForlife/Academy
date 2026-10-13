(() => {
  'use strict';
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token=()=>localStorage.getItem('m4l_account_token')||'',KEY='m4l_memorisation_pending_v1';
  let generation=0,owner='',session='',data=null,mode='',group=-1,moduleId='',subject='',grid=null,offset=0,busy=false,loading=false,pending=null,conflict=false,upload=null,dialogModule='',message='',error=false;
  let context={view:'self',hostId:'mp-personal-host',activityKey:'',kind:''};
  const drafts=new Map(),key=(a,t)=>`${a}:${t}`;
  const record=(a,t)=> (mode==='classes'?grid?.records:data?.records)?.find(r=>r.accountId===a&&r.taskId===t)||{accountId:a,taskId:t,revision:0,complete:false,confirmed:false};
  const current=(a,t)=>({...record(a,t),...drafts.get(key(a,t))});
  const locked=()=>busy||Boolean(pending)||conflict;
  function status(text,failed=false){message=text;error=failed;const node=$('mp-status');if(node){node.textContent=text;node.dataset.error=String(failed);}const d=$('mp-dialog-status');if(d)d.textContent=text;}
  async function request(action,input){
    const s=session,g=generation;
    const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/academy/progress/${action}`,action==='preview'?{method:'GET'}:{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s}`},body:JSON.stringify(input)});
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
    generation++;$('mp-dialog')?.close();$('mp-root')?.replaceChildren();session='';owner='';data=null;grid=null;mode='';group=-1;subject='';moduleId='';offset=0;drafts.clear();pending=null;upload=null;busy=false;loading=false;conflict=false;dialogModule='';message='';error=false;
  }
  async function open(options={}){
    const next={view:'self',hostId:'mp-personal-host',activityKey:'',kind:'',...options};
    if(session===token()&&(data||loading)&&JSON.stringify(next)===JSON.stringify(context))return;
    reset();context=next;$('mp-root')&&$(context.hostId)?.appendChild($('mp-root'));
    session=token();if(!session&&context.view!=='self'){$('mp-root').innerHTML='<p>Sign in to view class progress.</p>';return;}
    const g=generation;loading=true;$('mp-root').innerHTML='<p role="status">Loading memorisation progress…</p>';
    try{
      if(session)owner=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(session)))].map(b=>b.toString(16).padStart(2,'0')).join('');
      if(g!==generation||session!==token())return;
      if(session)try{const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');if(saved?.owner===owner&&['mark','confirm','import'].includes(saved.action))pending=saved;else if(saved)sessionStorage.removeItem(KEY);}catch{pending=null;}
      await load();
    }catch(e){if(!e.stale&&g===generation){$('mp-root').innerHTML=`<p class="mp-status" role="alert">${esc(e.message)}</p><button type="button" class="mp-secondary" data-mp="reload">Try again</button>`;}}
    finally{if(g===generation)loading=false;}
  }
  async function load(){
    data=await request(session?'get':'preview',{view:context.view,activityKey:context.activityKey,kind:context.kind});
    mode=context.view==='teach'?'classes':'self';
    if(mode==='classes'&&pending?.action==='confirm'){const index=data.classes.findIndex(c=>c.activityKey===pending.input.activityKey&&c.id===pending.input.classId);if(index>=0){group=index;offset=Number(pending.cardOffset||0);const selected=data.sets.find(m=>m.tasks.some(t=>t.id===pending.input.updates[0]?.taskId));if(selected){moduleId=selected.id;subject=selected.subject;}}}
    if(group>=data.classes.length)group=-1;
    if(!data.sets.some(m=>m.id===moduleId))moduleId=data.sets.find(m=>m.subject===subject)?.id||'';
    if(mode==='classes'&&group>=0)await loadGrid();else render();
  }
  async function loadGrid(){
    const c=data.classes[group];if(!c||!moduleId){grid=null;render();return;}
    grid=await request('grid',{activityKey:c.activityKey,classId:c.id,moduleId,offset});render();
  }
  function recovery(){return pending?'<div class="mp-recovery"><p>A save is awaiting confirmation. Retry it to check whether it was received.</p><button type="button" class="mp-primary" data-mp="retry">Retry save</button></div>':conflict?'<div class="mp-recovery"><p>Your changes are kept. Refresh the saved progress, review your choices, then save again.</p><button type="button" class="mp-primary" data-mp="refresh">Refresh saved progress</button></div>':'';}
  function render(){
    if(!data)return;const positions=Object.fromEntries(['SURAHS','DUAS'].map(s=>[s,$('mp-row-'+s)?.scrollLeft||0]));
    const moduleScroll=$('mp-root').querySelector('.mp-set-pills')?.scrollLeft||0;
    const wasOpen=$('mp-dialog')?.open,gridPosition=$('mp-root').querySelector('.mp-grid-wrap'),gridScroll=gridPosition?{left:gridPosition.scrollLeft,top:gridPosition.scrollTop}:null,focused=document.activeElement,focusAccount=focused?.dataset.confirmAccount,focusTask=focused?.dataset.confirmTask;
    $('mp-root').innerHTML=`<div class="mp-toolbar"><div>${mode==='classes'&&group>=0?'<button class="mp-secondary" data-mp="class-cards">← Class cards</button>':''}</div><button class="mp-secondary" data-mp="refresh" data-page-content-refresh ${busy||pending?'disabled':''}>Refresh</button></div>
      <p id="mp-status" class="mp-status" role="status" aria-live="polite" data-error="${error}">${esc(message)}</p>${recovery()}
      ${mode==='self'?cards():group<0?classCards():classGrid()}
      <dialog id="mp-dialog" aria-labelledby="mp-dialog-title"></dialog>`;
    for(const [subject,left] of Object.entries(positions))if($('mp-row-'+subject))$('mp-row-'+subject).scrollLeft=left;
    const modulePills=$('mp-root').querySelector('.mp-set-pills');if(modulePills)modulePills.scrollLeft=moduleScroll;
    if(wasOpen&&dialogModule)openModule(dialogModule);
    const newGrid=$('mp-root').querySelector('.mp-grid-wrap');if(newGrid&&gridScroll){newGrid.scrollLeft=gridScroll.left;newGrid.scrollTop=gridScroll.top;}
    if(focusTask)Array.from($('mp-root').querySelectorAll('[data-confirm-task]')).find(n=>n.dataset.confirmTask===focusTask&&n.dataset.confirmAccount===focusAccount)?.focus({preventScroll:true});
    $('mp-dialog').addEventListener('cancel',e=>{if(busy||pending){e.preventDefault();return;}if(drafts.size&&!window.confirm('Close this set and discard unsaved changes?')){e.preventDefault();return;}drafts.clear();dialogModule='';});
    $('mp-root').querySelectorAll('button,input,select').forEach(n=>{if(busy||(pending||conflict)&&!['retry','refresh','close'].includes(n.dataset.mp))n.disabled=true;});
  }
  function cards(){
    if(data.personalActive===false)return '<div class="mp-intro"><h2>Your personal card is inactive</h2><p>An administrator has switched off your personal memorisation card. Your saved progress is kept.</p></div>';
    const records=data.records,total=data.sets.reduce((n,m)=>n+m.tasks.length,0),complete=records.filter(r=>r.complete&&data.sets.some(m=>m.tasks.some(t=>t.id===r.taskId))).length,confirmed=records.filter(r=>r.confirmed&&data.sets.some(m=>m.tasks.some(t=>t.id===r.taskId))).length;
    return `<div class="mp-intro"><h2>Your memorisation, one step at a time</h2><p>All registered users have free access to these surah and dua memorisation trackers.</p><p>Record your progress here.</p>${data.visitor?'<p class="mp-preview-notice" role="note"><strong>Visitor preview</strong> · Try the cards below. Your selections are temporary and will not be saved. Register or sign in to keep your progress.</p>':''}${data.student?`<div class="mp-summary"><div><strong>${complete}<span> / ${total}</span></strong><span>Marked memorised</span></div><div><strong>${confirmed}</strong><span>Teacher confirmed</span></div></div>`:''}</div>
      ${['SURAHS','DUAS'].map(subject=>`<section class="mp-row-section" aria-labelledby="mp-heading-${subject}"><div class="mp-row-heading"><div><h2 id="mp-heading-${subject}">${subject==='SURAHS'?'Surah sets':'Dua sets'}</h2><p>Swipe to explore your sets</p></div><div class="mp-arrows"><button data-scroll="${subject}:-1" aria-label="Previous ${subject==='SURAHS'?'Surah':'Dua'} sets">‹</button><button data-scroll="${subject}:1" aria-label="Next ${subject==='SURAHS'?'Surah':'Dua'} sets">›</button></div></div><div class="mp-row" id="mp-row-${subject}" tabindex="0" aria-label="${subject==='SURAHS'?'Surah':'Dua'} sets">${data.sets.filter(m=>m.subject===subject).map(m=>{
        const n=m.tasks.filter(t=>record(data.accountId,t.id).complete).length,c=m.tasks.filter(t=>record(data.accountId,t.id).confirmed).length;
        return `<article class="mp-card"><div class="mp-card-top"><span class="mp-level">Level ${esc(m.level)}</span><h3>${esc(m.name)}</h3><p>${m.tasks.length} ${subject==='SURAHS'?'surahs':'duas'}</p></div><div class="mp-card-bottom"><div class="mp-count"><span>${data.student?`${n} of ${m.tasks.length} memorised`:'Explore this set'}</span>${data.student?`<strong>${Math.round(100*n/m.tasks.length)}%</strong>`:''}</div><div class="mp-meter" role="progressbar" aria-label="${esc(m.name)} memorised" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${m.tasks.length}"><span style="width:${100*n/m.tasks.length}%"></span></div><div class="mp-confirmed-count">${data.student?`${c} teacher confirmed`:'Surahs and duas for your learning'}</div><button data-set="${esc(m.id)}">${data.student?'Open my set':'View tasks'}</button></div></article>`;
      }).join('')||'<p>No sets have been added yet.</p>'}</div></section>`).join('')}`;
  }
  function openModule(id){
    const m=data.sets.find(m=>m.id===id);if(!m)return;dialogModule=id;const dialog=$('mp-dialog'),top=dialog.scrollTop,focusedTask=document.activeElement?.dataset.task;
    dialog.innerHTML=`<div class="mp-heading"><div><span class="mp-level">Level ${esc(m.level)}</span><h2 id="mp-dialog-title">${esc(m.name)}</h2><p>Tick the items you have memorised</p></div><button class="mp-secondary" data-mp="close">Close</button></div><ul class="mp-task-list">${m.tasks.map(t=>{
      const r=current(data.accountId,t.id);return `<li><label><input type="checkbox" data-task="${esc(t.id)}" ${r.complete?'checked':''} ${!data.student||locked()?'disabled':''}><span class="mp-task-copy">${esc(t.name)}<small>${data.visitor?(r.complete?'Selected in this preview only':'Try ticking this item'):r.complete&&r.confirmed?'You and your teacher have confirmed':r.confirmed?'Teacher confirmed · record your own progress when ready':r.complete?'You marked this as memorised':'Ready when you are'}</small></span></label><div class="mp-task-confirmations">${r.complete?`<span class="mp-badge mp-learner-badge">✓ ${data.visitor?'Selected':'Memorised'}</span>`:''}${r.confirmed?'<span class="mp-badge mp-teacher-badge">✓ Teacher confirmed</span>':''}</div></li>`;
    }).join('')}</ul><div class="mp-actions"><span id="mp-dialog-status" role="status">${esc(message)}</span>${pending?'<button class="mp-primary" data-mp="retry">Retry save</button>':conflict?'<button class="mp-primary" data-mp="refresh">Refresh saved progress</button>':''}${data.student&&!data.visitor?`<button class="mp-primary" data-mp="save" ${locked()||!drafts.size?'disabled':''}>Save changes</button>`:''}</div>`;
    if(!dialog.open)dialog.showModal();dialog.scrollTop=top;
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
    const c=data.classes[group];if(!c)return classCards();return `<section class="mp-grid-card"><h2>${esc(c.name)}${(grid?.total||c.learnerCount)>(grid?.pageSize||c.learnersPerCard||20)?` - ${Math.floor(offset/(grid?.pageSize||c.learnersPerCard||20))+1}`:''} · ${subject==='SURAHS'?'Surahs':'Duas'}</h2><div class="mp-grid-controls"><nav class="mp-set-pills" aria-label="${subject==='SURAHS'?'Surah':'Dua'} sets">${classModules(subject).map(m=>`<button type="button" data-grid-set="${esc(m.id)}" aria-pressed="${m.id===moduleId}">${esc(m.name)}<small>Level ${esc(m.level)}</small></button>`).join('')}</nav><button class="mp-primary" data-mp="save" ${locked()||!drafts.size?'disabled':''}>Save confirmations</button></div><p class="mp-legend">Gold tick: learner marked memorised. Green tick: teacher confirmed. These are independent; both ticks appear when both have confirmed.</p>${grid?`<div class="mp-grid-wrap" tabindex="0" aria-label="${esc(c.name)} memorisation grid"><table class="mp-grid"><thead><tr><th scope="col">Learner</th>${grid.set.tasks.map(t=>`<th scope="col">${esc(t.name)}</th>`).join('')}</tr></thead><tbody>${grid.learners.map(a=>`<tr><th scope="row">${esc(a.name)}</th>${grid.set.tasks.map(t=>{const r=current(a.id,t.id);return `<td data-state="${r.complete&&r.confirmed?'both':r.confirmed?'confirmed':r.complete?'pending':'empty'}"><div class="mp-dual-confirmations"><span class="mp-learner-mark" data-learner-mark="${r.complete}" role="img" aria-label="${r.complete?'Learner marked memorised':'Learner has not marked memorised'}">${r.complete?'✓':'—'}</span><label class="mp-grid-cell"><input type="checkbox" data-confirm-account="${esc(a.id)}" data-confirm-task="${esc(t.id)}" aria-label="Teacher confirmation: ${esc(t.name)} for ${esc(a.name)}" ${r.confirmed?'checked':''} ${locked()?'disabled':''}></label></div></td>`;}).join('')}</tr>`).join('')||`<tr><td colspan="${grid.set.tasks.length+1}">No active learners in this class. Check class enrolments.</td></tr>`}</tbody></table></div>`:'<p>No sets are available.</p>'}</section>`;
  }
  async function save(action){
    if(locked()||data?.visitor)return;
    let input;
    if(action==='import'){
      if(!upload?.length)return;if(upload.some(m=>!m.subject||!m.level.trim())){status('Choose a subject and level for every set.',true);return;}
      const importMode=$('mp-import-mode').value;if(importMode==='REPLACE'&&!window.confirm('Replace matching sets? Their existing learner task progress will be cleared. Other sets stay as they are.'))return;
      input={catalogueRevision:data.revision,sets:upload,mode:importMode,operationId:crypto.randomUUID()};
    }else{
      const updates=[...drafts].map(([k,v])=>{const split=k.indexOf(':');const a=k.slice(0,split),t=k.slice(split+1);return {accountId:a,taskId:t,revision:record(a,t).revision,...v};});
      if(!updates.length)return;const c=data.classes[group];
      input={catalogueRevision:data.revision,updates,operationId:crypto.randomUUID(),...(action==='confirm'?{activityKey:c.activityKey,classId:c.id}:{})};
    }
    pending=JSON.parse(JSON.stringify({owner,action,input,cardOffset:offset}));try{sessionStorage.setItem(KEY,JSON.stringify(pending));}catch{pending=null;status('Your browser cannot keep a safe retry. Allow tab storage before saving.',true);return;}
    await transmit();
  }
  async function transmit(){
    if(!pending||busy)return;busy=true;render();status('Saving…');const g=generation,operation=pending;
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
    if(busy||pending)return;
    if(!conflict&&drafts.size&&!window.confirm('Refresh and discard your unsaved changes?'))return;
    if(!conflict)drafts.clear();busy=true;render();status('Refreshing…');
    try{
      await load();const tasks=new Set(data.sets.flatMap(m=>m.tasks.map(t=>t.id)));let removed=0;
      for(const [k,v] of drafts){const split=k.indexOf(':'),a=k.slice(0,split),t=k.slice(split+1),r=record(a,t);
        if(!tasks.has(t)||mode==='classes'&&(!grid?.learners.some(l=>l.id===a))||Object.keys(v).filter(f=>f==='complete'||f==='confirmed').every(f=>v[f]===r[f])){drafts.delete(k);removed++;}}
      conflict=false;status(removed?'Saved progress refreshed. Tasks that are no longer eligible or already match your choices were removed from this draft. Review before saving.':drafts.size?'Saved progress refreshed. Review your choices, then save.':'Progress refreshed.');
    }
    catch(e){if(!e.stale)status(e.message,true);}finally{busy=false;render();}
  }
  $('mp-root').addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b||b.disabled)return;
    try{
      if(b.dataset.set){openModule(b.dataset.set);return;}
      if(b.dataset.gridSet){
        const next=b.dataset.gridSet;if(next===moduleId||!canLeave())return;drafts.clear();conflict=false;moduleId=next;busy=true;render();await loadGrid();busy=false;render();
        Array.from($('mp-root').querySelectorAll('[data-grid-set]')).find(n=>n.dataset.gridSet===next)?.focus({preventScroll:true});return;
      }
      if(b.dataset.scroll){const [s,d]=b.dataset.scroll.split(':');$('mp-row-'+s).scrollBy({left:Number(d)*272,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return;}
      const action=b.dataset.mp;
      if(action==='retry'){await transmit();return;}if(action==='reload'){session='';await open(context);return;}
      if(action==='close'){if(busy)return;if(pending){dialogModule='';$('mp-dialog').close();return;}if(drafts.size&&!window.confirm('Close this set and discard unsaved changes?'))return;drafts.clear();dialogModule='';$('mp-dialog').close();return;}
      if(action==='save'){await save(mode==='classes'?'confirm':'mark');return;}if(action==='upload'){await save('import');return;}if(action==='refresh'){await refresh();return;}
      if(action==='class-cards'||b.dataset.class!==undefined){
        if(context.view!=='teach'||!canLeave())return;drafts.clear();conflict=false;grid=null;
        if(action==='class-cards'){group=-1;subject='';moduleId='';render();return;}
        if(b.dataset.class!==undefined){group=Number(b.dataset.class);subject=b.dataset.subject;moduleId=classModules(subject)[0]?.id||'';offset=Number(b.dataset.offset||0);}
        busy=true;render();await loadGrid();busy=false;render();
      }
    }catch(e){busy=false;if(!e.stale){status(e.message,true);render();}}
  });
  $('mp-root').addEventListener('change',async event=>{
    const n=event.target;if(locked())return;
    if((n.dataset.task||n.dataset.confirmTask)&&drafts.size>=100&&!drafts.has(key(n.dataset.confirmAccount||data.accountId,n.dataset.confirmTask||n.dataset.task))){n.checked=!n.checked;status('Save your current 100 changes before marking more tasks.',true);return;}
    try{
      if(n.dataset.task){const t=n.dataset.task,r=record(data.accountId,t);if(data.visitor){data.records=data.records.filter(r=>r.taskId!==t);if(n.checked)data.records.push({accountId:data.accountId,taskId:t,complete:true,confirmed:false,revision:0});render();return;}if(n.checked===r.complete)drafts.delete(key(data.accountId,t));else drafts.set(key(data.accountId,t),{complete:n.checked});openModule(dialogModule);return;}
      if(n.dataset.confirmTask){const a=n.dataset.confirmAccount,t=n.dataset.confirmTask,r=record(a,t);if(n.checked===r.confirmed)drafts.delete(key(a,t));else drafts.set(key(a,t),{confirmed:n.checked});render();return;}
      if(n.id==='mp-file'){
        const file=n.files[0];if(!file)return;upload=null;status('Reading set list…');const g=generation;
        const parsed=await window.M4L_MEMORISATION_UPLOAD.read(file);if(g!==generation)return;upload=parsed;status('Review the subjects and levels, then save your sets.');render();return;
      }
      if(n.dataset.importSubject!==undefined)upload[Number(n.dataset.importSubject)].subject=n.value;
      if(n.dataset.importLevel!==undefined)upload[Number(n.dataset.importLevel)].level=n.value;
    }catch(e){busy=false;if(!e.stale){status(e.message,true);render();}}
  });
  window.addEventListener('beforeunload',event=>{if(drafts.size||pending||busy){event.preventDefault();event.returnValue='';}});
  window.M4L_ACADEMY_PROGRESS={open,reset,canLeave};
})();
