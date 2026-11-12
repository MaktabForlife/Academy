import {id,date,flag,fail,sha256} from './protocol.mjs';
import {markAccess,queueAccess} from './access.mjs';
import {recoverWebsite} from './bridge.mjs';

export async function liveAllocation(db,activity,accountId){
 const today=new Date(Date.now()-86400_000).toISOString().slice(0,10),classes=(await db.prepare('SELECT class_id,name FROM classes WHERE activity_key=? AND active=1 ORDER BY class_id LIMIT 201').bind(activity).all()).results;
 const windows=(await db.prepare(`SELECT * FROM (
  SELECT * FROM (SELECT enrollment_id,class_id,start_date,end_date,active FROM class_memberships INDEXED BY website_platform_live_windows WHERE activity_key=? AND account_id=? AND active=1 AND end_date IS NULL LIMIT 101)
  UNION ALL SELECT * FROM (SELECT enrollment_id,class_id,start_date,end_date,active FROM class_memberships INDEXED BY website_platform_live_windows WHERE activity_key=? AND account_id=? AND active=1 AND end_date>=? LIMIT 101)
 ) ORDER BY enrollment_id LIMIT 101`).bind(activity,accountId,activity,accountId,today).all()).results;
 if(classes.length>200||windows.length>100)throw fail('This live allocation needs a narrower view.',409,'LIVE_SCOPE_TOO_LARGE');return {classes,windows};
}

// Separate source authority for live class/date facts. This never creates a
// Student role, purchase, paid month or website grant in either database.
export async function saveLiveAllocation(db,env,proof,activity,input,person,{fetcher}={}){
 const command={operationId:id(input.operationId),accountId:id(input.accountId),enrollmentId:input.enrollmentId?id(input.enrollmentId):null,classId:id(input.classId),start:input.start?date(input.start):null,end:input.end?date(input.end):null,active:flag(input.active),base:input.base||null};
 if(command.start&&command.end&&command.end<command.start)throw fail('The end date must follow the start date.');
 const hash=await sha256(JSON.stringify({activity,command})),old=await db.prepare('SELECT * FROM website_platform_live_operations WHERE operation_id=?').bind(command.operationId).first();
 if(old){if(old.actor_id!==proof.accountId||old.payload_hash!==hash)throw fail('This retry belongs to another class allocation.',409,'RETRY_CONFLICT');await recoverWebsite(env,{fetcher,limit:20});return {...JSON.parse(old.result_json),replayed:true};}
 if(command.active&&!person.enrolled)throw fail('Save the learner’s Studio enrolment before assigning a live class.',409);
 const enrollment=command.enrollmentId||'studio-live:'+command.operationId,current=await db.prepare('SELECT enrollment_id,class_id,start_date,end_date,active FROM class_memberships WHERE activity_key=? AND enrollment_id=? AND account_id=?').bind(activity,enrollment,command.accountId).first();
 if(command.enrollmentId&&JSON.stringify(current)!==JSON.stringify(command.base)||!command.enrollmentId&&current)throw fail('The class allocation changed. Refresh and review it.',409,'CHANGE_CONFLICT');
 const guard=crypto.randomUUID(),now=Date.now(),result={saved:true,enrollmentId:enrollment};
 const expected=current?'EXISTS(SELECT 1 FROM class_memberships WHERE activity_key=? AND enrollment_id=? AND account_id=? AND class_id=? AND start_date IS ? AND end_date IS ? AND active=?)':'NOT EXISTS(SELECT 1 FROM class_memberships WHERE activity_key=? AND enrollment_id=?)',expectedArgs=current?[activity,enrollment,command.accountId,current.class_id,current.start_date,current.end_date,current.active]:[activity,enrollment];
 try{await db.batch([
  db.prepare(`INSERT INTO website_platform_guards VALUES(?,EXISTS(SELECT 1 FROM website_platform_sessions b JOIN website_platform_account_state a USING(account_id) JOIN account_sessions s ON s.session_id=b.session_id WHERE b.source_ref=? AND a.active=1 AND a.admitted=1 AND a.epoch=b.epoch AND s.credential_epoch=a.epoch AND s.revoked_at IS NULL AND s.expires_at>? AND (a.global_admin=1 OR EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=? AND r.role='PROGRAM_ADMIN'))) AND EXISTS(SELECT 1 FROM website_platform_access_ownership WHERE activity_key=? AND state='STUDIO') AND EXISTS(SELECT 1 FROM classes WHERE activity_key=? AND class_id=? AND (?=0 OR active=1)) AND (${expected}))`).bind(guard,proof.sourceRef,new Date(now).toISOString(),activity,activity,activity,command.classId,command.active,...expectedArgs),
  db.prepare('INSERT INTO class_memberships(activity_key,enrollment_id,account_id,class_id,start_date,end_date,active) VALUES(?,?,?,?,?,?,?) ON CONFLICT(activity_key,enrollment_id) DO UPDATE SET class_id=excluded.class_id,start_date=excluded.start_date,end_date=excluded.end_date,active=excluded.active').bind(activity,enrollment,command.accountId,command.classId,command.start,command.end,command.active),
  db.prepare('INSERT INTO website_platform_live_operations VALUES(?,?,?,?,?)').bind(command.operationId,proof.accountId,hash,JSON.stringify(result),now),
  db.prepare("INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json) VALUES(?,?,?,?,?,'STUDIO_LIVE_ALLOCATION','CLASS_MEMBERSHIP',?,?)").bind(crypto.randomUUID(),new Date(now).toISOString(),proof.accountId,proof.globalAdmin?'GLOBAL_ADMIN':'PROGRAM_ADMIN',activity,enrollment,JSON.stringify(['ClassID','StartDate','EndDate','Active'])),
  db.prepare('DELETE FROM website_platform_guards WHERE guard_id=?').bind(guard)
 ]);}catch(error){const receipt=await db.prepare('SELECT * FROM website_platform_live_operations WHERE operation_id=?').bind(command.operationId).first();if(receipt?.payload_hash===hash&&receipt.actor_id===proof.accountId)return {...JSON.parse(receipt.result_json),replayed:true};throw fail('Your authority or the class allocation changed. Refresh and review it.',409,'CHANGE_CONFLICT');}
 await markAccess(db,activity,command.accountId);await queueAccess(db,{onlyScope:activity,onlyAccount:command.accountId.toLowerCase()});await recoverWebsite(env,{fetcher,limit:20});return result;
}
