import test from 'node:test';
import assert from 'node:assert/strict';
import {digestStreamFactory,installOwnedBaseline,isolatedWorld,prepareHifzBaselineFixture} from './shared-child-entry-fixture.mjs';
import {signIn} from '../../../backend/tests/fixtures/academy-v111-native-fixture.mjs';
import {childJourney} from './legacy-child-journey-fixture.mjs';
import {runOfflineUpdateStep} from '../offline-operations.mjs';
import {signInBaselineSchemaSQL} from '../signin-baseline-schema.mjs';
import {signInBaselineSchemaSQL as studioSchema} from '../../../../AcademyStudio/security/v2/signin-baseline-schema.mjs';
import {signInBaselineSchemaSQL as hifzSchema} from '../../../../Hifz/security/v2/signin-baseline-schema.mjs';
import {ORIGINS} from '../tokens.mjs';
import {b64u,bytes,canonical,opaque} from '../codec.mjs';
import {s256} from '../ceremonies.mjs';

const apps=['studio','hifz'];
const destinations={studio:'tafseer',hifz:'hifz'};
const returnPaths={studio:'/studio/?view=collections&collection=tafseer',hifz:'/'};
const protectedPaths={academy:'/api/account/session',studio:'/api/me',hifz:'/api/reflections'};
const runtimePath='/auth/v2/sign-in/readiness';
const peerPath='/internal/auth/v2/account-baseline';

async function stage2Fixture(){
 const f=await isolatedWorld({snapshotSchema:4,legacySessionMode:true,deferSharedKeySetup:true,prepareAcademy:prepareHifzBaselineFixture});
 try{
  f.databases.academy.exec(signInBaselineSchemaSQL);
  f.databases.studio.exec(studioSchema);
  f.databases.hifz.exec(hifzSchema);
  for(const runtime of Object.values(f.runtimes))for(const key of runtime.settings.serviceKeys.values()){
   if(!key.paths.includes(peerPath))key.paths.push(peerPath);
  }
  await prepareSharedBaseline(f);
  return f;
 }catch(error){f.close();throw error;}
}

function enableStage2(f){
 for(const runtime of Object.values(f.runtimes)){
  runtime.settings.raw.signInBaselineGeneration='stage2-isolated-v1';
  runtime.settings.raw.signInBaselineRefresh=true;
 }
}

function browserPost(app,path,body,{csrf,cookies}={}){
 const origin=ORIGINS[app];
 return new Request(origin+path,{
  method:'POST',headers:{'Content-Type':'application/json','X-UAA-Request':'2',
   'Sec-Fetch-Site':'same-origin',Origin:origin,
   ...(cookies?{Cookie:cookies}:{}),
   ...(csrf?{'X-UAA-CSRF':csrf}:{}),
   ...(body.expectedContext?{'X-UAA-Expected-Context':b64u(bytes(canonical(body.expectedContext)))}:{})},
  body:JSON.stringify(body)
 });
}

