/* One native Admin access workspace. Catalogue metadata never grants access. */
(()=>{'use strict';
 const areas={tafseer:{title:'Tafseer and Tadabbur',kind:'MONTHLY LEARNING',help:'Review paid months, original class and additional Surah websites.'},mothers:{title:'Mothers of the Ummah',kind:'MONTHLY LEARNING',help:'Review monthly subscriptions and independent playlists separately from live participation.'},courses:{title:'Courses',kind:'COURSE LEARNING',help:'Grant access to the full course. Existing purchases remain when participation ends.'}};
 const token=()=>localStorage.getItem('m4l_account_token')||'';let active=null;
 const markup=`<div class="circles-access-page"><div class="access-layout"><nav class="access-areas" aria-label="Learning areas"><p class="eyebrow">LEARNING AREAS</p><button type="button" data-area="tafseer" aria-pressed="true"><span>Tafseer & Tadabbur</span><small>Student matrix and Surah table</small></button><button type="button" data-area="mothers" aria-pressed="false"><span>Mothers of the Ummah</span><small>Student monthly matrix</small></button><button type="button" data-area="courses" aria-pressed="false"><span>Courses</span><small>Course purchases and access</small></button><p class="access-guidance">Participation and learning materials are separate. Ending participation keeps acquired materials.</p></nav><section class="access-workspace" aria-labelledby="access-area-title"><header class="area-heading"><div><p class="eyebrow" id="access-area-kind"></p><h2 id="access-area-title"></h2><p id="access-area-help"></p></div><span class="access-category-mark" aria-hidden="true">◇</span></header><label id="access-offering-label" class="access-offering-label">Choose a course<select id="access-offering"></select></label><div class="access-catalogue-pages" hidden><button type="button" data-catalogue-page="previous">Previous courses</button><span data-catalogue-page-label></span><button type="button" data-catalogue-page="next">Next courses</button></div><p id="access-page-status" role="status" aria-live="polite"></p><section id="access-panel" aria-label="Learner access records"></section></section></div></div>`;
 function stylesheet(href){if(!document.querySelector('link[href="'+href+'"]')){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);}}
 const canLeave=()=>window.M4L_STUDIO_ACCESS?.canLeave()!==false&&window.M4L_PROGRAM_MONTHLY?.canLeave()!==false&&window.M4L_PROGRAM_SURAHS?.canLeave()!==false&&window.M4L_MOU_PLAYLISTS?.canLeave()!==false;
 function clearEditors(retainParticipants=false){if(!retainParticipants)window.M4L_STUDIO_ACCESS?.reset();window.M4L_PROGRAM_MONTHLY?.unmount();window.M4L_PROGRAM_SURAHS?.unmount();window.M4L_MOU_PLAYLISTS?.unmount();}
 function reset(retainParticipants=false){const retain=retainParticipants||active?.retainParticipants;if(active){active.closed=true;active.generation++;active.host.replaceChildren();active.pages.clear();active=null;}clearEditors(retain);}
 async function open(host,{area='tafseer',selection='',retainParticipants=false}={}){
  if(!host)return;if(active?.host===host&&!active.closed)return active.ready;
  if(!canLeave())return false;reset(retainParticipants);
  stylesheet('/css/m4l-program-monthly-subscriptions.css');stylesheet('/css/m4l-circles-access.css');stylesheet('/academy/course-websites/assets/fonts.css');host.innerHTML=markup;
  const s={host,owner:token(),generation:0,closed:false,retainParticipants,area,selection,busy:false,pages:new Map()};active=s;
  const $=selector=>host.querySelector(selector),status=$('#access-page-status'),panelHost=$('#access-panel'),picker=$('#access-offering'),buttons=[...host.querySelectorAll('button[data-area]')];
  const current=()=>!s.closed&&s===active&&s.owner===token()&&host.isConnected;
  const tell=message=>{status.textContent=message;};
  const canChange=()=>{if(s.busy){tell('Checking available learning areas…');return false;}if(canLeave())return true;tell('Save or discard the current changes before choosing another learning area or course.');return false;};
  const locked=message=>{s.closed=true;s.generation++;clearEditors(s.retainParticipants);panelHost.replaceChildren();picker.replaceChildren();s.pages.clear();for(const button of buttons)button.disabled=true;tell(message);};
  async function catalogue(area,cursor){
   const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/admin/platform/studio-access',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.owner,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify({command:{action:'catalogue',area,cursor,limit:50}})}),data=await response.json();
   if(!current())return null;
   if(!response.ok||!data.success)throw Object.assign(Error(data.error||'Available learning areas could not be checked.'),{status:response.status});
   if(data.schema!=='STUDIO_ACCESS_CATALOGUE_V1'||!Array.isArray(data.items)||data.items.length>50||data.items.some(row=>row.area!==area||typeof row.activityKey!=='string'||!row.activityKey.startsWith(area==='courses'?'COURSE:':'PROGRAM:')||!/^[-A-Za-z0-9_:]{1,180}$/.test(row.activityKey)||typeof row.offeringId!=='string'||typeof row.title!=='string'||row.title.length>200||!['ACADEMY','FROZEN','STUDIO'].includes(row.ownership)||typeof row.enabled!=='boolean')||new Set(data.items.map(row=>row.activityKey.toLowerCase())).size!==data.items.length||typeof data.more!=='boolean'||data.more&&(typeof data.nextCursor!=='string'||!/^[-A-Za-z0-9_:]{1,180}$/.test(data.nextCursor)||data.nextCursor.toLowerCase()===cursor.toLowerCase()))throw Error('Available learning areas could not be checked.');
   return data;
  }
  async function showPersonEditor(row){
   clearEditors(s.retainParticipants);panelHost.replaceChildren();delete panelHost.dataset.kind;panelHost.dataset.area=s.area;
   if(!row)return;
   if(!row.enabled||row.ownership==='FROZEN'||row.ownership==='ACADEMY'&&s.area==='courses'){
    const note=document.createElement('div');note.className='access-availability';
    const text=document.createElement('p');text.textContent=!row.enabled||row.ownership==='FROZEN'?'Access management is temporarily unavailable for this learning area. Its current permissions are unchanged.':'This programme’s access is managed in its existing Participants page.';note.append(text);
    if(row.enabled&&row.ownership==='ACADEMY'){const link=document.createElement('a');link.href=row.activityKey.startsWith('COURSE:')?'/academy/courses/manage/?course='+encodeURIComponent(row.activityKey.slice(7))+'&tab=participants':'/programs/?program='+encodeURIComponent(row.activityKey.slice(8))+'&tab=participants';link.textContent='Open Participants';note.append(link);}panelHost.append(note);return;
   }
   if(s.area!=='courses'||row.ownership==='STUDIO'){
    const tabs=document.createElement('nav');tabs.className='access-table-tabs';tabs.setAttribute('aria-label','Access tables');
    const views=s.area==='courses'?[['additional','Participants'],['playlists','Playlists']]:[['matrix','Student matrix'],...(row.ownership==='STUDIO'?[['playlists',s.area==='tafseer'?'Surahs':'Playlists']]:s.area==='tafseer'?[['surahs','Surah table']]:[]),...(row.ownership==='STUDIO'&&!s.retainParticipants?[['additional','Other access']]:[])];
    const body=document.createElement('section');body.className='access-table-body';panelHost.append(tabs,body);
    async function transport(action,input={}){
     const isStudio=row.ownership==='STUDIO',mapped={'grid':'monthly-grid','grid-save':'monthly-grid-save','surahs':'access-table','surah-save':'access-table-save'};
     const path=isStudio?'/api/admin/platform/studio-access':'/api/admin/platform/program-monthly-subscriptions/'+action;
     const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.owner,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify({activityKey:row.activityKey,...(isStudio?{command:{...input,action:mapped[action]||action}}:input)})}),result=await response.json();
     if(!current())throw Error('Your account changed. Reopen Access management.');
     if(!response.ok||!result.success)throw Object.assign(Error(result.error||'Access records could not be checked.'),{status:response.status,code:result.code});return result;
    }
    async function view(name){
     if(!current()||!canLeave())return false;clearEditors(s.retainParticipants);body.replaceChildren();
     for(const button of tabs.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.accessView===name));
     if(name==='matrix')await window.M4L_PROGRAM_MONTHLY.mount(body,row.activityKey.slice(8),{transport,label:areas[s.area].title,...(s.area==='mothers'?{description:'Paid months unlock open playlists during that month and completed playlists closed in that month. Existing historical recording rights remain unchanged.'}:{})});
     else if(name==='playlists'){const cards=await import('./m4l-playlist-card.mjs');cards.ensurePlaylistCardStyles(document,'/css/m4l-playlist-card.css');const uploads=new Map(),upload=async({playlistId,file,image,revision})=>{if(!current())throw Error('Your account changed.');const bytes=new Uint8Array(await file.arrayBuffer());if(!current())throw Error('Your account changed.');let encoded='';for(let i=0;i<bytes.length;i+=8192)encoded+=String.fromCharCode(...bytes.subarray(i,i+8192));const listing=window.M4L_RECORDING_PLAYLISTS?.currentRevision?.();const key=JSON.stringify([playlistId,image.sha256]);let command=uploads.get(key);if(!command){command={action:'mou-playlist-cover-upload',operationId:crypto.randomUUID(),playlistId,revision:revision??listing,type:image.type,sha256:image.sha256,data:btoa(encoded)};uploads.set(key,command);}const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/admin/platform/studio-access/playlist-cover',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.owner,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify({activityKey:row.activityKey,command})}),result=await response.json();if(!current())throw Error('Your account changed.');if(!response.ok||!result.success){if(response.status<500)uploads.delete(key);throw Object.assign(Error(result.error||'The card picture could not be uploaded.'),{status:response.status,code:result.code});}uploads.delete(key);return result;};const preview=async({playlistId,image})=>{const result=await transport('mou-playlist-cover-preview',{playlistId,assetId:image.assetId});const bytes=Uint8Array.from(atob(result.data),c=>c.charCodeAt(0));return new Blob([bytes],{type:result.image.type});};await (window.M4L_RECORDING_PLAYLISTS||window.M4L_MOU_PLAYLISTS).mount(body,{cardTools:cards,cardKind:s.area==='tafseer'?'TAFSEER':s.area==='courses'?'COURSE':'PROGRAM',cardUpload:upload,cardPreview:preview,cardTeacher:true,loadCardTeachers:()=>transport('mou-playlist-card-options'),cardPrepareImage:file=>cards.optimiseCardPicture(file),transport:command=>transport(command.action,command),label:s.area==='tafseer'?'Surah playlists':s.area==='courses'?'Course playlists':'MOU playlists',itemLabel:s.area==='tafseer'?'Surah':'playlist',accessModel:s.area==='courses'?'COURSE':'MONTHLY',...(s.area!=='courses'?{purpose:'access',allowCreate:false}:{}),...(s.area==='tafseer'?{onLegacy:()=>view('surahs')}:{})});}
     else if(name==='surahs'){if(row.ownership==='STUDIO'){const back=document.createElement('button');back.type='button';back.textContent='Back to Surah playlists';back.onclick=()=>view('playlists');body.append(back);}await window.M4L_PROGRAM_SURAHS.mount(body,row.activityKey.slice(8),{transport,accessOnly:s.retainParticipants});}
     else {const editor=window.M4L_STUDIO_ACCESS.attach(body,row.activityKey);await editor?.loading;}
     return true;
    }
    for(const [name,label]of views){const button=document.createElement('button');button.type='button';button.dataset.accessView=name;button.textContent=label;button.setAttribute('aria-pressed','false');button.onclick=()=>view(name);tabs.append(button);}
    await view(s.area==='courses'?'additional':'matrix');return;
   }
   const panel=window.M4L_STUDIO_ACCESS.attach(panelHost,row.activityKey);await panel?.loading;if(current())panelHost.dataset.kind=panel?.data?.kind||'';
  }
  async function choose(area,{cursor,selection}={}){
   if(!current()||!areas[area]||!canChange())return false;
   const previous=s.pages.get(area),after=cursor??previous?.cursor??'',generation=++s.generation;s.busy=true;for(const button of buttons)button.disabled=true;picker.disabled=true;tell('Checking available learning areas…');
   try{
    const data=await catalogue(area,after);if(!data||!current()||generation!==s.generation)return false;
    const history=previous?.history||[];if(after!==previous?.cursor&&previous){if(history.at(-1)===after)history.pop();else history.push(previous.cursor);}
    const selected=data.items.find(row=>row.activityKey===(selection||previous?.selection))||data.items[0];s.area=area;s.selection=selected?.activityKey||'';s.pages.set(area,{...data,cursor:after,selection:s.selection,history});
    for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.area===area));
    $('#access-area-title').textContent=areas[area].title;$('#access-area-kind').textContent=areas[area].kind;$('#access-area-help').textContent=areas[area].help;
    picker.replaceChildren();for(const row of data.items){const option=document.createElement('option');option.value=row.activityKey;option.textContent=row.title;option.selected=row===selected;picker.append(option);}
    $('#access-offering-label').hidden=area!=='courses'&&data.items.length<2;$('#access-offering-label').firstChild.textContent=area==='courses'?'Choose a course':'Programme';
    $('.access-catalogue-pages').hidden=!data.more&&!history.length;$('[data-catalogue-page=previous]').disabled=!history.length;$('[data-catalogue-page=next]').disabled=!data.more;$('[data-catalogue-page-label]').textContent='Page '+(history.length+1);
    for(const direction of ['previous','next'])$('[data-catalogue-page='+direction+']').textContent=(direction==='previous'?'Previous ':'Next ')+(area==='courses'?'courses':'programmes');tell(selected?'':data.more?'No matching learning areas on this page. Continue to the next page.':'No learning areas are available here with your current Admin access.');await showPersonEditor(selected);return true;
   }catch(error){if(current()){panelHost.replaceChildren();picker.replaceChildren();if([401,403].includes(error.status))locked('Your Academy session or Admin access changed. Reopen Access management to continue.');else tell(error.message);}return false;}
   finally{if(current()&&generation===s.generation){s.busy=false;for(const button of buttons)button.disabled=false;picker.disabled=false;}}
  }
  for(const button of buttons)button.onclick=()=>choose(button.dataset.area);
  picker.onchange=async()=>{const selection=picker.value;if(!current()||!canChange()){picker.value=s.selection;return;}const page=s.pages.get(s.area),row=page?.items.find(row=>row.activityKey===selection);if(!row){picker.value=s.selection;return;}s.selection=selection;page.selection=selection;tell('');s.busy=true;picker.disabled=true;for(const button of buttons)button.disabled=true;try{await showPersonEditor(row);}finally{if(current()){s.busy=false;picker.disabled=false;for(const button of buttons)button.disabled=false;}}};
  $('[data-catalogue-page=next]').onclick=()=>choose(s.area,{cursor:s.pages.get(s.area)?.nextCursor});
  $('[data-catalogue-page=previous]').onclick=()=>choose(s.area,{cursor:s.pages.get(s.area)?.history.at(-1)||''});
  if(retainParticipants){$('.access-areas').hidden=true;host.querySelector('.access-layout').style.display='block';}s.locked=locked;s.ready=choose(area,{selection});return s.ready;
 }
 const checkOwner=()=>{if(active&&active.owner!==token())active.locked('Your account changed. Reopen Access management to check the current account.');};
 window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)checkOwner();});window.addEventListener('pageshow',checkOwner);window.addEventListener('focus',checkOwner);document.addEventListener('visibilitychange',checkOwner);
 window.M4L_CIRCLES_ACCESS={open,reset,canLeave};
})();
