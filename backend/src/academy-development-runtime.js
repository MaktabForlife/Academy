import {runOfflineUpdateStep} from '../../security/v2/offline-operations.mjs';
import {runAcademyOutboxMaintenance} from '../../security/v2/academy-outbox-scheduler.mjs';
import {runtimeServices} from '../../security/v2/runtime-service.mjs';
import {heldForV111Cutover, offlineSecurityRequest, cutoverUnavailable} from '../../security/v2/cutover-state.mjs';
import {requireVerifiedUpdateBoundary} from '../../security/v2/update-boundary.mjs';
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
const securityCron = '* * * * *';

async function securityScheduledJobs(env) {
  const runtime = await runtimeFor(env, {app: 'academy'});
  await requireVerifiedUpdateBoundary(runtime);
  const services = await runtimeServices(runtime);
  let publicationFailure;
  try {
    await services.publishPending({limit: 1, sessionLimit: 1});
  } catch (error) {
    publicationFailure = error;
  }
  // A temporary local projection error must not suppress a durable delivery
  // attempt. The receiver and outbox still validate any acknowledgement.
  await runAcademyOutboxMaintenance(runtime, {materialiseLimit: 1, deliveryLimit: 1});
  if (publicationFailure) throw publicationFailure;
}

export default {
  fetch(request, env, ctx) {
    if (!heldForV111Cutover(env)) return selected(request, env, ctx);
    if (!offlineSecurityRequest(request, env, 'academy')) return cutoverUnavailable();
    return selected(request, env, ctx);
  },
  async scheduled(event, env) {
    if (heldForV111Cutover(env) || env.UAA_V111_SECURITY_SCHEDULE !== '1' || event.cron !== securityCron) return;
    await securityScheduledJobs(env);
  },
};

// Reachable only through the Studio's private service binding.
export class WebsiteStudioAcademy extends WorkerEntrypoint {fetch(request){if(heldForV111Cutover(this.env)&&!offlineSecurityRequest(request,this.env,'academy'))return cutoverUnavailable();return this.env.UAA_V2_ENABLED==='1'?selected(request,this.env,this.ctx):websiteStudioBridge(request,storage(this.env));}}

export class V111OfflineUpdate extends WorkerEntrypoint {
  async step(command) {
    const runtime = await runtimeFor(this.env, {app: 'academy'});
    return runOfflineUpdateStep(runtime, command);
  }
}
