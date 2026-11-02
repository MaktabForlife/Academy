(() => {
 'use strict';
 // A hub has one address. Its summary reader follows the verified account's audience.
 // This is a navigation choice only; every request still uses the native server guards.
 let hubAudience='LEARN',hubOwner='';
 const adminPage=()=>/^\/(?:users(?:\/|$)|programs(?:\/(?:$|index\.html|manage\.html|timetable\.html|lesson-media\.html|library\.html))|academy\/(?:admin|subjects|courses\/manage|course-websites(?!\/(?:view|public)(?:\/|$))|enrolment\/manage|library\/manage|pdf-tools)(?:\/|$))/.test(location.pathname);
 function desired(){
  const explicit=location.hash.match(/^#(?:timetable\/(learn|teach)|activity\/[^/]+\/[^/]+\/(learn|teach)(?:\/|$))/);
  if(location.pathname.startsWith('/academy/admin/'))return explicit?'ADMIN_'+(explicit[1]||explicit[2]).toUpperCase():'ADMIN';
  if(adminPage())return 'ADMIN';
  if(explicit)return (explicit[1]||explicit[2]).toUpperCase();
  if(location.hash==='#dashboard')return hubAudience;
  if(/^#(?:administration|assessment-admin|progress-admin)(?:\/|$)/.test(location.hash))return 'ADMIN';
  const query=new URLSearchParams(location.search),mode=(query.get('workspace')||query.get('view')||'').toUpperCase();
  if(['LEARN','TEACH','ADMIN','ADMIN_LEARN','ADMIN_TEACH'].includes(mode))return mode;
  if(location.pathname==='/programs/attendance.html'||location.pathname.startsWith('/academy/teaching/'))return 'TEACH';
  return 'LEARN';
 }
 let selected=desired(),generation=0,head=new URLSearchParams(location.search).get('setup')||null,headRequest=null,headEpoch=0;
 let classView=null;
 try{const q=new URLSearchParams(location.search);if(selected==='ADMIN_LEARN'&&q.get('studentProgram')&&q.get('studentClass'))classView={activityKey:q.get('studentProgram'),classId:q.get('studentClass')};}catch{}
 const classKey=()=>JSON.stringify(classView);
 function studentClass(value){if(selected!=='ADMIN_LEARN')return false;const next=value?{activityKey:value.activityKey,classId:value.classId}:null;if(JSON.stringify(next)===classKey())return false;classView=next;generation++;return true;}
 const session=()=>{try{return localStorage.getItem('m4l_account_token')||'';}catch{return '';}};
 const current=()=>selected;
 const audience=()=>selected.replace(/^ADMIN_/,''),adminRealm=()=>selected==='ADMIN'||selected.startsWith('ADMIN_');
 function commit(){const next=desired();if(next===selected)return false;selected=next;generation++;classView=null;head=null;headRequest=null;return true;}
 function canonical(){
  const adminHost=location.pathname.startsWith('/academy/admin/');
  if(!adminHost&&/^#(?:administration|assessment-admin|progress-admin)(?:\/|$)/.test(location.hash))return '/academy/admin/'+location.hash;
  if(!adminHost&&selected.startsWith('ADMIN_')&&['/academy/','/academy/index.html'].includes(location.pathname))return '/academy/admin/#timetable/'+audience().toLowerCase();
  return '';
 }
 const original=window.fetch.bind(window);
 // This is account/navigation metadata only. Every data read and Admin change
 // still passes the native server's current session, epoch and permission guards.
 const copyAccount=value=>JSON.parse(JSON.stringify(value));
 const accountViewKey='m4l_account_view_v1',accountViewAge=12*60*60*1000;
 let accountView=null,accountRead=null,accountEpoch=0,accountOwner=session();
 function clearAccountView(){accountEpoch++;accountView=null;accountRead=null;try{window.sessionStorage?.removeItem(accountViewKey);}catch{}access=null;}
 function accountExpiry(owner){try{const value=JSON.parse(atob(owner.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return Number.isFinite(value.exp)?value.exp*1000:0;}catch{return 0;}}
 async function accountKey(owner){try{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner)))].map(v=>v.toString(16).padStart(2,'0')).join('');}catch{return '';}}
 async function readAccountSession(owner){
  if(!owner||owner!==session())throw new DOMException('The Academy account changed.','AbortError');
  if(accountOwner!==owner){clearAccountView();accountOwner=owner;}
  if(accountView?.owner===owner&&accountView.until>Date.now())return copyAccount(accountView.data);
  if(accountRead?.owner===owner)return copyAccount(await accountRead.promise);
  const ticket=accountEpoch,pending={owner};accountRead=pending;
  pending.promise=(async()=>{
   const key=typeof crypto==='undefined'||!crypto.subtle?'':await accountKey(owner),active=()=>owner===session()&&ticket===accountEpoch;
   if(!active())throw new DOMException('The Academy account changed.','AbortError');
   if(key)try{const raw=window.sessionStorage?.getItem(accountViewKey),saved=raw&&raw.length<=131072?JSON.parse(raw):null;
    if(saved?.key===key&&saved.at<=Date.now()&&saved.until>Date.now()&&saved.until<=saved.at+accountViewAge&&saved.until<=accountExpiry(owner)&&saved.data?.success&&Array.isArray(saved.data.contexts)){
     accountView={owner,until:saved.until,data:saved.data};return saved.data;
    }
   }catch{}
   const api=new URL(window.M4L_CONFIG?.API_BASE||location.origin,location.href);
   const response=await original(api.origin+'/api/account/session',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+owner,'X-Academy-Workspace':'LEARN'},body:'{}'}),data=await response.json();
   if(!active())throw new DOMException('The Academy account changed.','AbortError');
   if(!response.ok||!data.success||!Array.isArray(data.contexts)){
    clearAccountView();if(response.status===401)window.dispatchEvent(new Event('m4l-academy-session-ended'));
    throw Object.assign(Error(data.error||'Sign in to open Academy.'),{status:response.status,code:data.code});
   }
   // Never duplicate a returned credential in the device metadata copy.
   const safe=Object.fromEntries(['success','account','context','contexts','courseManagement','sessionStore','operationalAccessActive'].filter(k=>data[k]!==undefined).map(k=>[k,data[k]]));
   const at=Date.now(),expires=accountExpiry(owner),until=Math.min(at+accountViewAge,expires||at+60000);
   accountView={owner,until,data:safe};
   if(key&&expires>at)try{const raw=JSON.stringify({key,at,until,data:safe});if(raw.length<=131072)window.sessionStorage?.setItem(accountViewKey,raw);}catch{}
   return safe;
  })();
  try{return copyAccount(await pending.promise);}finally{if(accountRead===pending)accountRead=null;}
 }
 let access=null,accessRequest=null,accessEpoch=0;
 const adminAccess=()=>Boolean(access?.session===session()&&access.admin&&accountView?.until>Date.now());
 const accessChanged=()=>window.dispatchEvent(new Event('m4l-academy-access'));
 function leaveAdmin(){location.replace('/academy/#overview');}
 // A page address requests a workspace; it never proves the account is Admin.
 async function readyAccess(editor=false){
  if((!adminRealm()&&!editor)||!session())return false;
  const owner=session(),epoch=accessEpoch;
  if(access?.session===owner&&accountView?.until>Date.now()){if(!access.admin){if(editor)throw Object.assign(Error('Admin editing is not available for this account.'),{status:403});leaveAdmin();throw new DOMException('Open your personal Academy workspace.','AbortError');}return true;}
  if(accessRequest?.session===owner)return accessRequest.promise;
  const pending={session:owner};accessRequest=pending;
  pending.promise=(async()=>{
   const data=await readAccountSession(owner);
   if(owner!==session()||epoch!==accessEpoch)throw new DOMException('The Academy account changed.','AbortError');
   access={session:owner,admin:data.contexts.some(c=>c.scope==='PLATFORM'&&c.role==='GLOBAL_ADMIN'||['COURSE','GLOBAL'].includes(c.scope)&&['PROGRAM_ADMIN','ADMIN'].includes(c.role))};accessChanged();
   if(!access.admin){if(editor)throw Object.assign(Error('Admin editing is not available for this account.'),{status:403});leaveAdmin();throw new DOMException('Open your personal Academy workspace.','AbortError');}
   return true;
  })().finally(()=>{if(accessRequest===pending)accessRequest=null;});
  return pending.promise;
 }
 async function readyPublication(force=false){
  if(window.M4L_CONFIG?.ACCEPTED_SETUP!==true)return null;
  if(force){head=null;headRequest=null;headEpoch++;}const captured={generation,session:session(),headEpoch};
  if(!head){const api=new URL(window.M4L_CONFIG?.API_BASE||location.origin,location.href);headRequest??=original(api.origin+'/api/academy/setup/head',{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok||!data.head)throw Error(data.error||'Accepted Academy setup is unavailable.');return data.head;});try{const value=await headRequest;if(captured.generation!==generation||captured.session!==session()||captured.headEpoch!==headEpoch)throw new DOMException('The Academy account changed.','AbortError');head=value;}catch(error){headRequest=null;throw error;}}
  return head;
 }
 const editorRequests=new WeakMap();
 const editorRoute=path=>/^\/api\/academy\/(?:media-playlists\/(?:list|get|options|save|publish|attach|card-upload|card-preview)|lesson-media\/(?:feed|get|save|binding-options|binding-create|context-options|context-save|companion-editor|companion-save|companion-publish|upload|attachment-name|video-start|video-part|video-complete|video-retain))$/.test(path);
 async function adminFetch(resource,options={},scope={}){
  const url=new URL(typeof resource==='string'||resource instanceof URL?resource:resource.url,location.href),api=new URL(window.M4L_CONFIG?.API_BASE||location.origin,location.href);
  if(url.origin!==api.origin||!editorRoute(url.pathname)||!/^PROGRAM:[-A-Za-z0-9_]+$/.test(scope.activityKey||''))throw Object.assign(Error('Open Admin editing for this exact programme.'),{status:403});
  const input=url.searchParams.has('metadata')?JSON.parse(url.searchParams.get('metadata')):JSON.parse(options.body||'{}');if(input.activityKey!==scope.activityKey)throw Object.assign(Error('The selected editing programme changed.'),{status:403});
  const requestOptions={...options};editorRequests.set(requestOptions,scope);try{return await window.fetch(resource,requestOptions);}finally{editorRequests.delete(requestOptions);}
 }
 window.fetch=async(resource,options)=>{
  const url=new URL(typeof resource==='string'||resource instanceof URL?resource:resource.url,location.href);
  const api=new URL(window.M4L_CONFIG?.API_BASE||location.origin,location.href);
  if(url.origin!==api.origin||!url.pathname.startsWith('/api/'))return original(resource,options);
  const headers=new Headers(options?.headers||(resource instanceof Request?resource.headers:undefined));
  const method=String(options?.method||(resource instanceof Request?resource.method:'GET')).toUpperCase();
  // This anonymous public list selects the current accepted publication on the
  // server. Session restoration must not delay or discard its public response.
  if(url.pathname==='/api/academy/announcements'&&method==='GET'&&!headers.has('Authorization')){
   for(const name of ['X-Academy-Workspace','X-Academy-Class','X-Academy-Setup'])headers.delete(name);
   return original(resource,{...options,headers});
  }
  const editingScope=options&&editorRequests.get(options),requestWorkspace=editingScope?'ADMIN':selected;
  const captured={selected,generation,session:session()};
  const accountRoute=url.pathname.startsWith('/api/account/');
  // Share empty session reads from the header, login restoration and page tool.
  // Credential submission, context changes and explicit network reads bypass it.
  if(url.pathname==='/api/account/session'&&method==='POST'&&((!options?.body&&!(resource instanceof Request))||options?.body==='{}')&&headers.get('Authorization')==='Bearer '+session()&&options?.cache!=='reload'){
   try{
    const owner=session(),data=await readAccountSession(owner),ticket=accountEpoch;
    const check=()=>{if(owner!==session()||ticket!==accountEpoch)throw new DOMException('The Academy account changed.','AbortError');};check();
    const response=Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
    return new Proxy(response,{get(target,name){if(['json','text','blob','arrayBuffer','formData'].includes(name))return async(...args)=>{check();const value=await target[name](...args);check();return value;};const value=Reflect.get(target,name,target);return typeof value==='function'?value.bind(target):value;}});
   }catch(error){if(error.name==='AbortError')throw error;return Response.json({success:false,error:error.message,code:error.code},{status:error.status||503});}
  }
  headers.set('X-Academy-Workspace',accountRoute?'LEARN':requestWorkspace);
  if((adminRealm()||editingScope)&&!accountRoute)await readyAccess(Boolean(editingScope));
  headers.delete('X-Academy-Class');
  if(!accountRoute&&requestWorkspace==='ADMIN_LEARN'&&classView)headers.set('X-Academy-Class',encodeURIComponent(classKey()));
  const publicationEnabled=window.M4L_CONFIG?.ACCEPTED_SETUP===true;
  if(publicationEnabled&&requestWorkspace!=='ADMIN'&&!url.pathname.startsWith('/api/account/')&&url.pathname!=='/api/academy/setup/head'){
   await readyPublication();
   if(head){headers.set('X-Academy-Setup',head);captured.head=head;}
  }
  if(captured.generation!==generation||captured.session!==session())throw new DOMException('The Academy workspace or account changed.','AbortError');
  let response=await original(resource,{...options,headers});
  const check=()=>{if(captured.generation!==generation||captured.selected!==selected||captured.session!==session()||captured.head&&captured.head!==head)throw new DOMException('The Academy workspace or account changed.','AbortError');};
  check();
  if(response.status===401||response.status===403)clearAccountView();
  if(response.ok&&method!=='GET'&&method!=='HEAD'){
   let rightsChange=/^\/api\/account\/(?!session$)/.test(url.pathname)||/\/(?:accounts?|credentials?|roles?|participants?|subscriptions?|surah-grants?)(?:\/|$)/.test(url.pathname);
   rightsChange||=/\/user-profiles\/(?:save|link|recover)$|\/global\/access\/save$|\/program-monthly-subscriptions\/(?:configure|save|grid-save|surah-save|surah-grants-save)$|\/(?:courses|programs)\/(?:publish|status|save|register-completed|studio-resume)$|\/program-timetable\/(?:publish|status|manage-save|manage-remove|recover)$/.test(url.pathname);
   if(url.pathname==='/api/admin/platform/studio-access')try{rightsChange=!['read','catalogue','monthly-grid','access-table','mou-playlists','mou-playlist-correction'].includes(JSON.parse(options?.body||'{}').command?.action);}catch{rightsChange=true;}
   if(rightsChange)clearAccountView();
  }
  if((adminRealm()||editingScope)&&response.status===403&&response.headers.get('Content-Type')?.includes('application/json')){
   const error=await response.clone().json();check();
   if(error.code==='ADMIN_VIEW_FORBIDDEN'){access={session:session(),admin:false};accessChanged();if(!editingScope)leaveAdmin();throw new DOMException('Admin access changed.','AbortError');}
  }
  if(publicationEnabled&&requestWorkspace==='ADMIN'&&url.pathname!=='/api/academy/changes/accept'&&response.ok&&response.headers.get('Content-Type')?.includes('application/json')){
   const result=await response.clone().json();check();
   if(result.success&&(result.acceptedChange||result.setupPublication)){
    try{
     if(!result.acceptedChange)throw Object.assign(Error('Open this older change in its editor and save it again.'),{status:409,code:'LEGACY_CHANGE_RETRY'});
     const completed=await original(api.origin+'/api/academy/changes/accept',{method:'POST',headers,body:JSON.stringify(result.acceptedChange)}),accepted=await completed.json();check();
     if(!completed.ok||!accepted.success)throw Object.assign(Error(accepted.error||'The saved change could not be completed.'),{status:completed.status,code:accepted.code});
     window.M4L_ACADEMY_WORKSPACE.publication(accepted.head);result.head=accepted.head;
     result.cacheRefreshPending=[...new Set([...(result.cacheRefreshPending||[]),...(accepted.cacheRefreshPending||[])])];
     response=new Response(JSON.stringify(result),{status:response.status,headers:response.headers});
     void window.M4L_REFRESH_AFTER_SAVE?.(result,captured.session);
    }catch(error){check();response=new Response(JSON.stringify({success:false,error:error.message,code:error.code||'CHANGE_PENDING',publicationStaged:true}),{status:error.status||503,headers:response.headers});}
   }
  }
  if(method==='POST'&&response.ok&&/(?:save|submit|post|revise|relink|delete|publish|accept|status|register|mark|release|confirm|withdraw|upload|remove|create|close|cancel|archive|refresh|policy)$/.test(url.pathname))window.M4L_ACADEMY_READ_CACHE?.invalidate();
  // Preserve streamed file delivery. Reject a delayed parsed response before it
  // can populate another account/workspace or create a stale PDF object URL.
  return new Proxy(response,{get(target,name){if(['json','text','blob','arrayBuffer','formData'].includes(name))return async(...args)=>{check();const value=await target[name](...args);check();return value;};const value=Reflect.get(target,name,target);return typeof value==='function'?value.bind(target):value;}});
 };
 const homeUrl=()=>selected==='ADMIN'?'/academy/admin/#dashboard':(adminRealm()?'/academy/admin/':'/academy/')+'#timetable/'+audience().toLowerCase();
 const preferHubAudience=value=>{hubAudience=value==='TEACH'?'TEACH':'LEARN';hubOwner=session();};
 window.M4L_ACADEMY_WORKSPACE={adminFetch,homeUrl,preferHubAudience,current,audience,adminRealm,adminAccess,readyAccess,readerUrl,desired,commit,canonical,studentClass,classView:()=>classView,head:()=>head,readyPublication,publication:value=>{headEpoch++;head=value;headRequest=null;}};
 function resetAccess(){if(accountOwner!==session()){clearAccountView();accountOwner=session();}if(hubOwner!==session()){hubAudience='LEARN';hubOwner=session();}generation++;classView=null;head=null;headRequest=null;accessEpoch++;access=null;accessRequest=null;accessChanged();}
 window.addEventListener('m4l-academy-session',resetAccess);
 window.addEventListener('m4l-academy-session-ended',clearAccountView);
 window.addEventListener('m4l-academy-permissions-changed',clearAccountView);
 window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)resetAccess();});
 window.addEventListener('DOMContentLoaded',()=>{if(adminRealm()&&session())void readyAccess().catch(()=>{});});
 // Carry the exact realm through reader tabs and their return links.
 function readerUrl(value){
  const url=new URL(value,location.href);if(url.origin!==location.origin)return url.href;
  const context=adminRealm()&&!adminAccess()?'LEARN':selected;url.searchParams.set('workspace',context);url.searchParams.delete('studentProgram');url.searchParams.delete('studentClass');
  if(context==='ADMIN_LEARN'&&classView){url.searchParams.set('studentProgram',classView.activityKey);url.searchParams.set('studentClass',classView.classId);}
  if(/^\/academy\/(?:library|open-library)\//.test(url.pathname)&&!url.pathname.includes('/manage/')){
    const currentArea=location.hash.match(/^#activity\/(PROGRAM|COURSE)\/([^/]+)/),inherited=new URLSearchParams(location.search).get('activity');
    let area=inherited;if(currentArea){try{area=currentArea[1]+':'+decodeURIComponent(currentArea[2]);}catch{area='';}}
    if(!area&&location.pathname.startsWith('/academy/course-companion/')){const course=new URLSearchParams(location.search).get('course');if(course)area='COURSE:'+course;}
    if(area&&!url.searchParams.has('activity'))url.searchParams.set('activity',area);
  }
  if(head)url.searchParams.set('setup',head);return url.href;
 }
 document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(!link||link.hasAttribute('data-workspace-exit'))return;const url=new URL(link.href,location.href);if(url.origin!==location.origin)return;
  if((/^\/academy\/(?:calendar|library|open-library|media|pdf-reader|pdf-compare)\//.test(url.pathname)||url.pathname.startsWith('/recorder/'))&&!url.pathname.includes('/manage/'))link.href=readerUrl(url.href);
  else if(adminRealm()&&adminAccess()&&['/academy/','/academy/index.html'].includes(url.pathname)){url.pathname='/academy/admin/';if(!url.hash||url.hash==='#overview')url.hash='#administration';link.href=url.href;}
 },true);
 if(location.pathname.startsWith('/academy/admin/')&&!location.hash)history.replaceState(null,'','#dashboard');
  void import('/js/m4l-academy-history.js?v=109.8').catch(()=>{ /* Existing page links remain available if navigation cannot load. */ });
})();

// Restore Studio account continuity after ordinary Academy navigation; no DB polling.
try{if(sessionStorage.getItem('academy_website_studio_origin'))void import('/js/m4l-website-studio.mjs').catch(()=>{});}catch{}
