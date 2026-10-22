import {WorkspaceRequest} from './fixtures/workspace-request.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixtureDatabase} from './fixtures/academy-d1-fixture.mjs';
import worker from '../src/academy-runtime.js';
import {issueHifzHandoff} from '../src/academy/d1/hifz-handoff.js';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {authenticatedD1Account} from '../src/academy/d1/session.js';
import {verifySharedPin,isSharedPinHash} from '../src/lib/shared-pin-credential.js';
import {deliverHifzProfiles} from '../src/academy/d1/hifz-profile-sync.js';
async function fixture(){const f=await fixtureDatabase();for(const file of ['0004_management_transactions.sql','0011_account_contact_details.sql','0028_hifz_profile_sync.sql','0029_hifz_shared_pin.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+file,import.meta.url),'utf8'));const scope=f.db.prepare("SELECT activity_key FROM activities WHERE kind='PROGRAM' ORDER BY activity_key LIMIT 1").get().activity_key;f.db.prepare("UPDATE academy_settings SET setting_value=? WHERE setting_key='HifzProfileActivityKey'").run(scope);f.db.prepare('INSERT OR IGNORE INTO hifz_profile_sync(account_id) VALUES(?)').run('account-0002');return {...f,env:{...f.env,SHARED_PIN_SECRET:'synthetic-shared-pin-secret-'.repeat(3),HIFZ_HANDOFF_ENABLED:'1',HIFZ_PROFILE_SYNC_URL:'https://hifz.test/internal/academy/profile-sync',HIFZ_PROFILE_SYNC_TARGET:'test',HIFZ_PROFILE_SYNC_SECRET:'synthetic-sync-key-'.repeat(3)}};}
const request=(path,body,token)=>new WorkspaceRequest('http://localhost'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
const challenge=Buffer.alloc(32,7).toString('base64url');
test('Academy sign-in upgrades the existing PIN and queues exactly the shared credential',async()=>{const {db,env}=await fixture();try{const old=db.prepare("SELECT pin_hash FROM account_credentials WHERE account_id='account-0002'").get().pin_hash;const response=await worker.fetch(request('/api/account/login',{uniqueid:'login-0002',pin:'1234'}),env);assert.equal(response.status,200);const result=await response.json();assert(result.token);const hash=db.prepare("SELECT pin_hash FROM account_credentials WHERE account_id='account-0002'").get().pin_hash;assert.notEqual(hash,old);assert(isSharedPinHash(hash));assert(await verifySharedPin('1234',hash,env.SHARED_PIN_SECRET));let packet;await deliverHifzProfiles(env,{fetcher:async(url,options)=>{packet=JSON.parse(options.body);return Response.json({accepted:packet.profiles.length});}});assert.equal(packet.profiles.find(p=>p.academyUserId==='account-0002').pinHash,hash);assert(!JSON.stringify(packet).includes(env.SHARED_PIN_SECRET));assert(!JSON.stringify(result).includes(hash));}finally{db.close();}});
test('a current Hifz member receives only a purpose-bound one-use pass',async()=>{const {db,env}=await fixture();try{const result=await (await worker.fetch(request('/api/account/login',{uniqueid:'login-0002',pin:'1234'}),env)).json();const auth=await authenticatedD1Account(request('/api/academy/hifz/sign-in',{},result.token),env,academyD1Repository(env));let sent;const fetcher=async(url,options)=>{assert.equal(url,'https://hifz.test/internal/academy/handoff');assert.equal(options.redirect,'manual');sent=JSON.parse(options.body);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.HIFZ_PROFILE_SYNC_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);assert(await crypto.subtle.verify('HMAC',key,Buffer.from(options.headers['X-Academy-Handoff-Signature'],'hex'),new TextEncoder().encode('hifz-handoff-v1:'+options.body)));return Response.json({code:'c'.repeat(43),expiresIn:60});};const input={codeChallenge:challenge,expectedLoginId:'login-0002'};const pass=await issueHifzHandoff(env,auth,input,{fetcher});assert.equal(pass.code,'c'.repeat(43));assert.equal(sent.profile.academyUserId,'account-0002');assert.equal(sent.codeChallenge,challenge);assert(isSharedPinHash(sent.profile.pinHash));assert(!JSON.stringify(pass).includes(sent.profile.pinHash));await assert.rejects(()=>issueHifzHandoff(env,auth,{...input,expectedLoginId:'someoneelse'},{fetcher}),e=>e.status===409);await assert.rejects(()=>issueHifzHandoff(env,auth,{...input,codeChallenge:'bad'},{fetcher}),e=>e.status===409);db.prepare('UPDATE role_assignments SET active=0 WHERE account_id=?').run('account-0002');await assert.rejects(()=>issueHifzHandoff(env,auth,input,{fetcher}),e=>e.status===403);}finally{db.close();}});
test('logout, reset, missing session, and redirecting receiver cannot create passes',async()=>{const {db,env}=await fixture();try{const result=await (await worker.fetch(request('/api/account/login',{uniqueid:'login-0002',pin:'1234'}),env)).json();const auth=await authenticatedD1Account(request('/api/academy/hifz/sign-in',{},result.token),env,academyD1Repository(env)),input={codeChallenge:challenge,expectedLoginId:'login-0002'};await assert.rejects(()=>issueHifzHandoff(env,auth,input,{fetcher:async()=>new Response(null,{status:302,headers:{Location:'https://untrusted.test'}})}),e=>e.status===503);db.prepare('UPDATE account_sessions SET revoked_at=? WHERE session_id=?').run(new Date().toISOString(),auth.sid);await assert.rejects(()=>issueHifzHandoff(env,auth,input),e=>e.status===403);assert.equal((await worker.fetch(request('/api/academy/hifz/sign-in',input),env)).status,401);db.prepare("UPDATE account_credentials SET pin_setup=0,pin_hash='',credential_epoch=credential_epoch+1 WHERE account_id=?").run('account-0002');await assert.rejects(()=>issueHifzHandoff(env,auth,input),e=>e.status===403);}finally{db.close();}});
test('migration replays metadata so a pre-existing Academy session can enter Hifz without another PIN',async()=>{
 const f=await fixtureDatabase();try{
  for(const file of ['0004_management_transactions.sql','0011_account_contact_details.sql','0028_hifz_profile_sync.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+file,import.meta.url),'utf8'));
  const scope=f.db.prepare("SELECT activity_key FROM activities WHERE kind='PROGRAM' ORDER BY activity_key LIMIT 1").get().activity_key;
  f.db.prepare("UPDATE academy_settings SET setting_value=? WHERE setting_key='HifzProfileActivityKey'").run(scope);
  f.db.prepare("UPDATE account_credentials SET credential_epoch=5 WHERE account_id='account-0002'").run();
  f.db.prepare('INSERT INTO hifz_profile_sync(account_id,delivered_revision) VALUES(?,1)').run('account-0002');
  const oldHash=f.db.prepare("SELECT pin_hash FROM account_credentials WHERE account_id='account-0002'").get().pin_hash;
  const signed=await(await worker.fetch(request('/api/account/login',{uniqueid:'login-0002',pin:'1234'}),f.env)).json();assert(signed.token);
  f.db.exec(readFileSync(new URL('../migrations/academy/0029_hifz_shared_pin.sql',import.meta.url),'utf8'));
  const q=f.db.prepare("SELECT revision,delivered_revision FROM hifz_profile_sync WHERE account_id='account-0002'").get();assert.equal(q.revision,2);assert.equal(q.delivered_revision,1);
  assert.equal(f.db.prepare("SELECT pin_hash FROM account_credentials WHERE account_id='account-0002'").get().pin_hash,oldHash);
  const env={...f.env,SHARED_PIN_SECRET:'synthetic-new-shared-secret-'.repeat(3),HIFZ_HANDOFF_ENABLED:'1',HIFZ_PROFILE_SYNC_URL:'https://hifz.test/internal/academy/profile-sync',HIFZ_PROFILE_SYNC_TARGET:'test',HIFZ_PROFILE_SYNC_SECRET:'synthetic-handoff-key-'.repeat(3)};
  const auth=await authenticatedD1Account(request('/api/academy/hifz/sign-in',{},signed.token),env,academyD1Repository(env));
  const pass=await issueHifzHandoff(env,auth,{codeChallenge:challenge,expectedLoginId:'login-0002'},{fetcher:async(url,options)=>{const packet=JSON.parse(options.body);assert.equal(packet.profile.credentialEpoch,5);assert.equal(packet.profile.revision,2);assert.equal(packet.profile.pinHash,undefined);return Response.json({code:'c'.repeat(43),expiresIn:60});}});
  assert.equal(pass.code,'c'.repeat(43));
 }finally{f.db.close();}
});

test('D1 trigger-inclusive change counts do not make a successful PIN upgrade fail',async()=>{
 const {db,env}=await fixture();try{
  const original=env.ACADEMY_DB;env.ACADEMY_DB={...original,batch:async statements=>{const result=await original.batch(statements);if(statements[0]?.sql?.includes('UPDATE account_credentials SET pin_hash='))result[0].meta.changes+=1;return result;}};
  const response=await worker.fetch(request('/api/account/login',{uniqueid:'login-0002',pin:'1234'}),env);assert.equal(response.status,200);assert((await response.json()).token);assert(isSharedPinHash(db.prepare("SELECT pin_hash FROM account_credentials WHERE account_id='account-0002'").get().pin_hash));
 }finally{db.close();}
});

test('production and development handoffs use separate fixed receivers and signed targets',async()=>{
 const {db,env}=await fixture();try{
  const result=await(await worker.fetch(request('/api/account/login',{uniqueid:'login-0002',pin:'1234'}),env)).json();
  const auth=await authenticatedD1Account(request('/api/academy/hifz/sign-in',{},result.token),env,academyD1Repository(env));
  const configured={...env,HIFZ_PROFILE_SYNC_TARGET:'production',HIFZ_PROFILE_SYNC_URL:'https://hifz.test/internal/academy/profile-sync',HIFZ_DEVELOPMENT_HANDOFF_URL:'https://hifz-dev.test/internal/academy/profile-sync'};
  for(const environment of ['production','development']){
   const result=await issueHifzHandoff(configured,auth,{codeChallenge:challenge,expectedLoginId:'login-0002',environment},{fetcher:async(url,options)=>{
    assert.equal(new URL(url).origin,environment==='production'?'https://hifz.test':'https://hifz-dev.test');assert.equal(JSON.parse(options.body).target,environment);return Response.json({code:'c'.repeat(43),expiresIn:60});
   }});assert(result.success);
  }
  await assert.rejects(()=>issueHifzHandoff(configured,auth,{codeChallenge:challenge,expectedLoginId:'login-0002',environment:'https://untrusted.test'}),e=>e.status===400);
 }finally{db.close();}
});
