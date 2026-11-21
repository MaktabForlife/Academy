import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeHTTPFixture} from './http-native-fixture.mjs';
import {opaque,b64u,sha256} from '../codec.mjs';
import {digestState} from '../ceremonies.mjs';
import {ORIGINS} from '../tokens.mjs';
import {deliverOutbox} from '../outbox.mjs';
import {serviceFetch} from '../http-service.mjs';
import {createBrowserSession} from '../browser-session.mjs';
import {createBrowserDrafts} from '../browser-drafts.mjs';
const browserStorage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),key:i=>[...values.keys()][i]??null,get length(){return values.size;}};};
const client=(f,app,options={})=>createBrowserSession({app,origin:ORIGINS[app],crypto,sessionStorage:browserStorage(),localStorage:browserStorage(),fetch:f.browserFetch(app,options),clock:()=>f.now()*1000,monotonicClock:()=>f.now()*1000,locks:{request:async(name,options,fn)=>fn()},BroadcastChannel:null});
test('actual native Academy PIN sign-in commits a cookie family through Root HTTP',async()=>{
 const f=await createNativeHTTPFixture();try{
 const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'pin',loginId:f.loginId,expectedContext:null});assert.equal(boot.response.status,200,JSON.stringify(boot.data));
 const login=await f.post('academy','/auth/v2/pin',{loginId:f.loginId,pin:'1234',tx:boot.data.tx,attemptId:boot.data.attemptId,operationId:boot.data.intent.id,expectedContext:null},boot.data);assert.equal(login.response.status,200,JSON.stringify(login.data));assert.equal(login.data.context.sub,f.sub);assert.equal(login.data.state,'UNLOCKED');
 }finally{f.close();}
});