async function prepareSharedBaseline(f) {
 const prior=await signIn(f);
 for(const app of apps)await childJourney(f,app,{academyContext:prior.context});
 f.jar.hosts.clear();
 const update={generation:11101,releaseId:'isolated-signin-baseline'};
 const offline=(app,action,input={})=>runOfflineUpdateStep(f.runtimes[app],{...update,action,...input});
 for(const app of ['academy',...apps]){
  const runtime=f.runtimes[app];
  runtime.settings.raw.offlineUpdate=update;
  runtime.digestStreamFactory=digestStreamFactory;
  f.envs[app].UAA_V111_CUTOVER='held';
  await offline(app,'prepare');
 }
 await offline('academy','revokeAccount',{subject:f.sub});
 for(const app of ['academy',...apps])await offline(app,'publishSessions');
 for(let i=0;i<4;i++)if(!(await offline('academy','deliverCutoffs')).attempted)break;
 for(const app of apps)f.runtimes[app].settings.raw.sharedChildEntry={ownerEpoch:'fixture-account-stream',notBefore:f.now()};
 const academy=f.runtimes.academy;
 academy.settings.raw.sharedAcademySessions=true;
 academy.settings.sharedAcademySessions=true;
 academy.sharedAcademySessions=true;
 const reconcile=async app=>{
  const requestId=crypto.randomUUID();
  let page;
  for(let i=0;i<120;i++){
   page=await offline(app,'reconcileBaselines',{requestId,pageToken:page?.nextPageToken??null});
   if(!page.nextPageToken&&!page.continueApply)break;
  }
  assert.equal(page.applied,true);
 };
 for(const app of apps)await reconcile(app);
 for(const app of ['academy',...apps]){
  await offline(app,'verifyRevocations');
  assert.equal((await offline(app,'publishSharedRegistry')).status,'VERIFIED');
 }
 assert.equal((await offline('academy','publishStudioBaseline',{subject:f.sub})).status,'INSTALLED');
 await reconcile('studio');
 for(const app of ['academy',...apps])f.envs[app].UAA_V111_CUTOVER='active';
}

async function open(f,app) {
 const verifier=opaque(),expectedContext=null;
 const entry=await f.post(app,'/auth/v2/shared-entry/start',{expectedContext,destination:destinations[app],challenge:await s256(verifier)});
 assert.equal(entry.response.status,200,entry.data.code);
 const result=await f.post(app,'/auth/v2/shared-entry',{tx:entry.data.tx,operationId:entry.data.operationId,expectedContext,verifier},entry.data);
 assert.equal(result.response.status,200,result.data.code);
 assert.equal(result.response.headers.getSetCookie().length,2);
 assert.equal(result.data.returnTo,returnPaths[app]);
 return result.data;
}

async function afterSignIn(f,login) {
 const ready=await f.post('academy',runtimePath,{operationId:login.operationId,expectedContext:login.context});
 assert.equal(ready.response.status,200,ready.data.code);
 return ready.data.readiness;
}

