import test from 'node:test';
import assert from 'node:assert/strict';
import {world,signIn,seedStudioAuthoringFixture} from './fixtures/academy-v111-native-fixture.mjs';
import {Bucket} from '../../security/v2/test/helpers.mjs';
import {portalFetch} from '../../security/v2/portal-business.mjs';
import {opaque,canonical} from '../../security/v2/codec.mjs';
const operations=['stage-manifest','stage-page','summary','join','admin-read','admin','admin-cover','source-return'];
async function portalWorld({live=false}={}){
 const key=opaque(),f=await world({studioAuthority:'WEBSITE',prepareEnvironment:({env,app,now})=>{
  if(['academy','studio'].includes(app))env.UAA_V2_PORTAL_RPC_KEYS_JSON=canonical({schema:1,currentKid:'portal-fixture',keys:[{kid:'portal-fixture',key,notBefore:0,notAfter:now+604800,disabled:false,operations}]});
  if(app==='studio'){const bucket=new Bucket();env.CONTENT={put:bucket.put.bind(bucket),get:async key=>{const value=await bucket.get(key);return value?{...value,body:new Response(await value.arrayBuffer()).body}:null;}};}
 }});
 const a=seedStudioAuthoringFixture(f),s=f.databases.academy,t=f.databases.studio;
 if(live){
  s.prepare("UPDATE activities SET lifecycle='ACTIVE' WHERE activity_key=?").run(a.activityKey);
  s.prepare("INSERT INTO course_runs(activity_key,run_id,name,timezone,active) VALUES(?,'portal-live-run','Synthetic live run','UTC',1)").run(a.activityKey);
  s.prepare("INSERT INTO timetable_publications(activity_key,publication_id,scope_key,version_no,pattern,timezone,snapshot_json,source_snapshot_sha256,conversion) VALUES(?,'portal-live-publication','portal-live-run',1,'COURSE','UTC','{}',?,'EXACT')").run(a.activityKey,'a'.repeat(64));
  s.prepare("INSERT INTO course_run_state(activity_key,run_id,stage,current_publication_id) VALUES(?,'portal-live-run','PUBLISHED','portal-live-publication')").run(a.activityKey);
 }
 s.exec('UPDATE website_platform_control SET enabled=1 WHERE singleton=1');
 s.prepare("INSERT INTO website_platform_access_ownership(activity_key,state,updated_at) VALUES(?,'STUDIO',?) ON CONFLICT(activity_key) DO UPDATE SET state='STUDIO'").run(a.activityKey,new Date(f.now()*1000).toISOString());
 t.prepare("UPDATE websites SET published_key='fixture/published' WHERE website_id=?").run(a.websiteId);
 await f.envs.studio.CONTENT.put('public/circles/catalogue.json',canonical({format:'CIRCLES_PUBLIC_CATALOGUE_V1',items:[{key:'native-course',kind:'COURSE',title:'Synthetic native Course',websiteId:a.websiteId,pending:false}]}));
 return {f,a};
}
test('actual Academy portal uses a real Root parent and native Studio business actor without V1 or child sessions',async()=>{
 const {f,a}=await portalWorld();try{
  const login=await signIn(f);
  const result=await f.nativeRequest('/api/admin/platform/studio-access',{activityKey:a.activityKey,command:{action:'course-playlists'}},login,{headers:{'X-Academy-Workspace':'ADMIN'}});
  assert.equal(result.response.status,200,JSON.stringify({data:result.data,nativeError:result.nativeError?.message,trace:f.trace}));
  assert(Array.isArray(result.data.playlists));
  assert.equal(f.databases.studio.prepare('SELECT count(*) n FROM sessions').get().n,0);
  assert.equal(f.databases.studio.prepare('SELECT count(*) n FROM jwt_v2_families').get().n,0);
  assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM website_platform_sessions').get().n,0);
 }finally{f.close();}
});

