import {managementError as fail,same} from './management-store.js';
import {cleanText,validDate} from './assessment-store.js';
import {messagingAudience} from './messaging-audience.js';
import {classNotes} from './class-notes.js';
import {appTimezone,localInstant} from './academy-clock.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {academyD1Repository} from './repository.js';
import {acceptedRepository,acceptedHead} from './setup-reader.js';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const pageSize=30;
const draftDTO=d=>({id:d.draft_id,subject:d.subject,body:d.body,targets:JSON.parse(d.targets_json),link:JSON.parse(d.link_json),requiresAcknowledgement:Boolean(d.requires_ack),scheduleLocal:d.schedule_local,scheduleAt:d.schedule_at,timezone:d.timezone,revision:d.revision,state:d.state,workspace:d.workspace,noticeId:d.notice_id,previousNoticeId:d.previous_notice_id,updatedAt:d.updated_at,error:d.last_error});
const noticeDTO=n=>({id:n.notice_id,subject:n.subject,body:n.state==='WITHDRAWN'?'':n.body,sender:n.sender_name,actorId:n.actor_id,workspace:n.workspace,audience:JSON.parse(n.audience_json),link:n.state==='WITHDRAWN'?null:JSON.parse(n.link_json),requiresAcknowledgement:Boolean(n.requires_ack),recipientCount:n.recipient_count,state:n.state,createdAt:n.created_at,issuedAt:n.issued_at,scheduledFor:n.scheduled_for,withdrawnAt:n.withdrawn_at,withdrawalReason:n.withdrawal_reason,previousNoticeId:n.previous_notice_id,firstOpenedAt:n.first_opened_at||null,unread:Boolean(n.unread),acknowledgedAt:n.acknowledged_at||null,archivedAt:n.archived_at||null});

