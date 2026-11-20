import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {splitFixture} from '../../../backend/tests/fixtures/academy-split-fixture.mjs';
import {sqliteD1} from '../../../backend/tools/academy-split/sqlite-d1.mjs';
import {deliverHifzProfiles} from '../../../backend/src/academy/d1/hifz-profile-sync.js';
import {additiveSchemaSQL} from '../schema-bundle.mjs';
import {captureDDL,inspectCaptureSchema} from '../capture.mjs';
import {PrimaryStore} from '../store.mjs';
import {canonical,b64u,digest} from '../codec.mjs';
import {dependencyScope} from '../issuance-floors.mjs';
import {runtimeServices} from '../runtime-service.mjs';
import {PROFILE_ID,PROFILE_PATH,profileHeaders,sendNativeProfile} from '../profile-service.mjs';
import {handleNativeProfile} from '../../../../Hifz/security/v2/profile-service.mjs';
import {createNativeRuntime} from '../../../../Hifz/security/v2/native-runtime.mjs';
import {nativeSchemaSQL as hifzNativeSchemaSQL} from '../../../../Hifz/security/v2/native-schema.mjs';
import {createDatabase,d1Database,seedStudent} from '../../../../Hifz/tests/helpers/database.mjs';
const academyRegistry=JSON.parse(readFileSync(new URL('../native-authority.json',import.meta.url),'utf8')),hifzRegistry=JSON.parse(readFileSync(new URL('../../../../Hifz/security/v2/native-authority.json',import.meta.url),'utf8'));
const sub='Canonical-Profile',alias='canonical-profile',nativeId='permanent-native-journal',epoch='source-owner',now=1900000000;
const ring=canonical({schema:1,currentKid:'profile-key',keys:[{kid:'profile-key',key:b64u(new Uint8Array(32).fill(39)),notBefore:now-100,notAfter:now+10000,disabled:false}]});
async function paired(){
 const a=await splitFixture(),raw=a.databases.core;raw.exec(additiveSchemaSQL);raw.function('unixepoch',()=>now);const db=sqliteD1(raw),available=await inspectCaptureSchema(db);raw.exec(captureDDL({registry:academyRegistry,available,ownerEpoch:epoch}).sql);
 raw.prepare("UPDATE academy_settings SET setting_value=? WHERE setting_key='HifzProfileActivityKey'").run(a.scopes.courseA);
 raw.prepare("INSERT INTO accounts(account_id,display_name,login_link_id,active) VALUES(?,'Profile synthetic','PROFILE1',1)").run(sub);
 raw.prepare("INSERT INTO account_credentials(account_id,pin_hash,pin_setup,credential_epoch) VALUES(?,'PRIVATE-SYNTHETIC-HASH',1,4)").run(alias);
 raw.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('profile-student',?,?,'STUDENT',1,'CONFIRMED')").run(alias,a.scopes.courseA);
 raw.prepare('UPDATE hifz_profile_sync SET revision=revision+10 WHERE account_id=?').run(sub);
 const store=new PrimaryStore(db,{app:'academy',env:'production',securityPrefix:'auth-private/v2/production/academy/new-profile-generation/'}),env={UAA_V2_ENABLED:'1',UAA_V2_PROFILE_KEYS_JSON:ring,ACADEMY_DB:db};
 const runtime={app:'academy',config:{env:'production'},clock:()=>now,env,store,settings:{raw:{nativeOwnerEpoch:epoch,nativeTables:Object.keys(academyRegistry.rules)}},async ensureDependencies(subject){const scope=dependencyScope(subject);await store.stmt('INSERT OR IGNORE INTO jwt_v2_dependencies VALUES(?,?,?,1)',PROFILE_ID,scope,epoch).run();}};
 const child=createDatabase();child.exec(additiveSchemaSQL+hifzNativeSchemaSQL);const hdb=d1Database(child);hdb.withSession=()=>hdb;seedStudent(child,nativeId,{name:'Old profile',login_id:'OLD1',active:1,credential_epoch:77,pin_hash:'PRESERVED-NATIVE-HASH',academy_managed:1});
 child.prepare('INSERT INTO academy_profile_links(academy_user_id,student_id,source_revision,source_credential_epoch,pin_reset_version) VALUES(?,?,1,4,0)').run(sub,nativeId);
 const hstore=new PrimaryStore(hdb,{app:'hifz',env:'production',securityPrefix:'auth-private/v2/production/hifz/new-profile-generation/',dependencyRegistry:new Map([[PROFILE_ID,{ownerApp:'academy',epoch,scope:'ACCOUNT',recipients:['hifz'],actions:['read','write']}]])});
 const havailable=await inspectCaptureSchema(hdb);child.exec(captureDDL({registry:hifzRegistry,available:havailable,ownerEpoch:'hifz-native-owner'}).sql);
 const dependenciesFor=subject=>Object.entries(hifzRegistry.rules).map(([table,rule])=>({id:'hifz:native:'+table,scope:rule.accountColumn?dependencyScope(subject):'GLOBAL',ownerEpoch:'hifz-native-owner'}));
 const ensureDependencies=async subject=>{for(const r of dependenciesFor(subject))await hstore.stmt('INSERT OR IGNORE INTO jwt_v2_dependencies VALUES(?,?,?,1)',r.id,r.scope,r.ownerEpoch).run();};
 const henv={UAA_V2_ENABLED:'1',UAA_V2_PROFILE_KEYS_JSON:ring,PROFILE_AUTHORITY:'academy',DB:hdb},h={app:'hifz',config:{env:'production'},clock:()=>now,store:hstore,env:henv};h.native=await createNativeRuntime({env:henv,store:hstore,clock:h.clock,dependenciesFor,ensureDependencies});
 let bodies=[],requests=[];env.UAA_V2_PEERS={hifz:{async fetch(request){requests.push(request.clone());bodies.push(await request.clone().text());return handleNativeProfile(h,request);}}};
 return {a,raw,db,runtime,child,h,bodies,requests,close(){a.close();child.close();}};
}
async function deliver(f,options={}){return deliverHifzProfiles(f.runtime.env,{runtime:f.runtime,now:now*1000,...options});}
test('actual no-PIN source queue commits exact canonical existing link with signed native receipt',async()=>{const f=await paired();try{
 const result=await deliver(f);assert.equal(result.delivered,1);const body=JSON.parse(f.bodies[0]);assert.equal(body.profile.academyUserId,sub);assert.equal(body.profile.credentialEpoch,4);assert(!/pinHash|pin_hash|pin_setup|PRIVATE-SYNTHETIC-HASH/.test(f.bodies[0]));
 assert.equal(f.child.prepare('SELECT student_id FROM academy_profile_links').get().student_id,nativeId);assert.equal(f.child.prepare('SELECT pin_hash FROM students').get().pin_hash,'PRESERVED-NATIVE-HASH');assert.equal(f.child.prepare('SELECT name FROM students').get().name,'Profile synthetic');
 const provenance=f.child.prepare('SELECT * FROM academy_profile_provenance').get(),receipt=f.child.prepare('SELECT * FROM jwt_v2_applied_dependencies').get();assert.equal(provenance.academy_user_id,sub);assert.equal(receipt.projection_digest,body.projectionDigest);assert.equal(receipt.receipt_digest,JSON.parse(f.raw.prepare('SELECT receipt_json FROM jwt_v2_profile_deliveries').get().receipt_json).nativeReceiptDigest);
 assert.equal(f.raw.prepare('SELECT revision=delivered_revision ok FROM hifz_profile_sync WHERE account_id=?').get(sub).ok,1);
 assert.deepEqual(f.raw.prepare("SELECT DISTINCT target_app FROM jwt_v2_native_outbox n JOIN jwt_v2_authority_changes c USING(change_id) WHERE c.source_table='hifz_profile_sync'").all().map(r=>r.target_app),['hifz']);
 }finally{f.close();}});
