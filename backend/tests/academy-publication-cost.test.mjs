import test from 'node:test';import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {admissionSchema,originalAdmission,admissionUpgrade,admissionRows} from './fixtures/academy-publication-admission-fixture.mjs';
const upgradedStatements=[...admissionUpgrade.matchAll(/DROP TRIGGER[^;]+;|CREATE TRIGGER[\s\S]+? END;/g)].map(m=>m[0]);
async function schema(db){await db.batch([...admissionSchema,...originalAdmission.map(t=>t.sql)].map(s=>db.prepare(s)));}
async function seed(db,head,rows){
 for(const [table,list]of [['lesson_media_lessons',rows.lessons],['lesson_media_links',rows.links],['lesson_media_assets',rows.assets]]){
  const id=head+'-'+table;await db.batch([db.prepare('INSERT INTO setup_components VALUES(?,?,?,?,?)').bind(id,'batch',table,'GLOBAL',JSON.stringify(list)),db.prepare('INSERT INTO setup_head_components VALUES(?,?,?,?)').bind(head,table,'GLOBAL',id)]);
 }
 for(const note of rows.ownNotes)await db.prepare('INSERT INTO lesson_note_entries VALUES(?,?,?)').bind(note.activity_key,note.session_key,note.state).run();
}
const runtime=()=>new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default{fetch(){return new Response("synthetic local publication test");}}',compatibilityDate:'2026-09-28',d1Databases:{ONE:'publication-cost-one',BULK:'publication-cost-bulk',FIFTY:'publication-cost-fifty',ATOMIC:'publication-atomic'}}));
test('native D1 bulk publication reads reuse JSON once and retain small-publication behaviour',async()=>{
 const mf=runtime(),costs=[];try{
  assert.equal(upgradedStatements.length,4);
  for(const [binding,count,videos]of [['ONE',1,1],['BULK',40,1],['FIFTY',50,0]]){
   const db=await mf.getD1Database(binding);await schema(db);const rows=admissionRows({count,pdfs:1,videos});await seed(db,'candidate',rows);await db.prepare("INSERT INTO setup_head_state VALUES(1,'candidate')").run();
   const upsert="INSERT INTO setup_head_state VALUES(1,'candidate') ON CONFLICT(singleton) DO UPDATE SET head_id=excluded.head_id",update="UPDATE setup_head_state SET head_id='candidate' WHERE singleton=1";
   const old=(await db.prepare(upsert).run()).meta,updateOnly=(await db.prepare(update).run()).meta;
   await db.batch(upgradedStatements.map(s=>db.prepare(s)));
   const materialized=(await db.prepare(upsert).run()).meta,after=(await db.prepare(update).run()).meta;
   assert(after.rows_read<old.rows_read);if(count>=40)assert(after.rows_read<=old.rows_read*.2,'Bulk publication must avoid repeated JSON scans');
   assert.equal(after.rows_written,1);assert.equal(old.rows_written,1);
   costs.push({publishedLessons:count,pdfs:rows.assets.filter(a=>a.kind==='PDF').length,videos:rows.assets.filter(a=>a.kind!=='PDF').length,beforeRows:old.rows_read,updateOnlyRows:updateOnly.rows_read,materializedOnlyRows:materialized.rows_read,afterRows:after.rows_read,reductionPercent:Number(((1-after.rows_read/old.rows_read)*100).toFixed(2))});
  }
  console.log('Synthetic publication validation D1 costs',JSON.stringify(costs));
 }finally{await mf.dispose();}
});
test('native D1 trigger upgrade and rejected publication both roll back atomically',async()=>{
 const mf=runtime();try{
  const db=await mf.getD1Database('ATOMIC');await schema(db);await seed(db,'good',admissionRows({pdfs:1}));await db.prepare("INSERT INTO setup_head_state VALUES(1,'good')").run();
  await assert.rejects(db.batch([...upgradedStatements.map(s=>db.prepare(s)),db.prepare("INSERT INTO setup_head_state VALUES(1,'good')")]),/UNIQUE constraint/);
  let triggers=(await db.prepare("SELECT sql FROM sqlite_schema WHERE name LIKE 'lesson_media_accepted_pdf_limit_%'").all()).results;assert.equal(triggers.length,2);assert(triggers.every(t=>!t.sql.includes('AS MATERIALIZED')),'Failed schema upgrade keeps both original guards');
  await db.batch(upgradedStatements.map(s=>db.prepare(s)));triggers=(await db.prepare("SELECT sql FROM sqlite_schema WHERE name LIKE 'lesson_media_accepted_pdf_limit_%'").all()).results;assert(triggers.every(t=>t.sql.includes('AS MATERIALIZED')));
  await seed(db,'invalid',admissionRows({pdfs:9,notes:2,activity:'PROGRAM:invalid'}));await db.prepare('CREATE TABLE publication_probe(id INTEGER PRIMARY KEY)').run();
  await assert.rejects(db.batch([db.prepare('INSERT INTO publication_probe VALUES(1)'),db.prepare("UPDATE setup_head_state SET head_id='invalid' WHERE singleton=1")]),/lesson_media_pdf_limit/);
  assert.equal((await db.prepare('SELECT count(*) n FROM publication_probe').first()).n,0);assert.equal((await db.prepare('SELECT head_id FROM setup_head_state').first()).head_id,'good');
  await assert.rejects(db.prepare("INSERT INTO setup_head_state VALUES(2,'invalid')").run(),/lesson_media_pdf_limit/,'The improved bootstrap/INSERT path also enforces the limit');
 }finally{await mf.dispose();}
});
