// SOURCE ONLY. Status projection for the genuine current native Studio Admin.
// No browser fields select account/authority. No global fetch or automatic resend.
import {academyD1Repository} from '../../academy/d1/repository.js';
import {authenticatedD1Account} from '../../academy/d1/session.js';
import {actualState,isAdminWorkspace} from '../../academy/d1/workspace-access.js';
import {trustedCookieFacts,jwtSessionPredicate} from './academy-cookie-auth.mjs';
import {enqueueAccount,signedDelivery} from '../../academy/d1/web-platform/bridge-current-account-status-v1.mjs';
import {sign,verify,sha256} from '../../academy/d1/web-platform/protocol.mjs';
import {nativeAccountStatusBinding,nativeAccountStatusPurpose,nativeAccountStatusACKPurpose,accountStatusProfile,accountStatusFrame,accountStatusACK,statusFail,statusUint} from './native-current-account-status-contract-v3.mjs';
const root='https://ummabbadacademy.app',path='/api/academy/website-studio/handoff';
function current(c,now,version){
 const jwt=jwtSessionPredicate(c,now);
 return {sql:`EXISTS(SELECT 1 FROM accounts a JOIN account_credentials cred USING(account_id) JOIN account_sessions s USING(account_id)
 WHERE a.account_id=? AND a.active=1 AND cred.credential_epoch=? AND cred.pin_setup=1 AND length(trim(cred.pin_hash))>0
 AND s.session_id=? AND s.credential_epoch=cred.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>?`+jwt.sql+`
 AND EXISTS(SELECT 1 FROM website_platform_account_state w WHERE w.account_id=a.account_id AND w.active=1 AND w.admitted=1 AND w.epoch=cred.credential_epoch)
 AND (SELECT version FROM split_read_state WHERE singleton=1)=?)`,args:[c.sub,c.ce,c.sid,new Date(now).toISOString(),...jwt.values,version]};
}
const captureSQL=`SELECT operation_id,stream,version,event_json,acknowledged,attempts,next_attempt,
 (SELECT version FROM split_read_state WHERE singleton=1) core_revision
 FROM website_platform_outbox WHERE stream=? AND version=(SELECT version FROM website_platform_streams WHERE stream=?)`;