test('native name role disable and V2 credential change advance queue capture without login',async()=>{const f=await paired();try{
 await deliver(f);const revisions=[];
 for(const sql of ["UPDATE accounts SET display_name='Changed profile' WHERE account_id='canonical-profile'","UPDATE role_assignments SET role='TEACHER' WHERE assignment_id='profile-student'","UPDATE accounts SET active=0 WHERE account_id='canonical-profile'","UPDATE account_credentials SET credential_epoch=5,pin_hash=NULL,pin_setup=0 WHERE account_id='canonical-profile'"]){f.raw.exec(sql);revisions.push(f.raw.prepare('SELECT revision FROM jwt_v2_dependencies WHERE id=? AND scope=?').get(PROFILE_ID,dependencyScope(sub)).revision);assert.equal((await deliver(f)).delivered,1);}
 assert(revisions.every((v,i)=>i===0||v>revisions[i-1]));assert.equal(f.child.prepare('SELECT name,role,active FROM students').get().name,'Changed profile');assert.equal(f.child.prepare('SELECT source_credential_epoch FROM academy_profile_links').get().source_credential_epoch,5);assert.equal(f.child.prepare('SELECT pin_hash FROM students').get().pin_hash,'PRESERVED-NATIVE-HASH');
 }finally{f.close();}});
