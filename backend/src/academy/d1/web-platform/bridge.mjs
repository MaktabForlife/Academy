import {queueTimetables} from './timetable.mjs';
import {fail,bytes,verify,envelopePurpose,signedHeaders,sha256,random,challenge,bodyJSON,safeToken,id,text,integer,json} from './protocol.mjs';
export const enabled=env=>env.ACADEMY_WEB_PLATFORM==='1';
const dbFor=env=>env.ACADEMY_DB.withSession('first-primary');
export async function enqueueAccount(db,accountId){
 const op=crypto.randomUUID(),stream='account:'+accountId;
 // Source identity and its monotonic event are captured in one transaction.
 await db.batch([
  db.prepare('INSERT INTO website_platform_streams VALUES(?,1) ON CONFLICT(stream) DO UPDATE SET version=version+1').bind(stream),
  db.prepare(`INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
   SELECT ?,?,v.version,json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',?))
   FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream=? WHERE a.account_id=?`).bind(op,stream,Date.now(),stream,accountId)
 ]);return op;
}
async function signedDelivery(env,row){const delivery={issuedAt:Date.now(),operationId:row.operation_id,stream:row.stream,version:row.version,event:JSON.parse(row.event_json)},signed=await signedHeaders(env.ACADEMY_TO_WEBSITE_SECRET,'/internal/academy/events',delivery);return {delivery,signature:signed.headers['X-Maktab-Signature']};}
async function pendingAccount(env,db,accountId){const rows=(await db.prepare('SELECT * FROM website_platform_outbox WHERE stream=? AND acknowledged=0 ORDER BY version LIMIT 41').bind('account:'+accountId).all()).results;return {deliveries:await Promise.all(rows.slice(0,40).map(row=>signedDelivery(env,row))),acknowledge:rows.slice(0,40).map(row=>row.operation_id),more:rows.length>40};}
async function completeSignIn(env,db,session){
 const result=await pendingAccount(env,db,session.account_id);if(result.more)return {...result,continuation:session.source_ref};
 const code=random(),event={type:'handoff',sourceRef:session.source_ref,accountId:session.account_id,epoch:session.epoch,codeHash:await sha256(code),challenge:session.challenge,state:session.state,expiresAt:Date.now()+60_000};
 const delivery={issuedAt:Date.now(),operationId:crypto.randomUUID(),stream:'handoff:'+event.codeHash,version:1,event},signed=await signedHeaders(env.ACADEMY_TO_WEBSITE_SECRET,'/internal/academy/events',delivery);result.deliveries.push({delivery,signature:signed.headers['X-Maktab-Signature']});return {...result,code};
}
async function sourceSession(db,sourceRef){const row=await db.prepare(`SELECT b.*,a.active,a.admitted,a.global_admin,a.display_name FROM website_platform_sessions b JOIN website_platform_account_state a ON a.account_id=b.account_id COLLATE NOCASE JOIN account_sessions s ON s.session_id=b.session_id AND s.account_id=b.account_id
 WHERE b.source_ref=? AND b.expires_at>? AND a.active=1 AND a.admitted=1 AND a.epoch=b.epoch AND s.credential_epoch=b.epoch AND s.revoked_at IS NULL AND s.expires_at>?`).bind(id(sourceRef),Date.now(),new Date().toISOString()).first();if(!row)throw fail('Sign in to Academy to continue.',401);return row;}
