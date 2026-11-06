import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertInitialised,assertRemoteSettings} from '../tools/feature-deploy.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
const receipt=()=>({...read('config/feature-initialisation-receipt.json'),state:'VERIFIED',sourceDigest:'a'.repeat(64),timetableNamespaceId:'1'.repeat(32),splitNamespaceId:'2'.repeat(32),nativeProofRun:1,verifiedAt:'2026-11-05T17:00:00Z'});
function fixture(coordinator=false){
 const r=receipt(),c=read('backend/'+(coordinator?'wrangler.feature-coordinator.jsonc':'wrangler.feature.jsonc'));
 if(!coordinator)c.vars={...c.vars,ACADEMY_D1_MODE:'ACTIVE',ACADEMY_D1_RUN_ID:r.sourceDigest};
 const bindings=[...c.d1_databases.map(b=>({name:b.binding,type:'d1',id:b.database_id})),...(c.r2_buckets||[]).map(b=>({name:b.binding,type:'r2_bucket',bucket_name:b.bucket_name})),...Object.entries(c.vars||{}).map(([name,text])=>({name,type:'plain_text',text})),...(c.secrets?.required||[]).map(name=>({name,type:'secret_text'})),...c.durable_objects.bindings.map(b=>({name:b.name,type:'durable_object_namespace',class_name:b.class_name,namespace_id:b.class_name==='ProgramTimetableCoordinator'?r.timetableNamespaceId:r.splitNamespaceId}))];
 if(!coordinator)bindings.push({name:'AUTH_LOGIN_RATE_LIMITER',type:'ratelimit',namespace_id:'100111',simple:{limit:5,period:60}});
 return {r,c,s:{bindings,compatibility_date:c.compatibility_date,compatibility_flags:c.compatibility_flags,tail_consumers:[]}};
}
test('Routine deployment stays closed for pending, wrong-account, wrong-store, old-schema and live namespace receipts',()=>{
 assert.throws(()=>assertInitialised({...read('config/feature-initialisation-receipt.json'),state:'PENDING'}));
 assertInitialised(receipt());
 for(const change of [r=>r.accountId='wrong',r=>r.databaseIds[0]='1c8aece3-dc1d-40d1-8a82-01ab4f63336f',r=>r.schemaHashes.core='b'.repeat(64),r=>r.sourceDigest=null,r=>r.timetableNamespaceId='aa75328c13ee4f42b406ccf5ebbe851a',r=>r.splitNamespaceId=r.timetableNamespaceId,r=>r.nativeProofRun=null,r=>r.verifiedAt=null]){
  const r=receipt();change(r);assert.throws(()=>assertInitialised(r));
 }
});
test('Installed Feature metadata rejects indirect live access, unknown secrets, changed namespaces, disabled PIN limits and stale mode',()=>{
 const good=fixture();assertRemoteSettings(good.s,good.c,good.r);
 const changes=[
  s=>s.bindings.find(b=>b.name==='ACADEMY_DB').id='1c8aece3-dc1d-40d1-8a82-01ab4f63336f',
  s=>s.bindings.find(b=>b.name==='MEDIA_BUCKET').bucket_name='maktab4lifemedia',
  s=>s.bindings.find(b=>b.name==='PROGRAM_TIMETABLE_COORDINATOR').namespace_id='aa75328c13ee4f42b406ccf5ebbe851a',
  s=>s.bindings.find(b=>b.name==='ACADEMY_SPLIT_COORDINATOR').script_name='academy_split_coordinator',
  s=>s.bindings.push({name:'LIVE_SERVICE',type:'service',service:'devrebootworker'}),
  s=>s.bindings.push({name:'HIFZ_PROFILE_SYNC_SECRET',type:'secret_text'}),
  s=>s.bindings.find(b=>b.name==='AUTH_LOGIN_RATE_LIMITER').simple.limit=100,
  s=>s.bindings.find(b=>b.name==='ACADEMY_D1_MODE').text='PAUSED',
  s=>s.bindings.find(b=>b.name==='ACADEMY_D1_RUN_ID').text='b'.repeat(64),
  s=>s.bindings.push({...s.bindings[0]}),
  s=>s.tail_consumers=[{service:'unreviewed-logger'}]
 ];
 for(const change of changes){const {s,c,r}=fixture();change(s);assert.throws(()=>assertRemoteSettings(s,c,r));}
});
test('Private Feature coordinator metadata permits only its exact new stores and own namespace',()=>{
 const {s,c,r}=fixture(true);assertRemoteSettings(s,c,r,true);
 s.bindings.find(b=>b.name==='ACADEMY_ADMIN_DB').id='fe85dac1-b1f0-4079-9127-2e36089aa385';assert.throws(()=>assertRemoteSettings(s,c,r,true));
});
