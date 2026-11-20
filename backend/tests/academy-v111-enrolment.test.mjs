import test from 'node:test';import assert from 'node:assert/strict';
import {world,signIn} from './fixtures/academy-v111-native-fixture.mjs';
import {academyEnrolmentDraftGuard} from '../../security/v2/academy-enrolment-resources.mjs';
import {b64u,bytes,canonical} from '../../security/v2/codec.mjs';
const origin='https://ummabbadacademy.app',entryId='332f638f-fddd-4e2a-a218-1342eb6ed905';
async function fixture(){let activity;const f=await world({prepareSource(source){
 activity=source.db.prepare("SELECT activity_key FROM activities WHERE kind='PROGRAM' AND active=1 AND lifecycle='ACTIVE' ORDER BY activity_key LIMIT 1").get().activity_key;const at=new Date().toISOString();
 source.db.prepare('INSERT INTO academy_enrolment_catalogue VALUES(?,?,?,?,?,?,?,?,?,?)').run(entryId,activity,2026,'Synthetic public enrolment cost',1,0,1,at,at,'sep-global');
 }});f.envs.academy.ACADEMY_ACCEPTED_SETUP='1';return {f,activity};}
test('selected V2 preserves the actual public enrolment catalogue without exposing private profile or inbox reads',async()=>{
 const {f}=await fixture();try{
  const pub=await f.nativeRequest('/api/academy/enrolment/catalogue',undefined,null,{method:'GET'});assert.equal(pub.response.status,200,JSON.stringify(pub.data));assert(pub.data.entries.some(e=>e.id===entryId));
  for(const path of ['/api/academy/enrolment/profile','/api/admin/platform/enrolment/get']){const reply=await f.nativeRequest(path,{},null);assert.equal(reply.response.status,401);}
 }finally{f.close();}
});
test('uncertain native enrolment submission is reconciled by an own-account read without replay or cross-account receipt disclosure',async()=>{
 const {f}=await fixture();try{
  const login=await signIn(f),operationId=crypto.randomUUID(),sent=await f.nativeRequest('/api/academy/enrolment/submit',{operationId,paid:false,entries:[{id:entryId,revision:1}]},login,{headers:{'X-Academy-Workspace':'LEARN'}});
  assert.equal(sent.response.status,200,JSON.stringify({data:sent.data,error:sent.nativeError?.stack}));
  const found=await f.nativeRequest('/api/academy/enrolment/status',{operationId},login);assert.equal(found.response.status,200,JSON.stringify(found.data));assert.equal(found.data.outcome,'RECEIVED');assert.equal(found.data.id,sent.data.id);assert.equal(Object.hasOwn(found.data,'whatsapp'),false);assert.equal(Object.hasOwn(found.data,'name'),false);
  const missing=await f.nativeRequest('/api/academy/enrolment/status',{operationId:crypto.randomUUID()},login);assert.equal(missing.data.outcome,'UNKNOWN');
  f.jar.hosts.set(origin,new Map());f.loginId='separation-global';const other=await signIn(f),foreign=await f.nativeRequest('/api/academy/enrolment/status',{operationId},other);assert.equal(foreign.data.outcome,'UNKNOWN');
  assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM account_sessions').get().n,0);
 }finally{f.close();}
});
test('catalogue text recovery requires the actual native Admin scope and binds exact existing or absent entry revision',async()=>{
 const {f,activity}=await fixture();try{
  f.loginId='separation-global';const login=await signIn(f),runtime=f.runtimes.academy,cap=await runtime.authorise(new Request(origin+'/api/account/session',{headers:{Origin:origin,Cookie:f.jar.header(origin),'X-UAA-Request':'2','X-UAA-Expected-Context':b64u(bytes(canonical(login.context)))}}));
  for(const entry of [entryId,crypto.randomUUID()]){const plan=await academyEnrolmentDraftGuard({runtime,cap,store:runtime.store,env:f.envs.academy,binding:cap.binding,rights:cap.rights,resource:{type:'academy-enrolment-catalogue',activityKey:activity,entryId:entry}});assert(await runtime.store.first(plan.sql,...plan.args));}
  const save=await f.nativeRequest('/api/admin/platform/enrolment/catalogue-save',{operationId:crypto.randomUUID(),id:entryId,activityKey:activity,year:2026,cost:'Changed through actual native V2',active:true,order:0,baseRevision:1},login,{headers:{'X-Academy-Workspace':'ADMIN'}});
  assert.equal(save.response.status,200,JSON.stringify({data:save.data,error:save.nativeError?.stack}));assert.equal(save.data.revision,2);
  assert(save.data.acceptedChange,'native catalogue Save requires its exact accepted-setup completion');
  const staged=await f.nativeRequest('/api/academy/enrolment/catalogue',undefined,null,{method:'GET'});
  assert.equal(staged.data.entries.find(e=>e.id===entryId).cost,'Synthetic public enrolment cost','a staged raw save is not public acceptance');
  const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'refresh',expectedContext:login.context}),refresh=await f.post('academy','/auth/v2/refresh',{operationId:boot.data.intent.id,expectedContext:boot.data.context,qualifyingActivity:false},boot.data);
  assert.equal(refresh.response.status,200,JSON.stringify(refresh.data));
  const accepted=await f.nativeRequest('/api/academy/changes/accept',save.data.acceptedChange,refresh.data,{headers:{'X-Academy-Workspace':'ADMIN'}});
  assert.equal(accepted.response.status,200,JSON.stringify({data:accepted.data,error:accepted.nativeError?.stack}));
  const published=await f.nativeRequest('/api/academy/enrolment/catalogue',undefined,null,{method:'GET'});
  assert.equal(published.data.entries.find(e=>e.id===entryId).cost,'Changed through actual native V2');
 }finally{f.close();}
});
