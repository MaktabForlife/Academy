// NEW SOURCE ONLY operational Root composition. Never used by existing launchers.
// No scheduled export, initializer, diagnostic, credential fallback or child DB.
import academy from '../academy-runtime.js';
import {rootV110PublicFiles,createRootV110PublicGateway} from './jwt-local-v110-public-gateway.mjs';
import {jwtLocalIntegrationApiEnv,jwtLocalIntegrationDatabaseEnv} from './jwt-local-integration-storage.mjs';
import {recoveryBucket} from './d1/recovery-storage.js';
export const rootV110Origin='https://ummabbadacademy.app';
export const rootV110AuthPaths=Object.freeze(['/auth/v110/login','/auth/v110/setup-pin','/auth/v110/logout','/auth/v110/logout-csrf','/auth/v110/csrf','/auth/v110/refresh','/auth/v110/context']);
const failed=()=>Response.json({code:'LOCAL_V110_ENTRY_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const missing=()=>new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
const objectNames=new Set(['JWT_LOCAL_CORE_DB','JWT_LOCAL_ADMIN_DB','JWT_LOCAL_SPLIT_COORDINATOR','JWT_LOCAL_TIMETABLE_COORDINATOR','ASSETS','AUTH_LOGIN_RATE_LIMITER','JWT_V110_RATE_LIMITER','LESSON_MEDIA_BUCKET','ASSESSMENT_BUCKET','MEDIA_BUCKET']);
const enabled=['JWT_V110_MASTER','JWT_V110_REFRESH','JWT_V110_BROWSER','JWT_V110_NATIVE_COOKIE'];
export function operationalV110Environment(env,{coordinator=false}={}){
 const stop=()=>{throw Error('INVALID_LOCAL_V110_ENVIRONMENT');};
 if(env.JWT_LOCAL_STAGE!=='V110_INTEGRATION'||env.JWT_LOCAL_NATIVE_ROUTES!=='V110_INTEGRATION'||env.JWT_LOCAL_BACKEND_EGRESS!=='DENY_ALL'||env.JWT_LOCAL_SCHEDULES!=='OFF'||env.JWT_LOCAL_AI!=='OFF'||env.JWT_LOCAL_PROVIDERS!=='OFF'||env.JWT_LOCAL_TRANSCRIPTION!=='OFF'||env.ACADEMY_D1_MODE!=='ACTIVE'||env.ACADEMY_LIBRARY_MODE!=='PUBLIC_ONLY'||enabled.some(k=>env[k]!=='1'))stop();
 if(!/^[a-f0-9]{64}$/.test(env.JWT_LOCAL_RECIPE_DIGEST||'')||!/^[a-f0-9]{64}$/.test(env.JWT_LOCAL_STAGE_CONFIG_DIGEST||''))stop();
 for(const [name,value]of Object.entries(env))if(typeof value==='function'||value&&typeof value==='object'&&!objectNames.has(name))stop();
 for(const name of ['LESSON_MEDIA_BUCKET','ASSESSMENT_BUCKET','MEDIA_BUCKET'])if(!env[name]||!['get','head','put','list','delete'].every(k=>typeof env[name][k]==='function'))stop();
 if(!coordinator&&(typeof env.AUTH_LOGIN_RATE_LIMITER?.limit!=='function'||typeof env.JWT_V110_RATE_LIMITER?.limit!=='function'||env.AUTH_LOGIN_RATE_LIMITER===env.JWT_V110_RATE_LIMITER))stop();
 const selected=coordinator?jwtLocalIntegrationDatabaseEnv(env):jwtLocalIntegrationApiEnv(env);
 if(selected.JWT_LOCAL_APP_BINDING!=='academy:'+selected.ACADEMY_D1_RUN_ID)stop();
 return selected;
}
export function guardedOperationalV110Coordinator(Base){
 return class extends Base{constructor(ctx,env){super(ctx,operationalV110Environment(env,{coordinator:true}));}};
}
export function createOperationalV110RootEntry({assetPaths=[],publicAuthRecords=[]}={}){
 const valid=path=>{if(typeof path!=='string'||path.length>1536)return false;const u=new URL(path,rootV110Origin);return u.origin===rootV110Origin&&path===u.pathname+u.search&&!u.hash&&!u.pathname.includes('..')&&/^\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]*$/.test(u.pathname)&&(!/^\/(?:api|auth|internal|__)(?:\/|$)/.test(u.pathname)||rootV110PublicFiles.includes(path))&&!u.pathname.startsWith('/__');};
 if(!Array.isArray(assetPaths)||assetPaths.length>4096||new Set(assetPaths).size!==assetPaths.length||assetPaths.some(p=>!valid(p)))throw Error('INVALID_OPERATIONAL_ASSETS');
 const publicGateway=createRootV110PublicGateway({records:publicAuthRecords});
 if(assetPaths.some(p=>rootV110PublicFiles.includes(p)&&!publicGateway.has(p)))throw Error('PUBLIC_AUTH_ASSET_UNPINNED');
 const assets=new Set(assetPaths),auth=new Set(rootV110AuthPaths);
 return Object.freeze({async fetch(request,env,ctx){
  const u=new URL(request.url);
  if(u.origin!==rootV110Origin||u.username||u.password||request.headers.has('Host')&&request.headers.get('Host')!=='ummabbadacademy.app')return failed();
  if(publicGateway.has(u.pathname))return publicGateway.fetch(request,env.ASSETS);
  let selected;try{selected=operationalV110Environment(env);}catch{return failed();}
  if(u.pathname.startsWith('/__')||/^\/internal(?:\/|$)/.test(u.pathname))return missing();
  if(auth.has(u.pathname)||u.pathname.startsWith('/api/')){
   if(auth.has(u.pathname)&&u.search)return missing();
   const source=request.headers.get('Origin');
   if(source&&source!==rootV110Origin||request.headers.get('Sec-Fetch-Site')!=='same-origin'||!['GET','HEAD','OPTIONS'].includes(request.method)&&source!==rootV110Origin)return new Response(null,{status:403,headers:{'Cache-Control':'private, no-store'}});
   // Existing worker owns PIN attempts, native sessions, CSRF, cookie claims,
   // current native authority, resource gates and same-batch writer fences.
   selected={...selected,...Object.fromEntries(['LESSON_MEDIA_BUCKET','ASSESSMENT_BUCKET','MEDIA_BUCKET'].map(n=>[n,recoveryBucket(selected[n],selected.ACADEMY_OBJECT_NAMESPACE)]))};
   return academy.fetch(request,selected,ctx);
  }
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
  if(!assets.has(u.pathname+u.search)||typeof selected.ASSETS?.fetch!=='function')return missing();
  return selected.ASSETS.fetch(request);
 }});
}
