import test from 'node:test';import assert from 'node:assert/strict';
import {world,signIn} from './fixtures/academy-v111-native-fixture.mjs';
import {academyPaidGridDraftGuard} from '../../security/v2/academy-paid-grid-resources.mjs';
import {b64u,bytes,canonical} from '../../security/v2/codec.mjs';
const origin='https://ummabbadacademy.app';
async function fixture(){let target;const f=await world({prepareAcademy(db){
 target=db.prepare("SELECT m.activity_key,m.class_id,m.account_id FROM class_memberships m JOIN activities a USING(activity_key) WHERE a.kind='PROGRAM' AND a.active=1 AND a.lifecycle='ACTIVE' ORDER BY m.activity_key,m.account_id LIMIT 1").get();assert(target,'actual native participant prerequisite');
 db.prepare("UPDATE activities SET name='Tafseer' WHERE activity_key=?").run(target.activity_key);
 db.prepare("INSERT INTO program_monthly_media_policies(activity_key,enabled,revision,updated_at,updated_by_account_id) VALUES(?,0,1,?,'sep-global') ON CONFLICT(activity_key) DO UPDATE SET enabled=0").run(target.activity_key,new Date().toISOString());
 },prepareEnvironment({env,app}){if(app==='academy'){env.ACADEMY_MONTHLY_SUBSCRIPTIONS='1';env.ACADEMY_SURAH_GRANTS='1';}}});f.loginId='separation-global';return {f,target};}
async function capFor(f){const login=await signIn(f),runtime=f.runtimes.academy,cap=await runtime.authorise(new Request(origin+'/api/account/session',{headers:{Origin:origin,Cookie:f.jar.header(origin),'X-UAA-Request':'2','X-UAA-Expected-Context':b64u(bytes(canonical(login.context)))}}));return {login,cap};}
const guard=(f,cap,resource)=>academyPaidGridDraftGuard({runtime:f.runtimes.academy,cap,store:f.runtimes.academy.store,env:f.envs.academy,binding:cap.binding,rights:cap.rights,resource});
test('actual native paid-month draft guard permits a prepared disabled register and native V2 save retains owning CAS',async()=>{
 const {f,target}=await fixture();try{
  const {login,cap}=await capFor(f),resource={type:'academy-program-subscriptions',activityKey:target.activity_key,editor:'months'},plan=await guard(f,cap,resource);
  assert(await f.runtimes.academy.store.first(plan.sql,...plan.args));
  const response=await f.nativeRequest('/api/admin/platform/program-monthly-subscriptions/grid-save',{activityKey:target.activity_key,policyRevision:1,operationId:crypto.randomUUID(),entries:[{accountId:target.account_id,month:'2026-11',subscribed:true,revision:0,classIds:[target.class_id]}]},login,{headers:{'X-Academy-Workspace':'ADMIN'}});
  assert.equal(response.response.status,200,JSON.stringify({data:response.data,error:response.nativeError?.stack}));
  assert.equal(f.databases.academy.prepare('SELECT active FROM program_monthly_subscriptions WHERE activity_key=? AND account_id=? AND lesson_month=?').get(target.activity_key,target.account_id,'2026-11').active,1);
  assert.equal(await f.runtimes.academy.store.first(plan.sql,...plan.args),null,'original final source/policy fence becomes stale');
  assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM account_sessions WHERE account_id=?').get(cap.binding.sub).n,0,'no V1 session minted');
 }finally{f.close();}
});
test('actual native additional-Surah draft guard binds the selected canonical participant and exact native Program policy',async()=>{
 const {f,target}=await fixture();try{
  const {cap}=await capFor(f),resource={type:'academy-program-surah-grants',activityKey:target.activity_key,accountId:target.account_id},plan=await guard(f,cap,resource);
  assert(await f.runtimes.academy.store.first(plan.sql,...plan.args));
  await assert.rejects(guard(f,cap,{...resource,accountId:'not-a-native-participant'}));
  await assert.rejects(guard(f,cap,{...resource,path:'/api/admin/platform/user-profiles/save'}),{code:'ACADEMY_DRAFT_RESOURCE_REQUIRED'});
  await assert.rejects(guard(f,cap,{type:'academy-program-subscriptions',activityKey:target.activity_key,editor:'arbitrary'}),{code:'ACADEMY_DRAFT_RESOURCE_REQUIRED'});
  f.databases.academy.prepare("UPDATE program_monthly_media_policies SET revision=revision+1 WHERE activity_key=?").run(target.activity_key);
  assert.equal(await f.runtimes.academy.store.first(plan.sql,...plan.args),null);
 }finally{f.close();}
});

