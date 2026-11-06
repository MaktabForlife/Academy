// Server-only composition after the existing native PIN handler succeeds.
// Five auth-metadata tables in the native Core; no separate identity/auth DB.
import {AuthContractError,parseUniqueCookie,cookieNames} from './claims.mjs';
import {fingerprint,randomRefresh} from './store.mjs';
import {createAccountBoundAcademyRefresh} from './academy-refresh.mjs';
const fail=code=>{throw new AuthContractError(code);};
function currentRaw(request){
 const header=request.headers.get('Cookie')||'';
 if(!header.split(';').some(x=>x.trim().startsWith(cookieNames.academy.refresh+'=')))return null;
 return parseUniqueCookie(header,cookieNames.academy.refresh);
}
function hidden(body,cookies,claims,clientResponse){
 const value={...body};Object.defineProperty(value,'setCookies',{value:Object.freeze(cookies),enumerable:false});
 Object.defineProperty(value,'claims',{value:claims,enumerable:false});if(clientResponse)Object.defineProperty(value,'clientResponse',{value:clientResponse,enumerable:false});return Object.freeze(value);
}
export async function issueAcademySessionFromNativePIN({request,env,repository,native,config,clock=()=>Math.floor(Date.now()/1000)}){
 if(!native?.state?.account||typeof native.sid!=='string'||!native.context||!repository?.session)fail('INVALID_NATIVE_PIN_RESULT');
 const id=native.state.account.account_id,ce=native.state.account.credential_epoch,db=repository.mediaPlaylistSource.db,now=clock();
 let familyId=native.sid,created=false;
 try{
  // This session can originate only in the existing rate-limited native PIN
  // flow. Its credential/context checks are not replaced by a client assertion.
  const state=await repository.session(native.sid,id,ce,new Date(now*1000));
  if(!state||state.account.account_id!==id||state.account.credential_epoch!==ce)fail('SESSION_ENDED');
  const raw=currentRaw(request),fp=raw?await fingerprint('academy',raw):null;
  const old=fp?(await db.prepare("SELECT f.* FROM jwt_v110_families f JOIN jwt_v110_accounts v USING(account_id) JOIN jwt_v110_browser_heads b USING(browser_id) JOIN accounts n USING(account_id) JOIN account_credentials c USING(account_id) JOIN account_sessions s ON s.session_id=f.family_id AND s.account_id=f.account_id WHERE (f.refresh_fp=? OR f.previous_fp=?) AND f.revoked=0 AND v.active=1 AND v.credential_epoch=f.credential_epoch AND n.active=1 AND c.credential_epoch=f.credential_epoch AND s.credential_epoch=f.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>? AND b.generation=f.browser_generation AND f.original_expires_at_s>? AND NOT EXISTS(SELECT 1 FROM jwt_v110_parent_tombstones t WHERE t.parent_session_id=f.parent_session_id)").bind(fp,fp,new Date(now*1000).toISOString(),now).all()).results[0]:null;
  let issued;
  if(old&&old.account_id===id&&old.credential_epoch===ce){
   familyId=old.family_id;
   // The provisional native PIN session is never returned as a credential.
   // Unlock reuses the old parent and absolute deadline, not a fresh seven days.
   await repository.revoke(native.sid,id);
   const refresh=await createAccountBoundAcademyRefresh({binding:env.ACADEMY_DB,repository,clock,...config,pinAuthority:{accountId:id,credentialEpoch:ce}});
   issued=await refresh.refreshAndIssue(raw);
  }else{
   const session=(await db.prepare('SELECT created_at,expires_at FROM account_sessions WHERE session_id=? AND account_id=? AND credential_epoch=? AND revoked_at IS NULL').bind(native.sid,id,ce).all()).results[0];
   if(!session)fail('SESSION_ENDED');
   const start=Math.floor(Date.parse(session.created_at)/1000),expiry=Math.floor(Date.parse(session.expires_at)/1000);
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(expiry)||start>now||expiry<=now||expiry-start>604800)fail('INVALID_TIME');
   const browser=old?.browser_id||crypto.randomUUID(),generation=old?old.browser_generation+1:1,operation=crypto.randomUUID(),secret=randomRefresh(),secretFP=await fingerprint('academy',secret);
   const statements=[
    db.prepare("INSERT INTO jwt_v110_accounts(account_id,credential_epoch,permission_version,active) SELECT n.account_id,c.credential_epoch,1,1 FROM accounts n JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id) WHERE n.account_id=? AND n.active=1 AND c.credential_epoch=? AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND s.session_id=? AND s.credential_epoch=c.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>? ON CONFLICT(account_id) DO UPDATE SET credential_epoch=excluded.credential_epoch,active=excluded.active").bind(id,ce,native.sid,new Date(now*1000).toISOString())
   ];
   if(old){
    statements.push(db.prepare("UPDATE jwt_v110_browser_heads SET generation=?,last_operation_id=? WHERE browser_id=? AND generation=? AND EXISTS(SELECT 1 FROM jwt_v110_families WHERE family_id=? AND revoked=0 AND refresh_fp=? AND browser_generation=?)").bind(generation,operation,browser,old.browser_generation,old.family_id,old.refresh_fp,old.browser_generation));
    statements.push(db.prepare("UPDATE account_sessions SET revoked_at=? WHERE session_id IN(SELECT family_id FROM jwt_v110_families WHERE browser_id=? AND browser_generation<=?) AND EXISTS(SELECT 1 FROM jwt_v110_browser_heads WHERE browser_id=? AND generation=? AND last_operation_id=?)").bind(new Date(now*1000).toISOString(),browser,old.browser_generation,browser,generation,operation));
    statements.push(db.prepare("INSERT INTO jwt_v110_parent_tombstones SELECT parent_session_id,original_expires_at_s FROM jwt_v110_families WHERE browser_id=? AND browser_generation<=? AND EXISTS(SELECT 1 FROM jwt_v110_browser_heads WHERE browser_id=? AND generation=? AND last_operation_id=?) ON CONFLICT(parent_session_id) DO UPDATE SET expires_at_s=max(expires_at_s,excluded.expires_at_s)").bind(browser,old.browser_generation,browser,generation,operation));
    statements.push(db.prepare("UPDATE jwt_v110_families SET revoked=1 WHERE browser_id=? AND browser_generation<=? AND EXISTS(SELECT 1 FROM jwt_v110_browser_heads WHERE browser_id=? AND generation=? AND last_operation_id=?)").bind(browser,old.browser_generation,browser,generation,operation));
   }else statements.push(db.prepare('INSERT INTO jwt_v110_browser_heads(browser_id,generation,last_operation_id) VALUES(?,?,?)').bind(browser,generation,operation));
   statements.push(db.prepare("INSERT INTO jwt_v110_families(family_id,account_id,parent_session_id,browser_id,browser_generation,credential_epoch,permission_version,refresh_fp,original_signed_in_at_s,original_expires_at_s,last_fg_refresh_s,rotated_at_s,rotation_operation_id) SELECT ?,v.account_id,?,?,?,?,v.permission_version,?,?,?,?,?,? FROM jwt_v110_accounts v JOIN accounts n USING(account_id) JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id) JOIN jwt_v110_browser_heads b ON b.browser_id=? WHERE v.account_id=? AND v.active=1 AND v.credential_epoch=? AND n.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND c.credential_epoch=v.credential_epoch AND s.session_id=? AND s.credential_epoch=v.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>? AND b.generation=? AND b.last_operation_id=?").bind(native.sid,native.sid,browser,generation,ce,secretFP,start,expiry,now,now,operation,browser,id,ce,native.sid,new Date(now*1000).toISOString(),generation,operation));
   // NULL family on a lost conditional create aborts the whole same-Core batch.
   statements.push(db.prepare("INSERT INTO jwt_v110_security_audit(operation_id,family_id,event_type,occurred_at_s) VALUES(?,(SELECT family_id FROM jwt_v110_families WHERE family_id=? AND rotation_operation_id=?),'sign-in',?)").bind(operation,native.sid,operation,now));
   await db.batch(statements);created=true;
   const refresh=await createAccountBoundAcademyRefresh({binding:env.ACADEMY_DB,repository,clock,...config});
   issued=await refresh.refreshAndIssue(secret,{foreground:true});
  }
  if(issued.kind!=='rotated')fail('SIGN_IN_RETRY_REQUIRED');
  return hidden({familyId,unlocked:familyId!==native.sid,nativeAccountId:id,lastForegroundRefreshS:issued.lastForegroundRefreshS,serverTimeS:issued.serverTimeS},issued.setCookies,issued.claims,issued.clientResponse);
 }catch(error){
  // An unpublished first-family secret cannot be recovered from stored hashes.
  // Disable its staged native/family records on failure; never mint legacy
  // credentials or revive the previously cancelled browser state.
  if(created)await db.prepare('UPDATE jwt_v110_families SET revoked=1 WHERE family_id=? AND account_id=?').bind(native.sid,id).run();
  await repository.revoke(native.sid,id);throw error;
 }
}
