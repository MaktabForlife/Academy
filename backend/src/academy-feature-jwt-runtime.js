// Isolated Academy-only JWT pilot entry. Deployment guards own target/bindings.
// Public static assets are asset-first; the exact service routes run this Worker.
import academy from './academy-development-runtime.js';
export {ProgramTimetableCoordinator,WebsiteStudioAcademy} from './academy-development-runtime.js';
const origin='https://feature_worker.maktab4life.workers.dev';
const unavailable=()=>Response.json({code:'FEATURE_JWT_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
function profile(env){
 return env.ENVIRONMENT==='feature'&&env.ACADEMY_DEPLOYMENT_KIND==='ISOLATED_PREVIEW'&&env.ACADEMY_DB_GENERATION==='SPLIT_V1'&&env.JWT_V110_COOKIE_MODE==='HOST_ONLY_PREVIEW'&&env.JWT_V110_REQUEST_ORIGIN===origin&&['JWT_V110_MASTER','JWT_V110_REFRESH','JWT_V110_BROWSER','JWT_V110_NATIVE_COOKIE'].every(k=>env[k]==='1');
}
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.origin!==origin||!profile(env))return unavailable();
  if(url.pathname==='/__jwt_feature_release'){
   if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
   const state=env.ACADEMY_D1_MODE==='ACTIVE'?'ACTIVE':'PAUSED';
   return new Response(request.method==='HEAD'?null:JSON.stringify({featureOnly:true,sourceCommit:env.JWT_V110_RELEASE_ID||'unrecorded',state}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(url.pathname.startsWith('/api/')||/^\/auth\/v110\/(?:login|setup-pin|context|csrf|refresh|logout|logout-csrf)$/.test(url.pathname))return academy.fetch(request,env,ctx);
  if(!env.ASSETS?.fetch)return unavailable();
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
  return env.ASSETS.fetch(request);
 },
 // This entry has no scheduled or child-sync work. The installed target must
 // have no schedule/child bridge/service routes; release guards enforce that.
 scheduled(){}
};
