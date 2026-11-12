// SOURCE ONLY capture/hold. No sender, pump, child secret, generic fetch or delivery retry export.
import {requirePortableNativeMethod,verifyPortableNativeProfile,requireRootOnlyChildDeliveryOff} from './portable-native-root-only-profile-v1.mjs';
export async function prearmNativeSecurityRetry({coordinator,clock=Date.now}){
 const now=clock();if(!Number.isSafeInteger(now)||now<0||typeof coordinator?.ensureSecurityRetryAlarm!=='function')throw Error('NATIVE_RETRY_PREARM_REQUIRED');
 let timer,result;
 try{result=await Promise.race([coordinator.ensureSecurityRetryAlarm(now+1000),new Promise((_yes,no)=>{timer=setTimeout(()=>no(Error('NATIVE_RETRY_PREARM_UNCONFIRMED')),5000);})]);}
 finally{clearTimeout(timer);}
 const after=clock();
 if(!Number.isSafeInteger(after)||after<now||after-now>5000||!result||!Number.isSafeInteger(result.armedAtMs)||result.armedAtMs<0||result.armedAtMs>after+1000)throw Error('NATIVE_RETRY_PREARM_UNCONFIRMED');
 return Object.freeze({armedAtMs:result.armedAtMs});
}

const fail=()=>{throw Object.assign(Error('ROOT_ONLY_HOLD_OBSERVATION_UNCONFIRMED'),{code:'ROOT_ONLY_HOLD_OBSERVATION_UNCONFIRMED',status:503});};
export async function observeRootHeldPending({env,core,clock=Date.now}={}){
 requirePortableNativeMethod(env,'coordinator','capture');requireRootOnlyChildDeliveryOff(env);await verifyPortableNativeProfile();
 if(typeof core?.prepare!=='function'||typeof clock!=='function')fail();
 const start=clock();if(!Number.isSafeInteger(start)||start<0)fail();let timer;
 try{
  const query=Promise.resolve().then(()=>core.prepare("SELECT (SELECT count(*) FROM jwt_v110_master_outbox WHERE delivered_at_s IS NULL) account_pending,(SELECT count(*) FROM jwt_v110_master_lifecycle_outbox WHERE delivered_at_s IS NULL) lifecycle_pending").first());
  const row=await Promise.race([query,new Promise((_yes,no)=>{timer=setTimeout(()=>no(Object.assign(Error('ROOT_ONLY_HOLD_OBSERVATION_UNCONFIRMED'),{code:'ROOT_ONLY_HOLD_OBSERVATION_UNCONFIRMED',status:503})),5000);})]);
  const now=clock();
  if(!Number.isSafeInteger(now)||now<start||now-start>5000||!row||!Number.isSafeInteger(row.account_pending)||row.account_pending<0||!Number.isSafeInteger(row.lifecycle_pending)||row.lifecycle_pending<0)fail();
  // Read only; attempts/wire/ACK/delivery fields and retained stream heads remain unchanged.
  return Object.freeze({schema:'ROOT_ONLY_HELD_OUTBOX_OBSERVATION_V1',state:'HELD_CHILD_DELIVERY_OFF',observedAtMs:now,accountPending:row.account_pending,lifecyclePending:row.lifecycle_pending,deliveryAttempted:false,delivered:0,networkUsed:false});
 }finally{clearTimeout(timer);}
}
export const ROOT_ONLY_CAPTURE_HOLD_ABI='ROOT_CAPTURE_HOLD_NO_DELIVERY_V1';
