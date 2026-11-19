import test from 'node:test';
import assert from 'node:assert/strict';
import {AcademyNativeAdapter} from '../native-adapter.mjs';
import {StudioNativeAdapter,studioNativeAdapterBoundary} from '../../../../AcademyStudio/security/v2/native-adapter.mjs';
import {HifzNativeAdapter} from '../../../../Hifz/security/v2/native-adapter.mjs';
import {splitFixture} from '../../../backend/tests/fixtures/academy-split-fixture.mjs';
import {applyTargetSchema} from '../../../../AcademyStudio/tests/target-schema.mjs';
import {createSharedPinHash} from '../../../backend/src/lib/shared-pin-credential.js';
import {schemaSQL} from '../schema.mjs';
import {database} from './helpers.mjs';
const ref={id:'test:native',scope:'GLOBAL',ownerEpoch:'native-owner-epoch'};
function seedVector(db){db.prepare("INSERT INTO jwt_v2_dependencies(id,scope,owner_epoch,revision) VALUES('test:native','GLOBAL','native-owner-epoch',1)").run();}
function academyEnv(f,db=f.core){return {...f.source.env,ACADEMY_DB:db,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_SPLIT_COORDINATOR:f.namespace,ACADEMY_LEARNING_OPERATIONS:'3'};}
async function academyFixture(){
 const f=await splitFixture();f.databases.core.exec(schemaSQL);seedVector(f.databases.core);
 return {...f,adapter:new AcademyNativeAdapter({env:academyEnv(f),dependencies:[ref]})};
}
async function studioFixture({authority='WEBSITE',stale=false}={}){
 const f=database('studio');await applyTargetSchema(f.db);const now=Date.now();
 for(const sub of ['learner','outsider'])f.raw.prepare('INSERT INTO accounts VALUES(?,?,1,1,4,?,0)').run(sub,'Private contact name '+sub,stale?0:now);
 for(const [id,kind] of [['course','COURSE'],['tafseer','TAFSEER'],['free','COURSE']])f.raw.prepare('INSERT INTO offerings VALUES(?,?,?,1,1)').run(id,kind,'Synthetic '+id);
 f.raw.prepare("INSERT INTO course_access_models(offering_id,access_model) VALUES('free','FREE')").run();
 f.raw.prepare("INSERT INTO participation VALUES('learner','course',0,0,1,'historic-cohort')").run();
 f.raw.prepare("INSERT INTO participation VALUES('learner','tafseer',0,0,0,'new-cohort')").run();
 f.raw.prepare("INSERT INTO paid_months VALUES('learner','tafseer','2024-01','historic-cohort','PRIVATE PAYMENT NOTE')").run();
 f.raw.prepare("INSERT INTO website_months VALUES('learner','tafseer','2023-12')").run();
 f.raw.prepare("INSERT INTO websites VALUES('surah','tafseer','Synthetic Surah','2024-01','draft','published',1,1,'2024-01-15')").run();
 f.raw.prepare("INSERT INTO websites VALUES('playlist-site','tafseer','Synthetic playlist','2024-01','draft-p','published-p',1,1,'2024-01-15')").run();
 f.raw.prepare("INSERT INTO surah_grants VALUES('learner','surah','EXPLICIT SOURCE GRANT')").run();
 f.raw.prepare("INSERT INTO mou_playlists VALUES('playlist','tafseer','playlist-site',1,1,1,?)").run(now);
 f.raw.prepare("INSERT INTO mou_playlist_retained VALUES('playlist','tafseer','learner','2024-01','PAID')").run();
 f.raw.prepare("INSERT INTO objects VALUES('recording',NULL,'video/youtube','recording.mp4',0,'synthetic','abcdefghijk')").run();
 f.raw.prepare("INSERT INTO attachments VALUES('historic-recording','tafseer','surah','recording','lesson','2024-01-15','historic-cohort','Original audience','RECORDING',1)").run();
 for(const offer of ['course','tafseer','free']){
  f.raw.prepare('INSERT INTO source_access_scopes VALUES(?,?,1,1,1,1,?,?)').run(offer,authority,'UTC','["historic-cohort"]');
  f.raw.prepare('INSERT INTO source_access_people VALUES(?,?,1,1,?,1,?,1,?)').run('learner',offer,stale?0:now,'[{"active":true,"classId":"historic-cohort","start":"2020-01-01","end":""}]',Number(offer!=='tafseer'));
  if(authority==='WEBSITE')f.raw.prepare("INSERT INTO access_handovers(offering_id,transfer_id,phase,generation,source_version,revision,created_at) VALUES(?,?,'COMMITTED',1,1,1,?)").run(offer,'handover-'+offer,now);
 }
 f.raw.prepare("INSERT INTO source_access_websites VALUES('surah','tafseer',1)").run();
 seedVector(f.raw);
 const env={DB:f.db,AUTHORITY_MODE:'ACADEMY',ACCOUNT_MAX_AGE_SECONDS:'43200',ADMIN_MAX_AGE_SECONDS:'60',LIVE_ACCESS_MAX_AGE_SECONDS:'43200'};
 return {...f,adapter:new StudioNativeAdapter({env,dependencies:[ref]})};
}
function hifzFixture(){
 const f=database('hifz');
 f.raw.exec("CREATE TABLE students(id TEXT PRIMARY KEY,role TEXT,active INTEGER,credential_epoch INTEGER,pin_hash TEXT,name TEXT,whatsapp_number TEXT);CREATE TABLE academy_profile_links(academy_user_id TEXT PRIMARY KEY,student_id TEXT,source_revision INTEGER,source_credential_epoch INTEGER,pin_reset_version INTEGER);CREATE TABLE academy_identity_migrations(migration_id TEXT PRIMARY KEY);CREATE TABLE sabaq_log(student_id TEXT,private_note TEXT);");
 f.raw.prepare("INSERT INTO students VALUES('permanent-native-journal','student',1,77,'PRIVATE-LEGACY-HASH','PRIVATE NAME','PRIVATE CONTACT')").run();
 f.raw.prepare("INSERT INTO academy_profile_links VALUES('canonical-academy','permanent-native-journal',9,4,1)").run();
 f.raw.prepare("INSERT INTO sabaq_log VALUES('permanent-native-journal','PRIVATE JOURNAL CONTENT')").run();
 seedVector(f.raw);
 return {...f,adapter:new HifzNativeAdapter({env:{DB:f.db,PROFILE_AUTHORITY:'academy'},dependencies:[ref]})};
}

