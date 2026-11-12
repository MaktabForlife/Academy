import {prepareNativeRootPINReceipt} from './root-pin-evidence-plan-v4.mjs';
// Academy own refresh: full native rights prepared before a same-Core CAS.
// Does not issue a first session, change grants, unlock a PIN or call a child.
import {AuthContractError,IDLE_SECONDS} from './claims.mjs';
import {projectAcademyRights} from './native-rights.mjs';
import {createPortableRootCookieEngine} from './academy-cookie-engine-portable-v1.mjs';
import {portableNativeOrigins,portableNativeHTTPRequest,requirePortableNativeMethod} from './portable-native-profile-v2.mjs';
import {fingerprint,randomRefresh} from './store.mjs';
import {actorProof,verifyActor} from '../../academy/separation/proof.js';
const fail=code=>{throw new AuthContractError(code);};
const uint=n=>Number.isSafeInteger(n)&&n>=0;
const tuple=['family_id','account_id','parent_session_id','browser_id','browser_generation','credential_epoch','unlock_generation','original_signed_in_at_s','original_expires_at_s'];
const lookup="SELECT f.*,v.permission_version current_permission_version FROM jwt_v110_families f JOIN jwt_v110_accounts v USING(account_id) JOIN jwt_v110_browser_heads b USING(browser_id) JOIN accounts n USING(account_id) JOIN account_credentials c USING(account_id) JOIN account_sessions s ON s.session_id=f.family_id AND s.account_id=f.account_id WHERE (f.refresh_fp=? OR f.previous_fp=?) AND f.revoked=0 AND v.active=1 AND v.credential_epoch=f.credential_epoch AND n.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND c.credential_epoch=f.credential_epoch AND s.credential_epoch=f.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>? AND b.generation=f.browser_generation AND f.original_expires_at_s>? AND NOT EXISTS(SELECT 1 FROM jwt_v110_parent_tombstones t WHERE t.parent_session_id=f.parent_session_id)";
const claims=r=>({sub:r.account_id,sid:r.family_id,psid:r.parent_session_id,bsid:r.browser_id,bv:r.browser_generation,ce:r.credential_epoch,pv:r.current_permission_version,ue:r.unlock_generation,s_iat:r.original_signed_in_at_s,s_exp:r.original_expires_at_s});
function checkClock(row,now,pinUnlock=false){
 if(!uint(now)||!uint(row.original_signed_in_at_s)||!uint(row.original_expires_at_s)||row.original_signed_in_at_s>now||row.original_expires_at_s-row.original_signed_in_at_s>604800||row.original_expires_at_s<=now||!uint(row.last_fg_refresh_s)||row.last_fg_refresh_s<row.original_signed_in_at_s||row.last_fg_refresh_s>now)fail('INVALID_TIME');
 if(row.family_id!==row.parent_session_id)fail('SESSION_ENDED');
 if(!pinUnlock&&now-row.last_fg_refresh_s>=IDLE_SECONDS)fail('PIN_REQUIRED');
}
function internal(body,cookies=[],issuedClaims,clientResponse){
 const result={...body};Object.defineProperty(result,'setCookies',{value:Object.freeze(cookies),enumerable:false});
 if(issuedClaims)Object.defineProperty(result,'claims',{value:issuedClaims,enumerable:false});
 if(clientResponse)Object.defineProperty(result,'clientResponse',{value:clientResponse,enumerable:false});return Object.freeze(result);
}
export async function createAccountBoundAcademyRefresh(env,{binding,repository,clock=()=>Math.floor(Date.now()/1000),authorizeRotation,pinAuthority,prepareClient,...config}){
 requirePortableNativeMethod(env,'academy','http');
 if(config.app!=='academy'||!binding?.withSession||!repository?.session||!repository.mediaPlaylistSource?.db||typeof clock!=='function'||authorizeRotation!==undefined&&typeof authorizeRotation!=='function')fail('INVALID_CONFIG');
 if(prepareClient!==undefined&&typeof prepareClient!=='function')fail('INVALID_CONFIG');
 if(pinAuthority!==undefined&&(!pinAuthority||typeof pinAuthority.accountId!=='string'||!uint(pinAuthority.credentialEpoch)||!pinAuthority.rootPIN))fail('INVALID_CONFIG');
 const engine=await createPortableRootCookieEngine(env,config),db=repository.mediaPlaylistSource.db;
 return Object.freeze({async refreshAndIssue(raw,options={}){
  if(!options||Object.keys(options).some(k=>k!=='foreground')||options.foreground!==undefined&&typeof options.foreground!=='boolean')fail('INVALID_REFRESH_MODE');
  const fp=await fingerprint('academy',raw);let selected;
  for(let attempt=0;attempt<2;attempt++){
   const now=clock();if(!uint(now))fail('INVALID_TIME');const iso=new Date(now*1000).toISOString();
   const r=(await db.prepare(lookup).bind(fp,fp,iso,now).all()).results[0];
   if(!r)fail('SESSION_ENDED');checkClock(r,now,Boolean(pinAuthority));
   if(pinAuthority&&(r.account_id!==pinAuthority.accountId||r.credential_epoch!==pinAuthority.credentialEpoch))fail('SESSION_ENDED');
   if(selected&&tuple.some(k=>r[k]!==selected[k]))fail('SESSION_ENDED');selected??={...r};
   if(!pinAuthority&&r.refresh_fp!==fp)return internal({kind:now-r.rotated_at_s<=30?'in_progress':'readmit_required'});
   // Capture every Core-backed authority field before loading cached/native state.
   // Website admission is not represented by the legacy actor signature.
   const authorityBefore=(await db.prepare("SELECT version,coalesce((SELECT active FROM website_platform_admissions WHERE account_id=?),0) website_admitted FROM split_read_state WHERE singleton=1").bind(r.account_id).all()).results[0];
   if(!authorityBefore||!uint(authorityBefore.version)||![0,1].includes(authorityBefore.website_admitted))fail('REFRESH_UNAVAILABLE');
   const state=await repository.session(r.family_id,r.account_id,r.credential_epoch,new Date(now*1000));
   if(!state||state.account.account_id!==r.account_id||state.account.credential_epoch!==r.credential_epoch)fail('SESSION_ENDED');
   const proof=actorProof({state,sid:r.family_id,user:{accountid:r.account_id}});
   // Reuse the existing native authority comparison, including confirmed
   // Global Admin, mapped roles, monthly/surah rights and timed substitutes.
   let nativeVersion;try{nativeVersion=await verifyActor(db,proof);}catch{fail('SESSION_ENDED');}
   if(!uint(nativeVersion))fail('REFRESH_UNAVAILABLE');
   if(nativeVersion!==authorityBefore.version)continue;
   if(authorizeRotation)await authorizeRotation({family:r,now});
   // Native adapters may return null-prototype database rows. Copy only the
   // already server-verified authority rows into the strict codec boundary.
   // myLinksAvailable remains a display hint. Each material/resource owner
   // must validate its current storage/access; this flag never grants access.
   const rights=projectAcademyRights({...state,account:{global_admin:state.account.global_admin,substitute_grants:state.account.substitute_grants},roles:state.roles.map(r=>({...r})),subscriptions:state.subscriptions.map(r=>({...r})),monthlyMedia:state.monthlyMedia.map(r=>({...r})),surahGrants:state.surahGrants.map(r=>({...r}))},{websiteAdmitted:authorityBefore.website_admitted===1});
   const issued=await engine.issue({...claims(r),...(pinAuthority?{ue:r.unlock_generation+1}:{})},rights,now);
   const clientPreparation=prepareClient?await prepareClient({claims:issued.claims,family:r}):null;
   if(clientPreparation!==null&&typeof clientPreparation!=='function')fail('INVALID_PREPARATION');
   const committedAt=clock();checkClock(r,committedAt,Boolean(pinAuthority));
   if(committedAt<now||issued.claims.exp<=committedAt)fail('PREPARATION_EXPIRED');
   const next=randomRefresh(),nextFP=await fingerprint('academy',next),operation=crypto.randomUUID(),commitISO=new Date(committedAt*1000).toISOString();
   // Cookie/response preparation completes while the old fingerprint is current.
   const cookies=[engine.accessCookie(issued.token,issued.claims.exp,committedAt),engine.refreshCookie(next,r.original_expires_at_s,committedAt)],lastForegroundRefreshS=pinAuthority||options.foreground===true?committedAt:r.last_fg_refresh_s;
   const clientResponse=clientPreparation?clientPreparation({claims:issued.claims,cookies,committedAt,lastForegroundRefreshS}):null;
   if(clientResponse&&!(clientResponse instanceof Response))fail('INVALID_PREPARATION');
   const response=internal({kind:'rotated',nativeAccountBound:true,nativeAuthorityPreserved:true,lastForegroundRefreshS,serverTimeS:committedAt},cookies,issued.claims,clientResponse);
   if(clientPreparation&&!(response.clientResponse instanceof Response))fail('INVALID_PREPARATION');
   const grants=JSON.stringify(JSON.parse(proof.signature)[3]);
   const sql="UPDATE jwt_v110_families AS f SET previous_fp=refresh_fp,refresh_fp=?,refresh_generation=refresh_generation+1,permission_version=?,unlock_generation=?,last_fg_refresh_s=CASE WHEN ?=1 THEN ? ELSE last_fg_refresh_s END,rotated_at_s=?,rotation_operation_id=? WHERE family_id=? AND refresh_fp=? AND refresh_generation=? AND account_id=? AND parent_session_id=? AND browser_id=? AND browser_generation=? AND credential_epoch=? AND unlock_generation=? AND original_signed_in_at_s=? AND original_expires_at_s=? AND revoked=0 AND original_expires_at_s>? AND (?=1 OR ?-last_fg_refresh_s<5400) AND last_fg_refresh_s<=? AND EXISTS(SELECT 1 FROM jwt_v110_accounts v WHERE v.account_id=f.account_id AND v.active=1 AND v.credential_epoch=f.credential_epoch AND v.permission_version=?) AND EXISTS(SELECT 1 FROM jwt_v110_browser_heads b WHERE b.browser_id=f.browser_id AND b.generation=f.browser_generation) AND NOT EXISTS(SELECT 1 FROM jwt_v110_parent_tombstones t WHERE t.parent_session_id=f.parent_session_id) AND coalesce((SELECT active FROM website_platform_admissions WHERE account_id=f.account_id),0)=? AND (SELECT version FROM split_read_state WHERE singleton=1)=? AND EXISTS(SELECT 1 FROM accounts n JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id) WHERE n.account_id=f.account_id AND n.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND c.credential_epoch=f.credential_epoch AND s.session_id=f.family_id AND s.credential_epoch=f.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>?) AND (SELECT json_group_array(k) FROM (SELECT upper(g.assignment_id)||'|'||upper(g.activity_key) k FROM attendance_substitutes g JOIN activities x USING(activity_key) WHERE g.account_id=f.account_id AND x.active=1 AND x.lifecycle='ACTIVE' AND g.revoked_at IS NULL AND g.starts_at<=? AND max(g.correction_until,coalesce(g.correction_reopen_until,''))>? ORDER BY k))=? RETURNING family_id";
   const args=[nextFP,r.current_permission_version,r.unlock_generation+Number(Boolean(pinAuthority)),Number(Boolean(pinAuthority)||options.foreground===true),committedAt,committedAt,operation,r.family_id,pinAuthority?r.refresh_fp:fp,r.refresh_generation,r.account_id,r.parent_session_id,r.browser_id,r.browser_generation,r.credential_epoch,r.unlock_generation,r.original_signed_in_at_s,r.original_expires_at_s,committedAt,Number(Boolean(pinAuthority)),committedAt,committedAt,r.current_permission_version,authorityBefore.website_admitted,nativeVersion,commitISO,commitISO,commitISO,grants];
   const audit=db.prepare("INSERT INTO jwt_v110_security_audit(operation_id,family_id,event_type,occurred_at_s) SELECT ?,family_id,?,? FROM jwt_v110_families WHERE family_id=? AND refresh_fp=? AND refresh_generation=? AND rotation_operation_id=?").bind(operation,pinAuthority?'pin-unlock':'refresh',committedAt,r.family_id,nextFP,r.refresh_generation+1,operation);
   const receipt=pinAuthority?await prepareNativeRootPINReceipt({db,evidence:pinAuthority.rootPIN,familyId:r.family_id,unlockGeneration:r.unlock_generation+1,refreshGeneration:r.refresh_generation+1,rotationOperationId:operation}):null;
   const result=await db.batch([db.prepare(sql).bind(...args),audit,...(receipt?[receipt.statement]:[])]);
   if(receipt&&(result[2]?.results?.length!==1||result[2].results[0].operation_id!==receipt.operationId))fail('ROOT_PIN_RECEIPT_UNCONFIRMED');
   if(result[0].results.length===1)return response;
  }
  return internal({kind:'retry_required'});
 }});
}