async function signin(f){
 const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'pin',loginId:f.loginId,expectedContext:null});assert.equal(boot.response.status,200,JSON.stringify(boot.data));
 const login=await f.post('academy','/auth/v2/pin',{loginId:f.loginId,pin:'1234',tx:boot.data.tx,attemptId:boot.data.attemptId,operationId:boot.data.intent.id,expectedContext:null},boot.data);assert.equal(login.response.status,200,JSON.stringify(login.data));return login.data;
}
async function childJourney(f,app,{purpose='admission',expected=null,academyContext,returnTo='/'}={}){
 const boot=await f.post(app,'/auth/v2/bootstrap',{purpose:purpose+'/start',expectedContext:expected});assert.equal(boot.response.status,200,JSON.stringify(boot.data));
 const state=opaque(),verifier=opaque(),stateHash=await digestState(state),start=await f.post(app,'/auth/v2/'+purpose+'/start',{operationId:boot.data.intent.id,expectedContext:expected,stateHash,challenge:b64u(await sha256(verifier)),callback:ORIGINS[app]+'/auth/v2/'+purpose+'/callback',returnTo},boot.data);assert.equal(start.response.status,200,JSON.stringify(start.data));
 const proceed=await f.post('academy','/auth/v2/bootstrap',{purpose:'admission/proceed',tx:start.data.tx,expectedContext:academyContext});assert.equal(proceed.response.status,200,JSON.stringify(proceed.data));
 let issued;
 if(proceed.data.action==='PIN'){
  const pinBoot=await f.post('academy','/auth/v2/bootstrap',{purpose:'pin',journeyTx:start.data.tx,expectedContext:proceed.data.context});assert.equal(pinBoot.response.status,200,JSON.stringify(pinBoot.data));
  const pin=await f.post('academy','/auth/v2/pin',{journeyTx:start.data.tx,tx:pinBoot.data.tx,attemptId:pinBoot.data.attemptId,operationId:pinBoot.data.intent.id,expectedContext:pinBoot.data.context,pin:'1234'},pinBoot.data);assert.equal(pin.response.status,200,JSON.stringify(pin.data));issued=pin.data;
 }else{
  assert.equal(proceed.data.action,'CONTINUE');const code=await f.post('academy','/auth/v2/admission/start',{tx:proceed.data.tx,operationId:proceed.data.intent.id,expectedContext:proceed.data.context},proceed.data);assert.equal(code.response.status,200,JSON.stringify(code.data));issued=code.data;
 }
 assert.equal(issued.post.tx,start.data.tx);assert.equal(issued.post.stateHash,stateHash);assert.equal(new URL(issued.post.callback).search,'');
 const callback=await f.dispatch(new Request(issued.post.callback,{method:'POST',headers:{Origin:ORIGINS.academy,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({tx:issued.post.tx,stateHash:issued.post.stateHash,code:issued.post.code})}));assert.equal(callback.status,200,await callback.clone().text());assert.equal(callback.headers.getSetCookie().length,0);
 const finalBoot=await f.post(app,'/auth/v2/bootstrap',{purpose:purpose+'/finalize',tx:start.data.tx,observedOperationId:start.data.operationId,expectedContext:expected});assert.equal(finalBoot.response.status,200,JSON.stringify(finalBoot.data));assert.equal(finalBoot.data.intent.id,start.data.operationId);
 const result=await f.post(app,'/auth/v2/'+purpose+'/finalize',{tx:start.data.tx,operationId:start.data.operationId,expectedContext:expected,code:issued.post.code,verifier},finalBoot.data);assert.equal(result.response.status,200,JSON.stringify(result.data));assert.equal(result.data.returnTo,returnTo);return result.data;
}

test('actual Studio and Hifz admission installs independent local cookies and immutable parent expiry',async()=>{
 const f=await createNativeHTTPFixture();try{const academy=await signin(f);
 for(const app of ['studio','hifz']){const local=await childJourney(f,app,{academyContext:academy.context});assert.equal(local.state,'UNLOCKED');assert.equal(local.context.sub,academy.context.sub);assert.equal(local.context.psid,academy.context.psid);assert.notEqual(local.context.sid,academy.context.sid);assert.equal(local.originalExpiresAtMs,academy.originalExpiresAtMs);assert.equal(local.validationDeadlineMs-local.serverNowMs,900000);}
 }finally{f.close();}
});

test('Studio retains Academy programme selections through the complete native handoff with default return settings',async()=>{
 for(const [app,returnTo] of [['studio','/studio/?view=collections&collection=tafseer'],['studio','/studio/?classroom=mothers'],['studio','/studio/?view=collections&collection=courses'],['hifz','/']]){
  const f=await createNativeHTTPFixture({prepareEnvironment({env}){
   const config=JSON.parse(env.UAA_V2_CONFIG);
   delete config.returns;
   env.UAA_V2_CONFIG=JSON.stringify(config);
  }});
  try{
   const academy=await signin(f);
   const local=await childJourney(f,app,{academyContext:academy.context,returnTo});
   assert.equal(local.state,'UNLOCKED');
   assert.equal(local.context.psid,academy.context.psid);
  }finally{f.close();}
 }
});

test('all three actual app refreshes retain original seven-day expiry and warm authorization uses zero SQL',async()=>{
 const f=await createNativeHTTPFixture();try{
 const sessions={academy:await signin(f)};for(const app of ['studio','hifz'])sessions[app]=await childJourney(f,app,{academyContext:sessions.academy.context});f.advance(30);
 for(const app of ['academy','studio','hifz']){
  const original=sessions[app],boot=await f.post(app,'/auth/v2/bootstrap',{purpose:'refresh',expectedContext:original.context});assert.equal(boot.response.status,200,JSON.stringify(boot.data));
  const rotated=await f.post(app,'/auth/v2/refresh',{operationId:boot.data.intent.id,expectedContext:boot.data.context,qualifyingActivity:false},boot.data);assert.equal(rotated.response.status,200,JSON.stringify(rotated.data));assert.equal(rotated.data.originalExpiresAtMs,original.originalExpiresAtMs);assert.equal(rotated.data.idleUntilMs,original.idleUntilMs);assert.equal(rotated.data.context.sv,original.context.sv+1);
  const before=f.metrics[app].authQueries;const cap=await f.runtimes[app].authorise(new Request(ORIGINS[app]+'/api/current',{headers:{Cookie:f.jar.header(ORIGINS[app])}}));assert.equal(cap.context.sid,rotated.data.context.sid);assert.equal(f.metrics[app].authQueries,before,'warm '+app+' authorization SQL');for(const legacy of f.legacySessionCounts[app])assert.equal(f.databases[app].prepare('SELECT count(*) n FROM '+legacy.table).get().n,legacy.count);
 }
 }finally{f.close();}
});

test('actual child inactivity unlock requires Academy PIN, keeps local SID and restores no time beyond parent expiry',async()=>{
 const f=await createNativeHTTPFixture();try{
 const academy=await signin(f),admitted={};for(const app of ['studio','hifz'])admitted[app]=await childJourney(f,app,{academyContext:academy.context});
 f.advance(5401);
 for(const app of ['studio','hifz']){const old=admitted[app],unlocked=await childJourney(f,app,{purpose:'unlock',expected:old.context,academyContext:academy.context});assert.equal(unlocked.state,'UNLOCKED');assert.equal(unlocked.context.sid,old.context.sid);assert.equal(unlocked.context.sv,old.context.sv+1);assert.equal(unlocked.context.ue,old.context.ue+1);assert.equal(unlocked.originalExpiresAtMs,old.originalExpiresAtMs);assert.equal(unlocked.idleUntilMs,Math.min(unlocked.serverNowMs+5400000,old.originalExpiresAtMs));}
 }finally{f.close();}
});

test('actual native blank PIN setup advances credential epoch before minting a fresh root family',async()=>{
 const f=await createNativeHTTPFixture();try{
 f.databases.academy.prepare('UPDATE account_credentials SET pin_hash=NULL,pin_setup=0,credential_epoch=credential_epoch+1 WHERE account_id=?').run(f.sub);
 const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'pin/setup',loginId:f.loginId,expectedContext:null});assert.equal(boot.response.status,200,JSON.stringify(boot.data));assert.equal(boot.data.setupRequired,true);
 const setup=await f.post('academy','/auth/v2/pin/setup',{loginId:f.loginId,pin:'2468',confirmation:'2468',tx:boot.data.tx,attemptId:boot.data.attemptId,operationId:boot.data.intent.id,expectedContext:null},boot.data);assert.equal(setup.response.status,200,JSON.stringify(setup.data));assert.equal(setup.data.context.ce,f.ce+2);assert.equal(f.databases.academy.prepare('SELECT credential_epoch ce FROM account_credentials WHERE account_id=?').get(f.sub).ce,f.ce+2);assert.equal(setup.data.state,'UNLOCKED');
 }finally{f.close();}
});

