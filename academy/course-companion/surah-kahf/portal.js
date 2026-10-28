/* The Academy account and accepted publication remain the access boundary. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const token=()=>{try{return localStorage.getItem('m4l_account_token')||'';}catch{return '';}};
 const boundary=window.M4L_ACADEMY_WORKSPACE;
 const course=new URLSearchParams(location.search).get('course')||'';
 const activityKey='COURSE:'+course;
 const owner=token();
 let stopped=false,feed=null,sessionCards=[],sessionClockTimer,assessmentLoading=null,assessmentOpen=false,assessmentRequest=0,fetching=false;
 const headerJoinButtons=[$('course-join-now'),$('sidebar-join-now')];
 const blobs=new Set(),controller=new AbortController();
 window.KAHF_EXTRA_VIEWS=['assessments'];
 function active(){return !stopped&&owner===token()&&Boolean(owner);}
 function end(message='Your Academy account has changed. Open the course again from your dashboard.'){
  stopped=true;controller.abort();window.M4L_LESSON_MEDIA?.reset();window.M4L_ACADEMY_ASSESSMENTS?.reset();
  clearTimeout(sessionClockTimer);for(const button of headerJoinButtons){button.hidden=true;delete button.dataset.joinSession;}
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  document.body.classList.add('course-loading');$('main').replaceChildren();$('sidebar-contents').replaceChildren();$('dialog-contents').replaceChildren();
  window.KAHF_LESSONS=null;window.KAHF_STORAGE_SCOPE=null;feed=null;sessionCards=[];
  for(const url of blobs)URL.revokeObjectURL(url);blobs.clear();
  $('course-gate-message').textContent=message;
 }
 async function request(path,input={},binary=false){
  if(!active())throw new DOMException('Your Academy account changed.','AbortError');
  const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/'+path,{method:'POST',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+owner},body:JSON.stringify(input)});
  if(!active())throw new DOMException('Your Academy account changed.','AbortError');
  if(binary&&response.ok){const blob=await response.blob();if(!active())throw new DOMException('Account changed.','AbortError');return blob;}
  const data=await response.json();if(!active())throw new DOMException('Account changed.','AbortError');
  if(!response.ok||!data.success){
   if([401,403].includes(response.status)){end(data.error||'Please sign in again to open this course.');if(response.status===401)window.dispatchEvent(new Event('m4l-academy-session-ended'));}
   throw Object.assign(Error(data.error||'Your course is temporarily unavailable.'),{status:response.status});
  }
  return data;
 }
 const isoDate=date=>new Date(date+'T12:00:00Z');
 const dateLabel=date=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(isoDate(date));
 function assetsHTML(media){return (media?.assets||[]).filter(a=>['PDF','YOUTUBE','MP4'].includes(a.kind)).map(a=>{
  const expired=a.kind==='MP4'&&(a.expired||Date.parse(a.expiresAt)<=Date.now());
  return `<button type="button" class="subtle-button portal-attachment${a.kind==='PDF'?'':' portal-recording'}" data-attachment="${escape(a.id)}" data-lesson="${escape(media.id)}" ${expired?'disabled':''}><span class="portal-attachment-icon" aria-hidden="true">${a.kind==='PDF'?'▤':'▷'}</span><span class="portal-attachment-label">${escape(a.name||a.filename||(a.kind==='PDF'?'Lesson notes':'Recording'))}${expired?' · Expired':''}</span></button>`;
 }).join('');}
 function renderMaterials(){
  const schedule=feed.courseCompanion?.schedule?.sessions||[];
  const saved=feed.sessions||[],used=new Set();
  const rows=schedule.map(row=>{
   const matches=saved.filter(media=>row.mediaSessionKey&&media.sessionKey===row.mediaSessionKey);
   matches.forEach(media=>used.add(media));
   return {...row,teacherName:row.teacherName||row.teacherNames?.join(', '),mediaItems:matches.map(row=>row.media).filter(Boolean)};
  });
  for(const row of saved.filter(row=>!used.has(row))){const existing=rows.find(r=>row.sessionKey&&r.sessionKey===row.sessionKey);if(existing){if(row.media)existing.mediaItems.push(row.media);}else rows.push({...row,mediaItems:row.media?[row.media]:[]});}
  sessionCards=rows.sort((a,b)=>a.date.localeCompare(b.date)||(a.startTime||'').localeCompare(b.startTime||''));
  renderSessionCards();
  const courseFiles=feed.courseFiles?.media,pdf=feed.courseCompanion?.pdf;
  const additionalFiles=courseFiles&&{...courseFiles,assets:(courseFiles.assets||[]).filter(a=>courseFiles.id!==pdf?.lessonId||a.id!==pdf?.assetId)};
  $('live-course-files').innerHTML=assetsHTML(additionalFiles)||'<p>No additional course files are available.</p>';
  $('earlier-materials').hidden=!feed.before;
  $('materials-status').textContent='';
  $('session-timezone').textContent='Session times: '+(feed.timezone||'Africa/Johannesburg').replaceAll('_',' ');
 }
 async function loadMaterials(more=false){
  if(fetching||!active())return;fetching=true;$('materials-status').textContent='Updating your course…';
  try{
   await boundary?.readyPublication(true);
   let next=await request('academy/lesson-media/feed',{activityKey,view:'learner',includeCourseCompanion:true,includeCourseSessions:true,...(more?{before:feed.before}:{})});
   if(more&&feed.cacheRevision!==next.cacheRevision)next=await request('academy/lesson-media/feed',{activityKey,view:'learner',includeCourseCompanion:true,includeCourseSessions:true});
   if(next.courseCompanion?.editableWebsite){location.replace('/academy/course-websites/view/?'+new URLSearchParams(location.search).toString()+location.hash);return;}
   if(!next.courseCompanion){end('These course readings are not currently published. Return to your dashboard for help.');return;}
   if(more&&feed.cacheRevision===next.cacheRevision){next.sessions=[...new Map([...feed.sessions,...next.sessions].map(r=>[r.sessionKey,r])).values()];next.lessons=[...new Map([...feed.lessons,...next.lessons].map(r=>[r.id,r])).values()];}
   feed=next;renderMaterials();
  }catch(error){if(active())$('materials-status').textContent=error.message;}
  finally{fetching=false;}
 }
 function renderSessionCards(){
  clearTimeout(sessionClockTimer);if(!active())return;
  const now=Date.now(),parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:feed.timezone||'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(part=>[part.type,part.value]));
  const today=`${parts.year}-${parts.month}-${parts.day}`,clock=`${parts.hour}:${parts.minute}`;
  $('live-sessions').innerHTML=sessionCards.map((row,index)=>{
   const endDate=row.endTime&&row.startTime&&row.endTime<=row.startTime?new Date(isoDate(row.date).getTime()+86400000).toISOString().slice(0,10):row.date;
   const ended=Number.isFinite(row.endsAt)?now>=row.endsAt:endDate<today||endDate===today&&Boolean(row.endTime&&row.endTime<=clock);
   const opens=row.status==='SCHEDULED'&&row.joinKey&&now>=row.joinAvailableAt&&now<row.endsAt;
   const status=!row.status?'':row.status!=='SCHEDULED'?(row.holidayName||row.status):ended?'Session ended':row.joinKey?'Joining opens five minutes before the session.':'Joining is unavailable for this session.';
   const joinAction=opens?`<button class="button button-primary" data-join-session="${index}">Join session ↗</button>`:status?`<span class="session-availability">${escape(status)}</span>`:'';
   const files=row.mediaItems.map(assetsHTML).join('');
   return `<article class="session-card portal-session"><div class="session-details"><span class="eyebrow">SESSION ${String(index+1).padStart(2,'0')}</span><h3><time datetime="${escape(row.date)}">${escape(dateLabel(row.date))}</time></h3><p class="portal-session-title">${escape(row.title||row.activityName||feed.activityName)}</p>${row.startTime&&!ended?`<p class="portal-session-time">${escape(row.startTime)}${row.endTime?'–'+escape(row.endTime):''}</p>`:''}${row.teacherName?`<p>${escape(row.teacherName)}</p>`:''}${joinAction?`<div class="portal-session-status">${joinAction}</div>`:''}${row.mediaItems.map(media=>media.summary?`<p>${escape(media.summary)}</p>`:'').join('')}<div class="portal-file-list" aria-label="Recordings and lesson notes">${files||'<span class="session-availability">Materials will appear here when published.</span>'}</div></div></article>`;
  }).join('')||'<p class="info-note">'+(feed?.courseCompanion?.schedule?.unavailable?'Your course timetable is temporarily unavailable. Please refresh.':'No course sessions or lesson media have been published yet.')+'</p>';
  const liveIndex=sessionCards.findIndex(row=>row.status==='SCHEDULED'&&row.joinKey&&now>=row.startsAt&&now<row.endsAt);
  for(const button of headerJoinButtons){button.hidden=liveIndex<0;if(liveIndex<0)delete button.dataset.joinSession;else button.dataset.joinSession=String(liveIndex);}
  const transitions=sessionCards.filter(row=>row.status==='SCHEDULED').flatMap(row=>[row.endsAt,...(row.joinKey?[row.joinAvailableAt,row.startsAt]:[])]).filter(time=>Number.isFinite(time)&&time>now);
  if(transitions.length&&document.visibilityState==='visible')sessionClockTimer=setTimeout(()=>{if(active()&&document.visibilityState==='visible')renderSessionCards();},Math.min(2147483647,Math.min(...transitions)-now+1));
 }
 async function join(index,button){
  const row=sessionCards[index];if(!row?.joinKey||button.disabled)return;
  const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;button.disabled=true;
  try{const data=await request('academy/lesson/join',{joinKey:row.joinKey,date:row.sourceDate||row.date});const url=new URL(data.joinUrl);if(url.protocol!=='https:')throw Error('The session link is unavailable.');if(popup)popup.location.replace(url.href);else{$('materials-status').innerHTML=`<a class="button button-primary" href="${escape(url.href)}" target="_blank" rel="noopener">Open your session ↗</a>`;}}
  catch(error){popup?.close();if(active()){$('materials-status').textContent=error.message;renderSessionCards();}}
  finally{if(active())button.disabled=false;}
 }
 function findMedia(id){return feed?.courseFiles?.media?.id===id?feed.courseFiles.media:feed?.lessons.find(row=>row.id===id)||feed?.sessions.map(row=>row.media).find(row=>row?.id===id);}
 function openAttachment(media,assetId){
  const asset=media?.assets?.find(a=>a.id===assetId);if(!asset||!active())return;
  window.M4L_LESSON_MEDIA.openAttachment({hostId:'attachment-host',lesson:{...media,activityKey},kind:asset.kind});
 }
 async function coursePDF(link){
  if(!feed?.courseCompanion?.pdf)return;
  const {lessonId,assetId}=feed.courseCompanion.pdf,media=findMedia(lessonId);
  link.setAttribute('aria-busy','true');
  try{
   const blob=await request('academy/lesson-media/download',{activityKey,lessonId,assetId},true);
   const url=URL.createObjectURL(blob);blobs.add(url);const a=document.createElement('a');a.href=url;a.download=media?.assets.find(a=>a.id===assetId)?.filename||'surah-al-kahf-course.pdf';document.body.append(a);a.click();a.remove();
   setTimeout(()=>{URL.revokeObjectURL(url);blobs.delete(url);},10000);
  }catch(error){if(active()){$('materials-status').textContent=error.message;location.hash='#sessions';}}
  finally{link.removeAttribute('aria-busy');}
 }
 function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>{s.remove();reject(Error('Could not open assessments. Please try again.'));};document.head.append(s);});}
 async function assessments(){
  if(assessmentOpen||!active())return;const requestId=++assessmentRequest,host=$('kahf-assessments');host.textContent='Opening assessments…';
  try{
   assessmentLoading??=(async()=>{for(const src of ['/js/vendor/pdf-lib-1.17.1.min.js?v=106.82','/js/m4l-assessment-reports.js?v=107.114','/js/m4l-assessment-register.js?v=107.114','/js/m4l-imtihaan-export.js?v=107.114','/js/m4l-academy-assessments.js?v=107.114'])await loadScript(src);})();
   await assessmentLoading;if(!active()||location.hash!=='#assessments'||requestId!==assessmentRequest)return;
   assessmentOpen=true;$('view-assessments').classList.add('active');
   await window.M4L_ACADEMY_ASSESSMENTS.open({hostId:'kahf-assessments',view:boundary?.audience()==='TEACH'?'teacher':'learner',activityKey,kind:''});
  }catch(error){assessmentLoading=null;if(active())host.textContent=error.message;}
 }
 window.KAHF_CAN_NAVIGATE=()=>!stopped&&window.M4L_LESSON_MEDIA.canLeave()&&(!assessmentOpen||window.M4L_ACADEMY_ASSESSMENTS.canLeave());
 window.addEventListener('kahf-view',event=>{
  if(event.detail.route==='assessments')void assessments();
  else {assessmentRequest++;if(assessmentOpen){window.M4L_ACADEMY_ASSESSMENTS.reset();assessmentOpen=false;$('view-assessments').classList.remove('active');}}
  if(event.detail.route==='sessions')renderSessionCards();
 });
 document.addEventListener('click',event=>{
  const pdf=event.target.closest('[data-course-pdf]');if(pdf){event.preventDefault();if(pdf.getAttribute('aria-busy')!=='true')void coursePDF(pdf);return;}
  const attachment=event.target.closest('[data-attachment]');if(attachment){openAttachment(findMedia(attachment.dataset.lesson),attachment.dataset.attachment);return;}
  const button=event.target.closest('[data-join-session]');if(button)void join(Number(button.dataset.joinSession),button);
 });
 $('refresh-materials').addEventListener('click',()=>void loadMaterials());
 $('earlier-materials').addEventListener('click',()=>void loadMaterials(true));
 window.addEventListener('m4l-academy-session',()=>end());window.addEventListener('m4l-academy-session-ended',()=>{if(!stopped)end('Your Academy session has ended. Please sign in again.');});
 window.addEventListener('storage',event=>{if((event.key==='m4l_account_token'||event.key===null)&&owner!==token())end();});
 window.addEventListener('pageshow',event=>{if(event.persisted){end('Reopening your course securely…');location.reload();}});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&feed&&active())void loadMaterials();});
 async function start(){
  if(!owner){end('Sign in through your Academy dashboard to open this course.');return;}
  if(!course||course.length>160||course.includes(':')){end('Open this course from your Academy dashboard.');return;}
  try{
   await boundary?.readyPublication();
   feed=await request('academy/lesson-media/feed',{activityKey,view:'learner',includeCourseCompanion:true,includeCourseSessions:true});
   const content=feed.courseCompanion;
   if(!content?.lessons?.length||!content.readerKey){end('These course readings are not currently published. Return to your dashboard for help.');return;}
   if(content.editableWebsite){location.replace('/academy/course-websites/view/?'+new URLSearchParams(location.search).toString()+location.hash);return;}
   window.KAHF_LESSONS=content.lessons;window.KAHF_STORAGE_SCOPE=content.readerKey;
   document.querySelectorAll('[data-dashboard]').forEach(a=>a.href=boundary?.homeUrl()||'/academy/');
   renderMaterials();document.body.classList.remove('course-loading');window.dispatchEvent(new Event('kahf-course-ready'));
  }catch(error){if(!stopped)end(error.message||'Your course is temporarily unavailable.');}
 }
 void start();
})();
