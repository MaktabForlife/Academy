import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {acceptedDatabase} from '../src/academy/d1/setup-reader.js';
import {setupSchema} from '../src/academy/d1/setup-schema.js';
import {rewriteRead} from '../src/academy/separation/federation.js';
import {academyD1Repository} from '../src/academy/d1/repository.js';

const captured={prepare(sql){return {sql,params:[],bind(...params){this.params=params;return this;}};}};
test('joined timetable and assessment projections preserve results while reducing actual local D1 row scans',async()=>{
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("Local query benchmark");}}',compatibilityDate:'2026-09-28',d1Databases:{DB:'academy-query-cost'}}));
 try{
  const db=await runtime.getD1Database('DB'),counts=[];
  async function compare(name,compiled){
   const before=await db.prepare(compiled.sql.replace(/\bAS MATERIALIZED\s*\(/g,'AS (')).bind(...compiled.params).all();
   const after=await db.prepare(compiled.sql).bind(...compiled.params).all();
   assert.deepEqual(after.results,before.results,name+' keeps the exact reader result');
   assert(before.meta.rows_read>10000,JSON.stringify(before.meta));
   assert(after.meta.rows_read<before.meta.rows_read/3,JSON.stringify({name,before:before.meta,after:after.meta}));
   counts.push({name,returned:after.results.length,before:before.meta.rows_read,after:after.meta.rows_read,reduction:1-after.meta.rows_read/before.meta.rows_read});
  }
  const activities=Array.from({length:5},(_,i)=>({activity_key:'PROGRAM:'+i,activity_id:String(i),kind:'PROGRAM',name:'Synthetic '+i,active:1,lifecycle:'ACTIVE',website_visible:1,revision:1}));
  const publications=Array.from({length:20},(_,i)=>({activity_key:'PROGRAM:'+(i%5),publication_id:'pub-'+i,scope_key:'scope-'+i,version_no:1,pattern:'PROGRAM'}));
  const lessons=Array.from({length:400},(_,i)=>({activity_key:'PROGRAM:'+(i%5),publication_id:'pub-'+(i%20),lesson_anchor:'lesson-'+i,status:'SCHEDULED',title:'Lesson '+i}));
  const teachers=lessons.map((r,i)=>({...r,account_id:'teacher-'+(i%20)}));
  const tables={activities,timetable_publications:publications,published_lessons:lessons,published_lesson_teachers:teachers};
  await db.prepare('CREATE TABLE setup_head_components(head_id TEXT,table_name TEXT,component_id TEXT)').run();
  await db.prepare('CREATE INDEX head_table ON setup_head_components(head_id,table_name)').run();
  await db.prepare('CREATE TABLE setup_components(component_id TEXT PRIMARY KEY,rows_json TEXT)').run();
  for(const [name,rows] of Object.entries(tables)){
   const spec=setupSchema[name];
   await db.prepare('CREATE TABLE '+name+'('+spec.columns.map(c=>'"'+c+'" '+(['active','website_visible','revision'].includes(c)?'INTEGER':'TEXT')).join(',')+',PRIMARY KEY('+spec.keys.join(',')+'))').run();
   for(let i=0;i<rows.length;i+=50)await db.batch(rows.slice(i,i+50).map(row=>db.prepare('INSERT INTO '+name+'('+Object.keys(row).filter(k=>spec.columns.includes(k)).join(',')+') VALUES('+Object.keys(row).filter(k=>spec.columns.includes(k)).map(()=>'?').join(',')+')').bind(...Object.keys(row).filter(k=>spec.columns.includes(k)).map(k=>row[k]))));
   await db.prepare('INSERT INTO setup_head_components VALUES(?,?,?)').bind('accepted-benchmark',name,name).run();
   await db.prepare('INSERT INTO setup_components VALUES(?,?)').bind(name,JSON.stringify(rows)).run();
  }
  const timetable=acceptedDatabase(captured,'accepted-benchmark').prepare("SELECT l.lesson_anchor,t.account_id,p.scope_key,a.name FROM published_lessons l JOIN published_lesson_teachers t USING(activity_key,publication_id,lesson_anchor) JOIN timetable_publications p USING(activity_key,publication_id) JOIN activities a USING(activity_key) WHERE t.account_id=? AND l.status='SCHEDULED' AND a.active=1 ORDER BY l.lesson_anchor").bind('teacher-1');
  await compare('accepted timetable / teacher join',timetable);
  const classes=Array.from({length:50},(_,i)=>({activity_key:'PROGRAM:'+(i%5),class_id:'class-'+i,name:'Class '+i,active:1}));
  const phases=Array.from({length:100},(_,i)=>({phase_id:'phase-'+i,activity_key:'PROGRAM:'+(i%5),name:'Phase '+i}));
  const assessments=Array.from({length:400},(_,i)=>({assessment_id:'assessment-'+i,activity_key:'PROGRAM:'+(i%5),class_id:'class-'+(i%50),phase_id:'phase-'+(i%100),title:'Assessment '+i}));
  const assessment=rewriteRead('SELECT x.assessment_id,x.title,c.name class_name,p.name phase_name,a.name activity_name FROM assessments x JOIN classes c USING(activity_key,class_id) JOIN assessment_phases p USING(phase_id) JOIN activities a USING(activity_key) WHERE c.active=1 AND a.active=1 ORDER BY x.assessment_id',[],{assessments,classes,assessment_phases:phases,activities});
  await compare('federated assessment / class / phase join',assessment);
  console.log('Synthetic D1 read costs',JSON.stringify(counts));
 }finally{await runtime.dispose();}
});

