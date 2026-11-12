// Direct native credential writer effects, in its owning Core batch only.
// The two actual callers are self PIN setup and native hash upgrade.
import {nativeAccountEffects} from './native-account-effects.mjs';
const stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const fail=()=>{throw Object.assign(Error('Native credential capture unavailable'),{code:'NATIVE_CREDENTIAL_CAPTURE_UNAVAILABLE',status:503});};
export function nativeCredentialEffects(repository,p,{accountId,previousEpoch,newHash,action,operationId,now}={}){
 if(repository.features?.transactionalOutbox!==true)return [];
 if(repository.features.nativeCookie!==true||typeof p!=='function'||!stable(accountId)||!Number.isSafeInteger(previousEpoch)||previousEpoch<1||previousEpoch>=Number.MAX_SAFE_INTEGER||typeof newHash!=='string'||!newHash.trim()||newHash.length>4096||!['ACCOUNT_PIN_SETUP_SELF','ACCOUNT_PIN_HASH_UPGRADE'].includes(action)||!stable(operationId)||!Number.isSafeInteger(Date.parse(now)))fail();
 const guard=crypto.randomUUID();
 return [
  // A failed credential CAS aborts its audit/event effects too. No fake
  // credential change is inferred from the caller's old planning snapshot.
  p(`INSERT INTO academy_write_guards(guard_id,accepted) SELECT ?,EXISTS(SELECT 1 FROM account_credentials c JOIN accounts a USING(account_id) WHERE c.account_id=? AND c.credential_epoch=? AND c.pin_hash IS ? AND c.pin_setup=1 AND a.active=1) AND EXISTS(SELECT 1 FROM audit_events WHERE event_id=? AND record_kind='USER_ACCOUNT' AND record_id=? AND action=?)`,guard,accountId,previousEpoch+1,newHash,operationId,accountId,action),
  // These sessions were already invalid by native CE equality. Materialise
  // that actual cancellation so exact parent facts survive later snapshots.
  p('UPDATE account_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE account_id=? AND credential_epoch<?',now,accountId,previousEpoch+1),
  ...nativeAccountEffects(repository,p,{permissionAccounts:[],accountSecurity:{accountId,eventType:'CREDENTIAL_UPDATED'},operationId,now}),
  p('DELETE FROM academy_write_guards WHERE guard_id=?',guard)
 ];
}
