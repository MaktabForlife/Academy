// v4 COMMON IMPLEMENTATION proposal: role mains re-export only their current registry. v3: retain unselected legacy DO class exports without any binding/storage activation. v2: explicit directory aliases with assets.html_handling=none. Existing Academy Feature only. Same bundle for API/coordinator; existing JWT class identities.
import {DurableObject,WorkerEntrypoint} from 'cloudflare:workers';
import native from './academy-development-runtime.js';
import {AcademyRootOnlySplitCoordinator as NativeRootCoordinator} from './academy-split-coordinator-root-only-v1.mjs';
import {ProgramTimetableCoordinator as NativeTimetable} from './academy/d1/library-storage.js';
import {existingFeatureEnv} from './academy/existing-feature-env-v1.mjs';
import {portableNativeHTTPRequest,portableNativeUnavailable,verifyPortableNativeProfile} from './auth/v110/academy-existing-feature-profile-v1.mjs';
import {bufferRootOnlyPOST} from './academy/root-only-request-body-v1.mjs';
// Physical legacy namespaces remain retained. These constructors intentionally throw
// before super(), any environment read, JWT mapping, private method or storage access.
// No old instance can borrow the selected JWT pair. No migration/delete/new namespace.
const heldLegacy=()=>Object.assign(Error('RETAINED_LEGACY_FEATURE_CLASS_UNSELECTED'),{code:'RETAINED_LEGACY_FEATURE_CLASS_UNSELECTED',status:503});
export class AcademySplitCoordinator extends DurableObject {
 constructor(){throw heldLegacy();}
}
export class ProgramTimetableCoordinator extends DurableObject {
 constructor(){throw heldLegacy();}
}
// Retain the existing API's named service entrypoint without a child/native bridge.
export class WebsiteStudioAcademy extends WorkerEntrypoint {
 fetch(){return new Response('Not found',{status:404,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
}
export class JWTFeatureAcademySplitCoordinator extends NativeRootCoordinator {
 constructor(ctx,env){super(ctx,existingFeatureEnv(env,'coordinator'));}
}
export class JWTFeatureProgramTimetableCoordinator extends NativeTimetable {
 constructor(ctx,env){super(ctx,existingFeatureEnv(env,'academy'));}
 fetch(){return new Response('Not found',{status:404,headers:{'Cache-Control':'private, no-store'}});}
}
const authMethods=new Map([
 ['/auth/v110/login','POST'],['/auth/v110/setup-pin','POST'],['/auth/v110/context','GET'],
 ['/auth/v110/csrf','GET'],['/auth/v110/refresh','POST'],['/auth/v110/logout-csrf','GET'],['/auth/v110/logout','POST']
]);
const childAPI=/^\/api\/academy\/(?:hifz|website-studio)(?:\/|$)/;
function dynamic(response){
 const headers=new Headers();
 for(const[k,v]of response.headers)if(k.toLowerCase()!=='set-cookie')headers.append(k,v);
 if(response.headers.has('Set-Cookie')){
  if(typeof response.headers.getSetCookie!=='function')throw Error('FEATURE_COOKIE_HEADERS_UNAVAILABLE');
  for(const value of response.headers.getSetCookie())headers.append('Set-Cookie',value);
 }
 headers.set('Cache-Control','private, no-store');headers.set('Pragma','no-cache');headers.set('X-Content-Type-Options','nosniff');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
const reply=(body,status,more={})=>dynamic(new Response(body,{status,headers:more}));
export default {
 async fetch(request,rawEnv,ctx){
  let stage='configuration';
  try{
   const url=new URL(request.url);
   if(url.pathname.startsWith('/internal/')||childAPI.test(url.pathname))return reply('Not found',404);
   await verifyPortableNativeProfile();const env=existingFeatureEnv(rawEnv,'academy');
   stage='origin';portableNativeHTTPRequest(request,env,'academy');
   const authMethod=authMethods.get(url.pathname),api=url.pathname.startsWith('/api/');
   if(authMethod||api){
    if(authMethod&&(url.search||request.method!==authMethod))return reply('Use the declared method.',url.search?404:405,{Allow:authMethod});
    stage='body';
    const bounded=authMethod||url.pathname.startsWith('/api/account/')?await bufferRootOnlyPOST(request):request;
    stage='native';return dynamic(await native.fetch(bounded,env,ctx));
   }
   // /auth/v110 browser JS/CSS are assets, never auth API handlers or an SPA login fallback.
   if(url.pathname.startsWith('/auth/v110/')&&!/\.(?:m?js|css)$/.test(url.pathname))return reply('Not found',404);
   if(!['GET','HEAD'].includes(request.method))return reply('Use GET or HEAD.',405,{Allow:'GET, HEAD'});
   stage='assets';if(typeof env.ASSETS?.fetch!=='function')throw Error('FEATURE_ASSETS_UNAVAILABLE');
   // Public app build only; credentials and CSRF never go to the static binding.
   const headers=new Headers();for(const name of ['Accept','If-None-Match','If-Modified-Since'])if(request.headers.has(name))headers.set(name,request.headers.get(name));
   const target=new URL(request.url),aliases=new Map([['/','/index.html'],['/academy/','/academy/index.html'],['/academy/admin/','/academy/admin/index.html']]);
   if(['/academy','/academy/admin'].includes(target.pathname))return reply('',307,{Location:target.pathname+'/'+target.search});
   target.pathname=aliases.get(target.pathname)||target.pathname;
   return await env.ASSETS.fetch(new Request(target,{method:request.method,headers,signal:request.signal,redirect:'manual'}));
  }catch(error){
   if(error?.code==='PORTABLE_NATIVE_ORIGIN')return reply('Forbidden',403,{'X-UAA-V110-Stage':'origin'});
   if(stage==='body'&&/^ROOT_BODY_/.test(error?.code||''))return reply('The request could not be accepted.',[400,408,413,415,503].includes(error.status)?error.status:503,{'X-UAA-V110-Stage':'body'});
   const response=dynamic(portableNativeUnavailable());response.headers.set('X-UAA-V110-Stage',stage);return response;
  }
 },
 scheduled(){throw Object.assign(Error('UNRELATED_SCHEDULES_DISABLED'),{code:'UNRELATED_SCHEDULES_DISABLED',status:503});}
};
