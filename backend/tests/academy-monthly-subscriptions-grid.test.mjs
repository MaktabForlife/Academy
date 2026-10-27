import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyFixture,scope} from './fixtures/academy-monthly-subscriptions-fixture.mjs';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const op=()=>crypto.randomUUID();
async function use(fn){const f=await monthlyFixture();try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{f.db.close();}}
async function prepare(f){const admin=await f.login('0001');ok(await f.monthly('configure',{mode:'prepare',policyRevision:0,operationId:op()},admin));return admin;}
const entry=(accountId,month,extra={})=>({accountId,month,subscribed:true,revision:0,...extra});

test('grid lists Tafseer current and historical students, searches only its roster and separates all three years',()=>use(async f=>{
 const admin=await prepare(f);
 let grid=ok(await f.monthly('grid',{},admin));assert.deepEqual(grid.years,[2024,2025,2026]);
 assert(grid.students.some(s=>s.accountId==='account-0002'));assert(grid.students.some(s=>s.accountId==='account-0008'));
 assert.equal(Object.keys(grid.students[0].suggestedClassIds).length,36);
 assert.equal(ok(await f.monthly('grid',{search:'Global Admin'},admin)).students.length,0);
 ok(await f.monthly('grid-save',{policyRevision:1,operationId:op(),entries:[entry('account-0002','2024-01'),entry('account-0002','2025-01')]},admin));
 f.db.prepare("DELETE FROM class_memberships WHERE account_id='account-0002' AND activity_key=?").run(scope);
 f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0002' AND activity_key=?").run(scope);
 grid=ok(await f.monthly('grid',{search:'0002'},admin));assert.equal(grid.students.length,1);
 assert.equal(grid.students[0].months['2024-01'].subscribed,true);assert.equal(grid.students[0].months['2025-01'].subscribed,true);
 assert.equal(grid.students[0].months['2026-01'],undefined);
 for(const years of [[2024,2024],[],[24],[2024,'2025']])assert.equal((await f.monthly('grid',{years},admin)).status,400);
 assert.equal((await f.monthly('grid',{after:'"xy"'},admin)).status,400);
}));

test('roster pagination is stable for duplicate names and search finds students beyond the first page',()=>use(async f=>{
 const admin=await prepare(f);
 for(let i=0;i<58;i++){
  const id='grid-'+String(i).padStart(3,'0');
  f.db.prepare('INSERT INTO accounts(account_id,display_name,login_link_id,active) VALUES(?,?,?,1)').run(id,'Same name','LOGIN-'+id);
  f.db.prepare("INSERT INTO program_monthly_subscriptions(activity_key,account_id,lesson_month,active,class_ids_json,updated_at,updated_by_account_id) VALUES(?,?,?,1,?,?,?)").run(scope,id,'2024-01','["mou-class"]',new Date().toISOString(),'account-0001');
 }
 const first=ok(await f.monthly('grid',{},admin)),second=ok(await f.monthly('grid',{after:first.after},admin));
 assert.equal(first.students.length,50);assert.equal(second.after,null);
 const ids=[...first.students,...second.students].map(r=>r.accountId);assert.equal(new Set(ids).size,ids.length);
 assert.equal(ids.filter(id=>id.startsWith('grid-')).length,58);
 const search=ok(await f.monthly('grid',{search:'grid-057'},admin));assert.equal(search.students[0].accountId,'grid-057');
}));

test('scoped Admin saves edited cells atomically across years, preserves payment records and safely replays retries',()=>use(async f=>{
 const admin=await prepare(f),scoped=await f.login('0004'),teacher=await f.login('0003');
 ok(await f.monthly('save',{month:'2024-01',policyRevision:1,operationId:op(),entries:[{accountId:'account-0002',subscribed:true,revision:0,classIds:['mou-class'],paymentDate:'2024-01-07',paymentReference:'JAN24',note:'Bank payment'}]},admin));
 const input={policyRevision:2,operationId:op(),entries:[entry('account-0002','2024-01',{revision:1}),entry('account-0002','2025-02'),entry('account-0008','2026-10')]};
 assert.equal((await f.monthly('grid',{},teacher)).status,403);
 assert.equal((await f.monthly('grid-save',input,teacher)).status,403);
 assert.equal(ok(await f.monthly('grid',{},scoped)).prepared,true);
 assert.equal(ok(await f.monthly('grid-save',input,scoped)).saved,3);
 assert.equal(ok(await f.monthly('grid-save',input,scoped)).replayed,true);
 const rows=f.db.prepare('SELECT * FROM program_monthly_subscriptions ORDER BY account_id,lesson_month').all();assert.equal(rows.length,3);
 assert.equal(rows[0].payment_reference,'JAN24');assert.equal(rows[0].payment_date,'2024-01-07');assert.equal(rows[0].note,'Bank payment');
 assert.equal(rows[1].lesson_month,'2025-02');assert.equal(rows[2].lesson_month,'2026-10');
 assert.equal((await f.monthly('grid-save',{...input,entries:[entry('account-0002','2024-03')]},scoped)).status,409);
}));

test('mixed-year conflicts and invalid cells roll back the whole grid change; revocation needs a reason',()=>use(async f=>{
 const admin=await prepare(f);
 ok(await f.monthly('grid-save',{policyRevision:1,operationId:op(),entries:[entry('account-0002','2024-01'),entry('account-0002','2025-01')]},admin));
 for(const invalid of [
  entry('account-0002','2024-01',{revision:0}),
  entry('account-0008','2025-02',{classIds:['foreign-class']}),
  entry('account-0002','2024-13')
 ]){
  const result=await f.monthly('grid-save',{policyRevision:2,operationId:op(),entries:[entry('account-0008','2026-10'),invalid]},admin);
  assert([400,409].includes(result.status));assert.equal(f.db.prepare("SELECT count(*) n FROM program_monthly_subscriptions WHERE lesson_month='2026-10'").get().n,0);
 }
 const revoke={policyRevision:2,operationId:op(),entries:[entry('account-0002','2024-01',{revision:1,subscribed:false}),entry('account-0008','2026-10')]};
 assert.equal((await f.monthly('grid-save',revoke,admin)).status,400);
 assert.equal(f.db.prepare("SELECT active FROM program_monthly_subscriptions WHERE lesson_month='2024-01'").get().active,1);
 ok(await f.monthly('grid-save',{...revoke,removalReason:'Wrong student was recorded'},admin));
 const records=f.db.prepare('SELECT * FROM program_monthly_subscriptions ORDER BY lesson_month').all();
 assert.equal(records[0].active,0);assert.equal(records[0].note,'Wrong student was recorded');assert.equal(records[1].active,1);assert.equal(records[2].active,1);
 assert.equal((await f.monthly('grid-save',{policyRevision:2,operationId:op(),entries:[entry('account-0008','2025-03')]},admin)).status,409);
}));
