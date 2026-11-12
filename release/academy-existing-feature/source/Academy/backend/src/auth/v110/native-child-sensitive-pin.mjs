// SOURCE ONLY. Genuine consumed child PIN evidence, never admission/refresh time.
// Only called with the private authenticated native family row. No HTTP route.
import {verifyChildPINPacket,childPINIntentDigest} from './child-pin-unlock-contract.mjs';
const uint=v=>Number.isSafeInteger(v)&&v>=0;
const fail=()=>{throw Object.assign(Error('CHILD_PIN_POLICY_UNAVAILABLE'),{code:'CHILD_PIN_POLICY_UNAVAILABLE',status:503});};
const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function readConsumedNativeChildPIN({store,app,row,secret,rootRunId,childRunId,now}){
 if(!uint(now)||!['studio','hifz'].includes(app))fail();
 const saved=await store.first(`SELECT i.*,a.occurred_at_s audit_pin_at FROM jwt_v110_child_pin_intents i JOIN jwt_v110_security_audit a ON a.operation_id='pin-unlock:'||i.intent_id AND a.family_id=i.family_id AND a.event_type='child-pin-unlock'
 WHERE i.app=? AND i.family_id=? AND i.phase=2 AND i.consumed_at_s<=? AND i.consumed_at_s>? AND json_extract(i.reply_json,'$.childUnlockGeneration')=? ORDER BY i.consumed_at_s DESC,i.intent_id LIMIT 1`,[app,row.family_id,now,now-60,row.unlock_generation]);
 if(!saved)return null;
 if(!uint(saved.consumed_at_s)||typeof saved.reply_json!=='string'||typeof saved.intent_json!=='string')fail();
 // Historical signature validation uses the already committed consume time;
 // actual freshness below uses the signed PIN time, then the DB commit clock.
 const intent=await verifyChildPINPacket({kind:'intent',body:saved.intent_json,signature:saved.intent_signature,secret,app,now:saved.consumed_at_s,rootRunId,childRunId});
 const proof=await verifyChildPINPacket({kind:'unlock',body:saved.reply_json,signature:saved.reply_signature,secret,app,now:saved.consumed_at_s,rootRunId,childRunId,intent});
 if(saved.intent_id!==intent.intentId||saved.intent_digest!==await childPINIntentDigest(intent)||saved.reply_digest!==await hash(saved.reply_json)||saved.code_hash!==proof.codeHash||saved.audit_pin_at!==proof.pinVerifiedAtS)fail();
 const expected={familyId:row.family_id,nativeOwnerId:row.account_id,nativeEpoch:row.credential_epoch,nativePermissionVersion:row.current_permission_version,parentAccountId:row.source_parent_account_id,parentId:row.parent_session_id,browserId:row.browser_id,browserGeneration:row.browser_generation,sourceCredentialEpoch:row.source_epoch,sourcePermissionVersion:row.source_permission_version,sourceRevision:row.source_revision,snapshotDigest:row.source_snapshot_digest,originalSignedAtS:row.original_signed_in_at_s,originalExpiresAtS:row.original_expires_at_s};
 if(Object.entries(expected).some(([k,v])=>intent[k]!==v)||proof.childUnlockGeneration!==row.unlock_generation||intent.childUnlockGeneration+1!==row.unlock_generation||intent.nativeRefreshGeneration>=row.refresh_generation||saved.consumed_at_s<proof.pinVerifiedAtS||row.last_fg_refresh_s<proof.pinVerifiedAtS)return null;
 if(proof.pinVerifiedAtS>now||now-proof.pinVerifiedAtS>=60)return null;
 return Object.freeze({app,familyId:row.family_id,intentId:intent.intentId,intentJSON:saved.intent_json,intentSignature:saved.intent_signature,intentDigest:saved.intent_digest,replyJSON:saved.reply_json,replySignature:saved.reply_signature,replyDigest:saved.reply_digest,codeHash:saved.code_hash,consumedAtS:saved.consumed_at_s,pinAtS:proof.pinVerifiedAtS,unlockGeneration:row.unlock_generation});
}
export function consumedNativeChildPINPredicate(e){
 if(!e) return {sql:'0',args:[]};
 const clock="CAST(strftime('%s','now') AS INTEGER)";
 return {sql:`EXISTS(SELECT 1 FROM jwt_v110_child_pin_intents i JOIN jwt_v110_security_audit a ON a.operation_id='pin-unlock:'||i.intent_id AND a.family_id=i.family_id AND a.event_type='child-pin-unlock'
 WHERE i.intent_id=? AND i.app=? AND i.family_id=? AND i.phase=2 AND i.intent_json=? AND i.intent_signature=? AND i.intent_digest=? AND i.reply_json=? AND i.reply_signature=? AND i.reply_digest=? AND i.code_hash=? AND i.consumed_at_s=? AND a.occurred_at_s=? AND json_extract(i.reply_json,'$.childUnlockGeneration')=? AND ?<=${clock} AND ${clock}-?<60)`,
 args:[e.intentId,e.app,e.familyId,e.intentJSON,e.intentSignature,e.intentDigest,e.replyJSON,e.replySignature,e.replyDigest,e.codeHash,e.consumedAtS,e.pinAtS,e.unlockGeneration,e.pinAtS,e.pinAtS]};
}
