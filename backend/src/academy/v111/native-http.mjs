import {finishNativePinReset} from './native-pin-reset.mjs';
import {academyV2HTML} from './html.mjs';
import {bindNativeRequest} from './native-context.js';
const origin='https://ummabbadacademy.app';
const retired=new Set(['/api/account/check','/api/academy/website-studio/config','/api/academy/website-studio/handoff','/api/academy/hifz/sign-in','/api/account/login','/api/account/setup-pin','/api/account/logout','/api/academy/hub/login','/api/academy/hub/legacy-open','/api/academy/hub/studio-start','/api/academy/hub/refresh']);
const json=(code,status)=>Response.json({success:false,code,error:code},{status,headers:{'Cache-Control':'no-store'}});
export function createAcademyV2Handler({getRuntime,business,service=null}){
 return async function handle(request,env,ctx){
  if(env.UAA_V2_ENABLED!=='1')return business(request,env,ctx);
  try{
   const url=new URL(request.url);if(url.origin!==origin)return json('CANONICAL_ORIGIN_REQUIRED',421);
   const runtime=await getRuntime(env),auth=await runtime.handle(request,ctx);if(auth)return auth;
   if(url.pathname.startsWith('/internal/website/'))return service?await service(request,env,ctx,runtime):json('NATIVE_RPC_NOT_CONFIGURED',503);
   if(url.pathname.startsWith('/auth/')||retired.has(url.pathname)||url.pathname.startsWith('/api/website-platform/'))return json('V1_AUTH_RETIRED',410);
   if(url.pathname==='/api/academy/hub/config'&&request.method==='GET')return Response.json({authVersion:2,app:'academy',academyOrigin:origin,studioOrigin:'https://worshipuponbaseera.ummabbadacademy.app',hifzOrigin:'https://mahadarwa-hifz.ummabbadacademy.app',authorityMode:'ACADEMY',nativePortal:true},{headers:{'Cache-Control':'no-store'}});
   const publishedAttachment=['/api/academy/announcements/image','/api/academy/announcements/pdf'].includes(url.pathname)&&url.searchParams.get('draft')!=='1'&&(url.searchParams.has('asset')||url.searchParams.has('id'));
   const publicRead=['GET','HEAD'].includes(request.method)&&(['/api/academy/progress/preview','/api/academy/header-date','/api/academy/pdf-tools/defaults','/api/academy/profile-labels-version','/api/academy/entrance/public-snapshot','/api/academy/enrolment/catalogue','/api/academy/open-library/metadata/public','/api/academy/open-library/metadata/cover','/api/academy/announcements/published','/api/academy/media-playlist-card-image'].includes(url.pathname)||publishedAttachment);
   if(!url.pathname.startsWith('/api/')||publicRead)return academyV2HTML(request,env,await business(request,env,ctx));
   const action=['GET','HEAD'].includes(request.method)?'read':'write',cap=await runtime.authorise(request,{action});
   bindNativeRequest(request,{runtime,cap,env});let response=await business(request,env,ctx);
   if(request.method==='POST'&&url.pathname==='/api/admin/platform/user-profiles/save'&&response.ok){const value=await response.clone().json();if(value.reset===true){const result=await finishNativePinReset(runtime,value);response=Response.json(result,{status:result.securityPublication==='PENDING'?202:response.status,headers:response.headers});}}
   return runtime.decorate(response,cap);
  }catch(error){return json(typeof error.code==='string'?error.code:'ACADEMY_V2_UNAVAILABLE',error.status||503);}
 };
}
export const academyNativeV2Boundary=Object.freeze({origin,authority:'Private runtime-branded capability and cached nativeState; no Bearer-to-V2 conversion.',legacy:'Old login, refresh checkpoint, connector and logout are retired in selected V2 mode.'});
