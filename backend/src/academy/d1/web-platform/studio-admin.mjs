import {liveAllocation,saveLiveAllocation} from './studio-live.mjs';
import {enqueueAccount,pendingAccount,sourceSession} from './bridge.mjs';
import {markAccess,queueAccess,importAccessPage,accessStream} from './access.mjs';
import {id,integer,fail,random,signedHeaders,bodyJSON} from './protocol.mjs';

// All actor facts originate in current Core state, never in browser fields.
async function adminProof(db,auth){
 const now=Date.now(),iso=new Date(now).toISOString(),a=auth.state.account;
 const current=await db.prepare(`SELECT a.*,s.expires_at native_expires_at FROM website_platform_account_state a JOIN account_sessions s ON s.account_id=a.account_id COLLATE NOCASE WHERE s.session_id=? AND a.account_id=? COLLATE NOCASE AND a.active=1 AND a.admitted=1 AND a.epoch=? AND s.credential_epoch=a.epoch AND s.revoked_at IS NULL AND s.expires_at>?`).bind(auth.sid,a.account_id,a.credential_epoch,iso).first();
 if(!current)throw fail('Your Academy session has ended.',401,'SESSION_ENDED');
 let session=await db.prepare('SELECT * FROM website_platform_sessions WHERE session_id=? AND epoch=? AND expires_at>? ORDER BY expires_at DESC LIMIT 1').bind(auth.sid,current.epoch,now).first();
 if(!session){const ref=random();await db.prepare('INSERT INTO website_platform_sessions VALUES(?,?,?,?,?,?,?,?)').bind(ref,current.account_id,auth.sid,current.epoch,JSON.stringify(auth.context),now+7*86400_000,random(),random()).run();session=await sourceSession(db,ref);}
 return {sourceRef:session.source_ref,accountId:current.account_id,epoch:current.epoch,verifiedAt:now,expiresAt:Math.min(now+55_000,Date.parse(current.native_expires_at),session.expires_at),globalAdmin:Boolean(current.global_admin)};
}