test('child logout captures canonical acceptance and actual authenticated delivery revokes both remaining apps',async()=>{
 const f=await createNativeHTTPFixture();try{
 const academy=await signin(f),studio=await childJourney(f,'studio',{academyContext:academy.context}),hifz=await childJourney(f,'hifz',{academyContext:academy.context});
 const boot=await f.post('studio','/auth/v2/bootstrap',{purpose:'logout',expectedContext:studio.context}),logout=await f.post('studio','/auth/v2/logout',{operationId:boot.data.intent.id,expectedContext:studio.context},boot.data);assert.equal(logout.response.status,200,JSON.stringify(logout.data));
 const accepted=f.databases.academy.prepare('SELECT ae FROM jwt_v2_accounts WHERE sub=?').get(f.sub);assert.equal(accepted.ae,academy.context.ae+1);
 assert(['ACCEPTED_PENDING','GLOBAL_APPLIED'].includes(logout.data.outcome),'canonical acceptance must be distinguished from unconfirmed and globally applied: '+JSON.stringify(logout.data));
 const delivered=await deliverOutbox(f.runtimes.academy.store,{now:f.now(),jitter:()=>0,sendAuthenticated:event=>serviceFetch(f.runtimes.academy,{targetApp:event.targetApp,path:'/internal/auth/v2/events',operationId:event.operationId,body:{schema:2,env:'production',sourceApp:'academy',targetApp:event.targetApp,batchId:crypto.randomUUID(),events:[event]}})});
 const logoutRows=f.databases.academy.prepare("SELECT state,target_app,event_json FROM jwt_v2_outbox WHERE json_extract(event_json,'$.operationId')=?").all(boot.data.intent.id);assert.equal(logoutRows.length,2);assert.deepEqual(logoutRows.map(row=>row.target_app).sort(),['hifz','studio']);for(const row of logoutRows){const event=JSON.parse(row.event_json);assert.equal(row.state,'APPLIED');assert.equal(event.kind,'account-revoked');assert.equal(event.target.type,'accountCutoff');assert.equal(event.sub,f.sub);assert.equal(event.target.maxCe,academy.context.ce);assert.equal(event.target.maxAe,academy.context.ae);assert.equal(event.target.reason,'VOLUNTARY_LOGOUT');}assert(delivered.applied>=logoutRows.length);for(const app of ['academy','hifz'])await assert.rejects(f.runtimes[app].authorise(new Request(ORIGINS[app]+'/api/current',{headers:{Cookie:f.jar.header(ORIGINS[app])}})));
 assert.equal((await f.runtimes.hifz.store.family(hifz.context.sid)).state,'REVOKED');
 const fresh=await signin(f);assert.equal(fresh.context.ae,academy.context.ae+1);assert.notEqual(fresh.context.psid,academy.context.psid);for(const app of ['studio','hifz']){const readmitted=await childJourney(f,app,{academyContext:fresh.context});assert.equal(readmitted.context.ae,fresh.context.ae);assert.equal(readmitted.state,'UNLOCKED');}
 }finally{f.close();}
});

