(() => {
 'use strict';
 const adminPage=()=>/^\/(?:users(?:\/|$)|programs(?:\/(?:$|index\.html|manage\.html|timetable\.html|lesson-media\.html|library\.html))|academy\/(?:admin|subjects|courses\/manage|course-websites(?!\/(?:view|public)(?:\/|$))|enrolment\/manage|library\/manage|pdf-tools)(?:\/|$))/.test(location.pathname);
 function desired(){
  const explicit=location.hash.match(/^#(?:timetable\/(learn|teach)|activity\/[^/]+\/[^/]+\/(learn|teach)(?:\/|$))/);
  if(location.pathname.startsWith('/academy/admin/'))return explicit?'ADMIN_'+(explicit[1]||explicit[2]).toUpperCase():'ADMIN';
  if(adminPage())return 'ADMIN';
  if(explicit)return (explicit[1]||explicit[2]).toUpperCase();
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
 let access=null,accessRequest=null,accessEpoch=0;
 const adminAccess=()=>Boolean(access?.session===session()&&access.admin);
 const accessChanged=()=>window.dispatchEvent(new Event('m4l-academy-access'));
 function leaveAdmin(){location.replace('/academy/#overview');}
 // A page address requests a workspace; it never proves the account is Admin.
 async function readyAccess(){
  if(!adminRealm()||!session())return false;
  const owner=session(),epoch=accessEpoch;
  if(access?.session===owner){if(!access.admin){leaveAdmin();throw new DOMException('Open your personal Academy workspace.','AbortError');}return true;}
  if(accessRequest?.session===owner)return accessRequest.promise;
  const api=new URL(window.M4L_CONFIG?.API_BASE||location.origin,location.href);
  const pending={session:owner};accessRequest=pending;
  pending.promise=(async()=>{
   const response=await original(api.origin+'/api/account/session',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+owner,'X-Academy-Workspace':'LEARN'},body:'{}'}),data=await response.json();
   if(owner!==session()||epoch!==accessEpoch)throw new DOMException('The Academy account changed.','AbortError');
   if(response.status===401)window.dispatchEvent(new Event('m4l-academy-session-ended'));
   if(!response.ok||!data.success||!Array.isArray(data.contexts))throw Object.assign(Error(data.error||'Sign in to open Admin.'),{status:response.status,code:data.code});
   access={session:owner,admin:data.contexts.some(c=>c.scope==='PLATFORM'&&c.role==='GLOBAL_ADMIN'||['COURSE','GLOBAL'].includes(c.scope)&&['PROGRAM_ADMIN','ADMIN'].includes(c.role))};accessChanged();
   if(!access.admin){leaveAdmin();throw new DOMException('Open your personal Academy workspace.','AbortError');}
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
  const captured={selected,generation,session:session()};
  const accountRoute=url.pathname.startsWith('/api/account/');
  headers.set('X-Academy-Workspace',accountRoute?'LEARN':selected);
  if(adminRealm()&&!accountRoute)await readyAccess();
  headers.delete('X-Academy-Class');
  if(!accountRoute&&selected==='ADMIN_LEARN'&&classView)headers.set('X-Academy-Class',encodeURIComponent(classKey()));
  const publicationEnabled=window.M4L_CONFIG?.ACCEPTED_SETUP===true;
  if(publicationEnabled&&selected!=='ADMIN'&&!url.pathname.startsWith('/api/account/')&&url.pathname!=='/api/academy/setup/head'){
   await readyPublication();
   if(head){headers.set('X-Academy-Setup',head);captured.head=head;}
  }
  if(captured.generation!==generation||captured.session!==session())throw new DOMException('The Academy workspace or account changed.','AbortError');
  let response=await original(resource,{...options,headers});
  const check=()=>{if(captured.generation!==generation||captured.selected!==selected||captured.session!==session()||captured.head&&captured.head!==head)throw new DOMException('The Academy workspace or account changed.','AbortError');};
  check();
  if(adminRealm()&&response.status===403&&response.headers.get('Content-Type')?.includes('application/json')){
   const error=await response.clone().json();check();
   if(error.code==='ADMIN_VIEW_FORBIDDEN'){access={session:session(),admin:false};accessChanged();leaveAdmin();throw new DOMException('Admin access changed.','AbortError');}
  }
  if(publicationEnabled&&selected==='ADMIN'&&url.pathname!=='/api/academy/changes/accept'&&response.ok&&response.headers.get('Content-Type')?.includes('application/json')){
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
 const homeUrl=()=>adminRealm()?'/academy/admin/'+(audience()==='TEACH'?'#timetable/teach':audience()==='LEARN'?'#timetable/learn':'#administration'):'/academy/#timetable/'+(audience()==='TEACH'?'teach':'learn');
 window.M4L_ACADEMY_WORKSPACE={homeUrl,current,audience,adminRealm,adminAccess,readyAccess,readerUrl,desired,commit,canonical,studentClass,classView:()=>classView,head:()=>head,readyPublication,publication:value=>{headEpoch++;head=value;headRequest=null;}};
 function resetAccess(){generation++;classView=null;head=null;headRequest=null;accessEpoch++;access=null;accessRequest=null;accessChanged();}
 window.addEventListener('m4l-academy-session',resetAccess);
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
 if(location.pathname.startsWith('/academy/admin/')&&!location.hash)history.replaceState(null,'','#administration');
  void import('/js/m4l-academy-history.js?v=107.112').catch(()=>{ /* Existing page links remain available if navigation cannot load. */ });
})();