test('Academy cold capture reuses actual native split rights without creating a v1 session',async()=>{
 const f=await academyFixture();try{
  const before=f.databases.core.prepare('SELECT count(*) n FROM account_sessions').get().n;
  const c=await f.adapter.credentialSnapshot(f.actors.studentA),r=await f.adapter.capture({sub:f.actors.studentA,credentialEpoch:c.ce});
  assert.equal(r.sub,f.actors.studentA);assert.equal(r.rights.globalAdmin,false);assert(r.rights.roles.some(x=>x.activity_key===f.scopes.courseA&&x.role==='STUDENT'));assert(r.rights.contexts.length);
  assert.equal(f.databases.core.prepare('SELECT count(*) n FROM account_sessions').get().n,before);
  const encoded=JSON.stringify(r.rights);for(const field of ['pin_hash','pinHash','whatsapp','SESSION_SECRET','credential_epoch'])assert(!encoded.includes(field));
  assert.equal(r.ownerVector.length,1);assert.equal(r.vectorGuards[0][1],'GLOBAL');assert.equal(r.pv.length,43);
 }finally{f.close();}
});
test('Academy native PIN verifier is read-only and snapshot guard is pinned to credential changes',async()=>{
 const f=await academyFixture();try{
  const c=await f.adapter.credentialSnapshot(f.actors.studentA),epoch=c.ce;
  assert.equal(await f.adapter.verifyPin('1234',c),true);assert.equal(await f.adapter.verifyPin('9999',c),false);
  assert.equal(f.databases.core.prepare('SELECT credential_epoch FROM account_credentials WHERE account_id=?').get(c.sub).credential_epoch,epoch);
  assert(!JSON.stringify(c).includes('hash'));const guard=f.adapter.credentialGuard(c);
  assert(await f.core.prepare(guard.sql).bind(...guard.args).first());
  f.databases.core.prepare('UPDATE account_credentials SET credential_epoch=credential_epoch+1,pin_hash=NULL,pin_setup=0 WHERE account_id=?').run(c.sub);
  assert.equal(await f.core.prepare(guard.sql).bind(...guard.args).first(),null);
  await assert.rejects(f.adapter.verifyPin('1234',c),/CREDENTIAL_CHANGED/);
 }finally{f.close();}
});
test('Academy setup plan preserves native epoch advance and marks fresh-parent composition as required',async()=>{
 const f=await academyFixture();try{
  f.databases.core.prepare('UPDATE account_credentials SET credential_epoch=credential_epoch+1,pin_hash=NULL,pin_setup=0 WHERE account_id=?').run(f.actors.studentA);
  const c=await f.adapter.credentialSnapshot(f.actors.studentA),plan=await f.adapter.setupCredentialPlan({credential:c,pin:'1234'});
  assert.equal(plan.postSetupCe,c.ce+1);assert.equal(plan.requiresFreshPostSetupParent,true);assert.equal(plan.statements.length,4);
  assert.equal(f.databases.core.prepare('SELECT pin_setup FROM account_credentials WHERE account_id=?').get(c.sub).pin_setup,0);
 }finally{f.close();}
});
test('Academy pending native fence denies cold capture before reading mixed source authority',async()=>{
 const f=await academyFixture();try{
  const c=await f.adapter.credentialSnapshot(f.actors.studentA),command=crypto.randomUUID();
  f.databases.core.prepare("INSERT INTO split_commands(command_id,phase,payload_hash,created_at) VALUES(?,'PENDING','synthetic',?)").run(command,new Date().toISOString());
  f.databases.core.prepare('INSERT INTO split_write_fence VALUES(1,?,0)').run(command);
  await assert.rejects(f.adapter.capture({sub:c.sub,credentialEpoch:c.ce}),/SPLIT_RECOVERY_PENDING/);
 }finally{f.close();}
});
test('Academy capture detects a native active-status change during the owning read',async()=>{
 const f=await academyFixture();try{
  let reads=0,changed=false;const altered={...f.core,withSession(){return altered;},prepare(sql){const st=f.core.prepare(sql);if(sql.startsWith('SELECT version,(SELECT count(*)'))return {...st,async first(...args){reads++;if(reads===2&&!changed){changed=true;f.databases.core.prepare('UPDATE accounts SET active=0 WHERE account_id=?').run(f.actors.studentA);}return st.first(...args);}};return st;}};
  const adapter=new AcademyNativeAdapter({env:academyEnv(f,altered),dependencies:[ref]});
  await assert.rejects(adapter.capture({sub:f.actors.studentA,credentialEpoch:1}),/NATIVE_ACCOUNT_INACTIVE/);assert(changed);
 }finally{f.close();}
});
test('Studio local capture preserves purchased Course, dated cohort, website months, Surah and retained MOU facts',async()=>{
 const f=await studioFixture({stale:true});try{
  const r=await f.adapter.capture({sub:'learner',sourceCredentialEpoch:4,sourceParentRef:crypto.randomUUID(),offeringIds:['course','tafseer']});
  const course=r.rights.scopes.find(x=>x.offering_id==='course'),tafseer=r.rights.scopes.find(x=>x.offering_id==='tafseer');
  assert.equal(course.purchased,1);assert.equal(course.enrolled,0);assert.equal(course.liveNow,false);
  assert.deepEqual(tafseer.paidMonths.map(x=>({...x})),[{month:'2024-01',cohort:'historic-cohort'}]);
  assert.deepEqual(tafseer.websiteMonths.map(x=>({...x})),[{month:'2023-12'}]);assert.equal(tafseer.surahGrants[0].website_id,'surah');assert.equal(tafseer.mouRetained[0].source_month,'2024-01');
  assert.equal(r.sourceProvenance.contactAtMs,0);assert.equal(r.sourceProvenance.freshContact,false);
  assert(!JSON.stringify(r.rights).includes('PRIVATE'));assert.equal(f.raw.prepare('SELECT count(*) n FROM sessions').get().n,0);
 }finally{f.raw.close();}
});
test('Studio native material gate retains original cohort paid recording and denies an outsider',async()=>{
 const f=await studioFixture();try{
  const media=await f.adapter.nativeMediaInputs({sub:'learner',sourceParentRef:crypto.randomUUID(),attachmentId:'historic-recording'});
  assert.equal(media.cohort,'historic-cohort');assert.equal(media.published,1);
  await assert.rejects(f.adapter.nativeMediaInputs({sub:'outsider',sourceParentRef:crypto.randomUUID(),attachmentId:'historic-recording'}),/requires its own material rights/);
  f.raw.prepare("DELETE FROM paid_months WHERE account_id='learner'").run();
  await assert.rejects(f.adapter.nativeMediaInputs({sub:'learner',sourceParentRef:crypto.randomUUID(),attachmentId:'historic-recording'}),/requires its own material rights/);
 }finally{f.raw.close();}
});
test('Studio cold local validation does not falsify stale remote provenance; old resource-age gate remains explicit',async()=>{
 const f=await studioFixture({authority:'ACADEMY',stale:true});try{
  const r=await f.adapter.capture({sub:'learner',sourceCredentialEpoch:4,sourceParentRef:crypto.randomUUID(),offeringIds:['tafseer']});
  assert.equal(r.rights.scopes[0].source.verified_at,0);assert.equal(r.sourceProvenance.freshContact,false);
  await assert.rejects(f.adapter.nativeMediaInputs({sub:'learner',sourceParentRef:crypto.randomUUID(),attachmentId:'historic-recording'}),e=>e.code==='ACCESS_REFRESH_REQUIRED');
  assert(studioNativeAdapterBoundary.resourceHooks.includes('legacy source-age'));
 }finally{f.raw.close();}
});
test('Studio primary source master fence and uncommitted ownership handover deny inputs',async()=>{
 const f=await studioFixture();try{
  f.raw.prepare("UPDATE access_handovers SET phase='PREPARING' WHERE offering_id='tafseer'").run();
  await assert.rejects(f.adapter.capture({sub:'learner',sourceCredentialEpoch:4,offeringIds:['tafseer']}),/HANDOVER_REQUIRED/);
  f.raw.prepare("UPDATE access_handovers SET phase='COMMITTED' WHERE offering_id='tafseer'").run();
  f.raw.prepare("INSERT INTO source_access_master_fences VALUES('learner','tafseer',4,1,1,0)").run();
  await assert.rejects(f.adapter.capture({sub:'learner',sourceCredentialEpoch:4,offeringIds:['tafseer']}),/MASTER_RECONCILIATION/);
 }finally{f.raw.close();}
});
test('Studio free Course facts remain free without inventing a purchase',async()=>{
 const f=await studioFixture({authority:'ACADEMY',stale:true});try{
  const r=await f.adapter.capture({sub:'outsider',sourceCredentialEpoch:4,offeringIds:['free']});
  assert.equal(r.rights.scopes[0].access_model,'FREE');assert.equal(r.rights.scopes[0].purchased,null);
 }finally{f.raw.close();}
});
test('Hifz canonical ID maps to a distinct permanent native journal ID and never caches journals or PIN hashes',async()=>{
 const f=hifzFixture();try{
  const r=await f.adapter.capture({sub:'canonical-academy',sourceCredentialEpoch:4});
  assert.equal(r.sub,'canonical-academy');assert.equal(r.nativeStudentId,'permanent-native-journal');assert.equal(r.rights.role,'student');assert.equal(r.sourceProvenance.credentialEpoch,4);
  const data=JSON.stringify(r);for(const secret of ['PRIVATE-LEGACY-HASH','PRIVATE NAME','PRIVATE CONTACT','PRIVATE JOURNAL CONTENT'])assert(!data.includes(secret));
  assert.equal(f.raw.prepare('SELECT student_id FROM sabaq_log').get().student_id,'permanent-native-journal');
  assert.equal(typeof f.adapter.verifyPin,'undefined');
 }finally{f.raw.close();}
});
test('Hifz missing, duplicate, inactive and incomplete mappings fail closed',async()=>{
 const f=hifzFixture();try{
  await assert.rejects(f.adapter.capture({sub:'not-linked',sourceCredentialEpoch:4}),/PROFILE_REQUIRED/);
  f.raw.prepare("INSERT INTO academy_profile_links VALUES('other-academy','permanent-native-journal',1,4,0)").run();
  await assert.rejects(f.adapter.capture({sub:'canonical-academy',sourceCredentialEpoch:4}),/MAPPING_CONFLICT/);
  f.raw.prepare("DELETE FROM academy_profile_links WHERE academy_user_id='other-academy'").run();
  f.raw.prepare("UPDATE students SET active=0").run();await assert.rejects(f.adapter.capture({sub:'canonical-academy',sourceCredentialEpoch:4}),/PROFILE_INACTIVE/);
  f.raw.prepare("UPDATE students SET active=1").run();f.raw.prepare("UPDATE academy_profile_links SET source_credential_epoch=0").run();
  await assert.rejects(f.adapter.capture({sub:'canonical-academy',sourceCredentialEpoch:4}),/METADATA_REQUIRED/);
 }finally{f.raw.close();}
});
test('Hifz native CAS guard pins source mapping, current role and credential provenance',async()=>{
 const f=hifzFixture();try{
  const identity=await f.adapter.identity('canonical-academy'),guard=f.adapter.identityGuard(identity);
  assert(await f.db.prepare(guard.sql).bind(...guard.args).first());f.raw.prepare("UPDATE students SET role='teacher'").run();
  assert.equal(await f.db.prepare(guard.sql).bind(...guard.args).first(),null);
  await assert.rejects(f.adapter.capture({sub:'canonical-academy',sourceCredentialEpoch:3}),/CREDENTIAL_CHANGED/);
 }finally{f.raw.close();}
});
test('unregistered native dependency cannot produce an authority vector',async()=>{
 const f=hifzFixture();try{
  f.raw.exec('DELETE FROM jwt_v2_dependencies');await assert.rejects(f.adapter.capture({sub:'canonical-academy',sourceCredentialEpoch:4}),/DEPENDENCY_UNAVAILABLE/);
 }finally{f.raw.close();}
});

