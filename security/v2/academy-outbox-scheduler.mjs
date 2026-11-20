import {deliverOutbox,materialiseNativeEvent,retryDelaySeconds} from './outbox.mjs';
import {serviceFetch} from './http-service.mjs';
import {runtimeServices} from './runtime-service.mjs';
import {validateEvent} from './events.mjs';
import {requireThat,safeInt} from './codec.mjs';
import {ORIGINS} from './tokens.mjs';
const CRON='* * * * *',STREAM='account-security',MAX_TICK_MS=45000;
const failure=code=>Object.assign(Error(code),{code,status:503});
const selected=runtime=>runtime?.app==='academy'&&runtime.store?.app==='academy'&&runtime.config?.app==='academy'&&runtime.config.origin===ORIGINS.academy&&runtime.config.env==='production'&&runtime.store.env==='production'&&runtime.env?.UAA_V2_ENABLED==='1'&&runtime.settings?.raw?.app==='academy'&&runtime.settings.raw.env==='production'&&runtime.settings.raw.publicOrigin===ORIGINS.academy&&runtime.settings.raw.activationEnabled===true&&runtime.settings.raw.AIEnabled===false;
// Root's active/held-aware scheduled owner must guard invocation. This module
// does not invent a second cutover authority or bypass that owner entrypoint.
export async function runAcademyOutboxMaintenance(runtime,{materialiseLimit=8,deliveryLimit=4,jitter,monotonicNow=()=>performance.now()}={}){
 requireThat(selected(runtime),'ACADEMY_OUTBOX_SCHEDULER_NOT_SELECTED',503);
 requireThat(safeInt(materialiseLimit,1)&&materialiseLimit<=8&&safeInt(deliveryLimit,1)&&deliveryLimit<=4&&typeof monotonicNow==='function','INVALID_SCHEDULER_BUDGET',503);
 const now=runtime.clock(),start=monotonicNow();requireThat(safeInt(now)&&Number.isFinite(start),'SCHEDULER_CLOCK_UNAVAILABLE',503);let budgetExhausted=false;
 const withinBudget=()=>{const elapsed=monotonicNow()-start;requireThat(Number.isFinite(elapsed)&&elapsed>=0,'SCHEDULER_CLOCK_UNAVAILABLE',503);if(elapsed>=MAX_TICK_MS)budgetExhausted=true;return !budgetExhausted;};
 // One immutable tick clock for eligibility, durable backoff and authenticated
 // request timestamps, without modifying a cached runtime used by HTTP requests.
 const transportRuntime=Object.freeze({app:runtime.app,store:runtime.store,env:runtime.env,config:runtime.config,settings:runtime.settings,clock:()=>now});
 const services=await runtimeServices(runtime),store=runtime.store,senders=await store.all("SELECT target_app,stream,owner_epoch,next_sequence FROM jwt_v2_sender_streams WHERE stream=? AND target_app IN('studio','hifz') ORDER BY target_app",STREAM);
 requireThat(senders.length===2&&new Set(senders.map(row=>row.target_app)).size===2,'SCHEDULER_SENDER_GENESIS_REQUIRED',503);
 for(const sender of senders)await services.ledger(sender.target_app,sender.stream,sender.owner_epoch);
 // Reuse existing durable fairness metadata. This grants no authority and
 // neither creates a sender epoch nor advances an event/receiver watermark.
 await store.batch(senders.map(row=>store.stmt('INSERT INTO jwt_v2_delivery_streams(target_app,stream) VALUES(?,?) ON CONFLICT(target_app,stream) DO NOTHING',row.target_app,row.stream)));
 let selectedRows=0,attempted=0,materialised=0,failed=0;
 while(selectedRows<materialiseLimit*2&&attempted<materialiseLimit&&withinBudget()){
  const stream=await store.first("SELECT s.target_app,s.stream FROM jwt_v2_delivery_streams s WHERE s.stream=? AND s.target_app IN('studio','hifz') AND EXISTS(SELECT 1 FROM jwt_v2_native_outbox n WHERE n.target_app=s.target_app AND n.state='PENDING' AND n.event_json IS NULL AND n.next_attempt_at<=?) ORDER BY s.last_selected_tick,s.target_app LIMIT 1",STREAM,now);
  if(!stream)break;selectedRows++;
  const item=await store.first("SELECT change_id,target_app,attempts FROM jwt_v2_native_outbox WHERE target_app=? AND state='PENDING' AND event_json IS NULL AND next_attempt_at<=? ORDER BY next_attempt_at,change_id LIMIT 1",stream.target_app,now);if(!item)continue;
  const attempt=item.attempts+1,next=now+retryDelaySeconds(attempt,{jitter});requireThat(safeInt(item.attempts)&&safeInt(next),'SCHEDULER_ATTEMPT_EXHAUSTED',503);
  const [g,c]=store.guard("SELECT 1 FROM jwt_v2_native_outbox WHERE change_id=? AND target_app=? AND state='PENDING' AND event_json IS NULL AND attempts=? AND next_attempt_at<=?",[item.change_id,item.target_app,item.attempts,now]);
  try{await store.batch([g,store.stmt('UPDATE jwt_v2_native_outbox SET attempts=?,next_attempt_at=? WHERE change_id=? AND target_app=?',attempt,next,item.change_id,item.target_app),store.stmt('UPDATE jwt_v2_delivery_streams SET last_selected_tick=(SELECT max(last_selected_tick)+1 FROM jwt_v2_delivery_streams) WHERE target_app=? AND stream=?',item.target_app,STREAM),c]);}
  catch{const current=await store.first('SELECT event_json,attempts,next_attempt_at FROM jwt_v2_native_outbox WHERE change_id=? AND target_app=?',item.change_id,item.target_app);if(current&&(current.event_json!==null||current.attempts!==item.attempts||current.next_attempt_at>now))continue;throw failure('SCHEDULER_RESERVATION_UNAVAILABLE');}
  attempted++;
  try{await materialiseNativeEvent(store,{changeId:item.change_id,targetApp:item.target_app});materialised++;}catch{failed++;}
 }
 let delivery={attempted:0,applied:0};
 if(withinBudget())delivery=await deliverOutbox(store,{now,limit:deliveryLimit,jitter,sendAuthenticated:async(event,meta)=>{
  if(!withinBudget())throw failure('SCHEDULER_TICK_BUDGET_EXHAUSTED');
  const ledger=await services.ledger(meta.targetApp,event.stream,event.ownerEpoch);requireThat(event.sequence<ledger.next_sequence,'SCHEDULER_UNCOMMITTED_SEQUENCE',503);
  await validateEvent(event,{env:runtime.config.env,targetApp:meta.targetApp,streams:services.streamMap(meta.targetApp),dependencies:services.registry.dependencies});
  const operationId=crypto.randomUUID();return serviceFetch(transportRuntime,{targetApp:meta.targetApp,path:'/internal/auth/v2/events',operationId,body:{schema:2,env:runtime.config.env,sourceApp:'academy',targetApp:meta.targetApp,batchId:operationId,events:[event]}});
 }});
 return {app:'academy',now,materialization:{attempted,materialised,failed},delivery,budgetExhausted};
}
export function createAcademyOutboxScheduler({getRuntime}){
 requireThat(typeof getRuntime==='function','SCHEDULER_RUNTIME_FACTORY_REQUIRED',503);
 return async(event,env,ctx)=>{
  if(env.UAA_V2_ENABLED!=='1'||event.cron!==CRON)return;
  const job=(async()=>runAcademyOutboxMaintenance(await getRuntime(env)))();
  if(ctx?.waitUntil)ctx.waitUntil(job);else return job;
 };
}
export const academyOutboxSchedulerBoundary=Object.freeze({cron:CRON,owner:'Academy active held-aware scheduled entry only; existing configured sender epochs required.',budgets:'At most8 native materializations,4 deliveries per tick, fixed start clock,45second soft tick budget; existing transport10second request/body bounds.',coverage:'Fresh canonical C19 authenticated request for each attempt; only existing exact APPLIED/digest/reference checks acknowledge. No payload or identity logging.',hold:'No direct/fallback runtime entrypoint or provider schedule is added by this module. Root must wire and prove held-aware ownership before release.'});
