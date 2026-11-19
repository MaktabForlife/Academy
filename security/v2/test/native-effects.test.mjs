import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.mjs';
import {captureDDL} from '../capture.mjs';
import {materialiseNativeEvent,deliverOutbox} from '../outbox.mjs';
import {validateEvent} from '../events.mjs';
import {strictJSON} from '../codec.mjs';
function install(f,table,columns){
 f.raw.function('unixepoch',()=>f.now);
 f.raw.exec('CREATE TABLE '+table+'('+columns.map(([n,t])=>'"'+n+'" '+t).join(',')+');');
 const registry={schema:2,app:'academy',rules:{[table]:{columns:columns.map(c=>c[0]),required:true,accountColumn:'account_id'}}};
 f.raw.exec(captureDDL({registry,available:{[table]:columns.map(c=>c[0])},ownerEpoch:'owner-epoch'}).sql);
}
test('native administrative PIN reset revokes at reset-time and captures both child targets atomically',async()=>{
 const f=await fixture('academy');
 install(f,'account_credentials',[['account_id','TEXT'],['pin_hash','TEXT'],['pin_setup','INTEGER'],['credential_epoch','INTEGER']]);
 f.raw.prepare("INSERT INTO account_credentials VALUES(?,'synthetic-hash',1,4)").run(f.sub);
 f.raw.exec('DELETE FROM jwt_v2_native_outbox;DELETE FROM jwt_v2_authority_changes;DELETE FROM jwt_v2_publications;DELETE FROM jwt_v2_worksets;DELETE FROM jwt_v2_restrictions;');
 const intent=await f.store.intent({sid:f.sid,csrfHash:'test-csrf',now:f.now});
 f.raw.prepare("UPDATE account_credentials SET pin_hash='',pin_setup=0,credential_epoch=5 WHERE account_id=?").run(f.sub);
 assert.equal(f.raw.prepare('SELECT ce FROM jwt_v2_accounts').get().ce,5);
 assert.equal((await f.store.family(f.sid)).state,'REVOKED');
 assert.equal(f.raw.prepare('SELECT state FROM jwt_v2_intents WHERE intent_id=?').get(intent.intent_id).state,'CANCELLED');
 const change=f.raw.prepare('SELECT * FROM jwt_v2_authority_changes').get(),target=strictJSON(change.target_json);
 assert.equal(target.type,'credentialEpoch');assert.equal(target.newCe,5);assert.equal(target.reason,'ADMIN_PIN_RESET');
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_native_outbox').get().n,2);
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_publications').get().n,1);
 for(const app of ['studio','hifz']){
  const event=await materialiseNativeEvent(f.store,{changeId:change.change_id,targetApp:app});
  await validateEvent(event,{env:'production',targetApp:app,streams:new Map([['account-security',new Set(['owner-epoch'])]])});
  const retry=await materialiseNativeEvent(f.store,{changeId:change.change_id,targetApp:app});assert.equal(retry.eventId,event.eventId);assert.equal(retry.sequence,1);
 }
});
test('native account disable accepts the exact joint cutoff once and prevents a new old-pair SID',async()=>{
 const f=await fixture('academy');
 install(f,'accounts',[['account_id','TEXT'],['active','INTEGER']]);
 f.raw.prepare('INSERT INTO accounts VALUES(?,1)').run(f.sub);
 f.raw.prepare('UPDATE accounts SET active=0 WHERE account_id=?').run(f.sub);
 const account=f.raw.prepare('SELECT * FROM jwt_v2_accounts').get();assert.equal(account.ae,10);assert.equal(account.active,0);
 const cutoff=f.raw.prepare('SELECT * FROM jwt_v2_cutoffs').get();assert.equal(cutoff.ce,4);assert.equal(cutoff.ae,9);
 f.raw.prepare('UPDATE accounts SET active=0 WHERE account_id=?').run(f.sub);assert.equal(f.raw.prepare('SELECT ae FROM jwt_v2_accounts').get().ae,10);
 assert.equal((await f.store.family(f.sid)).state,'REVOKED');
});
test('native guarded failure rolls back facts, cutoff, all-SID work and both recipient tasks',async()=>{
 const f=await fixture('academy');install(f,'account_credentials',[['account_id','TEXT'],['pin_hash','TEXT'],['pin_setup','INTEGER'],['credential_epoch','INTEGER']]);
 f.raw.prepare("INSERT INTO account_credentials VALUES(?,'test-hash',1,4)").run(f.sub);
 const before=f.raw.prepare('SELECT count(*) n FROM jwt_v2_native_outbox').get().n;
 f.raw.exec('BEGIN');f.raw.prepare('UPDATE account_credentials SET credential_epoch=5,pin_hash=NULL WHERE account_id=?').run(f.sub);f.raw.exec('ROLLBACK');
 assert.equal(f.raw.prepare('SELECT ce FROM jwt_v2_accounts').get().ce,4);assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_native_outbox').get().n,before);
});
test('outbox stops only per-event matching APPLIED, not HTTP 200 or CAPTURED',async()=>{
 const f=await fixture('academy');
 await f.store.acceptCutoff({sub:f.sub,ce:4,ae:9,operationId:crypto.randomUUID(),kind:'VOLUNTARY_LOGOUT',now:f.now});
 let r=await deliverOutbox(f.store,{now:f.now,sendAuthenticated:async e=>({schema:2,results:[{eventId:e.eventId,digest:e.digest,status:'CAPTURED'}]})});assert.equal(r.applied,0);
 r=await deliverOutbox(f.store,{now:f.now+1000,sendAuthenticated:async e=>({schema:2,results:[{eventId:e.eventId,digest:e.digest,status:'APPLIED',appliedRef:crypto.randomUUID()}]})});assert.equal(r.applied,2);
 assert.equal(f.raw.prepare("SELECT count(*) n FROM jwt_v2_outbox WHERE state='PENDING'").get().n,0);
});

