import test from 'node:test';import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {world,signIn,seedStudioAuthoringFixture} from '../../../backend/tests/fixtures/academy-v111-native-fixture.mjs';
import {childJourney} from '../../../backend/tests/fixtures/academy-v111-journey-fixture.mjs';
import {ORIGINS} from '../tokens.mjs';
test('actual protected media start/seek/retry are separate authorised requests and resume under renewed local cookies',async()=>{
 const f=await world({studioAuthority:'WEBSITE'});try{
  const a=seedStudioAuthoringFixture(f),db=f.databases.studio,source=f.databases.academy;
  source.exec('UPDATE website_platform_control SET enabled=1 WHERE singleton=1');
  source.prepare("INSERT INTO website_platform_access_ownership(activity_key,state,updated_at) VALUES(?,'STUDIO',?) ON CONFLICT(activity_key) DO UPDATE SET state='STUDIO'").run(a.activityKey,new Date(f.now()*1000).toISOString());
  const raw=new Uint8Array(256).map((_,i)=>i);let mediaGets=0,mediaHeads=0;
  f.envs.studio.MEDIA={async head(){mediaHeads++;return {size:raw.length};},async get(key,options={}){mediaGets++;const range=options.range||{offset:0,length:raw.length},body=raw.slice(range.offset,range.offset+range.length);return {body:new Response(body).body,size:body.length};}};
  db.prepare('INSERT INTO objects(asset_id,object_key,mime_type,filename,byte_size,sha256) VALUES(?,?,?,?,?,?)').run('local-media-asset','fixture/private-media','video/mp4','synthetic.mp4',raw.length,'a'.repeat(64));
  db.prepare('INSERT INTO asset_owners VALUES(?,?)').run('local-media-asset',a.offeringId);
  db.prepare("INSERT INTO attachments(attachment_id,offering_id,asset_id,lesson_id,lesson_date,title,audience,published) VALUES(?,?,?,'synthetic-lesson','2026-11-19','Synthetic local media','RECORDING',1)").run('local-media-attachment',a.offeringId,'local-media-asset');
  const root=await signIn(f),child=await childJourney(f,'studio',{academyContext:root.context}),report={schema:1,measurement:'LOCAL_ACTUAL_NATIVE_HTTP_SYNTHETIC_RANGES',realPlayerPatternMeasured:false,billedRows:null,operations:[],qualification:'This exercises actual native authorisation and Range code with memory SQLite and a faithful bounded R2 byte adapter. It is not a live CDN/browser player/network/provider billing measurement.'};
  const snap=()=>({sqlStatements:f.metrics.studio.queries,r2AuthReads:f.buckets.studio.gets,r2AuthWrites:f.buckets.studio.puts,mediaGets,mediaHeads}),measure=async(name,headers={},method='GET')=>{
   const before=snap(),response=await f.request('studio','/api/media/local-media-attachment',{headers,method}),status=response.status,body=method==='HEAD'?new Uint8Array():new Uint8Array(await response.arrayBuffer()),after=snap();
   assert([200,206].includes(status),name+': '+new TextDecoder().decode(body));report.operations.push({name,method,status,bytes:body.length,contentRange:response.headers.get('Content-Range'),streamDeadlineMs:Number(response.headers.get('X-UAA-Stream-Deadline'))||null,...Object.fromEntries(Object.keys(before).map(k=>[k,after[k]-before[k]]))});return {response,body};
  };
  await measure('metadata-head',{},'HEAD');
  const start=await measure('start',{Range:'bytes=0-15'});assert.deepEqual(start.body,raw.slice(0,16));
  const seek=await measure('seek',{Range:'bytes=64-95'});assert.deepEqual(seek.body,raw.slice(64,96));
  const retry=await measure('network-retry',{Range:'bytes=64-95'});assert.deepEqual(retry.body,raw.slice(64,96));
  assert.equal(start.response.headers.get('X-UAA-Stream-Deadline'),String(child.validationDeadlineMs));
  f.advance(901);const expired=await f.request('studio','/api/media/local-media-attachment',{headers:{Range:'bytes=96-127'}});assert.equal(expired.status,401);await expired.arrayBuffer();
  const sourceCalls=f.trace.filter(r=>r.app==='academy').length,boot=await f.post('studio','/auth/v2/bootstrap',{purpose:'refresh',expectedContext:child.context}),renew=await f.post('studio','/auth/v2/refresh',{operationId:boot.data.intent.id,expectedContext:child.context,qualifyingActivity:false},boot.data);
  assert.equal(renew.response.status,200,JSON.stringify(renew.data));assert.equal(renew.data.originalExpiresAtMs,child.originalExpiresAtMs);assert.equal(f.trace.filter(r=>r.app==='academy').length,sourceCalls,'local renewal must not checkpoint Academy');
  const resumed=await measure('resume-after-own-app-renewal',{Range:'bytes=96-127'});assert.deepEqual(resumed.body,raw.slice(96,128));report.originalSessionExpiryPreserved=true;report.renewalAcademyCalls=0;
  if(process.env.V111_MEDIA_REPORT)writeFileSync(process.env.V111_MEDIA_REPORT,JSON.stringify(report,null,2)+'\n');
 }finally{f.close();}
});
