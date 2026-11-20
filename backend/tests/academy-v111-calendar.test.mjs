import test from 'node:test';import assert from 'node:assert/strict';
import {world,signIn} from './fixtures/academy-v111-native-fixture.mjs';
import {b64u,bytes,canonical} from '../../security/v2/codec.mjs';
const origin='https://ummabbadacademy.app',headers={'X-Academy-Workspace':'ADMIN'};
const call=(f,p,input,login)=>f.nativeRequest('/api/academy/'+p,input,login,{headers});
async function refresh(f,login){const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'refresh',expectedContext:login.context}),next=await f.post('academy','/auth/v2/refresh',{operationId:boot.data.intent.id,expectedContext:boot.data.context,qualifyingActivity:false},boot.data);assert.equal(next.response.status,200,JSON.stringify(next.data));return next.data;}
async function plan(f,login,resource){const runtime=f.runtimes.academy,cap=await runtime.authorise(new Request(origin+'/api/account/session',{headers:{Origin:origin,Cookie:f.jar.header(origin),'X-UAA-Request':'2','X-UAA-Expected-Context':b64u(bytes(canonical(login.context)))}}));return runtime.native.draftGuard({runtime,cap,binding:cap.binding,rights:cap.rights,resource});}
test('actual selected calendar preserves stable create identity, rejects a second creation, and recovers its exact staged accepted change',async()=>{
 const f=await world();f.loginId='separation-global';f.envs.academy.ACADEMY_ACCEPTED_SETUP='1';
 try{let login=await signIn(f);const resource={type:'academy-calendar',scopeKey:'ACADEMY',year:2026},initial=await plan(f,login,resource);assert(await f.runtimes.academy.store.first(initial.sql,...initial.args));
 const input={operationId:crypto.randomUUID(),revision:0,entry:{id:'ACEVT-'+crypto.randomUUID(),creating:true,scopeKey:'ACADEMY',kind:'ACADEMY_HOLIDAY',description:'Synthetic stable calendar holiday',startDate:'2026-12-15',endDate:'2026-12-15',active:true,annual:false}};
 const saved=await call(f,'calendar/save',input,login);assert.equal(saved.response.status,200,JSON.stringify({data:saved.data,error:saved.nativeError?.stack}));assert.equal(saved.data.event.id,input.entry.id);assert(saved.data.acceptedChange);
 login=await refresh(f,login);const found=await call(f,'changes/status',{resource,operationId:input.operationId},login);assert.equal(found.response.status,200,JSON.stringify({data:found.data,error:found.nativeError?.stack}));assert.equal(found.data.committed,true);assert.deepEqual(found.data.acceptedChange,saved.data.acceptedChange);assert(!JSON.stringify(found.data).includes(input.entry.description));
 const fresh=await plan(f,login,resource);assert(await f.runtimes.academy.store.first(fresh.sql,...fresh.args),'post-save native resource remains recoverable');
 const duplicate=await call(f,'calendar/save',{...input,operationId:crypto.randomUUID()},login);assert.equal(duplicate.response.status,409);assert.equal(duplicate.data.code,'ROW_CHANGED');
 const accepted=await call(f,'changes/accept',found.data.acceptedChange,login);assert.equal(accepted.response.status,200,JSON.stringify(accepted.data));
 login=await refresh(f,login);const current=await call(f,'calendar/get',{scopeKey:'ACADEMY',year:2026,month:12,view:'admin',teacherId:''},login);assert.equal(current.response.status,200);assert.equal(current.data.events.find(e=>e.id===input.entry.id).description,input.entry.description);const learner=await f.nativeRequest('/api/academy/calendar/get',{scopeKey:'ACADEMY',year:2026,month:12,view:'learn'},login,{headers:{'X-Academy-Workspace':'LEARN'}});assert.equal(learner.response.status,200,JSON.stringify(learner.data));assert.equal(learner.data.events.find(e=>e.id===input.entry.id)?.description,input.entry.description,'accepted Academy-wide event reaches actual learner snapshot');
 assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM account_sessions').get().n,0);
 }finally{f.close();}
});
test('calendar drafts reject extra authority fields and a learner cannot obtain an Admin calendar key',async()=>{
 const f=await world();try{const learner=await signIn(f);await assert.rejects(plan(f,learner,{type:'academy-calendar',scopeKey:'ACADEMY',year:2026}));await assert.rejects(plan(f,learner,{type:'academy-calendar',scopeKey:'ACADEMY',year:2026,globalAdmin:true}));}finally{f.close();}
});
test('teacher availability resource uses actual native editable scopes and exact account identity',async()=>{
 const f=await world();f.loginId='separation-global';
 try{const login=await signIn(f),read=await call(f,'teacher-availability/get',{accountId:login.context.sub},login);assert.equal(read.response.status,200,JSON.stringify(read.data));assert.equal(read.data.available,true);assert.deepEqual(read.data.editableScopes,['GLOBAL']);const resource={type:'academy-teacher-availability',accountId:login.context.sub},guard=await plan(f,login,resource);assert(await f.runtimes.academy.store.first(guard.sql,...guard.args));await assert.rejects(plan(f,login,{...resource,accountId:'no-native-teacher'}));await assert.rejects(plan(f,login,{...resource,workspace:'TEACH'}));
 }finally{f.close();}
});
