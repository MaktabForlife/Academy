import test from 'node:test';import assert from 'node:assert/strict';
import {messagingFixture} from './fixtures/academy-messaging-fixture.mjs';
import {recoverMessaging,deliverMessaging} from '../src/academy/d1/messaging.js';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import worker from '../src/academy/d1/worker.js';
import {authenticatedD1Account} from '../src/academy/d1/session.js';
import {acceptedRepository,acceptedHead} from '../src/academy/d1/setup-reader.js';
import {messaging} from '../src/academy/d1/messaging.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const target=f=>({scopes:[{activityKey:f.scopes.programA,mode:'CLASS',classId:'messaging-200'}]});
async function use(fn,split=false){const f=await messagingFixture({split});try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{f.close();}}

test('student sends a 200-account class notice; preview, opened, acknowledgement and archive remain independent',()=>use(async f=>{
 const student=await f.login('0002'),teacher=await f.login('0003'),global=await f.actor('global');
 const opts=ok(await f.request('options',{},student));assert(opts.canSend);assert(opts.classes.some(c=>c.classId==='messaging-200'));assert(!opts.canAllAcademy);
 const sent=ok(await f.send(target(f),student,'LEARN',{requiresAcknowledgement:true}));assert.equal(sent.state,'SENT');assert.equal(sent.recipientCount,200);
 assert.equal(f.db.prepare('SELECT count(*) n FROM messaging_recipients WHERE notice_id=?').get(sent.noticeId).n,200);
 const report=ok(await f.request('report',{noticeId:sent.noticeId},student));assert.deepEqual(report.counts,{delivered:200,opened:0,acknowledged:0});assert.equal(report.recipients.length,30);assert.equal(report.nextOffset,30);
 assert.equal(ok(await f.request('summary',{},teacher,'TEACH')).counts.unread,1);ok(await f.request('list',{},teacher,'TEACH'));
 assert.equal(f.db.prepare('SELECT first_opened_at FROM messaging_recipients WHERE notice_id=? AND account_id=?').get(sent.noticeId,'account-0003').first_opened_at,null);
 const opened=ok(await f.request('get',{noticeId:sent.noticeId,operationId:crypto.randomUUID()},teacher,'TEACH')).notice;assert(opened.firstOpenedAt);assert.equal(opened.acknowledgedAt,null);
 ok(await f.request('acknowledge',{noticeId:sent.noticeId,operationId:crypto.randomUUID()},teacher,'TEACH'));
 ok(await f.request('unread',{noticeId:sent.noticeId,operationId:crypto.randomUUID()},teacher,'TEACH'));
 ok(await f.request('archive',{noticeId:sent.noticeId,operationId:crypto.randomUUID()},teacher,'TEACH'));
 const archived=ok(await f.request('list',{folder:'archived'},teacher,'TEACH')).notices[0];assert(archived.firstOpenedAt);assert(archived.acknowledgedAt);assert(archived.unread);
 ok(await f.request('restore',{noticeId:sent.noticeId,operationId:crypto.randomUUID()},teacher,'TEACH'));
 const independent=f.db.prepare('SELECT count(*) n FROM messaging_recipients WHERE notice_id=? AND first_opened_at IS NULL AND acknowledged_at IS NULL').get(sent.noticeId).n;assert.equal(independent,199);
 assert.equal((await f.request('get',{noticeId:sent.noticeId,operationId:crypto.randomUUID()},global,'ADMIN')).status,404);
 assert.throws(()=>f.db.prepare("UPDATE messaging_notices SET body='changed' WHERE notice_id=?").run(sent.noticeId),/messaging_notice_immutable/);
}));

test('server enforces Student, assigned Teacher, scoped Admin and Global Admin audiences',()=>use(async f=>{
 const student=await f.login('0002'),teacher=await f.login('0003'),adminA=await f.actor('adminA'),global=await f.actor('global'),none=await f.actor('none');
 for(const targets of [{allAcademy:true},{scopes:[{activityKey:f.scopes.programA,mode:'ALL'}]},{scopes:[{activityKey:f.scopes.programA,mode:'CLASS',classId:'class-shared'}]}])assert.equal((await f.send(targets,student)).status,403);
 assert.equal((await f.send({allAcademy:true},teacher,'TEACH')).status,403);
 assert.equal((await f.send({scopes:[{activityKey:f.scopes.programB,mode:'ALL'}]},adminA,'ADMIN')).status,403);
 assert.equal(ok(await f.send({scopes:[{activityKey:f.scopes.programA,mode:'ALL'}]},adminA,'ADMIN')).state,'SENT');
 assert.equal((await f.send(target(f),global,'ADMIN_LEARN')).status,403);
 assert.equal((await f.send(target(f),none)).status,403);
 const all=ok(await f.send({allAcademy:true},global,'ADMIN'));assert(all.recipientCount>200);
 const multi=ok(await f.send({scopes:[{activityKey:f.scopes.programA,mode:'ALL'},{activityKey:f.scopes.courseA,mode:'ALL'},{activityKey:f.scopes.programA,mode:'CLASS',classId:'messaging-200'}]},global,'ADMIN'));
 assert.equal(f.db.prepare('SELECT count(*) n,count(DISTINCT account_id) unique_n FROM messaging_recipients WHERE notice_id=?').get(multi.noticeId).n,multi.recipientCount);
}));