export async function bridge(request,env,{login,mint}){
 if(!enabled(env))throw fail('Website integration is not enabled.',503);
 const path=new URL(request.url).pathname,db=dbFor(env);
 if(await db.prepare('SELECT enabled FROM website_platform_control WHERE singleton=1').first('enabled')!==1)throw fail('Website integration is not activated.',503);
 if(path==='/api/website-platform/config'&&request.method==='GET')return {enabled:true,websiteOrigin:env.WEBSITE_PLATFORM_ORIGIN};
 if(path==='/api/website-platform/exchange'){
  if(request.method!=='POST'||request.headers.get('Origin')!==env.WEBSITE_PLATFORM_ACADEMY_ORIGIN)throw fail('Reopen Academy from the website.',403);
  const input=await bodyJSON(request.body,4096);if(!safeToken(input.code)||!safeToken(input.verifier)||!safeToken(input.state))throw fail('Invalid Academy handoff.',401);
  const hash=await sha256(input.code),code=await db.prepare('SELECT * FROM website_platform_return_codes WHERE code_hash=?').bind(hash).first();
  if(!code||code.used||code.state!==input.state||code.challenge!==await challenge(input.verifier)||code.expires_at<=Date.now())throw fail('Academy handoff expired or was used.',401);
  const session=await sourceSession(db,code.source_ref),guard=crypto.randomUUID();
  await db.batch([db.prepare('INSERT INTO website_platform_guards VALUES(?,EXISTS(SELECT 1 FROM website_platform_return_codes WHERE code_hash=? AND used=0 AND expires_at>?))').bind(guard,hash,Date.now()),db.prepare('UPDATE website_platform_return_codes SET used=1 WHERE code_hash=?').bind(hash),db.prepare('DELETE FROM website_platform_guards WHERE guard_id=?').bind(guard)]);
  return {token:await mint(session),websiteOrigin:env.WEBSITE_PLATFORM_ORIGIN,...(code.return_context?{library:JSON.parse(code.return_context)}:{})};
 }
 if(request.method!=='POST')throw fail('Use a POST request.',405);
 const payload=new TextDecoder().decode(await bytes(request.body,16384));if(!await verify(env.WEBSITE_TO_ACADEMY_SECRET,envelopePurpose('POST',path),payload,request.headers.get('X-Maktab-Signature')))throw fail('Invalid website connection.',401);
 const input=JSON.parse(payload);if(Math.abs(Date.now()-integer(input.issuedAt))>300_000)throw fail('Website request expired.',401);
 if(path==='/internal/website/sign-in'){
  if(!safeToken(input.challenge)||!safeToken(input.state))throw fail('Reopen sign-in from the website.');
  const captured=await login({uniqueid:text(input.uniqueid,160),pin:text(input.pin,4),...(input.setup===true?{setup:true,pinConfirmation:text(input.pinConfirmation,4)}:{})}),state=captured.state,accountId=state.account.account_id;
  const authority=await db.prepare('SELECT * FROM website_platform_account_state WHERE account_id=?').bind(accountId).first();if(!authority?.active||!authority.admitted)throw fail('Website admission is not currently available.',403);
  const sourceRef=random(),expires=Date.now()+7*86400_000;
  await db.prepare('INSERT INTO website_platform_sessions VALUES(?,?,?,?,?,?,?,?)').bind(sourceRef,accountId,captured.sid,state.account.credential_epoch,JSON.stringify(captured.context),expires,input.challenge,input.state).run();
  await enqueueAccount(db,accountId);return completeSignIn(env,db,await sourceSession(db,sourceRef));
 }
 if(path==='/internal/website/ack'){
  if(!Array.isArray(input.operationIds)||input.operationIds.length>40)throw fail('Invalid acknowledgement.');for(const operationId of input.operationIds)id(operationId);await db.prepare('UPDATE website_platform_outbox SET acknowledged=1 WHERE operation_id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(input.operationIds)).run();return {acknowledged:true};
 }
 if(path==='/internal/website/status'){
  const session=await sourceSession(db,input.sourceRef);if(!input.draining)await enqueueAccount(db,session.account_id);const result=await pendingAccount(env,db,session.account_id);return result.more?{...result,continuation:session.source_ref,statusOnly:true}:result;
 }
 if(path==='/internal/website/continue-sign-in'){const session=await sourceSession(db,input.sourceRef);if(input.statusOnly){const result=await pendingAccount(env,db,session.account_id);return result.more?{...result,continuation:session.source_ref,statusOnly:true}:result;}return completeSignIn(env,db,session);}
 if(path==='/internal/website/open-academy'){
  const session=await sourceSession(db,input.sourceRef);if(!safeToken(input.challenge)||!safeToken(input.state))throw fail('Reopen Academy from the website.');let context=null;
  if(input.library){const websiteId=id(input.library.websiteId),lessonId=input.library.lessonId?id(input.library.lessonId):null,origin=new URL(env.WEBSITE_PLATFORM_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==env.WEBSITE_PLATFORM_ORIGIN)throw fail('Invalid website return origin.',503);context={websiteId,lessonId,returnUrl:origin.origin+'/?'+new URLSearchParams({website:websiteId,...(lessonId?{lesson:lessonId}:{})})};}
  const code=random();await db.prepare('INSERT INTO website_platform_return_codes(code_hash,source_ref,challenge,state,expires_at,used,return_context) VALUES(?,?,?,?,?,0,?)').bind(await sha256(code),session.source_ref,input.challenge,input.state,Date.now()+60_000,context?JSON.stringify(context):null).run();return {code};
 }
 if(path==='/internal/website/identity')return identity(db,env,input);
 throw fail('Unknown website connection action.',404);
}
async function identity(db,env,input){
 const session=await sourceSession(db,input.sourceRef);if(session.account_id!==input.actorId||session.epoch!==input.actorEpoch)throw fail('Your administrator account changed.',403);
 const offer=id(input.offeringId),isCreate=input.create===true,allowed=session.global_admin||isCreate&&offer.toUpperCase().startsWith('COURSE:')&&await db.prepare("SELECT 1 FROM effective_activity_roles WHERE account_id=? AND activity_key=? COLLATE NOCASE AND role='PROGRAM_ADMIN'").bind(session.account_id,offer).first();
 if(!allowed)throw fail('Your Academy scope cannot create or link this account.',403);
 const canonical={operationId:id(input.operationId),offeringId:offer,actorId:input.actorId,actorEpoch:input.actorEpoch,...(isCreate?{displayName:text(input.displayName,160),create:true}:{accountId:id(input.accountId)})},hash=await sha256(JSON.stringify(canonical));
 let receipt=await db.prepare('SELECT * FROM website_platform_provisioning WHERE operation_id=?').bind(input.operationId).first();
 if(receipt&&(receipt.actor_id!==session.account_id||receipt.payload_hash!==hash))throw fail('This enrolment operation has different details.',409);
 if(!receipt){
  const accountId=isCreate?crypto.randomUUID():id(input.accountId),guard=crypto.randomUUID(),statements=[];
  if(!isCreate&&!await db.prepare('SELECT account_id FROM accounts WHERE account_id=?').bind(accountId).first())throw fail('Choose an existing Academy account.',404);
  statements.push(db.prepare(`INSERT INTO website_platform_guards VALUES(?,EXISTS(SELECT 1 FROM website_platform_sessions b JOIN accounts a ON a.account_id=b.account_id COLLATE NOCASE JOIN account_credentials c ON c.account_id=a.account_id JOIN account_sessions s ON s.session_id=b.session_id WHERE b.source_ref=? AND a.active=1 AND COALESCE((SELECT x.active FROM website_platform_admissions x WHERE x.account_id=a.account_id),1)=1 AND b.epoch=c.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>? AND (EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.active=1 AND g.review_state='CONFIRMED' AND g.role='GLOBAL_ADMIN') OR (?=1 AND EXISTS(SELECT 1 FROM effective_activity_roles r JOIN activities x USING(activity_key) WHERE r.account_id=a.account_id AND r.activity_key=? COLLATE NOCASE AND r.role='PROGRAM_ADMIN' AND x.kind='COURSE' AND x.active=1 AND x.lifecycle='ACTIVE')))))`).bind(guard,session.source_ref,new Date().toISOString(),Number(isCreate),offer));
  if(isCreate){const now=new Date().toISOString();statements.push(db.prepare('INSERT INTO accounts(account_id,display_name,login_link_id,active,created_at,updated_at,created_by_source_id,modified_by_source_id,revision) VALUES(?,?,?,1,?,?,?,?,1)').bind(accountId,canonical.displayName,random(),now,now,session.account_id,session.account_id),db.prepare('INSERT INTO account_credentials(account_id,pin_setup,credential_epoch) VALUES(?,0,1)').bind(accountId));}
  statements.push(db.prepare('INSERT INTO website_platform_admissions VALUES(?,1) ON CONFLICT(account_id) DO NOTHING').bind(accountId),db.prepare('INSERT INTO website_platform_provisioning VALUES(?,?,?,?,NULL)').bind(input.operationId,session.account_id,hash,accountId),db.prepare("INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json) VALUES(?,?,?,?,?,?,'USER_ACCOUNT',?,?)").bind(crypto.randomUUID(),new Date().toISOString(),session.account_id,session.global_admin?'GLOBAL_ADMIN':'PROGRAM_ADMIN',offer,isCreate?'WEBSITE_ACCOUNT_CREATE':'WEBSITE_ACCOUNT_LINK',accountId,JSON.stringify(isCreate?['DisplayName','AccountID','WebsiteAdmission']:['AccountID','WebsiteAdmission'])),db.prepare('DELETE FROM website_platform_guards WHERE guard_id=?').bind(guard));
  try{await db.batch(statements);}catch(error){receipt=await db.prepare('SELECT * FROM website_platform_provisioning WHERE operation_id=?').bind(input.operationId).first();if(!receipt||receipt.payload_hash!==hash)throw error;}
  receipt||={account_id:accountId};
 }
 const row=await db.prepare('SELECT * FROM website_platform_account_state WHERE account_id=?').bind(receipt.account_id).first();
 const loginId=await db.prepare('SELECT login_link_id FROM accounts WHERE account_id=?').bind(row.account_id).first('login_link_id');
 const initial={type:'identity-linked',operationId:input.operationId,loginPath:'/account/'+loginId,account:{accountId:row.account_id,displayName:row.display_name,active:Boolean(row.active),admitted:Boolean(row.admitted),epoch:row.epoch,globalAdmin:Boolean(row.global_admin),verifiedAt:Date.now()}};
 await db.prepare('UPDATE website_platform_provisioning SET event_json=? WHERE operation_id=? AND event_json IS NULL').bind(JSON.stringify(initial),input.operationId).run();
 const event=JSON.parse(await db.prepare('SELECT event_json FROM website_platform_provisioning WHERE operation_id=?').bind(input.operationId).first('event_json')),delivery={issuedAt:Date.now(),operationId:'identity:'+input.operationId,stream:'identity:'+input.operationId,version:1,event},signed=await signedHeaders(env.ACADEMY_TO_WEBSITE_SECRET,'/internal/academy/events',delivery);
 return {delivery,signature:signed.headers['X-Maktab-Signature']};
}
export async function recoverWebsite(env,{fetcher=fetch,limit=20}={}){
 if(!enabled(env))return;const db=dbFor(env),origin=new URL(env.WEBSITE_PLATFORM_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==env.WEBSITE_PLATFORM_ORIGIN)throw fail('Invalid website receiver.',503);
 if(await db.prepare('SELECT enabled FROM website_platform_control WHERE singleton=1').first('enabled')!==1)return;
 await queueTimetables(db,{limit:2});
 const rows=(await db.prepare(`SELECT q.* FROM (SELECT * FROM website_platform_outbox WHERE acknowledged=0 AND next_attempt<=? ORDER BY next_attempt,stream,version LIMIT ?) q
  WHERE NOT EXISTS(SELECT 1 FROM website_platform_outbox older WHERE older.stream=q.stream AND older.acknowledged=0 AND older.version<q.version)`).bind(Date.now(),Math.min(40,limit)).all()).results;
 for(const row of rows){try{const item=await signedDelivery(env,row),reply=await fetcher(origin.origin+'/internal/academy/events',{method:'POST',headers:{'Content-Type':'application/json','X-Maktab-Signature':item.signature},body:JSON.stringify(item.delivery),redirect:'manual',signal:AbortSignal.timeout(5000)});const body=await bodyJSON(reply.body,4096);if(!reply.ok||body.version!==row.version)throw Error();await db.prepare('UPDATE website_platform_outbox SET acknowledged=1 WHERE operation_id=?').bind(row.operation_id).run();}catch{await db.prepare('UPDATE website_platform_outbox SET attempts=attempts+1,next_attempt=? WHERE operation_id=?').bind(Date.now()+Math.min(3600_000,5000*2**Math.min(row.attempts,9)),row.operation_id).run();}}
}
