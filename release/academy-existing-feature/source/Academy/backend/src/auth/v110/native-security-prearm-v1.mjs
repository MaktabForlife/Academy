// Pre-arm the exact trusted NEW coordinator before a native security commit.
// Alarm is durable before Core IO; same-Core deadline guard bounds capture race.
import {prearmNativeSecurityRetry} from './master-outbox-retry-driver-v1.mjs';
import {requirePortableNativeMethod,verifyPortableNativeProfile} from './portable-native-profile-v5.mjs';
export async function prepareNativeSecurityCapture(env,db){
 const p=requirePortableNativeMethod(env,'academy','master');await verifyPortableNativeProfile();
 if(env.ACADEMY_D1_RUN_ID!==p.deploymentIds.academy||typeof env.ACADEMY_SPLIT_COORDINATOR?.getByName!=='function')throw Error('NATIVE_RETRY_COORDINATOR_UNBOUND');
 const coordinator=env.ACADEMY_SPLIT_COORDINATOR.getByName('academy:SPLIT_V1:'+env.ACADEMY_D1_RUN_ID);
 await prearmNativeSecurityRetry({coordinator});
 const now=Date.now();if(!Number.isSafeInteger(now)||now<0)throw Error('NATIVE_RETRY_CLOCK');
 const deadline=new Date(now+5000).toISOString(),guardId=crypto.randomUUID();
 return Object.freeze({
  guard:db.prepare("INSERT INTO academy_write_guards(guard_id,accepted) SELECT ?,strftime('%Y-%m-%dT%H:%M:%fZ','now')<=?").bind(guardId,deadline),
  release:db.prepare('DELETE FROM academy_write_guards WHERE guard_id=?').bind(guardId),
  deadlineMs:now+5000
 });
}