export function messaging(repository,auth,now=()=>new Date(),{system=false}={}){
 const db=repository.db,p=(sql,...v)=>db.prepare(sql).bind(...v),actor=auth.user.accountid,audiences=messagingAudience(repository,auth,now);
 const stamp=()=>now().toISOString();
 async function ready(){
  try{await p('SELECT draft_id FROM messaging_drafts WHERE 0').all();}catch(e){if(/no such table/.test(e.message))throw fail('Messaging needs its local database upgrade.',503,'MESSAGING_SCHEMA_REQUIRED');throw e;}
 }
 const event=(action,draftId=null,noticeId=null,details={})=>p('INSERT INTO messaging_events VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),noticeId,draftId,actor,action,JSON.stringify(details),stamp());
 async function ownDraft(id){const d=await p('SELECT * FROM messaging_drafts WHERE draft_id=? AND actor_id=? COLLATE NOCASE',String(id||''),actor).first();if(!d)throw fail('Draft not found.',404,'MESSAGING_NOT_FOUND');return d;}
 function writable(){if(auth.adminView&&auth.workspace==='LEARN')throw fail('Student class viewing is read only.',403,'PREVIEW_READ_ONLY');}
 function revision(d,input){if(!Number.isInteger(input.revision)||input.revision!==d.revision)throw fail('This draft changed elsewhere. Your text is kept; reload the saved draft before continuing.',409,'MESSAGING_CHANGED');}
 function draftWorkspace(d){if(d.workspace!==(auth.workspaceContext||auth.workspace))throw fail('Open '+d.workspace.replace('_',' · ')+' to edit or send this draft.',403,'MESSAGING_WORKSPACE_REQUIRED');}
 async function transact(action,input,build){
  if(!uuid.test(input.operationId||''))throw fail('This action needs its retry identifier.');
  const hash=await payloadHash({action,input}),saved=async()=>{const r=await p('SELECT * FROM messaging_operations WHERE actor_id=? AND operation_id=?',actor,input.operationId).first();if(!r)return null;if(r.request_hash!==hash)throw fail('This retry belongs to a different action.',409,'OPERATION_ID_REUSED');return {...JSON.parse(r.result_json),replayed:true};};
  const prior=await saved();if(prior)return prior;
  const splitVersion=db.splitGeneration==='SPLIT_V1'?(await p('SELECT version FROM split_read_state WHERE singleton=1').first()).version:null;
  const version=(await p('SELECT version FROM academy_write_state WHERE singleton=1').first()).version;
  const {statements,result,condition='1',values=[]}=await build(),guard=crypto.randomUUID();
  const session=system?'1':`EXISTS(SELECT 1 FROM account_sessions s JOIN accounts a USING(account_id) JOIN account_credentials c USING(account_id) WHERE s.session_id=? AND a.account_id=? COLLATE NOCASE AND a.active=1 AND s.revoked_at IS NULL AND c.credential_epoch=s.credential_epoch AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;
  try{
   await db.batch([p(`INSERT INTO academy_write_guards VALUES(?,(SELECT version FROM academy_write_state WHERE singleton=1)=? AND (SELECT head_id FROM setup_head_state WHERE singleton=1)=? AND (${session}) AND (${condition}) ${splitVersion===null?'':'AND (SELECT version FROM split_read_state WHERE singleton=1)=?'})`,guard,version,repository.setup.head,...(system?[]:[auth.sid,actor]),...values,...(splitVersion===null?[]:[splitVersion])),...statements,p('INSERT INTO messaging_operations VALUES(?,?,?,?,?)',actor,input.operationId,hash,JSON.stringify(result),stamp()),p('UPDATE academy_write_state SET version=version+1 WHERE singleton=1'),p('DELETE FROM academy_write_guards WHERE guard_id=?',guard)]);
   return result;
  }catch(e){const recovered=await saved();if(recovered)return recovered;if(/academy_management_stale|split_write_busy|UNIQUE constraint/.test(e.message))throw fail('The notice, audience or your access changed. Your draft is kept; review it again.',409,'MESSAGING_CHANGED');throw e;}
 }
 async function linkFor(value,targets,{acceptCurrent=false}={}){
  if(value==null)return null;
  if(!value||typeof value.activityKey!=='string'||value.type!=='CLASS_NOTE'&&value.type!=='LESSON')throw fail('Choose a lesson or Class Note link.');
  if(value.type==='CLASS_NOTE'&&(typeof value.noteId!=='string'||value.noteId.length>160||!value.noteId))throw fail('Choose an active Class Note.');
  const input={activityKey:value.activityKey,...(value.type==='CLASS_NOTE'?{noteId:value.noteId}:{source:value.source})};
  const view=await classNotes(repository,auth,now).run('get',input),source=view.source;
  if(!targets.allAcademy&&!targets.scopes.some(t=>same(t.activityKey,source.activityKey)&&(t.mode==='ALL'||same(t.classId,source.classId)&&(t.mode==='CLASS'||t.date===source.date&&JSON.parse(t.sessionKey)[1]===source.stableKey))))throw fail('The linked lesson must belong to the selected audience.');
  const note=value.type==='CLASS_NOTE'?view.notes.find(n=>same(n.id||n.noteId,value.noteId)):null;
  if(value.type==='CLASS_NOTE'&&(!note||note.state==='WITHDRAWN'))throw fail('Choose an active Class Note.');
  if(note&&value.versionId&&value.versionId!==note.versionId&&!acceptCurrent)throw fail('The linked Class Note changed. Save and review the notice again before sending.',409,'MESSAGING_LINK_CHANGED');
  return {type:value.type,activityKey:source.activityKey,source:{date:source.date,classId:source.classId,sessionKey:source.sessionKey},title:source.title,date:source.date,...(note?{noteId:value.noteId,versionId:note.versionId||note.currentVersionId||null,revision:note.revision}:{} )};
 }
 async function save(input){
  writable();return transact('save',input,async()=>{
   const old=input.draftId?await ownDraft(input.draftId):null;
   if(old){revision(old,input);draftWorkspace(old);if(!['DRAFT','SCHEDULED','NEEDS_REVIEW'].includes(old.state))throw fail('This notice has already been sent or cancelled.',409,'MESSAGING_CHANGED');}
   const opts=await audiences.options();if(!opts.canSend)throw fail('You have no current sending audience.',403,'MESSAGING_FORBIDDEN');
   const subject=cleanText(input.subject??'',180,'a subject',true),body=cleanText(input.body??'',12000,'a notice',true),targets=input.targets??{allAcademy:false,scopes:[]};
   if(typeof targets!=='object'||targets===null||Array.isArray(targets)||JSON.stringify(targets).length>90000)throw fail('Choose a valid audience.');
   // Empty drafts are allowed. Any nonempty audience is checked before saving.
   let resolved=null;if(targets.allAcademy===true||targets.scopes?.length)resolved=await audiences.resolve(targets);
   const timezone=opts.timezone,scheduleLocal=input.scheduleLocal||null;
   let scheduleAt=null;if(scheduleLocal){if(typeof scheduleLocal!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(scheduleLocal)||!validDate(scheduleLocal.slice(0,10))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduleLocal.slice(11)))throw fail('Choose a valid scheduled date and time.');scheduleAt=localInstant(scheduleLocal.slice(0,10),scheduleLocal.slice(11),timezone);if(Date.parse(scheduleAt)<=now().getTime())throw fail('Choose a future sending time.');}
   const link=input.link?await linkFor(input.link,resolved?.targets||targets,{acceptCurrent:true}):null,id=old?.draft_id||crypto.randomUUID(),rev=(old?.revision||0)+1;
   const previous=input.previousNoticeId||old?.previous_notice_id||null;
   if(previous&&!await p('SELECT 1 FROM messaging_notices WHERE notice_id=? AND actor_id=?',previous,actor).first())throw fail('Choose one of your own sent notices to correct.',403,'MESSAGING_FORBIDDEN');
   const values=[subject,body,JSON.stringify(resolved?.targets||targets),JSON.stringify(link),Number(input.requiresAcknowledgement===true),scheduleLocal,scheduleAt,timezone,rev,stamp(),previous];
   const statements=old?[p("UPDATE messaging_drafts SET subject=?,body=?,targets_json=?,link_json=?,requires_ack=?,schedule_local=?,schedule_at=?,timezone=?,revision=?,state='DRAFT',updated_at=?,previous_notice_id=?,last_error='',next_attempt_at=NULL,attempts=0 WHERE draft_id=?",...values,id)]:[p("INSERT INTO messaging_drafts(subject,body,targets_json,link_json,requires_ack,schedule_local,schedule_at,timezone,revision,updated_at,previous_notice_id,draft_id,actor_id,workspace,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",...values,id,actor,auth.workspaceContext||auth.workspace,stamp())];
   statements.push(event(old?.state==='SCHEDULED'?'unschedule-for-edit':'save-draft',id));
   return {statements,result:{draftId:id,revision:rev},...(old?{condition:'EXISTS(SELECT 1 FROM messaging_drafts WHERE draft_id=? AND revision=?)',values:[id,old.revision]}:{})};
  });
 }
 const contentDigest=d=>payloadHash([d.draft_id,d.revision,d.subject,d.body,d.targets_json,d.link_json,d.requires_ack,d.schedule_at,d.timezone,d.previous_notice_id]);
 async function review(input){
  writable();return transact('review',input,async()=>{
   const d=await ownDraft(input.draftId);revision(d,input);draftWorkspace(d);if(d.state!=='DRAFT')throw fail('Save this notice as a draft before reviewing it.',409,'MESSAGING_CHANGED');
   cleanText(d.subject,180,'a subject');cleanText(d.body,12000,'a notice');
   const resolved=await audiences.resolve(JSON.parse(d.targets_json));
   if(d.schedule_at&&Date.parse(d.schedule_at)<=now().getTime())throw fail('Choose a future sending time.');
   if(JSON.parse(d.link_json))await linkFor(JSON.parse(d.link_json),resolved.targets);
   const reviewId=crypto.randomUUID(),digest=await contentDigest(d),recipientDigest=await payloadHash(resolved.recipients),expiresAt=new Date(now().getTime()+10*60000).toISOString();
   return {statements:[p('INSERT INTO messaging_reviews VALUES(?,?,?,?,?,?,?,?,?)',reviewId,d.draft_id,actor,d.revision,digest,recipientDigest,repository.setup.head,expiresAt,stamp()),event('review',d.draft_id,null,{recipientCount:resolved.recipients.length})],result:{reviewId,senderName:(await p('SELECT display_name FROM accounts WHERE account_id=?',actor).first()).display_name,draft:draftDTO(d),audience:resolved.audience,recipientCount:resolved.recipients.length,recipients:resolved.recipients.slice(0,pageSize),nextOffset:resolved.recipients.length>pageSize?pageSize:null,expiresAt}};
  });
 }
 async function issuePlan(d,resolved){
  const noticeId=crypto.randomUUID(),name=(await p('SELECT display_name FROM accounts WHERE account_id=? AND active=1',actor).first())?.display_name;
  if(!name)throw fail('The sender is no longer active.',403,'MESSAGING_FORBIDDEN');
  const link=JSON.parse(d.link_json);if(link)await linkFor(link,resolved.targets);
  const statements=[p("INSERT INTO messaging_notices(notice_id,draft_id,actor_id,sender_name,workspace,subject,body,targets_json,audience_json,link_json,requires_ack,recipient_count,recipients_json,created_at,state,previous_notice_id,source_head,scheduled_for) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ISSUING',?,?,?)",noticeId,d.draft_id,actor,name,d.workspace,d.subject,d.body,d.targets_json,JSON.stringify(resolved.audience),d.link_json,d.requires_ack,resolved.recipients.length,JSON.stringify(resolved.recipients),stamp(),d.previous_notice_id,repository.setup.head,d.schedule_at),p('INSERT INTO messaging_jobs(notice_id,next_attempt_at) VALUES(?,?)',noticeId,stamp()),p("UPDATE messaging_drafts SET state='SENT',notice_id=?,revision=revision+1,updated_at=?,last_error='' WHERE draft_id=?",noticeId,stamp(),d.draft_id),event('issue',d.draft_id,noticeId,{recipientCount:resolved.recipients.length,scheduledFor:d.schedule_at})];
  return {statements,result:{noticeId,state:'ISSUING',recipientCount:resolved.recipients.length},condition:'EXISTS(SELECT 1 FROM messaging_drafts WHERE draft_id=? AND revision=? AND state=?)',values:[d.draft_id,d.revision,d.state]};
 }
 async function confirm(input){
  writable();const result=await transact('confirm',input,async()=>{
   const r=await p('SELECT * FROM messaging_reviews WHERE review_id=? AND actor_id=?',input.reviewId||'',actor).first();
   if(!r||r.expires_at<=stamp())throw fail('Review this notice again before sending.',409,'MESSAGING_REVIEW_EXPIRED');
   const d=await ownDraft(r.draft_id);draftWorkspace(d);
   if(d.state!=='DRAFT'||r.draft_revision!==d.revision||r.digest!==await contentDigest(d)||r.source_head!==repository.setup.head)throw fail('This notice or timetable changed. Review it again.',409,'MESSAGING_CHANGED');
   const resolved=await audiences.resolve(JSON.parse(d.targets_json));
   if(r.recipient_digest!==await payloadHash(resolved.recipients))throw fail('The recipients changed. Review the updated audience before sending.',409,'MESSAGING_AUDIENCE_CHANGED');
   if(JSON.parse(d.link_json))await linkFor(JSON.parse(d.link_json),resolved.targets);
   if(d.schedule_at){
    if(Date.parse(d.schedule_at)<=now().getTime())throw fail('Choose a future sending time.');
    return {statements:[p("UPDATE messaging_drafts SET state='SCHEDULED',revision=revision+1,updated_at=?,next_attempt_at=? WHERE draft_id=?",stamp(),d.schedule_at,d.draft_id),event('schedule',d.draft_id,null,{scheduledFor:d.schedule_at,reviewedRecipients:resolved.recipients.length})],result:{draftId:d.draft_id,state:'SCHEDULED',scheduleAt:d.schedule_at},condition:"EXISTS(SELECT 1 FROM messaging_drafts WHERE draft_id=? AND revision=? AND state='DRAFT')",values:[d.draft_id,d.revision]};
   }
   return issuePlan(d,resolved);
  });
  if(result.noticeId){try{await deliverMessaging(repository,{now:now(),noticeId:result.noticeId,maxChunks:5});}catch{/* Retained outbox will resume. */}const row=await p('SELECT state FROM messaging_notices WHERE notice_id=?',result.noticeId).first();result.state=row.state;}
  return result;
 }
 async function summary(){
  const counts=await p("SELECT coalesce(sum(r.archived_at IS NULL),0) total,coalesce(sum(CASE WHEN r.archived_at IS NULL THEN r.unread ELSE 0 END),0) unread,coalesce(sum(CASE WHEN n.requires_ack=1 AND r.acknowledged_at IS NULL AND n.state='SENT' THEN 1 ELSE 0 END),0) toAcknowledge FROM messaging_recipients r JOIN messaging_notices n USING(notice_id) WHERE r.account_id=? AND n.state IN('SENT','WITHDRAWN')",actor).first();
  const rows=(await p("SELECT n.notice_id,n.subject,n.sender_name,n.state,n.issued_at,n.requires_ack,r.unread,r.acknowledged_at FROM messaging_recipients r JOIN messaging_notices n USING(notice_id) WHERE r.account_id=? AND r.archived_at IS NULL AND n.state IN('SENT','WITHDRAWN') ORDER BY n.created_at DESC,n.notice_id DESC LIMIT 3",actor).all()).results;
  return {counts,notices:rows.map(n=>({id:n.notice_id,subject:n.subject,sender:n.sender_name,state:n.state,issuedAt:n.issued_at,unread:Boolean(n.unread),requiresAcknowledgement:Boolean(n.requires_ack),acknowledgedAt:n.acknowledged_at})),canSend:(await audiences.options()).canSend};
 }
 async function list(input){
  const offset=Number.isInteger(input.offset)&&input.offset>=0?input.offset:0;
  if(['drafts','scheduled'].includes(input.folder)){
   const rows=(await p("SELECT * FROM messaging_drafts WHERE actor_id=? AND state IN(SELECT value FROM json_each(?)) ORDER BY updated_at DESC,draft_id DESC LIMIT ? OFFSET ?",actor,JSON.stringify(input.folder==='scheduled'?['SCHEDULED','NEEDS_REVIEW']:['DRAFT']),pageSize+1,offset).all()).results;
   return {drafts:rows.slice(0,pageSize).map(draftDTO),nextOffset:rows.length>pageSize?offset+pageSize:null};
  }
  if(input.folder==='reports'){
   const opts=await audiences.options();if(!opts.canAudit)throw fail('Reports require scoped Admin authority.',403,'MESSAGING_FORBIDDEN');
   const keys=opts.areas.filter(a=>a.canAll).map(a=>a.activityKey);
   const rows=(await p("SELECT n.*,0 unread FROM messaging_notices n WHERE ?=1 OR (json_extract(n.targets_json,'$.allAcademy')=0 AND NOT EXISTS(SELECT 1 FROM json_each(n.targets_json,'$.scopes') s WHERE json_extract(s.value,'$.activityKey') COLLATE NOCASE NOT IN(SELECT value FROM json_each(?)))) ORDER BY n.created_at DESC,n.notice_id DESC LIMIT ? OFFSET ?",Number(opts.canAllAcademy),JSON.stringify(keys),pageSize+1,offset).all()).results;
   return {notices:rows.slice(0,pageSize).map(n=>noticeDTO({...n,body:''})),nextOffset:rows.length>pageSize?offset+pageSize:null};
  }
  if(input.folder==='sent'){
   const rows=(await p('SELECT n.*,0 unread FROM messaging_notices n WHERE n.actor_id=? ORDER BY n.created_at DESC,n.notice_id DESC LIMIT ? OFFSET ?',actor,pageSize+1,offset).all()).results;
   return {notices:rows.slice(0,pageSize).map(noticeDTO),nextOffset:rows.length>pageSize?offset+pageSize:null};
  }
  const filter=input.filter==='unread'?'AND r.unread=1':input.filter==='ack'?'AND n.requires_ack=1 AND r.acknowledged_at IS NULL AND n.state=\'SENT\'':'';
  const rows=(await p(`SELECT n.notice_id,n.subject,n.sender_name,n.workspace,n.audience_json,n.requires_ack,n.recipient_count,n.state,n.created_at,n.issued_at,n.scheduled_for,n.withdrawn_at,n.withdrawal_reason,n.previous_notice_id,n.actor_id,'null' link_json,'' body,r.first_opened_at,r.unread,r.acknowledged_at,r.archived_at FROM messaging_recipients r JOIN messaging_notices n USING(notice_id) WHERE r.account_id=? AND n.state IN('SENT','WITHDRAWN') ${input.filter==='ack'&&input.folder!=='archived'?'':`AND r.archived_at IS ${input.folder==='archived'?'NOT ':''}NULL`} ${filter} ORDER BY n.created_at DESC,n.notice_id DESC LIMIT ? OFFSET ?`,actor,pageSize+1,offset).all()).results;
  return {notices:rows.slice(0,pageSize).map(noticeDTO),nextOffset:rows.length>pageSize?offset+pageSize:null};
 }
 async function recipientNotice(id){const n=await p("SELECT n.*,r.first_opened_at,r.unread,r.acknowledged_at,r.archived_at FROM messaging_notices n JOIN messaging_recipients r USING(notice_id) WHERE n.notice_id=? AND r.account_id=? AND n.state IN('SENT','WITHDRAWN')",id,actor).first();if(!n)throw fail('Notice not found in your inbox.',404,'MESSAGING_NOT_FOUND');return n;}
 async function receipt(action,input){
  return transact(action,input,async()=>{
   const n=await recipientNotice(input.noticeId);
   if(action==='acknowledge'&&(n.state!=='SENT'||!n.requires_ack))throw fail('This notice does not need acknowledgement.');
   const set=action==='open'?"first_opened_at=coalesce(first_opened_at,?),unread=0":action==='acknowledge'?"first_opened_at=coalesce(first_opened_at,?),unread=0,acknowledged_at=coalesce(acknowledged_at,?)":action==='unread'?'unread=1':action==='archive'?'archived_at=?':'archived_at=NULL';
   const v=['open','archive'].includes(action)?[stamp()]:action==='acknowledge'?[stamp(),stamp()]:[];
   return {statements:[p(`UPDATE messaging_recipients SET ${set} WHERE notice_id=? AND account_id=?`,...v,n.notice_id,actor),event(action,n.draft_id,n.notice_id)],result:{noticeId:n.notice_id}};
  });
 }
 async function report(input){
  const n=await p('SELECT * FROM messaging_notices WHERE notice_id=?',input.noticeId||'').first();if(!n)throw fail('Notice not found.',404,'MESSAGING_NOT_FOUND');
  if(!same(n.actor_id,actor)){
   const opts=await audiences.options(),scopes=JSON.parse(n.targets_json);
   if(!opts.canAllAcademy&&(scopes.allAcademy||!['ADMIN','ADMIN_TEACH'].includes(auth.workspaceContext||auth.workspace)||!scopes.scopes.every(s=>opts.areas.some(a=>a.canAll&&same(a.activityKey,s.activityKey)))))throw fail('This report is outside your administrative scope.',403,'MESSAGING_FORBIDDEN');
  }
  const counts=await p('SELECT count(*) delivered,coalesce(sum(first_opened_at IS NOT NULL),0) opened,coalesce(sum(acknowledged_at IS NOT NULL),0) acknowledged FROM messaging_recipients WHERE notice_id=?',n.notice_id).first(),offset=Number.isInteger(input.offset)&&input.offset>=0?input.offset:0;
  const recipients=(await p('SELECT display_name name,delivered_at deliveredAt,first_opened_at firstOpenedAt,acknowledged_at acknowledgedAt,archived_at archivedAt FROM messaging_recipients WHERE notice_id=? ORDER BY display_name,account_id LIMIT ? OFFSET ?',n.notice_id,pageSize+1,offset).all()).results;
  const eventOffset=Number.isInteger(input.eventOffset)&&input.eventOffset>=0?input.eventOffset:0;
  const events=(await p('SELECT e.action,e.details_json,e.occurred_at,a.display_name actor FROM messaging_events e JOIN accounts a ON a.account_id=e.actor_id WHERE e.notice_id=? OR e.draft_id=? ORDER BY e.occurred_at,e.event_id LIMIT 51 OFFSET ?',n.notice_id,n.draft_id,eventOffset).all()).results;
  return {notice:{...noticeDTO({...n,unread:0}),body:n.body},targets:JSON.parse(n.targets_json),counts,recipients:recipients.slice(0,pageSize),nextOffset:recipients.length>pageSize?offset+pageSize:null,events:events.slice(0,50).map(e=>({action:e.action,at:e.occurred_at,actor:e.actor,details:JSON.parse(e.details_json)})),eventNextOffset:events.length>50?eventOffset+50:null,canCorrect:same(n.actor_id,actor),canWithdraw:n.state!=='WITHDRAWN'&&same(n.actor_id,actor)};
 }
 return {async run(action,input={}){
  await ready();
  if(action==='options')return audiences.options();
  if(action==='sessions')return audiences.sessionOptions(input);
  if(action==='link-options')return classNotes(repository,auth,now).run('get',{activityKey:input.activityKey,source:input.source});
  if(action==='summary')return summary();
  if(action==='list')return list(input);
  if(action==='draft')return {draft:draftDTO(await ownDraft(input.draftId))};
  if(action==='save')return save(input);
  if(action==='review')return review(input);
  if(action==='review-recipients'){
   const r=await p('SELECT * FROM messaging_reviews WHERE review_id=? AND actor_id=?',input.reviewId||'',actor).first();if(!r||r.expires_at<=stamp())throw fail('Review this notice again.',409,'MESSAGING_REVIEW_EXPIRED');
   const d=await ownDraft(r.draft_id);draftWorkspace(d);if(d.revision!==r.draft_revision||await contentDigest(d)!==r.digest||r.source_head!==repository.setup.head)throw fail('This draft changed. Review it again.',409,'MESSAGING_CHANGED');
   const resolved=await audiences.resolve(JSON.parse(d.targets_json));if(await payloadHash(resolved.recipients)!==r.recipient_digest)throw fail('The audience changed. Review it again.',409,'MESSAGING_AUDIENCE_CHANGED');
   const offset=Number.isInteger(input.offset)&&input.offset>=0?input.offset:0;return {recipients:resolved.recipients.slice(offset,offset+pageSize),nextOffset:resolved.recipients.length>offset+pageSize?offset+pageSize:null};
  }
  if(action==='confirm')return confirm(input);
  if(action==='get'){await receipt('open',input);return {notice:noticeDTO(await recipientNotice(input.noticeId))};}
  if(['acknowledge','unread','archive','restore'].includes(action))return receipt(action,input);
  if(action==='report')return report(input);
  if(action==='cancel'){
   writable();return transact(action,input,async()=>{const d=await ownDraft(input.draftId);revision(d,input);draftWorkspace(d);if(!['DRAFT','SCHEDULED','NEEDS_REVIEW'].includes(d.state))throw fail('This notice can no longer be cancelled.',409,'MESSAGING_CHANGED');return {statements:[p("UPDATE messaging_drafts SET state='CANCELLED',revision=revision+1,updated_at=? WHERE draft_id=?",stamp(),d.draft_id),event('cancel',d.draft_id)],result:{draftId:d.draft_id,state:'CANCELLED'},condition:'EXISTS(SELECT 1 FROM messaging_drafts WHERE draft_id=? AND revision=?)',values:[d.draft_id,d.revision]};});
  }
  if(action==='withdraw'){
   writable();return transact(action,input,async()=>{const n=await p('SELECT * FROM messaging_notices WHERE notice_id=? AND actor_id=?',input.noticeId||'',actor).first();if(!n||n.state!=='SENT')throw fail('Choose one of your issued notices.',403,'MESSAGING_FORBIDDEN');await audiences.resolve(JSON.parse(n.targets_json));const reason=cleanText(input.reason,1000,'a withdrawal reason');return {statements:[p("UPDATE messaging_notices SET state='WITHDRAWN',withdrawn_at=?,withdrawn_by=?,withdrawal_reason=? WHERE notice_id=?",stamp(),actor,reason,n.notice_id),event('withdraw',n.draft_id,n.notice_id,{reason})],result:{noticeId:n.notice_id,state:'WITHDRAWN'}};});
  }
  if(action==='dispatch'&&system){
   const d=await ownDraft(input.draftId);draftWorkspace(d);if(d.state!=='SCHEDULED'||d.schedule_at>stamp())return {skipped:true};
   return transact('dispatch',input,async()=>issuePlan(d,await audiences.resolve(JSON.parse(d.targets_json))));
  }
  throw fail('Unknown messaging action.',404,'MESSAGING_NOT_FOUND');
 }};
}

// Bounded, idempotent delivery. Recipients stay invisible until all chunks commit.
export async function deliverMessaging(repository,{now=new Date(),noticeId='',maxChunks=5}={}){
 const db=repository.db,p=(sql,...v)=>db.prepare(sql).bind(...v),time=now.toISOString();
 const jobs=(await p(`SELECT j.*,n.recipient_count,n.draft_id,n.actor_id FROM messaging_jobs j JOIN messaging_notices n USING(notice_id) WHERE j.state='PENDING' AND j.next_attempt_at<=? ${noticeId?'AND j.notice_id=?':''} ORDER BY j.next_attempt_at LIMIT 10`,time,...(noticeId?[noticeId]:[])).all()).results;
 let remaining=maxChunks;
 for(const job of jobs){
  while(remaining>0&&job.position<job.recipient_count){
   remaining--;
   const next=Math.min(job.position+100,job.recipient_count),guard=crypto.randomUUID();
   try{
    const statements=[p("INSERT INTO academy_write_guards VALUES(?,EXISTS(SELECT 1 FROM messaging_jobs WHERE notice_id=? AND position=? AND state='PENDING'))",guard,job.notice_id,job.position),p("INSERT INTO messaging_recipients(notice_id,account_id,display_name,delivered_at) SELECT n.notice_id,json_extract(j.value,'$.accountId'),json_extract(j.value,'$.name'),? FROM messaging_notices n JOIN json_each(n.recipients_json) j WHERE n.notice_id=? AND CAST(j.key AS INTEGER)>=? AND CAST(j.key AS INTEGER)<? ON CONFLICT(notice_id,account_id) DO NOTHING",time,job.notice_id,job.position,next),p("UPDATE messaging_jobs SET position=?,state=?,last_error='' WHERE notice_id=?",next,next===job.recipient_count?'DONE':'PENDING',job.notice_id)];
    if(next===job.recipient_count)statements.push(p("UPDATE messaging_notices SET state='SENT',issued_at=? WHERE notice_id=? AND state='ISSUING'",time,job.notice_id),p('INSERT INTO messaging_events VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),job.notice_id,job.draft_id,job.actor_id,'delivered',JSON.stringify({recipientCount:next}),time));
    statements.push(p('DELETE FROM academy_write_guards WHERE guard_id=?',guard));await db.batch(statements);job.position=next;
   }catch(e){if(!/academy_management_stale|split_write_busy/.test(e.message))await p("UPDATE messaging_jobs SET attempts=attempts+1,next_attempt_at=?,last_error=? WHERE notice_id=? AND position=? AND state='PENDING'",new Date(now.getTime()+60000*Math.min(60,2**Math.min(job.attempts,6))).toISOString(),'Delivery was interrupted; it will retry.',job.notice_id,job.position).run();break;}
  }
  if(remaining<=0)break;
 }
}

// Accepted schedules do not depend on the original browser session or its token.
export async function recoverMessaging(env,now=new Date()){
 if(env.ACADEMY_MESSAGING!=='1')return {skipped:true};
 const source=academyD1Repository(env);await source.ready();
 const repository=acceptedRepository(source,await acceptedHead(source)),db=repository.db,p=(sql,...v)=>db.prepare(sql).bind(...v),time=now.toISOString();
 const due=(await p("SELECT draft_id,actor_id,workspace,revision,attempts FROM messaging_drafts WHERE state='SCHEDULED' AND schedule_at<=? AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY schedule_at LIMIT 10",time,time).all()).results;
 for(const d of due){
  const workspace=d.workspace.replace('ADMIN_',''),auth={user:{accountid:d.actor_id},workspace,workspaceContext:d.workspace,adminView:d.workspace.startsWith('ADMIN_')};
  try{await messaging(repository,auth,()=>now,{system:true}).run('dispatch',{draftId:d.draft_id,operationId:crypto.randomUUID()});}
  catch(e){
   const review=[400,403,404,409].includes(e.status),message=review?'The audience, linked lesson or sender access changed. Review before rescheduling.':'Scheduled sending was interrupted; it will retry.';
   await db.batch([p('UPDATE messaging_drafts SET state=?,last_error=?,next_attempt_at=?,attempts=attempts+1,revision=revision+1 WHERE draft_id=? AND revision=? AND state=\'SCHEDULED\'',review?'NEEDS_REVIEW':'SCHEDULED',message,new Date(now.getTime()+60000*Math.min(60,2**Math.min(d.attempts,6))).toISOString(),d.draft_id,d.revision),p('INSERT INTO messaging_events VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),null,d.draft_id,d.actor_id,review?'schedule-needs-review':'schedule-retry',JSON.stringify({message}),time)]);
  }
 }
 await deliverMessaging(repository,{now,maxChunks:10});return {checked:due.length};
}
