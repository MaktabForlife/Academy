import test from 'node:test';
import assert from 'node:assert/strict';
import {journalTafseerFixture} from './fixtures/academy-student-journal-tafseer-fixture.mjs';
import {ok,op} from './fixtures/academy-surah-grants-fixture.mjs';
import {lessonFileEntries} from '../../academy/course-websites/lesson-materials.mjs';

test('private journals coexist with additional Surah grants, paid native media and current revocation',async()=>{
 const {fixture:f,tokens,lessonId,pdfId}=await journalTafseerFixture();
 try{
  const journal=(action,input={},token=tokens.a)=>f.call('/api/academy/journal/'+action,input,token),site=token=>f.read(f.ids[0],token);
  const before=ok(await site(tokens.a));assert.equal(before.native.lessons.length,0,'A website-only grant never grants recordings or PDFs');
  assert.equal((await f.media('download',{lessonId,assetId:pdfId},tokens.a)).status,403);
  const paid=ok(await site(tokens.b));assert.deepEqual(lessonFileEntries(paid.native).map(row=>row.asset.id),[pdfId]);assert(paid.native.lessons[0].assets.some(asset=>asset.kind==='YOUTUBE'));
  const saved=ok(await journal('save',{id:op(),revision:0,version:null,operationId:op(),fields:{reflection:'PRIVATE JOURNAL NEVER SHARED',course:'Tafseer',surah:'Maryam'}}));
  assert.deepEqual(ok(await site(tokens.a)).document,before.document);assert.doesNotMatch(JSON.stringify(ok(await site(tokens.b))),/PRIVATE JOURNAL NEVER SHARED/);
  for(const token of [tokens.b,tokens.admin])assert.deepEqual(ok(await journal('sync',{},token)).entries,[]);
  assert.equal(f.journalBucket.objects.size,1);assert.equal(f.env.LESSON_MEDIA_BUCKET.objects.size,1,'The existing PDF stays in its original media storage');
  ok(await f.saveGrant(f.ids[0],false));assert.equal((await site(tokens.a)).status,403);assert.equal(ok(await journal('sync')).entries[0].reflection,'PRIVATE JOURNAL NEVER SHARED');
  const clear=ok(await journal('save',{id:saved.entry.id,revision:1,version:saved.version,operationId:op(),fields:{reflection:'',course:'',surah:''}}));assert.equal(clear.entry.reflection,'');
  assert.equal((await f.media('download',{lessonId,assetId:pdfId},tokens.b)).status,200);
  const view=ok(await f.site('get',f.ids[0]));ok(await f.site('withdraw',f.ids[0],{revision:view.revision,operationId:op()}));assert.equal((await site(tokens.b)).status,404);
  assert.equal(f.journalBucket.documents()[0].entries.length,1);assert.equal(f.db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name LIKE 'journal_%'").get().n,0);
  f.db.prepare('UPDATE account_sessions SET revoked_at=? WHERE account_id=?').run(new Date().toISOString(),'account-0002');assert.equal((await journal('sync')).status,401);
 }finally{f.close();}
});
