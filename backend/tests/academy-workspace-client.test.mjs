import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../js/m4l-academy-workspace.js',import.meta.url),'utf8');
function fixture(fetcher=async()=>Response.json({audience:'LEARN'})){
 const location={pathname:'/academy/',hash:'#timetable/learn',search:'',origin:'https://academy.invalid',href:'https://academy.invalid/academy/#timetable/learn'},calls=[];let token='actor-one';
 const window={fetch:async(url,options)=>{calls.push({url,options});return fetcher(url,options);},M4L_CONFIG:{API_BASE:'https://api.invalid'},addEventListener(){}};
 vm.runInNewContext(source,{window,location,localStorage:{getItem:()=>token},document:{addEventListener(){}},URL,URLSearchParams,Request,Response,Headers,DOMException});
 return {window,location,calls,token:value=>{token=value;}};
}
test('every API helper carries the selected audience and cannot override it with a higher role',async()=>{
 const f=fixture();await f.window.fetch('https://api.invalid/api/academy/assessments/list',{headers:{'X-Academy-Workspace':'ADMIN',Authorization:'Bearer fixture'}});
 assert.equal(f.calls[0].options.headers.get('X-Academy-Workspace'),'LEARN');assert.equal(f.calls[0].options.headers.get('Authorization'),'Bearer fixture');
 f.location.hash='#timetable/teach';assert.equal(f.window.M4L_ACADEMY_WORKSPACE.commit(),true);
 await f.window.fetch('https://api.invalid/api/academy/lesson-media/upload?metadata=x');assert.equal(f.calls[1].options.headers.get('X-Academy-Workspace'),'TEACH');
 const options={headers:{}};await f.window.fetch('https://external.invalid/api/public',options);assert.equal(f.calls[2].options,options);
});
test('delayed JSON, errors and file blobs are discarded after a workspace or account change',async()=>{
 for(const method of ['json','text','blob','arrayBuffer']){
  const f=fixture(),response=await f.window.fetch('https://api.invalid/api/academy/assessments/download');
  f.location.hash='#timetable/teach';f.window.M4L_ACADEMY_WORKSPACE.commit();await assert.rejects(response[method](),{name:'AbortError'});
 }
 const f=fixture(),response=await f.window.fetch('https://api.invalid/api/academy/entrance');f.token('actor-two');await assert.rejects(response.json(),{name:'AbortError'});
});
test('raw file bodies stay streamed and Admin compatibility hashes preserve the destination',async()=>{
 const original=new Response(new Blob(['%PDF-synthetic']).stream(),{headers:{'Content-Type':'application/pdf'}}),f=fixture(async()=>original);
 const response=await f.window.fetch('https://api.invalid/api/academy/lesson-media/download');assert.equal(response.body,original.body);assert.equal(await response.text(),'%PDF-synthetic');
 f.location.hash='#assessment-admin/PROGRAM/case-sensitive';assert.equal(f.window.M4L_ACADEMY_WORKSPACE.canonical(),'/academy/admin/#assessment-admin/PROGRAM/case-sensitive');
});

test('related reader calls share one accepted head and refresh invalidates delayed parsed results',async()=>{
 let revision='head-one-0001';const f=fixture(async url=>Response.json(String(url).endsWith('/setup/head')?{head:revision}:{success:true}));f.window.M4L_CONFIG.ACCEPTED_SETUP=true;
 const [a,b]=await Promise.all([f.window.fetch('https://api.invalid/api/academy/entrance'),f.window.fetch('https://api.invalid/api/academy/calendar/get')]);
 assert.equal(f.calls.filter(c=>String(c.url).endsWith('/setup/head')).length,1);for(const call of f.calls.filter(c=>!String(c.url).endsWith('/setup/head')))assert.equal(call.options.headers.get('X-Academy-Setup'),'head-one-0001');
 revision='head-two-0002';await f.window.M4L_ACADEMY_WORKSPACE.readyPublication(true);await assert.rejects(a.json(),{name:'AbortError'});await assert.rejects(b.json(),{name:'AbortError'});
 const response=await f.window.fetch('https://api.invalid/api/academy/lesson-media/download');assert.equal(f.calls.at(-1).options.headers.get('X-Academy-Setup'),revision);assert.equal((await response.json()).success,true);
});
test('an account change while resolving the publication cannot send the delayed action',async()=>{
 let release;const f=fixture(()=>new Promise(resolve=>{release=()=>resolve(Response.json({head:'head-one-0001'}));}));f.window.M4L_CONFIG.ACCEPTED_SETUP=true;
 const pending=f.window.fetch('https://api.invalid/api/academy/progress/mark',{method:'POST',body:'{}'});f.token('another-actor');release();await assert.rejects(pending,{name:'AbortError'});assert.equal(f.calls.length,1);
});
