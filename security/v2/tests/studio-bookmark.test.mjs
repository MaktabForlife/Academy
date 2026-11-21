import test from 'node:test';
import assert from 'node:assert/strict';
import {signIn} from '../../../backend/tests/fixtures/academy-v111-native-fixture.mjs';
import {isolatedWorld,installSyntheticBaseline,installStudioFixtureProjection} from './shared-child-entry-fixture.mjs';
import {createBrowserSession} from '../../../../AcademyStudio/security/v2/browser-session.mjs';
import {checkStudioBookmark,resumeStudioBookmark} from '../../../../AcademyStudio/public/v111-session.mjs';
import {studioBookmark} from '../../../../AcademyStudio/security/v2/shared-bookmark.mjs';
import {ORIGINS} from '../tokens.mjs';
import {createBrowserSession as academyBrowserSession} from '../browser-session.mjs';

const lesson='/studio/?website=website-1&edition=published#view=lesson&id=lesson-17';
const recording='/studio/?website=website-1#view=recording&id=recording-17';

test('Studio bookmarks preserve the reader selection and reject ambiguous or unregistered destinations',()=>{
 assert.deepEqual(studioBookmark(lesson),{
  type:'studio-bookmark',website:'website-1',edition:'published',view:'lesson',id:'lesson-17',returnTo:lesson
 });
 assert.equal(studioBookmark(recording).returnTo,recording);
 for(const unregistered of [
  '/studio/?website=one&website=two#view=lesson&id=one',
  '/studio/?website=one&edition=draft#view=lesson&id=one',
  '/studio/?website=one&ignored=1#view=lesson&id=one',
  '/studio/?website=one#view=lesson&view=recording',
  '/studio/?website=one#view=recording&id=1&id=2',
  '/studio/?website=one#view=recording',
  '/studio/?website=one#view=about&id=one',
  '/studio/?website=one#view=lesson&id=%2F',
  '/studio/?website=one#view=lesson&id='+('x'.repeat(81)),
  '/other/?website=one#view=recording&id=one'
 ])assert.throws(()=>studioBookmark(unregistered),{code:'UNREGISTERED_RETURN'});
});

test('a direct Studio bookmark selects the exact reader route before private data and can reuse its local pair',async()=>{
 const f=await isolatedWorld();
 const browserFetch=f.browserFetch('studio');
 const sdk=createBrowserSession({app:'studio',origin:ORIGINS.studio,clock:()=>f.now()*1000,
  BroadcastChannel:null,locks:{request:async(_name,_options,fn)=>fn()},sessionStorage:null,localStorage:null,serviceWorker:null,fetch:browserFetch});
 const fetcher=(path,init)=>browserFetch(ORIGINS.studio+path,init);
 try{
  await installStudioFixtureProjection(f);
  const root=await signIn(f);
  installSyntheticBaseline(f,'studio',root.context);
  let upstream=0;
  f.envs.studio.UAA_V2_PEERS.academy={async fetch(){upstream++;throw Error('Fixture Academy is unavailable');}};
  assert.equal(await checkStudioBookmark(sdk,lesson,{fetcher}),lesson);
  const current=sdk.getContext();
  const row=f.databases.studio.prepare("SELECT payload_json FROM jwt_v2_http_transactions WHERE kind='shared-entry' AND status='COMMITTED'").get();
  assert.deepEqual(JSON.parse(row.payload_json).bookmark,studioBookmark(lesson));
  f.jar.shared=null;
  assert.equal(await checkStudioBookmark(sdk,recording,{fetcher}),recording);
  assert.deepEqual(sdk.getContext(),current);
  assert.equal(f.databases.studio.prepare('SELECT count(*) n FROM jwt_v2_families').get().n,1);
  assert.equal((await sdk.protectedFetch('/api/me')).status,200);
  f.jar.hosts.delete(ORIGINS.academy);
  const replacement=await signIn(f);
  assert.notEqual(replacement.context.psid,root.context.psid);
  await assert.rejects(checkStudioBookmark(sdk,recording,{fetcher}),{code:'ACCOUNT_SELECTION_REQUIRED'});
  assert.equal(f.databases.studio.prepare('SELECT count(*) n FROM jwt_v2_families').get().n,1);
  assert.equal(upstream,0);
 }finally{sdk.dispose();f.close();}
});

