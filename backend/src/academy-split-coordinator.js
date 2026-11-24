import {requireThat,strictJSON} from '../../security/v2/codec.mjs';
import {heldForV111Cutover,requireV111CutoverOpen} from '../../security/v2/cutover-state.mjs';
import {DurableObject} from 'cloudflare:workers';
import {splitEngine} from './academy/separation/engine.js';
import {emptyCompatibilityDatabase} from './academy/separation/compatibility.js';
import {emptyShapes} from './academy/separation/empty-shapes.js';
export class AcademySplitCoordinator extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.engine=splitEngine({v2Env:env,core:emptyCompatibilityDatabase(env.ACADEMY_DB.withSession('first-primary'),emptyShapes,{currentGrants:true}),admin:env.ACADEMY_ADMIN_DB.withSession('first-primary'),alarm:async()=>{if(!heldForV111Cutover(env))await this.ctx.storage.setAlarm(Date.now()+30000);}});}
 async reply(action){try{return {result:await action()};}catch(e){const known=e.message.match(/academy_management_stale|lesson_media_pdf_limit|split_write_busy/)?.[0];return {error:{status:e.status||(known?409:503),code:e.code||'SPLIT_SAVE_RETRY',message:e.status?e.message:known||'The save needs another attempt. Keep the same retry identifier.'}};}}
 async write(statements,proof){return this.reply(()=>{requireV111CutoverOpen(this.env);return this.engine.write(statements,proof);});}
 async read(statements,proof,owner){return this.reply(()=>{requireV111CutoverOpen(this.env);return this.engine.read(statements,proof,owner);});}
 async checkBeforeRestore({generation,releaseId,runId,draining}){
  return this.reply(async()=>{
   const env=this.env;
   requireThat(typeof draining==='boolean'&&env.UAA_V2_ENABLED==='1'
    &&env.UAA_V111_CUTOVER===(draining?'draining':'held')
    &&typeof runId==='string'&&runId.length>0&&runId===env.ACADEMY_D1_RUN_ID,
    'SPLIT_RESTORE_BOUNDARY_MISMATCH',409);
   const pinned=strictJSON(env.UAA_V2_CONFIG)?.offlineUpdate;
   requireThat(pinned&&generation===pinned.generation&&releaseId===pinned.releaseId,
    'SPLIT_RESTORE_BOUNDARY_MISMATCH',409);
   // Only the draining phase can recover. A held coordinator can only prove
   // that its existing Core/Admin pair and alarm are already quiescent.
   await this.engine.checkBeforeRestore(draining,async()=>{
    if(draining)await this.ctx.storage.deleteAlarm();
    requireThat(await this.ctx.storage.getAlarm()===null,'SPLIT_RECOVERY_PENDING',503);
   });
   return {status:draining?'DRAINED':'QUIESCENT',generation,releaseId,runId};
  });
 }
 async alarm(){
  if(heldForV111Cutover(this.env))return;
  try{await this.engine.recover();}
  catch{await this.ctx.storage.setAlarm(Date.now()+30000);throw Error('Split recovery will retry.');}
 }
}
// SQL is reachable only through the authenticated API's private DO binding.
export default {fetch:()=>new Response('Not found',{status:404})};
