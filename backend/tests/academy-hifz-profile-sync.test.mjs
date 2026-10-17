import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/academy-runtime.js';
import {fixtureDatabase} from './fixtures/academy-d1-fixture.mjs';
import {deliverHifzProfiles,hifzSyncChangePath} from '../src/academy/d1/hifz-profile-sync.js';

async function fixture(){
 const f=await fixtureDatabase();
 for(const name of ['0004_management_transactions.sql','0011_account_contact_details.sql','0028_hifz_profile_sync.sql','0029_hifz_shared_pin.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));
 const scope=f.db.prepare("SELECT activity_key FROM activities WHERE kind='PROGRAM' ORDER BY activity_key LIMIT 1").get().activity_key;
 f.db.prepare("UPDATE academy_settings SET setting_value=? WHERE setting_key='HifzProfileActivityKey'").run(scope);
 f.db.prepare('INSERT INTO hifz_profile_sync(account_id) VALUES(?)').run('account-0002');
 const env={...f.env,HIFZ_PROFILE_SYNC_URL:'https://hifz.test/internal/academy/profile-sync',HIFZ_PROFILE_SYNC_TARGET:'test',HIFZ_PROFILE_SYNC_SECRET:'synthetic-sync-secret-'.repeat(3)};
 return {...f,env,scope};
}
test('profile changes enqueue atomically, coalesce, and send only allowlisted profile data',async()=>{
 const {db,env}=await fixture();const packets=[];
 try{
  const before=db.prepare("SELECT revision FROM hifz_profile_sync WHERE account_id='account-0002'").get().revision;
  db.exec("UPDATE accounts SET display_name='Changed learner' WHERE account_id='account-0002'");
  assert.equal(db.prepare("SELECT revision FROM hifz_profile_sync WHERE account_id='account-0002'").get().revision,before+1);
  db.prepare('INSERT INTO account_contact_details(account_id,whatsapp_number,updated_at,updated_by_account_id) VALUES(?,?,?,?)').run('account-0002','+27 82 123 4567','2026-10-16','account-0001');
  const version=db.prepare("SELECT revision FROM hifz_profile_sync WHERE account_id='account-0002'").get().revision;
  db.exec('BEGIN');db.exec("UPDATE accounts SET display_name='Rolled back' WHERE account_id='account-0002'");db.exec('ROLLBACK');
  assert.equal(db.prepare("SELECT revision FROM hifz_profile_sync WHERE account_id='account-0002'").get().revision,version);
  const fetcher=async(url,options)=>{
   assert.equal(options.redirect,'manual');const packet=JSON.parse(options.body);packets.push(packet);
   const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.HIFZ_PROFILE_SYNC_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
   const signature=Uint8Array.from(options.headers['X-Academy-Sync-Signature'].match(/../g),part=>parseInt(part,16));
   assert(await crypto.subtle.verify('HMAC',key,signature,new TextEncoder().encode(options.body)));
   return Response.json({accepted:packet.profiles.length});
  };
  const result=await deliverHifzProfiles(env,{fetcher});assert(result.delivered>=1);
  const profile=packets.flatMap(p=>p.profiles).find(p=>p.academyUserId==='account-0002');
  assert.equal(profile.name,'Changed learner');assert.equal(profile.whatsappNumber,'+27 82 123 4567');
  assert.deepEqual(Object.keys(profile).sort(),['academyUserId','active','credentialEpoch','loginId','name','pinResetVersion','revision','role','whatsappNumber'].sort());
  assert(!JSON.stringify(packets).includes('pin_hash'));assert(!JSON.stringify(packets).includes('synthetic-pin-secret'));
  assert.equal(db.prepare("SELECT revision=delivered_revision AS done FROM hifz_profile_sync WHERE account_id='account-0002'").get().done,1);
  assert.equal((await deliverHifzProfiles(env,{fetcher})).attempted,0);
 }finally{db.close();}
});
test('delivery failure keeps Academy saves committed and retries without losing newer changes',async()=>{
 const {db,env}=await fixture();
 try{
  db.exec("UPDATE accounts SET display_name='Committed during outage' WHERE account_id='account-0002'");
  await deliverHifzProfiles(env,{fetcher:async()=>new Response('',{status:503})});
  assert.equal(db.prepare("SELECT display_name FROM accounts WHERE account_id='account-0002'").get().display_name,'Committed during outage');
  const queue=db.prepare("SELECT * FROM hifz_profile_sync WHERE account_id='account-0002'").get();assert(queue.revision>queue.delivered_revision);assert.equal(queue.last_error_code,'HTTP_503');assert.equal(queue.attempts,1);
  db.exec("UPDATE accounts SET display_name='Newer committed name' WHERE account_id='account-0002'");
  await deliverHifzProfiles(env,{fetcher:async()=>{db.exec("UPDATE accounts SET display_name='Concurrent name' WHERE account_id='account-0002'");return new Response('{}',{status:200});}});
  const raced=db.prepare("SELECT * FROM hifz_profile_sync WHERE account_id='account-0002'").get();assert(raced.revision>raced.delivered_revision);
  let last;await deliverHifzProfiles(env,{fetcher:async(url,options)=>{last=JSON.parse(options.body);return new Response('{}',{status:200});}});
  assert.equal(last.profiles.find(p=>p.academyUserId==='account-0002').name,'Concurrent name');
  assert.equal(db.prepare("SELECT revision=delivered_revision AS done FROM hifz_profile_sync WHERE account_id='account-0002'").get().done,1);
 }finally{db.close();}
});
test('PIN reset events are durable and independent of later PIN setup; Hifz role revocation is projected',async()=>{
 const {db,env,scope}=await fixture();
 try{
  db.exec("UPDATE account_credentials SET pin_hash='',pin_setup=0,credential_epoch=credential_epoch+1 WHERE account_id='account-0002'");
  assert.equal(db.prepare("SELECT pin_reset_version FROM hifz_profile_sync WHERE account_id='account-0002'").get().pin_reset_version,1);
  db.exec("UPDATE account_credentials SET pin_hash='synthetic-new-hash',pin_setup=1,credential_epoch=credential_epoch+1 WHERE account_id='account-0002'");
  assert.equal(db.prepare("SELECT pin_reset_version FROM hifz_profile_sync WHERE account_id='account-0002'").get().pin_reset_version,1);
  let packet;await deliverHifzProfiles(env,{fetcher:async(url,options)=>{packet=JSON.parse(options.body);return new Response('{}',{status:200});}});
  assert.equal(packet.profiles.find(p=>p.academyUserId==='account-0002').pinResetVersion,1);
  db.prepare('UPDATE role_assignments SET active=0 WHERE account_id=? AND activity_key=?').run('account-0002',scope);
  assert.equal(db.prepare("SELECT active FROM hifz_profile_sync_projection WHERE account_id='account-0002'").get().active,0);
  assert.equal(db.prepare("SELECT role FROM hifz_profile_sync_projection WHERE account_id='account-0001'").get().role,'admin');
  assert(hifzSyncChangePath('/api/admin/platform/user-profiles/save'));
  assert(!hifzSyncChangePath('/api/program-attendance/submit'));
 }finally{db.close();}
});

test('moving a role away from Hifz still enqueues the previous scope for revocation',async()=>{
 const {db,scope}=await fixture();
 try{
  const role=db.prepare('SELECT assignment_id FROM role_assignments WHERE account_id=? AND activity_key=? LIMIT 1').get('account-0002',scope);
  const other=db.prepare('SELECT activity_key FROM activities WHERE activity_key<>? LIMIT 1').get(scope);
  assert(role);assert(other);
  const before=db.prepare("SELECT revision FROM hifz_profile_sync WHERE account_id='account-0002'").get().revision;
  db.prepare('UPDATE role_assignments SET activity_key=?,active=0 WHERE assignment_id=?').run(other.activity_key,role.assignment_id);
  assert.equal(db.prepare("SELECT revision FROM hifz_profile_sync WHERE account_id='account-0002'").get().revision,before+1);
 }finally{db.close();}
});

test('an Academy API save schedules delivery without waiting for Hifz to respond',async()=>{
 const {db,env}=await fixture();const waits=[],packets=[];const old=globalThis.fetch;
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const post=async(path,input,token='',ctx)=>worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env,ctx);
 try{
  globalThis.fetch=async(url,options)=>{packets.push(JSON.parse(options.body));await gate;return new Response('{}',{status:200});};
  const token=(await (await post('/api/account/login',{uniqueid:'login-0001',pin:'1234'})).json()).token;assert(token);
  const directory=await (await post('/api/admin/platform/user-profiles/get',{},token)).json();
  const a=directory.accounts.find(a=>a.accountId==='account-0002');assert(a);
  const saved=await post('/api/admin/platform/user-profiles/save',{mode:'profile',accountId:a.accountId,creating:false,displayName:'API saved learner',active:a.active,uniqueId:a.uniqueId,whatsappNumber:a.whatsappNumber,baseRevision:a.revision,operationId:crypto.randomUUID()},token,{waitUntil:promise=>waits.push(promise)});
  assert.equal(saved.status,200,JSON.stringify(await saved.json()));assert.equal(waits.length,1);
  assert.equal(db.prepare("SELECT display_name FROM accounts WHERE account_id='account-0002'").get().display_name,'API saved learner');
  release();await Promise.all(waits);
  assert.equal(packets.flatMap(p=>p.profiles).find(p=>p.academyUserId==='account-0002').name,'API saved learner');
  assert.equal(db.prepare("SELECT revision=delivered_revision AS done FROM hifz_profile_sync WHERE account_id='account-0002'").get().done,1);
 }finally{release();await Promise.all(waits);globalThis.fetch=old;db.close();}
});

test('redirect responses stay queued and are never followed or acknowledged',async()=>{
 const {db,env}=await fixture();let calls=0;
 try{
  const result=await deliverHifzProfiles(env,{fetcher:async(url,options)=>{
   calls++;assert.equal(options.redirect,'manual');
   return new Response(null,{status:302,headers:{Location:'https://unexpected.invalid/profile-sync'}});
  }});
  assert.equal(calls,1);assert.equal(result.delivered,0);
  const queue=db.prepare("SELECT * FROM hifz_profile_sync WHERE account_id='account-0002'").get();
  assert(queue.revision>queue.delivered_revision);assert.equal(queue.last_error_code,'HTTP_302');
 }finally{db.close();}
});
