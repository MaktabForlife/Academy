import test from 'node:test';import assert from 'node:assert/strict';
import {world,signIn} from './fixtures/academy-v111-native-fixture.mjs';
import {b64u,bytes,canonical} from '../../security/v2/codec.mjs';
const origin='https://ummabbadacademy.app',headers={'X-Academy-Workspace':'ADMIN'};
const call=(f,action,input,login)=>f.nativeRequest('/api/admin/platform/user-profiles/'+action,input,login,{headers});
async function refresh(f,login){const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'refresh',expectedContext:login.context}),next=await f.post('academy','/auth/v2/refresh',{operationId:boot.data.intent.id,expectedContext:boot.data.context,qualifyingActivity:false},boot.data);assert.equal(next.response.status,200,JSON.stringify(next.data));return next.data;}
async function draft(f,login,resource={type:'academy-users'}){const runtime=f.runtimes.academy,cap=await runtime.authorise(new Request(origin+'/api/account/session',{headers:{Origin:origin,Cookie:f.jar.header(origin),'X-UAA-Request':'2','X-UAA-Expected-Context':b64u(bytes(canonical(login.context)))}}));return runtime.native.draftGuard({runtime,cap,binding:cap.binding,rights:cap.rights,resource});}
test('actual native Users options are bounded and private edits reconcile by actor operation without returning profile data',async()=>{
 const f=await world();f.loginId='separation-global';
 try{let login=await signIn(f);const options=await call(f,'options',{},login);assert.equal(options.response.status,200,JSON.stringify(options.data));assert.deepEqual(Object.keys(options.data).sort(),['adminDesignationEditable','currentAccountId','prepared','store','success']);const plan=await draft(f,login);assert(await f.runtimes.academy.store.first(plan.sql,...plan.args));const read=await call(f,'get',{},login);assert.equal(read.response.status,200);const target=read.data.accounts.find(a=>a.accountId!==login.context.sub&&a.active);assert(target);
 const operationId=crypto.randomUUID(),input={mode:'profile',creating:false,accountId:target.accountId,displayName:'Synthetic private Users change',uniqueId:target.uniqueId,active:target.active,whatsappNumber:target.whatsappNumber,baseRevision:target.revision,operationId};
 const save=await call(f,'save',input,login);assert.equal(save.response.status,200,JSON.stringify({data:save.data,error:save.nativeError?.stack}));login=await refresh(f,login);
 const status=await f.nativeRequest('/api/academy/changes/status',{resource:{type:'academy-users'},operationId},login,{headers});assert.equal(status.response.status,200,JSON.stringify({data:status.data,error:status.nativeError?.stack}));assert.equal(status.data.committed,true);assert.equal(status.data.acceptedChange,null);assert(!JSON.stringify(status.data).includes(input.displayName));assert(!Object.hasOwn(status.data,'profile'));
 const latest=await call(f,'get',{},login);assert.equal(latest.data.accounts.find(a=>a.accountId===target.accountId).displayName,input.displayName);
 const fresh=await draft(f,login);assert(await f.runtimes.academy.store.first(fresh.sql,...fresh.args));
 await assert.rejects(draft(f,login,{type:'academy-users',role:'GLOBAL_ADMIN'}));
 assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM account_sessions').get().n,0);
 }finally{f.close();}
});
test('learner cannot use bounded Users options or the Users recovery key',async()=>{
 const f=await world();try{const login=await signIn(f),reply=await call(f,'options',{globalAdmin:true},login);assert.equal(reply.response.status,403);await assert.rejects(draft(f,login));}finally{f.close();}
});

test('native Users and Course create keys resolve valid case-variant role FKs to the canonical account without changing sub',async()=>{
 const f=await world({prepareSource(source){source.db.exec("UPDATE global_role_assignments SET account_id=upper(account_id) WHERE role='GLOBAL_ADMIN'");}});f.loginId='separation-global';
 try{const login=await signIn(f);assert.equal(login.context.sub,'sep-global');const own=await draft(f,login);assert(await f.runtimes.academy.store.first(own.sql,...own.args));const runtime=f.runtimes.academy,cap=await runtime.authorise(new Request(origin+'/api/account/session',{headers:{Origin:origin,Cookie:f.jar.header(origin),'X-UAA-Request':'2','X-UAA-Expected-Context':b64u(bytes(canonical(login.context)))}}));const resource={type:'academy-course-management',courseId:null,runId:null},course=await runtime.native.draftGuard({runtime,cap,binding:cap.binding,rights:cap.rights,resource});assert(await runtime.store.first(course.sql,...course.args));}
 finally{f.close();}
});
