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
 let stopped=false,feed=null,weekStart='',schedule=[],scheduleRequest=0,assessmentLoading=null,assessmentOpen=false,assessmentRequest=0,fetching=false;
 const blobs=new Set(),controller=new AbortController();
 window.KAHF_EXTRA_VIEWS=['assessments'];
 function active(){return !stopped&&owner===token()&&Boolean(owner);}
 function end(message='Your Academy account has changed. Open the course again from your dashboard.'){
  stopped=true;controller.abort();window.M4L_LESSON_MEDIA?.reset();window.M4L_ACADEMY_ASSESSMENTS?.reset();
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  document.body.classList.add('course-loading');$('main').replaceChildren();$('sidebar-contents').replaceChildren();$('dialog-contents').replaceChildren();
  window.KAHF_LESSONS=null;window.KAHF_STORAGE_SCOPE=null;feed=null;schedule=[];
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
 const addDays=(date,days)=>new Date(isoDate(date).getTime()+days*86400000).toISOString().slice(0,10);
 const dateLabel=date=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(isoDate(date));
 function assetsHTML(media){return (media?.assets||[]).filter(a=>['PDF','YOUTUBE','MP4'].includes(a.kind)).map(a=>{
  const expired=a.kind==='MP4'&&(a.expired||Date.parse(a.expiresAt)<=Date.now());
  return `<button type="button" class="subtle-button portal-attachment" data-attachment="${escape(a.id)}" data-lesson="${escape(media.id)}" ${expired?'disabled':''}>${a.kind==='PDF'?'▤':'▷'} ${escape(a.name||a.filename||(a.kind==='PDF'?'Lesson notes':'Recording'))}${expired?' · Expired':''}</button>`;
 }).join('');}
 function renderMaterials(){
  const rows=feed.sessions||[];
  $('live-sessions').innerHTML=rows.map(row=>`<article class="session-card portal-session"><div class="session-details"><span class="eyebrow">${escape(dateLabel(row.date))}${row.startTime?' · '+escape(row.startTime):''}</span><h2>${escape(row.title||feed.activityName)}</h2>${row.teacherName?`<p>${escape(row.teacherName)}</p>`:''}${row.media?.summary?`<p>${escape(row.media.summary)}</p>`:''}<div class="portal-file-list">${assetsHTML(row.media)||'<span class="session-availability">Materials will appear here when published.</span>'}</div></div></article>`).join('')||'<p class="info-note">No recordings or session notes have been published yet.</p>';
  $('live-course-files').innerHTML=assetsHTML(feed.courseFiles?.media)||'<p>No additional course files are available.</p>';
  $('earlier-materials').hidden=!feed.before;
  $('materials-status').textContent='';
  $('session-timezone').textContent='Session times: '+(feed.timezone||'Africa/Johannesburg').replaceAll('_',' ');
 }
 async function loadMaterials(more=false){
  if(fetching||!active())return;fetching=true;$('materials-status').textContent='Updating your course…';
  try{
   await boundary?.readyPublication(true);
   let next=await request('academy/lesson-media/feed',{activityKey,view:'learner',includeCourseCompanion:true,...(more?{before:feed.before}:{})});
   if(more&&feed.cacheRevision!==next.cacheRevision)next=await request('academy/lesson-media/feed',{activityKey,view:'learner',includeCourseCompanion:true});
   if(!next.courseCompanion){end('These course readings are not currently published. Return to your dashboard for help.');return;}
   if(more&&feed.cacheRevision===next.cacheRevision){next.sessions=[...new Map([...feed.sessions,...next.sessions].map(r=>[r.sessionKey,r])).values()];next.lessons=[...new Map([...feed.lessons,...next.lessons].map(r=>[r.id,r])).values()];}
   feed=next;renderMaterials();
  }catch(error){if(active())$('materials-status').textContent=error.message;}
  finally{fetching=false;}
 }
 function renderSchedule(){
  $('week-label').textContent=dateLabel(weekStart)+' – '+dateLabel(addDays(weekStart,6));
  $('live-timetable').innerHTML=schedule.map((row,index)=>{
   const opens=row.status==='SCHEDULED'&&row.joinKey&&Date.now()>=row.joinAvailableAt&&Date.now()<row.endsAt;
   const status=row.status!=='SCHEDULED'?(row.holidayName||row.status):Date.now()>=row.endsAt?'Session ended':row.joinKey?'Joining opens five minutes before the session.':'Joining is unavailable for this session.';
   return `<article class="session-card portal-session"><div class="session-details"><span class="eyebrow">${escape(dateLabel(row.date))}</span><h2>${escape(row.title||row.activityName)}</h2><p>${escape(row.startTime)}–${escape(row.endTime)} · ${escape(row.timezone||feed.timezone||'SAST')}</p>${row.teacherName?`<p>${escape(row.teacherName)}</p>`:''}${opens?`<button class="button button-primary" data-join-session="${index}">Join session ↗</button>`:`<span class="session-availability">${escape(status)}</span>`}</div></article>`;
  }).join('')||'<p class="info-note">No sessions have been published for this week.</p>';
 }
 async function loadSchedule(start=''){
  const id=++scheduleRequest;$('live-timetable').textContent='Opening your timetable…';
  try{
   const data=await request('academy/entrance',{id:course,...(start?{startDate:start}:{})});
   if(id!==scheduleRequest)return;
   if(!data.signedIn||!data.activity||data.activity.kind!=='COURSE'||data.activity.id!==course||data.activity.unavailable){$('live-timetable').textContent='Your timetable is temporarily unavailable.';return;}
   weekStart=data.startDate;schedule=(data.personalTimetable||[]).filter(row=>row.kind==='COURSE'&&row.activityId===course);renderSchedule();
  }catch(error){if(active()&&id===scheduleRequest)$('live-timetable').textContent=error.message;}
 }
 async function join(index,button){
  const row=schedule[index];if(!row?.joinKey||button.disabled)return;
  const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;button.disabled=true;
  try{const data=await request('academy/lesson/join',{joinKey:row.joinKey,date:row.sourceDate||row.date});const url=new URL(data.joinUrl);if(url.protocol!=='https:')throw Error('The session link is unavailable.');if(popup)popup.location.replace(url.href);else{$('materials-status').innerHTML=`<a class="button button-primary" href="${escape(url.href)}" target="_blank" rel="noopener">Open your session ↗</a>`;}}
  catch(error){popup?.close();if(active()){$('materials-status').textContent=error.message;renderSchedule();}}
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
  if(!link.hasAttribute('download')){openAttachment(media,assetId);return;}
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
   assessmentLoading??=(async()=>{for(const src of ['/js/vendor/pdf-lib-1.17.1.min.js?v=106.82','/js/m4l-assessment-reports.js?v=107.89','/js/m4l-assessment-register.js?v=107.89','/js/m4l-imtihaan-export.js?v=107.89','/js/m4l-academy-assessments.js?v=107.89'])await loadScript(src);})();
   await assessmentLoading;if(!active()||location.hash!=='#assessments'||requestId!==assessmentRequest)return;
   assessmentOpen=true;$('view-assessments').classList.add('active');
   await window.M4L_ACADEMY_ASSESSMENTS.open({hostId:'kahf-assessments',view:boundary?.audience()==='TEACH'?'teacher':'learner',activityKey,kind:''});
  }catch(error){assessmentLoading=null;if(active())host.textContent=error.message;}
 }
 window.KAHF_CAN_NAVIGATE=()=>!stopped&&window.M4L_LESSON_MEDIA.canLeave()&&(!assessmentOpen||window.M4L_ACADEMY_ASSESSMENTS.canLeave());
 window.addEventListener('kahf-view',event=>{
  if(event.detail.route==='assessments')void assessments();
  else {assessmentRequest++;if(assessmentOpen){window.M4L_ACADEMY_ASSESSMENTS.reset();assessmentOpen=false;$('view-assessments').classList.remove('active');}}
  if(event.detail.route==='sessions'&&weekStart)renderSchedule();
 });
 document.addEventListener('click',event=>{
  const pdf=event.target.closest('[data-course-pdf]');if(pdf){event.preventDefault();if(pdf.getAttribute('aria-busy')!=='true')void coursePDF(pdf);return;}
  const attachment=event.target.closest('[data-attachment]');if(attachment){openAttachment(findMedia(attachment.dataset.lesson),attachment.dataset.attachment);return;}
  const button=event.target.closest('[data-join-session]');if(button)void join(Number(button.dataset.joinSession),button);
 });
 $('refresh-materials').addEventListener('click',()=>{void loadMaterials();void loadSchedule(weekStart);});
 $('earlier-materials').addEventListener('click',()=>void loadMaterials(true));
 $('week-previous').addEventListener('click',()=>{if(weekStart)void loadSchedule(addDays(weekStart,-7));});
 $('week-next').addEventListener('click',()=>{if(weekStart)void loadSchedule(addDays(weekStart,7));});
 window.addEventListener('m4l-academy-session',()=>end());window.addEventListener('m4l-academy-session-ended',()=>{if(!stopped)end('Your Academy session has ended. Please sign in again.');});
 window.addEventListener('storage',event=>{if((event.key==='m4l_account_token'||event.key===null)&&owner!==token())end();});
 window.addEventListener('pageshow',event=>{if(event.persisted){end('Reopening your course securely…');location.reload();}});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&feed&&active())void loadMaterials();});
 async function start(){
  if(!owner){end('Sign in through your Academy dashboard to open this course.');return;}
  if(!course||course.length>160||course.includes(':')){end('Open this course from your Academy dashboard.');return;}
  try{
   await boundary?.readyPublication();
   feed=await request('academy/lesson-media/feed',{activityKey,view:'learner',includeCourseCompanion:true});
   const content=feed.courseCompanion;
   if(!content?.lessons?.length||!content.readerKey){end('These course readings are not currently published. Return to your dashboard for help.');return;}
   window.KAHF_LESSONS=content.lessons;window.KAHF_STORAGE_SCOPE=content.readerKey;
   document.querySelectorAll('[data-dashboard]').forEach(a=>a.href=boundary?.homeUrl()||'/academy/');
   renderMaterials();document.body.classList.remove('course-loading');window.dispatchEvent(new Event('kahf-course-ready'));void loadSchedule();
  }catch(error){if(!stopped)end(error.message||'Your course is temporarily unavailable.');}
 }
 void start();
})();
