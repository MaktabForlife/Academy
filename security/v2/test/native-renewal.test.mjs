import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.mjs';
import {captureDDL} from '../capture.mjs';
import {vectorFromGuards} from '../capture-receipt.mjs';
import {vectorDigest,digest,fingerprint,opaque,canonical} from '../codec.mjs';
test('native role withdrawal dirties authority and silently renews only remaining rights without moving original expiry',async()=>{
 const f=await fixture(),scope='ACCOUNT:synthetic-account',id='studio:native:role_assignments';
 f.raw.function('unixepoch',()=>f.now);
 f.raw.exec('CREATE TABLE role_assignments(account_id TEXT PRIMARY KEY,role TEXT);');
 const registry={schema:2,app:'studio',rules:{role_assignments:{required:true,columns:['account_id','role'],accountColumn:'account_id'}}};
 f.raw.exec(captureDDL({registry,available:{role_assignments:['account_id','role']},ownerEpoch:'studio-owner'}).sql);
 f.raw.prepare('INSERT INTO role_assignments VALUES(?,?)').run(f.sub,'ADMIN');
 f.store.dependencyManifest=[{id:'test:scope',scope,ownerEpoch:'owner-epoch'},{id,scope,ownerEpoch:'studio-owner'}];
 async function renew(now){
  const family=await f.store.family(f.sid),prior=JSON.parse(family.binding_json);
  const vectorGuards=f.raw.prepare('SELECT id,scope,owner_epoch,revision FROM jwt_v2_dependencies ORDER BY id,scope').all().map(r=>[r.id,r.scope,r.owner_epoch,r.revision]);
  const ownerVector=await vectorFromGuards(vectorGuards),rights={roles:[f.raw.prepare('SELECT role FROM role_assignments WHERE account_id=?').get(f.sub).role]};
  const binding={...prior,sv:prior.sv+1,vat:now,pv:await vectorDigest(ownerVector)};
  const projection={...f.projection,binding,ownerVector,rightsHash:await digest(rights),timedUntil:prior.s_exp};
  const capture={app:'studio',sub:f.sub,vat:now,primaryCheckedAt:now,pv:binding.pv,rights,ownerVector,vectorGuards,timedUntil:prior.s_exp};
  const intent=await f.store.intent({sid:f.sid,csrfHash:'synthetic-csrf',now});
  await f.store.rotate({sid:f.sid,fingerprint:family.fingerprint,intentId:intent.intent_id,csrfHash:'synthetic-csrf',expectedBinding:prior,successorFingerprint:await fingerprint(opaque(),f.config),nextBinding:binding,nextProjection:projection,now,idleUntil:Math.min(prior.s_exp,now+5400),deadline:now+900,vectorGuards,qualifyingActivity:true,capture});
  return {family:await f.store.family(f.sid),rights,projection};
 }
 const first=await renew(f.now);assert.deepEqual(first.rights.roles,['ADMIN']);
 f.raw.prepare('UPDATE role_assignments SET role=? WHERE account_id=?').run('STUDENT',f.sub);
 assert.equal((await f.store.family(f.sid)).authority_ready,0);
 const second=await renew(f.now+1);assert.deepEqual(second.rights.roles,['STUDENT']);
 assert.notEqual(first.family.binding_json,second.family.binding_json);
 assert.equal(JSON.parse(second.family.projection_json).rightsHash,await digest({roles:['STUDENT']}));
 assert.equal(second.family.authority_ready,1);assert.equal(second.family.state,'UNLOCKED');
 assert.equal(second.family.psid,f.psid);assert.equal(second.family.ce,4);assert.equal(second.family.ae,9);assert.equal(second.family.ue,0);
 assert.equal(second.family.s_exp,f.binding.s_exp);assert.equal(second.family.deadline,f.now+901);
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_pin_gates').get().n,0);
});
