(() => {
 'use strict';
 const token=()=>localStorage.getItem('m4l_account_token')||'';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let host=null,session='',generation=0,dialogGeneration=0,data=null,dialog=null,editor=null,discussion=null,retry=null,busy=false,dirty=false,objectUrl='',learnerView=false,activityKey='',runId='',week='',calendarRequest=0,calendarLoading=false,calendarError='',classFilter='',touch=null;
 const date=v=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(v+'T12:00:00Z'));
 function active(g=generation){return g===generation&&session===token()&&Boolean(host);}
 function modalMessage(text,error=false){const el=dialog?.querySelector('[data-lm-dialog-message]');if(el){el.textContent=text;el.setAttribute('role',error?'alert':'status');}}
 async function api(action,input,options={}){
  input={activityKey,...input};
  if(learnerView&&action==='comments')input={...input,view:'learner'};
  const current=session,g=generation,response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/academy/lesson-media/${action}${options.upload?'?metadata='+encodeURIComponent(JSON.stringify(input)):''}`,{method:'POST',headers:{Authorization:'Bearer '+current,...(!options.upload?{'Content-Type':'application/json'}:{})},body:options.upload?options.upload:JSON.stringify(input)});
  if(!active(g)||current!==session)throw Error('The Academy account has changed.');
  if(options.blob&&response.ok)return response.blob();
  const result=await response.json();if(!response.ok||!result.success){if(response.status===401)window.dispatchEvent(new Event('m4l-academy-session-ended'));throw Error(result.error||'Lesson media is temporarily unavailable.');}return result;
 }
 const dayOffset=(value,offset)=>new Date(Date.parse(value+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const sunday=value=>dayOffset(value,-new Date(value+'T12:00:00Z').getUTCDay());
 const validDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 function icons(row){
  if(!row)return '<span class="lm-attach-hint">＋ Attach media</span>';
  const videos=row.assets.filter(asset=>asset.kind==='YOUTUBE').length,pdfs=row.assets.filter(asset=>asset.kind==='PDF').length;
  return `<span class="lm-media-icons">${videos?`<span aria-label="${videos} video${videos===1?'':'s'} attached"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4z"/></svg>${videos} video${videos===1?'':'s'}</span>`:''}${pdfs?`<span aria-label="${pdfs} PDF${pdfs===1?'':'s'} attached"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l5 5v15H6zM14 2v6h5M9 13h7M9 17h7"/></svg>${pdfs} PDF${pdfs===1?'':'s'}</span>`:''}${!videos&&!pdfs?'<span>No attachments yet</span>':''}</span>`;
 }
 function render(){
  if(!host)return;
  const focus=host.contains(document.activeElement)?document.activeElement?.dataset.lm:null;
  const rows=!calendarLoading&&!calendarError?data?.sessions||[]:[],classes=[...new Set(rows.flatMap(row=>row.classNames||[]))].sort((a,b)=>a.localeCompare(b));
  const visible=rows.filter(row=>!classFilter||row.classNames?.includes(classFilter));
  host.innerHTML=`<div class="lm-heading"><div><h2>Lesson media</h2><p>${esc(data?.activityName||'')}</p></div><button type="button" class="button secondary" data-lm="refresh">Refresh</button></div><div class="lm-week-nav" data-lm-week-nav><div class="lm-week-controls"><button type="button" class="button secondary" data-lm="week-previous" aria-label="Previous week">←</button><strong data-lm-week-label>${esc(date(week))} – ${esc(date(dayOffset(week,6)))}</strong><button type="button" class="button secondary" data-lm="week-next" aria-label="Next week">→</button><button type="button" class="button secondary" data-lm="week-today">This week</button></div><div class="lm-calendar-filters"><label>Go to date<input type="date" data-lm-date value="${esc(week)}" aria-label="Lesson media date"></label>${data?.runs?.length?`<label>Course offering<select data-lm-run>${data.runs.map(run=>`<option value="${esc(run.id)}"${run.id===runId?' selected':''}>${esc(run.name)}</option>`).join('')}</select></label>`:''}${classes.length>1||classFilter?`<label>Class<select data-lm-class><option value="">All classes</option>${[...new Set([...classes,...(classFilter?[classFilter]:[])])].map(name=>`<option${name===classFilter?' selected':''}>${esc(name)}</option>`).join('')}</select></label>`:''}</div></div><p class="lm-calendar-help">${data?.canManage?'Select a lesson to attach or manage videos and PDFs.':'Select a lesson to open its published videos and PDFs.'} Swipe across the days; use the arrows or swipe the week heading to change week.</p><p class="lm-message" data-lm-message role="${calendarError?'alert':'status'}" aria-live="polite">${calendarLoading?'Loading lesson timetable…':esc(calendarError)||(!visible.length?(data?.canManage?'No lessons this week. Choose another week, or publish the timetable / save Course sessions first.':'No published lesson media this week. Choose another week.'):'')}</p>${calendarError?'<button type="button" class="button secondary" data-lm="refresh">Try again</button>':''}<div class="lm-timetable-scroll" tabindex="0" role="region" aria-label="Weekly lesson media timetable" aria-busy="${calendarLoading}"><div class="lm-timetable">${Array.from({length:7},(_,index)=>{const day=dayOffset(week,index),lessons=visible.filter(row=>row.date===day);return `<section class="lm-day${day===today()?' is-today':''}" aria-label="${esc(date(day))}"><h3><time datetime="${day}">${esc(new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z')))}</time></h3>${lessons.map(row=>`<button type="button" class="lm-session${row.media?' has-media':''}" data-lm="calendar-session" data-key="${esc(row.sessionKey)}"><span class="lm-session-time">${esc(row.startTime)}–${esc(row.endTime)}</span><strong>${esc(row.title)}</strong>${row.classNames?.length?`<span class="lm-session-meta">${esc(row.classNames.join(', '))}</span>`:''}${row.teacherName?`<span class="lm-session-meta">${esc(row.teacherName)}</span>`:''}${row.savedMedia?'<span class="lm-session-meta">Saved lesson media</span>':''}${icons(row.media)}${row.media&&row.media.state!=='PUBLISHED'?`<span class="lm-state">${esc(row.media.state)}</span>`:''}</button>`).join('')||`<p class="lm-empty-day">${calendarLoading?'Loading…':'No lessons'}</p>`}</section>`;}).join('')}</div></div>`;
  if(focus)host.querySelector('[data-lm="'+focus+'"]')?.focus({preventScroll:true});
 }
 async function load(initial=false){
  const g=generation,request=++calendarRequest;calendarLoading=true;calendarError='';render();
  try{const result=await api('calendar',{startDate:week,endDate:dayOffset(week,6),runId,initial,...(learnerView?{view:'learner'}:{})});if(!active(g)||request!==calendarRequest)return;
   if(initial&&validDay(result.suggestedDate)&&sunday(result.suggestedDate)!==week){week=sunday(result.suggestedDate);return await load(false);}
   data=result;runId=result.runId||runId;calendarLoading=false;render();
  }catch(error){if(active(g)&&request===calendarRequest){calendarLoading=false;calendarError=error.message;render();}}
 }
 function moveWeek(offset){if(busy)return;week=offset===0?sunday(today()):dayOffset(week,offset);void load();}
 function calendarChange(event){if(busy)return;const input=event.target;if(input.matches('[data-lm-date]')){if(validDay(input.value)){week=sunday(input.value);void load();}}else if(input.matches('[data-lm-run]')){runId=input.value;void load(true);}else if(input.matches('[data-lm-class]')){classFilter=input.value;render();}}
 function swipeStart(event){const point=event.touches?.[0],nav=event.target.closest('[data-lm-week-nav]'),grid=event.target.closest('.lm-timetable-scroll');if(!point||!nav&&!grid||event.target.closest('input,select'))return;touch={x:point.clientX,y:point.clientY,nav:Boolean(nav),atStart:grid?.scrollLeft<=1,atEnd:grid?grid.scrollLeft+grid.clientWidth>=grid.scrollWidth-1:false};}
 function swipeEnd(event){const point=event.changedTouches?.[0],start=touch;touch=null;if(!point||!start)return;const dx=point.clientX-start.x,dy=point.clientY-start.y;if(Math.abs(dx)<70||Math.abs(dy)>Math.abs(dx)/2)return;if(start.nav||dx>0&&start.atStart||dx<0&&start.atEnd)moveWeek(dx<0?7:-7);}
 async function selectSession(row){
  if(!row||busy)return;
  if(row.media){if(row.media.canManage)await edit(row.media);else if(row.media.canView)modal(row.media.title,`<p class="lm-inline-help">${esc(date(row.date))} · ${esc(row.startTime)}–${esc(row.endTime)}</p>${row.media.summary?`<p class="lm-session-summary">${esc(row.media.summary)}</p>`:''}<div class="lm-actions">${row.media.assets.map(asset=>`<button type="button" class="button${asset.kind==='PDF'?' secondary':''}" data-lm="${asset.kind==='PDF'?'pdf':'watch'}" data-id="${esc(row.media.id)}" data-asset="${esc(asset.id)}">${asset.kind==='PDF'?'▤':'▶'} ${esc(asset.filename||(asset.kind==='PDF'?'PDF':'Watch video'))}</button>`).join('')||'<p>No video or PDF attachments yet.</p>'}<button type="button" class="button secondary" data-lm="discussion" data-id="${esc(row.media.id)}">Discussion</button></div>`);return;}
  if(!row.canManage)return;
  const dg=modal('Attach media · '+row.title,'<p>Opening lesson media…</p>');if(dg!==null)await mutate('create',{operationId:crypto.randomUUID(),startDate:week,endDate:dayOffset(week,6),runId,sessionKey:row.sessionKey,sessionVersion:row.sessionVersion});
 }
 function close(force=false){
  if(!force&&busy){modalMessage('Please wait for this change to finish.');return false;}
  if(!force&&dirty&&!window.confirm('Discard your unfinished entry?'))return false;
  dialogGeneration++;editor=null;discussion=null;retry=null;busy=false;dirty=false;
  if(dialog){dialog.close();dialog.remove();dialog=null;}if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl='';}return true;
 }
 function modal(title,body){
  if(!close())return null;
  dialog=document.createElement('dialog');dialog.className='lm-dialog';dialog.setAttribute('aria-labelledby','lm-dialog-title');
  dialog.innerHTML=`<div class="lm-modal-head"><h2 id="lm-dialog-title">${esc(title)}</h2><button type="button" class="button secondary small" data-lm="close">Close</button></div><p data-lm-dialog-message class="lm-message" role="status" aria-live="polite"></p><div data-lm-dialog-body>${body}</div>`;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',handleClick);dialog.addEventListener('submit',handleSubmit);dialog.addEventListener('input',()=>{dirty=true;});document.body.appendChild(dialog);dialog.showModal();return dialogGeneration;
 }
 async function watch(row,asset){
  const dg=modal(row.title,'<p>Checking your access…</p>');if(dg===null)return;
  try{const result=await api('watch',{lessonId:row.id,assetId:asset});if(dg!==dialogGeneration)return;if(!/^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}\?rel=0$/.test(result.embedUrl))throw Error('Recording unavailable.');dialog.querySelector('[data-lm-dialog-body]').innerHTML=`<iframe class="lm-player" src="${esc(result.embedUrl)}" title="${esc(row.title)}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;}catch(e){if(dg===dialogGeneration)modalMessage(e.message,true);}
 }
 async function pdf(row,asset){
  const dg=modal('Lesson notes','<p>Opening PDF…</p>');if(dg===null)return;
  try{const blob=await api('download',{lessonId:row.id,assetId:asset},{blob:true});if(dg!==dialogGeneration)return;objectUrl=URL.createObjectURL(blob);dialog.querySelector('[data-lm-dialog-body]').innerHTML=`<a class="button secondary small" href="${esc(objectUrl)}" download="${esc(row.assets.find(a=>a.id===asset)?.filename||'lesson-notes.pdf')}">Download PDF</a><iframe class="lm-pdf" src="${esc(objectUrl)}" title="Lesson notes PDF"></iframe>`;}catch(e){if(dg===dialogGeneration)modalMessage(e.message,true);}
 }
 async function edit(row){
  const dg=modal('Manage · '+row.title,'<p>Opening lesson…</p>');if(dg===null)return;
  try{const result=await api('get',{lessonId:row.id});if(dg!==dialogGeneration)return;editor=result;renderEditor();}catch(e){if(dg===dialogGeneration)modalMessage(e.message,true);}
 }
 function renderEditor(){
  const {lesson:row,assets}=editor;
  dialog.querySelector('[data-lm-dialog-body]').innerHTML=`<p class="lm-inline-help">${esc(date(row.date))} · ${esc(row.startTime)}–${esc(row.endTime)} · ${esc(row.className)} · ${esc(row.teacher)}</p><div class="lm-actions">${row.state==='PUBLISHED'?assets.map(asset=>`<button type="button" class="button secondary small" data-lm="${asset.kind==='PDF'?'pdf':'watch'}" data-id="${esc(row.id)}" data-asset="${esc(asset.id)}">${asset.kind==='PDF'?'▤':'▶'} ${esc(asset.filename||(asset.kind==='PDF'?'PDF':'Watch video'))}</button>`).join(''):''}<button type="button" class="button secondary small" data-lm="discussion" data-id="${esc(row.id)}">Discussion</button></div><form class="lm-form" data-lm-form="lesson"><label>Lesson title<input name="title" maxlength="180" required value="${esc(row.title)}"></label><label>Summary <span class="lm-inline-help">Optional · written by teaching staff</span><textarea name="summary" maxlength="4000">${esc(row.summary)}</textarea></label><label>YouTube videos <span class="lm-inline-help">One link per line · up to 10 videos</span><textarea name="recordingUrls" maxlength="20500" placeholder="https://youtu.be/…">${esc(assets.filter(a=>a.kind==='YOUTUBE').map(a=>a.url).join('\n'))}</textarea></label><label>Visibility<select name="state">${['DRAFT','PUBLISHED','HIDDEN'].map(s=>`<option${s===row.state?' selected':''}>${s}</option>`).join('')}</select></label><label class="lm-check"><input name="commentsClosed" type="checkbox"${row.commentsClosed?' checked':''}>Close student discussion</label><div class="lm-actions"><button class="button" type="submit">Save lesson</button></div></form><section class="lm-editor-section"><h3>PDF attachments</h3><ul class="lm-files">${assets.filter(a=>a.kind==='PDF').map(a=>`<li><span>${esc(a.filename)}</span><button type="button" class="button secondary small" data-lm="remove" data-asset="${esc(a.id)}">Remove</button></li>`).join('')}</ul><form class="lm-form" data-lm-form="upload"><label>Add a PDF <span class="lm-inline-help">Up to 16 MB · save lesson changes first</span><input type="file" name="file" accept="application/pdf,.pdf" required></label><button class="button secondary" type="submit">Upload PDF</button></form></section>`;
 }
 async function openDiscussion(row){const dg=modal('Discussion · '+row.title,'<p>Loading discussion…</p>');if(dg===null)return;discussion={row};await loadComments(dg);}
 async function loadComments(dg=dialogGeneration){
  try{const result=await api('comments',{lessonId:discussion.row.id});if(dg!==dialogGeneration)return;discussion={...discussion,...result};renderComments();}catch(e){if(dg===dialogGeneration)modalMessage(e.message,true);}
 }
 function renderComments(){
  const d=discussion,comments=[...d.comments].sort((a,b)=>Number(b.pinned)-Number(a.pinned)||a.createdAt.localeCompare(b.createdAt));
  dialog.querySelector('[data-lm-dialog-body]').innerHTML=`<button type="button" class="button secondary small" data-lm="comments-refresh">↻ Refresh discussion</button><div>${comments.map(c=>`<article class="lm-comment${c.parentId?' lm-comment-reply':''}"><header><strong>${esc(c.name)}</strong>${c.staff?'<span class="lm-badge">Staff</span>':''}${c.pinned?'<span class="lm-badge">Pinned</span>':''}${c.state!=='APPROVED'?`<span class="lm-badge pending">${esc(c.state==='PENDING'?'Awaiting approval':c.state==='HIDDEN'?'Hidden':'Removed')}</span>`:''}<time>${esc(new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Africa/Johannesburg'}).format(new Date(c.createdAt)))}</time></header>${c.parentId?'<small>Reply in this lesson</small>':''}<p>${esc(c.body)}</p><div class="lm-comment-tools">${c.state==='APPROVED'&&!c.parentId&&(!d.commentsClosed||d.canManage)?`<button type="button" class="button secondary small" data-lm="reply" data-comment="${esc(c.id)}">Reply</button>`:''}${c.own?`<button type="button" class="button secondary small" data-lm="comment-edit" data-comment="${esc(c.id)}">Edit</button><button type="button" class="button secondary small" data-lm="moderate" data-comment="${esc(c.id)}" data-decision="DELETE">Delete</button>`:''}${d.canManage?`${c.state!=='APPROVED'?`<button type="button" class="button secondary small" data-lm="moderate" data-comment="${esc(c.id)}" data-decision="APPROVE">Approve</button>`:''}<button type="button" class="button secondary small" data-lm="moderate" data-comment="${esc(c.id)}" data-decision="HIDE">Hide</button>${c.state==='APPROVED'?`<button type="button" class="button secondary small" data-lm="moderate" data-comment="${esc(c.id)}" data-decision="${c.pinned?'UNPIN':'PIN'}">${c.pinned?'Unpin':'Pin'}</button>`:''}${!c.own?`<button type="button" class="button secondary small" data-lm="moderate" data-comment="${esc(c.id)}" data-decision="DELETE">Remove</button>`:''}`:''}</div></article>`).join('')||'<p>No comments yet.</p>'}</div>${!d.commentsClosed||d.canManage?`<form class="lm-form lm-discussion-form" data-lm-form="comment"><label data-lm-comment-label>Add a comment</label><textarea name="body" aria-label="Your comment" maxlength="2000" required></textarea><p class="lm-inline-help">${d.canManage?'Your staff reply will appear immediately.':'Your comment is visible to you and teaching staff until approved.'}</p><div class="lm-actions"><button class="button" type="submit">Post comment</button><button class="button secondary" type="button" data-lm="comment-cancel" hidden>Cancel edit</button></div></form>`:'<p>Discussion is closed for this lesson.</p>'}`;
 }
 async function mutate(action,input,options={}){
  if(busy)return;const dg=dialogGeneration,g=generation;busy=true;retry=()=>mutate(action,input,options);dialog?.setAttribute('aria-busy','true');modalMessage('Saving…');
  try{const result=await api(action,input,options);if(!active(g)||dg!==dialogGeneration)return;if(action==='create'){dirty=false;busy=false;retry=null;await load();if(active(g)&&dg===dialogGeneration)await edit({id:result.lessonId,title:'Session media'});return;}dirty=false;retry=null;modalMessage('Saved.');if(discussion)await loadComments(dg);if(editor){editor=await api('get',{lessonId:editor.lesson.id});if(dg!==dialogGeneration)return;renderEditor();}await load();}
  catch(e){if(active(g)&&dg===dialogGeneration){modalMessage(e.message,true);const m=dialog.querySelector('[data-lm-dialog-message]');if(!m.querySelector('[data-lm=retry]'))m.insertAdjacentHTML('beforeend',' <button type="button" class="button secondary small" data-lm="retry">Retry this change</button>');}}
  finally{if(active(g)&&dg===dialogGeneration){busy=false;dialog?.removeAttribute('aria-busy');}}
 }
 async function handleSubmit(event){
  const form=event.target.closest('[data-lm-form]');if(!form)return;event.preventDefault();if(busy)return;const values=new FormData(form),kind=form.dataset.lmForm;
  if(kind==='lesson'){await mutate('save',{operationId:crypto.randomUUID(),lessonId:editor.lesson.id,revision:editor.lesson.revision,title:values.get('title'),summary:values.get('summary'),recordingUrls:String(values.get('recordingUrls')||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean),state:values.get('state'),commentsClosed:values.get('commentsClosed')==='on'});}
  if(kind==='comment'){const editing=discussion.editing;await mutate('comment-save',{operationId:crypto.randomUUID(),lessonId:discussion.row.id,body:values.get('body'),...(editing?{commentId:editing.id,revision:editing.revision}:discussion.parentId?{parentId:discussion.parentId}:{})});if(discussion){delete discussion.editing;delete discussion.parentId;}}
  if(kind==='upload'){
   if(dirty&&dialog.querySelector('[data-lm-form=lesson]').dataset.changed==='true'){modalMessage('Save your lesson changes before uploading a PDF.',true);return;}
   const file=values.get('file'),g=generation,dg=dialogGeneration;if(!file?.size||file.size>16*1024*1024){modalMessage('Choose a PDF up to 16 MB.',true);return;}
   try{const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());if(!active(g)||dg!==dialogGeneration)return;await mutate('upload',{operationId:crypto.randomUUID(),lessonId:editor.lesson.id,revision:editor.lesson.revision,filename:file.name,size:file.size,sha256:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')},{upload:file});}catch(e){if(active(g)&&dg===dialogGeneration)modalMessage(e.message,true);}
  }
 }
 function handleClick(event){
  const b=event.target.closest('[data-lm]');if(!b)return;const action=b.dataset.lm,row=data?.lessons.find(r=>r.id===b.dataset.id);
  if(action==='close'){close();return;}if(busy)return;
  if(action==='week-previous')moveWeek(-7);if(action==='week-next')moveWeek(7);if(action==='week-today')moveWeek(0);
  if(action==='calendar-session')void selectSession(data?.sessions.find(row=>row.sessionKey===b.dataset.key));
  if(action==='refresh')void load();
  if(action==='watch'&&row)void watch(row,b.dataset.asset);if(action==='pdf'&&row)void pdf(row,b.dataset.asset);if(action==='discussion'&&row)void openDiscussion(row);
  if(action==='remove'&&editor&&window.confirm('Remove this PDF from the lesson?'))void mutate('attachment-remove',{operationId:crypto.randomUUID(),lessonId:editor.lesson.id,revision:editor.lesson.revision,assetId:b.dataset.asset});
  if(action==='comments-refresh'&&(!dirty||window.confirm('Discard your unfinished comment and refresh?'))){dirty=false;void loadComments();}
  if(action==='comment-cancel'){delete discussion.editing;delete discussion.parentId;dirty=false;renderComments();}
  if(['reply','comment-edit'].includes(action)){const c=discussion.comments.find(c=>c.id===b.dataset.comment),form=dialog.querySelector('[data-lm-form=comment]');if(!c||!form)return;delete discussion.editing;delete discussion.parentId;if(action==='reply')discussion.parentId=c.id;else discussion.editing=c;form.querySelector('textarea').value=action==='reply'?'':c.body;form.querySelector('[data-lm-comment-label]').textContent=action==='reply'?'Reply to '+c.name:'Edit your comment';form.querySelector('[data-lm=comment-cancel]').hidden=false;form.querySelector('textarea').focus();}
  if(action==='moderate'){const c=discussion.comments.find(c=>c.id===b.dataset.comment);if(!c)return;if(b.dataset.decision==='DELETE'&&!window.confirm('Remove this comment?'))return;void mutate('comment-moderate',{operationId:crypto.randomUUID(),lessonId:discussion.row.id,commentId:c.id,revision:c.revision,decision:b.dataset.decision});}
  if(action==='retry'&&retry)void retry();
 }
 function reset(){generation++;calendarRequest++;calendarLoading=false;calendarError='';classFilter='';touch=null;close(true);if(host){host.removeEventListener('click',handleClick);host.removeEventListener('change',calendarChange);host.removeEventListener('touchstart',swipeStart);host.removeEventListener('touchend',swipeEnd);host.replaceChildren();host.classList.remove('lm-calendar');host.hidden=true;}host=null;session='';data=null;}
 window.M4L_LESSON_MEDIA={canLeave:()=>close(),reset,open({hostId,activityKey:key,programId,runId:offering='',learnerView:asLearner=false}){
  key=key||(programId?'PROGRAM:'+programId:'');
  if(!/^(PROGRAM|COURSE):[^:]+$/.test(key)||!token()){reset();return;}
  const target=document.getElementById(hostId);if(!target)return;
  if(host===target&&session===token()&&learnerView===asLearner&&activityKey===key&&runId===offering){host.hidden=false;return;}
  reset();activityKey=key;runId=offering;learnerView=asLearner;host=target;session=token();host.hidden=false;host.classList.add('lm-calendar');host.addEventListener('click',handleClick);host.addEventListener('change',calendarChange);host.addEventListener('touchstart',swipeStart,{passive:true});host.addEventListener('touchend',swipeEnd,{passive:true});week=sunday(today());void load(true);
 }};
 document.addEventListener('input',e=>{if(e.target.closest('[data-lm-form=lesson]'))e.target.closest('form').dataset.changed='true';});
 window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
 window.addEventListener('m4l-academy-session',reset);window.addEventListener('m4l-academy-session-ended',reset);window.addEventListener('storage',e=>{if(e.key==='m4l_account_token')reset();});window.addEventListener('pagehide',reset);
})();