test('Academy re-entry automatically refreshes both signed subject baselines and preserves Hifz ownership',async()=>{
 const f=await stage2Fixture();
 try {
  f.databases.hifz.prepare("INSERT INTO reflections(student_id,date,entered_by,reflection,is_private,created_at) VALUES('native-journal','2026-11-20','native-journal','Stage 2 synthetic journal',1,'2026-11-20T12:00:00Z')").run();
  const old=await signIn(f);
  const priorSessions={academy:old};
  for(const app of apps)priorSessions[app]=await open(f,app);
  const renewals={};
  for(const [app,session] of Object.entries(priorSessions)){
   const boot=await f.post(app,'/auth/v2/bootstrap',{purpose:'refresh',expectedContext:session.context});
   assert.equal(boot.response.status,200,boot.data.code);
   assert.ok(boot.data.intent.id);
   renewals[app]=boot.data;
  }
  const oldCookies=Object.fromEntries(['academy',...apps].map(app=>[app,f.jar.header(ORIGINS[app])]));
  const heads=Object.fromEntries(apps.map(app=>[app,f.databases[app].prepare('SELECT * FROM jwt_v2_shared_snapshot_heads').all()]));
  enableStage2(f);
  const intent=await f.post('academy','/auth/v2/bootstrap',{purpose:'logout',expectedContext:old.context});
  const logout=await f.post('academy','/auth/v2/logout',{operationId:intent.data.intent.id,expectedContext:old.context},intent.data);
  assert.equal(logout.response.status,200,logout.data.code);
  const phaseStart=f.trace.length;
  const fresh=await signIn(f);
  assert.equal(fresh.signInReadiness,true);
  assert.equal(fresh.context.ae,old.context.ae+1);
  // Drop one applied response after Studio commits it. The next sign-in
  // readiness request must recover the original receipt without another PIN.
  const studio=f.envs.academy.UAA_V2_PEERS.studio;
  let droppedReceipt=false;
  const studioProofBodies=[];
  f.envs.academy.UAA_V2_PEERS.studio={async fetch(request){
   const carriesProof=new URL(request.url).pathname===peerPath;
   if(carriesProof)studioProofBodies.push(await request.clone().text());
   const response=await studio.fetch(request);
   if(!droppedReceipt&&carriesProof&&response.ok
    &&(await response.clone().json()).status==='APPLIED'){
    droppedReceipt=true;
    throw Error('Synthetic lost Studio acknowledgement');
   }
   return response;
  }};
  const output=[];
  for(let i=0;i<3;i++){
   const state=await afterSignIn(f,fresh);
   output.push(state);
   if(apps.every(app=>state[app]==='APPLIED'))break;
  }
  const deliveries=Object.fromEntries(apps.map(app=>[app,f.databases[app].prepare('SELECT ce,ae,coverage,ordinal FROM jwt_v2_signin_account_proofs').all()]));
  assert.deepEqual(output.at(-1),{studio:'APPLIED',hifz:'APPLIED'},JSON.stringify({output,deliveries,trace:f.trace.slice(-16)}));
  assert.equal(droppedReceipt,true);
  assert.ok(studioProofBodies.length>=2);
  assert.ok(studioProofBodies.every(body=>body===studioProofBodies[0]),'recovery must resend the original bound Studio proof');
  assert.equal(f.trace.slice(phaseStart).filter(row=>row.path==='/auth/v2/pin').length,1);
  assert.deepEqual(output.at(-2),{studio:'PENDING',hifz:'APPLIED'});
  for(const app of apps)assert.deepEqual(f.databases[app].prepare('SELECT * FROM jwt_v2_shared_snapshot_heads').all(),heads[app]);
  for(const app of ['academy',...apps]){
   await assert.rejects(f.runtimes[app].authorise(new Request(ORIGINS[app]+protectedPaths[app],{headers:{Cookie:oldCookies[app]}})));
   const expectedContext=priorSessions[app].context,renewal=renewals[app];
   const replay=await f.dispatch(browserPost(app,'/auth/v2/refresh',
    {operationId:renewal.intent.id,expectedContext,qualifyingActivity:false},
    {csrf:renewal.csrf,cookies:oldCookies[app]}));
   assert.equal(replay.status,401,app+' old refresh replay must be rejected');
   assert.equal((await replay.json()).code,'SESSION_ENDED');
   assert.equal(replay.headers.getSetCookie().length,0,app+' old refresh replay must never issue cookies');
   if(app!=='academy')f.jar.hosts.delete(ORIGINS[app]);
  }
  const dashboard=await f.nativeRequest('/api/academy/hub/read',{kind:'bootstrap',input:{mode:'learn'}},fresh);
  assert.equal(dashboard.response.status,200);
  const cut=f.trace.length;
  for(const app of apps){
   const entry=await open(f,app);
   assert.equal(entry.context.psid,fresh.context.psid);
   const response=await f.request(app,protectedPaths[app]);
   assert.equal(response.status,200);
   if(app==='hifz')assert.match(await response.text(),/Stage 2 synthetic journal/);
  }
  assert.equal((await f.request('hifz','/api/reflections?student_id=somebody-else')).status,403);
  assert.equal(f.databases.hifz.prepare('SELECT student_id FROM reflections').get().student_id,'native-journal');
  assert.equal(f.trace.slice(cut).filter(row=>row.path.startsWith('/internal/')).length,0);

  // A second installed parent can adopt a valid proof for the same account
  // without manufacturing a fresh child acknowledgement.
  f.jar.hosts.delete(ORIGINS.academy);
  f.jar.shared=null;
  const second=await signIn(f);
  assert.notEqual(second.context.psid,fresh.context.psid);
  assert.equal(second.context.ae,fresh.context.ae);
  const adoptionStart=f.trace.length;
  assert.deepEqual(await afterSignIn(f,{...second,operationId:fresh.operationId}),{studio:'PENDING',hifz:'PENDING'});
  assert.deepEqual(await afterSignIn(f,second),{studio:'REUSED',hifz:'REUSED'});
  assert.equal(f.trace.slice(adoptionStart).filter(row=>row.path.startsWith('/internal/auth/')).length,0);
  for(const app of apps)assert.deepEqual(f.databases[app].prepare('SELECT ce,ae,coverage,ordinal FROM jwt_v2_signin_account_proofs').all(),deliveries[app]);
 }finally{f.close();}
});


