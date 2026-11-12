// First hands-on V110 candidate only. This is feature exclusion, NEVER authority.
// Passing a route retains every original native Origin/CSRF/session/scope/PIN gate.
// Unknown actions are rejected BEFORE native handlers, raw stores, or private IO.
export const localTestRoutePolicy='AUTH_PIN_READONLY_V1';
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
function known(app,path,method,query){
 const auth=app==='academy'?rootAuth:childAuth;
 if(Object.hasOwn(auth,path))return !query&&method===auth[path];
 if(app==='academy')return method==='GET'&&rootReads.has(path)||method==='HEAD'&&['/api/academy/announcements/published','/api/public/academy-announcements'].includes(path)||method==='POST'&&!query&&(rootPostReads.has(path)||rootWrites.has(path));
 if(app==='studio')return method==='GET'&&studioReads.has(path)||['GET','HEAD'].includes(method)&&/^\/api\/public\/circles\/covers\/[a-f0-9]{64}$/.test(path)&&!query;
 return method==='GET'&&hifzReads.has(path);
}
export function localTestRequestExclusion(app,request,env){
 let u;try{u=new URL(request.url);}catch{return response();}
 if(!Object.hasOwn(origins,app)||u.origin!==origins[app]||u.username||u.password||u.hash||request.headers.has('Host')&&request.headers.get('Host')!==u.host)return response();
 if(env.JWT_LOCAL_STAGE!=='V110_INTEGRATION'||env.JWT_LOCAL_TEST_ROUTE_POLICY!==localTestRoutePolicy||env.JWT_LOCAL_AI!=='OFF'||env.JWT_LOCAL_PROVIDERS!=='OFF'||env.JWT_LOCAL_TRANSCRIPTION!=='OFF'||env.JWT_LOCAL_BACKEND_EGRESS!=='DENY_ALL'||env.JWT_LOCAL_SCHEDULES!=='OFF'||env.VIDEO_AUTOLINK_HTTP_ENABLED!=='0'||env.LOCAL_VIDEO_MANUAL_SOURCE_ENABLED!=='0')return response();
 const path=u.pathname,method=request.method;
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
