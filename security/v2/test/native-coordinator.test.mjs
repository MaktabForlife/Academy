import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {splitFixture} from '../../../backend/tests/fixtures/academy-split-fixture.mjs';
import {splitEngine} from '../../../backend/src/academy/separation/engine.js';
import {academyD1Repository} from '../../../backend/src/academy/d1/repository.js';
import {actorProof} from '../../../backend/src/academy/separation/proof.js';
import {schemaSQL} from '../schema.mjs';
import {captureDDL,nativeFence} from '../capture.mjs';
import {coherentCapture} from '../cache.mjs';

const stmt=(sql,...params)=>({sql,params});
const captures=f=>f.databases.core.prepare('SELECT * FROM jwt_v2_authority_changes ORDER BY change_id').all();
const revisions=f=>f.databases.core.prepare('SELECT id,scope,owner_epoch,revision FROM jwt_v2_dependencies ORDER BY id,scope').all();
async function actor(f){
 const repository=academyD1Repository({...f.source.env,ACADEMY_DB:f.core,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_SPLIT_COORDINATOR:f.namespace});
 const state=await repository.byId(f.actors.global),session=await repository.createSession(state,state.contexts[0]);
 return actorProof({state,user:{accountid:state.account.account_id},sid:session.sid});
}
function installSelectedCapture(f){
 // This fixture selects real native activities ownership and exercises actual
 // coordinator phases. Full generated-table DML coverage is in capture.test.mjs.
 f.databases.core.exec(schemaSQL);
 const columns=f.databases.core.prepare('PRAGMA table_info(activities)').all().map(c=>c.name);
 const registry={schema:2,app:'academy',rules:{activities:{columns:['activity_key','active','lifecycle','website_visible'],accountColumn:null,scope:'GLOBAL',required:true,dependencies:['A.setup-publication']}}};
 f.databases.core.exec(captureDDL({registry,available:{activities:columns},ownerEpoch:'native-fixture-owner'}).sql);
}
const edits=f=>[
 stmt('UPDATE activities SET name=?,active=? WHERE activity_key=?','V111 synthetic private name',0,f.scopes.courseA),
 stmt("INSERT INTO operation_receipts VALUES('V111_CAPTURE','GLOBAL',?,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','{}',?,?)",crypto.randomUUID(),f.actors.global,new Date().toISOString())
];

test('real native Admin APPLIED is fenced, then Core COMMITTED captures authority once',async()=>{
 const f=await splitFixture();
 try{
  const proof=await actor(f);installSelectedCapture(f);let observed=false,loadedRights=0;
  const engine=splitEngine({...f,hook:async phase=>{
   if(phase!=='admin-applied')return;observed=true;
   assert.equal((await nativeFence(f.core,{academy:true})).pending,true);
   assert.equal(captures(f).length,0);assert.equal(revisions(f).length,0);
   assert.equal((await f.admin.prepare('SELECT name FROM activities WHERE activity_key=?').bind(f.scopes.courseA).first()).name,'V111 synthetic private name');
   await assert.rejects(coherentCapture({readFence:()=>nativeFence(f.core,{academy:true}),readVector:async()=>[],loadRights:async()=>{loadedRights++;return {};},committedLease:{vat:100,deadline:1000},now:200}),{code:'SPLIT_RECOVERY_PENDING'});
  }});
  await engine.write(edits(f),proof);
  assert.equal(observed,true);assert.equal(loadedRights,0);
  assert.equal(captures(f).length,1);assert.equal(captures(f)[0].source_table,'activities');
  assert.equal(revisions(f)[0].revision,1);assert.equal((await nativeFence(f.core,{academy:true})).pending,false);
  const rebuilt=await coherentCapture({readFence:()=>nativeFence(f.core,{academy:true}),readVector:async()=>revisions(f).map(r=>[r.id,r.owner_epoch,r.revision]),loadRights:async()=>({visible:false}),committedLease:{vat:100,deadline:1000},now:200});
  assert.equal(rebuilt.vat,100);assert.equal(rebuilt.deadline,1000);
 }finally{f.close();}
});

test('semantic failure before Core COMMITTED undoes Admin and rolls back V2 capture',async()=>{
 const f=await splitFixture();
 try{
  const proof=await actor(f),oldName=(await f.admin.prepare('SELECT name FROM activities WHERE activity_key=?').bind(f.scopes.courseA).first()).name;installSelectedCapture(f);
  await assert.rejects(splitEngine(f).write([...edits(f),stmt('INSERT INTO academy_write_guards VALUES(?,0)',crypto.randomUUID())],proof));
  assert.equal((await f.admin.prepare('SELECT name FROM activities WHERE activity_key=?').bind(f.scopes.courseA).first()).name,oldName);
  assert.equal((await f.core.prepare('SELECT active FROM activities WHERE activity_key=?').bind(f.scopes.courseA).first()).active,1);
  assert.equal(captures(f).length,0);assert.equal(revisions(f).length,0);
  assert.equal((await f.core.prepare('SELECT phase FROM split_commands').first()).phase,'ABORTED');
  assert.equal((await nativeFence(f.core,{academy:true})).pending,false);
 }finally{f.close();}
});

