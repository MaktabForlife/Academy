import test from 'node:test';
import assert from 'node:assert/strict';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
import {seedReadHistory} from './fixtures/academy-read-history-fixture.mjs';
import {acceptedDatabase} from '../src/academy/d1/setup-reader.js';
import {federatedDatabase,federationContext} from '../src/academy/separation/federation.js';
import {publishedSessionFacts,publishedSessionRange} from '../src/academy/d1/published-sessions.js';

function reader(f,head,scoped=true){
 const frames=[],context=federationContext({...f,owner:'admin'}),db=acceptedDatabase(federatedDatabase({...f,owner:'admin',read:async statements=>{
  const data=await context.snapshot(statements.map(s=>s.sql),[],scoped?statements.map(s=>s.acceptedScope):null);frames.push(data);
  return Promise.all(statements.map(s=>context.query(s.sql,s.params,data)));
 }}),head,{mediaSeparation:true});
 return {db,frames};
}
async function use(run){const f=await splitFixture();try{const historical=seedReadHistory(f);await run(f,historical);}finally{f.close();}}
test('published timetable/calendar facts capture only their pinned components with identical results',()=>use(async(f,historical)=>{
 const keys=[f.scopes.programA,f.scopes.courseA];
 for(const head of [f.head,historical]){
  const old=reader(f,head,false),next=reader(f,head),before=await publishedSessionFacts(old,keys),after=await publishedSessionFacts(next,keys);
  assert.deepEqual(after,before);
  const all=old.frames[0],some=next.frames[0];
  assert(some.setup_components.length<all.setup_components.length/10);
  assert(some.setup_head_components.every(r=>r.head_id===head&&['classes','timetable_publications','course_runs','course_run_state','academy_calendar_events','academy_calendar_suppressions','academy_settings'].includes(r.table_name)));
  const needed=new Set(some.setup_head_components.map(r=>r.component_id));
  for(const owner of ['core','admin'])assert((some.__splitSources[owner].setup_components||[]).every(r=>needed.has(r.component_id)));
  for(const key of keys){
   const activity={activity_key:key,activity_id:key.slice(key.indexOf(':')+1),kind:key.startsWith('PROGRAM:')?'PROGRAM':'COURSE'};
   assert.deepEqual(await publishedSessionRange(next,activity,'2026-10-19','2026-10-25',{facts:after.get(key.toUpperCase())}),await publishedSessionRange(old,activity,'2026-10-19','2026-10-25',{facts:before.get(key.toUpperCase())}));
  }
 }
}));
test('scoped published reads keep live disables, owner merging and non-definition settings current',()=>use(async f=>{
 const old=reader(f,f.head,false),next=reader(f,f.head),query='SELECT * FROM classes ORDER BY activity_key,class_id';
 assert.deepEqual(await next.db.prepare(query).all(),await old.db.prepare(query).all());
 await f.core.prepare('UPDATE classes SET active=0 WHERE activity_key=?').bind(f.scopes.programA).run();
 const before=await old.db.prepare(query).all(),after=await next.db.prepare(query).all();assert.deepEqual(after,before);
 assert(after.results.filter(r=>r.activity_key===f.scopes.programA).every(r=>r.active===0));
 await f.admin.prepare("UPDATE classes SET name='Unpublished class name' WHERE activity_key=?").bind(f.scopes.programA).run();
 assert.deepEqual(await next.db.prepare(query).all(),before,'Draft names cannot enter a pinned published read');
 for(const db of [f.core,f.admin])await db.prepare("INSERT INTO academy_settings(setting_key,setting_value) VALUES('AcademyWrite:READ_TEST','2')").run();
 const settings="SELECT * FROM academy_settings WHERE setting_key IN('PlatformTimezone','AcademyWrite:READ_TEST') ORDER BY setting_key";
 assert.deepEqual(await next.db.prepare(settings).all(),await old.db.prepare(settings).all());
 assert.equal((await next.db.prepare(settings).all()).results.find(r=>r.setting_key==='AcademyWrite:READ_TEST').setting_value,'4');
}));
test('mixed batches, explicit history queries and older coordinators retain unrestricted semantics',()=>use(async f=>{
 const old=reader(f,f.head,false),next=reader(f,f.head);
 const query='SELECT (SELECT count(*) FROM main.setup_components) history,(SELECT count(*) FROM classes) classes';
 assert.deepEqual(await next.db.prepare(query).all(),await old.db.prepare(query).all());
 const quoted='SELECT (SELECT count(*) FROM main."setup_components") history,(SELECT count(*) FROM classes) classes';
 assert.deepEqual(await next.db.prepare(quoted).all(),await old.db.prepare(quoted).all());
 assert(next.frames[0].setup_components.length>100,'An explicit history read is never narrowed');
 const context=federationContext({...f,owner:'admin'}),scoped=next.db.prepare('SELECT * FROM classes'),unscoped={sql:'SELECT * FROM setup_components',params:[]};
 const mixed=await context.snapshot([scoped.sql,unscoped.sql],[],[scoped.acceptedScope,null]);
 assert.equal(mixed.setup_components.length,next.frames[0].setup_components.length);
 const fallback=acceptedDatabase({prepare:sql=>f.core.prepare(sql),batch:items=>f.core.batch(items)},f.head);
 assert.deepEqual(await fallback.prepare('SELECT * FROM classes ORDER BY activity_key,class_id').all(),await acceptedDatabase(f.core,f.head).prepare('SELECT * FROM classes ORDER BY activity_key,class_id').all());
}));
test('a batch may pin different publication heads and invalid hints fall back to full capture',()=>use(async(f,historical)=>{
 const current=reader(f,f.head),past=reader(f,historical),baseline=reader(f,f.head,false),query='SELECT * FROM classes ORDER BY activity_key,class_id';
 const result=await current.db.batch([current.db.prepare(query),past.db.prepare(query)]);
 assert.deepEqual(result,[await baseline.db.prepare(query).all(),await reader(f,historical,false).db.prepare(query).all()]);
 assert.deepEqual(new Set(current.frames[0].setup_head_components.map(r=>r.head_id)),new Set([f.head,historical]));
 const context=federationContext({...f,owner:'admin'}),statement=current.db.prepare(query);
 const invalid=await context.snapshot([statement.sql],[],[{head:f.head,tables:['unknown_table']}]);
 assert.equal(invalid.setup_components.length,baseline.frames[0].setup_components.length);
}));