for(const expiry of [false,true])test('a locked Academy session returns to the exact Studio bookmark'+(expiry?' after an expired continuation':''),async()=>{
 const f=await isolatedWorld(),options={clock:()=>f.now()*1000,BroadcastChannel:null,
  locks:{request:async(_name,_options,fn)=>fn()},sessionStorage:null,localStorage:null,serviceWorker:null};
 const academy=academyBrowserSession({...options,app:'academy',origin:ORIGINS.academy,fetch:f.browserFetch('academy')});
 const studio=createBrowserSession({...options,app:'studio',origin:ORIGINS.studio,fetch:f.browserFetch('studio')});
 const browserFetch=f.browserFetch('studio'),fetcher=(path,init)=>browserFetch(ORIGINS.studio+path,init);
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 let navigateTo=null;
 const navigate=url=>{navigateTo=url;};
 try{
  await installStudioFixtureProjection(f);
  const prior=await signIn(f);
  installSyntheticBaseline(f,'studio',prior.context);
  f.advance(5401);
  const registration=[];
  f.envs.studio.UAA_V2_PEERS.academy={async fetch(request){
   registration.push({path:new URL(request.url).pathname,keys:Object.keys(await request.clone().json()).sort()});
   return f.dispatch(request);
  }};
  assert.equal(await checkStudioBookmark(studio,recording,{fetcher,storage,navigate}),null);
  const continuation=new URL(navigateTo);
  let tx=continuation.searchParams.get('tx'),state=continuation.hash.slice(1);
  assert.equal(continuation.origin,ORIGINS.academy);
  assert.equal(continuation.pathname,'/auth/v2/shared-return');
  assert.deepEqual(registration,[{path:'/internal/auth/v2/transactions',keys:['callback','challenge','expiresAt','purpose','stateHash','targetApp','tx']}]);
  const page=await f.request('academy',continuation.pathname+continuation.search);
  assert.equal(page.status,200);
  assert(!((await page.text()).includes('recording-17')));
  const before=await f.post('academy','/auth/v2/shared-return',{tx,state});
  assert.equal(before.response.status,401);
  if(expiry){
   f.advance(301);
   const expired=await f.post('academy','/auth/v2/shared-return',{tx,state});
   assert.equal(expired.data.code,'CEREMONY_EXPIRED');
   const callback=ORIGINS.studio+'/auth/v2/shared-entry/callback';
   const old=await f.dispatch(new Request(callback,{method:'POST',headers:{Origin:ORIGINS.academy,'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({tx,state})}));
   assert.equal(old.status,200);
   assert.equal((await old.json()).expired,true);
   await resumeStudioBookmark({tx,state,expired:true},{fetcher,storage,navigate});
   assert.equal(navigateTo,recording);
   assert.equal(await checkStudioBookmark(studio,navigateTo,{fetcher,storage,navigate}),null);
   const renewed=new URL(navigateTo);
   assert.notEqual(renewed.searchParams.get('tx'),tx);
   tx=renewed.searchParams.get('tx');
   state=renewed.hash.slice(1);
  }
  const lock=await academy.bootstrap();
  assert.equal(lock.state,'LOCKED');
  const unlocked=await academy.submitPin({pin:'1234'});
  assert.equal(unlocked.context.sid,prior.context.sid);
  assert.equal(unlocked.originalExpiresAtMs,prior.originalExpiresAtMs);
  const finish=await f.post('academy','/auth/v2/shared-return',{tx,state});
  assert.deepEqual(Object.keys(finish.data.post).sort(),['callback','state','tx']);
  assert.equal(finish.response.headers.getSetCookie().length,0);
  const {callback,...payload}=finish.data.post;
  const rejected=await f.dispatch(new Request(callback,{method:'POST',headers:{Origin:ORIGINS.hifz,'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams(payload)}));
  assert.equal(rejected.status,403);
  assert.equal(rejected.headers.get('Access-Control-Allow-Origin'),null);
  const relay=await f.dispatch(new Request(callback,{method:'POST',headers:{Origin:ORIGINS.academy,'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams(payload)}));
  assert.equal(relay.status,200);
  assert.equal(relay.headers.getSetCookie().length,0);
  assert.equal(relay.headers.get('Access-Control-Allow-Origin'),ORIGINS.academy);
  const result=await relay.json();
  assert.deepEqual(Object.keys(result).sort(),['expired','state','success','tx']);
  const shell=await f.request('studio','/auth/v2/shared-entry/callback');
  const html=await shell.text();
  assert(html.includes('/auth/v2/shared-entry/return.mjs'));
  assert(!html.includes('recording-17'));
  let drop=!expiry;
  let statusChecks=0;
  const fetchWithLostReply=async(path,init)=>{
   const response=await fetcher(path,init);
   if(path==='/auth/v2/shared-entry'&&drop){drop=false;assert.equal(response.status,200);throw Error('Synthetic Studio reply lost');}
   if(path==='/auth/v2/shared-entry/status'){statusChecks++;assert.equal(response.headers.getSetCookie().length,0);}
   return response;
  };
  await resumeStudioBookmark(result,{fetcher:fetchWithLostReply,storage,navigate});
  assert.equal(statusChecks,expiry?0:1);
  assert.equal(navigateTo,recording);
  assert.equal(data.size,0);
  assert.equal((await studio.bootstrap()).state,'UNLOCKED');
  assert.equal((await studio.protectedFetch('/api/me')).status,200);
  assert.equal(registration.length,expiry?2:1);
  assert.equal(f.trace.filter(row=>row.path==='/auth/v2/pin').length,2);
 }finally{academy.dispose();studio.dispose();f.close();}
});
