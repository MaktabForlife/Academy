import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac,randomBytes} from 'node:crypto';
import {setupContract} from '../tools/jwt-feature-setup-contract.mjs';
import {createJWTFeatureSetupAPI} from '../src/academy/jwt-feature-setup.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable GitHub only');
const c=setupContract({source:process.env.GITHUB_SHA,databaseIds:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']}).contract,api=createJWTFeatureSetupAPI(c);
const origin='https://feature_worker.maktab4life.workers.dev';
function fixture(){
 const key=randomBytes(32),now=Math.floor(Date.now()/1000),count={pin:0,rpc:0,db:0};const db=()=>({withSession(){count.db++;throw Error('UNEXPECTED_DB');}});
 const env={ENVIRONMENT:'feature',ACADEMY_DEPLOYMENT_KIND:'ISOLATED_PREVIEW',ACADEMY_D1_MODE:'PAUSED',JWT_FEATURE_SETUP_MODE:'BOOTSTRAP_ONLY',JWT_FEATURE_SETUP_SOURCE:c.source,JWT_FEATURE_SETUP_MANIFEST:c.manifestHash,JWT_FEATURE_SETUP_ISSUED_AT:String(now),JWT_FEATURE_SETUP_EXPIRES_AT:String(now+300),JWT_FEATURE_SETUP_AUTH:key.toString('base64url'),JWT_V110_NATIVE_RUN_ID:c.sourceDigest,JWT_V110_OBJECT_NAMESPACE:c.objectNamespace,JWT_V110_STORAGE_PROFILE:'FRESH_PAIR_V1',ACADEMY_D1_RUN_ID:'0'.repeat(64),ACADEMY_DB:db(),ACADEMY_ADMIN_DB:db(),JWT_V110_CORE_DB:db(),JWT_V110_ADMIN_DB:db(),JWT_V110_SPLIT_COORDINATOR:{getByName(){count.rpc++;throw Error('UNEXPECTED_RPC');}},JWT_V110_MASTER:'0',JWT_V110_REFRESH:'0',JWT_V110_BROWSER:'0',JWT_V110_NATIVE_COOKIE:'0'};
 Object.defineProperty(env,'JWT_FEATURE_SETUP_PIN',{enumerable:true,get(){count.pin++;throw Error('UNEXPECTED_PIN');}});
 function request({path='/internal/feature-jwt-setup/execute',method='POST',host=origin,headers={},body}={}){
  const stamp=Math.floor(Date.now()/1000),nonce=randomBytes(32).toString('base64url');
  const packet=JSON.stringify(['jwt-feature-private-setup-v1',c.planId,c.source,c.manifestHash,c.accountId,method,path,Number(env.JWT_FEATURE_SETUP_ISSUED_AT),Number(env.JWT_FEATURE_SETUP_EXPIRES_AT),stamp,nonce]);
  return new Request(host+path,{method,headers:{'X-JWT-Setup-Time':String(stamp),'X-JWT-Setup-Nonce':nonce,'X-JWT-Setup-Source':c.source,'X-JWT-Setup-Manifest':c.manifestHash,'X-JWT-Setup-Proof':createHmac('sha256',key).update(packet).digest('base64url'),...headers},...(body===undefined?{}:{body,duplex:'half'})});
 }
 return {env,count,request};
}
for(const [label,change,request,status] of [
 ['unsigned',()=>{},()=>new Request(origin+'/internal/feature-jwt-setup/execute',{method:'POST'}),403],
 ['wrong source',()=>{},x=>x.request({headers:{'X-JWT-Setup-Source':'f'.repeat(40)}}),403],
 ['wrong manifest',()=>{},x=>x.request({headers:{'X-JWT-Setup-Manifest':'f'.repeat(64)}}),403],
 ['wrong proof',()=>{},x=>x.request({headers:{'X-JWT-Setup-Proof':randomBytes(32).toString('base64url')}}),403],
 ['malformed nonce',()=>{},x=>x.request({headers:{'X-JWT-Setup-Nonce':'no'}}),403],
 ['stale request',()=>{},x=>x.request({headers:{'X-JWT-Setup-Time':'1000000000'}}),403],
 ['expired setup',e=>{e.JWT_FEATURE_SETUP_ISSUED_AT=String(Math.floor(Date.now()/1000)-500);e.JWT_FEATURE_SETUP_EXPIRES_AT=String(Math.floor(Date.now()/1000)-1);},x=>x.request(),403],
 ['wrong host',()=>{},x=>x.request({host:'https://ummabbadacademy.app'}),403],
 ['nonempty signed body',()=>{},x=>x.request({body:'{}'}),403],
 ['wrong method',()=>{},x=>x.request({method:'GET'}),405],
 ['nonFeature',e=>e.ENVIRONMENT='production',x=>x.request(),403],
 ['active old API',e=>e.ACADEMY_D1_MODE='ACTIVE',x=>x.request(),403],
 ['enabled JWT flag',e=>e.JWT_V110_MASTER='1',x=>x.request(),403],
 ['same raw binding',e=>e.JWT_V110_CORE_DB=e.ACADEMY_DB,x=>x.request(),503],
 ['old run',e=>e.JWT_V110_NATIVE_RUN_ID=e.ACADEMY_D1_RUN_ID,x=>x.request(),403],
 ['ordinary private route',()=>{},x=>new Request(origin+'/api/account/session'),503]
])test('zero D1/RPC/PIN rejection: '+label,async()=>{const x=fixture();change(x.env);const r=await api.fetch(request(x),x.env);assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('set-cookie'),null);assert.deepEqual(x.count,{pin:0,rpc:0,db:0});});
test('public contract rejects protected/reused IDs and credential-literal template',()=>{
 for(const change of [x=>x.databaseIds[0]=x.forbiddenIds[0],x=>x.databaseIds[1]=x.databaseIds[0],x=>x.statements.core[0]+='v3$pbkdf2-sha256$']){const x=structuredClone(c);change(x);assert.throws(()=>createJWTFeatureSetupAPI(x));}
});

test('authenticated status receipt is allowlisted and cannot leak an extra private RPC field',async()=>{
 const x=fixture(),sentinel='test-private-field-never-export';
 x.env.JWT_V110_SPLIT_COORDINATOR={getByName(){x.count.rpc++;return {setupStatus:async()=>({state:'VERIFIED',source:c.source,manifestHash:c.manifestHash,sourceDigest:c.sourceDigest,pinHash:sentinel,secret:sentinel})};}};
 const r=await api.fetch(x.request({method:'GET',path:'/internal/feature-jwt-setup/status'}),x.env);
 assert.equal(r.status,200);const body=await r.text();assert.equal(body.includes(sentinel),false);assert.equal(body.includes('pinHash'),false);
 assert.deepEqual(x.count,{pin:0,rpc:1,db:0});assert.equal(r.headers.get('set-cookie'),null);
});
test('status cannot relabel an old immutable claim as a different source',async()=>{
 const x=fixture();x.env.JWT_V110_SPLIT_COORDINATOR={getByName(){return {setupStatus:async()=>({state:'VERIFIED',source:'f'.repeat(40),manifestHash:c.manifestHash,sourceDigest:c.sourceDigest})};}};
 const r=await api.fetch(x.request({method:'GET',path:'/internal/feature-jwt-setup/status'}),x.env);assert.equal(r.status,503);assert.equal((await r.json()).code,'FEATURE_SETUP_UNAVAILABLE');
});

test('signed body EOF delayed past expiry is rejected before PIN, namespace or D1 access',async()=>{
 const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
 try{
  const x=fixture();x.env.JWT_FEATURE_SETUP_EXPIRES_AT=String(Math.floor(clock/1000)+1);
  const body=new ReadableStream({pull(controller){clock+=2000;controller.close();}});
  const r=await api.fetch(x.request({body}),x.env);assert.equal(r.status,503);assert.deepEqual(x.count,{pin:0,rpc:0,db:0});
 }finally{Date.now=realNow;}
});