test('readiness retains live guards while fixed published settings stop scanning components on warm requests',async()=>{
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("Local readiness benchmark");}}',compatibilityDate:'2026-09-28',d1Databases:{DB:'academy-readiness-cost'}}));
 try{
  const db=await runtime.getD1Database('DB');
  for(const sql of ['CREATE TABLE split_deployment_state(singleton INTEGER PRIMARY KEY,generation TEXT,state TEXT,source_digest TEXT)','CREATE TABLE accounts(account_id TEXT PRIMARY KEY,active INTEGER)','CREATE TABLE global_role_assignments(account_id TEXT,active INTEGER,role TEXT,review_state TEXT)','CREATE TABLE academy_settings(setting_key TEXT PRIMARY KEY,setting_value TEXT,updated_at TEXT,updated_by_account_id TEXT)','CREATE TABLE setup_head_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),head_id TEXT)','CREATE TABLE setup_head_components(head_id TEXT,table_name TEXT,scope_key TEXT,component_id TEXT,PRIMARY KEY(head_id,table_name,scope_key))','CREATE TABLE setup_components(component_id TEXT PRIMARY KEY,rows_json TEXT)',"INSERT INTO split_deployment_state VALUES(1,'SPLIT_V1','READY','read-cost-digest')","INSERT INTO accounts VALUES('active-account',1)","INSERT INTO global_role_assignments VALUES('active-account',1,'GLOBAL_ADMIN','CONFIRMED')","INSERT INTO setup_head_state VALUES(1,'read-cost-head')","INSERT INTO academy_settings VALUES('ProgramWorkspace','1',NULL,NULL)","INSERT INTO academy_settings VALUES('PersonalMemorisationCards','1',NULL,NULL)"])await db.prepare(sql).run();
  const components=Array.from({length:700},(_,i)=>({id:'component-'+i,table:i===699?'academy_settings':'other',scope:i===699?'GLOBAL':'scope-'+i,rows:JSON.stringify(i===699?[{setting_key:'PlatformTimezone',setting_value:'Africa/Johannesburg'},{setting_key:'PersonalMemorisationCards',setting_value:'1'}]:[{name:'Unrelated component'}])}));
  await db.batch([db.prepare("INSERT INTO setup_components SELECT json_extract(value,'$.id'),json_extract(value,'$.rows') FROM json_each(?)").bind(JSON.stringify(components)),db.prepare("INSERT INTO setup_head_components SELECT 'read-cost-head',json_extract(value,'$.table'),json_extract(value,'$.scope'),json_extract(value,'$.id') FROM json_each(?)").bind(JSON.stringify(components))]);
  const before=await db.prepare(`SELECT generation,source_digest,1 mapped_roles,
   (SELECT setting_value FROM academy_settings WHERE setting_key='ProgramWorkspace') program_workspace,
   (SELECT setting_value FROM academy_settings WHERE setting_key='PersonalMemorisationCards') memorisation_cards,
   (SELECT json_extract(row.value,'$.setting_value') FROM setup_head_state h JOIN setup_head_components v ON v.head_id=h.head_id AND v.table_name='academy_settings' JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE json_extract(row.value,'$.setting_key')='PlatformTimezone' LIMIT 1) timezone
   FROM split_deployment_state WHERE singleton=1 AND generation='SPLIT_V1' AND state='READY' AND source_digest='read-cost-digest'
   AND EXISTS(SELECT 1 FROM setup_head_state) AND EXISTS(SELECT 1 FROM accounts WHERE active=1)
   AND EXISTS(SELECT 1 FROM global_role_assignments WHERE active=1 AND role='GLOBAL_ADMIN' AND review_state='CONFIRMED')`).all();
  const costs=[],counted={withSession(){return counted;},prepare(sql){let statement=db.prepare(sql);const wrapper={bind(...values){statement=statement.bind(...values);return wrapper;},async all(){const result=await statement.all();costs.push({sql,reads:result.meta.rows_read});return result;},async first(){return (await wrapper.all()).results[0]||null;}};return wrapper;}};
  const env={ENVIRONMENT:'development',ACADEMY_D1_MODE:'ACTIVE',ACADEMY_D1_RUN_ID:'read-cost-digest',ACADEMY_LIBRARY_MODE:'PUBLIC_ONLY',ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_DB:counted,ACADEMY_ADMIN_DB:counted,ACADEMY_SPLIT_COORDINATOR:{getByName(){throw Error('Readiness never needs a private Admin read');}}};
  const first=academyD1Repository(env);await first.ready();const cold=costs.reduce((n,r)=>n+r.reads,0),expected=before.results[0];
  assert.equal((await first.homeConfiguration()).setting_value,expected.timezone);
  costs.length=0;const second=academyD1Repository(env);await second.ready();const warm=costs.reduce((n,r)=>n+r.reads,0);
  assert.equal((await second.homeConfiguration()).setting_value,expected.timezone);assert.equal(costs.length,1);assert(!costs.some(c=>c.sql.includes('json_each')));
  assert(before.meta.rows_read>700);assert(warm<before.meta.rows_read/20,JSON.stringify({before:before.meta.rows_read,cold,warm}));
  console.log('Synthetic readiness D1 row costs',JSON.stringify({before:before.meta.rows_read,cold,warm}));
 }finally{await runtime.dispose();}
});
