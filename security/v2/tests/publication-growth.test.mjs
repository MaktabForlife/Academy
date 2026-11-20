import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeHTTPFixture} from './http-native-fixture.mjs';
import {restrictionPlan,markSessionCovered} from '../publication.mjs';

async function signIn(f){
 const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'pin',loginId:f.loginId,expectedContext:null});
 assert.equal(boot.response.status,200,JSON.stringify(boot.data));
 const login=await f.post('academy','/auth/v2/pin',{loginId:f.loginId,pin:'1234',tx:boot.data.tx,attemptId:boot.data.attemptId,operationId:boot.data.intent.id,expectedContext:null},boot.data);
 assert.equal(login.response.status,200,JSON.stringify(login.data));return login.data;
}
test('unrelated historical browser revocations do not grow another native session control',async()=>{
 const f=await createNativeHTTPFixture();try{
  const login=await signIn(f),runtime=f.runtimes.academy,sid=login.context.sid;
  for(let i=0;i<500;i++)await runtime.store.batch(await restrictionPlan(runtime.store,{workId:crypto.randomUUID(),target:{type:'browser',bsid:crypto.randomUUID(),maxBv:1},now:f.now()}));
  const published=await runtime.publishFamily(sid);
  assert.equal(published.localState,'UNLOCKED');assert.deepEqual(published.enforcedTargets,[]);
  assert(Buffer.byteLength(JSON.stringify(published))<16384);
  const cap=await runtime.authorise(new Request('https://ummabbadacademy.app/api/current',{headers:{Cookie:f.jar.header('https://ummabbadacademy.app')}}));
  assert.equal(cap.context.sid,sid);
 }finally{f.close();}
});
test('hundreds of same-scope permission changes retain the latest floor and cover every selected workset',async()=>{
 const f=await createNativeHTTPFixture();try{
  const login=await signIn(f),runtime=f.runtimes.academy,sid=login.context.sid,works=[];
  for(let revision=1;revision<=300;revision++){
   const target={type:'dependency',id:'academy:native:role_assignments',ownerEpoch:'fixture-growth',revision,effect:'INVALIDATE',deniedActions:[]},workId=crypto.randomUUID();
   works.push(workId);await runtime.store.batch(await restrictionPlan(runtime.store,{workId,target,sub:f.sub,now:f.now()}));
  }
  const published=await runtime.publishFamily(sid);
  assert.equal(published.authorityReady,false);assert.equal(published.enforcedTargets.length,1);assert.equal(published.enforcedTargets[0].revision,300);
  assert(Buffer.byteLength(JSON.stringify(published))<16384);
  for(const workId of works)await markSessionCovered(runtime.store,{workId,sid,projection:published,controlKey:runtime.store.controlKey('security/session/'+sid),now:f.now()});
  assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM jwt_v2_publications WHERE sid=? AND published_cr IS NULL').get(sid).n,0);
 }finally{f.close();}
});