test('a committed PIN with an uninstalled Academy cookie pair cannot activate Stage 2 readiness',async()=>{
 const f=await stage2Fixture();
 try{
  enableStage2(f);
  const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'pin',loginId:f.loginId,expectedContext:null});
  assert.equal(boot.response.status,200,boot.data.code);
  const attempt={tx:boot.data.tx,attemptId:boot.data.attemptId,operationId:boot.data.intent.id,expectedContext:null};
  const result=await f.dispatch(browserPost('academy','/auth/v2/pin',{...attempt,loginId:f.loginId,pin:'1234'},{csrf:boot.data.csrf}));
  assert.equal(result.status,200);
  assert.equal(result.headers.getSetCookie().length,2);
  const committed=await result.json();
  assert.equal(committed.signInReadiness,true);
  assert.equal(f.jar.header(ORIGINS.academy),'');
  const start=f.trace.length;
  const check=await f.post('academy','/auth/v2/pin/status',attempt,boot.data);
  assert.equal(check.response.status,200,check.data.code);
  assert.equal(check.data.outcome,'COMMITTED_UNCONFIRMED');
  const readiness=await f.post('academy',runtimePath,{operationId:attempt.operationId,expectedContext:committed.context});
  assert.equal(readiness.response.status,401);
  assert.equal(readiness.response.headers.getSetCookie().length,0);
  assert.equal(f.trace.slice(start).filter(row=>row.path.startsWith('/internal/auth/')).length,0);
  for(const app of apps)assert.equal(f.databases[app].prepare('SELECT count(*) AS count FROM jwt_v2_signin_account_proofs').get().count,0);
 }finally{f.close();}
});

test('an interrupted recipient lease can resume while the other recipient stays ready',async()=>{
 const f=await stage2Fixture();
 try {
  enableStage2(f);
  const login=await signIn(f);
  const db=f.databases.academy;
  // Model a Worker interrupted just after persisting its first delivery lease.
  db.prepare("UPDATE jwt_v2_signin_baseline_jobs SET attempts=1,lease_until=? WHERE operation_id=? AND recipient='studio'")
   .run(f.now()+8,login.operationId);
  const start=f.trace.length;
  const waiting=await f.post('academy',runtimePath,{operationId:login.operationId,expectedContext:login.context});
  assert.equal(waiting.response.status,200,waiting.data.code);
  assert.deepEqual(waiting.data.readiness,{studio:'PENDING',hifz:'APPLIED'});
  assert.equal(waiting.data.retryAfterMs,8000);
  assert.equal(f.trace.slice(start).filter(row=>row.app==='studio'&&row.path===peerPath).length,0);
  const hifzEntry=await open(f,'hifz');
  assert.equal(hifzEntry.context.psid,login.context.psid);
  f.advance(8);
  assert.deepEqual(await afterSignIn(f,login),{studio:'APPLIED',hifz:'APPLIED'});
  const studioEntry=await open(f,'studio');
  assert.equal(studioEntry.context.psid,login.context.psid);
  assert.deepEqual(db.prepare('SELECT recipient,attempts FROM jwt_v2_signin_baseline_jobs WHERE operation_id=? ORDER BY recipient')
   .all(login.operationId).map(row=>({...row})),[{recipient:'hifz',attempts:1},{recipient:'studio',attempts:2}]);
 }finally{f.close();}
});