test('actual native payload fallback is bounded by committed lease for missing/corrupt/transport payloads',async()=>{
 for(const mode of ['missing','corrupt','payload-transport']){
  const f=await createNativeHTTPFixture();try{const login=await signin(f),runtime=f.runtimes.academy,family=await runtime.store.family(login.context.sid),projection=JSON.parse(family.projection_json),bucket=f.buckets.academy;
   if(mode==='missing')bucket.objects.delete(projection.rightsKey);
   if(mode==='corrupt')bucket.objects.set(projection.rightsKey,{etag:'synthetic-corruption',body:'{}'});
   if(mode==='payload-transport'){const get=bucket.get.bind(bucket);bucket.get=key=>key===projection.rightsKey?Promise.reject(Error('synthetic payload transport loss')):get(key);}
   runtime.rightsMemo.clear();f.advance(20);const cap=await runtime.authorise(new Request(ORIGINS.academy+'/api/current',{headers:{Cookie:f.jar.header(ORIGINS.academy)}}));assert.equal(cap.deadline,family.deadline);assert.equal(cap.binding.vat,JSON.parse(family.binding_json).vat);const after=await runtime.store.family(family.sid);for(const k of ['deadline','vat','idle_until','last_refresh','s_exp','cr'])assert.equal(after[k],family[k]);
  }finally{f.close();}
 }
});

test('native rights withdrawn before a payload miss cannot be reconstructed into old authority',async()=>{
 const f=await createNativeHTTPFixture();try{const login=await signin(f),runtime=f.runtimes.academy,family=await runtime.store.family(login.context.sid),projection=JSON.parse(family.projection_json);f.databases.academy.prepare('UPDATE role_assignments SET active=0 WHERE account_id=?').run(f.sub);f.buckets.academy.objects.delete(projection.rightsKey);runtime.rightsMemo.clear();await assert.rejects(runtime.authorise(new Request(ORIGINS.academy+'/api/current',{headers:{Cookie:f.jar.header(ORIGINS.academy)}})));assert.equal((await runtime.store.family(family.sid)).deadline,family.deadline);}finally{f.close();}
});