test('Academy setup requires an existing authorised native context and never invents a grant',async()=>{
 const f=await academyFixture();try{
  f.databases.core.prepare("UPDATE account_credentials SET pin_hash=NULL,pin_setup=0,credential_epoch=credential_epoch+1 WHERE account_id=?").run(f.actors.none);
  f.databases.core.exec('UPDATE activities SET active=0');
  const adapter=new AcademyNativeAdapter({env:{...academyEnv(f),ACADEMY_MEDIA_SEPARATION:'0',ACADEMY_WEB_PLATFORM:'0'},dependencies:[ref]});
  const c=await adapter.credentialSnapshot(f.actors.none);
  await assert.rejects(adapter.setupCredentialPlan({credential:c,pin:'1234'}),e=>e.code==='NO_CONTEXT');
 }finally{f.close();}
});
test('Academy prepared setup handles a native blank credential through exact CAS, without changing original account ID',async()=>{
 const f=await academyFixture();try{
  f.databases.core.prepare("UPDATE account_credentials SET pin_hash='',pin_setup=0,credential_epoch=credential_epoch+1 WHERE account_id=?").run(f.actors.studentA);
  const c=await f.adapter.credentialSnapshot(f.actors.studentA),p=await f.adapter.setupCredentialPlan({credential:c,pin:'1234'});
  assert(p.statements[1].sql.includes('pin_hash IS ?'));assert.equal(p.statements[1].params[4],'');
  assert.equal(p.postSetupCe,c.ce+1);
 }finally{f.close();}
});

