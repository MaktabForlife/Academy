import test from 'node:test';
import assert from 'node:assert/strict';
import {signIn} from '../../../backend/tests/fixtures/academy-v111-native-fixture.mjs';
import {digest,opaque} from '../codec.mjs';
import {serviceFetch} from '../http-service.mjs';
import {s256} from '../ceremonies.mjs';
import {ORIGINS} from '../tokens.mjs';
import {isolatedWorld,installOwnedBaseline,installSyntheticBaseline,installStudioFixtureProjection,prepareHifzBaselineFixture} from './shared-child-entry-fixture.mjs';
import {createNativeHTTPFixture} from './http-native-fixture.mjs';
import {childJourney} from './legacy-child-journey-fixture.mjs';

async function start(f,app,destination,expectedContext=null){
 const verifier=opaque();
 const entry=await f.post(app,'/auth/v2/shared-entry/start',{expectedContext,destination,challenge:await s256(verifier)});
 assert.equal(entry.response.status,200,entry.data.code);
 return {entry,body:{tx:entry.data.tx,operationId:entry.data.operationId,expectedContext,verifier}};
}
test('Hifz admits a shared Academy session locally only after its account projection is verified',async()=>{
 const f=await isolatedWorld();
 try{
  const data=f.databases.hifz;
  const record=data.prepare("INSERT INTO reflections(student_id,date,entered_by,reflection,is_private,created_at) VALUES('native-journal','2026-11-20','native-journal','Existing synthetic entry',1,'2026-11-20T12:00:00Z')").run();
  let upstreamCalls=0;
  f.envs.hifz.UAA_V2_PEERS.academy={async fetch(){upstreamCalls++;throw Error('Academy blocked');}};
  const login=await signIn(f);
  assert.equal((await f.nativeRequest('/api/academy/hub/read',{kind:'bootstrap',input:{mode:'learn'}},login)).response.status,200);
  const {entry,body}=await start(f,'hifz','hifz');
  const pending=await f.post('hifz','/auth/v2/shared-entry',body,entry.data);
  assert.equal(pending.response.status,503);
  assert.equal(pending.data.code,'CHILD_AUTHORITY_PENDING');
  assert.equal(pending.response.headers.getSetCookie().length,0);
  installSyntheticBaseline(f,'hifz',login.context);
  const admitted=await f.post('hifz','/auth/v2/shared-entry',body,entry.data);
  assert.equal(admitted.response.status,200,admitted.data.code);
  assert.equal(admitted.data.context.psid,login.context.psid);
  assert.equal(admitted.data.originalExpiresAtMs,login.originalExpiresAtMs);
  assert.equal(admitted.data.returnTo,'/');
  assert.equal(admitted.response.headers.getSetCookie().length,2);
  const cap=await f.runtimes.hifz.authorise(new Request(ORIGINS.hifz+'/api/reflections',{headers:{Cookie:f.jar.header(ORIGINS.hifz)}}));
  assert.equal(cap.rights.nativeStudentId,'native-journal');
  const journal=await f.request('hifz','/api/reflections');
  assert.equal(journal.status,200);
  assert.match(JSON.stringify(await journal.json()),/Existing synthetic entry/);
  const original=data.prepare('SELECT student_id,reflection FROM reflections WHERE id=?').get(record.lastInsertRowid);
  assert.equal(original.student_id,'native-journal');
  assert.equal(original.reflection,'Existing synthetic entry');
  assert.equal((await f.request('hifz','/api/reflections?student_id=other-synthetic-student')).status,403);
  const duplicate=await f.post('hifz','/auth/v2/shared-entry',body,entry.data);
  assert.equal(duplicate.data.outcome,'SUPERSEDED');
  assert.equal(duplicate.response.headers.getSetCookie().length,0);
  f.jar.shared=null;
  f.advance(30);
  const renew=async context=>{
   const boot=await f.post('hifz','/auth/v2/bootstrap',{purpose:'refresh',expectedContext:context});
   assert.equal(boot.response.status,200);
   return f.post('hifz','/auth/v2/refresh',{operationId:boot.data.intent.id,expectedContext:context,qualifyingActivity:false},boot.data);
  };
  const renewed=await renew(admitted.data.context);
  assert.equal(renewed.response.status,200,renewed.data.code);
  assert.equal(renewed.data.context.sid,admitted.data.context.sid);
  assert.equal(renewed.data.originalExpiresAtMs,admitted.data.originalExpiresAtMs);
  data.prepare("UPDATE jwt_v2_event_streams SET highest_seen=1 WHERE source_app='academy' AND target_app='hifz'").run();
  const pendingRenewal=await renew(renewed.data.context);
  assert.equal(pendingRenewal.response.status,503);
  assert.equal(pendingRenewal.data.code,'CHILD_AUTHORITY_PENDING');
  assert.equal(pendingRenewal.response.headers.getSetCookie().length,0);
  assert.equal(upstreamCalls,0);
 }finally{await f.drainNativeBackground();f.close();}
});