export async function studioAdmin(env,auth,input,{fetcher=env.WEBSITE_PLATFORM_SERVICE?.fetch.bind(env.WEBSITE_PLATFORM_SERVICE)||fetch}={}){
 const db=env.ACADEMY_DB.withSession('first-primary');
 const activity=id(input.activityKey),mapping=await db.prepare('SELECT t.offering_id,t.kind,s.enabled,s.revision generation FROM website_platform_timetable_scopes t JOIN website_platform_access_scopes s USING(activity_key) WHERE t.activity_key=? COLLATE NOCASE').bind(activity).first();if(!mapping)throw fail('This programme has no Studio access migration.',404,'STUDIO_SCOPE_UNMAPPED');
 const allowed=await db.prepare(`SELECT 1 FROM website_platform_account_state a JOIN account_sessions s ON s.account_id=a.account_id COLLATE NOCASE WHERE s.session_id=? AND a.account_id=? COLLATE NOCASE AND a.active=1 AND a.admitted=1 AND a.epoch=? AND s.credential_epoch=a.epoch AND s.revoked_at IS NULL AND s.expires_at>? AND (a.global_admin=1 OR EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=? COLLATE NOCASE AND r.role='PROGRAM_ADMIN'))`).bind(auth.sid,auth.state.account.account_id,auth.state.account.credential_epoch,new Date().toISOString(),activity).first();
 if(!allowed)throw fail('Current Admin authority is required for this programme.',403,'ADMIN_SCOPE_REQUIRED');
 const owner=await db.prepare('SELECT * FROM website_platform_access_ownership WHERE activity_key=? COLLATE NOCASE').bind(activity).first(),command=input.command||{action:'read'};
 if(!owner||owner.state==='ACADEMY'){if(command.action==='read')return {success:true,legacyOnly:true,ownership:{authority:'ACADEMY'}};if(!command.action?.startsWith('handover-'))throw fail('Manage enrolment and access in the current Academy controls until handover.',409,'ACADEMY_AUTHORITY');}
 if(env.ACADEMY_WEB_PLATFORM!=='1'||await db.prepare('SELECT enabled FROM website_platform_control WHERE singleton=1').first('enabled')!==1)throw fail('Studio integration is unavailable. Keep the current authority locked.',503,'STUDIO_UNAVAILABLE');
 if(!mapping.enabled&&!['handover-status','handover-abort','handover-commit'].includes(command.action))throw fail('This migration scope is unavailable.',503,'STUDIO_UNAVAILABLE');
 const proof=await adminProof(db,auth);
 const send=async command=>{
  if(['handover-begin','handover-page','handover-commit'].includes(command.action)&&!await db.prepare("SELECT 1 FROM website_platform_access_ownership WHERE activity_key=? AND transfer_id=? AND state='FROZEN'").bind(activity,command.transferId).first())throw fail('This handover is no longer frozen. Start a new transfer after cancellation.',409,'HANDOVER_NOT_FROZEN');
  await enqueueAccount(db,proof.accountId,env);
  // Only this actor and offering; never sweep other participants for an Admin read.
  if(!owner||owner.state!=='FROZEN'){await queueAccess(db,{onlyScope:activity,onlyAccount:''});await markAccess(db,activity,proof.accountId);await queueAccess(db,{onlyScope:activity,onlyAccount:proof.accountId.toLowerCase()});}
  const pending=await pendingAccount(env,db,proof.accountId),origin=new URL(env.WEBSITE_PLATFORM_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==env.WEBSITE_PLATFORM_ORIGIN)throw fail('Invalid Studio server origin.',503);
  const path='/internal/studio/access',envelope={issuedAt:Date.now(),proof,offeringId:mapping.offering_id,command,deliveries:pending.deliveries,more:pending.more};if(new TextEncoder().encode(JSON.stringify(envelope)).length>250_000){envelope.command={action:'read'};envelope.more=true;}const signed=await signedHeaders(env.ACADEMY_TO_WEBSITE_SECRET,path,envelope);
  const response=await fetcher(origin.origin+path,{method:'POST',headers:signed.headers,body:signed.payload,redirect:'manual',signal:AbortSignal.timeout(8000)}),result=await bodyJSON(response.body,262144);
  const acknowledge=result.acknowledge;if(!Array.isArray(acknowledge)||acknowledge.some(x=>!pending.acknowledge.includes(x)))throw fail('Invalid Studio acknowledgement.',503);
  if(acknowledge.length)await db.prepare('UPDATE website_platform_outbox SET acknowledged=1 WHERE operation_id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(acknowledge)).run();
  if(!response.ok)throw fail(result.error||'Studio could not confirm the change.',response.status,result.code||'STUDIO_UNAVAILABLE');
  if(env.ENVIRONMENT==='local')result.localReadBudget={targetRowsRead:Number(response.headers.get('X-Local-D1-Rows-Read')),targetQueries:Number(response.headers.get('X-Local-D1-Queries'))};
  delete result.acknowledge;if(result.pending)throw fail('Access confirmation is catching up. Retry this same action.',409,'STUDIO_CONFIRMATION_PENDING');return result;
 };
 if(command.action?.startsWith('handover-')){
  if(!proof.globalAdmin)throw fail('Only Global Admin can hand over an offering.',403);
  return handover(db,activity,mapping,owner,proof,command,send);
 }
 if(owner?.state==='FROZEN'&&command.action==='read')return {success:true,blocked:true,ownership:{authority:'FROZEN'}};
 if(owner?.state==='FROZEN')throw fail('The handover is in progress. Keep access edits locked until it finishes.',409,'HANDOVER_IN_PROGRESS');
 if(command.action==='live-allocation'){
  if(mapping.kind!=='TAFSEER'||owner?.state!=='STUDIO')throw fail('Complete the offering handover before using this allocation control.',409);
  const accountId=id(command.accountId),confirmed=await send({action:'read',accountId});if(confirmed.ownership?.authority!=='WEBSITE'||confirmed.ownership.phase!=='COMMITTED'||!confirmed.person)throw fail('This offering has not completed its Studio handover.',409);
  return {success:true,...await saveLiveAllocation(db,env,proof,activity,command,confirmed.person,{fetcher})};
 }
 if(!['read','save','provision','resume'].includes(command.action))throw fail('Unknown Studio access action.');
 // Forward only the narrow command. Supplied actor, roles and proof are ignored.
 const result=await send(command);if(command.action==='read'&&command.accountId&&mapping.kind==='TAFSEER'&&owner?.state==='STUDIO')result.liveAllocation=await liveAllocation(db,activity,id(command.accountId));
 return {success:true,...result};
}

async function handover(db,activity,mapping,owner,proof,input,send){
 const transfer=id(input.transferId),now=Date.now();
 if(input.action==='handover-start'){
  if(await db.prepare('SELECT 1 FROM website_platform_access_cancellations WHERE transfer_id=?').bind(transfer).first())throw fail('This handover was cancelled. Start with a new transfer ID.',409,'HANDOVER_CANCELLED');
  if(owner?.state==='STUDIO'||owner?.state==='FROZEN'&&owner.transfer_id!==transfer)throw fail('Resume or recover the existing handover.',409);
  if(owner?.state==='FROZEN')return {success:true,state:'FROZEN',transferId:transfer};
  const guard=crypto.randomUUID();await db.batch([
   db.prepare(`INSERT INTO website_platform_guards VALUES(?,EXISTS(SELECT 1 FROM website_platform_sessions b JOIN website_platform_account_state a USING(account_id) JOIN account_sessions s ON s.session_id=b.session_id WHERE b.source_ref=? AND NOT EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=? AND o.state<>'ACADEMY') AND NOT EXISTS(SELECT 1 FROM website_platform_access_cancellations WHERE transfer_id=?) AND a.active=1 AND a.admitted=1 AND a.global_admin=1 AND a.epoch=b.epoch AND s.credential_epoch=a.epoch AND s.revoked_at IS NULL AND s.expires_at>?))`).bind(guard,proof.sourceRef,activity,transfer,new Date().toISOString()),
   db.prepare("INSERT INTO website_platform_access_ownership VALUES(?,'FROZEN',?,?,NULL,'',0,?) ON CONFLICT(activity_key) DO UPDATE SET state='FROZEN',transfer_id=excluded.transfer_id,generation=excluded.generation,source_version=NULL,cursor='',checked=0,updated_at=excluded.updated_at WHERE website_platform_access_ownership.state='ACADEMY'").bind(activity,transfer,mapping.generation,now),
   db.prepare('DELETE FROM website_platform_access_imports WHERE activity_key=?').bind(activity),
   db.prepare('DELETE FROM website_platform_guards WHERE guard_id=?').bind(guard)
  ]);return {success:true,state:'FROZEN',transferId:transfer};
 }
 if(!owner||owner.transfer_id!==transfer)throw fail('Choose the existing handover.',409);
 if(input.action==='handover-status')return {success:true,state:owner.state,...await send({action:'handover-status',transferId:transfer})};
 if(input.action==='handover-abort'){
  const status=await send({action:'handover-status',transferId:transfer});if(status.handover?.phase==='COMMITTED'||owner.state==='STUDIO')throw fail('Studio already owns this offering. Keep Academy locked; a reverse migration needs a separate reviewed plan.',409,'HANDOVER_COMMITTED');
  await send({action:'handover-abort',transferId:transfer,operationId:'handover:'+transfer+':abort'});
  if(owner.state==='ACADEMY'&&await db.prepare('SELECT 1 FROM website_platform_access_cancellations WHERE transfer_id=? AND activity_key=?').bind(transfer,activity).first())return {success:true,state:'ACADEMY',replayed:true};
  await finishHandover(db,activity,transfer,proof,'ACADEMY');return {success:true,state:'ACADEMY'};
 }
 if(owner.state==='STUDIO'){if(input.action==='handover-commit')return {success:true,state:'STUDIO',replayed:true};throw fail('This offering is already managed by Studio.',409);}
 if(owner.state!=='FROZEN')throw fail('This handover is no longer frozen. Start a new transfer after cancellation.',409,'HANDOVER_NOT_FROZEN');
 if(input.action==='handover-commit'){
  const status=await send({action:'handover-status',transferId:transfer});if(status.handover?.phase==='COMMITTED'&&status.handover.transfer_id===transfer){await finishHandover(db,activity,transfer,proof);return {success:true,state:'STUDIO',recovered:true};}
 }
 if(input.action==='handover-reconcile'){
  const page=await importAccessPage(db,{activityKey:activity,limit:25});await queueAccess(db,{limit:8});return {success:true,state:'FROZEN',reconciliation:page};
 }
 // Imports and every final current access event must be acknowledged before a checkpoint.
 const incomplete=await db.prepare('SELECT 1 FROM website_platform_access_imports WHERE activity_key=? AND done=0 LIMIT 1').bind(activity).first(),started=await db.prepare('SELECT 1 FROM website_platform_access_imports WHERE activity_key=? LIMIT 1').bind(activity).first(),dirty=await db.prepare('SELECT 1 FROM website_platform_access_dirty WHERE activity_key=? AND (revision<>exported_revision OR last_error IS NOT NULL) LIMIT 1').bind(activity).first(),pending=await db.prepare('SELECT 1 FROM website_platform_outbox INDEXED BY website_platform_scope_pending WHERE access_scope=? AND acknowledged=0 LIMIT 1').bind(activity).first();
 if(!started||incomplete||dirty||pending||mapping.generation!==owner.generation)throw fail('Reconcile and deliver the final current Academy access before continuing.',409,'HANDOVER_PENDING');
 const stream=await accessStream(mapping.offering_id,''),sourceVersion=await db.prepare('SELECT version FROM website_platform_streams WHERE stream=?').bind(stream).first('version');
 if(owner.source_version!==null&&owner.source_version!==sourceVersion)throw fail('The source scope changed. Abort safely and start a new checkpoint.',409,'HANDOVER_CHANGED');
 if(owner.source_version===null){await send({action:'handover-begin',operationId:'handover:'+transfer+':begin',transferId:transfer,generation:mapping.generation,sourceVersion});await db.prepare('UPDATE website_platform_access_ownership SET source_version=? WHERE activity_key=? AND transfer_id=? AND state=\'FROZEN\'').bind(sourceVersion,activity,transfer).run();}
 if(input.action==='handover-page'){
  const rows=(await db.prepare("SELECT account_id FROM website_platform_access_dirty WHERE activity_key=? AND account_id>? ORDER BY account_id LIMIT 26").bind(activity,owner.cursor).all()).results,people=[];
  for(const row of rows.slice(0,25)){const stream=await accessStream(mapping.offering_id,row.account_id),version=await db.prepare('SELECT version FROM website_platform_streams WHERE stream=?').bind(stream).first('version');people.push({accountId:row.account_id,version:integer(version,1)});}
  const result=await send({action:'handover-page',operationId:'handover:'+transfer+':page:'+owner.checked,transferId:transfer,after:owner.cursor,people});
  await db.prepare("UPDATE website_platform_access_ownership SET cursor=?,checked=?,updated_at=? WHERE activity_key=? AND transfer_id=? AND state='FROZEN' AND cursor=?").bind(result.cursor,result.checked,now,activity,transfer,owner.cursor).run();return {success:true,state:'FROZEN',more:rows.length>25,...result};
 }
 if(input.action==='handover-commit'){
  if(await db.prepare('SELECT 1 FROM website_platform_access_dirty WHERE activity_key=? AND account_id>? LIMIT 1').bind(activity,owner.cursor).first())throw fail('Check all final participant pages first.',409,'HANDOVER_PENDING');
  await send({action:'handover-commit',operationId:'handover:'+transfer+':commit',transferId:transfer,after:owner.cursor,count:owner.checked,final:true});
  await finishHandover(db,activity,transfer,proof);return {success:true,state:'STUDIO'};
 }
 throw fail('Unknown handover step.');
}

async function finishHandover(db,activity,transfer,proof,state='STUDIO'){
 const guard=crypto.randomUUID();await db.batch([
  db.prepare(`INSERT INTO website_platform_guards VALUES(?,EXISTS(SELECT 1 FROM website_platform_sessions b JOIN website_platform_account_state a USING(account_id) JOIN account_sessions s ON s.session_id=b.session_id WHERE b.source_ref=? AND a.active=1 AND a.admitted=1 AND a.global_admin=1 AND a.epoch=b.epoch AND s.credential_epoch=a.epoch AND s.revoked_at IS NULL AND s.expires_at>?) AND EXISTS(SELECT 1 FROM website_platform_access_ownership WHERE activity_key=? AND transfer_id=? AND state='FROZEN'))`).bind(guard,proof.sourceRef,new Date().toISOString(),activity,transfer),
  ...(state==='ACADEMY'?[db.prepare('INSERT INTO website_platform_access_cancellations VALUES(?,?,?) ON CONFLICT(transfer_id) DO NOTHING').bind(transfer,activity,Date.now())]:[]),
  db.prepare("UPDATE website_platform_access_ownership SET state=?,updated_at=? WHERE activity_key=? AND transfer_id=? AND state='FROZEN'").bind(state,Date.now(),activity,transfer),db.prepare('DELETE FROM website_platform_guards WHERE guard_id=?').bind(guard)
 ]);
}