test('known session-control loss and full bucket outage cannot use payload fallback to recover authority',async()=>{
 for(const mode of ['control-loss','all-transport']){
  const f=await createNativeHTTPFixture();try{const login=await signin(f),runtime=f.runtimes.academy,bucket=f.buckets.academy;if(mode==='control-loss')bucket.objects.delete(runtime.cache.key('security/session/'+login.context.sid));else bucket.get=async()=>{throw Error('synthetic whole bucket outage');};runtime.rightsMemo.clear();await assert.rejects(runtime.authorise(new Request(ORIGINS.academy+'/api/current',{headers:{Cookie:f.jar.header(ORIGINS.academy)}})));if(mode==='control-loss')assert.equal(bucket.objects.has(runtime.cache.key('security/session/'+login.context.sid)),false);}finally{f.close();}
 }
});

test('actual generated browser control source parses as JavaScript before any browser request',async()=>{
 const f=await createNativeHTTPFixture();try{const response=await f.request('academy','/auth/v2/control.mjs'),source=await response.text();assert.equal(response.status,200);const body=source.replace(/^import[^\n]*\n/,'');assert.doesNotThrow(()=>new (Object.getPrototypeOf(async function(){}).constructor)(body));assert(source.includes('stateHash'));}finally{f.close();}
});

test('delayed ordinary admission and normal-renew reentry preserve their own foreground inactivity clocks',async()=>{
 const f=await createNativeHTTPFixture();try{
 const academy=await signin(f);f.advance(1200);const child=await childJourney(f,'hifz',{academyContext:academy.context});assert.equal(child.idleUntilMs,academy.idleUntilMs);assert.equal(child.originalExpiresAtMs,academy.originalExpiresAtMs);
 f.advance(30);const boot=await f.post('hifz','/auth/v2/bootstrap',{purpose:'refresh',expectedContext:child.context}),renewed=await f.post('hifz','/auth/v2/refresh',{operationId:boot.data.intent.id,expectedContext:child.context,qualifyingActivity:true},boot.data);assert.equal(renewed.response.status,200,JSON.stringify(renewed.data));assert.equal(renewed.data.idleUntilMs,f.now()*1000+5400000);
 f.advance(300);const reentry=await childJourney(f,'hifz',{expected:renewed.data.context,academyContext:academy.context});assert.equal(reentry.idleUntilMs,renewed.data.idleUntilMs);assert.equal(reentry.originalExpiresAtMs,child.originalExpiresAtMs);assert.notEqual(reentry.context.sid,child.context.sid);
 }finally{f.close();}
});

test('actual SDK wrong PIN then fresh entry correct; old issued packet cannot spend another guess or create cookies',async()=>{
 const f=await createNativeHTTPFixture();let oldPacket,oldCSRF;const sdk=client(f,'academy',{inspect:(url,init)=>{if(new URL(url).pathname==='/auth/v2/pin'&&!oldPacket){oldPacket=JSON.parse(init.body);oldCSRF=init.headers.get('X-UAA-CSRF');}}});
 try{
 let wrong;await assert.rejects(sdk.submitPin({loginId:f.loginId,pin:'9999'}),e=>{wrong=e;return ['WRONG_PIN','PIN_PAUSED'].includes(e.code);});
 const pause=wrong.dto?.pausedUntilMs||0;if(pause>f.now()*1000)f.advance(Math.ceil((pause-f.now()*1000)/1000)+1);
 const signed=await sdk.submitPin({loginId:f.loginId,pin:'1234'});assert.equal(signed.state,'UNLOCKED');
 const before=f.databases.academy.prepare('SELECT failures FROM jwt_v2_pin_gates WHERE sub=?').get(f.sub).failures,count=f.databases.academy.prepare('SELECT count(*) n FROM jwt_v2_families').get().n;
 const replay=await f.post('academy','/auth/v2/pin',{...oldPacket,pin:'1234'},{csrf:oldCSRF});assert.notEqual(replay.data.state,'UNLOCKED');assert.equal(replay.response.headers.getSetCookie().length,0);assert.equal(f.databases.academy.prepare('SELECT failures FROM jwt_v2_pin_gates WHERE sub=?').get(f.sub).failures,before);assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM jwt_v2_families').get().n,count);
 }finally{sdk.dispose();f.close();}
});