test('Studio uses its installed permission projection for shared-cookie admission with Academy service blocked',async()=>{
 const f=await isolatedWorld();
 try{
  await installStudioFixtureProjection(f);
  const db=f.databases.studio;
  db.prepare("INSERT INTO offerings VALUES('restricted-offer','COURSE','Restricted synthetic course',1,1)").run();
  db.prepare("INSERT INTO source_access_scopes VALUES('restricted-offer','ACADEMY',1,1,1,1,'UTC','[]')").run();
  db.prepare("INSERT INTO participation VALUES(?,'restricted-offer',1,0,0,'native-class')").run(f.sub);
  db.prepare("INSERT INTO source_access_people VALUES(?,'restricted-offer',1,1,?,1,'[]',1,0)").run(f.sub,f.now()*1000);
  for(const [key,offering] of [['granted','native-course'],['restricted','restricted-offer']]){
   db.prepare("INSERT INTO objects VALUES(?,NULL,'video/mp4','Synthetic recording',0,'fixture','fixture-video-id')").run(key);
   db.prepare("INSERT INTO attachments VALUES(?,?,NULL,?,'synthetic-lesson','2026-11-20','native-class','Synthetic recording','RECORDING',1)").run(key,offering,key);
  }
  let upstreamCalls=0;
  f.envs.studio.UAA_V2_PEERS.academy={async fetch(){upstreamCalls++;throw Error('Academy blocked');}};
  const login=await signIn(f);
  assert.equal((await f.nativeRequest('/api/academy/hub/read',{kind:'bootstrap',input:{mode:'learn'}},login)).response.status,200);
  installSyntheticBaseline(f,'studio',login.context);
  const {entry,body}=await start(f,'studio','tafseer');
  const admitted=await f.post('studio','/auth/v2/shared-entry',body,entry.data);
  assert.equal(admitted.response.status,200,admitted.data.code);
  assert.equal(admitted.data.context.psid,login.context.psid);
  assert.equal(admitted.data.returnTo,'/studio/?view=collections&collection=tafseer');
  assert.equal(admitted.response.headers.getSetCookie().length,2);
  const cap=await f.runtimes.studio.authorise(new Request(ORIGINS.studio+'/api/me',{headers:{Cookie:f.jar.header(ORIGINS.studio)}}));
  assert.equal(cap.binding.sub,login.context.sub);
  assert(cap.rights.nativeAuthority?.tables);
  const protectedData=await f.request('studio','/api/me');
  assert.equal(protectedData.status,200);
  assert.equal((await protectedData.json()).accountId,login.context.sub);
  const granted=await f.request('studio','/api/media/granted'),restricted=await f.request('studio','/api/media/restricted');
  assert.equal(granted.status,200,(await granted.clone().json()).code);
  assert.equal((await granted.json()).videoId,'fixture-video-id');
  const denied=await restricted.json();
  assert([403,404].includes(restricted.status),'Unexpected restricted result '+restricted.status+' '+denied.code);
  assert.equal(denied.videoId,undefined);
  assert.equal(upstreamCalls,0);
 }finally{await f.drainNativeBackground();f.close();}
});

