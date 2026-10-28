import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/academy-runtime.js';
import {monthlyFixture,scope} from './fixtures/academy-monthly-subscriptions-fixture.mjs';
import {preparedTafseerCopies,preparedTafseerKey} from '../src/academy/course-books/tafseer-prepared.js';
const op=()=>crypto.randomUUID(),ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
test('prepared lesson packages are streamed only to current scoped Admins and never publish a website or accept arbitrary object keys',async()=>{
 const f=await monthlyFixture();try{
  const admin=await f.login('0001'),scoped=await f.login('0004'),student=await f.login('0002'),teacher=await f.login('0003');
  ok(await f.monthly('configure',{mode:'prepare',policyRevision:0,operationId:op()},admin));
  const id=op(),other=op();ok(await f.monthly('surah-save',{policyRevision:1,operationId:op(),entries:[{id,name:'Surah Al-Qasas',cardKey:'qasas',completionDate:'2025-11-30',active:true,revision:0},{id:other,name:'Another surah',cardKey:'other',completionDate:'2025-11-30',active:true,revision:0}]},admin));
  const copy=preparedTafseerCopies.qasas,bytes=Buffer.alloc(copy.size,32);bytes.write('{"synthetic":"private fixture"}');
  await f.env.LESSON_MEDIA_BUCKET.put(preparedTafseerKey(f.env,copy),bytes,{httpMetadata:{contentType:'application/json'}});
  const request=(token=admin,workspace='ADMIN',extra={})=>worker.fetch(new Request('http://localhost/api/admin/platform/course-websites/prepared-copy',{method:'POST',headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':workspace,'Content-Type':'application/json'},body:JSON.stringify({activityKey:scope,surahId:id,...extra})}),f.env);
  for(const token of [admin,scoped]){const response=await request(token);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('Content-Length'),String(copy.size));assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);}
  for(const token of [student,teacher])assert.equal((await request(token)).status,403);
  for(const workspace of ['LEARN','TEACH','ADMIN_LEARN','ADMIN_TEACH'])assert.equal((await request(admin,workspace)).status,403);
  assert.equal((await request(admin,'ADMIN',{activityKey:'PROGRAM:outside'})).status,403);
  assert.equal((await request(admin,'ADMIN',{surahId:other,objectKey:preparedTafseerKey(f.env,copy),cardKey:'qasas'})).status,404);
  assert.equal(f.db.prepare('SELECT count(*) n FROM program_surah_website_documents').get().n,0,'Fetching a prepared copy leaves publication and drafts unchanged');
  const selected=ok(await f.call('/api/admin/platform/course-websites/get',{activityKey:scope,surahId:id},admin));assert.equal(selected.preparedCopyAvailable,true);
  await f.env.LESSON_MEDIA_BUCKET.delete(preparedTafseerKey(f.env,copy));assert.equal((await request()).status,503);
 }finally{f.db.close();}
});
