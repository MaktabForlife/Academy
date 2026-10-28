import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import {admissionFixture,admissionRows,admissionUpgrade,originalAdmission} from './fixtures/academy-publication-admission-fixture.mjs';
import {publicationAdmissionMigration} from '../tools/academy-publication-admission-migration.mjs';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
const cases=[
 {name:'forty published PDFs and forty mixed videos across forty sessions',rows:admissionRows({count:40,pdfs:1,videos:1}),allowed:true},
 {name:'ten official PDFs plus forty videos in a session',rows:admissionRows({pdfs:10,videos:40}),allowed:true},
 {name:'eleven official PDFs',rows:admissionRows({pdfs:11}),allowed:false},
 {name:'eight official PDFs and two active own notes, with withdrawn history',rows:admissionRows({pdfs:8,notes:2,withdrawn:5}),allowed:true},
 {name:'eight official PDFs and three active own notes',rows:admissionRows({pdfs:8,notes:3}),allowed:false},
 {name:'withdrawn notes do not consume the limit',rows:admissionRows({pdfs:10,withdrawn:4}),allowed:true},
 {name:'Course attachment scope retains its existing rule',rows:admissionRows({pdfs:11,mediaScope:'COURSE'}),allowed:true},
 {name:'unpublished lesson PDFs stay private until publication',rows:admissionRows({pdfs:11,state:'DRAFT'}),allowed:true},
 {name:'hidden lesson PDFs retain their existing rule',rows:admissionRows({pdfs:11,state:'HIDDEN'}),allowed:true},
 {name:'legacy absent media scope still uses the session cap',rows:admissionRows({pdfs:11,mediaScope:null}),allowed:false},
 {name:'same session labels across Programs do not combine PDF limits',rows:admissionRows({pdfs:9,notes:1}),extra:[admissionRows({pdfs:9,notes:1,activity:'PROGRAM:two'})],allowed:true},
 {name:'another published session cannot hide an over-limit lesson',rows:admissionRows({pdfs:1}),extra:[admissionRows({pdfs:11,activity:'PROGRAM:two'})],allowed:false},
 {name:'archived unpublished heads cannot change current admission',rows:admissionRows({pdfs:1}),archived:[admissionRows({pdfs:11,activity:'PROGRAM:archive'})],allowed:true}
];
for(const scenario of cases)test('publication admission preserves '+scenario.name,()=>{
 for(const upgrade of [false,true])for(const action of ['insert','update']){const f=admissionFixture({...scenario,upgrade});try{
  if(scenario.allowed){f[action]();assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,'candidate');}
  else{assert.throws(()=>f[action](),/lesson_media_pdf_limit/);assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get()?.head_id,action==='update'?'old':undefined);}
 }finally{f.close();}}
});
test('the reviewed source/Core trigger upgrade is identical, repeatable and leaves data and unrelated guards intact',()=>{
 const source=readFileSync(new URL('../migrations/academy/0044_publication_pdf_projection_cache.sql',import.meta.url),'utf8');assert.equal(source,admissionUpgrade);assert.equal(publicationAdmissionMigration(originalAdmission),source);
 assert.throws(()=>publicationAdmissionMigration([]),/reviewed publication/);assert.throws(()=>publicationAdmissionMigration(originalAdmission.map(r=>({...r,sql:r.sql.replace('links AS(','other AS(')}))),/Unexpected publication/);
 const f=admissionFixture();try{
  f.db.exec('CREATE TRIGGER unrelated_guard BEFORE DELETE ON setup_head_state BEGIN SELECT RAISE(ABORT,\'keep_guard\'); END;');f.insert();
  const before=f.db.prepare('SELECT * FROM setup_components').all();f.db.exec(admissionUpgrade);f.db.exec(admissionUpgrade);assert.deepEqual(f.db.prepare('SELECT * FROM setup_components').all(),before);assert.throws(()=>f.db.exec('DELETE FROM setup_head_state'),/keep_guard/);
 }finally{f.close();}
});
test('fresh split generation inherits the improved source guards in Core without adding Admin authority tables',async()=>{
 const f=await splitFixture(source=>source.db.exec(admissionUpgrade));try{
  const triggers=f.databases.core.prepare("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name LIKE 'lesson_media_accepted_pdf_limit_%'").all();assert.equal(triggers.length,2);for(const trigger of triggers)assert.equal((trigger.sql.match(/AS MATERIALIZED/g)||[]).length,3);
  assert.equal(f.databases.admin.prepare("SELECT count(*) n FROM sqlite_schema WHERE name LIKE 'lesson_media_accepted_pdf_limit_%'").get().n,0);
  for(const db of Object.values(f.databases))assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
});
