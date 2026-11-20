import test from 'node:test';import assert from 'node:assert/strict';
import {world,signIn} from './fixtures/academy-v111-native-fixture.mjs';
import {b64u,bytes,canonical} from '../../security/v2/codec.mjs';
const origin='https://ummabbadacademy.app',headers={'X-Academy-Workspace':'ADMIN'};
const call=(f,p,input,login)=>f.nativeRequest('/api/admin/platform/courses/'+p,input,login,{headers});
async function refresh(f,login){const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'refresh',expectedContext:login.context}),next=await f.post('academy','/auth/v2/refresh',{operationId:boot.data.intent.id,expectedContext:boot.data.context,qualifyingActivity:false},boot.data);assert.equal(next.response.status,200,JSON.stringify(next.data));return next.data;}
async function draft(f,login,resource){const runtime=f.runtimes.academy,cap=await runtime.authorise(new Request(origin+'/api/account/session',{headers:{Origin:origin,Cookie:f.jar.header(origin),'X-UAA-Request':'2','X-UAA-Expected-Context':b64u(bytes(canonical(login.context)))}}));return runtime.native.draftGuard({runtime,cap,binding:cap.binding,rights:cap.rights,resource});}
test('actual Course management owns delivery drafts and exact staged save recovery without V1 sessions',async()=>{
 const f=await world();f.loginId='separation-global';f.envs.academy.ACADEMY_ACCEPTED_SETUP='1';
 try{let login=await signIn(f),list=await call(f,'list',{},login);assert.equal(list.response.status,200,JSON.stringify({data:list.data,error:list.nativeError?.stack}));const c=list.data.courses[0];assert(c);
 const existing={type:'academy-course-management',courseId:c.courseId,runId:c.runId},resource={type:'academy-course-management',courseId:null,runId:null},guard=await draft(f,login,resource);assert(await f.runtimes.academy.store.first(guard.sql,...guard.args));
 const read=await call(f,'get',c,login);assert.equal(read.response.status,200);const input={courseId:'',runId:'',baseRevision:'0',details:{...read.data.course.details,name:'Synthetic native Course editor'},operationId:crypto.randomUUID()};
 const saved=await call(f,'save',input,login);assert.equal(saved.response.status,200,JSON.stringify({data:saved.data,error:saved.nativeError?.stack}));assert(saved.data.acceptedChange);login=await refresh(f,login);
 const status=await f.nativeRequest('/api/academy/changes/status',{resource,operationId:input.operationId},login,{headers});assert.equal(status.response.status,200,JSON.stringify(status.data));assert.equal(status.data.committed,true);assert.deepEqual(status.data.acceptedChange,saved.data.acceptedChange);assert(!JSON.stringify(status.data).includes(input.details.name));
 const fresh=await draft(f,login,resource);assert(await f.runtimes.academy.store.first(fresh.sql,...fresh.args));const accepted=await f.nativeRequest('/api/academy/changes/accept',status.data.acceptedChange,login,{headers});assert.equal(accepted.response.status,200,JSON.stringify(accepted.data));login=await refresh(f,login);
 const actual=await call(f,'get',{courseId:saved.data.courseId,runId:saved.data.runId},login);assert.equal(actual.data.course.details.name,input.details.name);await assert.rejects(draft(f,login,{...resource,role:'GLOBAL_ADMIN'}));assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM account_sessions').get().n,0);
 }finally{f.close();}
});
test('learner cannot obtain Course management create or delivery keys',async()=>{const f=await world();try{const login=await signIn(f);assert.equal((await call(f,'list',{},login)).response.status,403);await assert.rejects(draft(f,login,{type:'academy-course-management',courseId:null,runId:null}));}finally{f.close();}});
