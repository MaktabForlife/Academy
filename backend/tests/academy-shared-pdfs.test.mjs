import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {storeLessonPdf,lessonPdfReference,lessonPdfObjectKey} from '../src/academy/d1/lesson-pdf-storage.js';
import {mediaFixture} from './fixtures/academy-lesson-media-fixture.mjs';

const bytes=Buffer.from('%PDF-1.4\n% shared public resource\n%%EOF');
const metadata=data=>({size:data.length,sha256:createHash('sha256').update(data).digest('hex')});
const request=data=>new Request('http://localhost/upload',{method:'POST',body:data});
function storage(){const objects=new Map(),writes=[];return {objects,writes,async head(key){return objects.has(key)?{size:objects.get(key).length}:null;},async put(key,stream,options){const value=Buffer.from(await new Response(stream).arrayBuffer());assert.equal(metadata(value).sha256,options.sha256);objects.set(key,value);writes.push(key);}};}
test('identical lesson PDFs share bytes across attachments while namespaces remain isolated',async()=>{
 const bucket=storage(),input=metadata(bytes),first=await storeLessonPdf(request(bytes),bucket,'dev/',input),second=await storeLessonPdf(request(bytes),bucket,'dev/',input);
 assert.equal(first,second);assert.equal(bucket.objects.size,1);assert.equal(bucket.writes.length,1);
 const a=lessonPdfReference('dev/',crypto.randomUUID(),input.sha256),b=lessonPdfReference('dev/','NOTE-'+crypto.randomUUID(),input.sha256);assert.notEqual(a,b);assert.equal(lessonPdfObjectKey(a),first);assert.equal(lessonPdfObjectKey(b),first);
 await storeLessonPdf(request(bytes),bucket,'another-environment/',input);assert.equal(bucket.objects.size,2);
 assert.equal(lessonPdfObjectKey('dev/lessons/legacy.pdf'),'dev/lessons/legacy.pdf');assert.equal(lessonPdfObjectKey('dev/lesson-notes/legacy.pdf'),'dev/lesson-notes/legacy.pdf');
});
test('a claimed checksum cannot reuse or overwrite a private PDF without matching bytes',async()=>{
 const bucket=storage(),input=metadata(bytes),key=await storeLessonPdf(request(bytes),bucket,'',input),forged=Buffer.from(bytes);forged[15]^=1;
 await assert.rejects(storeLessonPdf(request(forged),bucket,'',input),/checksum changed/);assert.deepEqual(bucket.objects.get(key),bytes);assert.equal(bucket.writes.length,1);
 const missing=storage();await assert.rejects(storeLessonPdf(request(forged),missing,'',input),/checksum changed/);assert.equal(missing.objects.size,0);
});
test('shared storage retains PDF signature, exact byte size and maximum-size validation',async()=>{
 for(const [data,input,pattern]of [[Buffer.from('not a pdf'),metadata(Buffer.from('not a pdf')),/valid PDF/],[bytes,{...metadata(bytes),size:bytes.length-1},/size changed/],[bytes,{...metadata(bytes),size:bytes.length+1},/interrupted/],[bytes,{...metadata(bytes),size:16*1024*1024+1},/16 MB/]]){const bucket=storage();await assert.rejects(storeLessonPdf(request(data),bucket,'',input),pattern);assert.equal(bucket.objects.size,0);}
});
test('concurrent first imports converge on one immutable file',async()=>{
 const bucket=storage(),input=metadata(bytes),keys=await Promise.all(Array.from({length:4},()=>storeLessonPdf(request(bytes),bucket,'',input)));assert.equal(new Set(keys).size,1);assert.equal(bucket.objects.size,1);assert.deepEqual(bucket.objects.get(keys[0]),bytes);
});
test('separate lesson links share storage but keep independent names, permissions and removals',async()=>{
 const f=await mediaFixture();try{
  const teacher=await f.login('0003'),student=await f.login('0002'),other=await f.login('0005');
  const first=await f.mediaUpload({name:'First lesson'},teacher,bytes),second=await f.mediaUpload({lessonId:'MOU-20261007',name:'Second lesson'},teacher,bytes);assert.equal(first.status,200);assert.equal(second.status,200);
  assert.equal(f.objects.size,1);const records=f.db.prepare("SELECT * FROM lesson_media_assets WHERE kind='PDF'").all();assert.equal(records.length,2);assert.notEqual(records[0].object_key,records[1].object_key);assert.equal(lessonPdfObjectKey(records[0].object_key),lessonPdfObjectKey(records[1].object_key));
  assert.equal((await f.media('download',{lessonId:'MOU-20261006',assetId:second.body.assetId},student)).status,404);assert.equal((await f.media('download',{lessonId:'MOU-20261007',assetId:second.body.assetId},other)).status,403);
  const renamed=await f.media('attachment-name',{operationId:crypto.randomUUID(),lessonId:'MOU-20261006',assetId:first.body.assetId,revision:2,name:'Renamed only here'},teacher);assert.equal(renamed.status,200);assert.equal(f.db.prepare('SELECT display_name FROM lesson_media_assets WHERE asset_id=?').get(second.body.assetId).display_name,'Second lesson');
  const removed=await f.media('attachment-remove',{operationId:crypto.randomUUID(),lessonId:'MOU-20261006',assetId:first.body.assetId,revision:3},teacher);assert.equal(removed.status,200);assert.equal((await f.media('download',{lessonId:'MOU-20261006',assetId:first.body.assetId},student)).status,404);assert.equal((await f.media('download',{lessonId:'MOU-20261007',assetId:second.body.assetId},student)).status,200);assert.equal(f.objects.size,1);
 }finally{f.db.close();}
});
