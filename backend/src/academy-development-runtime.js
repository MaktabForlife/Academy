import {createStudioAuthorityScheduler} from './academy/v111/studio-authority-scheduled.mjs';
import {studioAuthoritySource} from './academy/v111/studio-authority-source.mjs';
import {receiveNativeBusiness} from './academy/v111/native-business.mjs';
import {createNativeBusinessDispatcher} from './academy/v111/native-business-dispatch.mjs';
import {createAcademyV2Handler} from './academy/v111/native-http.mjs';
import {runtimeFor} from '../../security/v2/runtime.mjs';
import {WorkerEntrypoint} from 'cloudflare:workers';
import {websiteStudioBridge} from './academy/d1/website-studio-bridge.js';
import academy from './academy-runtime.js';
import {recoveryBucket} from './academy/d1/recovery-storage.js';
export {ProgramTimetableCoordinator} from './academy/d1/library-storage.js';
const storage=env=>({...env,...Object.fromEntries(['LESSON_MEDIA_BUCKET','ASSESSMENT_BUCKET','MEDIA_BUCKET'].map(name=>[name,recoveryBucket(env[name],env.ACADEMY_OBJECT_NAMESPACE)]))});
const selected=createAcademyV2Handler({getRuntime:env=>runtimeFor(env,{app:'academy'}),business:(request,env,ctx)=>academy.fetch(request,storage(env),ctx),service:(request,env,ctx,runtime)=>new URL(request.url).pathname==='/internal/website/source-authority/v2'?studioAuthoritySource(request,runtime):new URL(request.url).pathname==='/internal/website/portal-return/v2'?import('./academy/v111/portal-return.mjs').then(({receivePortalReturn})=>receivePortalReturn(request,runtime,{env:storage(env),requestNative:(r,e)=>academy.fetch(r,e,ctx)})):receiveNativeBusiness(request,{env,store:runtime.store,clock:runtime.clock,dispatch:createNativeBusinessDispatcher({runtime,env:storage(env),requestNative:(r,e)=>academy.fetch(r,e,ctx)})})});
const sourceAuthoritySchedule=createStudioAuthorityScheduler({getRuntime:env=>runtimeFor(env,{app:'academy'})});
export default {
 fetch:(request,env,ctx)=>selected(request,env,ctx),
 scheduled:async(event,env,ctx)=>{await academy.scheduled(event,storage(env),ctx);await sourceAuthoritySchedule(event,env,ctx);}
};

// Reachable only through the Studio's private service binding.
export class WebsiteStudioAcademy extends WorkerEntrypoint {fetch(request){return this.env.UAA_V2_ENABLED==='1'?selected(request,this.env,this.ctx):websiteStudioBridge(request,storage(this.env));}}
