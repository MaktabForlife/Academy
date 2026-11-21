import test from 'node:test';
import assert from 'node:assert/strict';
import {signIn} from '../../../backend/tests/fixtures/academy-v111-native-fixture.mjs';
import {opaque} from '../codec.mjs';
import {s256} from '../ceremonies.mjs';
import {ORIGINS} from '../tokens.mjs';
import {runOfflineUpdateStep} from '../offline-operations.mjs';
import {isolatedWorld,installOwnedBaseline,prepareHifzBaselineFixture} from './shared-child-entry-fixture.mjs';
import {nativeStudioAccount,seedStudioReleaseContent} from './release-content-fixture.mjs';

async function studioAdmission(f,area){
 const verifier=opaque(),expectedContext=null;
 const entry=await f.post('studio','/auth/v2/shared-entry/start',{destination:area,challenge:await s256(verifier),expectedContext});
 assert.equal(entry.response.status,200,entry.data.code);
 const result=await f.post('studio','/auth/v2/shared-entry',{
  tx:entry.data.tx,operationId:entry.data.operationId,verifier,expectedContext
 },entry.data);
 assert.equal(result.response.status,200,result.data.code);
 assert.equal(result.response.headers.getSetCookie().length,2);
 return result.data;
}

async function checkedWebsite(f,entry){
 return f.request('studio','/api/websites/'+entry.website);
}
async function checkedRecording(f,entry){
 return f.request('studio','/api/media/'+entry.recording);
}

for(const area of ['tafseer','mothers','courses'])test('V111.01 '+area+' uses Studio grants for the exact allowed and denied resources',async()=>{
 let other;
 const f=await isolatedWorld({snapshotSchema:4,prepareAcademy(db,_admin,actors){
  const account=db.prepare('SELECT login_link_id FROM accounts WHERE account_id=?').get(actors.studentB);
  const {ce}=db.prepare('SELECT credential_epoch ce FROM account_credentials WHERE account_id=?').get(actors.studentB);
  other={sub:actors.studentB,ce,loginId:account.login_link_id};
 }});
 try{
  if(area==='courses')nativeStudioAccount(f,other);
  const fixture=await seedStudioReleaseContent(f,area,area==='courses'?{paidSub:other.sub}:{});
  const update={generation:11101,releaseId:'isolated-content-r11'};
  const offline=(app,action,input={})=>runOfflineUpdateStep(f.runtimes[app],{...update,action,...input});
  for(const app of ['academy','studio']){
   f.runtimes[app].settings.raw.offlineUpdate=update;
   f.envs[app].UAA_V111_CUTOVER='held';
   await offline(app,'prepare');
   await offline(app,'verifyRevocations');
  }
  await assert.rejects(offline('academy','publishStudioBaseline',{subject:f.sub}),{code:'STUDIO_OFFLINE_SOURCE_BASELINE_REQUIRED'});
  await installOwnedBaseline(f,'studio');
  assert.equal((await offline('academy','publishStudioBaseline',{subject:f.sub})).status,'INSTALLED');
  if(area==='courses')assert.equal((await offline('academy','publishStudioBaseline',{subject:other.sub})).status,'INSTALLED');
  // Apply the published dependency floors and cover the proof before release.
  await installOwnedBaseline(f,'studio');
  const db=f.databases.studio,proofs=db.prepare('SELECT count(*) AS n FROM studio_source_authority_receipts').get().n;
  assert.equal(proofs,0);
  f.envs.studio.UAA_V111_CUTOVER='active';
  await assert.rejects(offline('academy','publishStudioBaseline',{subject:f.sub}),{code:'STUDIO_OFFLINE_SOURCE_HOLD_REQUIRED'});
  f.envs.academy.UAA_V111_CUTOVER='active';
  let serviceCalls=0;
  f.envs.studio.UAA_V2_PEERS.academy={async fetch(){serviceCalls++;throw Error('Academy blocked on Studio entry');}};
  const first=await signIn(f);
  assert.equal((await f.nativeRequest('/api/academy/hub/read',{kind:'bootstrap',input:{mode:'learn'}},first)).response.status,200);
  await studioAdmission(f,area);
  const allowed=await checkedWebsite(f,fixture.allowed);
  assert.equal(allowed.status,200,await allowed.clone().text());
  assert.match(JSON.stringify(await allowed.json()),new RegExp(fixture.allowed.title));
  const media=await checkedRecording(f,fixture.allowed);
  assert.equal(media.status,200,await media.clone().text());
  assert.equal((await media.json()).videoId,'abcdefghijk');
  for(const denied of [await checkedWebsite(f,fixture.denied),await checkedRecording(f,fixture.denied)]){
   const text=await denied.text();
   assert([403,404].includes(denied.status),text);
   assert(!text.includes('abcdefghijk'));
  }
  if(area==='mothers'){
   const response=await f.request('studio','/api/circles/classrooms/mothers');
   assert.equal(response.status,200,await response.clone().text());
   const classroom=await response.json();
   assert.equal(classroom.programme.key,'mothers');
  }
  if(area==='courses'){
   f.jar.hosts.delete(ORIGINS.academy);
   f.jar.hosts.delete(ORIGINS.studio);
   f.jar.shared=null;
   f.advance(1);
   await signIn({...f,...other});
   await studioAdmission(f,area);
   const purchased=await checkedRecording(f,fixture.denied);
   assert.equal(purchased.status,200,await purchased.clone().text());
   assert.equal((await purchased.json()).videoId,'abcdefghijk');
  }
  assert.equal(serviceCalls,0);
 }finally{await f.drainNativeBackground();f.close();}
});

