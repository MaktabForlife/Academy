(() => {
 'use strict';
 const token=()=>localStorage.getItem('m4l_account_token')||'';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const scope=()=>JSON.stringify([token(),window.M4L_ACADEMY_WORKSPACE?.current(),window.M4L_ACADEMY_WORKSPACE?.classView(),window.M4L_ACADEMY_WORKSPACE?.head()]);
 const ref=row=>JSON.stringify([row.activityKey||row.kind+':'+row.activityId,row.sourceDate||row.date,row.sessionKey||row.mediaSessionKey]);
 const date=value=>value?new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'';
 const at=value=>value?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:data?.timezone||'Africa/Johannesburg'}).format(new Date(value)):'';
 let visible=false,owner='',epoch=0,tableEpoch=0,dialog=null,data=null,edit=null,pending=null,busy=false,dirty=false,review=false,refresh=()=>{},dialogEpoch=0,dueRequest=0;
 const batches=new Map(),lessons=new Map();
 let dashboardStatus='idle',dashboardMessage='';
 const changed=()=>window.dispatchEvent(new Event('m4l-class-notes-updated'));
 function checkOwner(){const next=scope();if(next!==owner){if(owner&&JSON.stringify(JSON.parse(owner).slice(0,3))===JSON.stringify(JSON.parse(next).slice(0,3)))invalidate();else reset();owner=next;}return next;}
 function invalidate(){tableEpoch++;batches.clear();lessons.clear();dashboardStatus='idle';dashboardMessage='';changed();}
 async function api(action,input){
  const captured=scope(),generation=epoch,response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/academy/class-notes/${action}`,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify(input)});
  const result=await response.json();if(generation!==epoch||captured!==scope())throw new DOMException('The Academy account or workspace changed.','AbortError');
  if(!response.ok||!result.success){if(response.status===401)window.dispatchEvent(new Event('m4l-academy-session-ended'));throw Object.assign(Error(result.error||'Class Notes are unavailable. Please try again.'),{status:response.status,code:result.code});}return result;
 }
 function reset(){epoch++;invalidate();visible=false;close(true);}
 function close(force=false){
  if(!force&&busy){message('Please wait for this change to finish.');return false;}
  if(!force&&dirty&&!confirm('Discard your unfinished Class Note?'))return false;
  dialogEpoch++;dueRequest++;dialog?.close();dialog?.remove();dialog=null;data=null;edit=null;pending=null;busy=false;dirty=false;review=false;return true;
 }
 function message(text,error=false){const el=dialog?.querySelector('[data-cn-message]');if(el){el.textContent=text;el.setAttribute('role',error?'alert':'status');}}
 function modal(){
  if(!close())return false;
  dialog=document.createElement('dialog');dialog.className='cn-dialog';dialog.setAttribute('aria-labelledby','cn-title');
  dialog.innerHTML='<header class="cn-heading"><h2 id="cn-title">Class Notes</h2><button type="button" class="button secondary academy-close" data-cn="close" title="Close">Close</button></header><p data-cn-message role="status" aria-live="polite"></p><div data-cn-body></div>';
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('click',click);dialog.addEventListener('submit',submit);dialog.addEventListener('input',event=>{if(event.target.closest('form'))dirty=true;});dialog.addEventListener('change',change);document.body.append(dialog);dialog.showModal();return true;
 }
 const body=html=>{if(dialog)dialog.querySelector('[data-cn-body]').innerHTML=html;};
 const context=source=>`<div class="cn-context"><strong>${esc(source.title)}</strong><p>${esc(date(source.date))} · ${esc(source.startTime)}–${esc(source.endTime)}</p><p>${esc(source.className)} · ${esc(source.teacherNames.join(', ')||'Teacher not listed')}</p>${source.unresolved?'<p class="cn-warning">This lesson needs staff review following a timetable change. Its saved record is retained.</p>':''}${source.contextChanged?'<p>Teaching details have changed since the original lesson record.</p>':''}${source.moved?`<p>Rescheduled from ${esc(date(source.originalDate))}.</p>`:''}</div>`;
 const dueText=due=>`${date(due.date)}${due.target?' · '+due.target.startTime+'–'+due.target.endTime:''}`;
 function noteHTML(note){
  return `<article class="cn-note" id="cn-note-${esc(note.id)}"><header><strong>${esc(note.author)}</strong><small>${esc(at(note.createdAt))}</small></header>${note.state==='WITHDRAWN'?`<p>Class Note withdrawn by ${esc(note.editor)} · ${esc(at(note.withdrawnAt))}</p>`:`<p class="cn-text" dir="auto">${esc(note.body)}</p><p class="cn-due"><strong>Due ${esc(dueText(note.due))}</strong>${note.due.needsReview?' · Target lesson needs staff review':''}${note.due.mode==='DATE'&&!note.due.target?' · No matching lesson on this date':''}</p>${note.revision>1?`<small>Updated by ${esc(note.editor)} · ${esc(at(note.updatedAt))}</small>`:''}`}
   <div class="cn-actions">${note.canEdit?`<button type="button" class="button secondary" data-cn="edit" data-id="${esc(note.id)}">Correct note</button>`:''}${note.canRelink?`<button type="button" class="button secondary" data-cn="relink" data-id="${esc(note.id)}">Change linked lesson</button>`:''}${note.canWithdraw?`<button type="button" class="button secondary" data-cn="withdraw" data-id="${esc(note.id)}">Withdraw</button>`:''}${note.state==='ACTIVE'||data.source.canModerate?`<button type="button" class="button secondary" data-cn="history" data-id="${esc(note.id)}">History</button>`:''}</div></article>`;
 }
 function renderLesson(){
  document.getElementById('cn-title').textContent='Class Notes';edit=null;pending=null;review=false;dirty=false;
  body(`${context(data.source)}<div class="cn-heading"><h3>Class Notes${data.notes.length?' ('+data.notes.length+')':''}</h3>${data.source.canPost?'<button type="button" class="button" data-cn="add">Add Class Note</button>':''}</div>${data.notes.map(noteHTML).join('')||'<p>No Class Notes yet.</p>'}${data.before?'<button type="button" class="button secondary" data-cn="more-notes">Load earlier notes</button>':''}`);
  if(data.focusNoteId)dialog.querySelector('#cn-note-'+CSS.escape(data.focusNoteId))?.scrollIntoView({block:'nearest'});
 }
 async function load(input,add=false,existing=false){
  if(!existing&&!modal())return;const generation=dialogEpoch;body('<p>Opening Class Notes…</p>');message('');
  try{const result=await api('get',input);if(generation!==dialogEpoch)return;data=result;if(add&&data.source.canPost)editor();else renderLesson();}catch(error){if(generation===dialogEpoch){body('<button type="button" class="button secondary" data-cn="retry-open">Try again</button>');dialog.openInput=input;message(error.message,true);}}
 }
 async function openSources(sources,add=false){
  checkOwner();if(!sources.length)return;
  if(sources.length===1){const source=sources[0];return load({activityKey:source.activityKey,source},add);}
  if(!modal())return;dialog.choices=sources;dialog.addChoice=add;
  body('<p>Choose the class for this lesson.</p><div class="cn-actions">'+sources.map((source,i)=>`<button type="button" class="button secondary" data-cn="choose" data-index="${i}">${esc(source.className)} · ${esc(source.title)}</button>`).join('')+'</div>');
 }
 function editor(note=null,relink=false){
  edit={note,relink,due:note?.due||data.nextDue,keep:Boolean(note&&!relink),choices:[]};pending=null;review=false;dirty=false;
  document.getElementById('cn-title').textContent=relink?'Change linked lesson':note?'Correct Class Note':'Add Class Note';
  body(`${context(data.source)}<form data-cn-form>${relink?`<label>New lesson date<input name="sourceDate" type="date" value="${esc(data.source.date)}" required></label><button type="button" class="button secondary" data-cn="find-sources">Find lessons</button><label>Linked lesson<select name="target" required><option value="">Choose a lesson</option></select></label><label>Reason<textarea name="reason" maxlength="1000" required rows="2"></textarea></label>`:`<label>Class Note<textarea name="body" rows="9" maxlength="12000" dir="auto" required placeholder="Type or paste the complete instructions…">${esc(note?.body||'')}</textarea></label>`}
   <fieldset><legend>Due date</legend><label class="cn-choice"><input name="dueMode" type="radio" value="NEXT" ${(!note||note.due.mode==='NEXT')?'checked':''}> Next session</label><label class="cn-choice"><input name="dueMode" type="radio" value="DATE" ${note?.due.mode==='DATE'?'checked':''}> Select a date</label><label data-cn-date-label${note?.due.mode==='DATE'?'':' hidden'}>Date<input name="dueDate" type="date" min="${esc(data.source.date)}" value="${esc(note?.due.date||'')}"></label><p data-cn-due-preview role="status"></p></fieldset>
   <p class="cn-audience">Visible to ${esc(data.source.className)} and its responsible Teachers.</p><div class="cn-actions"><button type="submit" class="button" data-cn-save>${relink?'Save linked lesson':note?'Save correction':'Post to class'}</button><button type="button" class="button secondary" data-cn="cancel">Cancel</button><button type="button" class="button secondary" data-cn="review" hidden>Review updated lesson</button></div></form>`);
  preview(edit.due);if(!note&&!edit.due)message('No next matching session is available. Select a due date.');
  dialog.querySelector('textarea')?.focus();if(relink){edit.due=null;preview(null);}
 }
 function preview(due){const el=dialog?.querySelector('[data-cn-due-preview]');if(el)el.textContent=due?`${dueText(due)}${due.target?' · '+due.target.title:' · No matching lesson on this date'}`:'No next matching session is available. Select a date.';const save=dialog?.querySelector('[data-cn-save]');if(save)save.disabled=!due||review||busy;}
 const formSource=()=>edit?.relink?edit.choices[Number(dialog.querySelector('[name=target]')?.value)]||null:data?.source;
 async function updateDue(){
  if(!edit||pending)return;edit.keep=false;edit.due=null;preview(null);const form=dialog.querySelector('form'),source=formSource();if(!source)return;
  const mode=form.elements.dueMode.value,date=form.elements.dueDate.value;
  form.querySelector('[data-cn-date-label]').hidden=mode!=='DATE';form.elements.dueDate.required=mode==='DATE';if(mode==='DATE'&&!date){message('Select a due date.');return;}
  const request=++dueRequest,generation=dialogEpoch;message('Checking due date…');
  try{const result=await api('due',{activityKey:source.activityKey,source,due:{mode,date}});if(generation!==dialogEpoch||request!==dueRequest)return;edit.due=result.due;preview(edit.due);message('');}catch(error){if(generation===dialogEpoch&&request===dueRequest)message(error.message,true);}
 }
 function formLock(locked){dialog?.querySelectorAll('form input,form textarea,form select,form button').forEach(el=>el.disabled=locked);}
 async function commit(action,input){
  busy=true;const generation=dialogEpoch;formLock(true);message('Saving…');
  try{await api(action,input);if(generation!==dialogEpoch)return;dirty=false;pending=null;busy=false;batches.clear();lessons.clear();refresh();await load({activityKey:data.source.activityKey,noteId:input.noteId||undefined,...(!input.noteId?{source:data.source}:{})},false,true);message(action==='withdraw'?'Class Note withdrawn.':'Class Note saved.');}
  catch(error){if(generation!==dialogEpoch)return;busy=false;
   if(!error.status||error.status>=500){pending={action,input};message('The save could not be confirmed. Your text is kept. Retry this same change.',true);dialog.querySelector('[data-cn-save]')?.removeAttribute('disabled');if(!dialog.querySelector('[data-cn-save]'))body('<button type="button" class="button" data-cn="retry-save">Retry change</button>');}
   else {pending=null;formLock(false);message(error.message,true);if(error.status===409){review=true;const button=dialog.querySelector('[data-cn="review"]');if(button)button.hidden=false;preview(edit?.due);}if(error.status===403||error.status===401)dialog.querySelector('[data-cn-save]')?.setAttribute('disabled','');}
  }
 }
 async function submit(event){
  if(!event.target.matches('[data-cn-form]'))return;event.preventDefault();if(busy)return;if(pending)return commit(pending.action,pending.input);if(review||!edit?.due)return;
  const form=event.target,source=formSource();if(!source)return;const note=edit.note;
  const input={activityKey:data.source.activityKey,operationId:crypto.randomUUID(),...(note?{noteId:note.id,revision:note.revision}:{}),...(!note||edit.relink?{source,sourceToken:source.token}:{}),body:edit.relink?note.body:form.elements.body.value,due:edit.keep?{keep:true}:{mode:form.elements.dueMode.value,date:form.elements.dueDate.value,token:edit.due.token},...(edit.relink?{reason:form.elements.reason.value}:{})};
  pending={action:edit.relink?'relink':note?'revise':'post',input};return commit(pending.action,input);
 }
 async function click(event){
  const button=event.target.closest('[data-cn]');if(!button)return;const action=button.dataset.cn,id=button.dataset.id,note=data?.notes.find(n=>n.id===id);
  if(action==='close')return close();if(busy)return;
  if(action==='retry-open')return load(dialog.openInput,false,true);
  if(action==='retry-save'&&pending)return commit(pending.action,pending.input);
  if(action==='choose'){const source=dialog.choices[Number(button.dataset.index)],add=dialog.addChoice;return load({activityKey:source.activityKey,source},add,true);}
  if(action==='add')return editor();if(action==='edit')return editor(note);if(action==='relink')return editor(note,true);
  if(action==='cancel'||action==='back'){if(dirty&&!confirm('Discard your unfinished Class Note?'))return;renderLesson();message('');return;}
  if(action==='withdraw'){
   if(!confirm('Withdraw this Class Note? Its history will be retained.'))return;
   return commit('withdraw',{activityKey:data.source.activityKey,noteId:note.id,revision:note.revision,operationId:crypto.randomUUID()});
  }
  if(action==='more-notes'){const generation=dialogEpoch;button.disabled=true;message('Loading earlier notes…');try{const result=await api('get',{activityKey:data.source.activityKey,source:data.source,before:data.before});if(generation!==dialogEpoch)return;data={...result,notes:[...new Map([...data.notes,...result.notes].map(n=>[n.id,n])).values()]};renderLesson();message('');}catch(error){if(generation===dialogEpoch){button.disabled=false;message(error.message,true);}}return;}
  if(action==='history'||action==='more-history'){
   const generation=dialogEpoch;message('Opening history…');try{const noteId=action==='more-history'?dialog.historyNote:id;const result=await api('history',{activityKey:data.source.activityKey,noteId:noteId,...(action==='more-history'?{beforeRevision:dialog.historyBefore}:{})});if(generation!==dialogEpoch)return;
    dialog.historyNote=noteId;dialog.historyBefore=result.beforeRevision;dialog.historyVersions=action==='more-history'?[...dialog.historyVersions,...result.versions]:result.versions;
    body(`<button type="button" class="button secondary" data-cn="back">Back to Class Notes</button><h3>Note history</h3>${dialog.historyVersions.map(v=>`<article class="cn-note"><strong>Version ${v.revision} · ${esc(v.editor)}</strong><p>${esc(at(v.createdAt))}</p><p class="cn-text" dir="auto">${esc(v.body)}</p><p>Due ${esc(dueText(v.due))}</p>${v.reason?`<p>Linked lesson changed: ${esc(v.reason)}</p>`:''}</article>`).join('')}${result.beforeRevision?'<button type="button" class="button secondary" data-cn="more-history">Load earlier versions</button>':''}`);message('');
   }catch(error){if(generation===dialogEpoch)message(error.message,true);}return;
  }
  if(action==='find-sources'){
   const generation=dialogEpoch,date=dialog.querySelector('[name=sourceDate]').value;message('Finding lessons…');try{const result=await api('sessions',{activityKey:data.source.activityKey,date});if(generation!==dialogEpoch)return;
    edit.choices=result.sources.filter(s=>s.classId===data.source.classId&&s.canModerate);dialog.querySelector('[name=target]').innerHTML='<option value="">Choose a lesson</option>'+edit.choices.map((s,i)=>`<option value="${i}">${esc(s.startTime+' · '+s.title+' · '+s.teacherNames.join(', '))}</option>`).join('');message(edit.choices.length?'Choose the linked lesson.':'No eligible lessons found for this class.');
   }catch(error){if(generation===dialogEpoch)message(error.message,true);}return;
  }
  if(action==='review'){
   const generation=dialogEpoch,draft=dialog.querySelector('[name=body]')?.value,dueMode=dialog.querySelector('[name=dueMode]:checked')?.value,dueDate=dialog.querySelector('[name=dueDate]')?.value,noteId=edit.note?.id;
   try{await window.M4L_ACADEMY_WORKSPACE?.readyPublication(true);owner=scope();batches.clear();lessons.clear();const result=await api('get',{activityKey:data.source.activityKey,...(noteId?{noteId}:{source:data.source})});if(generation!==dialogEpoch)return;data=result;const current=noteId?data.notes.find(n=>n.id===noteId):null;
    if(noteId&&!current?.canEdit){message('This note can no longer be corrected. Your unfinished text is kept here.',true);return;}
    editor(current);if(draft!==undefined){dialog.querySelector('[name=body]').value=draft;dirty=true;}
    const saved=dialog.querySelector('[data-cn-body]');if(current){const article=document.createElement('article');article.className='cn-note';article.innerHTML='<strong>Current saved version</strong><p class="cn-text" dir="auto">'+esc(current.body)+'</p>';saved.append(article);}
    dialog.querySelector(`[name=dueMode][value="${dueMode}"]`).checked=true;dialog.querySelector('[name=dueDate]').value=dueDate;await updateDue();message('Review the current saved version, your text and due date before saving.');
   }catch(error){if(generation===dialogEpoch)message(error.message,true);}
  }
 }
 function change(event){if(['dueMode','dueDate','target'].includes(event.target.name))void updateDue();if(event.target.name==='sourceDate'&&edit?.relink){edit.choices=[];dialog.querySelector('[name=target]').innerHTML='<option value="">Choose a lesson</option>';edit.due=null;preview(null);}}
 function timetable(rows,onUpdate){
  checkOwner();refresh=onUpdate;const sources=[...new Map(rows.filter(row=>row.mediaSessionKey).map(row=>[ref(row),{activityKey:row.kind+':'+row.activityId,date:row.sourceDate||row.date,sessionKey:row.mediaSessionKey}])).values()];
  if(!sources.length||!token())return;const key=JSON.stringify(sources),generation=epoch,tableGeneration=tableEpoch;if(batches.has(key))return;batches.set(key,true);if(batches.size>8)batches.delete(batches.keys().next().value);
  dashboardStatus='loading';dashboardMessage='';changed();
  const current=()=>generation===epoch&&tableGeneration===tableEpoch;
  const apply=result=>{if(!current())return;for(const lesson of result.sessions||[])lessons.set(lesson.ref,{...lesson,today:result.today});dashboardStatus=result._cacheChecking?'checking':result._cacheMessage?'stale':'ready';dashboardMessage=result._cacheMessage||'';changed();onUpdate();};
  const failure=(error,saved)=>{if(!current()||error.name==='AbortError')return;if(!saved)lessons.clear();dashboardStatus=saved?'stale':'error';dashboardMessage=saved?'Showing saved Class Notes. Couldn’t check for updates.':'Class Notes could not be checked.';changed();window.dispatchEvent(new CustomEvent('m4l-class-notes-error',{detail:error.message}));};
  void (async()=>{try{
   for(let i=0;i<sources.length;i+=200){
    const input={sessions:sources.slice(i,i+200)},cache=window.M4L_ACADEMY_READ_CACHE;
    const result=cache?await cache.load({key:['class-notes-timetable',input],revalidate:true,fetcher:()=>api('timetable',input),onUpdate:apply,onError:failure}):await api('timetable',input);
    apply(result);
   }
  }catch(error){failure(error,false);}})();
 }
 function buttons(row,detail=false){
  const key=ref(row),lesson=lessons.get(key);if(!lesson||!lesson.sources.length)return '';
  return (visible||detail?`<div class="cn-card-actions">${lesson.sources.some(s=>s.canPost)?`<button type="button" data-cn-open="add" data-cn-ref="${esc(key)}">+ Note</button>`:''}<button type="button" data-cn-open="notes" data-cn-ref="${esc(key)}">Class Notes${lesson.noteCount?' ('+lesson.noteCount+')':''}</button></div>`:'')+(lesson.dueNotes.length?`<button type="button" class="cn-reminder" data-cn-open="due" data-cn-ref="${esc(key)}">${row.date===lesson.today?'Due today':'Due this lesson'} · Class Note${lesson.dueNotes.length>1?' ('+lesson.dueNotes.length+')':''}</button>`:'');
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-cn-open]');if(!button)return;const lesson=lessons.get(button.dataset.cnRef);if(!lesson)return;
  if(button.dataset.cnOpen==='due'){
   const source=lesson.sources[0],notes=lesson.dueNotes;if(notes.length===1)return void load({activityKey:source.activityKey,noteId:notes[0].id});
   if(!modal())return;body('<h3>Class Notes due this lesson</h3>'+notes.map((note,i)=>`<p><button type="button" class="button secondary" data-cn-due-index="${i}">${esc(note.title)} · ${esc(note.author)}</button></p>`).join(''));
   dialog.querySelectorAll('[data-cn-due-index]').forEach(el=>el.addEventListener('click',()=>void load({activityKey:source.activityKey,noteId:notes[Number(el.dataset.cnDueIndex)].id},false,true)));
  }else void openSources(lesson.sources,button.dataset.cnOpen==='add');
 });
 window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
 window.M4L_CLASS_NOTES={snapshot:()=>scope()===owner?{sessions:[...lessons.values()],status:dashboardStatus,message:dashboardMessage}:{sessions:[],status:'idle'},open:input=>{checkOwner();return load(input);},timetable,buttons,visible:()=>visible,toggle:()=>{visible=!visible;return visible;},canLeave:()=>close(),invalidate,reset};
})();
