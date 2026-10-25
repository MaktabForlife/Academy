import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {acceptedDatabase} from '../src/academy/d1/setup-reader.js';
import {setupSchema} from '../src/academy/d1/setup-schema.js';
import {rewriteRead} from '../src/academy/separation/federation.js';

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
