import {importAccessPage,queueAccess,accessStream} from './access.mjs';
import {signedHeaders,bodyJSON,fail,integer} from './protocol.mjs';

export const courseStudioEnabled=env=>env.ACADEMY_WEB_PLATFORM==='1'&&env.ACADEMY_COURSE_STUDIO_PUBLICATION==='1';
// These statements run inside the existing publication transaction, after its
// current-session/scope guards. A job is never inferred from an ordinary read.
export async function planCourseStudio(store,env,course,input,details){
 if(!courseStudioEnabled(env))return {statements:[],started:false};
 const eligible=await env.ACADEMY_DB.withSession('first-primary').prepare('SELECT EXISTS(SELECT 1 FROM website_platform_course_jobs j WHERE j.activity_key=n.activity_key) existing FROM website_platform_new_courses n WHERE activity_key=?').bind(course.activityKey).first();
 if(!eligible)return {statements:[],started:false};
 const metadata=store.p('UPDATE website_platform_new_courses SET published_title=?,published_timezone=? WHERE activity_key=?',details.name,details.timezone,course.activityKey);
 if(eligible.existing)return {statements:[metadata],started:false};
 const p=store.p,now=Date.now(),transfer=crypto.randomUUID(),guard=crypto.randomUUID();
 return {started:true,statements:[metadata,
  p(`INSERT INTO website_platform_course_jobs(activity_key,offering_id,registration_id,run_id,publication_id,access_model,phase,created_at) SELECT ?,?,?,?,current_publication_id,?,'REGISTER',? FROM course_run_state WHERE activity_key=? AND run_id=? AND current_publication_id IS NOT NULL`,course.activityKey,course.courseId,input.operationId,course.runId,details.accessModel,now,course.activityKey,course.runId),
  p("INSERT INTO website_platform_guards VALUES(?,EXISTS(SELECT 1 FROM website_platform_course_jobs WHERE activity_key=? AND registration_id=?))",guard,course.activityKey,input.operationId),
  p("INSERT INTO website_platform_timetable_scopes(activity_key,offering_id,kind) VALUES(?,?,'COURSE')",course.activityKey,course.courseId),
  p("INSERT INTO website_platform_access_scopes(activity_key,enabled,purchase_model) VALUES(?,1,'CONFIRMED_SUBSCRIPTION')",course.activityKey),
  p("INSERT INTO website_platform_access_ownership VALUES(?,'FROZEN',?,1,NULL,'',0,?)",course.activityKey,transfer,now),
  p("INSERT INTO website_platform_access_dirty(activity_key,account_id) VALUES(?,'')",course.activityKey),p('DELETE FROM website_platform_guards WHERE guard_id=?',guard)
 ]};
}
export async function courseStudioStatus(db,activity){
 const row=await db.prepare('SELECT j.phase,j.last_error,o.state FROM website_platform_course_jobs j JOIN website_platform_access_ownership o USING(activity_key) WHERE j.activity_key=?').bind(activity).first();
 return row?{state:row.state,pending:row.phase!=='COMPLETE',retryAvailable:row.phase!=='COMPLETE',message:row.phase==='COMPLETE'?'Studio manages enrolment and material access.':'Studio access setup is pending. Existing rights are preserved; access edits stay locked. You can resume setup.'}:null;
}
const p=(db,sql,...args)=>db.prepare(sql).bind(...args);
async function send(env,db,job,owner,command,fetcher){
 if(!await p(db,"SELECT 1 FROM website_platform_access_ownership WHERE activity_key=? AND transfer_id=? AND state IN('FROZEN','STUDIO')",job.activity_key,owner.transfer_id).first())throw fail('Setup checkpoint changed.',409,'HANDOVER_CHANGED');
 const path='/internal/studio/course-publication',origin=new URL(env.WEBSITE_PLATFORM_ORIGIN);
 if(origin.protocol!=='https:'||origin.origin!==env.WEBSITE_PLATFORM_ORIGIN)throw fail('Invalid Studio server origin.',503);
 const envelope={issuedAt:Date.now(),registration:{activityKey:job.activity_key,offeringId:job.offering_id,registrationId:job.registration_id,runId:job.run_id,publicationId:job.publication_id,accessModel:job.access_model},command:{...command,transferId:owner.transfer_id}};
 const signed=await signedHeaders(env.ACADEMY_TO_WEBSITE_SECRET,path,envelope),response=await fetcher(origin.origin+path,{method:'POST',headers:signed.headers,body:signed.payload,redirect:'manual',signal:AbortSignal.timeout(8000)}),result=await bodyJSON(response.body,262144);
 if(!response.ok)throw fail(result.error||'Studio setup could not be confirmed.',response.status,result.code||'STUDIO_UNAVAILABLE');return result;
}
async function finish(db,job,owner){
 const guard=crypto.randomUUID();await db.batch([
  p(db,"INSERT INTO website_platform_guards VALUES(?,EXISTS(SELECT 1 FROM website_platform_course_jobs j JOIN website_platform_access_ownership o USING(activity_key) WHERE j.activity_key=? AND j.registration_id=? AND o.transfer_id=? AND o.state='FROZEN'))",guard,job.activity_key,job.registration_id,owner.transfer_id),
  p(db,"UPDATE website_platform_access_ownership SET state='STUDIO',updated_at=? WHERE activity_key=?",Date.now(),job.activity_key),
  p(db,"UPDATE website_platform_course_jobs SET phase='COMPLETE',last_error=NULL WHERE activity_key=?",job.activity_key),p(db,'DELETE FROM website_platform_guards WHERE guard_id=?',guard)
 ]);
}
// One bounded step, for one accepted publication. Recovery never impersonates
// the original publisher or depends on that person's expired credentials.
export async function resumeCourseStudio(env,{activityKey,fetcher=env.WEBSITE_PLATFORM_SERVICE?.fetch.bind(env.WEBSITE_PLATFORM_SERVICE)||fetch}={}){
 if(!courseStudioEnabled(env))return;
 const db=env.ACADEMY_DB.withSession('first-primary');
 const job=activityKey?await p(db,"SELECT * FROM website_platform_course_jobs WHERE activity_key=? AND phase<>'COMPLETE'",activityKey).first():await p(db,"SELECT * FROM website_platform_course_jobs INDEXED BY website_platform_course_jobs_due WHERE phase<>'COMPLETE' AND next_attempt<=? ORDER BY next_attempt,activity_key LIMIT 1",Date.now()).first();
 if(!job)return;
 if(await p(db,'SELECT enabled FROM website_platform_control WHERE singleton=1').first('enabled')!==1)return;
 // A short indexed lease rotates pending jobs fairly without scanning people.
 const claimed=await p(db,"UPDATE website_platform_course_jobs SET next_attempt=? WHERE activity_key=? AND phase=? AND next_attempt=?",Date.now()+30_000,job.activity_key,job.phase,job.next_attempt).run();if(!claimed.meta?.changes)return;
 const owner=await p(db,'SELECT * FROM website_platform_access_ownership WHERE activity_key=?',job.activity_key).first();
 if(!owner||owner.state!=='FROZEN')throw fail('The accepted setup is not frozen.',409,'HANDOVER_CHANGED');
 try{
  const request=command=>send(env,db,job,owner,command,fetcher);
  if(job.phase==='REGISTER'){
   await request({action:'register'});await p(db,"UPDATE website_platform_course_jobs SET phase='RECONCILE',last_error=NULL WHERE activity_key=? AND phase='REGISTER'",job.activity_key).run();return;
  }
  if(job.phase==='RECONCILE'){
   const page=await importAccessPage(db,{activityKey:job.activity_key,limit:25});await queueAccess(db,{limit:8});
   if(page.done&&!page.dataset)await p(db,"UPDATE website_platform_course_jobs SET phase='HANDOVER',last_error=NULL WHERE activity_key=? AND phase='RECONCILE'",job.activity_key).run();return;
  }
  const status=await request({action:'handover-status'});
  if(status.handover?.phase==='COMMITTED'&&status.handover.transfer_id===owner.transfer_id){await finish(db,job,owner);return;}
  const pending=await p(db,`SELECT 1 FROM website_platform_access_imports WHERE activity_key=? AND done=0 UNION ALL SELECT 1 FROM website_platform_access_dirty WHERE activity_key=? AND (revision<>exported_revision OR last_error IS NOT NULL) UNION ALL SELECT 1 FROM website_platform_outbox INDEXED BY website_platform_scope_pending WHERE access_scope=? AND acknowledged=0 LIMIT 1`,job.activity_key,job.activity_key,job.activity_key).first();
  if(pending)return;
  const generation=await p(db,'SELECT revision FROM website_platform_access_scopes WHERE activity_key=? AND enabled=1',job.activity_key).first('revision'),stream=await accessStream(job.offering_id,''),version=integer(await p(db,'SELECT version FROM website_platform_streams WHERE stream=?',stream).first('version'),1);
  if(generation!==owner.generation||owner.source_version!==null&&owner.source_version!==version)throw fail('Setup facts changed.',409,'HANDOVER_CHANGED');
  if(owner.source_version===null){
   await request({action:'handover-begin',operationId:'publication:'+owner.transfer_id+':begin',generation,sourceVersion:version});
   await p(db,"UPDATE website_platform_access_ownership SET source_version=? WHERE activity_key=? AND transfer_id=? AND state='FROZEN' AND source_version IS NULL",version,job.activity_key,owner.transfer_id).run();return;
  }
  const rows=(await p(db,'SELECT account_id FROM website_platform_access_dirty WHERE activity_key=? AND account_id>? ORDER BY account_id LIMIT 25',job.activity_key,owner.cursor).all()).results;
  if(rows.length){
   const people=[];for(const row of rows)people.push({accountId:row.account_id,version:integer(await p(db,'SELECT version FROM website_platform_streams WHERE stream=?',await accessStream(job.offering_id,row.account_id)).first('version'),1)});
   const result=await request({action:'handover-page',operationId:'publication:'+owner.transfer_id+':page:'+owner.checked,after:owner.cursor,people});
   await p(db,"UPDATE website_platform_access_ownership SET cursor=?,checked=?,updated_at=? WHERE activity_key=? AND transfer_id=? AND state='FROZEN' AND cursor=?",result.cursor,result.checked,Date.now(),job.activity_key,owner.transfer_id,owner.cursor).run();return;
  }
  await request({action:'handover-commit',operationId:'publication:'+owner.transfer_id+':commit',after:owner.cursor,count:owner.checked,final:true});await finish(db,job,owner);
 }catch(error){
  // A changed checkpoint is cancelled before a new transfer is created. The
  // source remains FROZEN throughout, including an unknown network outcome.
  try{if(['HANDOVER_CHANGED','CHANGE_CONFLICT'].includes(error.code)){
   const status=await send(env,db,job,owner,{action:'handover-status'},fetcher);
   if(status.handover?.phase==='COMMITTED'&&status.handover.transfer_id===owner.transfer_id){await finish(db,job,owner);return;}
   await send(env,db,job,owner,{action:'handover-abort',operationId:'publication:'+owner.transfer_id+':abort'},fetcher);
   const generation=await p(db,'SELECT revision FROM website_platform_access_scopes WHERE activity_key=?',job.activity_key).first('revision');
   await db.batch([p(db,'INSERT INTO website_platform_access_cancellations VALUES(?,?,?) ON CONFLICT DO NOTHING',owner.transfer_id,job.activity_key,Date.now()),p(db,"UPDATE website_platform_access_ownership SET transfer_id=?,generation=?,source_version=NULL,cursor='',checked=0 WHERE activity_key=? AND transfer_id=? AND state='FROZEN'",crypto.randomUUID(),generation,job.activity_key,owner.transfer_id)]);
  }}catch(recoveryError){error=recoveryError;}
  await p(db,"UPDATE website_platform_course_jobs SET attempts=attempts+1,next_attempt=?,last_error=? WHERE activity_key=? AND phase<>'COMPLETE'",Date.now()+30_000,error.code||'STUDIO_SETUP_RETRY',job.activity_key).run();
 }
}
