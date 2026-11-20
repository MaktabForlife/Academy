import test from 'node:test';import assert from 'node:assert/strict';
import {world,signIn} from './fixtures/academy-v111-native-fixture.mjs';
import {b64u,bytes,canonical} from '../../security/v2/codec.mjs';
const origin='https://ummabbadacademy.app',headers={'X-Academy-Workspace':'ADMIN'},layout={rtl:true,fields:['learner','results','total'].map((key,i)=>({key,x:0.1,y:0.1+i*0.25,width:0.8,height:0.15,fontSize:12}))};
const call=(f,action,input,login)=>f.nativeRequest('/api/academy/assessments/'+action,input,login,{headers});
async function refresh(f,login){const boot=await f.post('academy','/auth/v2/bootstrap',{purpose:'refresh',expectedContext:login.context}),next=await f.post('academy','/auth/v2/refresh',{operationId:boot.data.intent.id,expectedContext:boot.data.context,qualifyingActivity:false},boot.data);assert.equal(next.response.status,200,JSON.stringify(next.data));return next.data;}
async function guard(f,login,resource){const runtime=f.runtimes.academy,cap=await runtime.authorise(new Request(origin+'/api/account/session',{headers:{Origin:origin,Cookie:f.jar.header(origin),'X-UAA-Request':'2','X-UAA-Expected-Context':b64u(bytes(canonical(login.context)))}}));return runtime.native.draftGuard({runtime,cap,binding:cap.binding,rights:cap.rights,resource});}
test('actual native report-template keeps proposed identity/replay semantics and current Admin-owned revision remains recoverable after Save',async()=>{
 let target;const f=await world({prepareAcademy(db){target=db.prepare("SELECT c.activity_key,c.class_id FROM classes c JOIN activities a USING(activity_key) WHERE c.active=1 AND a.active=1 AND a.lifecycle='ACTIVE' LIMIT 1").get();assert(target);}});f.loginId='separation-global';
 try{let login=await signIn(f);const resource={type:'academy-assessment-template',activityKey:target.activity_key,classId:target.class_id,templateId:null},first=await guard(f,login,resource);assert(await f.runtimes.academy.store.first(first.sql,...first.args));
 const id='ASTPL-'+crypto.randomUUID(),input={...target,activityKey:target.activity_key,classId:target.class_id,creating:true,proposedId:id,revision:0,name:'Synthetic report layout',fileId:null,layout,operationId:crypto.randomUUID()};
 const saved=await call(f,'template-save',input,login);assert.equal(saved.response.status,200,JSON.stringify({data:saved.data,error:saved.nativeError?.stack}));assert.equal(saved.data.templateId,id);
 login=await refresh(f,login);const replay=await call(f,'template-save',input,login);assert.equal(replay.response.status,200,JSON.stringify(replay.data));assert.equal(replay.data.templateId,id);
 const duplicate=await call(f,'template-save',{...input,operationId:crypto.randomUUID()},login);assert.equal(duplicate.response.status,409);assert.equal(duplicate.data.code,'ROW_CHANGED');
 let read=await call(f,'templates',{activityKey:target.activity_key,classId:target.class_id},login);assert.equal(read.response.status,200);assert.equal(read.data.templates.find(t=>t.id===id).revision,1);
 const updated=await call(f,'template-save',{activityKey:target.activity_key,classId:target.class_id,templateId:id,name:'Synthetic revision two',fileId:null,layout,revision:1,operationId:crypto.randomUUID()},login);assert.equal(updated.response.status,200,JSON.stringify(updated.data));login=await refresh(f,login);
 const rekey=await guard(f,login,{...resource,templateId:id});assert(await f.runtimes.academy.store.first(rekey.sql,...rekey.args),'Admin revision2 must not be compared to Core compatibility default1');
 read=await call(f,'templates',{activityKey:target.activity_key,classId:target.class_id},login);assert.equal(read.data.templates.find(t=>t.id===id).revision,2);assert.equal(read.data.templates.filter(t=>t.id===id).length,1);
 const status=await f.nativeRequest('/api/academy/changes/status',{resource,operationId:input.operationId},login,{headers});assert.equal(status.response.status,200,JSON.stringify(status.data));assert.equal(status.data.committed,true);assert.equal(status.data.acceptedChange,null);assert(!JSON.stringify(status.data).includes('Synthetic'));
 await assert.rejects(guard(f,login,{...resource,classId:'not-a-native-class'}));await assert.rejects(guard(f,login,{...resource,templateId:'not-a-native-template'}));await assert.rejects(guard(f,login,{...resource,role:'GLOBAL_ADMIN'}));
 assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM account_sessions').get().n,0);
 }finally{f.close();}
});
test('learner captured authority cannot release a report-template draft key even in an existing class',async()=>{
 let target;const f=await world({prepareAcademy(db){target=db.prepare('SELECT activity_key,class_id FROM classes WHERE active=1 LIMIT 1').get();}});try{const login=await signIn(f);await assert.rejects(guard(f,login,{type:'academy-assessment-template',activityKey:target.activity_key,classId:target.class_id,templateId:null}));}finally{f.close();}
});
