import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {enrolmentFixture,ok} from './fixtures/academy-enrolment-fixture.mjs';
async function use(fn){const f=await enrolmentFixture();try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{f.db.close();}}
const access=db=>Object.fromEntries(['accounts','role_assignments','course_subscription_decisions','class_memberships','timetable_publications'].map(t=>[t,db.prepare('SELECT * FROM '+t).all()]));
test('public catalogue is readable, visitors cannot submit, and signed-in requests never enrol users',()=>use(async f=>{
 const catalogue=ok(await f.get('/api/academy/enrolment/catalogue'));assert.equal(catalogue.entries.length,2);assert.equal(catalogue.whatsappNumber,'27828478639');assert.ok(!catalogue.entries.some(e=>e.id===f.hiddenEntry.id));assert.doesNotMatch(JSON.stringify(catalogue),/zoom|teacher|account/i);
 assert.equal((await f.submit(f.submission(),'')).status,401);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_enrolment_requests').get().n,0);
 const before=access(f.db),result=ok(await f.submit(f.submission({paid:true}))),board=ok(await f.enrol('get'));
 const r=board.requests.find(r=>r.id===result.id);assert.equal(r.name,before.accounts.find(a=>a.account_id==='account-0002').display_name);assert.ok(r.uniqueId);assert.equal(r.paid,true);assert.equal(r.items.length,2);assert.ok(r.items.some(i=>i.cost==='R300 per term'));assert.deepEqual(access(f.db),before);
 assert.equal((await f.enrol('get',{},'')).status,401);
}));
test('signed-in requests are linked only to their current account; contacts do not silently edit profiles',()=>use(async f=>{
 const before=access(f.db),result=ok(await f.submit(f.submission({name:'Contact correction'}),f.tokens.student));
 const row=f.db.prepare('SELECT * FROM academy_enrolment_requests WHERE request_id=?').get(result.id);assert.equal(row.account_id,'account-0002');assert.equal(row.display_name,before.accounts.find(a=>a.account_id==='account-0002').display_name);assert.notEqual(row.display_name,'Contact correction');assert.deepEqual(access(f.db),before);
 assert.equal((await f.submit(f.submission({accountId:'account-0001'}))).status,400);
 assert.equal((await f.submit(f.submission(),'bad-token')).status,401);
 const profile=ok(await f.call('/api/academy/enrolment/profile',{},f.tokens.student));assert.ok(profile.uniqueId);assert.equal(profile.name,before.accounts.find(a=>a.account_id==='account-0002').display_name);
}));
test('retries, stale catalogues, closed entries, invalid forms and throttling cannot create duplicate or partial requests',()=>use(async f=>{
 const body=f.submission(),first=ok(await f.submit(body));assert.equal(ok(await f.submit(body)).id,first.id);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_enrolment_requests').get().n,1);
 assert.equal((await f.submit({...body,paid:true})).status,409);
 for(const changes of [{entries:[]},{entries:[null]},{paid:'yes'},{website:'bot'}])assert.equal((await f.submit(f.submission(changes))).status,400);
 assert.equal((await f.submit(f.submission({entries:[f.hiddenEntry]}))).status,409);
 f.db.prepare('UPDATE academy_enrolment_catalogue SET revision=revision+1 WHERE entry_id=?').run(f.courseEntry.id);assert.equal((await f.submit(f.submission())).status,409);
 f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:false})};assert.equal((await f.submit(f.submission())).status,429);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_enrolment_requests').get().n,1);
}));
test('scoped inboxes hide unrelated selections, preserve them during edits and remove only authorised selections',()=>use(async f=>{
 const id=ok(await f.submit()).id,board=ok(await f.enrol('get',{},f.tokens.other)),r=board.requests[0];assert.equal(r.items.length,1);assert.equal(r.items[0].entryId,f.courseEntry.id);assert.equal(board.globalAdmin,false);assert.ok(!JSON.stringify(board).includes('R300 per term'));
 assert.equal((await f.enrol('get',{},f.tokens.teacher)).status,403);assert.equal((await f.enrol('get',{activityKey:f.program.activity_key},f.tokens.other)).status,403);
 assert.equal((await f.write('request-save',{id,baseRevision:r.revision,name:r.name,whatsapp:r.whatsapp,paid:true,entries:[f.programEntry.id]},f.tokens.other)).status,403);
 const change={id,baseRevision:r.revision,name:r.name,whatsapp:r.whatsapp,paid:true,entries:[f.courseEntry.id],operationId:crypto.randomUUID()};ok(await f.enrol('request-save',change,f.tokens.other));assert.equal(ok(await f.enrol('request-save',change,f.tokens.other)).replayed,true);
 assert.equal(f.db.prepare('SELECT count(*) n FROM academy_enrolment_request_items WHERE request_id=?').get(id).n,2);
 const deletion={id,baseRevision:r.revision+1,operationId:crypto.randomUUID()};ok(await f.enrol('request-delete',deletion,f.tokens.other));assert.equal(ok(await f.enrol('request-delete',deletion,f.tokens.other)).replayed,true);
 const remaining=ok(await f.enrol('get')).requests.find(r=>r.id===id);assert.equal(remaining.items.length,1);assert.equal(remaining.items[0].entryId,f.programEntry.id);
}));
test('manual registration copies name and WhatsApp, links the request, is replayable, and grants no learning access',()=>use(async f=>{
 const id=ok(await f.legacySubmit()).id,r=ok(await f.enrol('get')).requests[0],accountId=crypto.randomUUID(),body={id,accountId,baseRevision:r.revision,name:'Registered learner',whatsapp:r.whatsapp,paid:false,operationId:crypto.randomUUID()};
 const result=ok(await f.enrol('register',body));assert.equal(result.profile.accountId,accountId);assert.ok(result.profile.uniqueId);assert.equal(ok(await f.enrol('register',body)).profile.accountId,accountId);
 assert.equal(f.db.prepare('SELECT display_name FROM accounts WHERE account_id=?').get(accountId).display_name,'Registered learner');assert.equal(f.db.prepare('SELECT whatsapp_number FROM account_contact_details WHERE account_id=?').get(accountId).whatsapp_number,r.whatsapp);
 for(const table of ['role_assignments','course_subscription_decisions','class_memberships'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+table+' WHERE account_id=?').get(accountId).n,0);
 assert.equal(ok(await f.enrol('get')).requests[0].accountId,accountId);assert.equal((await f.write('register',{...body,accountId:crypto.randomUUID()},f.tokens.other)).status,403);
}));
test('linking, conflicts and deletion affect the inbox only; cost wording and year remain as submitted',()=>use(async f=>{
 const id=ok(await f.submit()).id,r=ok(await f.enrol('get')).requests[0],before=access(f.db);
 ok(await f.write('catalogue-save',{id:f.courseEntry.id,activityKey:'COURSE:'+f.published.courseId,year:2028,cost:'New fee',active:true,order:0,baseRevision:1}));
 ok(await f.write('request-save',{id,baseRevision:r.revision,name:'Corrected name',whatsapp:r.whatsapp,paid:true,accountId:'account-0002',entries:[f.courseEntry.id]}));
 const changed=ok(await f.enrol('get')).requests[0];assert.equal(changed.items[0].year,2027);assert.equal(changed.items[0].cost,'R350 for the Course');assert.ok(changed.uniqueId);assert.deepEqual(access(f.db),before);
 assert.equal((await f.write('request-delete',{id,baseRevision:r.revision})).status,409);
 ok(await f.write('request-delete',{id,baseRevision:changed.revision}));assert.equal(f.db.prepare('SELECT count(*) n FROM academy_enrolment_request_items').get().n,0);assert.deepEqual(access(f.db),before);
}));
test('catalogue and WhatsApp settings respect current authority and do not expose hidden learning details',()=>use(async f=>{
 assert.equal((await f.write('settings-save',{whatsappNumber:'27821234567'},f.tokens.other)).status,403);
 ok(await f.write('settings-save',{whatsappNumber:'27821234567'}));assert.equal(ok(await f.get('/api/academy/enrolment/catalogue')).whatsappNumber,'27821234567');
 assert.equal((await f.write('catalogue-save',{id:crypto.randomUUID(),activityKey:f.program.activity_key,year:2028,cost:'Free',active:true,order:0,baseRevision:0},f.tokens.other)).status,403);
 ok(await f.write('catalogue-save',{id:f.hiddenEntry.id,activityKey:'COURSE:'+f.draft.courseId,year:2027,cost:'Contact Admin',active:true,order:0,baseRevision:1}));const published=ok(await f.get('/api/academy/enrolment/catalogue'));assert.ok(published.entries.some(e=>e.id===f.hiddenEntry.id));assert.doesNotMatch(JSON.stringify(published),/unpublished-secret|zoom|sessions/);
 f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0006' AND role='PROGRAM_ADMIN'").run();assert.equal((await f.enrol('get',{},f.tokens.other)).status,403);
}));