for(const app of ['academy','studio','hifz'])test('shared-mode boundary rejects the previously working '+app+' cookie pair before fresh PIN',async()=>{
 const f=await createNativeHTTPFixture({owningRuntimes:true});
 try{
  const root=await signIn(f),login=app==='academy'?root:await childJourney(f,app,{academyContext:root.context}),runtime=f.runtimes[app];
  const protectedRequest=()=>new Request(ORIGINS[app]+'/api/current',{headers:{Cookie:f.jar.header(ORIGINS[app])}});
  assert.equal((await runtime.authorise(protectedRequest())).binding.sid,login.context.sid);
  const boot=await f.post(app,'/auth/v2/bootstrap',{purpose:'refresh',expectedContext:login.context});
  assert.equal(boot.response.status,200);
  if(app==='academy')runtime.sharedAcademySessions=true;
  else{
   runtime.settings.raw.sharedChildEntry={ownerEpoch:'fixture-account-stream',notBefore:f.now()};
   f.jar.hosts.delete(ORIGINS.academy);
  }
  await assert.rejects(runtime.authorise(protectedRequest()),error=>['ACCESS_REFRESH_REQUIRED','SESSION_ENDED'].includes(error.code));
  const renewal=await f.post(app,'/auth/v2/refresh',{operationId:boot.data.intent.id,expectedContext:login.context,qualifyingActivity:false},boot.data);
  assert.equal(renewal.response.status,401);
  assert.equal(renewal.response.headers.getSetCookie().length,0);
  const repeated=await f.post(app,'/auth/v2/refresh',{operationId:boot.data.intent.id,expectedContext:login.context,qualifyingActivity:false},boot.data);
  assert.equal(repeated.response.status,401);
  assert.equal((await runtime.store.family(login.context.sid)).sv,login.context.sv);
 }finally{f.close();}
});

test('the authenticated Academy snapshot installs child account baselines before any PIN is entered',async()=>{
 const f=await isolatedWorld({snapshotSchema:4,prepareAcademy:prepareHifzBaselineFixture});
 try{
  for(const app of ['studio','hifz']){
   assert.equal(f.databases[app].prepare('SELECT count(*) n FROM jwt_v2_shared_account_baselines').get().n,0);
   const page=await installOwnedBaseline(f,app),db=f.databases[app];
   assert.equal(page.schema,4);
   assert.equal(page.recipientApp,app);
   assert.equal(db.prepare('SELECT status FROM jwt_v2_receive_snapshots WHERE snapshot_id=?').get(page.snapshotId).status,'APPLIED');
   const baseline=db.prepare('SELECT ce,ae,snapshot_id FROM jwt_v2_shared_account_baselines WHERE sub=?').get(f.sub);
   assert(baseline,'Expected the signed account baseline for '+app);
   assert.equal(baseline.ce,f.ce);
   assert.equal(baseline.ae,1);
   assert.equal(baseline.snapshot_id,page.snapshotId);
   assert.equal(db.prepare('SELECT count(*) n FROM jwt_v2_families').get().n,0);
  }
  assert.equal(f.trace.filter(row=>row.path==='/auth/v2/pin').length,0);
  f.envs.hifz.UAA_V2_PEERS.academy={async fetch(){throw Error('Academy services are blocked after baseline installation');}};
  const login=await signIn(f);
  const {entry,body}=await start(f,'hifz','hifz');
  const result=await f.post('hifz','/auth/v2/shared-entry',body,entry.data);
  assert.equal(result.response.status,200,result.data.code);
  assert.equal(result.data.context.psid,login.context.psid);
  assert.equal(result.response.headers.getSetCookie().length,2);
 }finally{await f.drainNativeBackground();f.close();}
});

async function renewAcademyShared(f,context){
 const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'refresh',expectedContext:context});
 assert.equal(boot.response.status,200,boot.data.code);
 const result=await f.post('academy','/auth/v2/refresh',{
  operationId:boot.data.intent.id,expectedContext:context,qualifyingActivity:false
 },boot.data);
 assert.equal(result.response.status,200,result.data.code);
 return result.data;
}