test('view setting and activity lifecycle inputs are captured and unchanged dependency cannot carry changed profile',async()=>{const f=await paired();try{
 await deliver(f);const before=f.raw.prepare('SELECT revision FROM jwt_v2_dependencies WHERE id=? AND scope=?').get(PROFILE_ID,dependencyScope(sub)).revision;f.raw.prepare("UPDATE academy_settings SET setting_value='missing-native-activity' WHERE setting_key='HifzProfileActivityKey'").run();const after=f.raw.prepare('SELECT revision FROM jwt_v2_dependencies WHERE id=? AND scope=?').get(PROFILE_ID,dependencyScope(sub)).revision;assert(after>before);assert.equal((await deliver(f)).delivered,1);assert.equal(f.child.prepare('SELECT active FROM students').get().active,0);
 f.raw.exec('DROP TRIGGER hifz_sync_account;');f.raw.prepare("UPDATE accounts SET display_name='uncaptured change' WHERE account_id=?").run(sub);f.raw.prepare('UPDATE hifz_profile_sync SET delivered_revision=0 WHERE account_id=?').run(sub);await assert.rejects(deliver(f),{code:'HIFZ_PROFILE_UNCAPTURED_PROJECTION_CHANGE'});
 }finally{f.close();}});
test('HTTP200 without matching signed receipt stays pending; retry uses immutable operation bytes and fresh MAC',async()=>{const f=await paired();try{
 const real=f.runtime.env.UAA_V2_PEERS.hifz.fetch;let calls=0;f.runtime.env.UAA_V2_PEERS.hifz.fetch=async request=>{calls++;if(calls===1){f.bodies.push(await request.clone().text());f.requests.push(request.clone());return new Response('{}',{status:200});}return real(request);};
 assert.equal((await deliver(f)).delivered,0);assert.equal(f.raw.prepare('SELECT delivered_revision FROM hifz_profile_sync WHERE account_id=?').get(sub).delivered_revision,0);assert.equal((await deliver(f)).attempted,0);
 assert.equal((await deliver(f,{now:now*1000+60000})).delivered,1);assert.equal(f.bodies[0],f.bodies[1]);assert.notEqual(f.requests[0].headers.get('X-UAA-Profile-Nonce'),f.requests[1].headers.get('X-UAA-Profile-Nonce'));
 }finally{f.close();}});
test('profile MAC replay changed payload missing mapping and PIN-bearing profile fail closed',async()=>{const f=await paired();try{
 await deliver(f);const request=f.requests[0];await assert.rejects(handleNativeProfile(f.h,request.clone()),{code:'PROFILE_NONCE_REUSED'});
 const packet=JSON.parse(f.bodies[0]);packet.profile.name='tampered';await assert.rejects(handleNativeProfile(f.h,new Request(request.url,{method:'POST',headers:request.headers,body:canonical(packet)})),{code:'PROFILE_MAC_INVALID'});
 const original=JSON.parse(f.bodies[0]);original.profile.pinHash='forbidden';await assert.rejects(sendNativeProfile(f.runtime,original));
 const unmapped=JSON.parse(f.bodies[0]);unmapped.operationId=crypto.randomUUID();unmapped.profile.academyUserId='unmapped-canonical';unmapped.projectionDigest=await digest(unmapped.profile);const encoded=canonical(unmapped),headers=await profileHeaders(f.runtime,encoded);await assert.rejects(handleNativeProfile(f.h,new Request('https://mahadarwa-hifz.ummabbadacademy.app'+PROFILE_PATH,{method:'POST',headers,body:encoded})),{code:'HIFZ_EXISTING_REVIEWED_LINK_REQUIRED'});assert.equal(f.child.prepare('SELECT count(*) n FROM students').get().n,1);
 }finally{f.close();}});
