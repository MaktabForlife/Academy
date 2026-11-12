// SOURCE ONLY finite private coordinator binding; no route selection implied.
import {jwtActorPredicate as nativeJWTActorPredicate} from './jwt-actor-guard.mjs';
const fail=()=>{throw Object.assign(Error('Sensitive action authority changed.'),{status:401,code:'SESSION_ENDED'});};
const keys='bsid,bv,ce,exp,iat,psid,pv,s_exp,s_iat,sid,sub,ue';
const uint=v=>Number.isSafeInteger(v)&&v>=0;
const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
const digest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function jwtActorPredicate(proof){
 const native=nativeJWTActorPredicate(proof),p=proof?.rootSensitive;
 if(p===undefined)return native;
 const c=p?.claims;
 if(!native.sql||!plain(p)||Object.keys(p).sort().join(',')!=='claims,eventType,operationId,pinAtS,schema'||p.schema!=='ROOT_NATIVE_SENSITIVE_PIN_V1'||!plain(c)||Object.keys(c).sort().join(',')!==keys||keys.split(',').some(k=>c[k]!==proof.jwt[k])||!uint(p.pinAtS))fail();
 const expectedKey='root-pin-v1:'+await digest(JSON.stringify(['root-genuine-pin-v1',c.sid,c.ue]));
 const expectedEvent='root-genuine-pin-v1:'+JSON.stringify(['sub','ce','pv','psid','bsid','bv','s_iat','s_exp'].map(k=>c[k]));
 if(p.operationId!==expectedKey||p.eventType!==expectedEvent)fail();
 const time="CAST(strftime('%s','now') AS INTEGER)";
 const sql=`EXISTS(SELECT 1 FROM jwt_v110_security_audit a JOIN jwt_v110_families f ON f.family_id=a.family_id
 JOIN jwt_v110_accounts v ON v.account_id=f.account_id JOIN jwt_v110_browser_heads b ON b.browser_id=f.browser_id
 JOIN accounts n ON n.account_id=f.account_id JOIN account_credentials cr ON cr.account_id=n.account_id
 JOIN account_sessions ns ON ns.session_id=f.family_id AND ns.account_id=n.account_id
 WHERE a.operation_id=? AND a.event_type=? AND a.occurred_at_s=? AND f.family_id=? AND f.account_id=? AND f.parent_session_id=? AND f.browser_id=? AND f.browser_generation=? AND f.credential_epoch=? AND f.permission_version=? AND f.unlock_generation=? AND f.original_signed_in_at_s=? AND f.original_expires_at_s=?
 AND f.revoked=0 AND v.active=1 AND v.credential_epoch=f.credential_epoch AND v.permission_version=f.permission_version AND b.generation=f.browser_generation AND n.active=1 AND cr.pin_setup=1 AND length(trim(cr.pin_hash))>0 AND cr.credential_epoch=f.credential_epoch AND ns.credential_epoch=f.credential_epoch AND ns.revoked_at IS NULL AND julianday(ns.expires_at)>julianday('now')
 AND f.original_expires_at_s>${time} AND f.last_fg_refresh_s<=${time} AND f.last_fg_refresh_s>=f.original_signed_in_at_s AND ${time}-f.last_fg_refresh_s<5400 AND ?>${time} AND a.occurred_at_s<=${time} AND ${time}-a.occurred_at_s<60
 AND NOT EXISTS(SELECT 1 FROM jwt_v110_parent_tombstones t WHERE t.parent_session_id=f.parent_session_id))`;
 return {sql:native.sql+' AND '+sql,values:[...native.values,p.operationId,p.eventType,p.pinAtS,c.sid,c.sub,c.psid,c.bsid,c.bv,c.ce,c.pv,c.ue,c.s_iat,c.s_exp,c.exp]};
}