for(const [app,destination,protectedPath] of [['studio','tafseer','/api/me'],['hifz','hifz','/api/reflections']]){
 test(app+' replaces a lost pair only with a new intent and a strictly newer Academy token',async()=>{
  const f=await isolatedWorld();
  try{
   if(app==='studio')await installStudioFixtureProjection(f);
   let upstreamCalls=0;
   f.envs[app].UAA_V2_PEERS.academy={async fetch(){upstreamCalls++;throw Error('Unexpected Academy request');}};
   const root=await signIn(f);
   installSyntheticBaseline(f,app,root.context);
   const initial=await start(f,app,destination);
   const finish=attempt=>f.post(app,'/auth/v2/shared-entry',attempt.body,attempt.entry.data);
   const status=attempt=>f.post(app,'/auth/v2/shared-entry/status',attempt.body,attempt.entry.data);
   const admission=await finish(initial);
   assert.equal(admission.response.status,200,admission.data.code);
   assert.equal((await status(initial)).data.outcome,'INSTALLED_CURRENT');

   const runtime=f.runtimes[app];
   const old=await runtime.store.family(admission.data.context.sid);
   const oldHost=new Map(f.jar.hosts.get(ORIGINS[app]));
   const oldRenew=await f.post(app,'/auth/v2/bootstrap',{purpose:'refresh',expectedContext:admission.data.context});
   assert.equal(oldRenew.response.status,200,oldRenew.data.code);
   f.jar.hosts.delete(ORIGINS[app]);

   const unknown=await status(initial);
   assert.equal(unknown.data.outcome,'UNCONFIRMED');
   assert.equal(unknown.response.headers.getSetCookie().length,0);
   const stale=await finish(await start(f,app,destination));
   assert.equal(stale.data.code,'SHARED_ENTRY_RECOVERY_REQUIRED');
   assert.equal(stale.response.headers.getSetCookie().length,0);
   const sameSecond=await renewAcademyShared(f,root.context);
   const sameSecondResult=await finish(await start(f,app,destination));
   assert.equal(sameSecondResult.data.code,'SHARED_ENTRY_RECOVERY_REQUIRED');

   f.advance(1);
   await renewAcademyShared(f,sameSecond.context);
   const accessOnly=new Map([...oldHost].filter(([name])=>name.endsWith('_a')));
   f.jar.hosts.set(ORIGINS[app],accessOnly);
   const stillInstalled=await f.post(app,'/auth/v2/shared-entry/start',{
    destination,expectedContext:null,challenge:await s256(opaque())
   });
   assert.equal(stillInstalled.data.code,'SHARED_CHILD_REFRESH_MISSING');
   assert.equal(stillInstalled.response.headers.getSetCookie().length,0);
   f.jar.hosts.delete(ORIGINS[app]);
   const next=await start(f,app,destination);
   const competing=await start(f,app,destination);
   const results=await Promise.all([finish(next),finish(competing)]);
   const winners=results.filter(result=>result.response.headers.getSetCookie().length>0);
   assert.equal(winners.length,1,JSON.stringify(results.map(result=>result.data)));
   const [replacement]=winners;
   assert.equal(replacement.response.status,200,replacement.data.code);
   assert.equal(replacement.response.headers.getSetCookie().length,2);
   const updated=await runtime.store.family(replacement.data.context.sid);
   assert.notEqual(updated.sid,old.sid);
   for(const key of ['sub','psid','bsid','bv','s_iat','s_exp','idle_until','last_refresh'])assert.equal(updated[key],old[key],key);
   assert.equal((await runtime.store.family(old.sid)).state,'REVOKED');
   assert.equal((await status(initial)).data.outcome,'SUPERSEDED');
   assert.equal((await finish(initial)).response.headers.getSetCookie().length,0);
   assert.equal((await f.request(app,protectedPath)).status,200);

   const currentHost=f.jar.hosts.get(ORIGINS[app]);
   f.jar.hosts.set(ORIGINS[app],oldHost);
   assert.equal((await f.request(app,protectedPath)).status,401);
   const rejected=await f.post(app,'/auth/v2/refresh',{
    operationId:oldRenew.data.intent.id,expectedContext:admission.data.context,qualifyingActivity:false
   },oldRenew.data);
   assert.equal(rejected.response.status,401);
   assert.equal(rejected.response.headers.getSetCookie().length,0);
   f.jar.hosts.set(ORIGINS[app],currentHost);
   assert.equal((await f.request(app,protectedPath)).status,200);
   assert.equal(upstreamCalls,0);
  }finally{await f.drainNativeBackground();f.close();}
 });
}

