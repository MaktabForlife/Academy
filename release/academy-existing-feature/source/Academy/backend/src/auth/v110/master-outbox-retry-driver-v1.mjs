// Security-only durable retry adapter. No user/admission/PIN retry or AI jobs.
import {pumpMasterOutbox} from './master-outbox-pump-https-v1.mjs';
import {sendNativeHTTPS} from './native-https-sender-v1.mjs';
import {requirePortableNativeMethod,verifyPortableNativeProfile} from './portable-native-profile-v5.mjs';
export async function nextNativeRetryAt(core){
 const sql="SELECT MIN(due) due FROM (SELECT o.next_attempt_at_s due FROM jwt_v110_master_outbox o WHERE o.delivered_at_s IS NULL AND NOT EXISTS(SELECT 1 FROM jwt_v110_master_outbox p WHERE p.target_app=o.target_app AND p.kind=o.kind AND p.parent_account_id=o.parent_account_id AND p.version<o.version AND p.delivered_at_s IS NULL) UNION ALL SELECT o.next_attempt_at_s due FROM jwt_v110_master_lifecycle_outbox o WHERE o.delivered_at_s IS NULL AND NOT EXISTS(SELECT 1 FROM jwt_v110_master_lifecycle_outbox p WHERE p.target_app=o.target_app AND p.kind=o.kind AND p.subject_id=o.subject_id AND p.version<o.version AND p.delivered_at_s IS NULL))";
 const at=await core.prepare(sql).first('due');
 if(at===null||at===undefined)return null;if(!Number.isSafeInteger(at)||at<0)throw Error('NATIVE_RETRY_DUE_INVALID');return at*1000;
}
export async function prearmNativeSecurityRetry({coordinator,clock=Date.now}){
 const now=clock();if(!Number.isSafeInteger(now)||now<0||typeof coordinator?.ensureSecurityRetryAlarm!=='function')throw Error('NATIVE_RETRY_PREARM_REQUIRED');
 let timer,result;
 try{result=await Promise.race([coordinator.ensureSecurityRetryAlarm(now+1000),new Promise((_yes,no)=>{timer=setTimeout(()=>no(Error('NATIVE_RETRY_PREARM_UNCONFIRMED')),5000);})]);}
 finally{clearTimeout(timer);}
 const after=clock();
 if(!Number.isSafeInteger(after)||after<now||after-now>5000||!result||!Number.isSafeInteger(result.armedAtMs)||result.armedAtMs<0||result.armedAtMs>after+1000)throw Error('NATIVE_RETRY_PREARM_UNCONFIRMED');
 return Object.freeze({armedAtMs:result.armedAtMs});
}
export async function runNativeRetryPass({env,core,clock=Date.now,limit=8}){
 requirePortableNativeMethod(env,'coordinator','retry');await verifyPortableNativeProfile();
 if(!Number.isInteger(limit)||limit<1||limit>8)throw Error('NATIVE_RETRY_LIMIT');
 let selected=0,delivered=0,retry=0;
 for(const app of ['studio','hifz'])for(const kind of ['account','lifecycle']){
  if(selected>=limit)break;
  const secret=env['JWT_V110_MASTER_EVENT_SECRET_'+app.toUpperCase()];
  const result=await pumpMasterOutbox({core,app,kind,secret,clock,limit:limit-selected,deliveryTimeoutMs:5000,send:async packet=>{
   const raw=await sendNativeHTTPS(env,{from:'academy',to:app,purpose:'security.event',body:JSON.stringify({app,body:packet.body,signature:packet.signature,deadlineMs:5000}),clock});
   return JSON.parse(raw);
  }});
  selected+=result.selected;delivered+=result.delivered;retry+=result.retry;
 }
 const due=await nextNativeRetryAt(core),now=clock();
 if(!Number.isSafeInteger(now)||now<0)throw Error('NATIVE_RETRY_CLOCK');
 return Object.freeze({selected,delivered,retry,nextWakeAtMs:due===null?null:Math.max(now+1000,due)});
}
