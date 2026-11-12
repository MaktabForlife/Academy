import {nativeMasterSessionCapture} from './master-native-session-capture.mjs';
import {nativeMasterAccountCapture} from './master-account-capture.mjs';
// Operational JWT effects join the owning native writer's guarded Core batch.
// This module installs no schema and changes no grants or PIN policy.
const fail=()=>{throw Object.assign(Error('The native authentication effect is invalid.'),{status:503,code:'AUTH_EFFECT_UNAVAILABLE'});};
const account=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
export function nativeAccountEffects(repository,p,{permissionAccounts=[],accountSecurity,operationId,now}={}){
 if(repository.features?.nativeCookie!==true)return [];
 if(!Array.isArray(permissionAccounts)||permissionAccounts.length>500||permissionAccounts.some(id=>!account(id)))fail();
 const targets=[...new Set(permissionAccounts)],statements=[];
 if(targets.length)statements.push(p('UPDATE jwt_v110_accounts SET permission_version=permission_version+1 WHERE account_id IN(SELECT value FROM json_each(?))',JSON.stringify(targets)));
 if(accountSecurity){
  if(!account(accountSecurity.accountId)||!['PIN_RESET','SUSPICIOUS_ACTIVITY','CREDENTIAL_UPDATED'].includes(accountSecurity.eventType)||typeof operationId!=='string'||!Number.isSafeInteger(Date.parse(now)))fail();
  const id=accountSecurity.accountId,at=Math.floor(Date.parse(now)/1000);
  // Only hashed refresh selectors already stored in Core remain there.
  // Audit only operation/family identifiers, a fixed event type and the time.
  statements.push(
   p("INSERT INTO jwt_v110_security_audit(operation_id,family_id,event_type,occurred_at_s) SELECT ?||':'||family_id,family_id,?,? FROM jwt_v110_families WHERE account_id=? AND revoked=0 AND credential_epoch<(SELECT credential_epoch FROM account_credentials WHERE account_id=?)",operationId,accountSecurity.eventType,at,id,id),
   p('UPDATE jwt_v110_families SET revoked=1 WHERE account_id=? AND revoked=0 AND credential_epoch<(SELECT credential_epoch FROM account_credentials WHERE account_id=?)',id,id),
   p('UPDATE jwt_v110_accounts SET credential_epoch=(SELECT credential_epoch FROM account_credentials WHERE account_id=?),permission_version=permission_version+1 WHERE account_id=?',id,id)
  );
 }
 return [...statements,...nativeMasterSessionCapture(repository,p,{permissionAccounts:targets,accountSecurity,operationId,now}),...nativeMasterAccountCapture(repository,p,{permissionAccounts:targets,accountSecurity,operationId,now})];
}
