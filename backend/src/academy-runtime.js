import academy from './academy/d1/worker.js';
function modeError(env){
  if(env.ACADEMY_D1_MODE==='PAUSED')return Response.json({success:false,error:'Academy is temporarily paused for maintenance. Please try again shortly.',code:'ACADEMY_STORAGE_PAUSED',retryable:true},{status:503,headers:{'Retry-After':'60'}});
  if(env.ACADEMY_D1_MODE==='REHEARSAL'&&env.ENVIRONMENT!=='local'&&env.ACADEMY_DEPLOYMENT_KIND!=='ISOLATED_PREVIEW')return Response.json({success:false,error:'An isolated Academy rehearsal is required.',code:'ACADEMY_STORAGE_MODE_INVALID',retryable:false},{status:503});
  if(!['ACTIVE','REHEARSAL'].includes(env.ACADEMY_D1_MODE)||env.ACADEMY_LIBRARY_MODE!=='PUBLIC_ONLY')return Response.json({success:false,error:'Academy storage configuration is unavailable.',code:'ACADEMY_STORAGE_MODE_INVALID',retryable:false},{status:503});
  return null;
}
export default {
  async fetch(request,env,ctx){return modeError(env)||academy.fetch(request,env,ctx);},
  async scheduled(event,env,ctx){if(!modeError(env))return academy.scheduled(event,env,ctx);}
};
