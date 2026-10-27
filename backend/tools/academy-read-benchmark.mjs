// Local-only synthetic benchmark. D1 counters come from Miniflare, never a
// hosted database. Run from backend: node tools/academy-read-benchmark.mjs
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitFixture} from '../tests/fixtures/academy-split-fixture.mjs';
import {seedReadHistory} from '../tests/fixtures/academy-read-history-fixture.mjs';
import {importSQL} from './academy-split/artifact.mjs';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {acceptedDatabase} from '../src/academy/d1/setup-reader.js';
import {publishedSessionFacts} from '../src/academy/d1/published-sessions.js';
import {actorProof} from '../src/academy/separation/proof.js';
import {splitEngine} from '../src/academy/separation/engine.js';
import {emptyCompatibilityDatabase} from '../src/academy/separation/compatibility.js';
import {emptyShapes} from '../src/academy/separation/empty-shapes.js';
import {federatedDatabase,federationContext} from '../src/academy/separation/federation.js';

const f=await splitFixture();let runtime;
try{
 seedReadHistory(f);
 const repository=academyD1Repository({...f.source.env,ACADEMY_DB:f.core,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_SPLIT_COORDINATOR:f.namespace}),state=await repository.byId(f.actors.global),session=await repository.createSession(state,state.contexts[0]),proof=actorProof({state,user:{accountid:state.account.account_id},sid:session.sid});
 runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("Local synthetic benchmark");}}',compatibilityDate:'2026-09-28',d1Databases:{CORE:'read-benchmark-core',ADMIN:'read-benchmark-admin'}}));
 const raw={core:await runtime.getD1Database('CORE'),admin:await runtime.getD1Database('ADMIN')};
 for(const owner of ['core','admin']){
  const db=f.databases[owner],objects=db.prepare("SELECT type,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all(),schema=f.prepared.schemas[owner],list=importSQL(db,schema,{statementsOnly:true}).flatMap(sql=>sql===schema.tableSQL?objects.filter(o=>o.type==='table').map(o=>o.sql):sql===schema.afterSQL?objects.filter(o=>o.type!=='table').map(o=>o.sql):[sql]);
  for(let i=0;i<list.length;i+=30)await raw[owner].batch(list.slice(i,i+30).map(sql=>raw[owner].prepare(sql)));
 }
 let cost;
 const record=result=>{cost.queries++;cost.rowsRead+=result.meta.rows_read;cost.rowsWritten+=result.meta.rows_written;return result;};
 const measured=db=>({
  prepare(sql){let params=[];const s={sql,get params(){return params;},bind(...v){params=v;return s;},async all(){return record(await db.prepare(sql).bind(...params).all());},async first(column){const row=(await s.all()).results[0]||null;return column?row?.[column]??null:row;}};return s;},
  async batch(statements){return (await db.batch(statements.map(s=>db.prepare(s.sql).bind(...s.params)))).map(record);}
 });
 const core=emptyCompatibilityDatabase(measured(raw.core),emptyShapes,{currentGrants:true}),admin=measured(raw.admin);
 const measure=async action=>{cost={queries:0,rowsRead:0,rowsWritten:0};const value=await action();return {value,cost:{...cost}};};
 const iterations=10,statements=[{sql:'SELECT 1 AS permitted',params:[]}];
 const before=await measure(async()=>{const out=[];for(let i=0;i<iterations;i++)out.push(await splitEngine({core,admin}).read(statements,proof));return out;});
 const after=await measure(async()=>{const engine=splitEngine({core,admin}),out=[];for(let i=0;i<iterations;i++)out.push(await engine.read(statements,proof));return out;});
 const rows=value=>value.map(batch=>batch.map(result=>result.results));
 assert.deepEqual(rows(after.value),rows(before.value));
 async function facts(scoped){
  const context=federationContext({core,admin,owner:'admin'}),frames=[],db=acceptedDatabase(federatedDatabase({core,admin,owner:'admin',read:async statements=>{
   const data=await context.snapshot(statements.map(s=>s.sql),[],scoped?statements.map(s=>s.acceptedScope):null);frames.push(data);
   return Promise.all(statements.map(s=>context.query(s.sql,s.params,data)));
  }}),f.head);
  const value=await publishedSessionFacts({db},[f.scopes.programA,f.scopes.courseA]);
  return {value,capturedComponents:frames[0].setup_components.length,capturedVectors:frames[0].setup_head_components.length};
 }
 const full=await measure(()=>facts(false)),scoped=await measure(()=>facts(true));assert.deepEqual(scoped.value.value,full.value.value);
 const reduction=(a,b)=>Number((100*(1-b.rowsRead/a.rowsRead)).toFixed(2));
 console.log(JSON.stringify({
  source:'Disposable synthetic fixtures in local Miniflare D1; not production usage or a daily forecast',
  permissionRechecks:{reads:iterations,before:before.cost,after:after.cost,reductionPercent:reduction(before.cost,after.cost)},
  publishedTimetableCalendar:{activities:2,publicationHeads:13,before:{...full.cost,components:full.value.capturedComponents,vectors:full.value.capturedVectors},after:{...scoped.cost,components:scoped.value.capturedComponents,vectors:scoped.value.capturedVectors},reductionPercent:reduction(full.cost,scoped.cost)},
  identicalResults:true
 },null,2));
}finally{await runtime?.dispose();f.close();}
