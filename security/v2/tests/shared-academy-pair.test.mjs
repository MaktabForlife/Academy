import test from 'node:test';
import assert from 'node:assert/strict';
import {world,signIn} from '../../../backend/tests/fixtures/academy-v111-native-fixture.mjs';
import {canonical} from '../codec.mjs';
import {ORIGINS,ACADEMY_SHARED_COOKIE} from '../tokens.mjs';

const path='/api/academy/hub/read',learn={kind:'bootstrap',input:{mode:'learn'}};
async function sharedWorld(){
 return world({prepareEnvironment:async({env,app})=>{
  if(app!=='academy')return;
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  env.UAA_V2_CONFIG=canonical({...JSON.parse(env.UAA_V2_CONFIG),sharedAcademySessions:true});
  const publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);
  env.UAA_V2_SHARED_ACADEMY_KEYS_JSON=canonical({issuer:ORIGINS.academy,env:'production',purpose:'academy-shared-access',revision:1,currentKid:'shared-acceptance',keys:[{kid:'shared-acceptance',jwk:publicKey}]});
  env.UAA_V2_SHARED_ACADEMY_PRIVATE_JWK=canonical(await crypto.subtle.exportKey('jwk',pair.privateKey));
 }});
}
test('isolated Academy PIN installs the pair and authorises the protected Learn endpoint',async()=>{
 const f=await sharedWorld();
 try{
  let childCalls=0;
  const unavailable={fetch:async()=>{childCalls++;throw Error('Only isolated Academy should be contacted');}};
  Object.assign(f.envs.academy.UAA_V2_PEERS,{studio:unavailable,hifz:unavailable});
  const login=await signIn(f);
  const api=await f.nativeRequest(path,learn,login);
  assert.equal(api.response.status,200,api.data?.code??api.nativeError?.message);
  assert(api.data.dashboard);
  const jar=f.jar.header(ORIGINS.academy).split('; ');
  const access=jar.find(value=>value.startsWith(ACADEMY_SHARED_COOKIE+'='));
  const refresh=jar.find(value=>value.startsWith('__Host-uaa_r='));
  assert(access&&refresh);
  const read=f.runtimes.academy.authorise.bind(f.runtimes.academy);
  const request=cookies=>new Request(ORIGINS.academy+path,{headers:{Cookie:cookies}});
  const cap=await read(request(jar.join('; ')));
  assert.equal(cap.context.sid,login.context.sid);
  assert(cap.rights.nativeState?.roles);
  await assert.rejects(read(request(access)),/ACCESS_REFRESH_REQUIRED/);
  assert.equal(childCalls,0);
  assert.equal(f.jar.header(ORIGINS.studio).startsWith(ACADEMY_SHARED_COOKIE+'='),true);
  assert.equal(f.jar.header(ORIGINS.hifz).includes('__Host-uaa_r='),false);
 }finally{await f.drainNativeBackground();f.close();}
});

test('isolated Academy refresh keeps the original deadline and publishes both sides of the pair fence',async()=>{
 const f=await sharedWorld();
 try{
  const login=await signIn(f),runtime=f.runtimes.academy,bucket=f.buckets.academy;
  const key=runtime.cache.key('security/session/'+login.context.sid),original=await runtime.store.family(login.context.sid);
  const revisions=[];
  const observe=async(name,value)=>{
   if(name!==key)return;
   const control=JSON.parse(value);
   if(control.academyPair)revisions.push({pending:control.academyPair.pendingOperation!==null,generation:control.academyPair.generation});
  };
  bucket.beforePut=observe;
  f.advance(30);
  const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'refresh',expectedContext:login.context});
  assert.equal(boot.response.status,200);
  const renewed=await f.post('academy','/auth/v2/refresh',{operationId:boot.data.intent.id,expectedContext:login.context,qualifyingActivity:true},boot.data);
  assert.equal(renewed.response.status,200,renewed.data.code);
  assert.equal(renewed.data.originalExpiresAtMs,login.originalExpiresAtMs);
  assert.deepEqual(revisions,[{pending:true,generation:original.fingerprint_generation},{pending:false,generation:original.fingerprint_generation+1}]);
  const api=await f.nativeRequest(path,learn,renewed.data);
  assert.equal(api.response.status,200,api.data?.code??api.nativeError?.message);
 }finally{await f.drainNativeBackground();f.close();}
});

