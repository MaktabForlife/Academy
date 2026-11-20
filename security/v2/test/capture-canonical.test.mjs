import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {splitFixture} from '../../../backend/tests/fixtures/academy-split-fixture.mjs';
import {additiveSchemaSQL} from '../schema-bundle.mjs';
import {captureDDL,inspectCaptureSchema} from '../capture.mjs';
import {fixture,database,Bucket} from './helpers.mjs';
import {SecurityCache} from '../cache.mjs';
import {canonical} from '../codec.mjs';
import {PrimaryStore} from '../store.mjs';
import {materialiseNativeEvent} from '../outbox.mjs';
import {receiveBatch} from '../events.mjs';
import {restrictionPlan,worksetApplied,markSessionCovered} from '../publication.mjs';
import {sqliteD1} from '../../../backend/tools/academy-split/sqlite-d1.mjs';
const registry=JSON.parse(readFileSync(new URL('../native-authority.json',import.meta.url),'utf8'));
const sub='Canonical-Account',alias='canonical-account',epoch='owner-epoch';
async function realFixture(){
 const f=await splitFixture();f.databases.core.exec(additiveSchemaSQL);const raw=f.databases.core,now=1900000000;
 raw.function('unixepoch',()=>now);const db=sqliteD1(raw),available=await inspectCaptureSchema(db);
 raw.exec(captureDDL({registry,available,ownerEpoch:epoch}).sql);
 raw.prepare('INSERT INTO accounts(account_id,display_name,login_link_id,active) VALUES(?,?,?,1)').run(sub,'Synthetic canonical account','synthetic-canonical-login');
 // Copy a real valid family shape solely into this disposable database.
 const template=await fixture('academy'),source=template.raw.prepare('SELECT * FROM jwt_v2_families').get();delete source.ordinal;
 source.sid=crypto.randomUUID();source.psid=source.sid;source.sub=sub;source.s_iat=now;source.s_exp=now+604800;source.vat=now;source.deadline=now+900;source.idle_until=now+5400;
 const binding={...JSON.parse(source.binding_json),sid:source.sid,psid:source.psid,sub,s_iat:source.s_iat,s_exp:source.s_exp,vat:now};source.binding_json=canonical(binding);source.projection_json=canonical({...JSON.parse(source.projection_json),binding});
 const cols=Object.keys(source);raw.prepare('INSERT INTO jwt_v2_families('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').run(...Object.values(source));template.raw.close();
 for(const app of ['studio','hifz'])raw.prepare("INSERT INTO jwt_v2_sender_streams VALUES(?,'account-security',?,1)").run(app,epoch);
 return {...f,raw,db,now,sid:source.sid,store:new PrimaryStore(db,{app:'academy',env:'production',securityPrefix:'auth-private/v2/production/academy/generation1/'})};
}
function changes(f,table){return f.raw.prepare('SELECT * FROM jwt_v2_authority_changes WHERE source_table=? ORDER BY change_id').all(table);}
test('actual Academy NOCASE FK grants preserve canonical counters and scoped aggregate child events',async()=>{
 const f=await realFixture();try{
  f.raw.prepare("UPDATE academy_settings SET setting_value=? WHERE setting_key='HifzProfileActivityKey'").run(f.scopes.courseA);
  assert.throws(()=>f.raw.prepare('INSERT INTO accounts(account_id,display_name,login_link_id,active) VALUES(?,?,?,1)').run(alias,'Duplicate','duplicate-login'),/UNIQUE/);
  f.raw.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('canonical-role',?,?,'STUDENT',1,'CONFIRMED')").run(alias,f.scopes.courseA);
  f.raw.prepare("UPDATE role_assignments SET active=0 WHERE assignment_id='canonical-role'").run();
  f.raw.prepare("DELETE FROM role_assignments WHERE assignment_id='canonical-role'").run();
  const rows=changes(f,'role_assignments');assert.equal(rows.length,3);assert.deepEqual(rows.map(r=>r.revision),[1,2,3]);
  assert.deepEqual(f.raw.prepare("SELECT scope FROM jwt_v2_dependencies WHERE id='academy:native:role_assignments'").all().map(r=>r.scope),['ACCOUNT:'+sub]);
  for(const row of rows){
   assert.equal(row.sub,sub);assert.equal(row.scope,'ACCOUNT:'+sub);
   assert.equal(f.raw.prepare('SELECT scope_sub FROM jwt_v2_worksets WHERE work_id=?').get(row.operation_id).scope_sub,sub);
   assert.deepEqual(f.raw.prepare('SELECT sid FROM jwt_v2_publications WHERE work_id=?').all(row.operation_id).map(r=>r.sid),[f.sid]);
   assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_native_outbox WHERE change_id=?').get(row.change_id).n,0);
   for(const targetApp of ['studio','hifz'])await assert.rejects(materialiseNativeEvent(f.store,{changeId:row.change_id,targetApp}));
  }
  const queueRows=changes(f,'hifz_profile_sync');assert.equal(queueRows.length,3);for(const row of queueRows){assert.equal(row.sub,sub);assert.equal(row.scope,'ACCOUNT:'+sub);const event=await materialiseNativeEvent(f.store,{changeId:row.change_id,targetApp:'hifz'});assert.equal(event.sub,sub);assert.equal(event.target.id,'academy:native:hifz_profile_sync');}
  const child=database('hifz'),family={...f.raw.prepare('SELECT * FROM jwt_v2_families WHERE sid=?').get(f.sid)};delete family.ordinal;family.authority_ready=1;
  const cols=Object.keys(family),insert=child.raw.prepare('INSERT INTO jwt_v2_families('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')');insert.run(...Object.values(family));
  const other={...family,sid:crypto.randomUUID(),sub:alias,fingerprint:'f'.repeat(64)};other.binding_json=canonical({...JSON.parse(family.binding_json),sub:alias,sid:other.sid});insert.run(...Object.values(other));
  const e=await materialiseNativeEvent(f.store,{changeId:queueRows.at(-1).change_id,targetApp:'hifz'}),deps=new Map([[e.target.id,{ownerApp:'academy',epoch,scope:'ACCOUNT',recipients:['studio','hifz'],actions:['read','write']}]]);
  const options={body:canonical({schema:2,env:'production',sourceApp:'academy',targetApp:'hifz',batchId:crypto.randomUUID(),events:[e]}),config:{app:'hifz',env:'production'},store:child.store,streams:new Map([['account-security',new Set([epoch])]]),dependencies:deps,planEffect:e=>restrictionPlan(child.store,{workId:e.eventId,target:e.target,sub:e.sub,now:f.now}),publishAndCovered:async()=>false};
  let result=await receiveBatch(options);assert.equal(result.results[0].status,'CAPTURED');assert.equal(child.raw.prepare('SELECT scope_sub FROM jwt_v2_worksets WHERE work_id=?').get(e.eventId).scope_sub,sub);
  assert.deepEqual(child.raw.prepare('SELECT sid FROM jwt_v2_publications WHERE work_id=?').all(e.eventId).map(r=>r.sid),[f.sid]);assert.equal(child.raw.prepare('SELECT authority_ready FROM jwt_v2_families WHERE sid=?').get(other.sid).authority_ready,1);
  const cache=new SecurityCache({bucket:new Bucket(),store:child.store,prefix:'auth-private/v2/production/hifz/generation1/',generation:'generation1'}),suffix='security/session/'+f.sid;await cache.seed(suffix);
  const current=await child.store.family(f.sid),projection=await cache.publish(suffix,async()=>({cr:current.cr,app:'hifz',env:'production',binding:JSON.parse(current.binding_json),localState:current.state,authorityReady:false,validationDeadline:current.deadline,idleUntil:current.idle_until,s_exp:current.s_exp,enforcedTargets:[e.target]}));
  await markSessionCovered(child.store,{workId:e.eventId,sid:f.sid,projection,controlKey:cache.key(suffix),now:f.now});assert.equal(await worksetApplied(child.store,e.eventId),true);
  result=await receiveBatch(options);assert.equal(result.results[0].status,'APPLIED');child.raw.close();
 }finally{f.close();}
});
test('actual native credential FK alias resets only canonical security identity and emits canonical target',async()=>{
 const f=await realFixture();try{
  f.raw.prepare('INSERT INTO jwt_v2_accounts VALUES(?,4,9,0,1,1)').run(sub);
  f.raw.prepare('INSERT INTO jwt_v2_accounts VALUES(?,4,9,0,1,1)').run(alias);
  f.raw.prepare("INSERT INTO account_credentials(account_id,pin_hash,pin_setup,credential_epoch) VALUES(?,'synthetic-hash',1,4)").run(alias);
  f.raw.prepare('UPDATE account_credentials SET pin_hash=NULL,pin_setup=0,credential_epoch=5 WHERE account_id=?').run(alias);
  const row=changes(f,'account_credentials').at(-1),target=JSON.parse(row.target_json);
  assert.equal(row.sub,sub);assert.equal(target.sub,sub);assert.equal(target.newCe,5);
  assert.equal(f.raw.prepare('SELECT ce FROM jwt_v2_accounts WHERE sub=? COLLATE BINARY').get(sub).ce,5);
  assert.equal(f.raw.prepare('SELECT ce FROM jwt_v2_accounts WHERE sub=? COLLATE BINARY').get(alias).ce,4);
  assert.equal(f.raw.prepare('SELECT generation FROM jwt_v2_pin_gates WHERE sub=?').get(sub).generation,5);
  assert.equal(f.raw.prepare('SELECT * FROM jwt_v2_pin_gates WHERE sub=?').get(alias),undefined);
  assert.equal(f.raw.prepare('SELECT state FROM jwt_v2_families WHERE sid=?').get(f.sid).state,'REVOKED');
 }finally{f.close();}
});
function cascadeFixture(){
 const f=database('academy');f.raw.exec(readFileSync(new URL('../../../backend/migrations/academy/0001_academy_foundation.sql',import.meta.url),'utf8'));
 f.raw.exec('CREATE TABLE scoped_cascade(id TEXT PRIMARY KEY,account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,active INTEGER);');
 const r={schema:2,app:'academy',rules:{accounts:{columns:['account_id','active'],accountColumn:'account_id',scope:'ACCOUNT',required:true},scoped_cascade:{columns:['account_id','active'],accountColumn:'account_id',scope:'ACCOUNT',required:true,canonicalOwner:{table:'accounts',key:'account_id'}}}};
 f.raw.exec(captureDDL({registry:r,available:{accounts:['account_id','active'],scoped_cascade:['id','account_id','active']},ownerEpoch:epoch}).sql);
 f.raw.prepare('INSERT INTO accounts(account_id,display_name,login_link_id,active) VALUES(?,?,?,1)').run(sub,'Synthetic','synthetic-cascade-login');
 f.raw.prepare('INSERT INTO scoped_cascade VALUES(?,?,1)').run('child',alias);return f;
}
test('actual parent schema cascade resolves canonical bytes inside transaction and clears delete context',()=>{
 const f=cascadeFixture();f.raw.prepare('DELETE FROM accounts WHERE account_id=?').run(alias);
 const rows=changes(f,'scoped_cascade');assert.equal(rows.at(-1).verb,'DELETE');assert.equal(rows.at(-1).sub,sub);assert.equal(rows.at(-1).scope,'ACCOUNT:'+sub);
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_native_delete_owner').get().n,0);
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_authority_changes WHERE sub IS NULL').get().n,0);
 assert.equal(f.raw.prepare('SELECT count(*) n FROM scoped_cascade').get().n,0);f.raw.close();
});
test('unknown orphan insert/update fail closed and orphan delete cannot borrow an old parent scope',()=>{
 const f=cascadeFixture();assert.throws(()=>f.raw.prepare('INSERT INTO scoped_cascade VALUES(?,?,1)').run('bad','missing'),/canonical_owner_missing/);
 assert.throws(()=>f.raw.prepare("UPDATE scoped_cascade SET account_id='missing' WHERE id='child'").run(),/canonical_owner_missing/);
 f.raw.prepare('DELETE FROM accounts WHERE account_id=?').run(alias);f.raw.exec('DROP TRIGGER jwt_v2_owner_scoped_cascade_insert;PRAGMA foreign_keys=OFF;');
 f.raw.prepare('INSERT INTO scoped_cascade VALUES(?,?,1)').run('orphan',alias);
 const before=changes(f,'scoped_cascade').length;f.raw.prepare("DELETE FROM scoped_cascade WHERE id='orphan'").run();assert.equal(changes(f,'scoped_cascade').length,before);
 assert.equal(f.raw.prepare("SELECT count(*) n FROM jwt_v2_authority_changes WHERE scope IS NULL OR scope='GLOBAL' OR sub IS NULL").get().n,0);f.raw.close();
});
test('parent delete scope context rolls back with a failed native transaction',()=>{
 const f=cascadeFixture(),before=changes(f,'scoped_cascade').length;f.raw.exec('BEGIN');f.raw.prepare('DELETE FROM accounts WHERE account_id=?').run(alias);f.raw.exec('ROLLBACK');
 assert.equal(changes(f,'scoped_cascade').length,before);assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_native_delete_owner').get().n,0);assert.equal(f.raw.prepare('SELECT count(*) n FROM scoped_cascade').get().n,1);f.raw.close();
});
