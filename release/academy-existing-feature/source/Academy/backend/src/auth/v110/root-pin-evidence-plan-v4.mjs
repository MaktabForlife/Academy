// SOURCE ONLY: native authority-refenced PIN-confirmation boundary.
// Call ONLY after the native route has checked its exact action/scope/ownership.
// This helper does not grant route authority or authorize replay of a command.
// Existing Core auth-audit metadata; no migration or active entry selection.
// New issuer/refresh variants must join this receipt to their SAME native batch.
import {consumeNativeRootPINReceiptFacts} from './native-root-pin-proof.mjs';
import {actorProof,verifyActor} from '../../academy/separation/proof.js';
import {trustedCookieFacts} from './academy-cookie-auth.mjs';
const proofs=new WeakMap(),prefix='root-genuine-pin-v1:';
const fail=(code='ROOT_GENUINE_PIN_REQUIRED',status=401)=>{throw Object.assign(Error(code),{code,status});};
const uint=v=>Number.isSafeInteger(v)&&v>=0,stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const fields=['sub','ce','pv','psid','bsid','bv','s_iat','s_exp'];
const digest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function receiptKey(sid,ue){if(!stable(sid)||!uint(ue))fail('ROOT_PIN_METADATA_CONFIG',503);return 'root-pin-v1:'+await digest(JSON.stringify(['root-genuine-pin-v1',sid,ue]));}
const event=c=>prefix+JSON.stringify(fields.map(k=>c[k]));
const sqlClock="CAST(strftime('%s','now') AS INTEGER)";
export async function prepareNativeRootPINReceipt({db,evidence,familyId,unlockGeneration,refreshGeneration,rotationOperationId,clock=Date.now}){
 if(typeof db?.prepare!=='function'||typeof clock!=='function')fail('ROOT_PIN_METADATA_CONFIG',503);
 if(!uint(refreshGeneration)||!stable(rotationOperationId))fail('ROOT_PIN_METADATA_CONFIG',503);
 const facts=consumeNativeRootPINReceiptFacts(evidence),now=Math.floor(clock()/1000),pin=facts.pinVerifiedAtS,key=await receiptKey(familyId,unlockGeneration);
 if(!uint(now)||pin>now||now-pin>5)fail();
 const where='f.family_id=? AND f.account_id=? AND f.credential_epoch=? AND f.unlock_generation=? AND f.refresh_generation=? AND f.rotation_operation_id=? AND f.revoked=0 AND ?<='+sqlClock+' AND '+sqlClock+'-?<=5 AND f.original_expires_at_s>'+sqlClock+" AND f.parent_session_id=f.family_id AND f.last_fg_refresh_s>=f.original_signed_in_at_s AND f.last_fg_refresh_s<="+sqlClock+" AND "+sqlClock+"-f.last_fg_refresh_s<5400 AND EXISTS(SELECT 1 FROM jwt_v110_accounts v JOIN jwt_v110_browser_heads b ON b.browser_id=f.browser_id JOIN accounts n ON n.account_id=f.account_id JOIN account_credentials cr ON cr.account_id=n.account_id JOIN account_sessions ns ON ns.session_id=f.family_id AND ns.account_id=n.account_id WHERE v.account_id=f.account_id AND v.active=1 AND v.credential_epoch=f.credential_epoch AND v.permission_version=f.permission_version AND b.generation=f.browser_generation AND n.active=1 AND cr.pin_setup=1 AND length(trim(cr.pin_hash))>0 AND cr.credential_epoch=f.credential_epoch AND ns.credential_epoch=f.credential_epoch AND ns.revoked_at IS NULL AND julianday(ns.expires_at)>julianday('now')) AND NOT EXISTS(SELECT 1 FROM jwt_v110_parent_tombstones t WHERE t.parent_session_id=f.parent_session_id)";
 const args=[familyId,facts.accountId,facts.credentialEpoch,unlockGeneration,refreshGeneration,rotationOperationId,pin,pin];
 const tuple="json_array(f.account_id,f.credential_epoch,f.permission_version,f.parent_session_id,f.browser_id,f.browser_generation,f.original_signed_in_at_s,f.original_expires_at_s)";
 // NULL from a lost conditional receipt violates NOT NULL and aborts the owning
 // family create/unlock transaction; no ordinary sign-in-only success fallback.
 const statement=db.prepare("INSERT INTO jwt_v110_security_audit(operation_id,family_id,event_type,occurred_at_s) VALUES(?,(SELECT f.family_id FROM jwt_v110_families f WHERE "+where+"),(SELECT '"+prefix+"'||"+tuple+" FROM jwt_v110_families f WHERE "+where+"),?) RETURNING operation_id").bind(key,...args,...args,pin);
 return Object.freeze({statement,operationId:key});
}
export async function requireNativeRootPINReceipt({auth,repository,db,clock=Date.now}){
 const c=trustedCookieFacts(auth);
 if(!c||c.sid!==c.psid)fail('SESSION_ENDED');
 if(typeof clock!=='function'||typeof repository?.session!=='function'||typeof db?.prepare!=='function')fail('ROOT_PIN_METADATA_CONFIG',503);
 // Full native actor verification retains current permission-signature, timed
 // substitute, session, CE/PV/UE, browser generation and original-family gates.
 // A missing PIN receipt must never turn their rejection into a PIN prompt.
 const proof=actorProof(auth);
 const refence=async()=>{
  const now=Math.floor(clock()/1000);
  if(!uint(now)||c.exp<=now)fail('SESSION_ENDED');
  const current=await repository.session(c.sid,c.sub,c.ce,new Date(now*1000),{jwtClaims:auth.cookieClaims});
  if(!current||current.account.account_id!==c.sub)fail('SESSION_ENDED');
  await verifyActor(db,proof);
  const after=Math.floor(clock()/1000);
  if(!uint(after)||after<now||c.exp<=after)fail('SESSION_ENDED');
  return after;
 };
 await refence();
 const key=await receiptKey(c.sid,c.ue),type=event(c);
 const row=await db.prepare('SELECT occurred_at_s FROM jwt_v110_security_audit WHERE operation_id=? AND family_id=? AND event_type=?').bind(key,c.sid,type).first();
 const now=await refence();
 // 409 is a typed user-confirmation requirement with no side effect. Browser
 // privacy still treats EVERY actual 401 as cancellation. Never translate a
 // failed commit, uncertain target ACK or unknown exception through this path.
 if(!uint(row?.occurred_at_s)||row.occurred_at_s>now||now-row.occurred_at_s>=60)fail('ROOT_PIN_CONFIRMATION_REQUIRED',409);
 const cap=Object.freeze({kind:'native-root-sensitive-pin'});
 proofs.set(cap,{claims:Object.freeze({...c}),operationId:key,eventType:type,pinAtS:row.occurred_at_s});
 return cap;
}
// Root Core guard ONLY. Native route/scope/ownership/rights guards must remain
// alongside it. No claim of an atomic transaction across Root and child DBs.
export function nativeRootPINReceiptGuard(cap){
 const p=proofs.get(cap);if(!p)fail();const c=p.claims;
 const sql=`EXISTS(SELECT 1 FROM jwt_v110_security_audit a JOIN jwt_v110_families f ON f.family_id=a.family_id
 JOIN jwt_v110_accounts v ON v.account_id=f.account_id JOIN jwt_v110_browser_heads b ON b.browser_id=f.browser_id
 JOIN accounts n ON n.account_id=f.account_id JOIN account_credentials cr ON cr.account_id=n.account_id
 JOIN account_sessions ns ON ns.session_id=f.family_id AND ns.account_id=n.account_id
 WHERE a.operation_id=? AND a.event_type=? AND a.occurred_at_s=? AND f.family_id=? AND f.account_id=? AND f.parent_session_id=? AND f.browser_id=? AND f.browser_generation=? AND f.credential_epoch=? AND f.permission_version=? AND f.unlock_generation=? AND f.original_signed_in_at_s=? AND f.original_expires_at_s=?
 AND f.revoked=0 AND v.active=1 AND v.credential_epoch=f.credential_epoch AND v.permission_version=f.permission_version AND b.generation=f.browser_generation AND n.active=1 AND cr.pin_setup=1 AND length(trim(cr.pin_hash))>0 AND cr.credential_epoch=f.credential_epoch AND ns.credential_epoch=f.credential_epoch AND ns.revoked_at IS NULL AND julianday(ns.expires_at)>julianday('now')
 AND f.original_expires_at_s>${sqlClock} AND f.last_fg_refresh_s<=${sqlClock} AND f.last_fg_refresh_s>=f.original_signed_in_at_s AND ${sqlClock}-f.last_fg_refresh_s<5400 AND ?>${sqlClock} AND a.occurred_at_s<=${sqlClock} AND ${sqlClock}-a.occurred_at_s<60
 AND NOT EXISTS(SELECT 1 FROM jwt_v110_parent_tombstones t WHERE t.parent_session_id=f.parent_session_id))`;
 return Object.freeze({sql,args:[p.operationId,p.eventType,p.pinAtS,c.sid,c.sub,c.psid,c.bsid,c.bv,c.ce,c.pv,c.ue,c.s_iat,c.s_exp,c.exp]});
}

// Private coordinator DTO only: never include this in an HTTP response, URL,
// browser state, log or public source evidence. The consumer re-derives the
// exact family+UE receipt key and retains the native atomic actor predicates.
export function nativeRootPINReceiptBinding(cap){
 const p=proofs.get(cap);if(!p)fail();
 return Object.freeze({schema:'ROOT_NATIVE_SENSITIVE_PIN_V1',operationId:p.operationId,eventType:p.eventType,pinAtS:p.pinAtS,claims:Object.freeze({...p.claims})});
}
