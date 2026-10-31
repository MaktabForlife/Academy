import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mobileFirstFixture} from '../tools/mobile-first-preview/fixture.mjs';
import {createCirclesTransport,previewApi} from '../tools/workspace-ui-preview/circles-transport.mjs';
import worker from '../src/academy-runtime.js';

test('released Circles renderers receive native scoped sample data without Studio credentials',async t=>{
 const f=await mobileFirstFixture();t.after(()=>f.close());
 f.env.WEBSITE_PLATFORM_NAVIGATION=JSON.stringify({alimiyah:f.scopes.programA.slice(8),reboot:f.scopes.programB.slice(8)});
 const transport=createCirclesTransport({env:f.env,worker,origin:()=> 'http://localhost'});
 async function call(path,who,body){const response=await transport(path,new Request('http://localhost/__preview/transport'+path,{method:body===undefined?'GET':'POST',headers:{...(who?{Authorization:'Bearer '+await f.actor(who)}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));return {status:response.status,body:await response.json()};}
 assert.equal((await call('/api/me')).status,401);
 assert.equal((await call('/auth/login',null,{uniqueid:'unused',pin:'0000'})).status,404,'Preview cannot exchange credentials');
 const mine=await call('/api/circles/navigation','studentA');assert.equal(mine.status,200);assert.deepEqual(mine.body.academia,[{key:'alimiyah',label:'Aalimiyah'}]);assert.deepEqual(mine.body.purchasedCourses,[]);
 const theirs=await call('/api/circles/navigation','studentB');assert.deepEqual(theirs.body.academia,[{key:'reboot',label:'Reboot Your Maktab'}]);
 const denied=await call('/__preview/continue','studentA',{navigation:'reboot'});assert.equal(denied.status,403);
 const learn=await call('/__preview/continue','studentA',{navigation:'alimiyah'});assert.match(learn.body.choices[0].href,/\/learn$/);assert.deepEqual(learn.body.choices.map(c=>c.label),['Learn']);
 const teach=await call('/__preview/continue','teacherA',{navigation:'alimiyah'});assert.deepEqual(teach.body.choices.map(c=>c.label),['Teach']);
 const global=await call('/__preview/continue','global',{navigation:'alimiyah'});assert.equal(global.status,200,JSON.stringify(global.body));assert.deepEqual(global.body.choices.map(c=>c.label),['Admin-Learn','Admin-Teach','Admin']);
 const snapshot=await call('/api/circles/dashboard','teacherA',{mode:'teach'});assert.equal(snapshot.status,200);assert.equal(snapshot.body.mode,'teach');assert(snapshot.body.activities.some(a=>a.activityKey===f.scopes.programA));assert(!snapshot.body.activities.some(a=>a.activityKey===f.scopes.programB));assert(Array.isArray(snapshot.body.warnings));
 assert.equal((await call('/api/circles/dashboard','studentA',{mode:'admin'})).status,403);
 assert.equal((await call('/__preview/continue','studentA',{dashboard:{mode:'admin',tool:'home'}})).status,403);
 const management=await call('/__preview/continue','global',{dashboard:{mode:'admin',tool:'home'}});assert.equal(management.body.choices[0].href,'/academy/admin/#administration');
 assert.equal((await call('/__preview/continue','global',{dashboard:{mode:'admin',tool:'recorder'}})).status,409);
});

test('preview replaces only fetch transport and keeps the real client generation guards',()=>{
 const source='const generation=identity.generation;const response=await fetch(path,{method,credentials:1});if(generation!==identity.generation)throw Error("changed");';
 const output=previewApi(source);assert.match(output,/await previewFetch\(path/);assert.match(output,/if\(generation!==identity.generation\)/);assert.match(output,/\/__preview\/transport/);assert.throws(()=>previewApi('changed upstream API'),/Review the changed/);
});