test('the existing signed fixed-origin transport works without a fixture-only binding map',async()=>{
 const f=await stage2Fixture();
 const original=globalThis.fetch;
 try {
  enableStage2(f);
  delete f.envs.academy.UAA_V2_PEERS;
  const requested=new Set();
  globalThis.fetch=async request=>{
   const url=new URL(request.url);
   assert([ORIGINS.studio,ORIGINS.hifz].includes(url.origin));
   assert.equal(url.pathname,peerPath);
   assert.equal(request.redirect,'manual');
   assert(request.headers.has('X-UAA-Service-Signature'));
   assert.equal(request.headers.has('Cookie'),false);
   requested.add(url.origin);
   return f.dispatch(request);
  };
  const login=await signIn(f);
  assert.deepEqual(await afterSignIn(f,login),{studio:'APPLIED',hifz:'APPLIED'});
  assert.deepEqual(requested,new Set([ORIGINS.studio,ORIGINS.hifz]));
 }finally{globalThis.fetch=original;f.close();}
});

test('a gap beyond the sign-in replay budget fails closed and recovers through signed stream reconciliation',async()=>{
 const f=await stage2Fixture();
 try {
  enableStage2(f);
  // Model a recipient that missed multiple authenticated Academy sign-outs
  // while paused. Each cutoff is created by the real browser operation.
  for(let i=0;i<5;i++){
   const account=await signIn(f);
   const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'logout',expectedContext:account.context});
   const logout={operationId:boot.data.intent.id,expectedContext:account.context};
   let end=await f.post('academy','/auth/v2/logout',logout,boot.data);
   if(end.data.code==='LOGOUT_PUBLICATION_PENDING'){
    assert.equal(end.response.status,503);
    assert.equal(end.response.headers.getSetCookie().length,0);
    end=await f.post('academy','/auth/v2/logout',logout,boot.data);
   }
   assert.equal(end.response.status,200,end.data.code);
  }
  const fresh=await signIn(f);
  for(let i=0;i<3;i++)assert.deepEqual(await afterSignIn(f,fresh),{studio:'PENDING',hifz:'PENDING'});
  for(const app of apps){
   const verifier=opaque(),expectedContext=null;
   const entry=await f.post(app,'/auth/v2/shared-entry/start',{expectedContext,destination:destinations[app],challenge:await s256(verifier)});
   const denied=await f.post(app,'/auth/v2/shared-entry',
    {tx:entry.data.tx,operationId:entry.data.operationId,expectedContext,verifier},entry.data);
   assert.equal(denied.response.status,503);
   assert.equal(denied.data.code,'CHILD_AUTHORITY_PENDING');
   assert.equal(denied.response.headers.getSetCookie().length,0);
   await installOwnedBaseline(f,app);
   const session=await open(f,app);
   assert.equal(session.context.psid,fresh.context.psid);
  }
 }finally{f.close();}
});