for(const [app,destination,protectedPath] of [['studio','tafseer','/api/me'],['hifz','hifz','/api/reflections']]){
 test(app+' binds explicit account confirmation to the conflict and the same installed holder',async()=>{
  const f=await isolatedWorld();
  try{
   if(app==='studio')await installStudioFixtureProjection(f);
   const firstRoot=await signIn(f);
   installSyntheticBaseline(f,app,firstRoot.context);
   const initial=await start(f,app,destination);
   const finish=(attempt,confirmed=false)=>f.post(app,'/auth/v2/shared-entry',{
    ...attempt.body,...(confirmed?{confirmAcademyAccount:true}:{})
   },attempt.entry.data);
   const initialChild=await finish(initial);
   assert.equal(initialChild.response.status,200,initialChild.data.code);
   const oldHost=new Map(f.jar.hosts.get(ORIGINS[app]));
   const independentAcademySignIn=async()=>{
    f.jar.shared=null;
    f.jar.hosts.delete(ORIGINS.academy);
    f.advance(1);
    return signIn(f);
   };
   const second=await independentAcademySignIn(),secondShared=f.jar.shared;
   assert.notEqual(second.context.psid,firstRoot.context.psid);
   const entry=await start(f,app,destination,initialChild.data.context);
   const unasked=await finish(entry,true);
   assert.equal(unasked.data.code,'ACCOUNT_SELECTION_REQUIRED');
   assert.equal(unasked.response.headers.getSetCookie().length,0);
   const conflict=await finish(entry);
   assert.equal(conflict.data.code,'ACCOUNT_SELECTION_REQUIRED');
   assert.equal(conflict.response.headers.getSetCookie().length,0);
   assert.equal(conflict.data.context,undefined);

   const third=await independentAcademySignIn();
   assert.notEqual(third.context.psid,second.context.psid);
   const wrongChoice=await finish(entry,true);
   assert.equal(wrongChoice.data.code,'ACCOUNT_SELECTION_REQUIRED');
   assert.equal(wrongChoice.response.headers.getSetCookie().length,0);
   assert.equal((await f.runtimes[app].store.family(initialChild.data.context.sid)).state,'UNLOCKED');

   f.jar.shared=secondShared;
   const confirmed=await finish(entry,true);
   assert.equal(confirmed.response.status,200,confirmed.data.code);
   assert.equal(confirmed.data.context.psid,second.context.psid);
   assert.equal(confirmed.response.headers.getSetCookie().length,2);
   assert.equal((await f.request(app,protectedPath)).status,200);
   f.jar.hosts.set(ORIGINS[app],oldHost);
   assert.equal((await f.request(app,protectedPath)).status,401);
  }finally{await f.drainNativeBackground();f.close();}
 });
}

