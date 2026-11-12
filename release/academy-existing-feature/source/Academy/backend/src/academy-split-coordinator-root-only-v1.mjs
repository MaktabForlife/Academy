// SOURCE ONLY Root coordinator: genuine native recovery plus bounded capture watch; no child delivery.
import {AcademySplitCoordinator as NativeSplit} from './academy-split-coordinator-root-sensitive-v1.js';
import {requirePortableNativeMethod,verifyPortableNativeProfile,requireRootOnlyChildDeliveryOff} from './auth/v110/portable-native-root-only-profile-v1.mjs';
import {observeRootHeldPending,ROOT_ONLY_CAPTURE_HOLD_ABI} from './auth/v110/master-capture-hold-root-only-v1.mjs';
const untilKey='rootOnlySecurityCaptureUntilMs',heldKey='rootOnlyChildDeliveryHold';
const validMs=v=>Number.isSafeInteger(v)&&v>=0;
const fail=()=>{throw Object.assign(Error('ROOT_ONLY_CAPTURE_PREARM_UNCONFIRMED'),{code:'ROOT_ONLY_CAPTURE_PREARM_UNCONFIRMED',status:503});};
export class AcademyRootOnlySplitCoordinator extends NativeSplit {
 constructor(ctx,env){
  requirePortableNativeMethod(env,'coordinator','coordinator');requireRootOnlyChildDeliveryOff(env);
  if(ROOT_ONLY_CAPTURE_HOLD_ABI!=='ROOT_CAPTURE_HOLD_NO_DELIVERY_V1')fail();
  super(ctx,env);this.rootOnlyContext=ctx;this.rootOnlyEnvironment=env;
 }
 async #check(method='coordinator'){
  await verifyPortableNativeProfile();requirePortableNativeMethod(this.rootOnlyEnvironment,'coordinator',method);requireRootOnlyChildDeliveryOff(this.rootOnlyEnvironment);
 }
 async read(statements,proof,owner){return this.reply(async()=>{await this.#check();return this.engine.read(statements,proof,owner);});}
 async write(statements,proof){return this.reply(async()=>{await this.#check();return this.engine.write(statements,proof);});}
 async #arm(atMs){
  if(!validMs(atMs))fail();
  const storage=this.rootOnlyContext.storage,existing=await storage.getAlarm();if(existing!==null&&!validMs(existing))fail();
  const armedAtMs=existing===null?atMs:Math.min(existing,atMs);
  await storage.setAlarm(armedAtMs);
  if(await storage.getAlarm()!==armedAtMs)fail();return armedAtMs;
 }
 // Actual private ABI consumed by unchanged native-security-prearm. No account/clock/outbox mutation.
 async ensureSecurityRetryAlarm(atMs){
  await this.#check('prearm');requirePortableNativeMethod(this.rootOnlyEnvironment,'coordinator','capture');
  const now=Date.now();if(!validMs(now)||!validMs(atMs)||atMs<now-5000||atMs>now+30000)fail();
  const previous=await this.rootOnlyContext.storage.get(untilKey);if(previous!==undefined&&!validMs(previous))fail();
  const until=Math.max(previous??0,now+30000);
  await this.rootOnlyContext.storage.put(untilKey,until);
  const armedAtMs=await this.#arm(Math.max(now,atMs));
  return Object.freeze({armedAtMs,captureUntilMs:until,childDelivery:'OFF'});
 }
 async alarm(){
  await this.#check('capture');
  let nativeError=null;
  // NativeSplit.alarm retains its actual recover() and native failure re-arm behavior.
  try{await super.alarm();}catch(e){nativeError=e;}
  let observation;
  try{observation=await observeRootHeldPending({env:this.rootOnlyEnvironment,core:this.rootOnlyEnvironment.ACADEMY_DB.withSession('first-primary')});}
  catch{observation=Object.freeze({schema:'ROOT_ONLY_HELD_OUTBOX_OBSERVATION_V1',state:'HELD_OBSERVATION_UNCONFIRMED',observedAtMs:Date.now(),deliveryAttempted:false,networkUsed:false});}
  const now=Date.now(),until=await this.rootOnlyContext.storage.get(untilKey);
  if(!validMs(now)||until!==undefined&&!validMs(until))fail();
  const watchOpen=(until??0)>now;
  await this.rootOnlyContext.storage.put(heldKey,{...observation,captureWatch:watchOpen?'BOUNDED_WATCH':'CLOSED_HELD',watchUntilMs:until??0,nativeRecoveryPending:Boolean(nativeError)});
  if(watchOpen)await this.#arm(Math.min(until,now+1000));
  // After the finite watch, do not schedule a child retry or delete/replace native recovery alarms.
  if(nativeError)throw Object.assign(Error('ROOT_ONLY_NATIVE_RECOVERY_PENDING'),{code:'ROOT_ONLY_NATIVE_RECOVERY_PENDING',status:503});
 }
 fetch(){return new Response('Not found',{status:404,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
}
export default {fetch(){return new Response('Not found',{status:404,headers:{'Cache-Control':'private, no-store'}});}};
