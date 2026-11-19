import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {RequestMetrics,instrumentD1,instrumentR2,measurementWindow,cacheMetricDelta} from '../instrumentation.mjs';
import {captureDDL} from '../capture.mjs';
import {database,Bucket} from './helpers.mjs';
function reportedDB(result,{first=null,error=null}={}){
 const raw={withSession(){return raw;},prepare(){
  const s={bind(){return s;},async all(){if(error)throw error;return result;},async run(){if(error)throw error;return result;},async first(){if(error)throw error;return first;}};return s;
 },async batch(statements){return Promise.all(statements.map(s=>s.run()));},async exec(){return {count:3,duration:1};}};return raw;
}
test('provider-declared row metadata is separate from synthetic metadata that is unavailable',async()=>{
 const metrics=new RequestMetrics({app:'academy'}),provider=instrumentD1(reportedDB({success:true,results:[],meta:{rows_read:7,rows_written:0,changes:0}}),metrics,{scope:'authentication',metadataSource:'cloudflare-d1'});
 await provider.prepare('SELECT private_account FROM private_table WHERE pin=?').bind('private-pin-value').all();
 const f=database(),synthetic=instrumentD1(f.db,metrics,{scope:'business',metadataSource:'synthetic'});
 f.raw.exec('CREATE TABLE synthetic_business(id INTEGER);');await synthetic.prepare('INSERT INTO synthetic_business VALUES(?)').bind(1).run();
 const m=metrics.snapshot();
 assert.equal(m.sql.requests,2);assert.equal(m.sql.authentication.metadata['cloudflare-d1'].rowsRead,7);assert.equal(m.sql.authentication.metadata['cloudflare-d1'].rowsReadSamples,1);
 assert.equal(m.sql.authentication.metadata['cloudflare-d1'].rowsWrittenSamples,1);
 assert.equal(m.sql.business.metadata.synthetic.rowsWrittenSamples,0);assert.equal(m.sql.business.metadata.synthetic.rowsWrittenUnavailable,1);assert.equal(m.sql.business.metadata.synthetic.statementChanges,1);
 f.raw.close();
});
test('first() does not mistake a business row meta member for driver row accounting',async()=>{
 const metrics=new RequestMetrics({app:'studio'}),db=instrumentD1(reportedDB(null,{first:{meta:{rows_read:999,rows_written:999},account:'private-account'}}),metrics,{scope:'authentication',metadataSource:'cloudflare-d1'});
 const row=await db.prepare('SELECT body').first();assert.equal(row.account,'private-account');
 const m=metrics.snapshot().sql.authentication.metadata['cloudflare-d1'];assert.equal(m.rowsReadSamples,0);assert.equal(m.rowsReadUnavailable,1);assert.equal(m.rowsWrittenSamples,0);
});
test('invalid metadata types stay unavailable rather than being coerced to billed rows',async()=>{
 const metrics=new RequestMetrics({app:'hifz'}),db=instrumentD1(reportedDB({success:true,meta:{rows_read:'7',rows_written:-1,changes:1.5}}),metrics,{scope:'business',metadataSource:'synthetic'});
 await db.prepare('SELECT 1').all();const m=metrics.snapshot().sql.business.metadata.synthetic;
 assert.equal(m.rowsReadUnavailable,1);assert.equal(m.rowsWrittenUnavailable,1);assert.equal(m.statementChangesUnavailable,1);
});
test('mixed guarded batch is one physical request with distinct authentication/business statements',async()=>{
 const f=database(),metrics=new RequestMetrics({app:'academy'});
 f.raw.exec('CREATE TABLE synthetic_business(id INTEGER);');
 const auth=instrumentD1(f.db,metrics,{scope:'authentication',metadataSource:'synthetic'}),business=instrumentD1(f.db,metrics,{scope:'business',metadataSource:'synthetic'});
 await auth.withSession('first-primary').batch([auth.prepare('INSERT INTO synthetic_business VALUES(?)').bind(1),business.prepare('INSERT INTO synthetic_business VALUES(?)').bind(2)]);
 const m=metrics.snapshot();assert.equal(m.sql.requests,1);assert.equal(m.sql.statements,2);assert.equal(m.sql.authentication.statements,1);assert.equal(m.sql.business.statements,1);assert.equal(m.sql.authentication.requestsContainingScope,1);assert.equal(m.sql.business.requestsContainingScope,1);
 assert.equal(f.raw.prepare('SELECT count(*) n FROM synthetic_business').get().n,2);f.raw.close();
});
test('re-wrapping a session handle does not double count or retain a prior request collector',async()=>{
 const f=database(),one=new RequestMetrics({app:'studio'}),two=new RequestMetrics({app:'studio'});
 const first=instrumentD1(f.db,one,{scope:'authentication',metadataSource:'synthetic'}),second=instrumentD1(first,two,{scope:'business',metadataSource:'synthetic'});
 await second.withSession('first-primary').prepare('SELECT 1').all();assert.equal(one.snapshot().sql.requests,0);assert.equal(two.snapshot().sql.business.statements,1);f.raw.close();
});
test('R2 counts controls/payloads/conditional writes without storing keys, bodies or etags',async()=>{
 const events=[],metrics=new RequestMetrics({app:'studio',emit:e=>events.push(e)}),raw=new Bucket(),prefix='auth-private/v2/production/studio/synthetic-generation/';
 const bucket=instrumentR2(raw,metrics,{scope:'authentication',authPrefix:prefix});
 const control=prefix+'security/session/private-session-id',payload=prefix+'rights/private-account/private-scope/hash';
 await bucket.put(control,'private-token-pin-rights-body',{onlyIf:new Headers({'If-None-Match':'*'})});
 await bucket.get(control);await bucket.get(payload);
 await bucket.put(control,'private-other-body',{onlyIf:{etagMatches:'wrong-private-etag'}});
 await bucket.put(prefix+'control/app','private-app-body');
 const m=metrics.snapshot();assert.equal(m.r2.authentication.controlReads,1);assert.equal(m.r2.authentication.payloadReads,1);assert.equal(m.r2.authentication.readMisses,1);assert.equal(m.r2.authentication.conditionalWriteRequests,2);assert.equal(m.r2.authentication.preconditionMisses,1);assert.equal(m.r2.authentication.unconditionalControlWrites,1);
 const logged=JSON.stringify({m,events});for(const secret of ['private-session-id','private-account','private-scope','private-token','private-etag','private-app-body'])assert(!logged.includes(secret));
});
test('eligible warm-shaped window has two controls and zero auth SQL while business SQL stays visible',async()=>{
 const metrics=new RequestMetrics({app:'hifz'}),raw=new Bucket(),prefix='auth-private/v2/production/hifz/synthetic-generation/';
 await raw.put(prefix+'control/app','{}');await raw.put(prefix+'security/session/synthetic','{}');
 const bucket=instrumentR2(raw,metrics,{scope:'authentication',authPrefix:prefix}),f=database('hifz'),business=instrumentD1(f.db,metrics,{scope:'business',metadataSource:'synthetic'});
 const before=metrics.snapshot();await bucket.get(prefix+'control/app');await bucket.get(prefix+'security/session/synthetic');await business.prepare('SELECT 1').all();
 assert.equal(measurementWindow(before,metrics.snapshot()).matchesEligibleTwoControlMemoHit,false);
 const window=measurementWindow(before,metrics.snapshot(),{authorisationOutcome:'allowed',immutableMemoHit:true});assert.equal(window.authSqlStatements,0);assert.equal(window.businessSqlStatements,1);assert.equal(window.controlReads,2);assert.equal(window.payloadReads,0);assert.equal(window.matchesEligibleTwoControlMemoHit,true);
 assert.equal(measurementWindow(before,metrics.snapshot(),{authorisationOutcome:'denied',immutableMemoHit:true}).matchesEligibleTwoControlMemoHit,false);
 await bucket.get(prefix+'unknown-private-key');assert.equal(measurementWindow(before,metrics.snapshot(),{authorisationOutcome:'allowed',immutableMemoHit:true}).matchesEligibleTwoControlMemoHit,false);f.raw.close();
});
test('latency is separate from explicitly synthetic CPU and bounded samples never carry callback payloads',async()=>{
 let wall=0,cpu=0;const emitted=[],m=new RequestMetrics({app:'academy',clock:()=>wall+=10,cpuClock:()=>cpu+=5,cpuSource:'synthetic',maxSamples:2,emit:e=>emitted.push(e)});
 const value=await m.measure({scope:'authentication',operation:'protected-request'},async()=>({pin:'private-pin',token:'private-token'}));assert.equal(value.pin,'private-pin');
 await m.measure({scope:'authentication',operation:'protected-request'},async()=>1);
 await assert.rejects(m.measure({scope:'authentication',operation:'protected-request'},async()=>{throw Error('private-account-private-rights');}));
 const record=m.snapshot().timings['authentication:protected-request'];assert.equal(record.count,3);assert.equal(record.wallMs,30);assert.equal(record.cpuMicros,15);assert.equal(record.cpuSource,'synthetic');assert.equal(record.samples.length,2);assert.equal(record.droppedSamples,1);assert.equal(record.errors,1);
 const text=JSON.stringify({snapshot:m.snapshot(),emitted});assert(!text.includes('private-pin'));assert(!text.includes('private-token'));assert(!text.includes('private-account'));
 const unknown=new RequestMetrics({app:'studio'});await unknown.measure({scope:'business',operation:'business-request'},async()=>0);assert.equal(unknown.snapshot().timings['business:business-request'].cpuUnavailable,1);
});
test('sensitive/freeform metric labels are rejected without echoing their value',async()=>{
 const m=new RequestMetrics({app:'studio'});await assert.rejects(m.measure({scope:'authentication',operation:'account-private@example.test'},async()=>0),e=>e.message==='METRIC_LABEL_REJECTED');
 assert.throws(()=>new RequestMetrics({app:'account-private@example.test'}),e=>e.message==='METRIC_LABEL_REJECTED');
 assert.throws(()=>instrumentD1({},m,{scope:'business',metadataSource:'private-source'}),e=>e.message==='METRIC_LABEL_REJECTED');
 assert.throws(()=>new RequestMetrics({app:'hifz',cpuClock:()=>1}),/CPU_SOURCE_REQUIRED/);
 assert.equal(typeof m.event,'undefined');assert.equal(JSON.stringify(m.snapshot()).includes('account-private'),false);
});
test('SQL errors retain only numeric/error outcome metrics, not query parameters or error text',async()=>{
 const events=[],m=new RequestMetrics({app:'studio',emit:e=>events.push(e)}),db=instrumentD1(reportedDB(null,{error:Error('private-pin-and-token')}),m,{scope:'authentication',metadataSource:'cloudflare-d1'});
 await assert.rejects(db.prepare('SELECT private_account WHERE pin=?').bind('private-secret').run());
 const result=m.snapshot();assert.equal(result.sql.failedRequests,1);assert.equal(result.sql.authentication.metadata['cloudflare-d1'].rowsWrittenUnavailable,1);assert(!JSON.stringify({result,events}).includes('private-'));
});
test('cache adapter deltas expose only known numeric counters and reject invalid windows',()=>{
 assert.deepEqual(cacheMetricDelta({controlReads:4,payloadReads:2,conditionalWrites:1,secret:'private'},{controlReads:6,payloadReads:2,conditionalWrites:1,secret:'private'}),{controlReads:2,payloadReads:0,conditionalWrites:0});
 assert.throws(()=>cacheMetricDelta({controlReads:4,payloadReads:0,conditionalWrites:0},{controlReads:2,payloadReads:0,conditionalWrites:0}),/INVALID_METRIC_WINDOW/);
});
test('fresh-memory native authority update records synthetic write amplification at 1, 10 and 100 SIDs',async()=>{
 const native=JSON.parse(readFileSync(new URL('../native-authority.json',import.meta.url),'utf8')),rule=native.rules.role_assignments,columns=native.schemaColumns.role_assignments,samples=[];
 for(const sidCount of [1,10,100]){
  const f=database('academy'),raw=f.raw;
  try{
   raw.exec('CREATE TABLE role_assignments('+columns.map(c=>'"'+c+'" '+(['active','revision'].includes(c)?'INTEGER':'TEXT')).join(',')+');');
   const subject='synthetic-cost-subject',values=columns.map(c=>c==='account_id'?subject:c==='active'||c==='revision'?1:c==='role'?'STUDENT':'synthetic-'+c);
   raw.prepare('INSERT INTO role_assignments('+columns.map(c=>'"'+c+'"').join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...values);
   const now=raw.prepare('SELECT unixepoch() now').get().now;
   for(let i=0;i<sidCount;i++){
    const sid=crypto.randomUUID(),psid=crypto.randomUUID(),bsid=crypto.randomUUID(),binding={ver:2,env:'production',iss:'https://synthetic.invalid',aud:'urn:synthetic:no-authority',sub:subject,sid,psid,bsid,bv:1,ce:4,ae:9,le:0,sv:1,ue:0,pv:'synthetic-no-authority',vat:now,s_iat:now,s_exp:now+604800},fp=createHash('sha256').update('non-authorizing-synthetic-row-'+i).digest('hex');
    raw.prepare("INSERT INTO jwt_v2_families(sid,sub,psid,bsid,bv,ce,ae,le,sv,ue,cr,state,s_iat,s_exp,vat,deadline,idle_until,last_refresh,policy_minutes,fingerprint,fingerprint_generation,binding_json,projection_json,authority_ready) VALUES(?,?,?,?,1,4,9,0,1,0,1,'UNLOCKED',?,?,?,?,?, ?,90,?,1,?,'{}',0)").run(sid,subject,psid,bsid,now,now+604800,now,now+900,now+5400,now,fp,JSON.stringify(binding));
   }
   const recipe=captureDDL({registry:{schema:2,app:'academy',rules:{role_assignments:rule}},available:{role_assignments:columns},ownerEpoch:'synthetic-cost-epoch'});raw.exec(recipe.sql);
   const metrics=new RequestMetrics({app:'academy'}),writer=instrumentD1(f.db,metrics,{scope:'business',metadataSource:'synthetic'});
   const before=raw.prepare('SELECT total_changes() n').get().n,start=performance.now();
   const result=await writer.prepare('UPDATE role_assignments SET role=? WHERE account_id=?').bind('TEACHER',subject).run();
   const wallLatencyMs=performance.now()-start,total=raw.prepare('SELECT total_changes() n').get().n-before;
   const familyUpdates=raw.prepare('SELECT count(*) n FROM jwt_v2_families WHERE cr=2 AND authority_ready=0').get().n,publicationRows=raw.prepare('SELECT count(*) n FROM jwt_v2_publications').get().n,worksets=raw.prepare('SELECT count(*) n FROM jwt_v2_worksets').get().n,outboxRows=raw.prepare('SELECT count(*) n FROM jwt_v2_native_outbox').get().n;
   assert.equal(result.meta.changes,1);assert.equal(familyUpdates,sidCount);assert.equal(publicationRows,sidCount);assert(total>result.meta.changes);
   assert.equal(metrics.snapshot().sql.business.metadata.synthetic.rowsWrittenSamples,0);
   samples.push({unexpiredLocalSids:sidCount,logicalNativeChanges:result.meta.changes,sqliteTotalChangedRows:total,capturedFamilyUpdates:familyUpdates,publicationRows,worksets,outboxRows,hostWallLatencyMs:wallLatencyMs,d1ReportedRowsReadAvailable:false,d1ReportedRowsWrittenAvailable:false,billedCloudflareRows:null,workerCpuMicros:null});
  }finally{raw.close();}
 }
 console.log('SYNTHETIC_WRITE_COST '+JSON.stringify({scope:'Successful one-row native business authority update with transaction-trigger security capture in disposable in-memory SQLite; synthetic families are non-authorizing.',samples,qualification:'SQLite total_changes includes local trigger effects. It is not billed D1 rows or Cloudflare Worker CPU; host wall latency is not provider latency/capacity.'}));
});
