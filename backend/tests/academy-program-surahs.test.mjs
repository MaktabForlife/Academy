import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyFixture,scope} from './fixtures/academy-monthly-subscriptions-fixture.mjs';
const op=()=>crypto.randomUUID(),ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
async function use(fn){const f=await monthlyFixture();try{
 const admin=await f.login('0001');ok(await f.monthly('configure',{mode:'prepare',policyRevision:0,operationId:op()},admin));
 await fn(f,admin);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
}finally{f.db.close();}}
const site=(f,admin,action,surahId,input={})=>f.call('/api/admin/platform/course-websites/'+action,{activityKey:scope,surahId,...input},admin);
const read=(f,student,surahId,input={})=>f.call('/api/academy/course-websites/read',{activityKey:scope,surahId,...input},student);
async function seed(f,admin){
 const id=op(),second=op();
 ok(await f.monthly('surah-save',{policyRevision:1,operationId:op(),entries:[{id,name:'Surah Maryam',completionDate:'2024-01-16',active:true,revision:0},{id:second,name:'Surah Yusuf',completionDate:'2025-01-10',active:true,revision:0}]},admin));
 ok(await f.monthly('grid-save',{policyRevision:2,operationId:op(),entries:[{accountId:'account-0002',month:'2024-01',subscribed:true,revision:0,classIds:['mou-class']},{accountId:'account-0008',month:'2025-01',subscribed:true,revision:0,classIds:['mou-class']}]},admin));
 ok(await f.monthly('configure',{mode:'activate',policyRevision:3,operationId:op(),reviewed:true},admin));return {id,second};
}
test('manual surah completion table is scoped, supports historical dates, bulk saves and exact retry',()=>use(async(f,admin)=>{
 const scoped=await f.login('0004'),teacher=await f.login('0003'),id=op(),input={policyRevision:1,operationId:op(),entries:[{id,name:'Surah Maryam',completionDate:'2024-01-16',active:true,revision:0}]};
 assert.equal((await f.monthly('surahs',{},teacher)).status,403);assert.equal((await f.monthly('surah-save',input,teacher)).status,403);
 ok(await f.monthly('surah-save',input,scoped));assert.equal(ok(await f.monthly('surah-save',input,scoped)).replayed,true);
 const rows=ok(await f.monthly('surahs',{},scoped));assert.equal(rows.surahs[0].completionDate,'2024-01-16');assert.equal(rows.surahs[0].name,'Surah Maryam');
 const invalid={policyRevision:2,operationId:op(),entries:[{id:op(),name:'Surah A',completionDate:'2025-01-01',active:true,revision:0},{id:op(),name:'Surah B',completionDate:'2025-02-30',active:true,revision:0}]};
 assert.equal((await f.monthly('surah-save',invalid,admin)).status,400);assert.equal(f.db.prepare('SELECT count(*) n FROM program_surahs').get().n,1);
 assert.equal((await f.monthly('surah-save',{...input,operationId:op()},admin)).status,409);
}));
test('only the completion-month subscribers can read each published surah website and retain it after leaving',()=>use(async(f,admin)=>{
 const {id,second}=await seed(f,admin),student=await f.login('0002'),other=await f.login('0008');
 for(const surahId of [id,second]){
  const view=ok(await site(f,admin,'get',surahId));assert.equal(view.document.tag,'TAFSEER');
  const saved=ok(await site(f,admin,'save',surahId,{document:view.document,revision:0,operationId:op()}));
  assert.equal((await read(f,surahId===id?student:other,surahId)).status,404,'A private draft cannot be read');
  ok(await site(f,admin,'publish',surahId,{revision:saved.revision,operationId:op()}));
 }
 assert.equal(ok(await read(f,student,id)).document.name,'Surah Maryam');
 assert.equal((await read(f,other,id)).status,403);assert.equal((await read(f,student,second)).status,403);
 f.db.prepare("DELETE FROM class_memberships WHERE account_id='account-0002' AND activity_key=?").run(scope);f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0002' AND activity_key=?").run(scope);
 assert.equal((await read(f,student,id)).status,200);
 const list=ok(await f.monthlyOwn('surahs',{},student));assert.deepEqual(list.surahs.map(r=>r.id),[id]);
 const current=ok(await f.monthly('surahs',{},admin)),entry=current.surahs.find(r=>r.id===id);
 ok(await f.monthly('surah-save',{policyRevision:current.policyRevision,operationId:op(),entries:[{id,name:entry.name,completionDate:'2025-01-10',active:true,revision:entry.revision}]},admin));
 assert.equal((await read(f,student,id,{completionDate:'2024-01-16'})).status,403,'Client-supplied dates cannot override the Admin table');
 assert.equal((await read(f,other,id)).status,200);
}));
test('withdrawn surah websites and removed paid months immediately block direct reads',()=>use(async(f,admin)=>{
 const {id}=await seed(f,admin),student=await f.login('0002'),view=ok(await site(f,admin,'get',id));
 const saved=ok(await site(f,admin,'save',id,{document:view.document,revision:0,operationId:op()})),published=ok(await site(f,admin,'publish',id,{revision:saved.revision,operationId:op()}));
 assert.equal((await read(f,student,id)).status,200);
 const current=ok(await f.monthly('grid',{},admin)),row=current.students.find(r=>r.accountId==='account-0002');
 ok(await f.monthly('grid-save',{policyRevision:current.policy.revision,operationId:op(),removalReason:'Wrong month recorded',entries:[{accountId:row.accountId,month:'2024-01',subscribed:false,revision:row.months['2024-01'].revision,classIds:['mou-class']}]},admin));
 assert.equal((await read(f,student,id)).status,403);
 ok(await site(f,admin,'withdraw',id,{revision:published.revision,operationId:op()}));assert.equal((await read(f,admin,id)).status,404);
}));