test('Studio native MOU retained month follows its saved source purchase, while website-only months never unlock recordings',async()=>{
 const f=await studioFixture();try{
  f.raw.prepare("INSERT INTO programme_offerings VALUES('mothers','tafseer','MONTHLY')").run();
  f.raw.prepare("INSERT INTO mou_playlist_date_writes VALUES('playlist')").run();
  f.raw.prepare("UPDATE websites SET completion_month='2024-02',completion_date='2024-02-15' WHERE website_id='playlist-site'").run();
  f.raw.prepare("DELETE FROM mou_playlist_date_writes WHERE playlist_id='playlist'").run();
  f.raw.prepare("UPDATE attachments SET lesson_date='2024-03-15',cohort='different-cohort' WHERE attachment_id='historic-recording'").run();
  f.raw.prepare("INSERT INTO mou_playlist_items VALUES('playlist','historic-recording')").run();
  f.raw.prepare("INSERT INTO mou_playlist_only_media VALUES('historic-recording')").run();
  const allowed=await f.adapter.nativeMediaInputs({sub:'learner',sourceParentRef:crypto.randomUUID(),attachmentId:'historic-recording'});
  assert.equal(allowed.playlist_only,1);assert.equal(allowed.lesson_date,'2024-03-15');
  f.raw.prepare("DELETE FROM paid_months WHERE account_id='learner'").run();
  f.raw.prepare("INSERT INTO website_months VALUES('learner','tafseer','2024-02')").run();
  const text=await f.adapter.nativeWebsiteInputs({sub:'learner',sourceParentRef:crypto.randomUUID(),websiteId:'playlist-site'});assert.equal(text.is_playlist,true);
  await assert.rejects(f.adapter.nativeMediaInputs({sub:'learner',sourceParentRef:crypto.randomUUID(),attachmentId:'historic-recording'}),/requires its own material rights/);
 }finally{f.raw.close();}
});