test('metadata-only policy key can recover a completed preparation while native activation still requires the reviewed register',async()=>{
 let activity;const f=await world({prepareAcademy(db){
  activity=db.prepare("SELECT a.activity_key FROM activities a LEFT JOIN program_monthly_media_policies p USING(activity_key) WHERE a.kind='PROGRAM' AND a.active=1 AND a.lifecycle='ACTIVE' AND p.activity_key IS NULL LIMIT 1").get()?.activity_key;assert(activity);db.prepare("UPDATE activities SET name='Tafseer' WHERE activity_key=?").run(activity);
 },prepareEnvironment({env,app}){if(app==='academy')env.ACADEMY_MONTHLY_SUBSCRIPTIONS='1';}});f.loginId='separation-global';
 try{
  let {login,cap}=await capFor(f);const resource={type:'academy-program-subscription-policy',activityKey:activity,mode:'prepare'},plan=await guard(f,cap,resource);assert(await f.runtimes.academy.store.first(plan.sql,...plan.args));
  const operationId=crypto.randomUUID(),prepared=await f.nativeRequest('/api/admin/platform/program-monthly-subscriptions/configure',{activityKey:activity,mode:'prepare',policyRevision:0,operationId},login,{headers:{'X-Academy-Workspace':'ADMIN'}});assert.equal(prepared.response.status,200,JSON.stringify({data:prepared.data,error:prepared.nativeError?.stack}));assert.equal(prepared.data.prepared,true);
  const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'refresh',expectedContext:login.context}),renewed=await f.post('academy','/auth/v2/refresh',{operationId:boot.data.intent.id,expectedContext:boot.data.context,qualifyingActivity:false},boot.data);assert.equal(renewed.response.status,200,JSON.stringify(renewed.data));login=renewed.data;
  cap=await f.runtimes.academy.authorise(new Request(origin+'/api/account/session',{headers:{Origin:origin,Cookie:f.jar.header(origin),'X-UAA-Request':'2','X-UAA-Expected-Context':b64u(bytes(canonical(login.context)))}}));
  const recovery=await guard(f,cap,resource);assert(await f.runtimes.academy.store.first(recovery.sql,...recovery.args),'completed preparation metadata remains recoverable');
  const status=await f.nativeRequest('/api/academy/changes/status',{resource,operationId},login,{headers:{'X-Academy-Workspace':'ADMIN'}});assert.equal(status.response.status,200,JSON.stringify({data:status.data,error:status.nativeError?.stack}));assert.equal(status.data.committed,true);assert.equal(status.data.acceptedChange,null);
  const denied=await f.nativeRequest('/api/admin/platform/program-monthly-subscriptions/configure',{activityKey:activity,mode:'activate',reviewed:true,policyRevision:1,operationId:crypto.randomUUID()},login,{headers:{'X-Academy-Workspace':'ADMIN'}});assert.equal(denied.response.status,409);assert.equal(denied.data.code,'MONTHLY_REVIEW_REQUIRED');assert.equal(f.databases.academy.prepare('SELECT enabled FROM program_monthly_media_policies WHERE activity_key=?').get(activity).enabled,0);
 }finally{f.close();}
});