function row(r,c){
 if(!r||r.stream!=='account:'+c.sub||!statusUint(r.version)||r.version<1||r.acknowledged!==0||!statusUint(r.attempts)||!statusUint(r.core_revision)||typeof r.operation_id!=='string'||typeof r.event_json!=='string'||new TextEncoder().encode(r.event_json).length>12288)statusFail('NATIVE_ACCOUNT_STREAM_UNRESOLVED');
 let e;try{e=JSON.parse(r.event_json);}catch{statusFail();}
 if(e?.type!=='account'||e.account?.accountId!==c.sub||e.account?.epoch!==c.ce||e.account?.active!==true||e.account?.admitted!==true)statusFail('NATIVE_ACCOUNT_STREAM_REQUIRES_NATIVE_RECONCILIATION');return r;
}
async function refreshCurrentNativeStudioAccountImplementation({request,env}){
 accountStatusProfile(env,'academy');
 const u=new URL(request.url);
 if(u.origin!==root||u.pathname!==path||u.search||request.method!=='POST'||request.signal.aborted||request.headers.get('Origin')!==root||request.headers.get('Sec-Fetch-Site')!=='same-origin'||request.headers.has('Host')&&request.headers.get('Host')!==u.host)statusFail();
 const peer=env[nativeAccountStatusBinding];
 if(typeof peer?.deliverCurrentAccountEvent!=='function'||typeof peer?.readCurrentAccountReceipt!=='function')statusFail();
 const started=Date.now(),until=started+5000;
 const check=()=>{if(request.signal.aborted||Date.now()<started||Date.now()>=until)statusFail();};
 const repo=academyD1Repository(env),auth=await authenticatedD1Account(request,env,repo);repo.bindActor?.(auth);
 const c=trustedCookieFacts(auth),state=actualState(auth);
 if(!c||c.sid!==c.psid||state.account.account_id!==c.sub||state.account.credential_epoch!==c.ce||!isAdminWorkspace(auth)||auth.adminView||!state.account.global_admin&&!state.roles.some(r=>r.role==='PROGRAM_ADMIN'))statusFail('NATIVE_ACCOUNT_STATUS_AUTHORITY_REQUIRED');
 if(typeof env.JWT_V110_RATE_LIMITER?.limit!=='function'||(await env.JWT_V110_RATE_LIMITER.limit({key:'v110-studio-account-status-'+await sha256(c.sub+'|'+c.sid)}))?.success!==true)statusFail('NATIVE_ACCOUNT_STATUS_RATE_LIMITED');
 const db=env.ACADEMY_DB.withSession('first-primary'),version=await db.prepare('SELECT version FROM split_read_state WHERE singleton=1').first('version');
 if(!statusUint(version))statusFail();check();
 const stream='account:'+c.sub,g=current(c,Date.now(),version);
 const pending=(await db.prepare('SELECT operation_id,stream,version,event_json,acknowledged,attempts,next_attempt,(SELECT version FROM split_read_state WHERE singleton=1) core_revision FROM website_platform_outbox WHERE stream=? AND acknowledged=0 AND ('+g.sql+') ORDER BY version LIMIT 2').bind(stream,...g.args).all())?.results;
 if(!Array.isArray(pending)||pending.length>1)statusFail('NATIVE_ACCOUNT_STREAM_REQUIRES_NATIVE_RECONCILIATION');
 let selected=pending.length?row(pending[0],c):null;
 if(!selected){
  let capture=null,used=false;const guarded={
   prepare:db.prepare.bind(db),
   batch:async statements=>{
    if(used||!Array.isArray(statements)||statements.length!==2)statusFail();used=true;check();
    const f=current(c,Date.now(),version),guardId=crypto.randomUUID();
    const result=await db.batch([
     db.prepare('INSERT INTO academy_write_guards(guard_id,accepted) SELECT ?,('+f.sql+') AND NOT EXISTS(SELECT 1 FROM website_platform_outbox WHERE stream=? AND acknowledged=0)').bind(guardId,...f.args,stream),
     ...statements,db.prepare('DELETE FROM academy_write_guards WHERE guard_id=?').bind(guardId),
     db.prepare(captureSQL).bind(stream,stream)
    ]);
    const records=result?.at(-1)?.results;if(!Array.isArray(records)||records.length!==1)statusFail();capture=records[0];return result.slice(1,3);
   }
  };
  const operationId=await enqueueAccount(guarded,c.sub,env);
  if(!capture||capture.operation_id!==operationId)statusFail();selected=row(capture,c);
 }
 check();if(selected.core_revision!==version)statusFail('NATIVE_ACCOUNT_SOURCE_CHANGED');
 const profile=await db.prepare('SELECT display_name,active,admitted,epoch,global_admin FROM website_platform_account_state WHERE account_id=?').bind(c.sub).first();
 const nativeEvent=JSON.parse(selected.event_json),a=nativeEvent.account;
 if(!profile||a.displayName!==profile.display_name||a.active!==Boolean(profile.active)||a.admitted!==Boolean(profile.admitted)||a.epoch!==profile.epoch||a.globalAdmin!==Boolean(profile.global_admin))statusFail('NATIVE_ACCOUNT_SOURCE_CHANGED');
 const item=await signedDelivery(env,selected);
 const frame={ver:1,purpose:'uaa-native-current-account-status-v1',source:{accountId:c.sub,credentialEpoch:c.ce,permissionVersion:c.pv,coreRevision:version,startedAtMs:started,parentId:c.sid,browserId:c.bsid,browserGeneration:c.bv,originalSignedAtS:c.s_iat,originalExpiresAtS:c.s_exp},nativeBody:JSON.stringify(item.delivery),nativeSignature:item.signature};
 const body=JSON.stringify(frame),parsed=accountStatusFrame(body);
 if(new TextEncoder().encode(body).length>16384)statusFail();
 const packet={app:'studio',body,signature:await sign(env.ACADEMY_TO_WEBSITE_SECRET,nativeAccountStatusPurpose,body),deadlineMs:5000},alreadyAttempted=selected.attempts>0;
 if(!alreadyAttempted){
  check();const f=current(c,Date.now(),version),guardId=crypto.randomUUID();
  const r=await db.batch([
   db.prepare('INSERT INTO academy_write_guards(guard_id,accepted) SELECT ?,('+f.sql+')').bind(guardId,...f.args),
   db.prepare('UPDATE website_platform_outbox SET attempts=attempts+1 WHERE operation_id=? AND stream=? AND version=? AND event_json=? AND acknowledged=0 AND attempts=0 RETURNING operation_id').bind(selected.operation_id,stream,selected.version,selected.event_json),
   db.prepare('DELETE FROM academy_write_guards WHERE guard_id=?').bind(guardId)
  ]);
  if(r?.[1]?.results?.length!==1||r[1].results[0].operation_id!==selected.operation_id)statusFail();
 }
 check();let timer,reply;
 try{
  const call=alreadyAttempted?peer.readCurrentAccountReceipt(packet):peer.deliverCurrentAccountEvent(packet);
  reply=await Promise.race([Promise.resolve(call),new Promise((_yes,no)=>{timer=setTimeout(()=>no(Object.assign(Error('NATIVE_ACCOUNT_STATUS_UNCERTAIN'),{code:'NATIVE_ACCOUNT_STATUS_UNCERTAIN',status:503})),Math.max(1,until-Date.now()));})]);
 }finally{clearTimeout(timer);}
 check();
 if(!reply||typeof reply.body!=='string'||new TextEncoder().encode(reply.body).length>4096||!await verify(env.WEBSITE_TO_ACADEMY_SECRET,nativeAccountStatusACKPurpose,reply.body,reply.signature))statusFail();
 const ack=accountStatusACK(reply.body),digest=await sha256(JSON.stringify({stream:parsed.delivery.stream,version:parsed.delivery.version,event:parsed.delivery.event}));
 if(ack.operationId!==selected.operation_id||ack.stream!==stream||ack.version!==selected.version||ack.eventDigest!==digest||ack.requestDigest!==await sha256(packet.body)||ack.accountId!==c.sub||ack.credentialEpoch!==c.ce||ack.permissionVersion!==c.pv||ack.coreRevision!==version||ack.authorityRevision<1)statusFail();
 if(ack.status==='NOT_COMMITTED')statusFail('NATIVE_ACCOUNT_STATUS_RECONCILIATION_REQUIRED');
 if(ack.verifiedAt!==a.verifiedAt)statusFail();check();
 const f=current(c,Date.now(),version),guardId=crypto.randomUUID();
 const marked=await db.batch([
  db.prepare('INSERT INTO academy_write_guards(guard_id,accepted) SELECT ?,('+f.sql+')').bind(guardId,...f.args),
  db.prepare('UPDATE website_platform_outbox SET acknowledged=1 WHERE operation_id=? AND stream=? AND version=? AND event_json=? AND acknowledged=0 AND attempts>0 RETURNING operation_id').bind(selected.operation_id,stream,selected.version,selected.event_json),
  db.prepare('DELETE FROM academy_write_guards WHERE guard_id=?').bind(guardId)
 ]);
 if(marked?.[1]?.results?.length!==1||marked[1].results[0].operation_id!==selected.operation_id)statusFail('NATIVE_ACCOUNT_STATUS_ACK_MARK_UNCERTAIN');
 check();const final=current(c,Date.now(),version);if((await db.prepare('SELECT ('+final.sql+') accepted').bind(...final.args).first())?.accepted!==1)statusFail();
 if(alreadyAttempted)statusFail('NATIVE_ACCOUNT_STATUS_RECONCILED_REQUIRES_NEW_ACTION');
 if(ack.verifiedAt<Date.now()-43200000||ack.verifiedAt>Date.now()+30000)statusFail('NATIVE_ACCOUNT_STATUS_NOT_FRESH');
 return Object.freeze({confirmed:true,accountOnly:true,sourceCurrent:true});
}

export async function refreshCurrentNativeStudioAccount(input){
 try{return await refreshCurrentNativeStudioAccountImplementation(input);}
 catch(error){
  if(typeof error?.code==='string'&&/^NATIVE_ACCOUNT_[A-Z_]+$/.test(error.code)&&[409,503].includes(error.status))throw error;
  if(error?.status===401)throw Object.assign(Error('Native current account required'),{code:'SESSION_ENDED',status:401});
  if(error?.status===403)throw Object.assign(Error('Native account authority required'),{code:'NATIVE_ACCOUNT_STATUS_AUTHORITY_REQUIRED',status:403});
  statusFail();
 }
}