test('native hash repair without credential epoch advance fails the whole owning write',async()=>{
 const f=await fixture('academy');
 install(f,'account_credentials',[['account_id','TEXT'],['pin_hash','TEXT'],['pin_setup','INTEGER'],['credential_epoch','INTEGER']]);
 f.raw.prepare("INSERT INTO account_credentials VALUES(?,'old-test-hash',1,4)").run(f.sub);
 await assert.rejects(f.db.prepare('UPDATE account_credentials SET pin_hash=? WHERE account_id=?').bind('changed-test-hash',f.sub).run(),/credential_epoch_required/);
 assert.equal(f.raw.prepare('SELECT credential_epoch FROM account_credentials').get().credential_epoch,4);
});

test('Hifz native student disable revokes the mapped Academy identity, not the student ID',async()=>{
 const f=await fixture('hifz'),nativeId='native-student-with-distinct-id';
 f.raw.function('unixepoch',()=>f.now);
 f.raw.exec('CREATE TABLE students(id TEXT PRIMARY KEY,active INTEGER,role TEXT);CREATE TABLE academy_profile_links(student_id TEXT PRIMARY KEY,academy_user_id TEXT);');
 f.raw.prepare('INSERT INTO academy_profile_links VALUES(?,?)').run(nativeId,f.sub);
 const registry={schema:2,app:'hifz',rules:{students:{required:true,columns:['id','active','role'],accountColumn:'id',identityMapping:'academy-profile-link'}}};
 f.raw.exec(captureDDL({registry,available:{students:['id','active','role']},ownerEpoch:'hifz-owner'}).sql);
 f.raw.prepare("INSERT INTO students VALUES(?,1,'student')").run(nativeId);
 f.raw.prepare('UPDATE students SET active=0 WHERE id=?').run(nativeId);
 const a=f.raw.prepare('SELECT * FROM jwt_v2_accounts WHERE sub=?').get(f.sub),change=f.raw.prepare('SELECT * FROM jwt_v2_authority_changes ORDER BY change_id DESC LIMIT 1').get();
 assert.equal(a.active,0);assert.equal(a.le,1);assert.equal(a.ce,4);assert.equal(a.ae,9);
 assert.equal((await f.store.family(f.sid)).state,'REVOKED');
 const target=JSON.parse(change.target_json);assert.equal(target.type,'localEpoch');assert.equal(target.sub,f.sub);assert.equal(target.maxLe,0);assert.equal(change.sub,f.sub);
 assert.equal(f.raw.prepare('SELECT scope_sub FROM jwt_v2_restrictions ORDER BY created_at DESC,rowid DESC LIMIT 1').get().scope_sub,f.sub);
});
