// SOURCE ONLY successor. Finite website-private-draft and own-journal slice;
// native authority/CSRF/PIN/commit checks are unchanged. Pilot v2 is preserved.
// First hands-on V110 candidate only. This is feature exclusion, NEVER authority.
// Passing a route retains every original native Origin/CSRF/session/scope/PIN gate.
// Unknown actions are rejected BEFORE native handlers, raw stores, or private IO.
export const localTestRoutePolicy='NATIVE_WEBSITE_HIFZ_V1';
const origins=Object.freeze({academy:'https://ummabbadacademy.app',studio:'https://worshipuponbaseera.ummabbadacademy.app',hifz:'https://mahadarwa-hifz.ummabbadacademy.app'});
const response=()=>Response.json({success:false,code:'LOCAL_PREVIEW_ACTION_UNAVAILABLE',error:'This action is unavailable in this local test.'},{status:503,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const rootAuth=Object.freeze({
 '/auth/v110/login':'POST','/auth/v110/setup-pin':'POST','/auth/v110/logout':'POST','/auth/v110/logout-csrf':'GET','/auth/v110/csrf':'GET','/auth/v110/refresh':'POST','/auth/v110/context':'GET',
 '/auth/v110/child-pin/prepare':'POST','/auth/v110/child-pin/verify':'POST',
 '/api/academy/website-studio/handoff':'POST','/api/academy/hifz/sign-in':'POST'
});
const childAuth=Object.freeze({
 '/api/auth/v110/context':'GET','/api/auth/v110/csrf':'GET','/api/auth/v110/refresh':'POST','/api/auth/v110/logout':'POST','/api/auth/v110/foreground':'POST',
 '/api/auth/v110/pin/prepare':'POST','/api/auth/v110/pin/consume':'POST','/api/auth/v110/admission/status':'GET','/api/auth/v110/admission/consume':'POST'
});
const authAssets=new Set(['browser-config.js','local-prepaint.js','academy-cookie-loader.js','academy-cookie-transport.mjs','browser-bootstrap.js','browser-entry.mjs','browser-app-privacy.mjs','browser-display-state.mjs','browser-control-client.mjs','browser-control-relay.mjs','child-cookie-transport.mjs','browser-control.html'].map(s=>'/auth/v110/'+s));
const rootReads=new Set(['/api/academy/hub/config','/api/academy/hub/read','/api/academy/setup/head','/api/academy/announcements/published','/api/public/academy-announcements']);
const rootPostReads=new Set(['/api/account/check','/api/account/session','/api/account/switch-context','/api/academy/hub/open','/api/academy/website-studio/selection','/api/academy/assessments/marks-list',...['timetable','summary','sessions','history','get','due'].map(s=>'/api/academy/class-notes/'+s)]);
const rootWrites=new Set(['/api/academy/assessments/marks-save',...['post','revise','withdraw','relink'].map(s=>'/api/academy/class-notes/'+s)]);
const studioReads=new Set(['/api/config','/api/public/home','/api/public/circles','/api/me','/api/circles/bootstrap','/api/circles/dashboard','/api/circles/navigation','/api/circles/access','/api/websites']);
const hifzReads=new Set(['/api/health','/sabaq','/sabaq-dhor','/dhor','/reflections','/plans','/attendance','/attendance/page','/position','/profile','/dhor-schedule/default-entry','/dhor-schedule/upcoming','/tajweed-tags','/maktab-groups']);
const ownLogs=new Set(['/sabaq','/sabaq-dhor','/dhor','/reflections']);
const ownSettings=new Set(['/position','/profile']);
const website=/^\/api\/websites\/[-A-Za-z0-9_:]{1,180}(?:\/(edit|export|history|assets))?$/;
const media=/^\/api\/media\/[-A-Za-z0-9_:]{1,180}$/;
const companion=/^\/api\/media\/[-A-Za-z0-9_:]{1,180}\/companion$/;
const ownFiles=/^\/api\/admin\/[-A-Za-z0-9_:]{1,180}\/files$/;
function known(app,path,method,query){
 if(app==='studio'){
  const match=path.match(website);
  if(match)return method==='GET'||method==='POST'&&match[1]==='edit'&&!query;
  if((media.test(path)&&['GET','HEAD'].includes(method))||companion.test(path)&&method==='GET'||ownFiles.test(path)&&method==='GET'||path==='/api/circles/reader-bootstrap'&&method==='GET')return true;
 }
 if(app==='hifz'&&(ownLogs.has(path)||ownSettings.has(path)))return method==='GET'||ownLogs.has(path)&&['POST','PATCH','DELETE'].includes(method)||ownSettings.has(path)&&method==='POST'&&!query;
 const auth=app==='academy'?rootAuth:childAuth;
 if(Object.hasOwn(auth,path))return !query&&method===auth[path];
 if(app==='academy'&&((['/api/public/home','/api/public/circles'].includes(path)&&method==='GET')||['GET','HEAD'].includes(method)&&/^\/api\/public\/circles\/covers\/[a-f0-9]{64}$/.test(path)))return !query;
 if(app==='academy')return method==='GET'&&rootReads.has(path)||method==='HEAD'&&['/api/academy/announcements/published','/api/public/academy-announcements'].includes(path)||method==='POST'&&!query&&(rootPostReads.has(path)||rootWrites.has(path));
 if(app==='studio')return method==='GET'&&studioReads.has(path)||['GET','HEAD'].includes(method)&&/^\/api\/public\/circles\/covers\/[a-f0-9]{64}$/.test(path)&&!query;
 return method==='GET'&&hifzReads.has(path);
}
export function localTestRequestExclusion(app,request,env){
 let u;try{u=new URL(request.url);}catch{return response();}
 if(!Object.hasOwn(origins,app)||u.origin!==origins[app]||u.username||u.password||u.hash||request.headers.has('Host')&&request.headers.get('Host')!==u.host)return response();
 if(env.JWT_LOCAL_STAGE!=='V110_INTEGRATION'||env.JWT_LOCAL_TEST_ROUTE_POLICY!==localTestRoutePolicy||env.JWT_LOCAL_AI!=='OFF'||env.JWT_LOCAL_PROVIDERS!=='OFF'||env.JWT_LOCAL_TRANSCRIPTION!=='OFF'||env.JWT_LOCAL_BACKEND_EGRESS!=='DENY_ALL'||env.JWT_LOCAL_SCHEDULES!=='OFF'||env.VIDEO_AUTOLINK_HTTP_ENABLED!=='0'||env.LOCAL_VIDEO_MANUAL_SOURCE_ENABLED!=='0')return response();
 const path=u.pathname,method=request.method;
 // This feature slice never selects another student's journal, even for staff.
 if(app==='hifz'&&(ownLogs.has(path)||ownSettings.has(path))&&u.searchParams.has('student_id'))return response();
 if(path.startsWith('/internal')||path.startsWith('/__'))return response();
 if(authAssets.has(path))return !u.search&&['GET','HEAD'].includes(method)?null:response();
 if(known(app,path,method,Boolean(u.search)))return null;
 if(method==='OPTIONS'&&['GET','HEAD','POST'].some(m=>known(app,path,m,Boolean(u.search))))return null;
 // Static files are handled only by the separately pinned exact asset gateway.
 // Do not classify Hifz native root resources as generic application GET APIs.
 const protocolAsset=['/account/child-pin/','/account/child-admission/','/auth/v110/browser-control.html'].includes(path);
 const isAPI=path.startsWith('/api/')||path.startsWith('/auth/')&&!protocolAsset||app==='hifz'&&(hifzReads.has(path)||/^\/(?:admin|maktab|sabaq|sabaq-dhor|dhor|reflections|attendance|position|profile|plans|tajweed-tags|maktab-groups)(?:\/|$)/.test(path));
 if(!isAPI&&['GET','HEAD'].includes(method))return null;
 return response();
}


// This bounded feature filter is not native authority. Only the entry successors
// below may enable the new POST routes; original bytes go to native handlers.
async function readSliceJSON(request,maximum){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||'')||!request.body||request.signal.aborted)throw Error('LOCAL_NATIVE_SLICE_BODY');
 const reader=request.body.getReader(),chunks=[];let size=0,complete=false,timer,abort;
 const stopped=new Promise((_yes,no)=>{
  timer=setTimeout(()=>no(Error('LOCAL_NATIVE_SLICE_BODY_TIMEOUT')),5000);
  abort=()=>no(Error('LOCAL_NATIVE_SLICE_BODY_ABORTED'));
  request.signal.addEventListener('abort',abort,{once:true});
  if(request.signal.aborted)abort();
 });
 try{
  for(;;){const part=await Promise.race([reader.read(),stopped]);if(part.done){complete=true;break;}size+=part.value.byteLength;if(size>maximum)throw Error('LOCAL_NATIVE_SLICE_BODY_LIMIT');chunks.push(part.value);}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
  try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!value||Object.getPrototypeOf(value)!==Object.prototype)throw Error('LOCAL_NATIVE_SLICE_BODY');return {bytes,value};}catch(error){bytes.fill(0);throw error;}
 }finally{
  clearTimeout(timer);request.signal.removeEventListener('abort',abort);
  try{if(!complete){let cancelTimer;try{await Promise.race([reader.cancel(),new Promise((_yes,no)=>{cancelTimer=setTimeout(()=>no(Error('LOCAL_NATIVE_SLICE_CANCEL_UNCONFIRMED')),1000);})]);}finally{clearTimeout(cancelTimer);}}}finally{reader.releaseLock();for(const chunk of chunks)chunk.fill(0);}
 }
}
export async function prepareLocalNativeSliceRequest(app,request,env){
 const denied=localTestRequestExclusion(app,request,env);
 if(denied)return {denied};
 const u=new URL(request.url),method=request.method;
 const edit=app==='studio'&&method==='POST'&&/^\/api\/websites\/[-A-Za-z0-9_:]{1,180}\/edit$/.test(u.pathname);
 const own=app==='hifz'&&(ownLogs.has(u.pathname)&&['POST','PATCH'].includes(method)||ownSettings.has(u.pathname)&&method==='POST');
 if(!edit&&!own)return {request};
 let parsed;
 try{
  parsed=await readSliceJSON(request,edit?1500000:262144);
  if(request.signal.aborted||edit&&!['save','restore'].includes(parsed.value.action)||own&&Object.hasOwn(parsed.value,'student_id'))return {denied:response()};
  return {request:new Request(request,{body:parsed.bytes})};
 }catch{return {denied:response()};}finally{parsed?.bytes.fill(0);}
}