test('a signed-in Academy learner without an existing Hifz mapping receives no Hifz session or journal',async()=>{
 let other;
 const f=await isolatedWorld({snapshotSchema:4,prepareAcademy(db,admin,actors){
  prepareHifzBaselineFixture(db,admin,actors);
  other=db.prepare('SELECT login_link_id FROM accounts WHERE account_id=?').get(actors.studentB).login_link_id;
 }});
 try{
  await installOwnedBaseline(f,'hifz');
  await signIn({...f,loginId:other});
  const verifier=opaque(),expectedContext=null;
  const entry=await f.post('hifz','/auth/v2/shared-entry/start',{destination:'hifz',challenge:await s256(verifier),expectedContext});
  assert.equal(entry.response.status,200,entry.data.code);
  const result=await f.post('hifz','/auth/v2/shared-entry',{tx:entry.data.tx,operationId:entry.data.operationId,verifier,expectedContext},entry.data);
  assert([403,503].includes(result.response.status),result.data.code);
  assert.equal(result.response.headers.getSetCookie().length,0);
  assert.equal((await f.request('hifz','/api/reflections')).status,401);
  assert.equal(f.databases.hifz.prepare('SELECT count(*) AS n FROM jwt_v2_families').get().n,0);
 }finally{await f.drainNativeBackground();f.close();}
});