test('review binds content, actor and current unique recipients; changed audience keeps the draft',()=>use(async f=>{
 const student=await f.login('0002'),other=await f.login('0003');
 const saved=ok(await f.request('save',{subject:'Reviewed notice',body:'Reviewed body',targets:target(f),operationId:crypto.randomUUID()},student));
 const review=ok(await f.request('review',{draftId:saved.draftId,revision:saved.revision,operationId:crypto.randomUUID()},student));
 assert.equal((await f.request('confirm',{reviewId:review.reviewId,operationId:crypto.randomUUID()},other,'TEACH')).status,409);
 f.db.prepare("UPDATE accounts SET active=0 WHERE account_id='message-learner-000'").run();
 assert.equal((await f.request('confirm',{reviewId:review.reviewId,operationId:crypto.randomUUID()},student)).body.code,'MESSAGING_AUDIENCE_CHANGED');
 assert.equal(f.db.prepare('SELECT state,body FROM messaging_drafts WHERE draft_id=?').get(saved.draftId).body,'Reviewed body');
 assert.equal(f.db.prepare('SELECT count(*) n FROM messaging_notices').get().n,0);
}));

test('schedules re-resolve current membership without a live browser session and hold revoked senders',()=>use(async f=>{
 const global=await f.actor('global'),when=new Date(Date.now()+3600000),local=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Johannesburg',dateStyle:'short',timeStyle:'short'}).format(when).replace(' ','T');
 const scheduled=ok(await f.send(target(f),global,'ADMIN',{scheduleLocal:local}));assert.equal(scheduled.state,'SCHEDULED');
 f.db.prepare("UPDATE accounts SET active=0 WHERE account_id='message-learner-000'").run();
 f.db.prepare("UPDATE account_sessions SET revoked_at='now' WHERE account_id=?").run(f.actors.global);
 await recoverMessaging(f.env,new Date(when.getTime()+60000));
 const notice=f.db.prepare('SELECT * FROM messaging_notices WHERE draft_id=?').get(scheduled.draftId);assert.equal(notice.state,'SENT');assert.equal(notice.recipient_count,199);
 const teacher=await f.login('0003'),held=ok(await f.send(target(f),teacher,'TEACH',{scheduleLocal:local}));
 f.db.prepare("DELETE FROM class_teacher_assignments WHERE class_id='messaging-200' AND account_id='account-0003'").run();
 await recoverMessaging(f.env,new Date(when.getTime()+60000));assert.equal(f.db.prepare('SELECT state FROM messaging_drafts WHERE draft_id=?').get(held.draftId).state,'NEEDS_REVIEW');
}));

