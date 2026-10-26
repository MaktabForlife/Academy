import {acceptFixtureSetup} from './academy-accepted-fixture.mjs';
import assert from 'node:assert/strict';
import {splitFixture} from './academy-split-fixture.mjs';
import {videoBucket} from './academy-session-video-fixture.mjs';
import {videoMigration} from '../../tools/academy-session-video-migration.mjs';
import worker from '../../src/academy-runtime.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const schema=db=>db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE tbl_name='lesson_media_assets' AND sql IS NOT NULL ORDER BY type,name").all();
export async function splitVideoFixture(){
 const f=await splitFixture();
 for(const db of Object.values(f.databases)){
  const before=schema(db),rows=db.prepare('SELECT * FROM lesson_media_assets ORDER BY asset_id').all();
  db.exec('BEGIN');db.exec(videoMigration(before));db.exec('COMMIT');
  assert.deepEqual(db.prepare('SELECT * FROM lesson_media_assets ORDER BY asset_id').all(),rows);
  assert.deepEqual(schema(db).filter(r=>r.type!=='table'),before.filter(r=>r.type!=='table'));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }
 f.databases.core.exec("UPDATE split_deployment_state SET state='READY'");
 Object.assign(f.source.env,{ACADEMY_DB:f.core,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:f.prepared.report.sourceDigest,ACADEMY_SPLIT_COORDINATOR:f.namespace,ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_MEDIA_SEPARATION:'1',ACADEMY_OBJECT_NAMESPACE:'dev-split-v1/',LESSON_MEDIA_BUCKET:videoBucket()});
 f.request=async(action,input={},token,workspace='ADMIN',bytes)=>{
  const path=action.startsWith('/')?action:'/api/academy/lesson-media/'+action;
  const response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':workspace,...(!bytes?{'Content-Type':'application/json'}:{})},body:bytes||JSON.stringify(input)}),f.source.env);
  return {status:response.status,body:await response.json()};
 };
 f.accept=async(token,scope)=>acceptFixtureSetup(f.source.env,token,[scope],['media']);
 return f;
}
