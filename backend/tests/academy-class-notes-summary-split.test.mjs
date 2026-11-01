import {readFileSync} from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
import {seedClassNotes} from './fixtures/academy-class-notes-fixture.mjs';
import worker from '../src/academy-runtime.js';
import {academyDate} from '../src/academy/d1/academy-clock.js';

test('split HTTP programme summary reads current Core notes and rejects revoked account or class authority',async()=>{
 const f=await splitFixture(seedClassNotes);try{
  f.databases.core.exec('DROP TABLE class_note_versions; DROP TABLE class_notes; DROP TABLE class_note_contexts;');
  for(const name of ['0001_class_notes.sql','0022_class_notes_summary.sql'])f.databases.core.exec(readFileSync(new URL('../migrations/academy-core/'+name,import.meta.url),'utf8'));
  f.databases.core.exec("UPDATE split_deployment_state SET state='READY'");
  Object.assign(f.source.env,{ACADEMY_DB:f.core,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:f.prepared.report.sourceDigest,ACADEMY_SPLIT_COORDINATOR:f.namespace,ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3'});
  const token=await f.source.login('0002'),date=academyDate(new Date(),'Africa/Johannesburg'),activityKey=f.scopes.programA;
  const call=async(action,input,workspace='LEARN',who=token,extra={})=>{const response=await worker.fetch(new Request('https://academy.test/api/academy/class-notes/'+action,{method:'POST',headers:{Authorization:'Bearer '+who,'Content-Type':'application/json','X-Academy-Workspace':workspace,...extra},body:JSON.stringify(input)}),f.source.env);return {status:response.status,body:await response.json()};};
  const good=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
  const source=good(await call('sessions',{activityKey,date})).sources.find(s=>s.classId==='class-1'&&s.startTime==='10:00');
  const view=good(await call('get',{activityKey,source})),made=good(await call('post',{activityKey,source,sourceToken:source.token,body:'Current programme note',due:{mode:'NEXT',token:view.nextDue.token},operationId:crypto.randomUUID()}));
  const version=f.databases.core.prepare('SELECT version FROM split_read_state').get().version;
  const result=good(await call('summary',{activityKey,limit:3}));assert.equal(result.notes[0].id,made.noteId);assert.equal(result.notes[0].source.canPost,true);assert.equal(result.window.months,3);
  assert.equal(f.databases.core.prepare('SELECT version FROM split_read_state').get().version,version,'summary must not write notes or access state');
  assert(!f.databases.admin.prepare("SELECT 1 FROM sqlite_schema WHERE name='class_notes'").get());
  const global=await f.source.actor('global'),preview=good(await call('summary',{activityKey},'ADMIN_LEARN',global));assert(preview.notes.length);assert(preview.notes.every(n=>!n.canEdit&&!n.source.canPost));
  const selected=good(await call('summary',{activityKey},'ADMIN_LEARN',global,{'X-Academy-Class':encodeURIComponent(JSON.stringify({activityKey,classId:'class-shared'}))}));assert.deepEqual(selected.notes,[]);
  f.databases.core.prepare("UPDATE class_memberships SET active=0 WHERE account_id='account-0002' AND activity_key=?").run(activityKey);
  assert.equal((await call('summary',{activityKey})).status,403);
  f.databases.core.prepare("UPDATE account_sessions SET revoked_at=? WHERE account_id='account-0002'").run(new Date().toISOString());
  assert.equal((await call('summary',{activityKey})).status,401);
  f.databases.core.prepare('UPDATE account_credentials SET credential_epoch=credential_epoch+1 WHERE account_id=?').run(f.actors.global);
  assert.equal((await call('summary',{activityKey},'ADMIN_LEARN',global)).status,401);
  for(const db of Object.values(f.databases))assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
});