test('Hifz withholds replacement cookies while retirement publication is pending',async()=>{
 const f=await isolatedWorld();
 try{
  const login=await signIn(f);
  installSyntheticBaseline(f,'hifz',login.context);
  const finish=attempt=>f.post('hifz','/auth/v2/shared-entry',attempt.body,attempt.entry.data);
  const old=await finish(await start(f,'hifz','hifz'));
  assert.equal(old.response.status,200,old.data.code);
  const oldSid=old.data.context.sid;
  const host=new Map(f.jar.hosts.get(ORIGINS.hifz));
  f.jar.hosts.delete(ORIGINS.hifz);
  f.advance(1);
  const renewed=await renewAcademyShared(f,login.context);
  f.buckets.hifz.beforePut=key=>{if(key.endsWith('/'+oldSid))throw Error('Synthetic retirement publication unavailable');};
  const pendingIntent=await start(f,'hifz','hifz');
  const pending=await finish(pendingIntent);
  assert.equal(pending.response.status,503,pending.data.code);
  assert.equal(pending.response.headers.getSetCookie().length,0);
  assert.equal((await f.runtimes.hifz.store.family(oldSid)).state,'REVOKED');
  const work=f.databases.hifz.prepare('SELECT successor_sid,covered FROM jwt_v2_shared_entry_retirements WHERE prior_sid=?').get(oldSid);
  assert.equal(work.covered,0);
  const duplicate=await finish(pendingIntent);
  assert.equal(duplicate.data.outcome,'SUPERSEDED');
  assert.equal(duplicate.response.headers.getSetCookie().length,0);

  f.buckets.hifz.beforePut=null;
  f.advance(1);
  await renewAcademyShared(f,renewed.context);
  const replaced=await finish(await start(f,'hifz','hifz'));
  assert.equal(replaced.response.status,200,replaced.data.code);
  assert.notEqual(replaced.data.context.sid,work.successor_sid);
  assert.equal(f.databases.hifz.prepare('SELECT count(*) n FROM jwt_v2_shared_entry_retirements WHERE covered=0').get().n,0);
  const nowHost=f.jar.hosts.get(ORIGINS.hifz);
  f.jar.hosts.set(ORIGINS.hifz,host);
  assert.equal((await f.request('hifz','/api/reflections')).status,401);
  f.jar.hosts.set(ORIGINS.hifz,nowHost);
  assert.equal((await f.request('hifz','/api/reflections')).status,200);
 }finally{await f.drainNativeBackground();f.close();}
});

test('a signed shared-key withdrawal ends the directly admitted Studio and Hifz sessions',async()=>{
 const f=await isolatedWorld();
 try{
  await installStudioFixtureProjection(f);
  const login=await signIn(f),academy=f.runtimes.academy;
  const kid=academy.settings.sharedAcademy.kid;
  for(const [app,destination,protectedPath] of [['studio','tafseer','/api/me'],['hifz','hifz','/api/reflections']]){
   installSyntheticBaseline(f,app,login.context);
   const original=await start(f,app,destination);
   const admitted=await f.post(app,'/auth/v2/shared-entry',original.body,original.entry.data);
   assert.equal(admitted.response.status,200,admitted.data.code);
   assert.equal((await f.request(app,protectedPath)).status,200);
   const boot=await f.post(app,'/auth/v2/bootstrap',{purpose:'refresh',expectedContext:admitted.data.context});
   assert.equal(boot.response.status,200,boot.data.code);
   const op=crypto.randomUUID(),event={
    schema:2,env:'production',sourceApp:'academy',targetApp:app,eventId:crypto.randomUUID(),operationId:op,
    stream:'account-security',ownerEpoch:'fixture-account-stream',sequence:1,sub:null,kind:'key-withdrawn',
    target:{type:'key',purpose:'academy-shared-access',kid,registryRevision:2},
    committedAt:f.now(),commitRef:'isolated-owner-withdrawal'
   };
   event.digest=await digest(event);
   const outcome=await serviceFetch(academy,{
    targetApp:app,path:'/internal/auth/v2/events',operationId:op,
    body:{schema:2,env:'production',sourceApp:'academy',targetApp:app,batchId:crypto.randomUUID(),events:[event]}
   });
   assert.equal(outcome.results[0].status,'APPLIED');
   assert.equal((await f.runtimes[app].store.family(admitted.data.context.sid)).state,'REVOKED');
   assert.equal((await f.request(app,protectedPath)).status,401);
   const renewal=await f.post(app,'/auth/v2/refresh',{
    operationId:boot.data.intent.id,expectedContext:admitted.data.context,qualifyingActivity:false
   },boot.data);
   assert.equal(renewal.response.status,401,renewal.data.code);
   assert.equal(renewal.response.headers.getSetCookie().length,0);
   f.jar.hosts.delete(ORIGINS[app]);
   const verifier=opaque();
   const denied=await f.post(app,'/auth/v2/shared-entry/start',{
    destination,expectedContext:null,challenge:await s256(verifier)
   });
   assert.equal(denied.response.status,503);
   assert.equal(denied.data.code,'CHILD_AUTHORITY_PENDING');
   assert.equal(denied.response.headers.getSetCookie().length,0);
  }
 }finally{await f.drainNativeBackground();f.close();}
});

