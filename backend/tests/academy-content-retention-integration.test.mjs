import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contentMediaFixture,ok} from './fixtures/academy-content-media-fixture.mjs';

test('expired content PDFs disappear, release their exact lesson slot and stay inaccessible after republication',async()=>{
 const f=await contentMediaFixture();
 try{
  f.databases.core.exec(readFileSync(new URL('../migrations/academy-core/0021_note_retention.sql',import.meta.url),'utf8'));
  f.databases.admin.exec(readFileSync(new URL('../migrations/academy-admin/0003_note_retention_indexes.sql',import.meta.url),'utf8'));
  f.source.env.ACADEMY_NOTE_RETENTION='1';
  const made=await f.binding();let revision=1;
  const expired=ok(await f.pdf(made.lessonId,revision++)).assetId;
  for(let index=0;index<9;index++)ok(await f.pdf(made.lessonId,revision++));
  await f.publish(made.lessonId,revision++);
  assert.equal((await f.pdf(made.lessonId,revision)).status,400);
  const timestamp=new Date().toISOString();
  f.databases.core.prepare("INSERT INTO note_retention_items(item_id,kind,ref_id,activity_key,class_ids_json,lesson_date,label,created_at,next_check,delete_after,state) VALUES(?,'SESSION_PDF',?,?,?,'2026-10-28','Expired content PDF',?,?,?,'DELETED')").run(crypto.randomUUID(),expired,f.scope,'["class-1"]',timestamp,timestamp,timestamp);
  const before=ok(await f.request('get',{lessonId:made.lessonId},f.admin));
  assert.equal(before.assets.filter(asset=>asset.kind==='PDF').length,9);
  assert(!before.assets.some(asset=>asset.id===expired));
  assert.equal((await f.download({lessonId:made.lessonId,assetId:expired},f.admin,'ADMIN')).status,404);
  ok(await f.pdf(made.lessonId,revision++));
  await f.publish(made.lessonId,revision++);
  const learner=await f.source.login('0002'),feed=ok(await f.request('feed',{activityKey:f.scope},learner,'LEARN')),after=feed.lessons.find(lesson=>lesson.id===made.lessonId);
  assert(after);
  assert.equal(after.assets.filter(asset=>asset.kind==='PDF').length,10);
  assert(!after.assets.some(asset=>asset.id===expired));
  assert.equal((await f.download({lessonId:made.lessonId,assetId:expired},learner)).status,404);
  assert.equal((await f.pdf(made.lessonId,revision)).status,400);
 }finally{f.close();}
});
