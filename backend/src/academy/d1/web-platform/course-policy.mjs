import {fail} from './protocol.mjs';

export async function managedCoursePolicies(env,keys){
 if(env.ACADEMY_WEB_PLATFORM!=='1'||!keys.length)return new Map();
 const rows=(await env.ACADEMY_DB.withSession('first-primary').prepare("SELECT o.activity_key,m.access_model FROM website_platform_access_ownership o LEFT JOIN website_platform_course_policy_mirror m USING(activity_key) WHERE o.activity_key IN(SELECT value FROM json_each(?)) AND o.state IN('FROZEN','STUDIO')").bind(JSON.stringify(keys)).all()).results;
 return new Map(rows.map(r=>[r.activity_key.toLowerCase(),r]));
}
export function applyManagedCoursePolicy(course,policies){
 const policy=policies.get(course.activityKey.toLowerCase());if(!policy)return;
 course.studioManagedAccess=true;if(policy.access_model)course.details={...course.details,accessModel:policy.access_model};
}

// Only the current native Admin proxy calls this with an authenticated signed
// Target result. An acknowledgement lost before this step is recovered by the
// next native read; stale receipts can never roll the mirrored revision back.
export async function mirrorCoursePolicy(db,auth,activity,offering,policy){
 if(!policy)return;
 if(policy.offeringId!==offering||!['FREE','PAID'].includes(policy.model)||!Number.isSafeInteger(policy.revision)||policy.revision<1)throw fail('Invalid trusted Course policy acknowledgement.',503);
 const previous=await db.prepare('SELECT * FROM website_platform_course_policy_mirror WHERE activity_key=?').bind(activity).first();
 // Initial registration is already reviewed; an ordinary read must not alter
 // legacy Academy policy. Only an actual later target policy revision is mirrored.
 if(!previous&&policy.revision===1)return;
 if(previous?.revision>policy.revision)return;
 if(previous?.revision===policy.revision){if(previous.access_model!==policy.model)throw fail('Course policy revision conflicts with its acknowledgement.',409,'COURSE_POLICY_CONFLICT');return;}
 const p=(sql,...args)=>db.prepare(sql).bind(...args),guard=crypto.randomUUID(),actor=auth.state.account.account_id;
 try{await db.batch([
  p(`INSERT INTO website_platform_guards VALUES(?,EXISTS(SELECT 1 FROM website_platform_account_state a JOIN account_sessions s ON s.account_id=a.account_id COLLATE NOCASE WHERE a.account_id=? COLLATE NOCASE AND a.active=1 AND a.admitted=1 AND a.epoch=? AND s.session_id=? AND s.credential_epoch=a.epoch AND s.revoked_at IS NULL AND s.expires_at>? AND (a.global_admin=1 OR EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=? COLLATE NOCASE AND r.role='PROGRAM_ADMIN'))) AND EXISTS(SELECT 1 FROM website_platform_access_ownership WHERE activity_key=? AND state='STUDIO') AND NOT EXISTS(SELECT 1 FROM website_platform_course_policy_mirror WHERE activity_key=? AND (revision>? OR revision=? AND access_model<>?)))`,guard,actor,auth.state.account.credential_epoch,auth.sid,new Date().toISOString(),activity,activity,activity,policy.revision,policy.revision,policy.model),
  p('INSERT INTO website_platform_course_policy_mirror VALUES(?,?,?) ON CONFLICT(activity_key) DO UPDATE SET access_model=excluded.access_model,revision=excluded.revision',activity,policy.model,policy.revision),
  p("UPDATE course_settings SET legacy_access_model=?,policy_review_state='CONFIRMED' WHERE activity_key=? AND (legacy_access_model<>? OR policy_review_state<>'CONFIRMED')",policy.model,activity,policy.model),p('DELETE FROM website_platform_guards WHERE guard_id=?',guard)
 ]);}catch{throw fail('The Course policy acknowledgement needs a fresh native Admin read.',409,'COURSE_POLICY_CONFIRMATION_PENDING');}
}
