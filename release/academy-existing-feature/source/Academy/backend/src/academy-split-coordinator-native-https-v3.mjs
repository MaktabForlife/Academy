// NEW isolated coordinator only. Existing namespaces and source remain unchanged.
import {AcademySplitCoordinator as NativeSplit} from './academy-split-coordinator-root-sensitive-v1.js';
import {requirePortableNativeMethod,verifyPortableNativeProfile} from './auth/v110/portable-native-profile-v5.mjs';
import {runNativeRetryPass} from './auth/v110/master-outbox-retry-driver-v1.mjs';
const captureFence='v110SecurityCaptureUntilMs';
const validMs=value=>Number.isSafeInteger(value)&&value>=0;
const unavailable=()=>{throw Object.assign(Error('NATIVE_SECURITY_RETRY_UNAVAILABLE'),{status:503,code:'NATIVE_SECURITY_RETRY_UNAVAILABLE'});};
export class AcademyHTTPSLocalSplitCoordinator extends NativeSplit {
 constructor(ctx,env){
  const profile=requirePortableNativeMethod(env,'coordinator','retry');if(profile.capabilities.coordinator!==true)unavailable();
  super(ctx,env);this.securityContext=ctx;this.securityEnvironment=env;
 }
 async write(statements,proof){
  return this.reply(async()=>{await verifyPortableNativeProfile();const profile=requirePortableNativeMethod(this.securityEnvironment,'coordinator','retry');if(profile.capabilities.coordinator!==true)unavailable();return this.engine.write(statements,proof);});
 }
 async read(statements,proof,owner){
  return this.reply(async()=>{await verifyPortableNativeProfile();const profile=requirePortableNativeMethod(this.securityEnvironment,'coordinator','retry');if(profile.capabilities.coordinator!==true)unavailable();return this.engine.read(statements,proof,owner);});
 }
 async #arm(atMs){
  if(!validMs(atMs))unavailable();
  const previous=await this.securityContext.storage.getAlarm();
  if(previous!==null&&!validMs(previous))unavailable();
  const armedAtMs=previous===null?atMs:Math.min(previous,atMs);
  await this.securityContext.storage.setAlarm(armedAtMs);return armedAtMs;
 }
 // Trusted native writers await this AFTER auth/CSRF, BEFORE their Core batch.
 async ensureSecurityRetryAlarm(atMs){
  await verifyPortableNativeProfile();requirePortableNativeMethod(this.securityEnvironment,'coordinator','retry');
  const now=Date.now();if(!validMs(atMs)||atMs<now-5000||atMs>now+30000)unavailable();
  const previous=await this.securityContext.storage.get(captureFence);
  if(previous!==undefined&&!validMs(previous))unavailable();
  // An early alarm must keep watching through the bounded native commit window.
  // This is fresh coordinator metadata, never a session/credential expiry update.
  await this.securityContext.storage.put(captureFence,Math.max(previous??0,now+30000));
  return {armedAtMs:await this.#arm(Math.max(now,atMs))};
 }
 async alarm(){
  await verifyPortableNativeProfile();requirePortableNativeMethod(this.securityEnvironment,'coordinator','retry');
  try{
   await super.alarm();
   const result=await runNativeRetryPass({env:this.securityEnvironment,core:this.securityEnvironment.ACADEMY_DB.withSession('first-primary'),clock:Date.now,limit:8});
   const now=Date.now(),until=await this.securityContext.storage.get(captureFence);
   if(until!==undefined&&!validMs(until))unavailable();
   if(result.nextWakeAtMs!==null){if(!validMs(result.nextWakeAtMs))unavailable();await this.#arm(Math.max(now+1000,result.nextWakeAtMs));}
   else if((until??0)>now)await this.#arm(Math.min(until,now+1000));
  }catch{
   // Keep native recovery and every unacknowledged outbox row recoverable.
   await this.#arm(Date.now()+15000);throw Object.assign(Error('NATIVE_SECURITY_RETRY_PENDING'),{status:503,code:'NATIVE_SECURITY_RETRY_PENDING'});
  }
 }
}