test('accepted send retries issue once and interrupted chunks resume exactly once',()=>use(async f=>{
 const global=await f.actor('global'),saved=ok(await f.request('save',{subject:'Retry',body:'Retain once',targets:{allAcademy:true},operationId:crypto.randomUUID()},global,'ADMIN'));
 const review=ok(await f.request('review',{draftId:saved.draftId,revision:saved.revision,operationId:crypto.randomUUID()},global,'ADMIN')),input={reviewId:review.reviewId,operationId:crypto.randomUUID()};
 f.db.exec("CREATE TRIGGER fail_messaging_chunk BEFORE INSERT ON messaging_recipients WHEN NEW.account_id='message-learner-050' BEGIN SELECT RAISE(ABORT,'simulated delivery failure'); END;");
 const first=ok(await f.request('confirm',input,global,'ADMIN'));assert.equal(first.state,'ISSUING');
 assert.equal(ok(await f.request('summary',{},await f.login('0002'))).counts.unread,0);
 f.db.exec('DROP TRIGGER fail_messaging_chunk');f.db.prepare("UPDATE messaging_jobs SET next_attempt_at='2000-01-01'").run();
 const second=ok(await f.request('confirm',input,global,'ADMIN'));assert(second.replayed);assert.equal(second.state,'SENT');
 assert.equal(f.db.prepare('SELECT count(*) n FROM messaging_notices').get().n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM messaging_recipients').get().n,first.recipientCount);
 await deliverMessaging(academyD1Repository(f.env));assert.equal(f.db.prepare('SELECT count(*) n FROM messaging_recipients').get().n,first.recipientCount);
}));

test('messaging stays Core-only through the real split HTTP runtime and protects physical write fences',()=>use(async f=>{
 const student=await f.login('0002'),before=f.db.prepare('SELECT version FROM split_read_state').get().version;
 const sent=ok(await f.send(target(f),student));assert.equal(sent.recipientCount,200);assert.equal(sent.state,'SENT');
 assert(f.db.prepare('SELECT version FROM split_read_state').get().version>before);
 assert.equal(f.databases.admin.prepare("SELECT count(*) n FROM sqlite_schema WHERE name LIKE 'messaging_%'").get().n,0);
 f.db.exec("INSERT INTO split_commands(command_id,phase,payload_hash,created_at) VALUES('held','PREPARING','held','now');INSERT INTO split_write_fence VALUES(1,'held',0)");
 assert.throws(()=>f.db.prepare("UPDATE messaging_recipients SET unread=0").run(),/split_write_busy/);f.db.exec('DELETE FROM split_write_fence');
},true));

test('draft ownership, revisions, cancellation and corrections retain audit history',()=>use(async f=>{
 const student=await f.login('0002'),teacher=await f.login('0003');
 const input={subject:'Original instructions',body:'Original retained wording',targets:target(f),operationId:crypto.randomUUID()},saved=ok(await f.request('save',input,student));
 assert.equal(ok(await f.request('save',input,student)).replayed,true);
 assert.equal((await f.request('draft',{draftId:saved.draftId},teacher,'TEACH')).status,404);
 assert.equal((await f.request('save',{...input,draftId:saved.draftId,revision:99,operationId:crypto.randomUUID()},student)).body.code,'MESSAGING_CHANGED');
 const reviewed=ok(await f.request('review',{draftId:saved.draftId,revision:saved.revision,operationId:crypto.randomUUID()},student));
 const sent=ok(await f.request('confirm',{reviewId:reviewed.reviewId,operationId:crypto.randomUUID()},student));
 const corrected=ok(await f.send(target(f),student,'LEARN',{subject:'Correction',body:'Corrected instructions',previousNoticeId:sent.noticeId}));
 assert.equal(f.db.prepare('SELECT previous_notice_id FROM messaging_notices WHERE notice_id=?').get(corrected.noticeId).previous_notice_id,sent.noticeId);
 ok(await f.request('withdraw',{noticeId:sent.noticeId,reason:'Instructions replaced by the correction',operationId:crypto.randomUUID()},student));
 assert.equal(ok(await f.request('get',{noticeId:sent.noticeId,operationId:crypto.randomUUID()},teacher,'TEACH')).notice.body,'');
 const report=ok(await f.request('report',{noticeId:sent.noticeId},student));assert.equal(report.notice.body,'Original retained wording');assert(report.events.some(e=>e.action==='save-draft'));assert(report.events.some(e=>e.action==='review'));assert(report.events.some(e=>e.action==='withdraw'));
 const draft=ok(await f.request('save',{...input,operationId:crypto.randomUUID()},student));
 ok(await f.request('cancel',{draftId:draft.draftId,revision:draft.revision,operationId:crypto.randomUUID()},student));
 assert.equal(f.db.prepare('SELECT state FROM messaging_drafts WHERE draft_id=?').get(draft.draftId).state,'CANCELLED');
}));

test('lesson and Class Note links retain one canonical record and reject an unrelated class',()=>use(async f=>{
 const student=await f.login('0002'),notes=await f.notes('LEARN','original-student'),source=(await notes.run('sessions',{activityKey:f.scopes.programA,date:f.today})).sources.find(s=>s.classId==='class-1'),view=await notes.run('get',{activityKey:f.scopes.programA,source}),note=await notes.run('post',f.post(view));
 const audience={scopes:[{activityKey:f.scopes.programA,mode:'CLASS',classId:'class-1'}]},link={type:'CLASS_NOTE',activityKey:f.scopes.programA,noteId:note.noteId};
 const sent=ok(await f.send(audience,student,'LEARN',{link})),record=f.db.prepare('SELECT link_json FROM messaging_notices WHERE notice_id=?').get(sent.noticeId),saved=JSON.parse(record.link_json);
 assert.equal(saved.noteId,note.noteId);assert.equal(saved.versionId,note.versionId);assert.equal(f.db.prepare('SELECT count(*) n FROM class_notes').get().n,1);
 assert.equal((await f.send(target(f),student,'LEARN',{link})).status,400);
 assert.equal(ok(await f.request('get',{noticeId:sent.noticeId,operationId:crypto.randomUUID()},student)).notice.link.noteId,note.noteId);
}));

test('dated sessions stay within assigned teaching; scoped report discovery never widens Admin authority',()=>use(async f=>{
 const teacher=await f.login('0003'),student=await f.login('0002'),global=await f.actor('global'),adminA=await f.actor('adminA'),adminB=await f.actor('adminB');
 const sessions=ok(await f.request('sessions',{activityKey:f.scopes.programA,date:f.today},teacher,'TEACH')).sessions;assert(sessions.length);
 const s=sessions[0],targets={scopes:[{activityKey:s.activityKey,classId:s.classId,mode:'SESSION',date:s.date,sessionKey:s.sessionKey}]};
 const sent=ok(await f.send(targets,teacher,'TEACH'));assert(sent.recipientCount>0);
 assert.equal((await f.send(targets,student)).status,403);
 assert.equal((await f.send({scopes:[{...targets.scopes[0],sessionKey:'forged'}]},teacher,'TEACH')).status,403);
 assert(ok(await f.request('list',{folder:'reports'},adminA,'ADMIN')).notices.some(n=>n.id===sent.noticeId));
 assert(!ok(await f.request('list',{folder:'reports'},adminB,'ADMIN')).notices.some(n=>n.id===sent.noticeId));
 assert.equal((await f.request('report',{noticeId:sent.noticeId},adminB,'ADMIN')).status,403);
 const all=ok(await f.send({allAcademy:true},global,'ADMIN'));
 assert(!ok(await f.request('list',{folder:'reports'},adminA,'ADMIN')).notices.some(n=>n.id===all.noticeId));
 assert(ok(await f.request('list',{folder:'reports'},global,'ADMIN')).notices.some(n=>n.id===all.noticeId));
}));

test('archived acknowledgement requests remain visible until explicitly acknowledged',()=>use(async f=>{
 const teacher=await f.login('0003'),student=await f.login('0002'),sent=ok(await f.send(target(f),teacher,'TEACH',{requiresAcknowledgement:true}));
 ok(await f.request('archive',{noticeId:sent.noticeId,operationId:crypto.randomUUID()},student));
 const summary=ok(await f.request('summary',{},student));assert.equal(summary.counts.unread,0);assert.equal(summary.counts.toAcknowledge,1);
 assert(ok(await f.request('list',{filter:'ack'},student)).notices.some(n=>n.id===sent.noticeId));
 ok(await f.request('acknowledge',{noticeId:sent.noticeId,operationId:crypto.randomUUID()},student));assert.equal(ok(await f.request('summary',{},student)).counts.toAcknowledge,0);
}));

test('split schedules operate after the original session is revoked',()=>use(async f=>{
 const global=await f.actor('global'),when=new Date(Date.now()+3600000),local=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Johannesburg',dateStyle:'short',timeStyle:'short'}).format(when).replace(' ','T');
 const scheduled=ok(await f.send(target(f),global,'ADMIN',{scheduleLocal:local}));
 f.db.prepare("UPDATE account_sessions SET revoked_at='now' WHERE account_id=?").run(f.actors.global);
 await recoverMessaging(f.env,new Date(when.getTime()+60000));assert.equal(f.db.prepare('SELECT state FROM messaging_notices WHERE draft_id=?').get(scheduled.draftId).state,'SENT');
},true));

test('Course class sending requires delivery membership plus learning access',()=>use(async f=>{
 const activityKey='COURSE:subject-1',student=await f.login('0002'),teacher=await f.login('0003'),none=await f.actor('none');
 const targets={scopes:[{activityKey,mode:'CLASS',classId:'run-1'}]};
 assert.equal((await f.send(targets,student)).status,403);
 f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('messaging-course-student','account-0002',?,'STUDENT',1,'CONFIRMED')").run(activityKey);
 f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('messaging-course-teacher','account-0003',?,'TEACHER',1,'CONFIRMED')").run(activityKey);
 f.db.prepare("INSERT INTO attendance_delivery_rosters VALUES(?,'run-1',1,?,'account-0003')").run(activityKey,new Date().toISOString());
 for(const [id,account]of [['message-course-member','account-0002'],['message-course-no-access',f.actors.none]])f.db.prepare("INSERT INTO attendance_delivery_members(interval_id,activity_key,run_id,account_id,join_date,state,created_at,created_by) VALUES(?,?,'run-1',?,?,'VALID',?,'account-0003')").run(id,activityKey,account,f.today,new Date().toISOString());
 const sent=ok(await f.send(targets,student));assert(sent.recipientCount>=2);
 assert(f.db.prepare("SELECT 1 FROM messaging_recipients WHERE notice_id=? AND account_id='account-0003'").get(sent.noticeId));
 assert(!f.db.prepare('SELECT 1 FROM messaging_recipients WHERE notice_id=? AND account_id=?').get(sent.noticeId,f.actors.none));
 assert.equal((await f.send(targets,none)).status,403);
 assert(ok(await f.request('options',{},teacher,'TEACH')).classes.some(c=>c.classId==='run-1'&&c.activityKey===activityKey));
}));

test('the dedicated minute tick leaves cache and Hifz recovery on their original cadence',async()=>{
 const work=[],ctx={waitUntil:p=>work.push(p)},env={ACADEMY_MESSAGING:'0'};
 await worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()},env,ctx);assert.equal(work.length,1);await Promise.all(work);
 work.length=0;await worker.scheduled({cron:'*/15 * * * *',scheduledTime:Date.now()},env,ctx);assert.equal(work.length,2);await Promise.all(work);
});