test('actual Root portal summary checks native published catalogue access and keeps child admission separate',async()=>{
 const {f,a}=await portalWorld();try{
  const login=await signIn(f),result=await f.nativeRequest('/api/academy/hub/read',{kind:'access',input:{websiteIds:[a.websiteId]}},login);
  assert.equal(result.response.status,200,JSON.stringify({data:result.data,error:result.nativeError?.message,trace:f.trace}));
  assert(result.data);
  assert.equal(f.databases.studio.prepare('SELECT count(*) n FROM jwt_v2_families').get().n,0);
 }finally{f.close();}
});
test('real Root portal native options can call Source through a scoped independently checked return proof',async()=>{
 const {f,a}=await portalWorld();try{
  const login=await signIn(f),result=await f.nativeRequest('/api/admin/platform/studio-access',{activityKey:a.activityKey,command:{action:'course-playlist-options'}},login,{headers:{'X-Academy-Workspace':'ADMIN'}});
  assert.equal(result.response.status,200,JSON.stringify({data:result.data,error:result.nativeError?.message,trace:f.trace}));
  assert(f.trace.some(r=>r.path==='/internal/website/portal-return/v2'),'actual Source return path was not exercised');
  assert.equal(f.databases.studio.prepare('SELECT count(*) n FROM sessions').get().n,0);
  assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM website_platform_sessions').get().n,0);
 }finally{f.close();}
});
test('native portal replay and modified MAC are refused by the real receiver',async()=>{
 const {f,a}=await portalWorld();try{
  let saved;const peer=f.envs.academy.UAA_V2_PEERS.studio;f.envs.academy.UAA_V2_PEERS.studio={fetch:async request=>{const body=await request.clone().json();if(body.operation==='admin-read')saved=request.clone();return peer.fetch(request);}};
  const login=await signIn(f),first=await f.nativeRequest('/api/admin/platform/studio-access',{activityKey:a.activityKey,command:{action:'course-playlists'}},login,{headers:{'X-Academy-Workspace':'ADMIN'}});
  assert.equal(first.response.status,200,JSON.stringify(first.data));assert(saved);
  const replay=await f.dispatch(saved.clone());assert.equal(replay.status,401);assert.equal((await replay.json()).code,'PORTAL_NONCE_REUSED');
  const headers=new Headers(saved.headers);headers.set('X-UAA-Portal-MAC',opaque());const forged=await f.dispatch(new Request(saved.url,{method:'POST',headers,body:await saved.text()}));
  assert.equal(forged.status,401);assert.equal((await forged.json()).code,'PORTAL_MAC_INVALID');
 }finally{f.close();}
});

test('Root portal Join uses exactly the requested one of two real native sessions',async()=>{
 const {f,a}=await portalWorld({live:true});try{
  const login=await signIn(f),db=f.databases.studio,now=Date.now();
  for(const [id,url]of [['portal-session-A','https://example.invalid/session-A'],['portal-session-B','https://example.invalid/session-B']])db.prepare('INSERT INTO timetable(session_id,offering_id,title,starts_at,ends_at,zoom_url,cancelled,revision) VALUES(?,?,?,?,?,?,0,1)').run(id,a.offeringId,'Synthetic native session',now-1000,now+600000,url);
  const joined=await f.nativeRequest('/api/academy/hub/studio-join',{offeringId:a.offeringId,sessionId:'portal-session-B'},login);
  assert.equal(joined.response.status,200,JSON.stringify({data:joined.data,error:joined.nativeError?.message,trace:f.trace,completed:db.prepare('SELECT * FROM completed_course_registrations').all(),sessions:db.prepare('SELECT * FROM timetable').all()}));
  assert.equal(joined.data.destination,'https://example.invalid/session-B');
  const wrong=await f.nativeRequest('/api/academy/hub/studio-join',{offeringId:a.offeringId,sessionId:'missing-session'},login);
  assert.equal(wrong.response.status,403);
 }finally{f.close();}
});