test('after Core COMMITTED, unavailable Admin finalisation retains capture and fresh recovery finishes without recapture',async()=>{
 const f=await splitFixture();
 try{
  const proof=await actor(f);installSelectedCapture(f);
  const blockedAdmin={...f.admin,async batch(statements){
   if(statements.some(s=>s.sql.includes("SET phase='DONE'")))throw Error('Injected Admin finalise transport failure');
   return f.admin.batch(statements);
  }};
  await assert.rejects(splitEngine({...f,admin:blockedAdmin}).write(edits(f),proof),/Admin finalise transport failure/);
  const command=(await f.core.prepare('SELECT command_id,phase FROM split_commands').first());
  assert.equal(command.phase,'COMMITTED');assert.equal((await nativeFence(f.core,{academy:true})).pending,true);
  assert.equal(captures(f).length,1);assert.equal(revisions(f)[0].revision,1);
  await splitEngine(f).recover();
  assert.equal((await f.core.prepare('SELECT phase FROM split_commands WHERE command_id=?').bind(command.command_id).first()).phase,'DONE');
  assert.equal((await nativeFence(f.core,{academy:true})).pending,false);
  assert.equal(captures(f).length,1);assert.equal(revisions(f)[0].revision,1);
 }finally{f.close();}
});

test('transport loss after Admin APPLIED recovers the same durable operation and captures at Core commit',async()=>{
 const f=await splitFixture();
 try{
  const proof=await actor(f);installSelectedCapture(f);
  await assert.rejects(splitEngine({...f,hook:async phase=>{if(phase==='admin-applied')throw Error('Injected transport loss');}}).write(edits(f),proof),/transport loss/);
  const command=await f.core.prepare('SELECT command_id,phase FROM split_commands').first();
  assert.equal(command.phase,'PENDING');assert.equal(captures(f).length,0);
  await splitEngine(f).recover();
  assert.equal((await f.core.prepare('SELECT phase FROM split_commands WHERE command_id=?').bind(command.command_id).first()).phase,'DONE');
  assert.equal(captures(f).length,1);assert.equal(revisions(f)[0].revision,1);
 }finally{f.close();}
});

test('missing durable recovery plan keeps native fence and prevents mixed-state permission capture',async()=>{
 const f=await splitFixture();
 try{
  const proof=await actor(f);installSelectedCapture(f);
  await assert.rejects(splitEngine({...f,hook:async phase=>{if(phase==='admin-applied')throw Error('Injected transport loss');}}).write(edits(f),proof),/transport loss/);
  f.databases.core.exec('DELETE FROM split_command_parts');
  await assert.rejects(splitEngine(f).recover(),{code:'SPLIT_RECOVERY_PENDING'});
  assert.equal((await nativeFence(f.core,{academy:true})).pending,true);assert.equal(captures(f).length,0);
  await assert.rejects(coherentCapture({readFence:()=>nativeFence(f.core,{academy:true}),readVector:async()=>[],loadRights:async()=>({}),committedLease:{vat:100,deadline:1000},now:200}),{code:'SPLIT_RECOVERY_PENDING'});
 }finally{f.close();}
});

test('Academy capture registry names the actual native context, legacy-role and live-deny fields',()=>{
 const registry=JSON.parse(readFileSync(new URL('../native-authority.json',import.meta.url),'utf8'));
 const expected={activities:['activity_id'],role_import_reviews:['source_value','status'],lesson_media_lessons:['state']};
 const missing=Object.entries(expected).flatMap(([table,columns])=>columns.filter(c=>!registry.rules[table]?.columns.includes(c)).map(c=>table+'.'+c));
 assert.deepEqual(missing,[],'reviewed native authority fields must be captured explicitly');
});
test('Studio capture registry names actual session, monthly, publication and audience predicates',()=>{
 const registry=JSON.parse(readFileSync(new URL('../../../../AcademyStudio/security/v2/native-authority.json',import.meta.url),'utf8'));
 const expected={sessions:['revoked'],attachments:['asset_id','audience','published'],websites:['completion_month','published_key'],timetable:['cancelled'],source_session_audiences:['class_ids_json'],mou_playlist_retained:['source_month'],media_supporting_files:['support_attachment_id','recording_attachment_id']};
 const missing=Object.entries(expected).flatMap(([table,columns])=>columns.filter(c=>!registry.rules[table]?.columns.includes(c)).map(c=>table+'.'+c));
 assert.deepEqual(missing,[],'reviewed native authority fields must be captured explicitly');
});
