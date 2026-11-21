import test from 'node:test';
import assert from 'node:assert/strict';
import {signIn} from '../../../backend/tests/fixtures/academy-v111-native-fixture.mjs';
import {childJourney} from './legacy-child-journey-fixture.mjs';
import {ACADEMY_SHARED_COOKIE,ORIGINS} from '../tokens.mjs';
import {canonical,opaque} from '../codec.mjs';
import {s256} from '../ceremonies.mjs';
import {isolatedWorld,digestStreamFactory,prepareHifzBaselineFixture} from './shared-child-entry-fixture.mjs';
import {
 listUpdateSubjects,prepareUpdateBoundary,revokeOfflineAcademyAccount,publishUpdateSessions,requireVerifiedUpdateBoundary,verifyUpdateBoundary
} from '../update-boundary.mjs';

import {offlineSecurityRequest,cutoverUnavailable} from '../cutover-state.mjs';
import {runOfflineUpdateStep} from '../offline-operations.mjs';
import {runtimeFor} from '../runtime.mjs';
import {launch as studioLaunch} from '../../../../AcademyStudio/src/launch-worker.mjs';
import {parallel as studioParallel} from '../../../../AcademyStudio/src/parallel-worker.mjs';
import {saasWebsite as studioSaas} from '../../../../AcademyStudio/hosting/saas/worker.mjs';
import hifzWorker from '../../../../Hifz/worker/src/index.js';

const apps=['academy','studio','hifz'];
const update={generation:11101,releaseId:'isolated-r11'};
const membership={academy:'fixture-learn',studio:'fixture-recording',hifz:'fixture-journal'};
const step=(runtime,action,input={})=>runOfflineUpdateStep(runtime,{...update,action,...input});

test('the held public ingress closes public, auth and private content across the Studio and Hifz wrappers',async()=>{
 const env={UAA_V111_CUTOVER:'held',UAA_V2_ENABLED:'1'};
 for(const [app,handler] of [['studio',studioSaas],['studio',studioLaunch],['studio',studioParallel],['hifz',hifzWorker.fetch]]){
  for(const [path,method] of [['/','GET'],['/auth/v2/bootstrap','POST'],['/api/reflections','GET'],['/api/media/fixture','GET'],['/internal/auth/v2/events','POST']]){
   const response=await handler(new Request(ORIGINS[app]+path,{method}),env,{});
   assert.equal(response.status,503);
   assert.equal((await response.json()).code,'V111_CUTOVER_HOLD');
  }
 }
 for(const app of apps){
  const permitted=ORIGINS[app]+'/internal/auth/v2/'+(app==='academy'?'reconcile':'events');
  const headers={'X-UAA-Service-Key':'fixture-header-only'};
  assert(offlineSecurityRequest(new Request(permitted,{method:'POST',headers}),env,app));
  assert(!offlineSecurityRequest(new Request(permitted,{method:'POST',headers:{...headers,Origin:ORIGINS[app]}}),env,app));
  assert(!offlineSecurityRequest(new Request(permitted+'?unused=1',{method:'POST',headers}),env,app));
  assert(!offlineSecurityRequest(new Request(ORIGINS[app]+'/internal/auth/v2/redeem',{method:'POST',headers}),env,app));
 }
});

test('held Studio SaaS delegates only its offline security routes to the application verifier',async()=>{
 const env={UAA_V111_CUTOVER:'held',UAA_V2_ENABLED:'1'};
 const event=new Request(ORIGINS.studio+'/internal/auth/v2/events',{
  method:'POST',headers:{'X-UAA-Service-Key':'fixture-header-only'},
 });
 const authority=new Request(ORIGINS.studio+'/internal/academy/source-authority/v2',{
  method:'POST',headers:{'X-UAA-Authority-Key':'fixture-header-only'},
 });
 const application=async(request,settings)=>{
  assert.equal(settings,env);
  assert([event.url,authority.url].includes(request.url));
  return Response.json({code:'FIXTURE_VERIFIER_DENIAL'},{status:403});
 };
 for(const request of [event,authority]){
  const response=await studioSaas(request,env,{}, {application});
  assert.equal(response.status,403);
  assert.equal((await response.json()).code,'FIXTURE_VERIFIER_DENIAL');
  const browserRequest=new Request(request,{headers:{...Object.fromEntries(request.headers),Origin:ORIGINS.studio}});
  assert.equal((await studioSaas(browserRequest,env,{}, {application})).status,503);
 }
});