test('a Class Note changed after review cannot be silently sent under the old linked version',()=>use(async f=>{
 const student=await f.login('0002'),notes=await f.notes('LEARN','original-student'),source=(await notes.run('sessions',{activityKey:f.scopes.programA,date:f.today})).sources.find(s=>s.classId==='class-1'),view=await notes.run('get',{activityKey:f.scopes.programA,source}),note=await notes.run('post',f.post(view));
 const input={subject:'Versioned reference',body:'Open the reading instructions',targets:{scopes:[{activityKey:f.scopes.programA,mode:'CLASS',classId:'class-1'}]},link:{type:'CLASS_NOTE',activityKey:f.scopes.programA,noteId:note.noteId},operationId:crypto.randomUUID()};
 const saved=ok(await f.request('save',input,student)),review=ok(await f.request('review',{draftId:saved.draftId,revision:saved.revision,operationId:crypto.randomUUID()},student));
 const corrected=await notes.run('revise',{activityKey:f.scopes.programA,noteId:note.noteId,revision:note.revision,body:'Corrected reading allocations',due:{keep:true},operationId:crypto.randomUUID()});
 const rejected=await f.request('confirm',{reviewId:review.reviewId,operationId:crypto.randomUUID()},student);assert.equal(rejected.body.code,'MESSAGING_LINK_CHANGED');
 const old=ok(await f.request('draft',{draftId:saved.draftId},student)).draft;
 ok(await f.request('save',{...input,draftId:old.id,revision:old.revision,link:old.link,operationId:crypto.randomUUID()},student));
 assert.equal(JSON.parse(f.db.prepare('SELECT link_json FROM messaging_drafts WHERE draft_id=?').get(old.id).link_json).versionId,corrected.versionId);
 assert.equal(f.db.prepare('SELECT count(*) n FROM messaging_notices').get().n,0);
}));