test('actual native Studio me/program reads and Hifz journal POST/GET/PATCH remain current-context protected',async()=>{
 const f=await createNativeHTTPFixture();try{
 const academy=await signin(f),studio=await childJourney(f,'studio',{academyContext:academy.context}),hifz=await childJourney(f,'hifz',{academyContext:academy.context});
 const studioSDK=client(f,'studio'),hifzSDK=client(f,'hifz');await studioSDK.bootstrap();await hifzSDK.bootstrap();
 let me;try{me=await(await studioSDK.protectedFetch('/api/me')).json();}catch(error){throw Error('Actual Studio /api/me '+JSON.stringify(await error.response?.json()));}assert.equal(me.accountId,f.sub);const program=await studioSDK.protectedFetch('/api/offerings/native-course/media');assert.equal(program.status,200);
 const post=await hifzSDK.protectedFetch('/api/reflections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:'2026-11-19',reflection:'Synthetic native journal',is_private:true})});assert.equal(post.status,200);
 const row=f.databases.hifz.prepare("SELECT * FROM reflections WHERE student_id='native-journal'").get();assert(row);assert.equal(row.is_private,1);
 const patch=await hifzSDK.protectedFetch('/api/reflections',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row.id,reflection:'Deliberate existing-row correction'})});assert.equal(patch.status,200);assert.equal(f.databases.hifz.prepare('SELECT reflection FROM reflections WHERE id=?').get(row.id).reflection,'Deliberate existing-row correction');assert.equal((await hifzSDK.protectedFetch('/api/reflections')).status,200);
 studioSDK.dispose();hifzSDK.dispose();
 }finally{f.close();}
});

test('actual interrupted compound Hifz save retains UNKNOWN and current fresh views without automatic POST replay',async()=>{
 const f=await createNativeHTTPFixture();let sdk;try{
 const academy=await signin(f);await childJourney(f,'hifz',{academyContext:academy.context});sdk=client(f,'hifz');await sdk.bootstrap();
 const rows=new Map(),store={async transaction(mode,fn){const staged=new Map([...rows].map(([id,r])=>[id,structuredClone(r)])),value=await fn({get:async id=>structuredClone(staged.get(id)),all:async()=>[...staged.values()].map(r=>structuredClone(r)),put:async r=>staged.set(r.id,structuredClone(r)),delete:async id=>staged.delete(id)});if(mode==='readwrite'){rows.clear();for(const [id,r]of staged)rows.set(id,r);}return value;}};
 const drafts=createBrowserDrafts({crypto,store,tabId:crypto.randomUUID(),clock:()=>sdk.getServerNowMs(),releaseCapsule:args=>sdk.draftKey(args)});sdk.attachDrafts(drafts);
 const resource='hifz:/sabaq:own',payload={date:'2026-11-19',sabaq_from:'1:1',sabaq_to:'1:2',student_comment:'Synthetic interrupted note',student_comment_private:true};
 const attempt=await drafts.checkpointMutation({resource,method:'POST',payload,context:sdk.getContext()});
 f.envs.hifz.DB.beforeExecute=sql=>{if(/INSERT INTO attendance/i.test(sql))throw Error('Synthetic interruption after journal effects');};
 await assert.rejects(sdk.protectedFetch('/api/sabaq',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}));f.envs.hifz.DB.beforeExecute=null;await drafts.markUnknown(attempt);
 const actual=f.databases.hifz.prepare("SELECT * FROM sabaq_log WHERE student_id='native-journal'").all();assert.equal(actual.length,1);assert.equal(actual[0].student_comment,payload.student_comment);assert.equal(f.databases.hifz.prepare("SELECT count(*) n FROM attendance WHERE student_id='native-journal'").get().n,0);
 assert.equal((await drafts.recoveryMarker(resource)).state,'SAVE_OUTCOME_UNKNOWN');await assert.rejects(drafts.checkpointMutation({resource,method:'POST',payload,context:sdk.getContext()}),{code:'SAVE_OUTCOME_UNKNOWN'});
 const recovered=await drafts.reconcileUnknown(resource,async()=>{const views={};for(const path of ['/api/sabaq','/api/plans','/api/attendance'])views[path]=await(await sdk.protectedFetch(path)).json();return views;});assert.equal(recovered.automaticReplayAllowed,false);assert.equal(recovered.manualRecoveryRequired,true);assert.equal(f.trace.filter(t=>t.app==='hifz'&&t.path==='/api/sabaq'&&t.method==='POST').length,1);
 // The user can deliberately correct the known existing row; this does not replay
 // the original compound POST or prove the absent attendance effect completed.
 const correction=await sdk.protectedFetch('/api/sabaq',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:actual[0].id,student_comment:'Deliberate existing-row correction'})});assert.equal(correction.status,200);assert.equal((await drafts.recoveryMarker(resource)).state,'SAVE_OUTCOME_UNKNOWN');
 }finally{sdk?.dispose();f.close();}
});

