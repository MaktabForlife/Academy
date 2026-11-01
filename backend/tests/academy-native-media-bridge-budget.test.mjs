import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {nativeMediaBridgeFixture} from './fixtures/academy-native-media-bridge-fixture.mjs';
import {ok} from './fixtures/academy-content-media-fixture.mjs';
import {summarizeContextReadCosts as summarize} from './fixtures/academy-context-read-growth.mjs';
import {lessonContextFilter} from '../src/academy/separation/lesson-context-read.js';
test('whole signed Source request records stable coordinator captures under unrelated growth, with indexed direct-read plans',async()=>{
 const reports=[];
 for(const growth of [0,250]){const f=await nativeMediaBridgeFixture({growth});try{
  const sourceRef=await f.sourceRef(),at=f.costs.length;ok(await f.signedMediaTeachers({sourceRef}));const captures=summarize(f.costs.slice(at)),plans={};
  for(const [kind,name] of [['classes','classes'],['teachers','accounts'],['teachers','effective_activity_roles'],['teachers','academy_teacher_designations']]){const filter=lessonContextFilter(name,{kind,values:[f.scope]});plans[kind+':'+name]=f.databases.core.prepare('EXPLAIN QUERY PLAN SELECT * FROM '+name+filter.where).all(...filter.params).map(r=>r.detail);}
  plans.sourceSession=f.databases.core.prepare('EXPLAIN QUERY PLAN SELECT * FROM website_platform_sessions WHERE source_ref=?').all(sourceRef).map(r=>r.detail);plans.offering=f.databases.core.prepare('EXPLAIN QUERY PLAN SELECT m.activity_key,s.enabled,o.state FROM website_platform_timetable_scopes m JOIN website_platform_access_scopes s USING(activity_key) LEFT JOIN website_platform_access_ownership o USING(activity_key) WHERE m.offering_id=?').all('synthetic-offering').map(r=>r.detail);
  assert(plans['classes:classes'].some(p=>/SEARCH.*INDEX/.test(p)));assert(!plans['teachers:accounts'].some(p=>p==='SCAN accounts'));assert(plans.sourceSession.some(p=>/SEARCH.*INDEX/.test(p)));assert(plans.offering.some(p=>p.includes('website_platform_ownership_nocase')));assert(!plans.offering.some(p=>/SCAN o/.test(p)));reports.push({growth,captures,plans});
 }finally{f.close();}}
 assert.equal(reports[0].captures.readCaptureRows,reports[1].captures.readCaptureRows);assert.equal(reports[0].captures.coordinatorStatements,reports[1].captures.coordinatorStatements);
 if(process.env.NATIVE_MEDIA_BRIDGE_BUDGET_OUTPUT)await writeFile(process.env.NATIVE_MEDIA_BRIDGE_BUDGET_OUTPUT,JSON.stringify({measurement:'Synthetic complete signed endpoint coordinator captures/statements and direct Core query plans; current-session direct reads are not coordinator captures. Not total physical scans or D1 billed rows_read.',registry:'The Teacher designation registry may scan its own registry; returned capture caps at 200, unrelated inactive registry scanning is not measured by captured-row counters.',hostedCalls:0,reports},null,2));console.log(JSON.stringify(reports.map(r=>({growth:r.growth,readCaptures:r.captures.readCaptureRows,coordinatorStatements:r.captures.coordinatorStatements}))));
});