test('a Core authority change during confirmation rolls the whole send back',()=>use(async f=>{
 const student=await f.login('0002'),saved=ok(await f.request('save',{subject:'Concurrent audience',body:'Review before send',targets:target(f),operationId:crypto.randomUUID()},student)),review=ok(await f.request('review',{draftId:saved.draftId,revision:saved.revision,operationId:crypto.randomUUID()},student));
 const base=academyD1Repository(f.env);await base.ready();
 const auth=await authenticatedD1Account(new Request('http://localhost',{headers:{Authorization:'Bearer '+student,'X-Academy-Workspace':'LEARN'}}),f.env,base);base.bindActor(auth);
 const repo=acceptedRepository(base,await acceptedHead(base)),db=repo.db;let injected=false;
 repo.db=new Proxy(db,{get(target,key){if(key==='batch')return async statements=>{
  if(!injected&&statements.some(s=>s.sql?.includes('INSERT INTO messaging_notices'))){injected=true;f.db.prepare("UPDATE class_memberships SET active=0 WHERE class_id='messaging-200' AND account_id='account-0002'").run();}
  return target.batch(statements);
 };const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 await assert.rejects(messaging(repo,auth).run('confirm',{reviewId:review.reviewId,operationId:crypto.randomUUID()}),e=>e.status===409);
 assert(injected);assert.equal(f.db.prepare('SELECT count(*) n FROM messaging_notices').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM messaging_recipients').get().n,0);
},true));