test('failed pending pair publication preserves the current refresh until the same operation can commit',async()=>{
 const f=await sharedWorld();
 try{
  const login=await signIn(f),runtime=f.runtimes.academy,bucket=f.buckets.academy;
  const key=runtime.cache.key('security/session/'+login.context.sid);
  const before=await runtime.store.family(login.context.sid);
  bucket.beforePut=async(name,value)=>{
   if(name===key&&JSON.parse(value).academyPair?.pendingOperation)throw Error('Synthetic pending publication interruption');
  };
  f.advance(30);
  const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'refresh',expectedContext:login.context});
  const body={operationId:boot.data.intent.id,expectedContext:login.context,qualifyingActivity:true};
  const failed=await f.post('academy','/auth/v2/refresh',body,boot.data);
  assert.equal(failed.response.status,503);
  assert.equal(failed.response.headers.getSetCookie().length,0);
  const pending=await runtime.store.family(login.context.sid);
  assert.equal(pending.fingerprint_generation,before.fingerprint_generation);
  assert.equal(pending.sv,before.sv);
  bucket.beforePut=null;
  const renewed=await f.post('academy','/auth/v2/refresh',body,boot.data);
  assert.equal(renewed.response.status,200,renewed.data.code);
  assert.equal(renewed.data.context.sv,login.context.sv+1);
 }finally{await f.drainNativeBackground();f.close();}
});

test('failed final pair publication remains closed and cannot emit a successor cookie',async()=>{
 const f=await sharedWorld();
 try{
  const login=await signIn(f),runtime=f.runtimes.academy,bucket=f.buckets.academy;
  const before=await runtime.store.family(login.context.sid),key=runtime.cache.key('security/session/'+login.context.sid);
  bucket.beforePut=async(name,value)=>{
   if(name===key&&JSON.parse(value).academyPair?.generation>before.fingerprint_generation)throw Error('Synthetic final publication interruption');
  };
  f.advance(30);
  const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'refresh',expectedContext:login.context});
  const failed=await f.post('academy','/auth/v2/refresh',{operationId:boot.data.intent.id,expectedContext:login.context,qualifyingActivity:true},boot.data);
  assert.equal(failed.response.status,503);
  assert.equal(failed.response.headers.getSetCookie().length,0);
  assert.equal((await runtime.store.family(login.context.sid)).fingerprint_generation,before.fingerprint_generation+1);
  const read=await f.nativeRequest(path,learn,login);
  assert.equal(read.data.code,'ACADEMY_PAIR_PENDING');
  assert.equal(read.response.headers.getSetCookie().length,0);
 }finally{await f.drainNativeBackground();f.close();}
});

test('Academy Learn uses its cached native programme grants for dashboard visibility and direct opens',async()=>{
 const programmes=[['alimiyah','Aalimiyah'],['reboot','Reboot Your Maktab'],['arabic-intensive','Arabic Intensive']];
 for(const [denied] of programmes){
  const f=await sharedWorld();
  try{
   const db=f.databases.academy,mappings={};
   for(const [key,title] of programmes){
    const id='r11-'+key,activity='PROGRAM:'+id;mappings[key]=id;
    db.prepare("INSERT INTO activities(activity_key,activity_id,kind,name,active,lifecycle,website_visible) VALUES(?,?,'PROGRAM',?,1,'ACTIVE',1)").run(activity,id,title);
    db.prepare("INSERT INTO program_settings(activity_key,timezone) VALUES(?,'Africa/Johannesburg')").run(activity);
    if(key!==denied)db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,?,?,'STUDENT',1,'CONFIRMED')").run('r11-role-'+key,f.sub,activity);
   }
   f.envs.academy.WEBSITE_PLATFORM_NAVIGATION=JSON.stringify(mappings);
   const login=await signIn(f),dashboard=await f.nativeRequest(path,learn,login);
   assert.equal(dashboard.response.status,200);
   assert.deepEqual(dashboard.data.dashboard.programmeNavigation.map(row=>row.navigationKey).sort(),programmes.map(([key])=>key).filter(key=>key!==denied).sort());
   for(const [key] of programmes){
    const result=await f.nativeRequest('/api/academy/hub/open',{navigation:key},login);
    if(key===denied){assert.equal(result.response.status,403);assert.equal(result.data.destination,undefined);}
    else{assert.equal(result.response.status,200,result.data.code);assert.match(result.data.destination,new RegExp('r11-'+key+'/learn$'));}
   }
  }finally{await f.drainNativeBackground();f.close();}
 }
});