test('a valid read delegation cannot be repurposed into Source account creation',async()=>{
 const {f,a}=await portalWorld();try{
  const login=await signIn(f),read=await f.nativeRequest('/api/admin/platform/studio-access',{activityKey:a.activityKey,command:{action:'course-playlists'}},login,{headers:{'X-Academy-Workspace':'ADMIN'}});
  assert.equal(read.response.status,200,JSON.stringify(read.data));
  const row=f.databases.academy.prepare("SELECT * FROM jwt_v2_root_delegations WHERE operation='admin-read' ORDER BY rowid DESC LIMIT 1").get(),binding=JSON.parse(row.binding_json),proof={binding,head:JSON.parse(row.head_json),deadline:Math.floor(login.validationDeadlineMs/1000),expiresAt:row.expires_at,delegationId:row.delegation_id};
  const before=f.databases.academy.prepare('SELECT count(*) n FROM accounts').get().n;
  await assert.rejects(portalFetch(f.runtimes.studio,proof,'source-return',{command:'/internal/website/identity',operationId:crypto.randomUUID(),resource:null,input:{operationId:crypto.randomUUID(),offeringId:a.offeringId,actorId:binding.sub,actorEpoch:binding.ce,displayName:'Must never be provisioned from a read',create:true}}),{code:'PORTAL_IDENTITY_INTENT_REQUIRED'});
  assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM accounts').get().n,before);
 }finally{f.close();}
});

test('Root portal provisions exactly its original native intent and resumes through the real Source coordinator',async()=>{
 const {f,a}=await portalWorld();try{
  const login=await signIn(f),operationId=crypto.randomUUID(),before=f.databases.academy.prepare('SELECT count(*) n FROM accounts').get().n;
  const begin=await f.nativeRequest('/api/admin/platform/studio-access',{activityKey:a.activityKey,command:{action:'provision',input:{operationId,displayName:'Synthetic portal provision'}}},login,{headers:{'X-Academy-Workspace':'ADMIN'}});
  assert.equal(begin.response.status,200,JSON.stringify({data:begin.data,error:begin.nativeError?.message,trace:f.trace}));assert.equal(begin.data.state,'PENDING_IDENTITY');
  const resume=await f.nativeRequest('/api/admin/platform/studio-access',{activityKey:a.activityKey,command:{action:'resume',input:{jobId:operationId}}},login,{headers:{'X-Academy-Workspace':'ADMIN'}});
  assert.equal(resume.response.status,200,JSON.stringify({data:resume.data,error:resume.nativeError?.message,trace:f.trace}));assert.equal(resume.data.state,'COMPLETE');
  assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM accounts').get().n,before+1);
  assert.equal(f.databases.academy.prepare('SELECT display_name FROM accounts WHERE account_id=?').get(resume.data.accountId).display_name,'Synthetic portal provision');
  assert.equal(f.databases.studio.prepare('SELECT enrolled FROM participation WHERE account_id=? AND offering_id=?').get(resume.data.accountId,a.offeringId).enrolled,1);
  assert.equal(f.databases.studio.prepare('SELECT count(*) n FROM sessions').get().n,0);
  assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM website_platform_sessions').get().n,0);
 }finally{f.close();}
});

test('Root portal rejects unsupported account names before a durable provision job is created',async()=>{
 const {f,a}=await portalWorld();try{
  const login=await signIn(f);
  for(const displayName of ['x'.repeat(161),'   ']){
   const operationId=crypto.randomUUID(),reply=await f.nativeRequest('/api/admin/platform/studio-access',{activityKey:a.activityKey,command:{action:'provision',input:{operationId,displayName}}},login,{headers:{'X-Academy-Workspace':'ADMIN'}});
   assert.equal(reply.response.status,400,JSON.stringify(reply.data));
   assert.equal(f.databases.studio.prepare('SELECT count(*) n FROM provisioning WHERE operation_id=?').get(operationId).n,0);
  }
  const operationId=crypto.randomUUID(),accepted=await f.nativeRequest('/api/admin/platform/studio-access',{activityKey:a.activityKey,command:{action:'provision',input:{operationId,displayName:'x'.repeat(160)}}},login,{headers:{'X-Academy-Workspace':'ADMIN'}});
  assert.equal(accepted.response.status,200,JSON.stringify(accepted.data));
  const complete=await f.nativeRequest('/api/admin/platform/studio-access',{activityKey:a.activityKey,command:{action:'resume',input:{jobId:operationId}}},login,{headers:{'X-Academy-Workspace':'ADMIN'}});
  assert.equal(complete.response.status,200,JSON.stringify(complete.data));assert.equal(complete.data.state,'COMPLETE');
 }finally{f.close();}
});