test('Hifz selects a different real Academy fixture account without exposing the old journal',async()=>{
 let subjectB;
 const f=await isolatedWorld({prepareAcademy(_core,_admin,actors){subjectB=actors.studentB;}});
 try{
  const loginA=await signIn(f);
  installSyntheticBaseline(f,'hifz',loginA.context);
  const enteredA=await start(f,'hifz','hifz');
  const childA=await f.post('hifz','/auth/v2/shared-entry',enteredA.body,enteredA.entry.data);
  assert.equal(childA.response.status,200,childA.data.code);
  const db=f.databases.hifz;
  db.prepare("INSERT INTO reflections(student_id,date,entered_by,reflection,is_private,created_at) VALUES('native-journal','2026-11-20','native-journal','Learner A synthetic journal',1,'2026-11-20T12:00:00Z')").run();

  const row=f.databases.academy.prepare('SELECT login_link_id FROM accounts WHERE account_id=?').get(subjectB);
  f.jar.hosts.delete(ORIGINS.academy);
  f.jar.shared=null;
  f.advance(1);
  const loginB=await signIn({...f,loginId:row.login_link_id});
  assert.notEqual(loginA.context.sub,loginB.context.sub);
  db.prepare("INSERT INTO students(id,name,role,created_date,active,login_id) VALUES('second-native-journal','Synthetic second learner','student','2026-11-19',1,'NATIVE2')").run();
  db.prepare("INSERT INTO academy_profile_links(academy_user_id,student_id,source_revision,source_credential_epoch,pin_reset_version) VALUES(?,'second-native-journal',1,?,0)").run(subjectB,loginB.context.ce);
  db.prepare("INSERT INTO reflections(student_id,date,entered_by,reflection,is_private,created_at) VALUES('second-native-journal','2026-11-20','second-native-journal','Learner B synthetic journal',1,'2026-11-20T12:00:00Z')").run();
  db.prepare('INSERT INTO jwt_v2_accounts VALUES(?,?,?,?,1,1)').run(subjectB,loginB.context.ce,loginB.context.ae,0);
  db.prepare('INSERT INTO jwt_v2_shared_account_baselines SELECT ?,?,?,owner_epoch,coverage,snapshot_id FROM jwt_v2_shared_snapshot_heads').run(subjectB,loginB.context.ce,loginB.context.ae);
  const proposed=await start(f,'hifz','hifz',childA.data.context);
  const conflict=await f.post('hifz','/auth/v2/shared-entry',proposed.body,proposed.entry.data);
  assert.equal(conflict.data.code,'ACCOUNT_SELECTION_REQUIRED');
  assert.equal(conflict.response.headers.getSetCookie().length,0);
  assert(!JSON.stringify(conflict.data).includes('Learner A'));
  const chosen=await f.post('hifz','/auth/v2/shared-entry',{...proposed.body,confirmAcademyAccount:true},proposed.entry.data);
  assert.equal(chosen.response.status,200,chosen.data.code);
  assert.equal(chosen.data.context.sub,subjectB);
  const own=await f.request('hifz','/api/reflections');
  assert.equal(own.status,200);
  const entries=JSON.stringify(await own.json());
  assert.match(entries,/Learner B synthetic journal/);
  assert.doesNotMatch(entries,/Learner A synthetic journal/);
  assert.equal((await f.request('hifz','/api/reflections?student_id=native-journal')).status,403);
 }finally{await f.drainNativeBackground();f.close();}
});