test('actual Studio native learner write retains its reviewed Website ownership and commits only a pending enrolment request',async()=>{
 const f=await createNativeHTTPFixture({studioAuthority:'WEBSITE'});let sdk;try{
 const academy=await signin(f);await childJourney(f,'studio',{academyContext:academy.context});sdk=client(f,'studio');await sdk.bootstrap();const requestId=crypto.randomUUID();
 const response=await sdk.protectedFetch('/api/offerings/native-course/enrol',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),requestId,note:'Synthetic native enrolment request'})});assert.equal(response.status,200);const row=f.databases.studio.prepare('SELECT * FROM enrolment_requests WHERE request_id=?').get(requestId);assert.equal(row.requester_id,f.sub);assert.equal(row.state,'PENDING');assert.equal(f.databases.studio.prepare("SELECT purchased FROM participation WHERE account_id=? AND offering_id='native-course'").get(f.sub).purchased,1);
 }finally{sdk?.dispose();f.close();}
});

test('first child admission from locked Academy stays identity-only and one bound PIN unlocks that same SID',async()=>{
 const f=await createNativeHTTPFixture();try{
 const academy=await signin(f);f.advance(5401);const beforePins=f.trace.filter(x=>x.app==='academy'&&x.path==='/auth/v2/pin').length;
 const admitted=await childJourney(f,'hifz',{academyContext:academy.context});assert.equal(f.trace.filter(x=>x.app==='academy'&&x.path==='/auth/v2/pin').length,beforePins);const row=await f.runtimes.hifz.store.family(admitted.context.sid);assert.equal(row.state,'ADMITTED_LOCKED');assert.equal(row.authority_ready,0);const cookies=f.jar.header(ORIGINS.hifz);assert(cookies.includes('__Host-hifz_r='));assert(!cookies.includes('__Host-hifz_a='));
 const unlocked=await childJourney(f,'hifz',{purpose:'unlock',expected:admitted.context,academyContext:academy.context});assert.equal(unlocked.state,'UNLOCKED');assert.equal(unlocked.context.sid,admitted.context.sid);assert.equal(unlocked.originalExpiresAtMs,academy.originalExpiresAtMs);assert.equal(f.trace.filter(x=>x.app==='academy'&&x.path==='/auth/v2/pin').length,beforePins+1);assert.equal((await f.runtimes.academy.store.family(academy.context.sid)).state,'LOCKED');
 }finally{f.close();}
});