test('registered users submit without contact fields, missing WhatsApp is allowed and identity is server-derived',()=>use(async f=>{
 f.db.prepare("DELETE FROM account_contact_details WHERE account_id='account-0002'").run();const body={operationId:crypto.randomUUID(),paid:false,entries:[f.courseEntry]};const id=ok(await f.submit(body)).id,r=f.db.prepare('SELECT * FROM academy_enrolment_requests WHERE request_id=?').get(id);assert.equal(r.account_id,'account-0002');assert.equal(r.whatsapp_number,'');assert.ok(r.display_name);const forged=ok(await f.submit({...body,operationId:crypto.randomUUID(),name:'Someone else',whatsapp:'+27820000000'}));const other=f.db.prepare('SELECT * FROM academy_enrolment_requests WHERE request_id=?').get(forged.id);assert.equal(other.display_name,r.display_name);assert.equal(other.whatsapp_number,'');
 f.db.prepare("UPDATE accounts SET display_name='Changed profile' WHERE account_id='account-0002'").run();assert.equal(ok(await f.submit(body)).id,id);assert.equal((await f.submit(body,f.tokens.admin)).status,409);
}));
test('contact upgrade preserves old requests, selections, receipt hashes and cascading deletion',()=>use(async f=>{
 const body=f.submission(),id=ok(await f.legacySubmit(body,'account-0002')).id,before=f.db.prepare('SELECT * FROM academy_enrolment_requests').all(),items=f.db.prepare('SELECT * FROM academy_enrolment_request_items').all();f.db.exec(readFileSync(new URL('../migrations/academy/0027_enrolment_profile_contacts.sql',import.meta.url),'utf8'));assert.deepEqual(f.db.prepare('SELECT * FROM academy_enrolment_requests').all(),before);assert.deepEqual(f.db.prepare('SELECT * FROM academy_enrolment_request_items').all(),items);assert.equal(ok(await f.submit(body)).id,id);f.db.prepare('DELETE FROM academy_enrolment_requests WHERE request_id=?').run(id);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_enrolment_request_items').get().n,0);
}));