function restoreOnly(f,app,oldCookies){
 f.jar.shared=null;
 f.jar.hosts.clear();
 f.jar.hosts.set(ORIGINS[app],new Map(oldCookies));
}

function restart(f,app){
 const previous=f.runtimes[app];
 return f.runtimes[app]=new previous.constructor({
  settings:previous.settings,env:previous.env,clock:f.now,native:previous.native
 });
}

async function readPrivate(f,app,session){
 if(app==='academy'){
  const result=await f.nativeRequest('/api/academy/hub/read',{kind:'bootstrap',input:{mode:'learn'}},session);
  return {status:result.response.status,body:JSON.stringify(result.data)};
 }
 const response=await f.request(app,app==='studio'?'/api/media/offline-recording':'/api/reflections');
 return {status:response.status,body:await response.text()};
}

test('an offline update revokes all three owning sessions and applies the exact Academy cutoff to both children',async()=>{
 const f=await isolatedWorld({snapshotSchema:4,legacySessionMode:true,prepareAcademy:prepareHifzBaselineFixture});
 try{
  const {studio,hifz}=f.databases;
  studio.prepare("INSERT INTO objects VALUES('offline-recording',NULL,'video/mp4','Fixture recording',0,'fixture',?)").run(membership.studio);
  studio.exec("INSERT INTO attachments VALUES('offline-recording','native-course',NULL,'offline-recording','synthetic-lesson','2026-11-20','native-class','Fixture recording','RECORDING',1)");
  const existing=hifz.prepare("INSERT INTO reflections(student_id,date,entered_by,reflection,is_private,created_at) VALUES('native-journal','2026-11-20','native-journal',?,1,'2026-11-20T12:00:00Z')").run(membership.hifz);
  const childOnlySub=crypto.randomUUID();
  f.databases.academy.prepare('INSERT INTO jwt_v2_accounts(sub,ce,ae,active,revision) VALUES(?,1,1,1,1)').run(childOnlySub);
  hifz.prepare("INSERT INTO jwt_v2_ceremony_pending(tx,purpose,sub,expires_at,csrf_hash,operation_id) VALUES(?,'admission',?,?,'fixture-proof',?)").run(crypto.randomUUID(),childOnlySub,f.now()+300,crypto.randomUUID());
  const academy=await signIn(f),sessions={academy};
  for(const app of ['studio','hifz'])sessions[app]=await childJourney(f,app,{academyContext:academy.context});
  const cookies={},intents={};
  for(const app of apps){
   cookies[app]=new Map(f.jar.hosts.get(ORIGINS[app]));
   assert.equal(cookies[app].size,2);
   const before=await readPrivate(f,app,sessions[app]);
   assert.equal(before.status,200);
   if(app!=='academy')assert.match(before.body,new RegExp(membership[app]));
   const bootstrap=await f.post(app,'/auth/v2/bootstrap',{purpose:'refresh',expectedContext:sessions[app].context});
   assert.equal(bootstrap.response.status,200);
   assert(bootstrap.data.intent?.id);
   intents[app]=bootstrap.data;
  }
  await assert.rejects(prepareUpdateBoundary(f.runtimes.academy,update),{code:'OFFLINE_UPDATE_HOLD_REQUIRED'});
  for(const app of apps){
   const runtime=f.runtimes[app];
   f.envs[app].UAA_V111_CUTOVER='held';
   assert.equal((await prepareUpdateBoundary(runtime,update)).status,'PREPARED');
   runtime.settings.raw.offlineUpdate=update;
   await assert.rejects(requireVerifiedUpdateBoundary(runtime),{code:'OFFLINE_UPDATE_NOT_VERIFIED'});
   const closed=await f.post(app,'/auth/v2/bootstrap',{purpose:'refresh',expectedContext:sessions[app].context});
   assert.equal(closed.response.status,503);
   assert.equal(closed.data.code,'OFFLINE_UPDATE_NOT_VERIFIED');
   assert.deepEqual(await prepareUpdateBoundary(runtime,update),{generation:update.generation,status:'PREPARED'});
   await assert.rejects(prepareUpdateBoundary(runtime,{...update,releaseId:'different-release'}),{code:'OFFLINE_UPDATE_GENERATION_MISMATCH'});
   await assert.rejects(verifyUpdateBoundary(runtime,update.generation),{code:'OFFLINE_UPDATE_PUBLICATION_PENDING'});
   assert.equal((await runtime.store.family(sessions[app].context.sid)).state,'REVOKED');
   const database=f.databases[app],sessionId=sessions[app].context.sid;
   assert.throws(()=>database.prepare("UPDATE jwt_v2_families SET state='UNLOCKED',cr=cr+1 WHERE sid=?").run(sessionId));
  }
  for(const app of apps){
   for(const target of apps.filter(peer=>peer!==app)){
    f.envs[app].UAA_V2_PEERS[target]={fetch:request=>
     offlineSecurityRequest(request,f.envs[target],target)?f.dispatch(request):cutoverUnavailable()};
   }
  }
  const owner=restart(f,'academy');
  const academyInventory=await listUpdateSubjects(owner,update);
  assert.deepEqual(academyInventory.map(row=>row.sub),[f.sub]);
  const hifzInventory=await listUpdateSubjects(f.runtimes.hifz,update);
  assert.deepEqual(hifzInventory.map(row=>row.sub).sort(),[f.sub,childOnlySub].sort());
  assert.equal(hifz.prepare('SELECT status FROM jwt_v2_ceremony_pending WHERE sub=?').get(childOnlySub).status,'CANCELLED');
  const bucket=f.buckets.studio,put=bucket.put;
  bucket.put=async()=>{throw new Error('Isolated terminal publication unavailable');};
  try{
   await assert.rejects(publishUpdateSessions(f.runtimes.studio,update));
   await assert.rejects(verifyUpdateBoundary(f.runtimes.studio,update.generation),{code:'OFFLINE_UPDATE_PUBLICATION_PENDING'});
  }finally{bucket.put=put;}
  for(const app of apps){
   assert.deepEqual(await publishUpdateSessions(restart(f,app),update),{attempted:1,pending:0});
  }
  await assert.rejects(verifyUpdateBoundary(owner,update.generation),{code:'OFFLINE_UPDATE_CUTOFF_REQUIRED'});
  const cutoff=await revokeOfflineAcademyAccount(owner,{generation:update.generation,sub:f.sub});
  assert.equal(cutoff.cutoff.reason,'OFFLINE_UPDATE');
  assert.equal(cutoff.cutoff.incidentId,null);
  assert.equal(cutoff.cutoff.maxCe,academy.context.ce);
  assert.equal(cutoff.cutoff.maxAe,academy.context.ae);
  assert.deepEqual(await revokeOfflineAcademyAccount(owner,{generation:update.generation,sub:f.sub}),cutoff);
  assert.equal((await owner.store.first('SELECT ae FROM jwt_v2_accounts WHERE sub=?',f.sub)).ae,academy.context.ae+1);
  await assert.rejects(verifyUpdateBoundary(owner,update.generation),{code:'OFFLINE_UPDATE_CUTOFF_UNCONFIRMED'});
  const peer=f.envs.academy.UAA_V2_PEERS.hifz;
  f.envs.academy.UAA_V2_PEERS.hifz={async fetch(){throw new Error('Isolated Hifz delivery unavailable');}};
  try{await step(owner,'deliverCutoffs');}finally{f.envs.academy.UAA_V2_PEERS.hifz=peer;}
  await assert.rejects(verifyUpdateBoundary(owner,update.generation),{code:'OFFLINE_UPDATE_CUTOFF_UNCONFIRMED'});
  await assert.rejects(verifyUpdateBoundary(f.runtimes.hifz,update.generation),{code:'OFFLINE_UPDATE_CUTOFF_UNCONFIRMED'});
  f.advance(67);
  await step(restart(f,'academy'),'deliverCutoffs');
  await assert.rejects(verifyUpdateBoundary(f.runtimes.hifz,update.generation),{code:'OFFLINE_UPDATE_CUTOFF_UNCONFIRMED'});
  const childOnlyCutoff=await revokeOfflineAcademyAccount(f.runtimes.academy,{generation:update.generation,sub:childOnlySub});
  assert.deepEqual([childOnlyCutoff.cutoff.maxCe,childOnlyCutoff.cutoff.maxAe],[1,1]);
  await step(f.runtimes.academy,'deliverCutoffs');
  for(const app of ['studio','hifz']){
   const applied=await f.runtimes[app].store.first("SELECT state,event_json FROM jwt_v2_events WHERE json_extract(event_json,'$.operationId')=?",cutoff.receipt);
   assert.equal(applied?.state,'APPLIED');
   assert.deepEqual(JSON.parse(applied.event_json).target,cutoff.cutoff);
  }
  for(const app of apps){
   const runtime=restart(f,app);
   assert.deepEqual(await publishUpdateSessions(runtime,update),{attempted:0,pending:0});
   assert.equal((await verifyUpdateBoundary(runtime,update.generation)).status,'VERIFIED');
   await requireVerifiedUpdateBoundary(runtime);
   const control=(await runtime.cache.read('security/session/'+sessions[app].context.sid)).value;
   assert.equal(control.localState,'REVOKED');
  }
  f.runtimes.academy.digestStreamFactory=digestStreamFactory;
  for(const app of ['studio','hifz']){
   const runtime=f.runtimes[app];
   runtime.digestStreamFactory=digestStreamFactory;
   runtime.settings.raw.sharedChildEntry={ownerEpoch:'fixture-account-stream',notBefore:f.now()};
   const requestId=crypto.randomUUID();
   let page={nextPageToken:null};
   do{page=await step(runtime,'reconcileBaselines',{requestId,pageToken:page.nextPageToken});}
   while(page.nextPageToken);
   assert.equal(page.applied,true);
   const verified=await f.runtimes[app].store.first('SELECT ae,snapshot_id FROM jwt_v2_shared_account_baselines WHERE sub=?',f.sub);
   assert.deepEqual([verified.ae,verified.snapshot_id],[academy.context.ae+1,page.snapshotId]);
  }
  const pinCount=f.trace.filter(row=>row.path==='/auth/v2/pin').length;
  for(const app of apps){
   const runtime=restart(f,app),context=sessions[app].context,proof=intents[app];
   f.envs[app].UAA_V111_CUTOVER='active';
   f.envs[app].UAA_V2_PEERS=Object.fromEntries(apps.filter(peer=>peer!==app).map(peer=>[peer,{async fetch(){throw new Error('Cross-app requests are disabled during old-cookie checks');}}]));
   for(let attempt=0;attempt<2;attempt++){
    restoreOnly(f,app,cookies[app]);
    const response=await readPrivate(f,app,sessions[app]);
    assert([401,403].includes(response.status),'Expected protected rejection for '+app+', got '+response.status+' '+JSON.parse(response.body).code);
    assert.doesNotMatch(response.body,new RegExp(membership[app]));
    restoreOnly(f,app,cookies[app]);
    const refresh=await f.post(app,'/auth/v2/refresh',{operationId:proof.intent.id,expectedContext:context,qualifyingActivity:false},proof);
    assert.equal(refresh.response.status,401);
    assert.equal(refresh.response.headers.getSetCookie().length,0);
    assert.equal((await runtime.store.family(context.sid)).sv,context.sv);
   }
  }
  assert.equal(f.trace.filter(row=>row.path==='/auth/v2/pin').length,pinCount);
  f.jar.hosts.clear();
  for(const app of apps){
   const settings=f.runtimes[app].settings;
   if(app==='academy'){
    settings.sharedAcademySessions=true;
    settings.raw.sharedAcademySessions=true;
   }else settings.raw.sharedChildEntry={ownerEpoch:'fixture-account-stream',notBefore:f.now()};
   f.envs[app].UAA_V2_CONFIG=canonical(settings.raw);
   restart(f,app);
  }
  const source=f.runtimes.academy.settings.raw,productionLike=f.envs.academy;
  const {offlineUpdate:_,...unpinnedSource}=source;
  const unpinned={...productionLike,UAA_V2_CONFIG:canonical(unpinnedSource)};
  const wrongPin={...productionLike,UAA_V2_CONFIG:canonical({...source,offlineUpdate:{...update,generation:update.generation+1}})};
  await assert.rejects(runtimeFor(unpinned,{app:'academy',clock:f.now}),{code:'OFFLINE_UPDATE_CONFIGURATION_REQUIRED'});
  await assert.rejects(runtimeFor(wrongPin,{app:'academy',clock:f.now}),{code:'OFFLINE_UPDATE_NOT_VERIFIED'});
  assert.equal((await runtimeFor(productionLike,{app:'academy',clock:f.now})).settings.raw.offlineUpdate.generation,update.generation);
  const fresh=await signIn(f);
  assert(f.jar.shared);
  assert(f.jar.header(ORIGINS.academy).includes(ACADEMY_SHARED_COOKIE+'='));
  assert.equal(f.jar.hosts.get(ORIGINS.academy).size,1);
  assert.notEqual(fresh.context.sid,academy.context.sid);
  assert.equal(fresh.context.ae,academy.context.ae+1);
  assert.equal((await readPrivate(f,'academy',fresh)).status,200);
  const current=(await f.runtimes.academy.cache.read('security/session/'+fresh.context.sid)).value;
  assert.equal(current.updateGeneration,update.generation);
  const pinned=f.runtimes.academy.settings.raw.offlineUpdate;
  f.runtimes.academy.settings.raw.offlineUpdate={...pinned,generation:pinned.generation+1};
  try{
   await assert.rejects(requireVerifiedUpdateBoundary(f.runtimes.academy),{code:'OFFLINE_UPDATE_NOT_VERIFIED'});
   assert.equal((await readPrivate(f,'academy',fresh)).status,401);
  }finally{f.runtimes.academy.settings.raw.offlineUpdate=pinned;}
  const traceCursor=f.trace.length;
  for(const [app,destination] of [['studio','tafseer'],['hifz','hifz']]){
   const verifier=opaque();
   assert(f.jar.header(ORIGINS[app]).includes(ACADEMY_SHARED_COOKIE+'='));
   assert.equal(f.jar.hosts.get(ORIGINS[app])?.size??0,0);
   const start=await f.post(app,'/auth/v2/shared-entry/start',{expectedContext:null,destination,challenge:await s256(verifier)});
   assert.equal(start.response.status,200,start.data.code);
   const admitted=await f.post(app,'/auth/v2/shared-entry',{tx:start.data.tx,operationId:start.data.operationId,expectedContext:null,verifier},start.data);
   assert.equal(admitted.response.status,200,admitted.data.code);
   assert.equal(admitted.data.context.psid,fresh.context.psid);
   assert.equal(admitted.response.headers.getSetCookie().length,2);
   const child=(await f.runtimes[app].cache.read('security/session/'+admitted.data.context.sid)).value;
   assert.equal(child.updateGeneration,update.generation);
   const opened=await readPrivate(f,app,admitted.data);
   assert.equal(opened.status,200);
   assert.match(opened.body,new RegExp(membership[app]));
  }
  assert.equal(f.trace.slice(traceCursor).filter(row=>row.app==='academy').length,0);
  const preserved=hifz.prepare('SELECT student_id,reflection FROM reflections WHERE id=?').get(existing.lastInsertRowid);
  assert.equal(preserved.student_id,'native-journal');
  assert.equal(preserved.reflection,membership.hifz);
 }finally{await f.drainNativeBackground();f.close();}
});
