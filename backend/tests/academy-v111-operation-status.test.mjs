import test from 'node:test';import assert from 'node:assert/strict';
import {world,signIn} from './fixtures/academy-v111-native-fixture.mjs';
const origin='https://ummabbadacademy.app',admin={'X-Academy-Workspace':'ADMIN'};
const status=(f,login,resource,operationId)=>f.nativeRequest('/api/academy/changes/status',{resource,operationId},login,{headers:admin});
async function refresh(f,login){const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'refresh',expectedContext:login.context}),next=await f.post('academy','/auth/v2/refresh',{operationId:boot.data.intent.id,expectedContext:boot.data.context,qualifyingActivity:false},boot.data);assert.equal(next.response.status,200,JSON.stringify(next.data));return next.data;}
test('lost native Save is located read-only in its exact actor/resource namespace and exposes only completion facts',async()=>{
 const f=await world();const ordinaryLogin=f.loginId;f.loginId='separation-global';f.envs.academy.ACADEMY_ACCEPTED_SETUP='1';
 try{
  let login=await signIn(f);const list=await f.nativeRequest('/api/admin/platform/programs/list',{},login,{headers:admin}),row=list.data.programs.find(r=>r.mode==='PROGRAM'),resource={type:'academy-program',programId:row.id,mode:'edit'},operationId=crypto.randomUUID(),input={id:row.id,name:'Receipt-only synthetic name',durationYears:row.durationYears,timezone:row.timezone,status:row.status,revision:row.revision,operationId};
  const absent=await status(f,login,resource,operationId);assert.equal(absent.response.status,200,JSON.stringify({data:absent.data,error:absent.nativeError?.stack}));assert.equal(absent.data.committed,false);
  const saved=await f.nativeRequest('/api/admin/platform/programs/save',input,login,{headers:admin});assert.equal(saved.response.status,200,JSON.stringify(saved.data));assert(saved.data.acceptedChange);
  login=await refresh(f,login);
  const before=f.databases.academy.prepare('SELECT count(*) n FROM operation_receipts').get().n,found=await status(f,login,resource,operationId);
  assert.equal(found.response.status,200,JSON.stringify({data:found.data,error:found.nativeError?.stack}));assert.equal(found.data.committed,true);assert.equal(found.data.published,false);assert.equal(found.data.head,null);assert.deepEqual(found.data.acceptedChange,saved.data.acceptedChange);
  assert(!JSON.stringify(found.data).includes(input.name));assert.deepEqual(Object.keys(found.data).sort(),['acceptedChange','committed','head','operationId','published','success']);assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM operation_receipts').get().n,before);
  const accepted=await f.nativeRequest('/api/academy/changes/accept',found.data.acceptedChange,login,{headers:admin});assert.equal(accepted.response.status,200,JSON.stringify(accepted.data));
  login=await refresh(f,login);const final=await status(f,login,resource,operationId);assert.equal(final.response.status,200,JSON.stringify(final.data));assert.equal(final.data.published,true);assert.equal(final.data.head,accepted.data.head);
  const other=list.data.programs.find(r=>r.mode==='PROGRAM'&&r.id!==row.id);if(other){const wrong=await status(f,login,{...resource,programId:other.id},operationId);assert.equal(wrong.data.committed,false);}
  const invalid=await f.nativeRequest('/api/academy/changes/status',{resource,operationId,dataset:'USER_PROFILES'},login,{headers:admin});assert.equal(invalid.response.status,400);
  f.jar.hosts.set(origin,new Map());f.loginId=ordinaryLogin;const foreignLogin=await signIn(f),foreign=await status(f,foreignLogin,resource,operationId);assert([401,403].includes(foreign.response.status));
  assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM account_sessions').get().n,0);
 }finally{f.close();}
});

test('same-account receipt for a different catalogue entry cannot complete this encrypted resource',async()=>{
 const entryId=crypto.randomUUID();let activity;
 const f=await world({prepareSource(source){activity=source.db.prepare("SELECT activity_key FROM activities WHERE kind='PROGRAM' AND active=1 AND lifecycle='ACTIVE' LIMIT 1").get().activity_key;const at=new Date().toISOString();source.db.prepare('INSERT INTO academy_enrolment_catalogue VALUES(?,?,?,?,?,?,?,?,?,?)').run(entryId,activity,2026,'Private synthetic receipt cost',1,0,1,at,at,'sep-global');}});f.loginId='separation-global';f.envs.academy.ACADEMY_ACCEPTED_SETUP='1';
 try{let login=await signIn(f);const operationId=crypto.randomUUID(),save=await f.nativeRequest('/api/admin/platform/enrolment/catalogue-save',{operationId,id:entryId,activityKey:activity,year:2026,cost:'Changed synthetic cost',active:true,order:0,baseRevision:1},login,{headers:admin});assert.equal(save.response.status,200,JSON.stringify(save.data));login=await refresh(f,login);
 const correct=await status(f,login,{type:'academy-enrolment-catalogue',activityKey:activity,entryId},operationId);assert.equal(correct.response.status,200,JSON.stringify({data:correct.data,error:correct.nativeError?.stack}));assert.equal(correct.data.committed,true);
 const wrong=await status(f,login,{type:'academy-enrolment-catalogue',activityKey:activity,entryId:crypto.randomUUID()},operationId);assert.equal(wrong.response.status,403);assert.equal(wrong.data.code,'NATIVE_OPERATION_RESOURCE_MISMATCH');assert(!JSON.stringify(wrong.data).includes('cost'));
 }finally{f.close();}
});
test('revocation after the receipt read prevents disclosure under the formerly valid family',async()=>{
 const f=await world();f.loginId='separation-global';
 try{const login=await signIn(f),list=await f.nativeRequest('/api/admin/platform/programs/list',{},login,{headers:admin}),row=list.data.programs.find(r=>r.mode==='PROGRAM'),store=f.runtimes.academy.store,original=store.first.bind(store);let checks=0;
 store.first=async(sql,...args)=>{if(sql.startsWith('SELECT 1 WHERE EXISTS(')&&++checks===2)f.databases.academy.exec("UPDATE jwt_v2_families SET state='REVOKED',cr=cr+1");return original(sql,...args);};
 const result=await status(f,login,{type:'academy-program',programId:row.id,mode:'edit'},crypto.randomUUID());assert.equal(checks,2);assert.equal(result.response.status,403);assert.equal(result.data.code,'NATIVE_OPERATION_AUTHORITY_CHANGED');
 }finally{f.close();}
});