test('Academy logout remains pending for a withheld Studio delivery and retries the exact cutoff',async()=>{
 const f=await isolatedWorld({snapshotSchema:4,prepareAcademy:prepareHifzBaselineFixture});
 try{
  const fixture=await seedStudioReleaseContent(f,'tafseer');
  const update={generation:11101,releaseId:'isolated-content-logout-r11'};
  const offline=(app,action,input={})=>runOfflineUpdateStep(f.runtimes[app],{...update,action,...input});
  for(const app of ['academy','studio','hifz']){
   f.runtimes[app].settings.raw.offlineUpdate=update;
   f.envs[app].UAA_V111_CUTOVER='held';
   await offline(app,'prepare');
   await offline(app,'verifyRevocations');
  }
  await installOwnedBaseline(f,'hifz');
  await installOwnedBaseline(f,'studio');
  assert.equal((await offline('academy','publishStudioBaseline',{subject:f.sub})).status,'INSTALLED');
  await installOwnedBaseline(f,'studio');
  for(const app of ['academy','studio','hifz'])f.envs[app].UAA_V111_CUTOVER='active';

  const login=await signIn(f);
  const studio=await studioAdmission(f,'tafseer');
  const verifier=opaque(),expectedContext=null;
  const entry=await f.post('hifz','/auth/v2/shared-entry/start',{destination:'hifz',challenge:await s256(verifier),expectedContext});
  const hifz=await f.post('hifz','/auth/v2/shared-entry',{tx:entry.data.tx,operationId:entry.data.operationId,verifier,expectedContext},entry.data);
  assert.equal(hifz.response.status,200,hifz.data.code);
  assert.equal((await checkedRecording(f,fixture.allowed)).status,200);
  assert.equal((await f.request('hifz','/api/reflections')).status,200);
  const renewals={};
  for(const [app,context] of [['studio',studio.context],['hifz',hifz.data.context]]){
   const boot=await f.post(app,'/auth/v2/bootstrap',{purpose:'refresh',expectedContext:context});
   assert.equal(boot.response.status,200,boot.data.code);
   renewals[app]={boot,context};
  }

  let withheld=0;
  const academyPeer=f.envs.academy.UAA_V2_PEERS.studio;
  f.envs.academy.UAA_V2_PEERS.studio={fetch(request){
   if(new URL(request.url).pathname==='/internal/auth/v2/events'){withheld++;throw Error('Isolated Studio notification delayed');}
   return academyPeer.fetch(request);
  }};
  const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'logout',expectedContext:login.context});
  const operationId=boot.data.intent.id;
  const logout=await f.post('academy','/auth/v2/logout',{operationId,expectedContext:login.context},boot.data);
  assert.equal(logout.response.status,200,logout.data.code);
  assert.equal(logout.data.outcome,'ACCEPTED_PENDING');
  assert.equal(logout.data.globalConfirmed,false);
  f.envs.academy.UAA_V111_CUTOVER='held';
  const cutoffs=()=>{
   const rows=f.databases.academy.prepare("SELECT target_app,state,next_attempt_at,attempts FROM jwt_v2_outbox WHERE json_extract(event_json,'$.operationId')=? ORDER BY target_app").all(operationId);
   assert.equal(rows.length,2);
   return Object.fromEntries(rows.map(row=>[row.target_app,row]));
  };
  for(let attempt=0;attempt<4;attempt++){
   if(!(await offline('academy','deliverCutoffs',{limit:8})).attempted)break;
  }
  const pending=cutoffs();
  assert(withheld>0);
  assert.equal(pending.hifz.state,'APPLIED');
  assert.equal(pending.studio.state,'PENDING');
  assert(pending.studio.attempts>0&&pending.studio.next_attempt_at>f.now());
  assert.equal((await f.request('hifz','/api/reflections')).status,401);
  // Studio has no notice yet. Its first validation lease is still bounded.
  assert.equal((await checkedRecording(f,fixture.allowed)).status,200);
  const stored=await f.runtimes.studio.store.family(studio.context.sid);
  assert(stored.deadline<=stored.vat+900);

  f.envs.academy.UAA_V2_PEERS.studio=academyPeer;
  f.advance(pending.studio.next_attempt_at-f.now());
  for(let attempt=0;attempt<4;attempt++){
   if(!(await offline('academy','deliverCutoffs',{limit:8})).attempted)break;
  }
  assert.equal(cutoffs().studio.state,'APPLIED');
  assert.equal((await checkedRecording(f,fixture.allowed)).status,401);
  for(const app of ['studio','hifz']){
   const {boot:refresh,context}=renewals[app];
   const denied=await f.post(app,'/auth/v2/refresh',{
    operationId:refresh.data.intent.id,expectedContext:context,qualifyingActivity:false
   },refresh.data);
   assert.equal(denied.response.status,401,denied.data.code);
   assert.equal(denied.response.headers.getSetCookie().length,0);
  }
 }finally{await f.drainNativeBackground();f.close();}
});
