import test from 'node:test';import assert from 'node:assert/strict';
import worker from '../src/academy-runtime.js';
import {nativeMediaBridgeFixture} from './fixtures/academy-native-media-bridge-fixture.mjs';
import {checkedVideoCommand,processingPartInput,processingBrowserPath,processingPartPath,processingPartBytes} from '../src/academy/d1/web-platform/video-processing.mjs';
import {verify,envelopePurpose} from '../src/academy/d1/web-platform/protocol.mjs';
const portal='https://ummabbadacademy.app';
async function setup(){
 const f=await nativeMediaBridgeFixture();const core=f.databases.core;
 core.prepare("UPDATE website_platform_timetable_scopes SET kind='COURSE' WHERE activity_key=?").run(f.scope);
 const calls=[];Object.assign(f.source.env,{VIDEO_AUTOLINK_HTTP_ENABLED:'1',WEBSITE_PLATFORM_ORIGIN:'https://studio.test',ACADEMY_TO_WEBSITE_SECRET:'synthetic-processing-connection-secret-ONLY',ALLOWED_ORIGINS:portal,WEBSITE_PLATFORM_SERVICE:{async fetch(url,options){
  const envelope=JSON.parse(options.body);assert.equal(new URL(url).pathname,'/internal/studio/video-processing');
  assert(await verify(f.source.env.ACADEMY_TO_WEBSITE_SECRET,envelopePurpose('POST','/internal/studio/video-processing'),options.body,new Headers(options.headers).get('X-Maktab-Signature')));
  calls.push({url,envelope});return Response.json({success:true,sourceAvailable:true,acknowledge:envelope.deliveries.map(d=>d.delivery.operationId),...(envelope.more?{pending:true}:{})});
 }}});
 const send=async(input={activityKey:f.scope,command:{action:'video-source-capabilities'}},{token=f.global,workspace='ADMIN',origin=portal,path=processingBrowserPath,method='POST',raw}={})=>{
  const response=await worker.fetch(new Request('http://localhost'+path,{method,headers:{Origin:origin,Authorization:'Bearer '+token,'X-Academy-Workspace':workspace,'Content-Type':raw?'application/octet-stream':'application/json'},...(method==='GET'?{}:{body:raw||JSON.stringify(input)})}),f.source.env);
  return {status:response.status,body:await response.json(),headers:response.headers};
 };
 return {...f,calls,send};
}
const privateResponse=r=>assert.equal(r.headers.get('Cache-Control'),'private, no-store');
test('processing command and binary parser are bounded and cannot accept caller proof, role or arbitrary action',async()=>{
 for(const c of [{action:'save',change:{action:'staff'}},{action:'video-source-options',actor:{globalAdmin:true}},{action:'video-source-upload-part',assetId:'a',partNumber:1,data:'AAAA',sha256:'0'.repeat(64)}])assert.throws(()=>checkedVideoCommand(c));
 assert.throws(()=>checkedVideoCommand({action:'video-processing-source',transcript:'x'.repeat(524289)}),e=>e.status===413);
 const valid=await processingPartInput(new Request('https://academy.test'+processingPartPath+'?activityKey=COURSE:one&assetId=synthetic-asset&partNumber=1',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:new Uint8Array([0,0,0,24,102,116,121,112])}));assert.equal(valid.command.action,'video-source-upload-part');assert.equal(atob(valid.command.data).length,8);
 await assert.rejects(processingPartInput(new Request('https://academy.test'+processingPartPath+'?activityKey=COURSE:one&assetId=x&partNumber=1',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:new Uint8Array(processingPartBytes+1)})),e=>e.status===413);
 await assert.rejects(processingPartInput(new Request('https://academy.test'+processingPartPath+'?activityKey=COURSE:one&assetId=x&partNumber=1&partNumber=2',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:'x'})),e=>e.code==='VIDEO_PART_INVALID');
});
test('actual Academy entry is default-off and preserves existing generic/artwork size gates',async()=>{
 const f=await setup();try{
  f.source.env.VIDEO_AUTOLINK_HTTP_ENABLED='0';const r=await f.send();assert.equal(r.status,404,JSON.stringify(r.body));assert.equal(f.calls.length,0);privateResponse(r);
  f.source.env.VIDEO_AUTOLINK_HTTP_ENABLED='1';const r2=await f.send({activityKey:f.scope,command:{action:'video-processing-source',transcript:'x'.repeat(140000)}},{path:'/api/admin/platform/studio-access'});assert.equal(r2.status,413);assert.equal(f.calls.length,0);
  const r3=await f.send({activityKey:f.scope,command:{action:'video-source-capabilities'}},{path:'/api/admin/platform/studio-access/playlist-cover'});assert.equal(r3.status,400);assert.equal(f.calls.length,0);
 }finally{f.close();}
});
test('actual Academy request retains PIN-derived current native session, Admin workspace, exact portal Origin and owning scope gates',async t=>{
 const f=await setup();try{
  for(const [label,options,status]of [['missing token',{token:''},401],['Teach workspace',{workspace:'TEACH'},403],['foreign Origin',{origin:'https://hostile.test'},403],['GET',{method:'GET'},405]]){
   await t.test(label,async()=>{const r=await f.send(undefined,options);assert.equal(r.status,status,JSON.stringify(r.body));privateResponse(r);});
  }
  const forged=await f.send({activityKey:f.scope,command:{action:'video-source-options',actor:{globalAdmin:true}}});assert.equal(forged.status,400);assert.equal(f.calls.length,0);
  f.databases.core.prepare("UPDATE website_platform_access_ownership SET state='FROZEN' WHERE activity_key=?").run(f.scope);const frozen=await f.send();assert.equal(frozen.status,409);assert.equal(f.calls.length,0);
 }finally{f.close();}
});
test('current server proof and command use only the dedicated HMAC path; original transcript stays complete and no browser bearer is forwarded',async()=>{
 const f=await setup();try{
  let r=await f.send();if(r.status===409&&r.body.code==='STUDIO_CONFIRMATION_PENDING')r=await f.send();assert.equal(r.status,200,JSON.stringify(r.body));assert(f.calls.length>0);
  const transcript='WEBVTT\n\n00:00.000 --> 00:02.000\n'+('Synthetic private caption. '.repeat(8000));
  const command={action:'video-processing-source',operationId:crypto.randomUUID(),attachmentId:'synthetic-exact-attachment',format:'VTT',durationSeconds:3,transcript};r=await f.send({activityKey:f.scope,command});assert.equal(r.status,200,JSON.stringify(r.body));
  const sent=f.calls.at(-1).envelope;assert.equal(sent.command.transcript,transcript);assert.equal(sent.offeringId,'synthetic-offering');assert.equal(sent.proof.accountId,f.actors.global);assert(sent.proof.expiresAt<=sent.proof.verifiedAt+55000);assert(!JSON.stringify(sent).includes(f.global));assert(!('actor' in sent.command));privateResponse(r);
 }finally{f.close();}
});
test('new binary browser ingress signs one bounded recording part without changing generic CORS or browser credentials',async()=>{
 const f=await setup();try{
  const bytes=new Uint8Array([0,0,0,24,...new TextEncoder().encode('ftypmp42 synthetic')]),path=processingPartPath+'?'+new URLSearchParams({activityKey:f.scope,assetId:'synthetic-part',partNumber:1});
  let r=await f.send(undefined,{path,raw:bytes});if(r.status===409&&r.body.code==='STUDIO_CONFIRMATION_PENDING')r=await f.send(undefined,{path,raw:bytes});assert.equal(r.status,200,JSON.stringify(r.body));
  const command=f.calls.at(-1).envelope.command;assert.equal(command.action,'video-source-upload-part');assert.equal(command.assetId,'synthetic-part');assert.equal(command.partNumber,1);assert.deepEqual(Uint8Array.from(atob(command.data),c=>c.charCodeAt(0)),bytes);privateResponse(r);
 }finally{f.close();}
});
