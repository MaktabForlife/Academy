(() => {
 'use strict';
 const separated=()=>window.M4L_CONFIG?.MEDIA_SEPARATION===true;
 const token=()=>localStorage.getItem('m4l_account_token')||'';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let noteContext=null,host=null,session='',generation=0,dialogGeneration=0,data=null,dialog=null,editor=null,discussion=null,retry=null,busy=false,dirty=false,objectUrl='',learnerView=false,activityKey='',runId='',week='',calendarRequest=0,calendarLoading=false,calendarError='',classFilter='',touch=null;
 const assetName=asset=>asset.name||asset.filename||(asset.kind==='PDF'?'PDF':'Video');
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
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:data?.timezone||window.M4L_ACADEMY_SHELL_DATA?.timezone||'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const sunday=value=>dayOffset(value,-new Date(value+'T12:00:00Z').getUTCDay());
 const validDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 const cardDate=value=>{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'2-digit',timeZone:'UTC'}).formatToParts(new Date(value+'T12:00:00Z')).map(part=>[part.type,part.value]));
  return `${parts.weekday} ${parts.day} ${parts.month.slice(0,3)} ${parts.year}`;
 };
 function mediaIcon(kind){
  const paths={YOUTUBE:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4z"/>',PDF:'<path d="M6 2h8l5 5v15H6zM14 2v6h5M9 13h7M9 17h7"/>',CHAT:'<path d="M21 11a8 8 0 0 1-8 8H8l-5 3v-7a8 8 0 0 1-1-4 9 9 0 0 1 19 0Z"/><path d="M7 10h9M7 14h6"/>'};
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[kind]}</svg>`;
 }
 function chatButton(row){
  const available=!separated()&&row.media;
  return `<button type="button" class="lm-card-chat${available?'':' is-coming-soon'}" ${available?`data-lm="discussion" data-id="${esc(row.media.id)}"`:'data-lm="chat-soon"'} aria-label="${available?'Open lesson discussion':'Chat coming soon'}" title="${available?'Open lesson discussion':'Chat coming soon'}">${mediaIcon('CHAT')}</button>`;
 }
 function mediaCard(row){
  const course=data.kind==='COURSE',title=course?data.activityName||row.title:row.title,canOpen=row.media||row.canManage||row.canContribute;
  const titleHtml=canOpen?`<button type="button" class="lm-card-title" data-lm="calendar-session" data-key="${esc(row.sessionKey)}">${esc(title)}</button>`:`<span class="lm-card-title">${esc(title)}</span>`;
  const assets=(row.media?.assets||[]).filter(asset=>['YOUTUBE','PDF'].includes(asset.kind)).sort((a,b)=>(a.kind==='YOUTUBE'?0:1)-(b.kind==='YOUTUBE'?0:1));
  const details=[row.startTime&&row.endTime?`${row.startTime}–${row.endTime}`:'',...(row.classNames||[])].filter(Boolean).join(' · ');
  return `<article class="lm-session lm-media-card${row.media?' has-media':''}" data-session-key="${esc(row.sessionKey)}" aria-label="${esc(cardDate(row.date)+' · '+title)}"><header class="lm-card-heading"><time class="lm-card-date" datetime="${esc(row.date)}">${esc(cardDate(row.date))}</time><div class="lm-card-name"><h3 title="${esc(title)}">${titleHtml}</h3>${course?chatButton(row):''}</div>${course?`<p class="lm-card-session" title="${esc(row.title)}">${row.title!==title?esc(row.title):''}</p>`:`<div class="lm-card-teacher"><span title="${esc(row.teacherName||row.media?.teacher||'')}">${esc(row.teacherName||row.media?.teacher||'Teacher not listed')}</span>${chatButton(row)}</div>`}<p class="lm-card-meta" title="${esc(details)}">${esc(details)}</p></header><div class="lm-card-files" aria-label="Lesson videos and PDFs">${assets.map(asset=>`<button type="button" class="lm-card-file" data-lm="${asset.kind==='PDF'?'pdf':'watch'}" data-id="${esc(row.media.id)}" data-asset="${esc(asset.id)}" aria-label="${esc((asset.kind==='PDF'?'Open PDF: ':'Open video: ')+assetName(asset))}" title="${esc(assetName(asset))}">${mediaIcon(asset.kind)}<span>${esc(assetName(asset))}</span></button>`).join('')||'<p class="lm-card-empty">No videos or PDFs attached yet.</p>'}</div><footer class="lm-card-footer">${row.media&&row.media.state!=='PUBLISHED'?`<span class="lm-state">${esc(row.media.state)}</span>`:''}${canOpen?`<button type="button" class="button secondary" data-lm="calendar-session" data-key="${esc(row.sessionKey)}">${row.media?.canManage||row.canManage?'Manage media':row.canContribute?'My PDF notes':'Lesson details'}</button>`:''}</footer></article>`;
 }
 function courseFilesSection(){
  const files=data?.courseFiles;if(!files)return '';
  const row=files.media;
  return `<section class="lm-course-files" aria-labelledby="lm-course-files-title"><div class="lm-heading"><div><h3 id="lm-course-files-title">Course PDFs</h3><p>Resources for the whole Course, available across all sessions.</p></div>${files.canManage?`<button type="button" class="button secondary" data-lm="course-files">Manage Course PDFs</button>`:''}</div>${row&&row.state!=='PUBLISHED'?'<p class="lm-inline-help">Draft · visible to Course administrators only. Publish these PDFs when ready.</p>':''}<div class="lm-actions">${row?.assets.filter(a=>a.kind==='PDF').map(asset=>`<button type="button" class="button secondary" data-lm="pdf" data-id="${esc(row.id)}" data-asset="${esc(asset.id)}">▤ ${esc(assetName(asset))}</button>`).join('')||'<p>No Course PDFs available yet.</p>'}</div></section>`;
 }
 function render(){
  if(!host)return;
  const focus=host.contains(document.activeElement)?document.activeElement?.dataset.lm:null;
  const rows=!calendarLoading&&!calendarError?data?.sessions||[]:[],classes=[...new Set(rows.flatMap(row=>row.classNames||[]))].sort((a,b)=>a.localeCompare(b));
  const visible=rows.filter(row=>!classFilter||row.classNames?.includes(classFilter));
  const railId=host.id+'-rail';
  host.innerHTML=`<div class="lm-heading"><div><h2>Lesson media</h2><p>${esc(data?.activityName||'')}</p></div><button type="button" class="button secondary" data-lm="refresh">Refresh</button></div>${courseFilesSection()}<div class="lm-week-nav" data-lm-week-nav><div class="lm-week-controls"><button type="button" class="button secondary" data-lm="week-previous" aria-label="Previous week">←</button><strong data-lm-week-label>${esc(date(week))} – ${esc(date(dayOffset(week,6)))}</strong><button type="button" class="button secondary" data-lm="week-next" aria-label="Next week">→</button><button type="button" class="button secondary" data-lm="week-today">This week</button></div><div class="lm-calendar-filters"><label>Go to date<input type="date" data-lm-date value="${esc(week)}" aria-label="Lesson media date"></label>${data?.runs?.length?`<label>Course offering<select data-lm-run>${data.runs.map(run=>`<option value="${esc(run.id)}"${run.id===runId?' selected':''}>${esc(run.name)}</option>`).join('')}</select></label>`:''}${classes.length>1||classFilter?`<label>Class<select data-lm-class><option value="">All classes</option>${[...new Set([...classes,...(classFilter?[classFilter]:[])])].map(name=>`<option${name===classFilter?' selected':''}>${esc(name)}</option>`).join('')}</select></label>`:''}</div></div><div class="lm-rail-heading"><p class="lm-calendar-help">Swipe or use the arrows to browse lesson media. Choose a video or PDF to open it.</p><div class="lm-rail-controls" role="group" aria-label="Browse media cards"><button type="button" class="button secondary" data-lm="rail-previous" aria-label="Previous media cards" aria-controls="${railId}"${visible.length?'':' disabled'}>←</button><button type="button" class="button secondary" data-lm="rail-next" aria-label="Next media cards" aria-controls="${railId}"${visible.length?'':' disabled'}>→</button></div></div><p class="lm-message" data-lm-message role="${calendarError?'alert':'status'}" aria-live="polite">${calendarLoading?'Loading lesson media…':esc(calendarError)||(!visible.length?(data?.canManage?'No lessons this week. Choose another week, or publish the timetable / save Course sessions first.':'No published lesson media this week. Choose another week.'):'')}</p>${calendarError?'<button type="button" class="button secondary" data-lm="refresh">Try again</button>':''}<div id="${railId}" class="lm-media-rail" tabindex="0" role="region" aria-label="${data?.kind==='COURSE'?'Course':'Program'} lesson media cards" aria-busy="${calendarLoading}">${visible.map(mediaCard).join('')}</div>`;
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
 function swipeStart(event){const point=event.touches?.[0],nav=event.target.closest('[data-lm-week-nav]');if(!point||!nav||event.target.closest('input,select'))return;touch={x:point.clientX,y:point.clientY};}
 function swipeEnd(event){const point=event.changedTouches?.[0],start=touch;touch=null;if(!point||!start)return;const dx=point.clientX-start.x,dy=point.clientY-start.y;if(Math.abs(dx)>=70&&Math.abs(dy)<=Math.abs(dx)/2)moveWeek(dx<0?7:-7);}

 async function selectSession(row){
  if(!row||busy)return;
  if(row.media){if(row.media.canManage)await edit(row.media);else if(row.media.canView)modal(row.media.title,`<p class="lm-inline-help">${esc(date(row.date))} · ${esc(row.startTime)}–${esc(row.endTime)}</p>${row.media.summary?`<p class="lm-session-summary">${esc(row.media.summary)}</p>`:''}<div class="lm-actions">${row.media.assets.map(asset=>`<button type="button" class="button${asset.kind==='PDF'?' secondary':''}" data-lm="${asset.kind==='PDF'?'pdf':'watch'}" data-id="${esc(row.media.id)}" data-asset="${esc(asset.id)}">${asset.kind==='PDF'?'▤':'▶'} ${esc(assetName(asset))}</button>`).join('')||'<p>No video or PDF attachments yet.</p>'}${separated()?'':`<button type="button" class="button secondary" data-lm="discussion" data-id="${esc(row.media.id)}">Discussion</button>`}</div>${separated()?notesHTML(row):''}`);if(separated())noteContext=row;return;}
  if(!row.canManage)return;
  const dg=modal('Attach media · '+row.title,'<p>Opening lesson media…</p>');if(dg!==null)await mutate('create',{operationId:crypto.randomUUID(),startDate:week,endDate:dayOffset(week,6),runId,sessionKey:row.sessionKey,sessionVersion:row.sessionVersion});
 }
 function close(force=false){
  if(!force&&busy){modalMessage('Please wait for this change to finish.');return false;}
  if(!force&&dirty&&!window.confirm('Discard your unfinished entry?'))return false;
  if(!force&&dialog?.querySelector('.lm-pdf')?.contentWindow.PDFViewerApplication?._annotationStorageModified&&!window.confirm('This PDF has unsaved annotations. Download a copy before closing it. Continue?'))return false;
  dialogGeneration++;noteContext=null;editor=null;discussion=null;retry=null;busy=false;dirty=false;
  if(dialog){dialog.close();dialog.remove();dialog=null;}if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl='';}return true;
 }
 function modal(title,body){
  if(!close())return null;
  dialog=document.createElement('dialog');dialog.className='lm-dialog';dialog.setAttribute('aria-labelledby','lm-dialog-title');
  dialog.innerHTML=`<div class="lm-modal-head"><h2 id="lm-dialog-title">${esc(title)}</h2><button type="button" class="button secondary small" data-lm="close">Close</button></div><p data-lm-dialog-message class="lm-message" role="status" aria-live="polite"></p><div data-lm-dialog-body>${body}</div>`;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',handleClick);dialog.addEventListener('submit',handleSubmit);dialog.addEventListener('input',()=>{dirty=true;});document.body.appendChild(dialog);dialog.showModal();return dialogGeneration;
 }
 async function watch(row,asset){
  const name=assetName(row.assets?.find(a=>a.id===asset)||{name:row.title});
  const dg=modal(name,'<p>Checking your access…</p>');if(dg===null)return;
  try{const result=await api('watch',{lessonId:row.id,assetId:asset});if(dg!==dialogGeneration)return;if(!/^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}\?rel=0$/.test(result.embedUrl))throw Error('Recording unavailable.');dialog.querySelector('[data-lm-dialog-body]').innerHTML=`<iframe class="lm-player" src="${esc(result.embedUrl)}" title="${esc(name)}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;}catch(e){if(dg===dialogGeneration)modalMessage(e.message,true);}
 }
 async function pdf(row,asset){
  const name=assetName(row.assets?.find(a=>a.id===asset)||{name:row.title});
  const dg=modal(name,'<p>Opening PDF…</p>');if(dg===null)return;
  try{const blob=await api('download',{lessonId:row.id,assetId:asset},{blob:true});if(dg!==dialogGeneration)return;objectUrl=URL.createObjectURL(blob);dialog.querySelector('[data-lm-dialog-body]').innerHTML=`<a class="button secondary small" href="${esc(objectUrl)}" download="${esc(row.assets?.find(a=>a.id===asset)?.filename||'lesson-notes.pdf')}">Download PDF</a><iframe class="lm-pdf" src="/pdf-viewer/web/viewer.html?academy=1&amp;file=${encodeURIComponent(objectUrl)}" title="${esc(name)}"></iframe>`;}catch(e){if(dg===dialogGeneration)modalMessage(e.message,true);}
 }
 async function edit(row){
  const dg=modal('Manage · '+row.title,'<p>Opening lesson…</p>');if(dg===null)return;
  try{const result=await api('get',{lessonId:row.id});if(dg!==dialogGeneration)return;editor=result;renderEditor();}catch(e){if(dg===dialogGeneration)modalMessage(e.message,true);}
 }
 function videoEditorRow(asset={}){return `<fieldset class="lm-video-entry" data-lm-video><label>Video name<input name="videoName" maxlength="180" value="${esc(asset.name||asset.filename||'')}" placeholder="e.g. Introduction to the lesson"></label><label>YouTube link<input type="url" name="videoUrl" maxlength="2048" value="${esc(asset.url||'')}" placeholder="https://youtu.be/…"></label><button type="button" class="button secondary small" data-lm="video-remove">Remove video</button></fieldset>`;}
 function renderEditor(){
  const {lesson:row,assets}=editor,collection=row.mediaScope==='COURSE',videos=assets.filter(a=>a.kind==='YOUTUBE');
  dialog.querySelector('[data-lm-dialog-body]').innerHTML=`<p class="lm-inline-help">${collection?'PDFs for the whole Course, separate from individual lesson attachments.':`${esc(date(row.date))} · ${esc(row.startTime)}–${esc(row.endTime)} · ${esc(row.className)} · ${esc(row.teacher)}`}</p><div class="lm-actions">${row.state==='PUBLISHED'?assets.map(asset=>`<button type="button" class="button secondary small" data-lm="${asset.kind==='PDF'?'pdf':'watch'}" data-id="${esc(row.id)}" data-asset="${esc(asset.id)}">${asset.kind==='PDF'?'▤':'▶'} ${esc(assetName(asset))}</button>`).join(''):''}${collection||separated()?'':`<button type="button" class="button secondary small" data-lm="discussion" data-id="${esc(row.id)}">Discussion</button>`}</div><form class="lm-form" data-lm-form="lesson"><label>${collection?'Collection title':'Lesson title'}<input name="title" maxlength="180" required value="${esc(row.title)}"></label><label>Summary <span class="lm-inline-help">Optional · written by teaching staff</span><textarea name="summary" maxlength="4000">${esc(row.summary)}</textarea></label>${collection?'':`<section class="lm-video-editor"><h3>Videos</h3><p class="lm-inline-help">Give each video a name and its YouTube link. Up to 10 videos.</p><div data-lm-videos>${(videos.length?videos:[{}]).map(videoEditorRow).join('')}</div><button type="button" class="button secondary small" data-lm="video-add">Add video</button></section>`}<label>Visibility<select name="state">${['DRAFT','PUBLISHED','HIDDEN'].map(s=>`<option${s===row.state?' selected':''}>${s}</option>`).join('')}</select></label>${collection||separated()?'':`<label class="lm-check"><input name="commentsClosed" type="checkbox"${row.commentsClosed?' checked':''}>Close student discussion</label>`}<div class="lm-actions"><button class="button" type="submit">${collection?'Save Course PDFs':'Save lesson'}</button></div></form><section class="lm-editor-section"><h3>PDF attachments</h3><ul class="lm-files">${assets.filter(a=>a.kind==='PDF'&&!a.noteId).map(a=>`<li><form class="lm-form lm-asset-name-form" data-lm-form="asset-name" data-asset="${esc(a.id)}"><label>PDF name<input name="name" maxlength="180" value="${esc(assetName(a))}"></label><span class="lm-inline-help">File: ${esc(a.filename)}</span><div class="lm-actions"><button type="submit" class="button secondary small">Save name</button><button type="button" class="button secondary small" data-lm="remove" data-asset="${esc(a.id)}">Remove</button></div></form></li>`).join('')}</ul><form class="lm-form" data-lm-form="upload"><label>PDF name <span class="lm-inline-help">Optional · uses the filename when blank</span><input name="name" maxlength="180" placeholder="e.g. Course handbook"></label><label>Add a PDF <span class="lm-inline-help">Up to 16 MB · save lesson changes first</span><input type="file" name="file" accept="application/pdf,.pdf" required></label><button class="button secondary" type="submit">Upload PDF</button></form></section>${separated()?notesHTML({sessionKey:row.sessionKey,date:row.date,media:{...row,assets},canContribute:false}):''}`;if(separated())noteContext={sessionKey:row.sessionKey,date:row.date,media:{...row,assets},canContribute:false};
 }
 async function openDiscussion(row){const dg=modal('Discussion · '+row.title,'<p>Loading discussion…</p>');if(dg===null)return;discussion={row};await loadComments(dg);}
 function notesHTML(row){
  const assets=row.media?.assets||[],curate=row.media?.canCurateNotes,canPost=row.canContribute;if(!canPost&&!assets.some(a=>a.noteId))return '';
  return `<section class="lm-editor-section"><h3>${canPost?'My PDF notes':'Teacher PDF notes'}</h3>${assets.filter(a=>a.noteId).map(a=>`<div class="lm-note"><p>${esc(assetName(a))}${a.author?' · '+esc(a.author):''}</p>${canPost&&a.own?noteForm(a):''}${curate||canPost&&a.own?`<button type="button" class="button secondary small" data-lm="note-withdraw" data-note="${esc(a.noteId)}" data-revision="${a.noteRevision}">Withdraw note</button>`:''}</div>`).join('')}${canPost?noteForm():''}</section>`;
 }
 function noteForm(asset){return `<form class="lm-form" data-lm-form="note-upload" data-note="${esc(asset?.noteId||'')}" data-revision="${asset?.noteRevision||0}"><label>PDF name<input name="name" maxlength="180" value="${esc(asset?.name||'')}"></label><label>${asset?'Replace my PDF note':'Post my PDF note'}<input type="file" name="file" accept="application/pdf,.pdf" required></label><button type="submit" class="button secondary">${asset?'Replace my note':'Post my note'}</button></form>`;}
 async function noteOptions(){if(!noteContext)throw Error('Open the dated lesson first.');return api('note-options',{sessionKey:noteContext.sessionKey,date:noteContext.date,runId,...(noteContext.media?.assets?.find(a=>a.noteId)?{noteId:noteContext.media.assets.find(a=>a.noteId).noteId}:{})});}
 async function loadComments(dg=dialogGeneration){
  try{const result=await api('comments',{lessonId:discussion.row.id});if(dg!==dialogGeneration)return;discussion={...discussion,...result};renderComments();}catch(e){if(dg===dialogGeneration)modalMessage(e.message,true);}
 }
 function renderComments(){
  const d=discussion,comments=[...d.comments].sort((a,b)=>Number(b.pinned)-Number(a.pinned)||a.createdAt.localeCompare(b.createdAt));
  dialog.querySelector('[data-lm-dialog-body]').innerHTML=`<button type="button" class="button secondary small" data-lm="comments-refresh">↻ Refresh discussion</button><div>${comments.map(c=>`<article class="lm-comment${c.parentId?' lm-comment-reply':''}"><header><strong>${esc(c.name)}</strong>${c.staff?'<span class="lm-badge">Staff</span>':''}${c.pinned?'<span class="lm-badge">Pinned</span>':''}${c.state!=='APPROVED'?`<span class="lm-badge pending">${esc(c.state==='PENDING'?'Awaiting approval':c.state==='HIDDEN'?'Hidden':'Removed')}</span>`:''}<time>${esc(new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Africa/Johannesburg'}).format(new Date(c.createdAt)))}</time></header>${c.parentId?'<small>Reply in this lesson</small>':''}<p>${esc(c.body)}</p><div class="lm-comment-tools">${c.state==='APPROVED'&&!c.parentId&&(!d.commentsClosed||d.canManage)?`<button type="button" class="button secondary small" data-lm="reply" data-comment="${esc(c.id)}">Reply</button>`:''}${c.own?`<button type="button" class="button secondary small" data-lm="comment-edit" data-comment="${esc(c.id)}">Edit</button><button type="button" class="button secondary small" data-lm="moderate" data-comment="${esc(c.id)}" data-decision="DELETE">Delete</button>`:''}${d.canManage?`${c.state!=='APPROVED'?`<button type="button" class="button secondary small" data-lm="moderate" data-comment="${esc(c.id)}" data-decision="APPROVE">Approve</button>`:''}<button type="button" class="button secondary small" data-lm="moderate" data-comment="${esc(c.id)}" data-decision="HIDE">Hide</button>${c.state==='APPROVED'?`<button type="button" class="button secondary small" data-lm="moderate" data-comment="${esc(c.id)}" data-decision="${c.pinned?'UNPIN':'PIN'}">${c.pinned?'Unpin':'Pin'}</button>`:''}${!c.own?`<button type="button" class="button secondary small" data-lm="moderate" data-comment="${esc(c.id)}" data-decision="DELETE">Remove</button>`:''}`:''}</div></article>`).join('')||'<p>No comments yet.</p>'}</div>${!d.commentsClosed||d.canManage?`<form class="lm-form lm-discussion-form" data-lm-form="comment"><label data-lm-comment-label>Add a comment</label><textarea name="body" aria-label="Your comment" maxlength="2000" required></textarea><p class="lm-inline-help">${d.canManage?'Your staff reply will appear immediately.':'Your comment is visible to you and teaching staff until approved.'}</p><div class="lm-actions"><button class="button" type="submit">Post comment</button><button class="button secondary" type="button" data-lm="comment-cancel" hidden>Cancel edit</button></div></form>`:'<p>Discussion is closed for this lesson.</p>'}`;
 }
 async function mutate(action,input,options={}){
  if(busy)return;const dg=dialogGeneration,g=generation;busy=true;retry=()=>mutate(action,input,options);dialog?.setAttribute('aria-busy','true');modalMessage('Saving…');
  try{const result=await api(action,input,options);if(!active(g)||dg!==dialogGeneration)return;if(action==='create'||action==='course-files-create'){dirty=false;busy=false;retry=null;await load();if(active(g)&&dg===dialogGeneration)await edit({id:result.lessonId,title:'Session media'});return;}dirty=false;retry=null;window.dispatchEvent(new Event('m4l-lesson-media-changed'));modalMessage('Saved.');if(discussion)await loadComments(dg);if(editor){editor=await api('get',{lessonId:editor.lesson.id});if(dg!==dialogGeneration)return;renderEditor();}await load();if(action.startsWith('note-')&&!editor&&noteContext){const row=data.sessions.find(r=>r.sessionKey===noteContext.sessionKey);busy=false;dirty=false;if(row)await selectSession(row);else close(true);}}
  catch(e){if(active(g)&&dg===dialogGeneration){modalMessage(e.message,true);const m=dialog.querySelector('[data-lm-dialog-message]');if(!m.querySelector('[data-lm=retry]'))m.insertAdjacentHTML('beforeend',' <button type="button" class="button secondary small" data-lm="retry">Retry this change</button>');}}
  finally{if(active(g)&&dg===dialogGeneration){busy=false;dialog?.removeAttribute('aria-busy');}}
 }
 async function handleSubmit(event){
  const form=event.target.closest('[data-lm-form]');if(!form)return;event.preventDefault();if(busy)return;const values=new FormData(form),kind=form.dataset.lmForm;
  if(kind==='note-upload'){
   const file=values.get('file'),g=generation,dg=dialogGeneration;if(!file?.size||file.size>16*1024*1024){modalMessage('Choose a PDF up to 16 MB.',true);return;}
   try{const option=await noteOptions();if(!option.canContribute)throw Error('This note is outside your current teaching assignment.');const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());if(!active(g)||dg!==dialogGeneration)return;await mutate('note-upload',{operationId:crypto.randomUUID(),sessionKey:option.session.sessionKey,sessionVersion:option.session.sessionVersion,startDate:option.session.date,endDate:option.session.date,runId:option.session.runId,...(form.dataset.note?{noteId:form.dataset.note,revision:Number(form.dataset.revision)}:{}),filename:file.name,name:values.get('name')||'',size:file.size,sha256:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')},{upload:file});}catch(e){if(active(g)&&dg===dialogGeneration)modalMessage(e.message,true);}return;
  }
  if(kind==='lesson'){
   if(dialog.querySelector('.lm-asset-name-form[data-changed=true]')){modalMessage('Save the edited PDF name first.',true);return;}
   const videos=[...form.querySelectorAll('[data-lm-video]')].map(row=>({name:row.querySelector('[name=videoName]').value.trim(),url:row.querySelector('[name=videoUrl]').value.trim()})).filter(row=>row.name||row.url);
   await mutate('save',{operationId:crypto.randomUUID(),lessonId:editor.lesson.id,revision:editor.lesson.revision,title:values.get('title'),summary:values.get('summary'),videos,state:values.get('state'),commentsClosed:separated()||editor.lesson.mediaScope==='COURSE'||values.get('commentsClosed')==='on'});
  }
  if(kind==='asset-name'){
   if(dialog.querySelector('[data-lm-form=lesson]').dataset.changed==='true'){modalMessage('Save your lesson changes before renaming a PDF.',true);return;}
   await mutate('attachment-name',{operationId:crypto.randomUUID(),lessonId:editor.lesson.id,revision:editor.lesson.revision,assetId:form.dataset.asset,name:values.get('name')});
  }
  if(kind==='comment'){const editing=discussion.editing;await mutate('comment-save',{operationId:crypto.randomUUID(),lessonId:discussion.row.id,body:values.get('body'),...(editing?{commentId:editing.id,revision:editing.revision}:discussion.parentId?{parentId:discussion.parentId}:{})});if(discussion){delete discussion.editing;delete discussion.parentId;}}
  if(kind==='upload'){
   if(dialog.querySelector('.lm-asset-name-form[data-changed=true]')){modalMessage('Save the edited PDF name first.',true);return;}
   if(dirty&&dialog.querySelector('[data-lm-form=lesson]').dataset.changed==='true'){modalMessage('Save your lesson changes before uploading a PDF.',true);return;}
   const file=values.get('file'),g=generation,dg=dialogGeneration;if(!file?.size||file.size>16*1024*1024){modalMessage('Choose a PDF up to 16 MB.',true);return;}
   try{const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());if(!active(g)||dg!==dialogGeneration)return;await mutate('upload',{operationId:crypto.randomUUID(),lessonId:editor.lesson.id,revision:editor.lesson.revision,filename:file.name,name:values.get('name')||'',size:file.size,sha256:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')},{upload:file});}catch(e){if(active(g)&&dg===dialogGeneration)modalMessage(e.message,true);}
  }
 }
 function handleClick(event){
  const b=event.target.closest('[data-lm]');if(!b)return;const action=b.dataset.lm,row=data?.lessons?.find(r=>r.id===b.dataset.id)||data?.sessions?.map(r=>r.media).find(r=>r?.id===b.dataset.id)||(b.dataset.id&&data?.courseFiles?.media?.id===b.dataset.id?data.courseFiles.media:null);
  if(action==='close'){close();return;}if(separated()&&['discussion','comments-refresh','comment-cancel','reply','comment-edit','moderate'].includes(action))return;if(busy)return;
  if(action==='chat-soon'){modal('Chat coming soon','<p>Lesson chat is coming soon.</p>');return;}
  if(action==='rail-previous'||action==='rail-next'){const rail=host.querySelector('.lm-media-rail');rail?.scrollBy({left:(action==='rail-next'?1:-1)*rail.clientWidth,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});return;}
  if(action==='week-previous')moveWeek(-7);if(action==='week-next')moveWeek(7);if(action==='week-today')moveWeek(0);
  if(action==='calendar-session')void selectSession(data?.sessions.find(row=>row.sessionKey===b.dataset.key));
  if(action==='refresh')void(async()=>{try{await window.M4L_ACADEMY_WORKSPACE?.readyPublication(true);await load();}catch(e){calendarError=e.message;render();}})();
  if(action==='note-withdraw'&&noteContext&&window.confirm('Withdraw this PDF note? Its previous file remains in history.')){void(async()=>{try{if(noteContext.media?.canCurateNotes){await mutate('note-withdraw',{operationId:crypto.randomUUID(),noteId:b.dataset.note,revision:Number(b.dataset.revision)});return;}const option=await noteOptions();await mutate('note-withdraw',{operationId:crypto.randomUUID(),noteId:b.dataset.note,revision:Number(b.dataset.revision),sessionKey:option.session.sessionKey,sessionVersion:option.session.sessionVersion,startDate:option.session.date,endDate:option.session.date,runId:option.session.runId});}catch(e){modalMessage(e.message,true);}})();}
  if(action==='course-files'){const row=data?.courseFiles?.media;if(row)void edit(row);else if(data?.courseFiles?.canManage){const dg=modal('Course PDFs','<p>Opening Course PDFs…</p>');if(dg!==null)void mutate('course-files-create',{operationId:crypto.randomUUID()});}}
  if(action==='video-add'&&editor){const list=dialog.querySelector('[data-lm-videos]');if(list?.children.length>=10){modalMessage('Use up to ten videos per session.',true);return;}list?.insertAdjacentHTML('beforeend',videoEditorRow());dirty=true;dialog.querySelector('[data-lm-form=lesson]').dataset.changed='true';}
  if(action==='video-remove'&&editor){b.closest('[data-lm-video]')?.remove();dirty=true;dialog.querySelector('[data-lm-form=lesson]').dataset.changed='true';}
  if(action==='watch'&&row)void watch(row,b.dataset.asset);if(action==='pdf'&&row)void pdf(row,b.dataset.asset);if(action==='discussion'&&row)void openDiscussion(row);
  if(action==='remove'&&editor&&window.confirm('Remove this PDF from the lesson?'))void mutate('attachment-remove',{operationId:crypto.randomUUID(),lessonId:editor.lesson.id,revision:editor.lesson.revision,assetId:b.dataset.asset});
  if(action==='comments-refresh'&&(!dirty||window.confirm('Discard your unfinished comment and refresh?'))){dirty=false;void loadComments();}
  if(action==='comment-cancel'){delete discussion.editing;delete discussion.parentId;dirty=false;renderComments();}
  if(['reply','comment-edit'].includes(action)){const c=discussion.comments.find(c=>c.id===b.dataset.comment),form=dialog.querySelector('[data-lm-form=comment]');if(!c||!form)return;delete discussion.editing;delete discussion.parentId;if(action==='reply')discussion.parentId=c.id;else discussion.editing=c;form.querySelector('textarea').value=action==='reply'?'':c.body;form.querySelector('[data-lm-comment-label]').textContent=action==='reply'?'Reply to '+c.name:'Edit your comment';form.querySelector('[data-lm=comment-cancel]').hidden=false;form.querySelector('textarea').focus();}
  if(action==='moderate'){const c=discussion.comments.find(c=>c.id===b.dataset.comment);if(!c)return;if(b.dataset.decision==='DELETE'&&!window.confirm('Remove this comment?'))return;void mutate('comment-moderate',{operationId:crypto.randomUUID(),lessonId:discussion.row.id,commentId:c.id,revision:c.revision,decision:b.dataset.decision});}
  if(action==='retry'&&retry)void retry();
 }
 function reset(){generation++;calendarRequest++;calendarLoading=false;calendarError='';classFilter='';touch=null;close(true);if(host){host.removeEventListener('click',handleClick);host.removeEventListener('change',calendarChange);host.removeEventListener('touchstart',swipeStart);host.removeEventListener('touchend',swipeEnd);host.replaceChildren();host.classList.remove('lm-calendar','lm-rails');host.hidden=true;}host=null;session='';data=null;}
 window.M4L_LESSON_MEDIA={canLeave:()=>close(),reset,openAttachment({hostId,lesson,kind}){
  const target=document.getElementById(hostId);
  if(!target||!token()||!lesson||!['YOUTUBE','PDF'].includes(kind)||!lesson.assets?.length||!close())return;
  reset();host=target;session=token();activityKey=lesson.activityKey;learnerView=true;data={lessons:[lesson]};
  const assets=lesson.assets.filter(asset=>asset.kind===kind);
  if(assets.length===1){void (kind==='PDF'?pdf(lesson,assets[0].id):watch(lesson,assets[0].id));return;}
  modal(lesson.title,`<div class="lm-actions">${assets.map((asset,index)=>`<button type="button" class="button secondary" data-lm="${kind==='PDF'?'pdf':'watch'}" data-id="${esc(lesson.id)}" data-asset="${esc(asset.id)}">${kind==='PDF'?'▤':'▶'} ${esc(assetName(asset))}</button>`).join('')}</div>`);
 },open({hostId,activityKey:key,programId,runId:offering='',learnerView:asLearner=false}){
  key=key||(programId?'PROGRAM:'+programId:'');
  if(!/^(PROGRAM|COURSE):[^:]+$/.test(key)||!token()){reset();return;}
  const target=document.getElementById(hostId);if(!target)return;
  if(host===target&&session===token()&&learnerView===asLearner&&activityKey===key&&runId===offering){host.hidden=false;return;}
  reset();activityKey=key;runId=offering;learnerView=asLearner;host=target;session=token();host.hidden=false;host.classList.add('lm-calendar','lm-rails');host.addEventListener('click',handleClick);host.addEventListener('change',calendarChange);host.addEventListener('touchstart',swipeStart,{passive:true});host.addEventListener('touchend',swipeEnd,{passive:true});week=sunday(today());void load(true);
 }};
 document.addEventListener('input',e=>{const form=e.target.closest('[data-lm-form=lesson],.lm-asset-name-form');if(form)form.dataset.changed='true';});
 window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
 window.addEventListener('m4l-academy-session',reset);window.addEventListener('m4l-academy-session-ended',reset);window.addEventListener('storage',e=>{if(e.key==='m4l_account_token')reset();});window.addEventListener('pagehide',reset);
})();
