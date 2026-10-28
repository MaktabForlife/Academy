import test from 'node:test';
import assert from 'node:assert/strict';
import {grantsFixture,scope,ok,op} from './fixtures/academy-surah-grants-fixture.mjs';
import worker from '../src/academy-runtime.js';
import {createHash} from 'node:crypto';
async function use(run){const f=await grantsFixture();try{await run(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{f.db.close();}}
test('actual scoped Admin may grant or revoke individual Surahs without changing payment history; retries are exact',()=>use(async f=>{
 const scoped=await f.login('0004'),teacher=await f.login('0003'),student=await f.login('0002');
 ok(await f.saveGrant(f.ids[0],true,'account-0002',scoped));
 for(const token of [teacher,student]){assert.equal((await f.grants('account-0002',token)).status,403);assert.equal((await f.monthly('surah-grants-save',{accountId:'account-0002',entries:[{id:f.ids[0],active:false,revision:1}],policyRevision:2,operationId:op()},token)).status,403);}
 const input={accountId:'account-0002',entries:[{id:f.ids[0],active:false,revision:1}],note:'Temporary additional access ended',policyRevision:2,operationId:op()};
 ok(await f.monthly('surah-grants-save',input,scoped));assert.equal(ok(await f.monthly('surah-grants-save',input,scoped)).replayed,true);
 assert.equal((await f.monthly('surah-grants-save',{...input,note:'Changed retry'},scoped)).status,409);
 assert.equal((await f.monthly('surah-grants-save',{...input,operationId:op()},scoped)).status,409);
 const row=f.db.prepare('SELECT * FROM program_surah_grants').get();assert.equal(row.active,0);assert.equal(row.revision,2);assert.equal(row.note,input.note);
 assert.equal(f.db.prepare('SELECT count(*) n FROM program_monthly_subscriptions').get().n,0);
 assert.equal(f.db.prepare("SELECT count(*) n FROM audit_events WHERE action='surah-grants-save'").get().n,2);
 assert.equal(f.db.prepare('SELECT enabled,revision FROM program_monthly_media_policies').get().enabled,0,'Additional access never activates monthly protection');
}));
test('additional access opens only the selected published website and its attachments, with live revocation',()=>use(async f=>{
 const [id,second]=f.ids,student=await f.login('0002'),other=await f.login('0008');
 ok(await f.saveGrant(id,true));assert.equal((await f.read(id,student)).status,404,'Unpublished drafts remain private');
 const bytes=Buffer.from('%PDF-1.4\n% grants fixture\n%%EOF'),assetId=op(),metadata={activityKey:scope,surahId:id,assetId,operationId:op(),filename:'maryam.pdf',type:'application/pdf',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 let response=await worker.fetch(new Request('http://localhost/api/admin/platform/course-websites/upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{method:'POST',headers:{Authorization:'Bearer '+f.admin,'X-Academy-Workspace':'ADMIN'},body:bytes}),f.env);assert.equal(response.status,200,await response.text());
 const view=ok(await f.site('get',id));view.document.materials.files=[{id:op(),assetId,title:'Maryam PDF',description:''}];
 const saved=ok(await f.site('save',id,{document:view.document,revision:0,operationId:op()}));ok(await f.site('publish',id,{revision:saved.revision,operationId:op()}));await f.publish(second);
 const asset=token=>worker.fetch(new Request('http://localhost/api/academy/course-websites/asset',{method:'POST',headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':'LEARN','Content-Type':'application/json'},body:JSON.stringify({activityKey:scope,surahId:id,assetId})}),f.env);
 assert.equal((await f.read(id,student)).status,200);assert.equal((await f.read(second,student)).status,403);assert.equal((await f.read(id,other)).status,403);
 response=await asset(student);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);assert.equal((await asset(other)).status,403);
 const links=ok(await f.call('/api/academy/tafseer-links',{},student));assert.equal(links.links.yaseen.code,id);assert.equal(links.links.saffat,undefined);
 ok(await f.saveGrant(id,false));assert.equal((await f.read(id,student)).status,403);assert.equal((await asset(student)).status,403);
}));
test('paid months remain independent; removing an additional grant retains paid access and recordings gain no rights',()=>use(async f=>{
 const id=f.ids[0],student=await f.login('0002');await f.publish();ok(await f.saveGrant(id,true));
 ok(await f.monthly('grid-save',{policyRevision:2,operationId:op(),entries:[{accountId:'account-0008',month:'2024-01',subscribed:true,revision:0,classIds:['mou-class']}]},f.admin));
 ok(await f.monthly('configure',{mode:'activate',policyRevision:3,operationId:op(),reviewed:true},f.admin));
 assert.equal((await f.read(id,student)).status,200);
 const lessons=ok(await f.media('list',{month:'2026-10',view:'learn'},student));assert.equal(lessons.lessons.length,0,'A website grant does not manufacture recording paid-month rights');
 ok(await f.monthly('grid-save',{policyRevision:4,operationId:op(),entries:[{accountId:'account-0002',month:'2024-01',subscribed:true,revision:0,classIds:['mou-class']}]},f.admin));
 ok(await f.saveGrant(id,false));assert.equal((await f.read(id,student)).status,200);
 const current=ok(await f.grants());assert.equal(current.surahs[0].paidMonth,true);assert.equal(current.surahs[0].additional,false);
}));
test('foreign, inactive and public grants are rejected atomically, and current account/session gates cannot be bypassed',()=>use(async f=>{
 const id=f.ids[0],student=await f.login('0002');await f.publish();
 const bad={accountId:'account-0002',entries:[{id,active:true,revision:0},{id:op(),active:true,revision:0}],policyRevision:2,operationId:op()};
 assert.equal((await f.monthly('surah-grants-save',bad,f.admin)).status,403);assert.equal(f.db.prepare('SELECT count(*) n FROM program_surah_grants').get().n,0);
 assert.equal((await f.saveGrant(f.ids[2],true)).status,400);assert.equal((await f.grants('account-0001')).status,404);
 f.db.prepare('UPDATE accounts SET active=0 WHERE account_id=?').run('account-0002');assert.equal((await f.monthly('surah-grants-save',{accountId:'account-0002',entries:[{id,active:true,revision:0}],policyRevision:2,operationId:op()},f.admin)).status,404);f.db.prepare('UPDATE accounts SET active=1 WHERE account_id=?').run('account-0002');
 ok(await f.saveGrant(id,true));assert.equal((await f.read(id,student)).status,200);
 f.db.prepare('UPDATE program_surahs SET active=0 WHERE surah_id=?').run(id);assert.equal((await f.read(id,student)).status,403);
 f.db.prepare('UPDATE program_surahs SET active=1 WHERE surah_id=?').run(id);assert.equal((await f.read(id,student)).status,200);
 const row=f.db.prepare('SELECT revision FROM program_surah_website_documents WHERE surah_id=?').get(id);ok(await f.site('withdraw',id,{revision:row.revision,operationId:op()}));assert.equal((await f.read(id,student)).status,404);
 f.db.prepare('UPDATE account_sessions SET revoked_at=? WHERE account_id=?').run(new Date().toISOString(),'account-0002');assert.equal((await f.read(id,student)).status,401);
}));
test('a former participant retains a website-only context, with no fabricated student or teacher assignment',()=>use(async f=>{
 const id=f.ids[0],student=await f.login('0002');await f.publish();ok(await f.saveGrant(id,true));
 f.db.prepare('DELETE FROM class_memberships WHERE account_id=? AND activity_key=?').run('account-0002',scope);f.db.prepare('UPDATE role_assignments SET active=0 WHERE account_id=? AND activity_key=?').run('account-0002',scope);
 assert.equal((await f.read(id,student)).status,200);
 assert.equal((await f.media('historical-create',{date:'2024-01-16',title:'Forged',classIds:['mou-class'],operationId:op()},student)).status,403);
 ok(await f.saveGrant(id,false));assert.notEqual((await f.read(id,student)).status,200);
}));
