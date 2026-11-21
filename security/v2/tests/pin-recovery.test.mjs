import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserSession} from '../browser-session.mjs';
import {ORIGINS} from '../tokens.mjs';
import {isolatedWorld} from './shared-child-entry-fixture.mjs';

async function fixture(mode){
 const f=await isolatedWorld(),sent=[];
 let lost=null;
 const browserFetch=f.browserFetch('academy',{after:async(url,response)=>{
  if(new URL(url).pathname!=='/auth/v2/pin'||mode==='dropped-before-send')return response;
  if(mode==='lost-shared')f.jar.shared=null;
  if(mode==='lost-both'&&!lost){
   lost={shared:f.jar.shared,host:f.jar.hosts.get(ORIGINS.academy)};
   f.jar.shared=null;f.jar.hosts.delete(ORIGINS.academy);
  }else if(mode==='lost-both')return response;
  throw Error('Synthetic PIN response lost');
 }});
 const sdk=createBrowserSession({app:'academy',origin:ORIGINS.academy,clock:()=>f.now()*1000,
  BroadcastChannel:null,locks:{request:async(_name,_options,fn)=>fn()},sessionStorage:null,localStorage:null,serviceWorker:null,
  fetch:async(url,init)=>{
   const path=new URL(url).pathname;
   sent.push(path);
   if(path==='/auth/v2/pin'&&mode==='dropped-before-send')throw Error('Synthetic PIN request lost');
   if(path==='/auth/v2/pin/status')assert(!Object.hasOwn(JSON.parse(init.body),'pin'));
   const response=await browserFetch(url,init);
   if(path==='/auth/v2/pin/status')assert.equal(response.headers.getSetCookie().length,0);
   return response;
  }
 });
 return {f,sdk,sent,restoreLateCookies(){f.jar.shared=lost.shared;f.jar.hosts.set(ORIGINS.academy,lost.host);},close(){sdk.dispose();f.close();}};
}

for(const mode of ['lost-body','lost-shared'])test('lost PIN response reconciles the same issued attempt using '+mode,async()=>{
 const fixtureData=await fixture(mode),{f,sdk,sent}=fixtureData;
 try{
  const result=await sdk.submitPin({loginId:f.loginId,pin:'1234'}).catch(error=>{throw Error(JSON.stringify(f.trace),{cause:error});});
  assert.equal(result.state,'UNLOCKED');
  assert.equal(sent.filter(path=>path==='/auth/v2/pin').length,1);
  assert.equal(sent.filter(path=>path==='/auth/v2/pin/status').length,1);
  assert.equal(sent.filter(path=>path==='/auth/v2/refresh').length,mode==='lost-shared'?1:0);
  const lesson=await sdk.protectedFetch('/api/academy/hub/read?request='+encodeURIComponent(JSON.stringify({kind:'bootstrap',input:{mode:'learn'}})));
  assert.equal(lesson.status,200);
  assert.equal(f.databases.academy.prepare('SELECT count(*) AS n FROM jwt_v2_families').get().n,1);
 }finally{fixtureData.close();}
});

test('a PIN request lost before delivery waits for status until its issued attempt expires',async()=>{
 const fixtureData=await fixture('dropped-before-send'),{f,sdk,sent}=fixtureData;
 try{
  await assert.rejects(sdk.submitPin({loginId:f.loginId,pin:'1234'}),{code:'PIN_CHECK_PENDING'});
  await assert.rejects(sdk.checkPinResult(),{code:'PIN_CHECK_PENDING'});
  await assert.rejects(sdk.submitPin({loginId:'different-synthetic-account',pin:'1234'}),{code:'PIN_CHECK_ACCOUNT_CHANGED'});
  await assert.rejects(sdk.submitPin({loginId:f.loginId,pin:'1234'}),{code:'PIN_CHECK_PENDING'});
  assert.equal(sent.filter(path=>path==='/auth/v2/pin').length,1);
  assert.equal(f.databases.academy.prepare('SELECT failures FROM jwt_v2_pin_gates WHERE sub=?').get(f.sub).failures,0);
  f.advance(301);
  await assert.rejects(sdk.checkPinResult(),{code:'FRESH_PIN_REQUIRED'});
  assert.equal(f.databases.academy.prepare('SELECT count(*) AS n FROM jwt_v2_families').get().n,0);
 }finally{fixtureData.close();}
});

test('a lost wrong-PIN reply surfaces the recorded rejection without a second count',async()=>{
 const fixtureData=await fixture('lost-body'),{f,sdk,sent}=fixtureData;
 try{
  await assert.rejects(sdk.submitPin({loginId:f.loginId,pin:'9999'}),{code:'WRONG_PIN'});
  assert.equal(f.databases.academy.prepare('SELECT failures FROM jwt_v2_pin_gates WHERE sub=?').get(f.sub).failures,1);
  assert.equal(sent.filter(path=>path==='/auth/v2/pin').length,1);
  assert.equal(sent.filter(path=>path==='/auth/v2/pin/status').length,1);
  assert.equal(sdk.getState().masked,true);
 }finally{fixtureData.close();}
});

test('a committed PIN result with both cookies lost stays masked and cannot mint a pair from status',async()=>{
 const fixtureData=await fixture('lost-both'),{f,sdk,sent}=fixtureData;
 try{
  await assert.rejects(sdk.submitPin({loginId:f.loginId,pin:'1234'}),{code:'PIN_INSTALLATION_UNCONFIRMED'});
  await assert.rejects(sdk.checkPinResult(),{code:'PIN_INSTALLATION_UNCONFIRMED'});
  assert.equal(sdk.getState().masked,true);
  assert.equal(sdk.getContext(),null);
  assert.equal(f.jar.header(ORIGINS.academy),'');
  assert.equal(sent.filter(path=>path==='/auth/v2/pin').length,1);
  assert.equal(f.databases.academy.prepare('SELECT count(*) AS n FROM jwt_v2_families').get().n,1);
  const restart=await sdk.restartPinCheck();
  assert.equal(restart.outcome,'ATTEMPT_ENDED');
  assert.equal(f.jar.header(ORIGINS.academy),'');
  fixtureData.restoreLateCookies();
  const late=await f.nativeRequest('/api/academy/hub/read',{kind:'bootstrap',input:{mode:'learn'}});
  assert.equal(late.response.status,401);
  const newPin=await sdk.submitPin({loginId:f.loginId,pin:'1234'});
  assert.equal(newPin.state,'UNLOCKED');
  assert.equal(f.databases.academy.prepare("SELECT count(*) AS n FROM jwt_v2_families WHERE state='REVOKED'").get().n,1);
 }finally{fixtureData.close();}
});
