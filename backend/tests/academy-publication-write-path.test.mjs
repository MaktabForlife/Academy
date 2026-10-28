import test from 'node:test';import assert from 'node:assert/strict';
import {classNotesFixture} from './fixtures/academy-class-notes-fixture.mjs';
import {admissionUpgrade} from './fixtures/academy-publication-admission-fixture.mjs';
import {initialiseAcceptedSetup} from '../src/academy/d1/setup-publication.js';
import worker from '../src/academy-runtime.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;},op=()=>crypto.randomUUID();
const observeAdmission=`CREATE TABLE publication_observations(singleton INTEGER PRIMARY KEY,inserts INTEGER,updates INTEGER);
 INSERT INTO publication_observations VALUES(1,0,0);
 CREATE TRIGGER observe_head_insert BEFORE INSERT ON setup_head_state BEGIN UPDATE publication_observations SET inserts=inserts+1; END;
 CREATE TRIGGER observe_head_update BEFORE UPDATE ON setup_head_state BEGIN UPDATE publication_observations SET updates=updates+1; END;`;
test('bootstrap and reviewed publication each admit once, with current scope/session checks and exact retry',async()=>{
 const f=await classNotesFixture(source=>source.db.exec(admissionUpgrade+'\n'+observeAdmission));try{
  const observations=()=>({...f.db.prepare('SELECT inserts,updates FROM publication_observations').get()});
  assert.deepEqual(observations(),{inserts:1,updates:0},'Bootstrap admits once through INSERT');
  const original=f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,existing=await initialiseAcceptedSetup(f.env.ACADEMY_DB);assert.equal(existing.head,original);assert.equal(existing.existing,true);assert.deepEqual(observations(),{inserts:1,updates:0});
  const tokens={global:await f.actor('global'),other:await f.actor('adminB'),student:await f.actor('studentA')};
  const call=async(action,input,who='global')=>{const path=action.startsWith('/')?action:'/api/admin/platform/course-websites/'+action,response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens[who],'X-Academy-Workspace':who==='student'?'LEARN':'ADMIN'},body:JSON.stringify(input)}),f.env);return {status:response.status,body:await response.json()};};
  const area={activityKey:f.scopes.courseA},view=ok(await call('get',area));view.document.name='Reviewed once';
  const saved=ok(await call('save',{...area,document:view.document,revision:0,operationId:op()})),staged=ok(await call('publish',{...area,revision:saved.revision,operationId:op()}));
  assert.deepEqual(observations(),{inserts:1,updates:0},'Draft saves and staging never advance the published head');
  for(const who of ['student','other'])assert.equal((await call('/api/academy/changes/accept',staged.acceptedChange,who)).status,403);
  const accepted=ok(await call('/api/academy/changes/accept',staged.acceptedChange));assert.notEqual(accepted.head,original);assert.deepEqual(observations(),{inserts:1,updates:1},'Existing-head publication only executes UPDATE admission');
  const repeated=ok(await call('/api/academy/changes/accept',staged.acceptedChange));assert.equal(repeated.head,accepted.head);assert.deepEqual(observations(),{inserts:1,updates:1},'Exact retry does not repeat admission or publication');
  assert.equal(ok(await call('/api/academy/course-websites/read',area,'student')).document.name,'Reviewed once');
  const next=ok(await call('publish',{...area,revision:staged.revision,operationId:op()}));f.db.prepare('UPDATE account_sessions SET revoked_at=? WHERE account_id=?').run(new Date().toISOString(),f.actors.global);
  assert.equal((await call('/api/academy/changes/accept',next.acceptedChange)).status,401);assert.deepEqual(observations(),{inserts:1,updates:1});
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);
 }finally{f.close();}
});