test('concurrent first Root portal reads share coherent Source export progress without mixing packets',async()=>{
 const {f,a}=await portalWorld();try{
  const login=await signIn(f),read=()=>f.nativeRequest('/api/admin/platform/studio-access',{activityKey:a.activityKey,command:{action:'course-playlists'}},login,{headers:{'X-Academy-Workspace':'ADMIN'}});
  const replies=await Promise.all([read(),read()]);
  for(const reply of replies)assert.equal(reply.response.status,200,JSON.stringify({data:reply.data,error:reply.nativeError?.message,trace:f.trace}));
  const row=f.databases.academy.prepare('SELECT * FROM jwt_v2_portal_deliveries WHERE sub=?').get(a.sub),saved=JSON.parse(f.databases.academy.prepare('SELECT manifest_json FROM studio_authority_exports WHERE export_id=?').get(row.export_id).manifest_json),installed=f.databases.studio.prepare('SELECT * FROM studio_source_authority WHERE account_id=?').get(a.sub);
  assert.equal(row.manifest_digest,saved.manifestDigest);assert.equal(row.installed,1);assert.equal(row.next_page,saved.manifest.pageCount);assert.equal(installed.payload_digest,saved.manifest.payloadDigest);assert.equal(installed.source_revision,saved.manifest.revision);
 }finally{f.close();}
});

test('a real reverse Source call stops when its Root is revoked, superseded or its fixed proof expires',async()=>{
 for(const mode of ['revoked','epoch','deadline']){
  const {f,a}=await portalWorld();try{
   const login=await signIn(f),peer=f.envs.studio.UAA_V2_PEERS.academy;let intercepted=0;
   f.envs.studio.UAA_V2_PEERS.academy={fetch:async request=>{
    if(new URL(request.url).pathname==='/internal/website/portal-return/v2'){
     intercepted++;
     if(mode==='revoked')f.databases.academy.prepare("UPDATE jwt_v2_families SET state='REVOKED',cr=cr+1 WHERE sid=?").run(login.context.sid);
     if(mode==='epoch')f.databases.academy.prepare('UPDATE jwt_v2_accounts SET ae=ae+1 WHERE sub=?').run(a.sub);
     if(mode==='deadline')f.advance(11);
    }
    return peer.fetch(request);
   }};
   const reply=await f.nativeRequest('/api/admin/platform/studio-access',{activityKey:a.activityKey,command:{action:'course-playlist-options'}},login,{headers:{'X-Academy-Workspace':'ADMIN'}});
   assert.equal(intercepted,1);assert.notEqual(reply.response.status,200,mode+': '+JSON.stringify(reply.data));
   assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM website_platform_sessions').get().n,0);
   assert.equal(f.databases.studio.prepare('SELECT count(*) n FROM sessions').get().n,0);
  }finally{f.close();}
 }
});

test('slow first explicit Studio access read waits to issue each short Studio proof',async()=>{
 const {f}=await portalWorld();try{
  f.loginId=f.databases.academy.prepare('SELECT login_link_id FROM accounts WHERE account_id=?').get(f.sub).login_link_id;
  const login=await signIn(f),runtime=f.runtimes.academy,capture=runtime.nativeCapture.bind(runtime),peer=f.envs.academy.UAA_V2_PEERS.studio;
  let injected=false,sends=[];
  runtime.nativeCapture=async input=>{
   const result=await capture(input);
   if(!injected){injected=true;f.advance(21);}
   return result;
  };
  f.envs.academy.UAA_V2_PEERS.studio={fetch:async request=>{
   const body=await request.clone().json();
   sends.push({operation:body.operation,issuedAt:body.issuedAt,expiresAt:body.expiresAt,receivedAt:f.now()});
   const response=await peer.fetch(request);
   if(body.operation==='stage-manifest'||body.operation==='stage-page')f.advance(6);
   return response;
  }};
  const reply=await f.nativeRequest('/api/academy/hub/read',{kind:'access',input:{}},login);
  assert(injected);
  assert.equal(reply.response.status,200,JSON.stringify({code:reply.data?.code,forwarded:sends.length}));
  assert(Array.isArray(reply.data.websites));
  assert(sends.some(x=>x.operation==='stage-manifest')&&sends.some(x=>x.operation==='stage-page')&&sends.some(x=>x.operation==='summary'));
  assert(sends.every(x=>x.expiresAt-x.issuedAt===10&&x.receivedAt<x.expiresAt));
  assert(new Set(sends.map(x=>x.issuedAt)).size>1);
 }finally{await f.drainNativeBackground();f.close();}
});

