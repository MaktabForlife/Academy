import {test} from 'node:test';import assert from 'node:assert/strict';
import worker from '../src/academy-runtime.js';
import {classNotesFixture} from './fixtures/academy-class-notes-fixture.mjs';
import {acceptedDatabase} from '../src/academy/d1/setup-reader.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
async function use(run){const f=await classNotesFixture();try{
 f.send=async(path,input={},who='global',workspace='ADMIN')=>{const response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await f.actor(who),'X-Academy-Workspace':workspace},body:JSON.stringify(input)}),f.env);return {status:response.status,body:await response.json()};};
 f.head=()=>f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id;
 f.read=()=>acceptedDatabase(f.env.ACADEMY_DB,f.head());
 f.current=async()=>ok(await f.send('/api/admin/platform/programs/list')).programs.find(p=>'PROGRAM:'+p.id===f.scopes.programA);
 f.save=async(extra={},who='global')=>{const p=await f.current();return f.send('/api/admin/platform/programs/save',{id:p.id,name:p.name,status:p.status,revision:p.revision,durationYears:p.durationYears,timezone:p.timezone,...extra,operationId:extra.operationId||crypto.randomUUID()},who);};
 f.finish=(result,who='global',workspace='ADMIN')=>f.send('/api/academy/changes/accept',result.acceptedChange,who,workspace);
 await run(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}}