test('Academy native shared-v3 PIN path reuses its verifier without legacy fallback or implicit credential change',async()=>{
 const f=await academyFixture();try{
  const secret='synthetic-only-shared-secret-32-characters',hash=await createSharedPinHash('1234',secret);
  f.databases.core.prepare('UPDATE account_credentials SET pin_hash=?,credential_epoch=credential_epoch+1 WHERE account_id=?').run(hash,f.actors.studentA);
  const adapter=new AcademyNativeAdapter({env:{...academyEnv(f),SHARED_PIN_SECRET:secret},dependencies:[ref]}),c=await adapter.credentialSnapshot(f.actors.studentA);
  assert.equal(await adapter.verifyPin('1234',c),true);assert.equal(await adapter.verifyPin('9999',c),false);
  const unavailable=new AcademyNativeAdapter({env:{...academyEnv(f),SHARED_PIN_SECRET:''},dependencies:[ref]}),u=await unavailable.credentialSnapshot(f.actors.studentA);
  await assert.rejects(unavailable.verifyPin('1234',u),/VERIFIER_UNAVAILABLE/);
  assert.equal(f.databases.core.prepare('SELECT credential_epoch FROM account_credentials WHERE account_id=?').get(c.sub).credential_epoch,c.ce);
 }finally{f.close();}
});
test('Academy native credential receipt cannot be forged from copied public metadata',async()=>{
 const f=await academyFixture();try{
  const c=await f.adapter.credentialSnapshot(f.actors.studentA);
  assert.throws(()=>f.adapter.credentialGuard({...c}),/RECEIPT_REQUIRED/);
  await assert.rejects(f.adapter.verifyPin('1234',{...c}),/RECEIPT_REQUIRED/);
 }finally{f.close();}
});
test('unexpected native owner epoch requires explicit reconciliation even at the same revision',async()=>{
 const f=hifzFixture();try{
  f.raw.prepare("UPDATE jwt_v2_dependencies SET owner_epoch='unrecognised-epoch'").run();
  await assert.rejects(f.adapter.capture({sub:'canonical-academy',sourceCredentialEpoch:4}),/OWNER_EPOCH_RECONCILIATION_REQUIRED/);
 }finally{f.raw.close();}
});
test('repeated native authority changes exhaust two coherent attempts instead of producing a mixed lease',async()=>{
 const f=await studioFixture();try{
  let clocks=0;
  const adapter=new StudioNativeAdapter({env:{DB:f.db,AUTHORITY_MODE:'ACADEMY'},dependencies:[ref],clock:()=>{if(++clocks>1)f.raw.exec('UPDATE jwt_v2_dependencies SET revision=revision+1');return 2000000;}});
  await assert.rejects(adapter.capture({sub:'learner',sourceCredentialEpoch:4,sourceParentRef:crypto.randomUUID(),offeringIds:['tafseer']}),/CHANGED_DURING_CAPTURE/);
 }finally{f.raw.close();}
});
