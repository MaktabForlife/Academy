(() => {
 'use strict';
 let sameScreenCompanion=false,sameScreenAdmin=false,playlistSettingsOpen=false,readViewMarker=null,mediaHistoryNonce=crypto.randomUUID(),nativeReader=null,collectionModule=null,recordingView={},managementDate='',binding=null,companionEditor=null;
 void import('./m4l-recording-collections.mjs').then(module=>{collectionModule=module;render();});
 const nativeReaderReady=import('./m4l-native-playlist-view.mjs').then(({nativePlaylistReader,recordingViewMarker})=>{readViewMarker=recordingViewMarker;nativeReader=nativePlaylistReader({request:(action,input)=>api(action,{...input,view:'learner'},{playlist:true}),isCurrent:()=>active(),onChange:()=>render()});});
 const currentMediaRows=()=>[...new Map([...(data?.lessons||[]),...(nativeReader?.state().selected?.recordings||[])].map(row=>[row.id,row])).values()];
 const canLeaveEditor=()=>window.M4L_ACADEMY_PLAYLISTS?.canLeaveRecording?.()!==false&&close();
 const canLeaveMedia=()=>playlistSettingsOpen?(window.M4L_ACADEMY_PLAYLISTS?.canLeave?.()??canLeaveEditor()):canLeaveEditor();
 function rememberRecordingView(playlistId=nativeReader?.state().selected?.playlist.id||null,replace=false){if(!active())return;const value={...(window.history?.state||{}),m4lRecordingView:{nonce:mediaHistoryNonce,activityKey,view:{...recordingView},playlistId}};window.history?.[replace?'replaceState':'pushState'](value,'');}
 async function restoreRecordingView(){
  const saved=readViewMarker?.(window.history?.state?.m4lRecordingView,{nonce:mediaHistoryNonce,activityKey});if(!saved||!active()||!canLeaveMedia())return;if(playlistSettingsOpen){window.M4L_ACADEMY_PLAYLISTS?.unmount?.();playlistSettingsOpen=false;}recordingView=saved.view;
  if(saved.playlistId&&nativeReader?.state().selected?.playlist.id!==saved.playlistId)await nativeReader.open({activityKey,playlistId:saved.playlistId,limit:30});else if(!saved.playlistId)nativeReader?.back();
  if(!active())return;render();if(recordingView.lesson){const [id,assetId]=JSON.parse(recordingView.lesson);await recordingPage(currentMediaRows().find(row=>row.id===id),{assetId});}
 }
 window.addEventListener('popstate',()=>{void restoreRecordingView();});
 const separated=()=>window.M4L_CONFIG?.MEDIA_SEPARATION===true;
 const token=()=>localStorage.getItem('m4l_account_token')||'';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let noteContext=null,host=null,session='',generation=0,dialogGeneration=0,data=null,dialog=null,editor=null,discussion=null,retry=null,busy=false,dirty=false,objectUrl='',learnerView=false,activityKey='',runId='',context='',cacheScope=null,calendarRequest=0,calendarLoading=false,calendarError='',expiryTimer=null;
 const isVideo=asset=>['YOUTUBE','MP4'].includes(asset.kind);
 const videoExpired=asset=>asset.kind==='MP4'&&(asset.expired||Date.parse(asset.expiresAt)<=Date.now());
 const assetName=asset=>asset.name||asset.filename||(asset.kind==='PDF'?'PDF':'Video');
 const date=v=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(v+'T12:00:00Z'));
 const workspace=()=>JSON.stringify([window.M4L_ACADEMY_WORKSPACE?.current()||'LEGACY',window.M4L_ACADEMY_WORKSPACE?.classView()||null]);
 const cache=()=>window.M4L_LESSON_MEDIA_CACHE;
 const head=()=>window.M4L_ACADEMY_WORKSPACE?.head()?.id||window.M4L_ACADEMY_WORKSPACE?.head()||null;
 function active(g=generation){return g===generation&&session===token()&&context===workspace()&&Boolean(host);}
 function modalMessage(text,error=false){const el=dialog?.querySelector('[data-lm-dialog-message]');if(el){el.textContent=text;el.setAttribute('role',error?'alert':'status');el.classList.toggle('lm-save-confirmation',Boolean(editor&&text==='Saved.'));}}
 async function api(action,input,options={}){
  input={activityKey,...input};
  const editingRequest=options.admin===true||sameScreenAdmin&&!options.playlist&&action!=='feed';
  if(learnerView&&!editingRequest)input={...input,view:'learner'};
  const current=session,g=generation,response=await (editingRequest&&window.M4L_ACADEMY_WORKSPACE?.adminFetch?((url,opts)=>window.M4L_ACADEMY_WORKSPACE.adminFetch(url,opts,{activityKey})):fetch)(`${window.M4L_CONFIG?.API_BASE||''}/api/academy/${options.playlist?'media-playlists':'lesson-media'}/${action}${options.upload?'?metadata='+encodeURIComponent(JSON.stringify(input)):''}`,{method:'POST',headers:{Authorization:'Bearer '+current,...(!options.upload?{'Content-Type':'application/json'}:{})},body:options.upload?options.upload:JSON.stringify(input)});
  if(!active(g)||current!==session)throw Error('The Academy account has changed.');
  if(options.blob&&response.ok)return response.blob();
  const result=await response.json();if(!response.ok||!result.success){if(response.status===401)window.dispatchEvent(new Event('m4l-academy-session-ended'));throw Object.assign(Error(result.error||'Lesson media is temporarily unavailable.'),{status:response.status,code:result.code});}return result;
 }
 const cardDate=value=>{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'2-digit',timeZone:'UTC'}).formatToParts(new Date(value+'T12:00:00Z')).map(part=>[part.type,part.value]));
  return `${parts.weekday} ${parts.day} ${parts.month.slice(0,3)} ${parts.year}`;
 };
 function mediaIcon(kind){
  const paths={YOUTUBE:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4z"/>',PDF:'<path d="M6 2h8l5 5v15H6zM14 2v6h5M9 13h7M9 17h7"/>',CHAT:'<path d="M21 11a8 8 0 0 1-8 8H8l-5 3v-7a8 8 0 0 1-1-4 9 9 0 0 1 19 0Z"/><path d="M7 10h9M7 14h6"/>'};
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[kind==='MP4'?'YOUTUBE':kind]}</svg>`;
 }
 function chatButton(row){
  const available=!separated()&&row.media;
  return `<button type="button" class="lm-card-chat${available?'':' is-coming-soon'}" ${available?`data-lm="discussion" data-id="${esc(row.media.id)}"`:'data-lm="chat-soon"'} aria-label="${available?'Open lesson discussion':'Chat coming soon'}" title="${available?'Open lesson discussion':'Chat coming soon'}">${mediaIcon('CHAT')}</button>`;
 }
 function mediaCard(row){
  const course=data.kind==='COURSE',title=course?data.activityName||row.title:row.title,canOpen=row.media||row.canManage||row.canContribute;
  const titleHtml=canOpen&&!row.canManage&&!row.media?.canManage?`<button type="button" class="lm-card-title" data-lm="calendar-session" data-key="${esc(row.sessionKey)}">${esc(title)}</button>`:`<span class="lm-card-title">${esc(title)}</span>`;
  const assets=(row.media?.assets||[]).filter(asset=>['YOUTUBE','MP4','PDF'].includes(asset.kind)).sort((a,b)=>(isVideo(a)?0:1)-(isVideo(b)?0:1));
  const details=[row.startTime&&row.endTime?`${row.startTime}–${row.endTime}`:'',...(row.classNames||[])].filter(Boolean).join(' · ');
  return `<article class="lm-session lm-media-card${row.media?' has-media':''}" data-session-key="${esc(row.sessionKey)}" aria-label="${esc(cardDate(row.date)+' · '+title)}"><header class="lm-card-heading"><time class="lm-card-date" datetime="${esc(row.date)}">${esc(cardDate(row.date))}</time><div class="lm-card-name"><h3 title="${esc(title)}">${titleHtml}</h3>${course?chatButton(row):''}</div>${course?`<p class="lm-card-session" title="${esc(row.title)}">${row.title!==title?esc(row.title):''}</p>`:`<div class="lm-card-teacher"><span title="${esc(row.teacherName||row.media?.teacher||'')}">${esc(row.teacherName||row.media?.teacher||'Teacher not listed')}</span>${chatButton(row)}</div>`}<p class="lm-card-meta" title="${esc(details)}">${esc(details)}</p></header><div class="lm-card-files" aria-label="Lesson videos and PDFs">${assets.map(asset=>`<button type="button" class="lm-card-file" data-lm="${asset.kind==='PDF'?'pdf':'watch'}"${videoExpired(asset)?' disabled':''} data-id="${esc(row.media.id)}" data-key="${esc(row.sessionKey)}" data-asset="${esc(asset.id)}" aria-label="${esc((asset.kind==='PDF'?'Open PDF: ':'Open video: ')+assetName(asset))}" title="${esc(assetName(asset))}">${mediaIcon(asset.kind)}<span>${esc(assetName(asset))}${videoExpired(asset)?' · Recording expired':''}</span></button>`).join('')||'<p class="lm-card-empty">No videos or PDFs attached yet.</p>'}</div><footer class="lm-card-footer">${row.media&&row.media.state!=='PUBLISHED'?`<span class="lm-state">${esc(row.media.state)}</span>`:''}${canOpen?`<button type="button" class="button secondary" data-lm="calendar-session" data-key="${esc(row.sessionKey)}">${row.media?.canManage||row.canManage?'Edit':row.canContribute?'My PDF notes':'Lesson details'}</button>`:''}</footer></article>`;
 }
 function courseFilesSection(){
  const files=data?.courseFiles;if(!files)return '';
  const row=files.media;
  return `<section class="lm-course-files" aria-labelledby="lm-course-files-title"><div class="lm-heading"><div><h3 id="lm-course-files-title">Course PDFs</h3><p>Resources for the whole Course, available across all sessions.</p></div>${files.canManage?`<button type="button" class="button secondary" data-lm="course-files">Manage Course PDFs</button>`:''}</div>${row&&row.state!=='PUBLISHED'?'<p class="lm-inline-help">Draft · visible to Course administrators only. Publish these PDFs when ready.</p>':''}<div class="lm-actions">${row?.assets.filter(a=>a.kind==='PDF').map(asset=>`<button type="button" class="button secondary" data-lm="pdf" data-id="${esc(row.id)}" data-asset="${esc(asset.id)}">▤ ${esc(assetName(asset))}</button>`).join('')||'<p>No Course PDFs available yet.</p>'}</div></section>`;
 }
 function rowsForMaterials(){return (data?.sessions||[]).filter(r=>r.media?.canView&&r.media.assets.some(a=>a.kind==='PDF')&&!collectionModule.permittedRecordingGroups([r.media]).length);}
 function rowsForManagement(){return (data?.sessions||[]).filter(r=>(!managementDate||r.date===managementDate)&&(r.canManage||r.media?.canManage||r.canContribute));}
 function addMediaButton(){return data?.canCreateContent?'<button type="button" class="button" data-lm="binding-open">Add media</button>':'';}
 function managementDateForm(){return `<form class="lm-form" data-lm-form="management-date"><label>Timetable lesson date<input type="date" name="date" required value="${esc(managementDate||data.startDate)}"></label><div class="lm-actions"><button type="submit" class="button secondary"${calendarLoading?' disabled':''}>Show date</button><button type="button" class="button secondary" data-lm="management-current"${calendarLoading?' disabled':''}>Current week</button></div><p class="lm-inline-help">Choose a past date to attach a recording. This does not change the timetable.</p></form>`;}
 function render(){
  if(!host||playlistSettingsOpen)return;
  if(data?.kind==='PROGRAM'&&collectionModule){
   const native=nativeReader?.state(),selected=native?.selected,nativeIds=new Set((native?.catalogue?.playlists||[]).map(p=>p.id)),legacy=(data.lessons||[]).filter(row=>!nativeIds.has(row.playlistId)),collection=selected?collectionModule.nativePlaylistContentsHTML(selected,recordingView):collectionModule.recordingCollectionHTML(legacy,recordingView),catalogue=selected||recordingView.group?'':collectionModule.nativePlaylistTableHTML(native?.catalogue);
   const nativeCollection=selected?collection+(selected.before?'<button type="button" class="button secondary" data-lm="native-recordings-more">Load more recordings</button>':''):catalogue+(legacy.length?(catalogue?'<details class="lm-legacy-recordings"><summary>Other and historical recordings</summary>'+collection+'</details>':collection):'');
   clearTimeout(expiryTimer);const now=Date.now(),deadlines=currentMediaRows().flatMap(r=>[...(r.assets||[]).map(a=>Date.parse(a.expiresAt)),...(r.recordingCompanions||[]).map(c=>Date.parse(c.companionExpiresAt))]).filter(d=>Number.isFinite(d)&&d>now);if(deadlines.length)expiryTimer=setTimeout(()=>{expiryTimer=null;if(cacheScope)cache()?.invalidate(cacheScope);if(recordingView.lesson){const [id,assetId]=JSON.parse(recordingView.lesson);void recordingPage(currentMediaRows().find(r=>r.id===id),{assetId});}else render();},Math.min(2147483647,Math.max(1,Math.min(...deadlines)-now+20)));
   host.innerHTML=`<div class="lm-heading"><h2>Lesson media</h2><div class="lm-actions">${data.canManage?'<button type="button" class="button secondary" data-lm="playlist-settings">Playlist settings</button>':selected?.playlist?.canEdit?'<button type="button" class="button" data-lm="playlist-inline-edit">Edit playlist</button>':''}${addMediaButton()}<button type="button" class="button secondary" data-lm="refresh"${calendarLoading?' disabled':''}>Refresh</button></div></div>${calendarError?`<p role="alert">${esc(calendarError)}</p>`:''}${native?.pending?'<p role="status">Loading playlists…</p>':''}${native?.error?'<p role="alert">'+esc(native.error)+'</p>':''}${nativeCollection}${!selected&&data.before?'<button type="button" class="button secondary" data-lm="more">Load earlier recordings</button>':''}${rowsForMaterials().length?'<section><h3>Lesson materials</h3>'+data.sessions.filter(r=>r.media?.canView&&r.media.assets.some(a=>a.kind==='PDF')&&!r.media.assets.some(isVideo)).map(mediaCard).join('')+'</section>':''}${data.canManage?`<details${managementDate?' open':''}><summary>Manage media</summary><div class="lm-media-rail">${rowsForManagement().map(mediaCard).join('')||'<p>No saved media yet. Choose Add media to begin.</p>'}</div></details>`:''}`;
   return;
  }
  const previous=host.querySelector('.lm-media-rail'),scroll=previous?.scrollLeft||0;
  const anchor=previous&&[...previous.children].find(card=>card.offsetLeft+card.offsetWidth>previous.offsetLeft+scroll),anchorKey=anchor?.dataset.sessionKey,anchorOffset=anchor?anchor.offsetLeft-previous.offsetLeft-scroll:0;
  const focus=host.contains(document.activeElement)?document.activeElement?.dataset.lm:null,rows=(data?.sessions||[]).filter(row=>row.canManage||row.media?.canManage||row.canContribute||!row.media?.assets.some(videoExpired)||row.media.assets.some(asset=>!videoExpired(asset))),railId=host.id+'-rail';
  const message=calendarLoading?(data?'Checking for updates…':'Loading lesson media…'):calendarError?(data?'Showing saved lesson media. Couldn’t check for updates.':calendarError):!rows.length?'No lesson media available yet.':'';
  host.innerHTML=`<div class="lm-heading"><div><h2>Lesson media</h2><p>${esc(data?.activityName||'')}</p></div><div class="lm-actions">${addMediaButton()}<button type="button" class="button secondary" data-lm="refresh"${calendarLoading?' disabled':''}>Refresh</button><div class="lm-rail-controls" role="group" aria-label="Browse media cards"><button type="button" class="button secondary" data-lm="rail-previous" aria-label="Previous media cards" aria-controls="${railId}"${rows.length?'':' disabled'}>←</button><button type="button" class="button secondary" data-lm="rail-next" aria-label="Next media cards" aria-controls="${railId}"${rows.length?'':' disabled'}>→</button></div></div></div>${courseFilesSection()}<p class="lm-message" data-lm-message role="${calendarError?'alert':'status'}" aria-live="polite"${message?'':' hidden'}>${esc(message)}</p>${calendarError?'<button type="button" class="button secondary" data-lm="refresh">Try again</button>':''}<div id="${railId}" class="lm-media-rail" tabindex="0" role="region" aria-label="${data?.kind==='COURSE'?'Course':'Program'} lesson media cards" aria-busy="${calendarLoading}">${rows.map(mediaCard).join('')}</div>${data?.before?`<div class="lm-actions lm-earlier"><button type="button" class="button secondary" data-lm="more"${calendarLoading?' disabled':''}>Load earlier lessons</button></div>`:''}`;
  const rail=host.querySelector('.lm-media-rail'),same=anchorKey&&[...rail.children].find(card=>card.dataset.sessionKey===anchorKey);
  rail.scrollLeft=same?same.offsetLeft-rail.offsetLeft-anchorOffset:scroll;
  if(focus)host.querySelector('[data-lm="'+focus+'"]')?.focus({preventScroll:true});
  clearTimeout(expiryTimer);
  const expiries=(data?.lessons||[]).flatMap(row=>row.assets||[]).filter(a=>a.kind==='MP4'&&!videoExpired(a)).map(a=>Date.parse(a.expiresAt)).filter(Number.isFinite);
  if(expiries.length)expiryTimer=setTimeout(()=>{expiryTimer=null;if(host)render();},Math.min(2147483647,Math.max(1,Math.min(...expiries)-Date.now()+20)));
 }
 async function load({more=false,force=false}={}){
  if(calendarLoading&&!force)return;
  const g=generation,request=++calendarRequest,ticket=cache()?.ticket(),scope=cacheScope;
  calendarLoading=true;calendarError='';render();
  try{
   await window.M4L_ACADEMY_WORKSPACE?.readyPublication(true);
   if(!active(g)||request!==calendarRequest)return;
   const result=await api('feed',{runId,contentFlow:true,...(managementDate?{sessionDate:managementDate}:{}),...(more?{before:data.before}:!force&&data?.cacheRevision&&(data.sessionDate||'')===managementDate?{ifRevision:data.cacheRevision}:{}),...(learnerView?{view:'learner'}:{})});
   if(!active(g)||request!==calendarRequest||ticket!==cache()?.ticket())return;
   if(more&&data.cacheRevision!==result.cacheRevision){calendarLoading=false;return load({force:true});}
   if(!result.notModified){
    if(more){const rows=new Map(data.sessions.map(row=>[row.sessionKey,row]));for(const row of result.sessions)rows.set(row.sessionKey,row);data={...result,sessions:[...rows.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.sessionKey.localeCompare(b.sessionKey)),lessons:[...new Map([...data.lessons,...result.lessons].map(row=>[row.id,row])).values()]};}
    else data=result;
   }
   calendarLoading=false;
   if(scope&&!managementDate)cache()?.write(scope,data,head(),ticket);render();if(recordingView.lesson){const [id,assetId]=JSON.parse(recordingView.lesson);void recordingPage(currentMediaRows().find(r=>r.id===id),{assetId});}
  }catch(error){if(active(g)&&request===calendarRequest){calendarLoading=false;calendarError=error.message;if([401,403,404].includes(error.status)||['MEDIA_NOT_ENABLED','MEDIA_FORBIDDEN'].includes(error.code)){if(scope)cache()?.invalidate(scope);data=null;}render();}}
 }
 async function start(){
  const g=generation,current=session,[area,classView]=JSON.parse(context),owner=await cache()?.owner(current);
  if(!active(g))return;
  cacheScope=owner?{owner,workspace:area,classView,activityKey,runId,learnerView}:null;
  const saved=cacheScope&&cache()?.read(cacheScope,head());
  if(saved){data=saved.data;render();}
  await load();if(!active(g))return;await nativeReaderReady;if(active(g)&&data?.kind==='PROGRAM')await nativeReader.loadList({activityKey,limit:50});if(active(g))rememberRecordingView(null,true);
 }

 async function openPlaylistSettings({inline=false}={}){
  const selected=nativeReader?.state().selected?.playlist;if(data?.kind!=='PROGRAM'||!(data.canManage===true||inline&&selected?.canEdit===true)||!canLeaveEditor())return;
  const g=generation;try{
   if(!window.M4L_RECORDING_PLAYLISTS)await import('./m4l-mou-playlists.js');if(!window.M4L_ACADEMY_PLAYLISTS)await import('./m4l-academy-playlists.js');if(!active(g))return;
   playlistSettingsOpen=true;host.innerHTML='<header class="lm-heading"><h2>Programme playlists</h2><button type="button" class="button secondary" data-lm="playlist-settings-close">← Recordings</button></header><div data-lm-native-settings></div>';
   await window.M4L_ACADEMY_PLAYLISTS.mount(host.querySelector('[data-lm-native-settings]'),{activityKey,label:(data.activityName||'Programme')+' playlists',onRecording:async result=>{if(active(g))await edit({id:result.lessonId,title:'Playlist recording'});}});
  }catch(error){if(active(g)){playlistSettingsOpen=false;window.M4L_ACADEMY_PLAYLISTS?.unmount?.();calendarError=error.message;render();}}
 }
 async function closePlaylistSettings(){
  if(!canLeaveMedia())return;const selectedId=nativeReader?.state().selected?.playlist.id;window.M4L_ACADEMY_PLAYLISTS?.unmount?.();playlistSettingsOpen=false;const g=generation;render();await load({force:true});if(!active(g))return;await nativeReaderReady;await nativeReader.loadList({activityKey,limit:50},{force:true});if(active(g)&&selectedId)await nativeReader.open({activityKey,playlistId:selectedId,limit:30});
 }
 async function openBinding(){
  if(data?.kind==='PROGRAM'){const g=generation;try{if(!window.M4L_ACADEMY_PLAYLISTS)await import('./m4l-academy-playlists.js');if(!active(g))return;const result=await window.M4L_ACADEMY_PLAYLISTS.createRecording({activityKey,playlistId:nativeReader?.state().selected?.playlist.id});if(result&&active(g)){await load({force:true});await edit({id:result.lessonId,title:'Playlist recording'});}}catch(error){if(active(g)){calendarError=error.message;render();}}return;}
  const dg=modal('Add media','<p>Loading native media choices…</p>');if(dg===null)return;
  binding={operationId:crypto.randomUUID(),request:0};await bindingChoices('',dg);
 }
 async function bindingChoices(classId='',dg=dialogGeneration,values=null){
  const g=generation,current=binding;if(!current)return;const request=++current.request;busy=true;
  try{const choices=await api('binding-options',{classId});if(!active(g)||dg!==dialogGeneration||binding!==current||request!==current.request)return;current.options=choices;
   const val=name=>values?.get(name)||'',ids=values?.getAll('teacherIds')||[];
   dialog.querySelector('[data-lm-dialog-body]').innerHTML=`<form class="lm-form lm-binding-form" data-lm-form="binding-create"><p class="lm-inline-help">Choose the recorded content. Your media starts as a private draft.</p><label>${choices.kind==='COURSE'?'Course':'Programme'}<input value="${esc(data.activityName)}" readonly></label>${choices.kind==='PROGRAM'?`<label>Class<select name="classId" required><option value="">Choose a class</option>${choices.classes.map(c=>`<option value="${esc(c.id)}"${c.id===classId?' selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>Subject / Module / Surah<select name="subjectKey" required><option value="">Choose the recorded subject</option>${choices.subjects.map(c=>`<option value="${esc(c.key)}"${c.key===val('subjectKey')?' selected':''}>${esc(c.name)}</option>`).join('')}</select></label>`:''}<fieldset class="lm-teacher-choices"><legend>Registered Teacher(s)</legend><p class="lm-inline-help">Choose one to ten Teachers credited for this recording.</p>${choices.teachers.map(t=>`<label class="lm-check"><input type="checkbox" name="teacherIds" value="${esc(t.id)}"${ids.includes(t.id)?' checked':''}>${esc(t.name)}</label>`).join('')||'<p>No registered Teachers available. Refresh after the native Teacher registry is updated.</p>'}</fieldset><label>Recording date<input name="recordingDate" type="date" required value="${esc(val('recordingDate'))}"></label><label>Media title <span class="lm-inline-help">Optional</span><input name="title" maxlength="180" value="${esc(val('title'))}"></label><div class="lm-actions"><button type="submit" class="button"${!choices.teachers.length?' disabled':''}>Create private draft</button><button type="button" class="button secondary" data-lm="close">Cancel</button></div></form>`;
   const form=dialog.querySelector('[data-lm-form=binding-create]');if(values)form.dataset.changed='true';form.querySelector('[name=classId]')?.addEventListener('change',()=>{const next=new FormData(form);void bindingChoices(next.get('classId'),dg,next);});modalMessage('');
  }catch(error){if(active(g)&&dg===dialogGeneration)modalMessage(error.message,true);}
  finally{if(active(g)&&dg===dialogGeneration){busy=false;}}
 }
 async function selectSession(row){
  if(!row||busy)return;
  if(separated()&&row.media&&!row.media.canManage&&window.M4L_ACADEMY_WORKSPACE?.audience()==='TEACH'){
   const g=generation;try{const option=await api('note-options',{...(row.media?.mediaBinding?{lessonId:row.media.id}:{}),sessionKey:row.sessionKey,date:row.date,runId:row.runId||row.media.runId||runId});if(!active(g))return;row.canContribute=option.canContribute;row.media.canContribute=option.canContribute;}catch(error){if(!active(g))return;if([401,403].includes(error.status))return;row.canContribute=false;row.media.canContribute=false;}
  }
  if(row.media){if(row.media.canManage)await edit(row.media);else if(row.media.canView)modal(row.media.title,`<p class="lm-inline-help">${esc(date(row.date))} · ${esc(row.startTime)}–${esc(row.endTime)}</p>${row.media.summary?`<p class="lm-session-summary">${esc(row.media.summary)}</p>`:''}<div class="lm-actions">${row.media.assets.map(asset=>`<button type="button" class="button${asset.kind==='PDF'?' secondary':''}" data-lm="${asset.kind==='PDF'?'pdf':'watch'}"${videoExpired(asset)?' disabled':''} data-id="${esc(row.media.id)}" data-key="${esc(row.sessionKey)}" data-asset="${esc(asset.id)}">${asset.kind==='PDF'?'▤':'▶'} ${esc(assetName(asset))}${videoExpired(asset)?' · Recording expired':''}</button>`).join('')||'<p>No video or PDF attachments yet.</p>'}${separated()?'':`<button type="button" class="button secondary" data-lm="discussion" data-id="${esc(row.media.id)}">Discussion</button>`}</div>${separated()?notesHTML(row):''}`);if(separated())noteContext=row;return;}
  if(!row.canManage)return;
  const dg=modal('Attach media · '+row.title,'<p>Opening lesson media…</p>');if(dg!==null)await mutate('create',{operationId:crypto.randomUUID(),startDate:row.date,endDate:row.date,runId:row.runId||row.media?.runId||runId,sessionKey:row.sessionKey,sessionVersion:row.sessionVersion});
 }
 function syncDirty(){dirty=Boolean(dialog?.querySelector('[data-lm-form][data-changed=true],.lm-asset-name-form[data-changed=true]'));}
 function contextUnfinished(){return dialog?.querySelector('[data-lm-form=context][data-changed=true]');}
 function close(force=false){
  if(!force&&busy){modalMessage('Please wait for this change to finish.');return false;}
  if(!force&&dirty&&!window.confirm('Discard your unfinished entry?'))return false;
  if(!force&&dialog?.querySelector('.lm-pdf')?.contentWindow.PDFViewerApplication?._annotationStorageModified&&!window.confirm('This PDF has unsaved annotations. Download a copy before closing it. Continue?'))return false;
  dialog?.querySelector('video')?.pause();window.M4L_LESSON_PDF_LIBRARY?.cancel(dialog);
  dialogGeneration++;noteContext=null;editor=null;discussion=null;binding=null;companionEditor=null;retry=null;busy=false;dirty=false;sameScreenAdmin=false;sameScreenCompanion=false;
  if(dialog){dialog.close();dialog.remove();dialog=null;}if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl='';}return true;
 }
 function modal(title,body){
  if(!close())return null;
  dialog=document.createElement('dialog');dialog.className='lm-dialog';dialog.setAttribute('aria-labelledby','lm-dialog-title');
  dialog.innerHTML=`<div class="lm-modal-head"><h2 id="lm-dialog-title">${esc(title)}</h2><button type="button" class="button secondary small academy-close" data-lm="close" title="Close">Close</button></div><p data-lm-dialog-message class="lm-message" role="status" aria-live="polite"></p><div data-lm-dialog-body>${body}</div>`;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',handleClick);dialog.addEventListener('submit',handleSubmit);dialog.addEventListener('input',event=>{const form=event.target.closest('[data-lm-form]');if(form){form.dataset.changed='true';dirty=true;}});document.body.appendChild(dialog);dialog.showModal();return dialogGeneration;
 }
 async function recordingPage(row,{play=false,start=0,assetId,remember=false}={}){
  if(!row||!active())return;
  const g=generation,asset=row.assets?.find(a=>isVideo(a)&&(!assetId||a.id===assetId));if(!asset)return;
  recordingView.lesson=JSON.stringify([row.id,asset.id]);const selectedKey=recordingView.lesson;if(remember)rememberRecordingView();render();
  const body=host.querySelector('[data-lm-recording-companion]'),topicHost=host.querySelector('[data-lm-recording-topics]');if(!body||!topicHost){delete recordingView.lesson;return;}
  try{
   const result=await api('companion',{lessonId:row.id,assetId:asset.id});if(!active(g)||recordingView.lesson!==selectedKey)return;
   const c=result.companion;if(c){
    body.innerHTML=collectionModule.academicCompanionHTML(c,{lessonId:row.id,assetId:asset.id});
    topicHost.innerHTML=(c.topics||[]).map(t=>`<p><button type="button" class="button secondary" data-lm="recording-seek" data-id="${esc(row.id)}" data-asset="${esc(asset.id)}" data-start="${t.start}">${esc(t.time)} · ${esc(t.title)}</button></p>`).join('');
   }else topicHost.textContent='A topic guide has not been published for this recording.';
  }catch(error){if(active(g)&&recordingView.lesson===selectedKey)body.textContent=error.message;}
  if(!active(g)||recordingView.lesson!==selectedKey)return;
  const mount=host.querySelector('[data-lm-recording-player]');
  if(!videoExpired(asset)&&recordingView.tab!=='read')await collectionModule.presentRecordingPlayback(()=>recordingPlayback(row,asset.id,mount,{play,start}),{isCurrent:()=>active(g)&&recordingView.lesson===selectedKey&&mount?.isConnected,report:message=>mount.textContent=message});
 }
 async function recordingPlayback(row,assetId,mount,{play=true,start=0}={}){
  const currentPlayer=mount?.querySelector('video,iframe');
  if(currentPlayer){if(currentPlayer.tagName==='VIDEO'){currentPlayer.currentTime=start;if(play)try{await currentPlayer.play();}catch{mount.insertAdjacentHTML('beforeend','<p>Press Play in the recording player to start playback.</p>');}}else{const url=new URL(currentPlayer.src);url.searchParams.set('start',String(start));currentPlayer.src=url.href;}return;}
  const g=generation,id=recordingView.lesson,result=await api('watch',{lessonId:row.id,assetId});if(!active(g)||id!==recordingView.lesson||!mount?.isConnected)return;
  if(result.kind==='MP4'){
   const url=new URL(result.playbackPath,window.M4L_CONFIG?.API_BASE||location.origin),base=new URL(window.M4L_CONFIG?.API_BASE||location.origin);if(url.origin!==base.origin||url.pathname!=='/api/academy/lesson-media/video')throw Error('Recording unavailable.');
   mount.innerHTML='<video controls playsinline preload="metadata" src="'+esc(url.href)+'"></video>';const video=mount.querySelector('video');video.addEventListener('loadedmetadata',()=>{video.currentTime=Math.min(start,Math.max(0,video.duration-.1));},{once:true});if(play)try{await video.play();}catch{mount.insertAdjacentHTML('beforeend','<p>Press Play in the recording player to start playback.</p>');}
  }else{
   if(!/^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}\?rel=0$/.test(result.embedUrl))throw Error('Recording unavailable.');
   const url=new URL(result.embedUrl);url.searchParams.set('start',String(start));url.searchParams.set('autoplay',play?'1':'0');mount.innerHTML='<iframe title="'+esc(row.title)+'" src="'+esc(url.href)+'" allow="autoplay; fullscreen" allowfullscreen></iframe><p>Use the player’s Play control if playback does not start.</p>';
  }
 }
 async function watch(row,asset){
  const name=assetName(row.assets?.find(a=>a.id===asset)||{name:row.title});
  const dg=modal(name,'<p>Checking your access…</p>');if(dg===null)return;
  try{const result=await api('watch',{lessonId:row.id,assetId:asset});if(dg!==dialogGeneration)return;if(result.kind==='MP4'){const url=new URL(result.playbackPath,window.M4L_CONFIG?.API_BASE||location.origin),base=new URL(window.M4L_CONFIG?.API_BASE||location.origin);if(url.origin!==base.origin||url.pathname!=='/api/academy/lesson-media/video')throw Error('Recording unavailable.');dialog.querySelector('[data-lm-dialog-body]').innerHTML=`<video class="lm-player" controls playsinline preload="metadata" aria-label="${esc(name)}" src="${esc(url.href)}"></video><div class="lm-player-tools"><label>Playback speed <select data-lm-speed aria-label="Playback speed">${[.5,.75,1,1.25,1.5,1.75,2].map(n=>`<option value="${n}"${n===1?' selected':''}>${n}×</option>`).join('')}</select></label></div><p class="lm-inline-help">Available for 14 days after upload.</p>`;const player=dialog.querySelector('video');dialog.querySelector('[data-lm-speed]').addEventListener('change',e=>{player.playbackRate=Number(e.target.value);});player.addEventListener('error',()=>modalMessage('This recording is unavailable or access has expired. Close and reopen it to try again.',true));return;}if(!/^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}\?rel=0$/.test(result.embedUrl))throw Error('Recording unavailable.');dialog.querySelector('[data-lm-dialog-body]').innerHTML=`<iframe class="lm-player" src="${esc(result.embedUrl)}" title="${esc(name)}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;}catch(e){if(dg===dialogGeneration)modalMessage(e.message,true);}
 }
 async function pdf(row,asset){
  const name=assetName(row.assets?.find(a=>a.id===asset)||{name:row.title});
  const dg=modal(name,'<p>Opening PDF…</p>');if(dg===null)return;
  try{const blob=await api('download',{lessonId:row.id,assetId:asset,sessionKey:row.sessionKey,date:row.date},{blob:true});if(dg!==dialogGeneration)return;objectUrl=URL.createObjectURL(blob);dialog.querySelector('[data-lm-dialog-body]').innerHTML=`<a class="button secondary small" href="${esc(objectUrl)}" download="${esc(row.assets?.find(a=>a.id===asset)?.filename||'lesson-notes.pdf')}">Download PDF</a><iframe class="lm-pdf" src="/pdf-viewer/web/viewer.html?academy=1&amp;file=${encodeURIComponent(objectUrl)}" title="${esc(name)}"></iframe>`;}catch(e){if(dg===dialogGeneration)modalMessage(e.message,true);}
 }
 async function edit(row,{inline=false}={}){
  const dg=modal('Manage · '+row.title,'<p>Opening lesson…</p>');if(dg===null)return;sameScreenAdmin=inline||playlistSettingsOpen;
  try{const result=await api('get',{lessonId:row.id});if(dg!==dialogGeneration)return;editor=result;renderEditor();}catch(e){if(dg===dialogGeneration)modalMessage(e.message,true);}
 }
 function videoEditorRow(asset={}){return `<div class="lm-attachment-entry" data-lm-video><span class="lm-attachment-icon">${mediaIcon('YOUTUBE')}</span><label>Video name<input name="videoName" maxlength="180" value="${esc(asset.name||asset.filename||'')}" placeholder="Video name"></label><label>YouTube link<input type="url" name="videoUrl" maxlength="2048" value="${esc(asset.url||'')}" placeholder="https://youtu.be/…"></label><button type="button" class="button secondary lm-remove" data-lm="video-remove" aria-label="Remove video">×</button></div>`;}
 function recordingEditorRow(asset){return `<div class="lm-attachment-entry" data-lm-recording="${esc(asset.id)}"><span class="lm-attachment-icon">${mediaIcon('MP4')}</span><label>Video name<input name="recordingName" maxlength="180" value="${esc(assetName(asset))}"></label><div class="lm-file-source"><span>Uploaded MP4${videoExpired(asset)?' · Expired':''}</span><span>${esc(asset.filename)} · ${(asset.byteSize/1000000).toFixed(1)} MB</span><span>${asset.retained?'Retained · no automatic expiry':'Expires '+esc(new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(new Date(asset.expiresAt)))}</span>${editor?.lesson.retainRecordings&&!asset.retained?`<button type="button" data-lm="retain-recording" data-asset="${esc(asset.id)}">Retain recording</button>`:''}${!asset.retained?`<button type="button" class="button secondary" data-lm="companion-open" data-asset="${esc(asset.id)}">Review summary and topics</button>`:''}</div><button type="button" class="button secondary lm-remove" data-lm="recording-remove" aria-label="${esc('Remove recording: '+assetName(asset))}">×</button></div>`;}
 function pdfEditorRow(asset){return `<div class="lm-attachment-entry" data-lm-pdf="${esc(asset.id)}"><span class="lm-attachment-icon">${mediaIcon('PDF')}</span><label>PDF name<input name="pdfName" maxlength="180" value="${esc(assetName(asset))}"></label><div class="lm-file-source"><span>PDF file</span><span>${esc(asset.filename)}</span></div><button type="button" class="button secondary lm-remove" data-lm="remove" data-asset="${esc(asset.id)}" aria-label="${esc('Remove PDF: '+assetName(asset))}">×</button></div>`;}
 function editorBusy(disabled){
  if(!editor||!dialog)return;
  for(const control of dialog.querySelectorAll('input,textarea,select,button:not([data-lm=close])')){
   if(disabled){if(control.dataset.lmDisabled===undefined)control.dataset.lmDisabled=String(control.disabled);control.disabled=true;}
   else if(control.dataset.lmDisabled!==undefined){control.disabled=control.dataset.lmDisabled==='true';delete control.dataset.lmDisabled;}
  }
 }
 function renderEditor(){
  const {lesson:row,assets}=editor,collection=row.mediaScope==='COURSE',videos=assets.filter(a=>a.kind==='YOUTUBE'),recordings=assets.filter(a=>a.kind==='MP4'),pdfs=assets.filter(a=>a.kind==='PDF'&&!a.noteId);
  dialog.classList.add('lm-editor-dialog');
  dialog.querySelector('.lm-modal-head').innerHTML=`<div class="lm-editor-title"><h2 id="lm-dialog-title">${esc('Manage · '+row.title)}</h2>${!collection&&row.teacher?`<p>${esc(row.teacher)}</p>`:''}</div>${!collection?`<time class="lm-editor-date" datetime="${esc(row.date)}">${esc(cardDate(row.date))}</time>`:''}<div class="lm-editor-actions"><button class="button" type="submit" form="lm-lesson-form">Save private draft</button><button type="button" class="button secondary academy-close" data-lm="close" title="Close">Close</button></div>`;
  dialog.querySelector('[data-lm-dialog-body]').innerHTML=`<form id="lm-lesson-form" class="lm-form" data-lm-form="lesson"><label>${collection?'Collection title':'Lesson title'}<input name="title" maxlength="180" required value="${esc(row.title)}"></label><label>Summary <span class="lm-inline-help">Optional</span><textarea name="summary" maxlength="4000">${esc(row.summary)}</textarea></label><section class="lm-attachments"><h3>Recording and supporting material</h3><p class="lm-inline-help">Add the recording once. Review its processed summary and topics alongside it, then add optional PDFs or readings.</p><div class="lm-attachment-list" data-lm-videos>${videos.map(videoEditorRow).join('')}</div><div class="lm-attachment-list" data-lm-recordings>${recordings.map(recordingEditorRow).join('')}</div><div class="lm-attachment-list" data-lm-pdfs>${pdfs.map(pdfEditorRow).join('')}</div><div class="lm-actions">${collection?'':'<button type="button" class="button secondary small" data-lm="video-add">Add YouTube video</button><button type="button" class="button secondary small" data-lm="mp4-add">Upload MP4</button>'}<button type="button" class="button secondary small" data-lm="pdf-add">Add PDF</button></div></section><p class="lm-inline-help">${row.state==='PUBLISHED'?'Published':'Private draft'} · Save keeps changes private until you choose Publish media.</p><div class="lm-actions"><button type="button" class="button" data-lm="publish">Publish media</button>${row.state==='PUBLISHED'?'<button type="button" class="button secondary" data-lm="hide-media">Hide media</button>':''}</div>${collection||separated()?'':`<label class="lm-check"><input name="commentsClosed" type="checkbox"${row.commentsClosed?' checked':''}>Close student discussion</label>`}</form><div data-lm-companion-editor></div>${row.canCorrectContext?`<section class="lm-editor-section"><h3>Recorded subject and Teacher</h3><p class="lm-inline-help">Review the subject and credited Teachers for this recording.</p><button type="button" class="button secondary" data-lm="context-open">${row.mediaBinding?'Review recorded content':row.contextCorrected?'Review one-day correction':'Correct this lesson'}</button><div data-lm-context></div></section>`:''}<form class="lm-form lm-upload-card" data-lm-form="upload" hidden><h3>Add PDF</h3><label>PDF name <span class="lm-inline-help">Optional · uses the filename when blank</span><input name="name" maxlength="180" placeholder="PDF name"></label>${window.M4L_LESSON_PDF_LIBRARY.controls()}<div class="lm-actions"><button class="button secondary" type="submit">Upload PDF</button><button class="button secondary" type="button" data-lm="upload-cancel">Cancel</button></div></form>${collection?'':`<form class="lm-form lm-upload-card" data-lm-form="video-upload" hidden><h3>Upload recording</h3><label>Video name <span class="lm-inline-help">Optional · uses the filename when blank</span><input name="name" maxlength="180"></label><label>MP4 file <span class="lm-inline-help">Up to 512 MB · ${row.retainRecordings?'retained with this Program':'available for 14 days after upload'}</span><input type="file" name="file" accept="video/mp4,.mp4" required></label><progress data-lm-upload-progress max="100" value="0" aria-label="Recording upload progress" hidden></progress><div class="lm-actions"><button class="button secondary" type="submit">Upload recording</button><button class="button secondary" type="button" data-lm="mp4-cancel">Cancel</button></div></form>`}${separated()?notesHTML({sessionKey:row.mediaBinding?.noteKey||row.sessionKey,date:row.date,media:{...row,assets},canContribute:false}):''}`;
  if(separated())noteContext={sessionKey:row.mediaBinding?.noteKey||row.sessionKey,date:row.date,media:{...row,assets},canContribute:false};editorBusy(busy);
 }
 async function openInlineCompanion(row,assetId){
  const dg=modal('Edit recording text','<p>Loading the checked recording draft…</p>');if(dg===null)return;sameScreenAdmin=true;sameScreenCompanion=true;try{editor=await api('get',{lessonId:row.id});if(dg!==dialogGeneration)return;companionEditor=await api('companion-editor',{lessonId:row.id,assetId});if(dg!==dialogGeneration)return;dialog.querySelector('[data-lm-dialog-body]').innerHTML='<div data-lm-companion-editor></div>';renderCompanionEditor();}catch(error){if(dg===dialogGeneration)modalMessage(error.message,true);}
 }
 async function openCompanion(assetId){
  if(dirty){modalMessage('Save your media changes before opening processed content.',true);return;}
  const g=generation,dg=dialogGeneration;busy=true;editorBusy(true);
  try{const result=await api('companion-editor',{lessonId:editor.lesson.id,assetId});if(!active(g)||dg!==dialogGeneration)return;companionEditor=result;renderCompanionEditor();}
  catch(error){if(active(g)&&dg===dialogGeneration)modalMessage(error.message,true);}
  finally{if(active(g)&&dg===dialogGeneration){busy=false;editorBusy(false);}}
 }
 function renderCompanionEditor(){
  const c=companionEditor,value=c.companion||{};
  dialog.querySelector('[data-lm-companion-editor]').innerHTML=`<section class="lm-editor-section"><h3>Processed summary and topics</h3><p class="lm-inline-help">Linked to ${esc(assetName(editor.assets.find(a=>a.id===c.assetId)))}. Review the full saved content before publishing it.</p><form class="lm-form" data-lm-form="companion"><label>Processed lesson file <span class="lm-inline-help">Optional JSON import</span><input type="file" name="processed" accept="application/json,.json"></label><label>Recording duration (seconds)<input type="number" name="duration" min="1" max="86400" required value="${esc(c.durationSeconds||'')}"></label><label>Full summary<textarea name="summary" maxlength="20000" rows="10">${esc(value.summary||'')}</textarea></label><label>Topics <span class="lm-inline-help">One per line: 01:23 | Topic title</span><textarea name="topics" rows="7">${esc((value.topics||[]).map(t=>t.time+' | '+t.title).join('\n'))}</textarea></label>${value.transcript?`<details><summary>Full transcript</summary><p class="lm-session-summary">${esc(value.transcript)}</p></details>`:''}<div class="lm-actions"><button type="submit" class="button secondary">Save processed draft</button>${c.companionRevision?'<button type="button" class="button" data-lm="companion-publish">Publish reviewed content</button>':''}<button type="button" class="button secondary" data-lm="companion-cancel">Close review</button></div></form></section>`;
  dialog.querySelector('[name=processed]').addEventListener('change',async event=>{const file=event.target.files[0],dg=dialogGeneration;if(!file)return;try{if(file.size>400000)throw Error('Choose a processed lesson file up to 400 KB.');const parsed=JSON.parse(await file.text());if(dg!==dialogGeneration)return;const value=parsed.companion||parsed;if(!value||typeof value.summary!=='string'||!Array.isArray(value.topics))throw Error('Choose a processed lesson with a summary and timestamped topics.');companionEditor={...c,companion:value,durationSeconds:parsed.durationSeconds||c.durationSeconds};renderCompanionEditor();const form=dialog.querySelector('[data-lm-form=companion]');form.dataset.changed='true';dirty=true;}catch(error){if(dg===dialogGeneration)modalMessage(error.message,true);}});
 }
 async function saveCompanion(form){
  const c=companionEditor,g=generation,dg=dialogGeneration,values=new FormData(form);if(!form.reportValidity())return;
  const topics=[];for(const line of values.get('topics').split('\n').filter(v=>v.trim())){const match=line.match(/^\s*(\d{1,3}:[0-5]\d(?::[0-5]\d)?)\s*\|\s*(.+?)\s*$/);if(!match){modalMessage('Use a timestamp and title for each topic, for example 01:23 | Introduction.',true);return;}topics.push({time:match[1],title:match[2]});}
  const companion={...(c.companion||{}),summary:values.get('summary'),topics},encoded=new TextEncoder().encode(JSON.stringify(companion)),hash=await crypto.subtle.digest('SHA-256',encoded),sourceRevision=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(!active(g)||dg!==dialogGeneration)return;await mutate('companion-save',{operationId:crypto.randomUUID(),lessonId:editor.lesson.id,assetId:c.assetId,revision:editor.lesson.revision,companionRevision:c.companionRevision,sourceRevision,durationSeconds:Number(values.get('duration')),companion});
 }
 async function publishCompanion(){
  if(!companionEditor)return;if(dirty){modalMessage('Save the processed draft before publishing the reviewed content.',true);return;}
  const c=companionEditor;await mutate('companion-publish',{operationId:crypto.randomUUID(),lessonId:editor.lesson.id,assetId:c.assetId,revision:editor.lesson.revision,companionRevision:c.companionRevision,sourceRevision:c.sourceRevision,draftKey:c.draftKey});
 }
 async function openRecordedContext(){
  if(!editor?.lesson.canCorrectContext||busy)return;
  if(dirty){modalMessage('Save your unfinished lesson changes before correcting the recorded subject or teacher.',true);return;}
  const dg=dialogGeneration,g=generation;busy=true;editorBusy(true);modalMessage('Loading recorded subject and teacher…');
  try{
   const options=await api('context-options',{lessonId:editor.lesson.id});if(!active(g)||dg!==dialogGeneration)return;
   dialog.querySelector('[data-lm-context]').innerHTML=`${editor.lesson.mediaBinding?'':`<p>Scheduled: ${esc(options.scheduled.subject)} · ${esc(options.scheduled.teacher)}</p>`}<form class="lm-form" data-lm-form="context" data-revision="${options.revision}"><label>Recorded subject / module<select name="subjectKey" required>${options.subjects.some(s=>s.key===options.selectedSubject)?'':'<option value="" disabled selected>Previous subject unavailable · choose a current subject</option>'}${options.subjects.map(s=>`<option value="${esc(s.key)}"${s.key===options.selectedSubject?' selected':''}>${esc(s.name)}${s.key==='SCHEDULED'?' (scheduled)':''}</option>`).join('')}</select></label><label>Recorded teacher(s)<select name="teacherIds" multiple required size="5">${options.teachers.map(t=>`<option value="${esc(t.id)}"${options.selectedTeacherIds.includes(t.id)?' selected':''}>${esc(t.name)}</option>`).join('')}</select></label><label>Reason for this correction<textarea name="reason" maxlength="500" required></textarea></label><div class="lm-actions"><button type="submit" class="button secondary">Save recorded content</button><button type="button" class="button secondary" data-lm="context-cancel">Cancel correction</button>${options.corrected&&options.resetAllowed!==false?'<button type="button" class="button secondary" data-lm="context-reset">Restore scheduled subject and teacher</button>':''}</div></form>`;
   modalMessage('');
  }catch(error){if(active(g)&&dg===dialogGeneration)modalMessage(error.message,true);}
  finally{if(active(g)&&dg===dialogGeneration){busy=false;editorBusy(false);}}
 }
 async function saveRecordedContext(form,reset=false){
  if(!form||!editor?.lesson.canCorrectContext)return;
  if(dialog.querySelector('[data-lm-form]:not([data-lm-form=context])[data-changed=true]')){modalMessage('Save or cancel your other unfinished changes first.',true);return;}
  if(reset?!form.querySelector('[name=reason]').reportValidity():!form.reportValidity())return;
  const values=new FormData(form);
  await mutate('context-save',{lessonId:editor.lesson.id,operationId:crypto.randomUUID(),revision:Number(form.dataset.revision),reason:values.get('reason'),...(reset?{reset:true}:{subjectKey:values.get('subjectKey'),teacherIds:values.getAll('teacherIds')})});
 }
 async function openDiscussion(row){const dg=modal('Discussion · '+row.title,'<p>Loading discussion…</p>');if(dg===null)return;discussion={row};await loadComments(dg);}
 function notesHTML(row){
  const assets=row.media?.assets||[],curate=row.media?.canCurateNotes,canPost=row.canContribute;if(!canPost&&!assets.some(a=>a.noteId))return '';
  return `<section class="lm-editor-section"><h3>${canPost?'My PDF notes':'Teacher PDF notes'}</h3>${assets.filter(a=>a.noteId).map(a=>`<div class="lm-note"><p>${esc(assetName(a))}${a.author?' · '+esc(a.author):''}${a.attachmentScope==='RECURRING'?' · Every occurrence of this session':''}</p>${canPost&&a.own?noteForm(a,row.media?.mediaBinding):''}${curate||canPost&&a.own?`<button type="button" class="button secondary small" data-lm="note-withdraw" data-note="${esc(a.noteId)}" data-revision="${a.noteRevision}" data-scope="${a.attachmentScope||'LESSON'}">Withdraw note</button>`:''}</div>`).join('')}${canPost?noteForm(null,row.media?.mediaBinding):''}</section>`;
 }
 function noteForm(asset,bound=false){const scope=asset?.attachmentScope||'LESSON';return `<form class="lm-form" data-lm-form="note-upload" data-note="${esc(asset?.noteId||'')}" data-revision="${asset?.noteRevision||0}"><label>PDF name<input name="name" maxlength="180" value="${esc(asset?.name||'')}"></label><label>Attach to<select name="attachmentScope"${asset?' disabled':''}><option value="LESSON"${scope==='LESSON'?' selected':''}>This lesson only</option>${bound?'':`<option value="RECURRING"${scope==='RECURRING'?' selected':''}>Every occurrence of this session</option>`}</select></label>${asset?`<input type="hidden" name="attachmentScope" value="${scope}">`:''}${window.M4L_LESSON_PDF_LIBRARY.controls(asset?'Replace my PDF note':'Post my PDF note')}<button type="submit" class="button secondary">${asset?'Replace my note':'Post my note'}</button></form>`;}

 async function noteOptions(){if(!noteContext)throw Error('Open the dated lesson first.');return api('note-options',{...(noteContext.media?.mediaBinding?{lessonId:noteContext.media.id}:{}),sessionKey:noteContext.sessionKey,date:noteContext.date,runId:noteContext.runId||noteContext.media?.runId||runId,...(noteContext.media?.assets?.find(a=>a.noteId)?{noteId:noteContext.media.assets.find(a=>a.noteId).noteId}:{})});}
 async function loadComments(dg=dialogGeneration){
  try{const result=await api('comments',{lessonId:discussion.row.id});if(dg!==dialogGeneration)return;discussion={...discussion,...result};renderComments();}catch(e){if(dg===dialogGeneration)modalMessage(e.message,true);}
 }
 function renderComments(){
  const d=discussion,comments=[...d.comments].sort((a,b)=>Number(b.pinned)-Number(a.pinned)||a.createdAt.localeCompare(b.createdAt));
  dialog.querySelector('[data-lm-dialog-body]').innerHTML=`<button type="button" class="button secondary small" data-lm="comments-refresh">↻ Refresh discussion</button><div>${comments.map(c=>`<article class="lm-comment${c.parentId?' lm-comment-reply':''}"><header><strong>${esc(c.name)}</strong>${c.staff?'<span class="lm-badge">Staff</span>':''}${c.pinned?'<span class="lm-badge">Pinned</span>':''}${c.state!=='APPROVED'?`<span class="lm-badge pending">${esc(c.state==='PENDING'?'Awaiting approval':c.state==='HIDDEN'?'Hidden':'Removed')}</span>`:''}<time>${esc(new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Africa/Johannesburg'}).format(new Date(c.createdAt)))}</time></header>${c.parentId?'<small>Reply in this lesson</small>':''}<p>${esc(c.body)}</p><div class="lm-comment-tools">${c.state==='APPROVED'&&!c.parentId&&(!d.commentsClosed||d.canManage)?`<button type="button" class="button secondary small" data-lm="reply" data-comment="${esc(c.id)}">Reply</button>`:''}${c.own?`<button type="button" class="button secondary small" data-lm="comment-edit" data-comment="${esc(c.id)}">Edit</button><button type="button" class="button secondary small" data-lm="moderate" data-comment="${esc(c.id)}" data-decision="DELETE">Delete</button>`:''}${d.canManage?`${c.state!=='APPROVED'?`<button type="button" class="button secondary small" data-lm="moderate" data-comment="${esc(c.id)}" data-decision="APPROVE">Approve</button>`:''}<button type="button" class="button secondary small" data-lm="moderate" data-comment="${esc(c.id)}" data-decision="HIDE">Hide</button>${c.state==='APPROVED'?`<button type="button" class="button secondary small" data-lm="moderate" data-comment="${esc(c.id)}" data-decision="${c.pinned?'UNPIN':'PIN'}">${c.pinned?'Unpin':'Pin'}</button>`:''}${!c.own?`<button type="button" class="button secondary small" data-lm="moderate" data-comment="${esc(c.id)}" data-decision="DELETE">Remove</button>`:''}`:''}</div></article>`).join('')||'<p>No comments yet.</p>'}</div>${!d.commentsClosed||d.canManage?`<form class="lm-form lm-discussion-form" data-lm-form="comment"><label data-lm-comment-label>Add a comment</label><textarea name="body" aria-label="Your comment" maxlength="2000" required></textarea><p class="lm-inline-help">${d.canManage?'Your staff reply will appear immediately.':'Your comment is visible to you and teaching staff until approved.'}</p><div class="lm-actions"><button class="button" type="submit">Post comment</button><button class="button secondary" type="button" data-lm="comment-cancel" hidden>Cancel edit</button></div></form>`:'<p>Discussion is closed for this lesson.</p>'}`;
 }
 async function mutate(action,input,options={}){
  if(busy)return;if(!action.startsWith('companion-')&&dialog?.querySelector('[data-lm-form=companion][data-changed=true]')){modalMessage('Save or close the processed-content draft first.',true);return;}if(action.startsWith('companion-')&&dialog?.querySelector('[data-lm-form=lesson][data-changed=true]')){modalMessage('Save your media changes before changing processed content.',true);return;}if(action!=='context-save'&&contextUnfinished()){modalMessage('Save or cancel your unfinished one-day correction first.',true);return;}const dg=dialogGeneration,g=generation;busy=true;editorBusy(true);retry=()=>mutate(action,input,options);dialog?.setAttribute('aria-busy','true');modalMessage('Saving…');
  try{const result=await api(action,input,options);if(!active(g)||dg!==dialogGeneration)return;if(cacheScope)cache()?.invalidate(cacheScope);calendarRequest++;calendarLoading=false;if(action==='binding-create'||action==='create'||action==='course-files-create'){dirty=false;busy=false;retry=null;await load({force:true});if(active(g)&&dg===dialogGeneration)await edit({id:result.lessonId,title:'Session media'});return;}dirty=false;retry=null;window.dispatchEvent(new Event('m4l-lesson-media-changed'));modalMessage('Saved.');if(discussion)await loadComments(dg);if(editor){editor=await api('get',{lessonId:editor.lesson.id});if(dg!==dialogGeneration)return;if(sameScreenCompanion)dialog.querySelector('[data-lm-dialog-body]').innerHTML='<div data-lm-companion-editor></div>';else renderEditor();if(action.startsWith('companion-')){companionEditor=await api('companion-editor',{lessonId:input.lessonId,assetId:input.assetId});if(dg!==dialogGeneration)return;renderCompanionEditor();}}await load({force:true});if((action==='save'&&input.state==='PUBLISHED'||action==='companion-publish')&&nativeReader?.state().selected){const id=nativeReader.state().selected.playlist.id;await nativeReader.open({activityKey,playlistId:id,limit:30});}if(action.startsWith('note-')&&!editor&&noteContext){const row=data.sessions.find(r=>r.sessionKey===noteContext.sessionKey);busy=false;dirty=false;if(row)await selectSession(row);else close(true);}}
  catch(e){if(active(g)&&dg===dialogGeneration){modalMessage(e.message,true);const m=dialog.querySelector('[data-lm-dialog-message]');if(action==='binding-create'&&e.code==='CONTEXT_OPTIONS_CHANGED'){m.insertAdjacentHTML('beforeend',' <button type="button" class="button secondary small" data-lm="binding-refresh">Refresh choices</button>');return;}if(!m.querySelector('[data-lm=retry]'))m.insertAdjacentHTML('beforeend',' <button type="button" class="button secondary small" data-lm="retry">Retry this change</button>');}}
  finally{if(active(g)&&dg===dialogGeneration){busy=false;editorBusy(false);dialog?.removeAttribute('aria-busy');}}
 }
 async function uploadVideo(form,state){
  if(busy)return;if(contextUnfinished()){modalMessage('Save or cancel your unfinished one-day correction first.',true);return;}
  if(dialog.querySelector('[data-lm-form=lesson]').dataset.changed==='true'){modalMessage('Save your lesson changes before uploading a recording.',true);return;}
  if(!state){const values=new FormData(form),file=values.get('file');if(!file?.size||file.size>512*1024*1024||!/\.mp4$/i.test(file.name)){modalMessage('Choose an MP4 up to 512 MB.',true);return;}state={file,input:{lessonId:editor.lesson.id,revision:editor.lesson.revision,operationId:crypto.randomUUID(),filename:file.name,name:form.querySelector('[name=name]')?.value||'',size:file.size},parts:[]};}
  const g=generation,dg=dialogGeneration;busy=true;dirty=true;editorBusy(true);dialog.setAttribute('aria-busy','true');retry=()=>uploadVideo(form,state);
  const progress=form.querySelector('progress');progress.hidden=false;modalMessage('Starting recording upload…');
  try{
   state.upload??=await api('video-start',state.input);
   const {uploadToken,partSize}=state.upload;
   if(!Number.isInteger(partSize)||partSize<1||partSize>8*1024*1024)throw Error('Recording upload is unavailable.');
   for(let offset=state.parts.length*partSize;offset<state.file.size;offset+=partSize){
    if(!active(g)||dg!==dialogGeneration)return;
    const part=await api('video-part',{lessonId:state.input.lessonId,uploadToken,partNumber:state.parts.length+1},{upload:state.file.slice(offset,Math.min(offset+partSize,state.file.size))});
    state.parts.push({partNumber:part.partNumber,etag:part.etag});progress.value=Math.round(Math.min(offset+partSize,state.file.size)/state.file.size*100);modalMessage('Uploading recording… '+progress.value+'%');
   }
   await api('video-complete',{lessonId:state.input.lessonId,uploadToken,parts:state.parts});
   if(!active(g)||dg!==dialogGeneration)return;
   retry=null;dirty=false;if(cacheScope)cache()?.invalidate(cacheScope);window.dispatchEvent(new Event('m4l-lesson-media-changed'));
   editor=await api('get',{lessonId:state.input.lessonId});if(dg!==dialogGeneration)return;renderEditor();modalMessage('Recording uploaded. Save your media changes, then choose Publish media when ready.');await load({force:true});
  }catch(error){if(active(g)&&dg===dialogGeneration){modalMessage(error.message,true);dialog.querySelector('[data-lm-dialog-message]').insertAdjacentHTML('beforeend',' <button type="button" class="button secondary small" data-lm="retry">Retry upload</button>');}}
  finally{if(active(g)&&dg===dialogGeneration){busy=false;editorBusy(false);dialog.removeAttribute('aria-busy');}}
 }
 async function saveLesson(form,targetState){
  const values=new FormData(form);
   if(dialog.querySelector('[data-lm-form=companion][data-changed=true]')){modalMessage('Save or close the processed-content draft first.',true);return;}
   if(editor.attachmentEditing!==true){modalMessage('Refresh and reopen this editor before saving.',true);return;}
   if(dialog.querySelector('.lm-asset-name-form[data-changed=true]')){modalMessage('Save the edited PDF name first.',true);return;}
   const attachmentNames=[...form.querySelectorAll('[data-lm-pdf],[data-lm-recording]')].map(row=>({assetId:row.dataset.lmPdf||row.dataset.lmRecording,name:row.querySelector('[name=pdfName],[name=recordingName]').value.trim()})),removeAssetIds=editor.assets.filter(a=>['PDF','MP4'].includes(a.kind)&&!a.noteId&&!attachmentNames.some(n=>n.assetId===a.id)).map(a=>a.id);
   const videos=[...form.querySelectorAll('[data-lm-video]')].map(row=>({name:row.querySelector('[name=videoName]').value.trim(),url:row.querySelector('[name=videoUrl]').value.trim()})).filter(row=>row.name||row.url);
   await mutate('save',{operationId:crypto.randomUUID(),lessonId:editor.lesson.id,revision:editor.lesson.revision,title:values.get('title'),summary:values.get('summary'),videos,attachmentNames,removeAssetIds,state:targetState,commentsClosed:separated()||editor.lesson.mediaScope==='COURSE'||values.get('commentsClosed')==='on'});
 }
 async function handleSubmit(event){
  const form=event.target.closest('[data-lm-form]');if(!form)return;event.preventDefault();if(busy)return;const values=new FormData(form),kind=form.dataset.lmForm;
  if(kind==='binding-create'){const ids=values.getAll('teacherIds');if(!ids.length||ids.length>10){modalMessage('Choose one to ten registered Teachers.',true);return;}if(!form.reportValidity())return;await mutate('binding-create',{operationId:binding.operationId,classId:values.get('classId')||'',subjectKey:values.get('subjectKey')||'',teacherIds:ids,recordingDate:values.get('recordingDate'),title:values.get('title'),optionsRevision:binding.options.optionsRevision});return;}
  if(kind==='management-date'){if(!close())return;managementDate=values.get('date');recordingView={};for(const video of host.querySelectorAll('video'))video.pause();void load({force:true});return;}
  if(kind==='companion'){await saveCompanion(form);return;}
  if(kind==='context'){await saveRecordedContext(form);return;}
  if(kind==='note-upload'){
   const g=generation,dg=dialogGeneration;let file;try{file=await window.M4L_LESSON_PDF_LIBRARY.file(form,()=>active(g)&&dg===dialogGeneration);}catch(error){if(active(g)&&dg===dialogGeneration)modalMessage(error.name==='AbortError'?'PDF loading stopped. You can try again.':error.message,true);return;}if(!active(g)||dg!==dialogGeneration)return;if(!file?.size||file.size>16*1024*1024){modalMessage('Choose a PDF up to 16 MB.',true);return;}
   try{const option=await noteOptions();if(!option.canContribute)throw Error('This note is outside your current teaching assignment.');const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());if(!active(g)||dg!==dialogGeneration)return;await mutate('note-upload',{operationId:crypto.randomUUID(),sessionKey:option.session.sessionKey,sessionVersion:option.session.sessionVersion,attachmentScope:values.get('attachmentScope')||'LESSON',startDate:option.session.date,endDate:option.session.date,runId:option.session.runId,...(form.dataset.note?{noteId:form.dataset.note,revision:Number(form.dataset.revision)}:{}),filename:file.name,name:form.querySelector('[name=name]')?.value||'',size:file.size,sha256:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')},{upload:file});}catch(e){if(active(g)&&dg===dialogGeneration)modalMessage(e.message,true);}return;
  }
  if(kind==='video-upload'){void uploadVideo(form);return;}
  if(kind==='lesson'){
   await saveLesson(form,'DRAFT');
  }
  if(kind==='asset-name'){
   if(dialog.querySelector('[data-lm-form=lesson]').dataset.changed==='true'){modalMessage('Save your lesson changes before renaming a PDF.',true);return;}
   await mutate('attachment-name',{operationId:crypto.randomUUID(),lessonId:editor.lesson.id,revision:editor.lesson.revision,assetId:form.dataset.asset,name:values.get('name')});
  }
  if(kind==='comment'){const editing=discussion.editing;await mutate('comment-save',{operationId:crypto.randomUUID(),lessonId:discussion.row.id,body:values.get('body'),...(editing?{commentId:editing.id,revision:editing.revision}:discussion.parentId?{parentId:discussion.parentId}:{})});if(discussion){delete discussion.editing;delete discussion.parentId;}}
  if(kind==='upload'){
   if(dialog.querySelector('.lm-asset-name-form[data-changed=true]')){modalMessage('Save the edited PDF name first.',true);return;}
   if(dirty&&dialog.querySelector('[data-lm-form=lesson]').dataset.changed==='true'){modalMessage('Save your lesson changes before uploading a PDF.',true);return;}
   const g=generation,dg=dialogGeneration;let file;try{file=await window.M4L_LESSON_PDF_LIBRARY.file(form,()=>active(g)&&dg===dialogGeneration);}catch(error){if(active(g)&&dg===dialogGeneration)modalMessage(error.name==='AbortError'?'PDF loading stopped. You can try again.':error.message,true);return;}if(!active(g)||dg!==dialogGeneration)return;if(!file?.size||file.size>16*1024*1024){modalMessage('Choose a PDF up to 16 MB.',true);return;}
   try{const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());if(!active(g)||dg!==dialogGeneration)return;await mutate('upload',{operationId:crypto.randomUUID(),lessonId:editor.lesson.id,revision:editor.lesson.revision,filename:file.name,name:form.querySelector('[name=name]')?.value||'',size:file.size,sha256:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')},{upload:file});}catch(e){if(active(g)&&dg===dialogGeneration)modalMessage(e.message,true);}
  }
 }
 function handleClick(event){
  const b=event.target.closest('[data-lm]');if(!b)return;const action=b.dataset.lm,row=(b.dataset.key?data?.sessions?.find(r=>r.sessionKey===b.dataset.key)?.media:null)||currentMediaRows().find(r=>r.id===b.dataset.id)||data?.sessions?.map(r=>r.media).find(r=>r?.id===b.dataset.id)||(b.dataset.id&&data?.courseFiles?.media?.id===b.dataset.id?data.courseFiles.media:null);
  if(action==='close'){close();return;}if(separated()&&['discussion','comments-refresh','comment-cancel','reply','comment-edit','moderate'].includes(action))return;if(busy)return;
  if(action==='playlist-inline-edit'){void openPlaylistSettings({inline:true});return;}
  if(action==='recording-edit'){const selected=nativeReader?.state().selected;if(selected?.playlist.canEdit&&selected.recordings.some(row=>row.id===b.dataset.id)){const row=currentMediaRows().find(row=>row.id===b.dataset.id),asset=row.assets.find(asset=>asset.id===b.dataset.asset);if(asset?.kind==='MP4'&&!asset.retained&&row.recordingCompanions?.some(c=>c.assetId===asset.id))void openInlineCompanion(row,asset.id);else void edit(row,{inline:true});}return;}
  if(action==='playlist-settings'){void openPlaylistSettings();return;}
  if(action==='playlist-settings-close'){void closePlaylistSettings();return;}
  if(action==='binding-open'){void openBinding();return;}
  if(action==='binding-refresh'){const form=dialog.querySelector('[data-lm-form=binding-create]');if(!binding||!form)return;const values=new FormData(form);binding.operationId=crypto.randomUUID();void bindingChoices(values.get('classId')||'',dialogGeneration,values);return;}
  if(action==='companion-open'){void openCompanion(b.dataset.asset);return;}
  if(action==='companion-cancel'){if(dirty&&!window.confirm('Discard unfinished processed-content changes?'))return;companionEditor=null;dialog.querySelector('[data-lm-companion-editor]').replaceChildren();syncDirty();return;}
  if(action==='companion-publish'){void publishCompanion();return;}
  if(action==='publish'){if(dirty){modalMessage('Save your changes privately before publishing.',true);return;}const form=dialog.querySelector('[data-lm-form=lesson]');void saveLesson(form,'PUBLISHED');return;}
  if(action==='hide-media'){if(dirty){modalMessage('Save your changes before hiding this media.',true);return;}void saveLesson(dialog.querySelector('[data-lm-form=lesson]'),'HIDDEN');return;}
  if(action==='management-current'){if(!close())return;managementDate='';recordingView={};void load({force:true});return;}
  if(action==='context-open'){void openRecordedContext();return;}
  if(action==='context-cancel'){if(contextUnfinished()&&!window.confirm('Discard your unfinished one-day correction?'))return;dialog.querySelector('[data-lm-context]').replaceChildren();syncDirty();modalMessage('');return;}
  if(action==='context-reset'){void saveRecordedContext(b.closest('[data-lm-form=context]'),true);return;}
  if(action==='native-playlist-open'){recordingView={group:JSON.stringify(['playlist',activityKey,b.dataset.id])};rememberRecordingView(b.dataset.id);void nativeReader.open({activityKey,playlistId:b.dataset.id,limit:30});return;}
  if(action==='native-playlist-more'){void nativeReader.loadList({activityKey,limit:50,before:nativeReader.state().catalogue.before},{more:true});return;}
  if(action==='native-recordings-more'){const selected=nativeReader.state().selected;void nativeReader.open({activityKey,playlistId:selected.playlist.id,limit:30,before:selected.before},{more:true});return;}
  if(action==='recording-group'){recordingView={group:b.dataset.group};rememberRecordingView(null);render();return;}
  if(action==='recording-groups'){recordingView={};nativeReader?.back();rememberRecordingView(null);render();return;}
  if(action==='recording-list'){delete recordingView.lesson;rememberRecordingView();render();return;}
  if(action==='recording-tab'){recordingView.tab=b.dataset.tab==='read'?'read':'listen';rememberRecordingView();const detail=host.querySelector('.lm-recording-detail');if(detail){detail.dataset.mode=recordingView.tab;for(const tab of detail.querySelectorAll('[data-lm=recording-tab]'))tab.setAttribute('aria-current',tab.dataset.tab===recordingView.tab?'page':'false');if(recordingView.tab==='listen'&&recordingView.lesson){const [id,assetId]=JSON.parse(recordingView.lesson),row=currentMediaRows().find(row=>row.id===id),mount=host.querySelector('[data-lm-recording-player]');if(row&&!mount?.firstElementChild)void recordingPlayback(row,assetId,mount,{play:false}).catch(error=>{if(active()&&mount?.isConnected)mount.textContent=error.message;});}}else render();return;}
  if(action==='recording-read'){recordingView.tab='read';void recordingPage(currentMediaRows().find(r=>r.id===b.dataset.id),{assetId:b.dataset.asset,remember:true});return;}
  if(action==='recording-lesson'){void recordingPage(currentMediaRows().find(r=>r.id===b.dataset.id),{play:true,assetId:b.dataset.asset,remember:true});return;}
  if(action==='recording-play'||action==='recording-seek'){const lesson=currentMediaRows().find(r=>r.id===b.dataset.id),start=Number(b.dataset.start)||0;if(lesson&&Number.isInteger(start)&&start>=0&&start<=86400)void recordingPlayback(lesson,b.dataset.asset,host.querySelector('[data-lm-recording-player]'),{start}).catch(e=>{const mount=host?.querySelector('[data-lm-recording-player]');if(active()&&mount)mount.textContent=e.message;});return;}
  if(action==='chat-soon'){modal('Chat coming soon','<p>Lesson chat is coming soon.</p>');return;}
  if(action==='rail-previous'||action==='rail-next'){const rail=host.querySelector('.lm-media-rail');rail?.scrollBy({left:(action==='rail-next'?1:-1)*rail.clientWidth,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});return;}
  if(action==='more'&&data?.before)void load({more:true});
  if(action==='calendar-session')void selectSession(data?.sessions.find(row=>row.sessionKey===b.dataset.key));
  if(action==='refresh'){const g=generation,id=nativeReader?.state().selected?.playlist.id;void load({force:true}).then(async()=>{if(!active(g)||data?.kind!=='PROGRAM')return;await nativeReaderReady;await nativeReader.loadList({activityKey,limit:50},{force:true});if(active(g)&&id)await nativeReader.open({activityKey,playlistId:id,limit:30});});}
  if(action==='note-withdraw'&&noteContext&&window.confirm(b.dataset.scope==='RECURRING'?'Withdraw this PDF from every occurrence of this session? Its previous files remain in history.':'Withdraw this PDF note? Its previous file remains in history.')){void(async()=>{try{if(noteContext.media?.canCurateNotes){await mutate('note-withdraw',{operationId:crypto.randomUUID(),noteId:b.dataset.note,revision:Number(b.dataset.revision)});return;}const option=await noteOptions();await mutate('note-withdraw',{operationId:crypto.randomUUID(),noteId:b.dataset.note,revision:Number(b.dataset.revision),sessionKey:option.session.sessionKey,sessionVersion:option.session.sessionVersion,startDate:option.session.date,endDate:option.session.date,runId:option.session.runId});}catch(e){modalMessage(e.message,true);}})();}
  if(action==='course-files'){const row=data?.courseFiles?.media;if(row)void edit(row);else if(data?.courseFiles?.canManage){const dg=modal('Course PDFs','<p>Opening Course PDFs…</p>');if(dg!==null)void mutate('course-files-create',{operationId:crypto.randomUUID()});}}
  if(action==='retain-recording'&&editor){void mutate('video-retain',{lessonId:editor.lesson.id,assetId:b.dataset.asset,revision:editor.lesson.revision,operationId:crypto.randomUUID()});return;}
  if(action==='mp4-add'&&editor){const form=dialog.querySelector('[data-lm-form=video-upload]');form.hidden=false;form.querySelector('[name=file]').focus();}
  if(action==='mp4-cancel'){const form=dialog.querySelector('[data-lm-form=video-upload]');form.reset();form.hidden=true;delete form.dataset.changed;syncDirty();}
  if(action==='recording-remove'&&editor){b.closest('[data-lm-recording]')?.remove();dirty=true;dialog.querySelector('[data-lm-form=lesson]').dataset.changed='true';}
  if(action==='pdf-add'&&editor){const form=dialog.querySelector('[data-lm-form=upload]');form.hidden=false;form.querySelector('[name=file]').focus();}
  if(action==='upload-cancel'){const form=dialog.querySelector('[data-lm-form=upload]');form.reset();form.hidden=true;delete form.dataset.changed;syncDirty();}
  if(action==='video-add'&&editor){const list=dialog.querySelector('[data-lm-videos]');if((list?.children.length||0)+(dialog.querySelector('[data-lm-recordings]')?.children.length||0)>=10){modalMessage('Use up to ten videos per session.',true);return;}list?.insertAdjacentHTML('beforeend',videoEditorRow());dirty=true;dialog.querySelector('[data-lm-form=lesson]').dataset.changed='true';list.lastElementChild.querySelector('input').focus();}
  if(action==='video-remove'&&editor){b.closest('[data-lm-video]')?.remove();dirty=true;dialog.querySelector('[data-lm-form=lesson]').dataset.changed='true';}
  if(action==='watch'&&row)void watch(row,b.dataset.asset);if(action==='pdf'&&row)void pdf(row,b.dataset.asset);if(action==='discussion'&&row)void openDiscussion(row);
  if(action==='remove'&&editor){b.closest('[data-lm-pdf]')?.remove();dirty=true;dialog.querySelector('[data-lm-form=lesson]').dataset.changed='true';}
  if(action==='comments-refresh'&&(!dirty||window.confirm('Discard your unfinished comment and refresh?'))){dirty=false;void loadComments();}
  if(action==='comment-cancel'){delete discussion.editing;delete discussion.parentId;dirty=false;renderComments();}
  if(['reply','comment-edit'].includes(action)){const c=discussion.comments.find(c=>c.id===b.dataset.comment),form=dialog.querySelector('[data-lm-form=comment]');if(!c||!form)return;delete discussion.editing;delete discussion.parentId;if(action==='reply')discussion.parentId=c.id;else discussion.editing=c;form.querySelector('textarea').value=action==='reply'?'':c.body;form.querySelector('[data-lm-comment-label]').textContent=action==='reply'?'Reply to '+c.name:'Edit your comment';form.querySelector('[data-lm=comment-cancel]').hidden=false;form.querySelector('textarea').focus();}
  if(action==='moderate'){const c=discussion.comments.find(c=>c.id===b.dataset.comment);if(!c)return;if(b.dataset.decision==='DELETE'&&!window.confirm('Remove this comment?'))return;void mutate('comment-moderate',{operationId:crypto.randomUUID(),lessonId:discussion.row.id,commentId:c.id,revision:c.revision,decision:b.dataset.decision});}
  if(action==='retry'&&retry)void retry();
 }
 function reset(){if(playlistSettingsOpen)window.M4L_ACADEMY_PLAYLISTS?.unmount?.();playlistSettingsOpen=false;window.M4L_ACADEMY_PLAYLISTS?.cancelRecording?.();mediaHistoryNonce=crypto.randomUUID();nativeReader?.clear();managementDate='';for(const video of host?.querySelectorAll('video')||[])video.pause();recordingView={};clearTimeout(expiryTimer);expiryTimer=null;generation++;calendarRequest++;calendarLoading=false;calendarError='';cacheScope=null;close(true);if(host){host.removeEventListener('click',handleClick);host.removeEventListener('submit',handleSubmit);host.replaceChildren();host.classList.remove('lm-calendar','lm-rails');host.hidden=true;}host=null;session='';data=null;}
 window.M4L_LESSON_MEDIA={async manage({hostId,activityKey:key,lessonId}){
  if(!canLeaveMedia())return;reset();host=document.getElementById(hostId);if(!host||!token())return;
  activityKey=key;session=token();context=workspace();data={sessions:[],lessons:[]};learnerView=false;runId='';
  await edit({id:lessonId,title:'Lesson media'});
 },canLeave:canLeaveMedia,canLeaveEditor,reset,openAttachment({hostId,lesson,kind}){
  const target=document.getElementById(hostId);
  if(!target||!token()||!lesson||!['YOUTUBE','MP4','PDF'].includes(kind)||!lesson.assets?.length||!canLeaveMedia())return;
  reset();host=target;session=token();context=workspace();activityKey=lesson.activityKey;learnerView=true;data={lessons:[lesson]};
  const assets=lesson.assets.filter(asset=>kind==='PDF'?asset.kind==='PDF':isVideo(asset)&&!videoExpired(asset));
  if(assets.length===1){void (kind==='PDF'?pdf(lesson,assets[0].id):watch(lesson,assets[0].id));return;}
  modal(lesson.title,`<div class="lm-actions">${assets.map((asset,index)=>`<button type="button" class="button secondary" data-lm="${kind==='PDF'?'pdf':'watch'}" data-id="${esc(lesson.id)}" data-asset="${esc(asset.id)}">${kind==='PDF'?'▤':'▶'} ${esc(assetName(asset))}</button>`).join('')}</div>`);
 },open({hostId,activityKey:key,programId,runId:offering='',learnerView:asLearner=false,legacy=false}){
  key=key||(programId?'PROGRAM:'+programId:'');
  if(!/^(PROGRAM|COURSE):[^:]+$/.test(key)||!token()){reset();return;}
  const target=document.getElementById(hostId);if(!target||!canLeaveMedia())return;
  if(host===target&&session===token()&&learnerView===asLearner&&activityKey===key&&runId===offering&&context===workspace()){host.hidden=false;void load();return;}
  reset();activityKey=key;runId=offering;learnerView=asLearner;host=target;session=token();context=workspace();host.hidden=false;host.classList.add('lm-calendar','lm-rails');host.addEventListener('click',handleClick);host.addEventListener('submit',handleSubmit);
  const stamp=generation;
  if(!asLearner&&!legacy&&(window.M4L_ACADEMY_WORKSPACE?.current()||'ADMIN')==='ADMIN'){
   host.innerHTML='<p role="status">Opening the current media workspace…</p>';
   void (window.M4L_MONTHLY_MEDIA_ENTRY?Promise.resolve(window.M4L_MONTHLY_MEDIA_ENTRY):import('./m4l-monthly-media-entry.mjs')).then(({studioMonthlyMedia})=>studioMonthlyMedia(target,key,{current:()=>active(stamp),onHistorical:container=>{target.removeEventListener('click',handleClick);target.removeEventListener('submit',handleSubmit);host=null;const legacyHost=document.createElement('section');legacyHost.id=target.id+'-historical';container.append(legacyHost);window.M4L_LESSON_MEDIA.open({hostId:legacyHost.id,activityKey:key,learnerView:true,legacy:true});}})).then(handled=>{if(!handled&&active(stamp)){render();void start();}}).catch(error=>{if(active(stamp)){host.innerHTML='<p role="alert">'+esc(error.message)+'</p><button type="button" class="button secondary" data-lm-owner-retry>Try again</button>';host.querySelector('[data-lm-owner-retry]').onclick=()=>{reset();window.M4L_LESSON_MEDIA.open({hostId,activityKey:key,runId:offering,learnerView:asLearner});};}});
  }else{render();void start();}
 }};
 document.addEventListener('input',e=>{const form=e.target.closest('[data-lm-form=lesson],.lm-asset-name-form');if(form)form.dataset.changed='true';});
 window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
 window.addEventListener('m4l-academy-session',reset);window.addEventListener('m4l-academy-session-ended',reset);window.addEventListener('storage',e=>{if(e.key==='m4l_account_token'||e.key===null)reset();});window.addEventListener('pagehide',reset);
})();