test('a revoked Academy session cannot issue the next cold Studio proof',async()=>{
 const {f}=await portalWorld();try{
  f.loginId=f.databases.academy.prepare('SELECT login_link_id FROM accounts WHERE account_id=?').get(f.sub).login_link_id;
  const login=await signIn(f),peer=f.envs.academy.UAA_V2_PEERS.studio,sends=[];
  f.envs.academy.UAA_V2_PEERS.studio={fetch:async request=>{
   const {operation}=await request.clone().json();sends.push(operation);
   const response=await peer.fetch(request);
   if(operation==='stage-manifest')f.databases.academy.prepare("UPDATE jwt_v2_families SET state='REVOKED',cr=cr+1 WHERE sid=?").run(login.context.sid);
   return response;
  }};
  const reply=await f.nativeRequest('/api/academy/hub/read',{kind:'access',input:{}},login);
  assert.deepEqual(sends,['stage-manifest']);
  assert(reply.response.status>=400);
  assert.equal(f.databases.studio.prepare('SELECT count(*) n FROM studio_source_authority').get().n,0);
 }finally{await f.drainNativeBackground();f.close();}
});

test('Academy bootstrap and dashboard refresh return checked app links without calling either child',async()=>{
 for(const eligible of [true,false]){
  const {f}=await portalWorld();try{
   const db=f.databases.academy,activityKey='PROGRAM:dashboard-hifz';
   db.prepare("INSERT INTO activities(activity_key,activity_id,kind,name,active,lifecycle,website_visible) VALUES(?,'dashboard-hifz','PROGRAM','Synthetic Hifz',1,'ACTIVE',1)").run(activityKey);
   db.prepare("INSERT INTO program_settings(activity_key,timezone) VALUES(?,'Africa/Johannesburg')").run(activityKey);
   if(eligible)db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('dashboard-hifz-student',?,?,'STUDENT',1,'CONFIRMED')").run(f.sub,activityKey);
   db.prepare('INSERT INTO website_platform_admissions(account_id,active) VALUES(?,?)').run(f.sub,Number(eligible));
   f.envs.academy.WEBSITE_PLATFORM_NAVIGATION=JSON.stringify({hifz:'dashboard-hifz'});
   f.loginId=db.prepare('SELECT login_link_id FROM accounts WHERE account_id=?').get(f.sub).login_link_id;
   let childCalls=0;
   const unavailable={fetch:async()=>{childCalls++;throw Error('Child unreachable');}};
   Object.assign(f.envs.academy.UAA_V2_PEERS,{studio:unavailable,hifz:unavailable});
   const login=await signIn(f);
   const initial=await f.nativeRequest('/api/academy/hub/read',{kind:'bootstrap',input:{mode:'learn'}},login);
   const refresh=await f.nativeRequest('/api/academy/hub/read',{kind:'dashboard',input:{mode:'learn',refresh:true}},login);
   const navigation=await f.nativeRequest('/api/academy/hub/read',{kind:'navigation',input:{}},login);
   const links=eligible?{academia:[],studio:'/studio/',tafseer:'/studio/?view=collections&collection=tafseer',mothers:false,hifz:'https://mahadarwa-hifz.ummabbadacademy.app/'}:{academia:[],studio:null,tafseer:null,mothers:false,hifz:null};
   for(const result of [initial,refresh,navigation])assert.equal(result.response.status,200,JSON.stringify({data:result.data,error:result.nativeError?.message}));
   assert.deepEqual(initial.data.navigation,links);
   assert.deepEqual(initial.data.dashboard.entryLinks,links);
   assert.deepEqual(refresh.data.entryLinks,links);
   assert.deepEqual(navigation.data,links);
   assert.equal(childCalls,0);
  }finally{await f.drainNativeBackground();f.close();}
 }
});
