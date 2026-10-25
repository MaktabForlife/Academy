import {readFileSync} from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
import {seedClassNotes} from './fixtures/academy-class-notes-fixture.mjs';
import worker from '../src/academy-runtime.js';
import {academyDate} from '../src/academy/d1/academy-clock.js';
test('real split HTTP Class Notes writes only Core, respects physical fences and preserves exact retries',async()=>{
 const f=await splitFixture(seedClassNotes);try{
  f.databases.core.exec('DROP TABLE class_note_versions; DROP TABLE class_notes; DROP TABLE class_note_contexts;');
  f.databases.core.exec(readFileSync(new URL('../migrations/academy-core/0001_class_notes.sql',import.meta.url),'utf8'));
  assert.equal(f.databases.core.prepare("SELECT count(*) n FROM sqlite_schema WHERE type='trigger' AND (name LIKE 'split_fence_class_note%' OR name LIKE 'split_epoch_class_note%')").get().n,18);
  f.databases.core.exec("UPDATE split_deployment_state SET state='READY'");Object.assign(f.source.env,{ACADEMY_DB:f.core,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:f.prepared.report.sourceDigest,ACADEMY_SPLIT_COORDINATOR:f.namespace,ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3'});
  const token=await f.source.login('0002'),date=academyDate(new Date(),'Africa/Johannesburg'),activityKey=f.scopes.programA;
  const call=async(action,input,workspace='LEARN',who=token)=>{const r=await worker.fetch(new Request('https://academy.test/api/academy/class-notes/'+action,{method:'POST',headers:{Authorization:'Bearer '+who,'Content-Type':'application/json','X-Academy-Workspace':workspace},body:JSON.stringify(input)}),f.source.env),body=await r.json();return {status:r.status,body};};
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
  const source=ok(await call('sessions',{activityKey,date})).sources[0],view=ok(await call('get',{activityKey,source}));assert(view.nextDue);
  const input={activityKey,source,sourceToken:source.token,body:'Split note حفظ الدرس',due:{mode:'NEXT',token:view.nextDue.token},operationId:crypto.randomUUID()},before=f.databases.core.prepare('SELECT version FROM split_read_state').get().version;
  const made=ok(await call('post',input));assert.equal(ok(await call('post',input)).replayed,true);assert(f.databases.core.prepare('SELECT version FROM split_read_state').get().version>before);
  assert.equal(f.databases.core.prepare('SELECT count(*) n FROM class_notes').get().n,1);assert(!f.databases.admin.prepare("SELECT 1 FROM sqlite_schema WHERE name='class_notes'").get());
  const global=await f.source.actor('global');assert.equal((await call('post',input,'ADMIN_LEARN',global)).status,403);assert.equal((await call('withdraw',{activityKey,noteId:made.noteId,revision:1,operationId:crypto.randomUUID()})).status,403);
  const change={...input,operationId:crypto.randomUUID()};f.databases.core.exec("INSERT INTO split_commands(command_id,phase,payload_hash,created_at) VALUES('held','PREPARING','held','now');INSERT INTO split_write_fence(singleton,command_id,allow_write) VALUES(1,'held',0)");assert.throws(()=>f.databases.core.prepare("UPDATE class_notes SET updated_at='blocked' WHERE note_id=?").run(made.noteId),/split_write_busy/);f.databases.core.exec('DELETE FROM split_write_fence');
  ok(await call('post',change));for(const db of Object.values(f.databases))assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
});
