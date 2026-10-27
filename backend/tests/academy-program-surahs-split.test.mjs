import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {splitVideoFixture} from './fixtures/academy-session-video-split-fixture.mjs';
import worker from '../src/academy-runtime.js';
import {storeColumns} from '../src/academy/separation/columns.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;},op=()=>crypto.randomUUID();
test('split surah websites keep drafts private, publish only one surah and protect PDFs with live manual completion dates',async()=>{
 const f=await splitVideoFixture();try{
  const core=f.databases.core,scope=f.scopes.programA;
  core.exec(readFileSync(new URL('../migrations/academy-core/0005_program_monthly_subscriptions.sql',import.meta.url),'utf8'));
  // Check the additive hosted migration against freshly generated split schemas.
  for(const owner of ['core','admin']){
   const db=f.databases[owner],tables=owner==='core'?['program_surahs','program_surah_website_documents','program_surah_website_assets']:['program_surah_website_documents','program_surah_website_assets'];
   for(const table of tables)db.exec('DROP TABLE '+table);
   db.exec(readFileSync(new URL('../migrations/academy-'+owner+'/'+(owner==='core'?'0006':'0002')+'_program_surah_websites.sql',import.meta.url),'utf8'));
   for(const table of tables)assert.deepEqual(db.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name),storeColumns[owner][table]);
  }
  for(const db of Object.values(f.databases))db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Tafseer',scope);
  f.source.env.ACADEMY_MONTHLY_SUBSCRIPTIONS='1';
  const admin=await f.source.actor('global'),student=await f.source.login('0002'),monthly=(action,input)=>f.request('/api/admin/platform/program-monthly-subscriptions/'+action,{activityKey:scope,...input},admin),site=(action,id,input={})=>f.request('/api/admin/platform/course-websites/'+action,{activityKey:scope,surahId:id,...input},admin);
  ok(await monthly('configure',{mode:'prepare',policyRevision:0,operationId:op()}));
  const id=op(),second=op();
  ok(await monthly('surah-save',{policyRevision:1,operationId:op(),entries:[{id,name:'Surah Maryam',completionDate:'2024-01-16',active:true,revision:0},{id:second,name:'Surah Yusuf',completionDate:'2024-01-28',active:true,revision:0}]}));
  ok(await monthly('grid-save',{policyRevision:2,operationId:op(),entries:[{accountId:'account-0002',month:'2024-01',subscribed:true,revision:0,classIds:['class-1']}]}));
  ok(await monthly('configure',{mode:'activate',policyRevision:3,operationId:op(),reviewed:true}));
  const bytes=Buffer.from('%PDF-1.4\n% Full surah PDF\n%%EOF'),assetId=op(),metadata={activityKey:scope,surahId:id,assetId,operationId:op(),filename:'maryam.pdf',type:'application/pdf',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  const uploaded=await worker.fetch(new Request('http://localhost/api/admin/platform/course-websites/upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{method:'POST',headers:{Authorization:'Bearer '+admin,'X-Academy-Workspace':'ADMIN'},body:bytes}),f.source.env);assert.equal(uploaded.status,200,await uploaded.text());
  const view=ok(await site('get',id));view.document.materials.files=[{id:op(),assetId,title:'Full surah PDF',description:''}];
  const first=ok(await site('save',id,{document:view.document,revision:0,operationId:op()})),other=ok(await site('get',second));
  ok(await site('save',second,{document:other.document,revision:0,operationId:op()}));
  assert.equal(core.prepare('SELECT document_json FROM program_surah_website_documents WHERE surah_id=?').get(id).document_json,null);
  const read=(surahId,extra={})=>f.request('/api/academy/course-websites/read',{activityKey:scope,surahId,...extra},student,'LEARN');
  assert.equal((await read(id)).status,404);
  const published=ok(await site('publish',id,{revision:first.revision,operationId:op()}));assert(published.acceptedChange);
  ok(await f.request('/api/academy/changes/accept',published.acceptedChange,admin));
  assert.equal(ok(await read(id)).document.name,'Surah Maryam');assert.equal((await read(second)).status,404,'A sibling surah draft stays private even for an otherwise eligible student');
  const pdf=()=>worker.fetch(new Request('http://localhost/api/academy/course-websites/asset',{method:'POST',headers:{Authorization:'Bearer '+student,'X-Academy-Workspace':'LEARN','Content-Type':'application/json'},body:JSON.stringify({activityKey:scope,surahId:id,assetId})}),f.source.env);
  let response=await pdf();assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  const rows=ok(await monthly('surahs',{})),row=rows.surahs.find(s=>s.id===id);
  ok(await monthly('surah-save',{policyRevision:rows.policyRevision,operationId:op(),entries:[{id,name:row.name,completionDate:'2025-02-10',active:true,revision:row.revision}]}));
  assert.equal((await read(id,{completionDate:'2024-01-16'})).status,403);assert.equal((await pdf()).status,403,'A cached/accepted website cannot bypass the live source-of-truth date');
  for(const db of Object.values(f.databases))assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
});