test('Studio scopes fresh Tafseer rights and loads an authorised Course on the same session',async()=>{
 const f=await stage2Fixture();
 try{
  f.envs.studio.STUDIO_SCOPED_SESSION_RIGHTS='1';
  const db=f.databases.studio;
  for(const [offering,kind] of [['scoped-tafseer','TAFSEER'],['scoped-mothers','TAFSEER']]){
   db.prepare("INSERT INTO offerings VALUES(?,?,?,1,1)").run(offering,kind,offering);
   db.prepare("INSERT INTO source_access_scopes VALUES(?,'ACADEMY',1,1,1,1,'UTC','[]')").run(offering);
   db.prepare("INSERT INTO source_access_people VALUES(?,?,1,1,?,1,'[]',1,0)").run(f.sub,offering,f.now()*1000);
  }
  db.prepare("INSERT INTO programme_offerings VALUES('mothers','scoped-mothers','MONTHLY')").run();
  for(const offering of ['scoped-tafseer','scoped-mothers']){
   db.prepare("INSERT INTO paid_months VALUES(?,?,'2026-11','native-class','Synthetic paid month')").run(f.sub,offering);
  }
  db.prepare("UPDATE participation SET enrolled=0,live=0,purchased=1 WHERE account_id=? AND offering_id='native-course'").run(f.sub);
  for(const [asset,offering] of [['scope-paid','scoped-tafseer'],['scope-retained','native-course'],['scope-denied','scoped-tafseer'],['scope-mothers','scoped-mothers']]){
   db.prepare("INSERT INTO objects VALUES(?,NULL,'video/mp4','Synthetic recording',0,'fixture',?)").run(asset,asset);
   db.prepare("INSERT INTO attachments VALUES(?,?,NULL,?,'lesson',?,'native-class','Synthetic recording','RECORDING',1)").run(asset,offering,asset,asset==='scope-denied'?'2026-10-20':'2026-11-20');
  }
  const login=await signIn(f);
  const entry=await open(f,'studio');
  const req=()=>new Request(ORIGINS.studio+'/api/me',{headers:{Cookie:f.jar.header(ORIGINS.studio)}});
  const runtime=f.runtimes.studio,initial=await runtime.authorise(req());
  assert.equal(initial.binding.sid,entry.context.sid);
  assert.equal(initial.rights.programme,'tafseer');
  assert.deepEqual(initial.rights.scopes.map(row=>row.offering_id),['scoped-tafseer']);
  assert.equal(initial.rights.nativeAuthority.tables.participation.rows.some(row=>row.offering_id==='native-course'),false);
  const first=await f.request('studio','/api/media/scope-paid');
  assert.equal(first.status,200,await first.clone().text());
  const unknown=await f.request('studio','/api/media/scope-denied');
  assert.ok([403,404].includes(unknown.status));
  const verifier=opaque(),expectedContext=entry.context;
  const start=await f.post('studio','/auth/v2/shared-entry/start',{expectedContext,destination:'courses',challenge:await s256(verifier)});
  assert.equal(start.response.status,200,start.data.code);
  const warm=await f.post('studio','/auth/v2/shared-entry',{tx:start.data.tx,operationId:start.data.operationId,expectedContext,verifier},start.data);
  assert.equal(warm.response.status,200,warm.data.code);
  assert.equal(warm.data.context.sid,entry.context.sid);
  assert.equal(warm.response.headers.getSetCookie().length,0);
  const retained=await f.request('studio','/api/media/scope-retained');
  assert.equal(retained.status,200,await retained.clone().text());
  assert.equal((await retained.json()).videoId,'scope-retained');
  assert.equal((await f.request('studio','/api/media/scope-retained')).status,200);
  const scope=await runtime.programmeCapability(await runtime.authorise(req()),'courses','native-course');
  assert.equal(scope.binding.sid,entry.context.sid);
  assert.equal(scope.rights.programme,'courses');
  assert.deepEqual(scope.rights.scopes.map(row=>row.offering_id),['native-course']);
  assert.equal((await runtime.authorise(req())).rights.programme,'tafseer');
  assert.equal(warm.data.context.psid,login.context.psid);
  const mothers=await f.request('studio','/api/media/scope-mothers');
  assert.equal(mothers.status,200,await mothers.clone().text());
  const loadedMothers=await runtime.programmeCapability(await runtime.authorise(req()),'mothers','scoped-mothers');
  assert.deepEqual(loadedMothers.rights.scopes.map(row=>row.offering_id),['scoped-mothers']);
  const [dependency]=runtime.settings.dependenciesFor(login.context.sub);
  db.prepare('UPDATE jwt_v2_dependencies SET revision=revision+1 WHERE id=? AND scope=?').run(dependency.id,dependency.scope);
  const prior=await runtime.authorise(req());
  await assert.rejects(runtime.programmeCapability(prior,null),error=>error.code==='PERMISSIONS_REFRESH_REQUIRED');
 }finally{f.close();}
});