test('published local rights withdrawal silently replaces remaining authority on next fresh action without PIN',async()=>{
 const f=await createNativeHTTPFixture();let sdk;try{
 const academy=await signin(f),admitted=await childJourney(f,'studio',{academyContext:academy.context});sdk=client(f,'studio');await sdk.bootstrap();sdk.recordActivity({kind:'keyboard'});const before=await f.runtimes.studio.store.family(admitted.context.sid),pinCalls=f.trace.filter(t=>t.path==='/auth/v2/pin').length;f.advance(10);
 f.databases.studio.prepare("UPDATE participation SET purchased=0 WHERE account_id=? AND offering_id='native-course'").run(f.sub);assert.equal((await f.runtimes.studio.store.family(admitted.context.sid)).authority_ready,0);await f.runtimes.studio.publishFamily(admitted.context.sid);
 const read=await sdk.protectedFetch('/api/me'),provenance=sdk.responseProvenance(read);assert.equal(provenance.renewedFrom.context.sv,before.sv);assert.equal(provenance.context.sv,before.sv+1);const refreshed=await read.json();assert.equal(refreshed.accountId,f.sub);
 const after=await f.runtimes.studio.store.family(admitted.context.sid),saved=JSON.parse(after.projection_json);assert.equal(after.s_exp,before.s_exp);assert.equal(after.idle_until,before.idle_until);assert.equal(after.last_refresh,before.last_refresh);assert.equal(after.sv,before.sv+1);assert.equal(after.authority_ready,1);assert(after.deadline<=f.now()+900);assert.equal(f.trace.filter(t=>t.path==='/auth/v2/pin').length,pinCalls);
 const cap=await f.runtimes.studio.authorise(new Request(ORIGINS.studio+'/api/me',{headers:{Cookie:f.jar.header(ORIGINS.studio)}}));assert.equal(cap.rights.scopes.find(x=>x.offering_id==='native-course').purchased,0);
 }finally{sdk?.dispose();f.close();}
});

test('business proof lasts only the committed lease and warm protected reads at six/thirteen minutes add zero auth SQL',async()=>{
 const f=await createNativeHTTPFixture();let sdk;try{
 const academy=await signin(f);await childJourney(f,'studio',{academyContext:academy.context});sdk=client(f,'studio');const boot=await sdk.bootstrap();assert(boot.businessIntent.expiresAtMs<=Math.min(boot.validationDeadlineMs,boot.idleUntilMs,boot.originalExpiresAtMs));
 const before=f.metrics.studio.authQueries,bootCalls=f.trace.filter(t=>t.app==='studio'&&t.path==='/auth/v2/bootstrap').length;
 f.advance(360);assert.equal((await sdk.protectedFetch('/api/me')).status,200);f.advance(420);assert.equal((await sdk.protectedFetch('/api/me')).status,200);assert.equal(f.metrics.studio.authQueries,before);assert.equal(f.trace.filter(t=>t.app==='studio'&&t.path==='/auth/v2/bootstrap').length,bootCalls);
 await sdk.refresh();const stale=await f.request('studio','/api/me',{csrf:boot.csrfByPurpose.business,expectedContext:sdk.getContext(),headers:{'X-UAA-Business-Intent':boot.businessIntent.id}});assert.equal(stale.status,403);assert.equal((await stale.json()).code,'CSRF_INVALID');
 }finally{sdk?.dispose();f.close();}
});

test('actual Root proceed DTO keeps separate HTTP tx and fixed C19 journey through SDK preparation',async()=>{const f=await createNativeHTTPFixture();let child,academy;try{await signin(f);const calls=[],storage=()=>{const rows=new Map();return {getItem:k=>rows.get(k)||null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k),key:i=>[...rows.keys()][i],get length(){return rows.size;}};},common={crypto,sessionStorage:storage(),localStorage:storage(),locks:{request:async(_name,_options,run)=>run()},BroadcastChannel:null,clock:()=>f.now()*1000,monotonicClock:()=>f.now()*1000};child=createBrowserSession({...common,app:'hifz',origin:ORIGINS.hifz,fetch:f.browserFetch('hifz')});const start=await child.beginAdmission({returnTo:'/'}),journeyTx=new URL(start.navigateUrl).searchParams.get('tx');academy=createBrowserSession({...common,app:'academy',origin:ORIGINS.academy,fetch:f.browserFetch('academy',{inspect:(url,init)=>calls.push({path:new URL(url).pathname,method:init.method})})});const ready=await academy.prepareJourneyAuthority({tx:journeyTx});assert.equal(ready.journeyTx,journeyTx);assert.notEqual(ready.tx,journeyTx);assert(['CONTINUE','PIN'].includes(ready.action));assert(calls.length>0&&calls.every(c=>c.path==='/auth/v2/bootstrap'&&c.method==='POST'));}finally{child?.dispose();academy?.dispose();f.close();}});
