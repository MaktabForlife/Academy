(() => {
 'use strict';
 const token=()=>localStorage.getItem('m4l_account_token')||'';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let host=null,session='',generation=0,dialogGeneration=0,data=null,pending=null,dialog=null,editor=null,discussion=null,retry=null,busy=false,dirty=false,objectUrl='',learnerView=false,activityKey='',runId='',adding=null,sessionRequest=0;
 const date=v=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(v+'T12:00:00Z'));
 function active(g=generation){return g===generation&&session===token()&&Boolean(host);}
 function message(text,error=false){const el=host?.querySelector('[data-lm-message]');if(el){el.textContent=text;el.setAttribute('role',error?'alert':'status');}}
 function modalMessage(text,error=false){const el=dialog?.querySelector('[data-lm-dialog-message]');if(el){el.textContent=text;el.setAttribute('role',error?'alert':'status');}}
 async function api(action,input,options={}){
  input={activityKey,...input,...(action==='list'&&runId?{runId}:{})};
  if(learnerView&&action==='comments')input={...input,view:'learner'};
  const current=session,g=generation,response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/academy/lesson-media/${action}${options.upload?'?metadata='+encodeURIComponent(JSON.stringify(input)):''}`,{method:'POST',headers:{Authorization:'Bearer '+current,...(!options.upload?{'Content-Type':'application/json'}:{})},body:options.upload?options.upload:JSON.stringify(input)});
  if(!active(g)||current!==session)throw Error('The Academy account has changed.');
  if(options.blob&&response.ok)return response.blob();
  const result=await response.json();if(!response.ok||!result.success){if(response.status===401)window.dispatchEvent(new Event('m4l-academy-session-ended'));throw Error(result.error||'Lesson media is temporarily unavailable.');}return result;
 }
 function render(){
  if(!host||!data)return;
  host.innerHTML=`<div class="lm-heading"><div><h2>Lesson media</h2><p>${esc(data.activityName)}</p></div><div class="lm-controls">${data.canManage?'<button type="button" class="button" data-lm="add">Attach media to session</button>':''}<button type="button" class="button secondary small" data-lm="refresh" title="Refresh recordings" aria-label="Refresh recordings">↻</button><button type="button" class="button secondary small" data-lm="previous" aria-label="Earlier recording cards">←</button><button type="button" class="button secondary small" data-lm="next" aria-label="Later recording cards">→</button></div></div><p class="lm-message" data-lm-message role="status" aria-live="polite"></p><div class="lm-ribbon" tabindex="0" role="region" aria-label="Lesson media">${data.lessons.map(row=>`<article class="lm-card"><div class="lm-card-top"><time datetime="${esc(row.date)}">${esc(date(row.date))}</time><h3>${esc(row.title)}</h3><div class="lm-meta"><span>${esc(row.startTime)}–${esc(row.endTime)}</span><span>· ${esc(row.teacher)}</span></div>${row.state!=='PUBLISHED'?`<span class="lm-state">${esc(row.state)}</span>`:''}</div><div class="lm-card-body"><p class="lm-meta">${esc(row.className)}</p>${row.summary?`<p class="lm-summary">${esc(row.summary)}</p><button type="button" class="button secondary small" data-lm="summary" data-id="${esc(row.id)}">Read summary</button>`:''}<div class="lm-notes">${row.canView||row.canManage?row.assets.filter(a=>a.kind==='PDF').map(a=>`<button type="button" class="button secondary small" data-lm="pdf" data-id="${esc(row.id)}" data-asset="${esc(a.id)}">▤ ${esc(a.filename)}</button>`).join(''):''}</div><div class="lm-actions">${row.canView?row.assets.filter(a=>a.kind==='YOUTUBE').map(a=>`<button type="button" class="button" data-lm="watch" data-id="${esc(row.id)}" data-asset="${esc(a.id)}">▶ ${esc(a.filename||'Watch')}</button>`).join(''):''}<button type="button" class="button secondary" data-lm="discussion" data-id="${esc(row.id)}">Discussion</button>${row.canManage?`<button type="button" class="button secondary" data-lm="edit" data-id="${esc(row.id)}">Manage</button>`:''}</div></div></article>`).join('')}</div>${data.before?'<button type="button" class="button secondary small" data-lm="older">Older lessons</button>':''}`;
  if(!data.lessons.length)message('No lesson recordings are available yet.');
 }
 async function load(older=false){
  if(pending)return pending;const g=generation;
  message('Loading lesson recordings…');
  pending=(async()=>{try{const result=await api('list',{...(older?{before:data.before}:{}),...(learnerView?{view:'learner'}:{})});if(!active(g))return;data=older?{...result,lessons:[...data.lessons,...result.lessons]}:result;render();}catch(e){if(active(g)){message(e.message,true);if(!data)host.innerHTML='<p data-lm-message class="lm-message" role="alert">'+esc(e.message)+'</p><button type="button" class="button secondary" data-lm="refresh">Try again</button>';}}finally{if(active(g))pending=null;}})();return pending;
 }
 function close(force=false){
  if(!force&&busy){modalMessage('Please wait for this change to finish.');return false;}
  if(!force&&dirty&&!window.confirm('Discard your unfinished entry?'))return false;
  dialogGeneration++;editor=null;discussion=null;adding=null;sessionRequest++;retry=null;busy=false;dirty=false;
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
  dialog.querySelector('[data-lm-dialog-body]').innerHTML=`<p class="lm-inline-help">${esc(date(row.date))} · ${esc(row.startTime)}–${esc(row.endTime)} · ${esc(row.className)} · ${esc(row.teacher)}</p><form class="lm-form" data-lm-form="lesson"><label>Lesson title<input name="title" maxlength="180" required value="${esc(row.title)}"></label><label>Summary <span class="lm-inline-help">Optional · written by teaching staff</span><textarea name="summary" maxlength="4000">${esc(row.summary)}</textarea></label><label>YouTube videos <span class="lm-inline-help">One link per line · up to 10 videos</span><textarea name="recordingUrls" maxlength="20500" placeholder="https://youtu.be/…">${esc(assets.filter(a=>a.kind==='YOUTUBE').map(a=>a.url).join('\n'))}</textarea></label><label>Visibility<select name="state">${['DRAFT','PUBLISHED','HIDDEN'].map(s=>`<option${s===row.state?' selected':''}>${s}</option>`).join('')}</select></label><label class="lm-check"><input name="commentsClosed" type="checkbox"${row.commentsClosed?' checked':''}>Close student discussion</label><div class="lm-actions"><button class="button" type="submit">Save lesson</button></div></form><section class="lm-editor-section"><h3>PDF attachments</h3><ul class="lm-files">${assets.filter(a=>a.kind==='PDF').map(a=>`<li><span>${esc(a.filename)}</span><button type="button" class="button secondary small" data-lm="remove" data-asset="${esc(a.id)}">Remove</button></li>`).join('')}</ul><form class="lm-form" data-lm-form="upload"><label>Add a PDF <span class="lm-inline-help">Up to 16 MB · save lesson changes first</span><input type="file" name="file" accept="application/pdf,.pdf" required></label><button class="button secondary" type="submit">Upload PDF</button></form></section>`;
 }
 async function addMedia(){
  const dg=modal('Attach media to a session','<p>Loading sessions…</p>');if(dg===null)return;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),day=(offset)=>new Date(Date.parse(today+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
  adding={startDate:day(-7),endDate:day(7),runId,sessions:[],runs:[]};await loadSessions();
 }
 async function loadSessions(){
  const dg=dialogGeneration,request=++sessionRequest;modalMessage('Loading sessions…');dialog.querySelector('[data-lm-dialog-body]').innerHTML='<p>Loading sessions…</p>';
  try{const result=await api('sessions',{startDate:adding.startDate,endDate:adding.endDate,runId:adding.runId});if(dg!==dialogGeneration||request!==sessionRequest)return;adding={...adding,...result};modalMessage('');
   dialog.querySelector('[data-lm-dialog-body]').innerHTML=`<p>Choose the session for these videos and PDFs. New media starts as a draft; publish it when learners may view it.</p><form class="lm-form lm-session-filters" data-lm-form="sessions">${data.kind==='PROGRAM'?`<label>From<input name="startDate" type="date" value="${esc(adding.startDate)}" required></label><label>Through<input name="endDate" type="date" value="${esc(adding.endDate)}" required></label>`:`<label>Course offering<select name="runId">${adding.runs.map(r=>`<option value="${esc(r.id)}"${r.id===adding.runId?' selected':''}>${esc(r.name)}${r.stage?' · '+esc(r.stage):''}</option>`).join('')}</select></label>`}<button class="button secondary" type="submit">Show sessions</button></form>${adding.sessions.length?`<form class="lm-form" data-lm-form="create"><label>Session<select name="sessionKey" required><option value="">Choose a session…</option>${adding.sessions.map(r=>`<option value="${esc(r.sessionKey)}">${esc(date(r.date))} · ${esc(r.startTime)}–${esc(r.endTime)} · ${esc(r.title)}${r.classNames.length?' · '+esc(r.classNames.join(', ')):''}${r.teacherName?' · '+esc(r.teacherName):''}</option>`).join('')}</select></label><button class="button" type="submit">Attach media</button></form>`:`<p>${data.kind==='PROGRAM'?'No sessions in this period. Choose different dates or publish the Program timetable first.':'No saved sessions in this offering. Save the Course sessions before attaching media.'}</p>`}`;
  }catch(error){if(dg===dialogGeneration&&request===sessionRequest){modalMessage(error.message,true);dialog.querySelector('[data-lm-dialog-body]').innerHTML='<button type="button" class="button secondary" data-lm="sessions-retry">Try again</button>';}}
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
  if(kind==='sessions'){adding={...adding,startDate:values.get('startDate')||adding.startDate,endDate:values.get('endDate')||adding.endDate,runId:values.get('runId')||adding.runId};dirty=false;await loadSessions();return;}
  if(kind==='create'){const row=adding.sessions.find(r=>r.sessionKey===values.get('sessionKey'));if(!row){modalMessage('Choose a session.',true);return;}await mutate('create',{operationId:crypto.randomUUID(),startDate:adding.startDate,endDate:adding.endDate,runId:adding.runId,sessionKey:row.sessionKey,sessionVersion:row.sessionVersion});return;}
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
  if(action==='add')void addMedia();if(action==='sessions-retry')void loadSessions();
  if(action==='refresh')void load();
  if(action==='older')void load(true);
  if(['previous','next'].includes(action)){const strip=host.querySelector('.lm-ribbon');strip.scrollBy({left:strip.clientWidth*(action==='next'?1:-1),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  if(action==='watch'&&row)void watch(row,b.dataset.asset);if(action==='pdf'&&row)void pdf(row,b.dataset.asset);if(action==='edit'&&row)void edit(row);if(action==='discussion'&&row)void openDiscussion(row);if(action==='summary'&&row)modal(row.title,`<p style="white-space:pre-wrap">${esc(row.summary)}</p>`);
  if(action==='remove'&&editor&&window.confirm('Remove this PDF from the lesson?'))void mutate('attachment-remove',{operationId:crypto.randomUUID(),lessonId:editor.lesson.id,revision:editor.lesson.revision,assetId:b.dataset.asset});
  if(action==='comments-refresh'&&(!dirty||window.confirm('Discard your unfinished comment and refresh?'))){dirty=false;void loadComments();}
  if(action==='comment-cancel'){delete discussion.editing;delete discussion.parentId;dirty=false;renderComments();}
  if(['reply','comment-edit'].includes(action)){const c=discussion.comments.find(c=>c.id===b.dataset.comment),form=dialog.querySelector('[data-lm-form=comment]');if(!c||!form)return;delete discussion.editing;delete discussion.parentId;if(action==='reply')discussion.parentId=c.id;else discussion.editing=c;form.querySelector('textarea').value=action==='reply'?'':c.body;form.querySelector('[data-lm-comment-label]').textContent=action==='reply'?'Reply to '+c.name:'Edit your comment';form.querySelector('[data-lm=comment-cancel]').hidden=false;form.querySelector('textarea').focus();}
  if(action==='moderate'){const c=discussion.comments.find(c=>c.id===b.dataset.comment);if(!c)return;if(b.dataset.decision==='DELETE'&&!window.confirm('Remove this comment?'))return;void mutate('comment-moderate',{operationId:crypto.randomUUID(),lessonId:discussion.row.id,commentId:c.id,revision:c.revision,decision:b.dataset.decision});}
  if(action==='retry'&&retry)void retry();
 }
 function reset(){generation++;pending=null;close(true);if(host){host.removeEventListener('click',handleClick);host.replaceChildren();host.hidden=true;}host=null;session='';data=null;}
 window.M4L_LESSON_MEDIA={canLeave:()=>!busy&&(!dirty||window.confirm('Discard your unfinished media entry?')),reset,open({hostId,activityKey:key,programId,runId:offering='',learnerView:asLearner=false}){
  key=key||(programId?'PROGRAM:'+programId:'');
  if(!/^(PROGRAM|COURSE):[^:]+$/.test(key)||!token()){reset();return;}
  const target=document.getElementById(hostId);if(!target)return;
  if(host===target&&session===token()&&learnerView===asLearner&&activityKey===key&&runId===offering){host.hidden=false;return;}
  reset();activityKey=key;runId=offering;learnerView=asLearner;host=target;session=token();host.hidden=false;host.addEventListener('click',handleClick);host.innerHTML='<p data-lm-message class="lm-message" role="status">Loading lesson media…</p>';void load();
 }};
 document.addEventListener('input',e=>{if(e.target.closest('[data-lm-form=lesson]'))e.target.closest('form').dataset.changed='true';});
 window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
 window.addEventListener('m4l-academy-session',reset);window.addEventListener('m4l-academy-session-ended',reset);window.addEventListener('storage',e=>{if(e.key==='m4l_account_token')reset();});window.addEventListener('pagehide',reset);
})();