test('split writer fence prevents source proof capture and delivery',async()=>{const f=await paired();try{f.raw.prepare("INSERT INTO split_commands(command_id,phase,payload_hash,created_at) VALUES(?,'PREPARING','synthetic','synthetic')").run('held-writer');f.raw.prepare('INSERT INTO split_write_fence(singleton,command_id,allow_write) VALUES(1,?,0)').run('held-writer');await assert.rejects(deliver(f),{code:'HIFZ_PROFILE_SOURCE_UNAVAILABLE'});assert.equal(f.bodies.length,0);}finally{f.close();}});

test('authenticated credential fact plan advances only existing exact mapping and original schema2 restriction atomically',async()=>{const f=await paired();try{
 const before=f.child.prepare('SELECT credential_epoch FROM students').get().credential_epoch;
 f.h.settings={raw:{snapshotSchema:3,serviceStreams:[{sourceApp:'academy',targetApp:'hifz',stream:'account-security',ownerEpoch:epoch,genesis:true}],ownerBridges:[],serviceDependencies:[]}};
 const services=await runtimeServices(f.h),target={type:'credentialEpoch',sub,newCe:5,reason:'ADMIN_PIN_RESET'},work=crypto.randomUUID();await f.h.store.batch(await services.effectPlan(work,target,{sub}));
 assert.equal(f.child.prepare('SELECT source_credential_epoch FROM academy_profile_links').get().source_credential_epoch,5);assert.equal(f.child.prepare('SELECT credential_epoch FROM students').get().credential_epoch,before+1);
 assert.equal(f.child.prepare('SELECT scope_sub FROM jwt_v2_worksets WHERE work_id=?').get(work).scope_sub,sub);
 const repeat=await f.h.native.applySecurityFactPlan({target,scopeSub:sub});await f.h.store.batch(repeat);assert.equal(f.child.prepare('SELECT credential_epoch FROM students').get().credential_epoch,before+1);
 await assert.rejects(f.h.native.applySecurityFactPlan({target,scopeSub:alias}),{code:'HIFZ_CREDENTIAL_FACT_CONFLICT'});
 const missing={...target,sub:'unmapped-canonical',newCe:7};await f.h.store.batch(await f.h.native.applySecurityFactPlan({target:missing,scopeSub:missing.sub}));assert.equal(f.child.prepare('SELECT count(*) n FROM academy_profile_links').get().n,1);
 }finally{f.close();}});

test('selected V2 sends only scoped aggregate authority while retaining immediate credential and account security events',async()=>{const f=await paired();try{
 f.raw.prepare('INSERT INTO jwt_v2_accounts VALUES(?,4,9,0,1,1)').run(sub);
 f.raw.prepare("UPDATE activities SET active=0 WHERE activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')").run();
 f.raw.prepare("UPDATE role_assignments SET role='TEACHER' WHERE assignment_id='profile-student'").run();
 f.raw.prepare('UPDATE account_credentials SET credential_epoch=5,pin_hash=NULL,pin_setup=0 WHERE account_id=?').run(alias);
 f.raw.prepare('UPDATE accounts SET active=0 WHERE account_id=?').run(alias);
 const rawAuthority=f.raw.prepare("SELECT c.change_id,c.sub,c.scope FROM jwt_v2_authority_changes c WHERE c.event_kind='authority-updated' AND c.source_table<>'hifz_profile_sync'").all();assert(rawAuthority.length>0);
 for(const row of rawAuthority)assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_native_outbox WHERE change_id=?').get(row.change_id).n,0);
 const routed=f.raw.prepare('SELECT c.*,n.target_app FROM jwt_v2_authority_changes c JOIN jwt_v2_native_outbox n USING(change_id)').all();
 assert(routed.some(r=>r.source_table==='hifz_profile_sync'&&r.target_app==='hifz'));assert(routed.filter(r=>r.event_kind==='authority-updated').every(r=>r.source_table==='hifz_profile_sync'&&r.sub===sub&&r.scope===dependencyScope(sub)&&r.target_app==='hifz'));
 for(const kind of ['credential-epoch-advanced','account-revoked'])assert.deepEqual(routed.filter(r=>r.event_kind===kind).map(r=>r.target_app).sort(),['hifz','studio']);
 }finally{f.close();}});