test('normal feature Save completes its field delta while unrelated source drafts stay private',()=>use(async f=>{
 const before=f.head(),old=await f.read().prepare('SELECT name FROM activities WHERE activity_key=?').bind(f.scopes.programB).first();
 f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Unrelated private name',f.scopes.programB);
 f.db.prepare('UPDATE program_settings SET public_card_json=? WHERE activity_key=?').run(JSON.stringify({time:'9am',title:'Unrelated private card',description:'Unchanged private field'}),f.scopes.programA);
 const saved=ok(await f.save({name:'Normal Save accepted'}));assert(saved.acceptedChange);assert(!saved.setupPublication);assert(!saved._acceptedChange);assert.equal(f.head(),before);
 const done=ok(await f.finish(saved));assert.notEqual(done.head,before);assert.deepEqual(done.cacheRefreshPending,['public-timetable']);
 assert.equal((await f.read().prepare('SELECT name FROM activities WHERE activity_key=?').bind(f.scopes.programA).first()).name,'Normal Save accepted');
 assert.equal((await f.read().prepare('SELECT name FROM activities WHERE activity_key=?').bind(f.scopes.programB).first()).name,old.name);
 assert(!String((await f.read().prepare('SELECT public_card_json FROM program_settings WHERE activity_key=?').bind(f.scopes.programA).first()).public_card_json).includes('Unrelated private card'));
 assert(f.db.prepare('SELECT public_card_json FROM program_settings WHERE activity_key=?').get(f.scopes.programA).public_card_json.includes('Unrelated private card'));
}));
test('lost acknowledgements replay the same change without advancing the head or refresh revision',()=>use(async f=>{
 const operationId=crypto.randomUUID(),saved=ok(await f.save({name:'Retry me',operationId})),done=ok(await f.finish(saved));
 const repeated=ok(await f.finish(saved));assert.equal(repeated.head,done.head);assert.equal(repeated.replayed,true);
 assert.equal(JSON.parse(f.db.prepare("SELECT setting_value FROM academy_settings WHERE setting_key='AcademyRefresh:public-timetable'").get().setting_value).requested,2);
}));
test('another unrelated write may finish first without exposing it or stranding the earlier saved change',()=>use(async f=>{
 const saved=ok(await f.save({name:'Earlier intended name'}));f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Different area draft',f.scopes.programB);f.db.exec('UPDATE academy_write_state SET version=version+1');
 ok(await f.finish(saved));assert.equal((await f.read().prepare('SELECT name FROM activities WHERE activity_key=?').bind(f.scopes.programA).first()).name,'Earlier intended name');
}));
test('a newer change to the same field cannot be overwritten by accepting an older receipt',()=>use(async f=>{
 const saved=ok(await f.save({name:'Older field value'})),newer=ok(await f.save({name:'Newer field value'}));ok(await f.finish(newer));const head=f.head();
 const stale=await f.finish(saved);assert.equal(stale.status,409);assert.equal(stale.body.code,'CHANGE_SUPERSEDED');assert.equal(f.head(),head);
}));
test('another account, preview, revoked Admin and forged receipt references cannot accept a change',()=>use(async f=>{
 const saved=ok(await f.save({name:'Private until completion'})),head=f.head();
 assert.equal((await f.finish(saved,'adminA')).status,403);assert([401,403].includes((await f.finish(saved,'studentA','LEARN')).status));
 assert([401,403].includes((await f.finish(saved,'global','ADMIN_LEARN')).status));
 assert.equal((await f.send('/api/academy/changes/accept',{...saved.acceptedChange,operationId:crypto.randomUUID()})).status,403);
 f.db.prepare("UPDATE global_role_assignments SET active=0 WHERE account_id=?").run(f.actors.global);assert([401,403].includes((await f.finish(saved)).status));assert.equal(f.head(),head);
}));
test('a failed final transaction retains the saved source and can complete safely on retry',()=>use(async f=>{
 const saved=ok(await f.save({name:'Durable saved source'})),head=f.head();f.db.exec("CREATE TEMP TRIGGER reject_feature_audit BEFORE INSERT ON audit_events WHEN NEW.action='feature-accept' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
 assert.notEqual((await f.finish(saved)).status,200);assert.equal(f.head(),head);assert.equal(f.db.prepare('SELECT name FROM activities WHERE activity_key=?').get(f.scopes.programA).name,'Durable saved source');
 f.db.exec('DROP TRIGGER reject_feature_audit');ok(await f.finish(saved));assert.notEqual(f.head(),head);
}));
test('immutable accepted vectors retain pinned readers and live disables still dominate them',()=>use(async f=>{
 const before=f.head(),read=acceptedDatabase(f.env.ACADEMY_DB,before),name=(await read.prepare('SELECT name FROM activities WHERE activity_key=?').bind(f.scopes.programA).first()).name;
 ok(await f.finish(ok(await f.save({name:'New accepted name'}))));assert.equal((await read.prepare('SELECT name FROM activities WHERE activity_key=?').bind(f.scopes.programA).first()).name,name);
 assert.throws(()=>f.db.exec('DELETE FROM setup_head_components'),/immutable/);assert.throws(()=>f.db.prepare('UPDATE setup_components SET rows_json=?').run('[]'),/immutable/);
 f.db.prepare('UPDATE activities SET active=0 WHERE activity_key=?').run(f.scopes.programA);assert.equal((await read.prepare('SELECT active FROM activities WHERE activity_key=?').bind(f.scopes.programA).first()).active,0);
}));
test('the retired manual setup routes cannot stage or publish application changes',()=>use(async f=>{
 for(const action of ['options','review','freeze','publish','resolve'])assert.equal((await f.send('/api/admin/platform/setup/'+action,{scopes:[f.scopes.programA]})).status,404);
}));
test('saving the visible form also confirms its older saved fields, leaving untouched fields and other areas private',()=>use(async f=>{
 f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Older saved Program form',f.scopes.programA);
 const saved=ok(await f.save());ok(await f.finish(saved));assert.equal((await f.read().prepare('SELECT name FROM activities WHERE activity_key=?').bind(f.scopes.programA).first()).name,'Older saved Program form');
}));

test('central catalogue saves confirm only the subject or module edited and preserve unrelated private definitions',()=>use(async f=>{
 const path='/api/admin/platform/',subject=ok(await f.send(path+'academy-subjects/save',{mode:'create',subjectName:'Confirmed catalogue subject',active:true,operationId:crypto.randomUUID()}));assert(subject.acceptedChange);ok(await f.finish(subject));
 const key='ACADEMY:'+subject.subject.SubjectID;assert.equal((await f.read().prepare('SELECT name FROM subject_catalog WHERE subject_key=?').bind(key).first()).name,subject.subject.SubjectName);
 f.db.prepare("INSERT INTO subject_catalog VALUES('ACADEMY:private-status-subject','ACADEMY','private-status-subject','Private unrelated subject',1)").run();
 const archived=ok(await f.send(path+'academy-subjects/save',{mode:'rename',subjectId:subject.subject.SubjectID,subjectName:subject.subject.SubjectName,active:false,baseRevision:subject.subject.Revision,operationId:crypto.randomUUID()}));ok(await f.finish(archived));assert.equal((await f.read().prepare('SELECT active FROM subject_catalog WHERE subject_key=?').bind(key).first()).active,0);assert.equal(await f.read().prepare("SELECT name FROM subject_catalog WHERE subject_key='ACADEMY:private-status-subject'").first(),null);
 const restored=ok(await f.send(path+'academy-subjects/save',{mode:'rename',subjectId:subject.subject.SubjectID,subjectName:subject.subject.SubjectName,active:true,baseRevision:archived.subject.Revision,operationId:crypto.randomUUID()}));ok(await f.finish(restored));
 const catalogue=ok(await f.send(path+'learning-catalogue/get')),module=ok(await f.send(path+'learning-catalogue/module/save',{name:'Confirmed central module',subjectId:subject.subject.SubjectID,active:true,baseRevision:catalogue.emptyRevision,operationId:crypto.randomUUID()}));ok(await f.finish(module));assert.equal((await f.read().prepare('SELECT name FROM academy_module_catalogue WHERE module_id=?').bind(module.module.id).first()).name,module.module.name);
 assert.equal((await f.send(path+'academy-subjects/save',{mode:'rename',subjectId:subject.subject.SubjectID,subjectName:subject.subject.SubjectName,active:false,baseRevision:restored.subject.Revision,operationId:crypto.randomUUID()},'adminA')).status,403);
}));
