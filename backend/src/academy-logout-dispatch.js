import {DurableObject} from 'cloudflare:workers';
import {requireThat,uuid} from '../../security/v2/codec.mjs';
import {heldForV111Cutover,requireV111CutoverOpen} from '../../security/v2/cutover-state.mjs';
import {logoutDispatchEnabled,logoutDispatchProgress} from '../../security/v2/logout-dispatch.mjs';
import {runtimeFor} from '../../security/v2/runtime.mjs';
import {runtimeServices} from '../../security/v2/runtime-service.mjs';
import {requireVerifiedUpdateBoundary} from '../../security/v2/update-boundary.mjs';
import {runAcademyOutboxMaintenance} from '../../security/v2/academy-outbox-scheduler.mjs';

const retryMs = 60_000;
const promptMs = 2_000;
const commitWindowSeconds = 120;
const key = 'logout';

export class AcademyLogoutDispatcher extends DurableObject {
 async arm(operationId) {
  requireV111CutoverOpen(this.env);
  requireThat(logoutDispatchEnabled(this.env) && uuid(operationId) && this.ctx.id.name === operationId,
   'LOGOUT_DISPATCH_UNAVAILABLE', 503);
  const runtime = await runtimeFor(this.env,{app:'academy'});
  await requireVerifiedUpdateBoundary(runtime);
  const boundary = runtime.settings.raw.offlineUpdate;
  requireThat(boundary,'LOGOUT_DISPATCH_UNAVAILABLE',503);
  const scope = JSON.stringify([runtime.settings.prefix,boundary.generation,boundary.releaseId]);
  return this.ctx.storage.transaction(async transaction => {
   const old = await transaction.get(key);
   requireThat(!old || old.scope === scope,'LOGOUT_DISPATCH_SCOPE_CHANGED',503);
   if (old) {
    if (await transaction.getAlarm() === null) await transaction.setAlarm(Date.now());
    return old.expiresAt;
   }
   const expiresAt = runtime.clock() + commitWindowSeconds;
   await transaction.put(key,{operationId,scope,expiresAt});
   await transaction.setAlarm(Date.now());
   return expiresAt;
  });
 }

 async alarm() {
  const pending = await this.ctx.storage.get(key);
  if (!pending) return;
  // Keep a persistent retry armed before touching any external binding.
  await this.ctx.storage.setAlarm(Date.now()+retryMs);
  if (heldForV111Cutover(this.env) || !logoutDispatchEnabled(this.env)) return;
  const runtime = await runtimeFor(this.env,{app:'academy'});
  await requireVerifiedUpdateBoundary(runtime);
  const boundary = runtime.settings.raw.offlineUpdate;
  if (!boundary || pending.scope !== JSON.stringify([runtime.settings.prefix,boundary.generation,boundary.releaseId])) return;
  const {operationId,expiresAt} = pending;
  let progress = await logoutDispatchProgress(runtime,operationId,expiresAt);
  if (!progress.operation_id) {
   if (progress.expired) await this.#finish();
   else await this.ctx.storage.setAlarm(Date.now()+promptMs);
   return;
  }
  if (progress.local_state !== 'APPLIED') {
   await (await runtimeServices(runtime)).publishWork(operationId,{budget:{remaining:1}});
   progress = await logoutDispatchProgress(runtime,operationId,expiresAt);
   if (progress.local_state !== 'APPLIED') {
    await this.ctx.storage.setAlarm(Date.now()+promptMs);
    return;
   }
  }
  if (progress.delivery_count !== 2 || progress.confirmed_count !== 2) {
   await runAcademyOutboxMaintenance(runtime,{materialiseLimit:1,deliveryLimit:1});
   progress = await logoutDispatchProgress(runtime,operationId,expiresAt);
  }
  if (progress.delivery_count === 2 && progress.confirmed_count === 2) {
   await this.#finish();
   return;
  }
  const due = progress.next_delivery;
  if (due !== null) {
   const delay = Math.max(promptMs,Math.min(retryMs,due*1000-Date.now()));
   await this.ctx.storage.setAlarm(Date.now()+delay);
  }
 }

 async #finish() {
  await this.ctx.storage.transaction(async transaction => {
   await transaction.delete(key);
   await transaction.deleteAlarm();
  });
 }
}
