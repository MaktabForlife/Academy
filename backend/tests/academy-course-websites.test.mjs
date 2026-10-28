import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import worker from '../src/academy-runtime.js';
import {classNotesFixture} from './fixtures/academy-class-notes-fixture.mjs';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
import {acceptedDatabase} from '../src/academy/d1/setup-reader.js';
import {courseWebsiteTemplate,kahfBlocks} from '../src/academy/course-books/website-template.js';
import {SURAH_KAHF_LESSONS} from '../src/academy/course-books/surah-kahf.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
function client(env,actor){return async(action,input={},who='global',workspace=who.startsWith('student')?'LEARN':'ADMIN',bytes)=>{
 const path=action.startsWith('/')?action:'/api/admin/platform/course-websites/'+action,url='https://academy.test'+path+(bytes?'?metadata='+encodeURIComponent(JSON.stringify(input)):''),r=await worker.fetch(new Request(url,{method:'POST',headers:{Authorization:'Bearer '+await actor(who),'X-Academy-Workspace':workspace,...(bytes?{}:{'Content-Type':'application/json'})},body:bytes||JSON.stringify(input)}),env);
 return {status:r.status,body:r.headers.get('Content-Type')?.includes('application/json')?await r.json():new Uint8Array(await r.arrayBuffer())};
};}
async function use(fn){const f=await classNotesFixture();try{f.send=client(f.env,f.actor);await fn(f);}finally{f.close();}}
const operation=()=>crypto.randomUUID();
const save=(f,view,extra={})=>f.send('save',{activityKey:view.activityKey,revision:view.revision,document:view.document,operationId:operation(),...extra});
const publish=async(f,view)=>{const made=ok(await f.send('publish',{activityKey:view.activityKey,revision:view.revision,operationId:operation()}));ok(await f.send('/api/academy/changes/accept',made.acceptedChange));return made;};
test('course website list/get/save respects actual course Admin scope and leaves drafts private',()=>use(async f=>{
 const rows=ok(await f.send('list',{},'adminA')).websites;assert(rows.every(r=>r.activityKey===f.scopes.courseA));assert.equal((await f.send('get',{activityKey:f.scopes.courseB},'adminA')).status,403);
 for(const workspace of ['LEARN','TEACH','ADMIN_LEARN','ADMIN_TEACH'])assert.equal((await f.send('get',{activityKey:f.scopes.courseA},'global',workspace)).status,403);
 const view=ok(await f.send('get',{activityKey:f.scopes.courseA}));view.document.name='A private website';const result=ok(await save(f,view));assert.equal(result.acceptedChange,undefined);
 assert.equal((await f.send('/api/academy/course-websites/read',{activityKey:view.activityKey},'studentA')).status,404);
 assert.equal((await f.send('save',{activityKey:view.activityKey,revision:0,document:view.document,operationId:operation()},'studentA','LEARN')).status,403);
 assert.equal((await save(f,view)).status,409);
}));
test('publication captures the selected document, preserves other drafts and supports exact retry',()=>use(async f=>{
 const a=ok(await f.send('get',{activityKey:f.scopes.courseA})),b=ok(await f.send('get',{activityKey:f.scopes.courseB}));a.document.name='Published course A';b.document.name='Unrelated private B';
 a.revision=ok(await save(f,a)).revision;ok(await save(f,b));const input={activityKey:a.activityKey,revision:a.revision,operationId:operation()},made=ok(await f.send('publish',input));assert(made.acceptedChange);const head=f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id;
 assert.equal((await f.send('/api/academy/course-websites/read',{activityKey:a.activityKey},'studentA')).status,404);
 ok(await f.send('/api/academy/changes/accept',made.acceptedChange));const read=ok(await f.send('/api/academy/course-websites/read',{activityKey:a.activityKey},'studentA'));assert.equal(read.document.name,a.document.name);
 assert.equal(read.canEdit,false,'Students never receive website editing controls');
 for(const who of ['global','adminA'])for(const workspace of ['ADMIN','ADMIN_LEARN','ADMIN_TEACH'])assert.equal(ok(await f.send('/api/academy/course-websites/read',{activityKey:a.activityKey},who,workspace)).canEdit,true,'Only current, scoped Admin authority enables text editing');
 assert.equal(ok(await f.send('/api/academy/course-websites/read',{activityKey:a.activityKey},'teacherA','TEACH')).canEdit,false,'Teaching alone does not grant website editing');
 assert.equal((await f.send('/api/academy/course-websites/read',{activityKey:b.activityKey},'studentB')).status,404);
 const next=f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id;assert.notEqual(next,head);assert.equal(ok(await f.send('publish',input)).replayed,true);ok(await f.send('/api/academy/changes/accept',made.acceptedChange));assert.equal(f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,next);
 assert.equal((await f.send('/api/academy/course-websites/read',{activityKey:a.activityKey},'studentB')).status,403);
}));
test('published assets are same-course, byte checked and remain immutable for old heads',()=>use(async f=>{
 const bytes=new Uint8Array([137,80,78,71,13,10,26,10]),assetId=operation(),metadata={activityKey:f.scopes.courseA,assetId,filename:'canva-cover.png',type:'image/png',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),operationId:operation()};
 ok(await f.send('upload',metadata,'global','ADMIN',bytes));
 const replacement={...metadata,assetId:operation(),operationId:operation()};ok(await f.send('upload',replacement,'global','ADMIN',bytes));
 const linked=f.db.prepare('SELECT asset_id,object_key FROM course_website_assets WHERE activity_key=?').all(f.scopes.courseA);assert.equal(linked.length,2);assert.notEqual(linked[0].object_key,linked[1].object_key,'Each upload keeps an immutable reference even when its bytes match');
 const originalKey=linked.find(row=>row.asset_id===assetId).object_key.replace(/image-refs\/[a-f0-9-]{36}\/([a-f0-9]{64})$/,'$1');f.db.prepare('UPDATE course_website_assets SET object_key=? WHERE asset_id=?').run(originalKey,assetId);
 assert.equal((await f.send('/api/academy/course-websites/asset',{activityKey:f.scopes.courseA,assetId},'studentA')).status,404);
 const a=ok(await f.send('get',{activityKey:f.scopes.courseA})),b=ok(await f.send('get',{activityKey:f.scopes.courseB}));b.document.home.imageId=assetId;assert.equal((await save(f,b)).status,400);a.document.home.imageId=assetId;a.revision=ok(await save(f,a)).revision;await publish(f,a);
 assert.deepEqual(ok(await f.send('/api/academy/course-websites/asset',{activityKey:a.activityKey,assetId},'studentA')),bytes);
 assert.equal((await f.send('/api/academy/course-websites/asset',{activityKey:f.scopes.courseB,assetId},'studentB')).status,404);
 assert.equal((await f.send('upload',{...metadata,sha256:'0'.repeat(64),operationId:operation()},'global','ADMIN',bytes)).status,409);
 assert.equal((await f.send('upload',{...metadata,assetId:operation(),filename:'forged.png',operationId:operation()},'global','ADMIN',new TextEncoder().encode('<script>'))).status,400);
}));
test('withdrawal wins over a pinned head, stale publications cannot overwrite a newer draft, and revoked access stops reads',()=>use(async f=>{
 let a=ok(await f.send('get',{activityKey:f.scopes.courseA}));a.revision=ok(await save(f,a)).revision;let made=await publish(f,a);a.revision=made.revision;
 const old=f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,pinned=acceptedDatabase(f.env.ACADEMY_DB,old);
 const staged=ok(await f.send('publish',{activityKey:a.activityKey,revision:a.revision,operationId:operation()}));a.revision=staged.revision;a.document.name='A newer saved draft';a.revision=ok(await save(f,a)).revision;assert.equal((await f.send('/api/academy/changes/accept',staged.acceptedChange)).status,409);
 assert.notEqual((await pinned.prepare('SELECT document_json FROM course_website_documents WHERE activity_key=?').bind(a.activityKey).first()).document_json,JSON.stringify(a.document));
 ok(await f.send('withdraw',{activityKey:a.activityKey,revision:a.revision,operationId:operation()}));assert.equal((await pinned.prepare('SELECT enabled FROM course_website_documents WHERE activity_key=?').bind(a.activityKey).first()).enabled,0);
 assert.equal((await f.send('/api/academy/course-websites/read',{activityKey:a.activityKey},'studentA')).status,404);
 f.db.prepare('UPDATE global_role_assignments SET active=0 WHERE account_id=?').run(f.actors.global);assert([401,403].includes((await f.send('get',{activityKey:a.activityKey})).status));
}));
test('Kahf template retains all eleven lessons as editable safe components and keeps its publication gate',()=>use(async f=>{
 f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Surah Al Kahf',f.scopes.courseA);
 const a=ok(await f.send('get',{activityKey:f.scopes.courseA}));assert.equal(a.document.lessons.length,11);assert(a.document.lessons.flatMap(l=>l.sections.flatMap(s=>s.blocks)).some(b=>b.type==='ayah'));assert(a.document.lessons.flatMap(l=>l.sections.flatMap(s=>s.blocks)).some(b=>b.type==='reflection'));
 a.revision=ok(await save(f,a)).revision;await publish(f,a);assert.equal((await f.send('/api/academy/course-websites/read',{activityKey:a.activityKey},'studentA')).status,403);
 const sourceText=SURAH_KAHF_LESSONS.flatMap(l=>l.sections.map(s=>s.body)).join(' '),converted=JSON.stringify(courseWebsiteTemplate({kind:'COURSE',name:'Surah Al Kahf'}));
 for(const phrase of ['مَنْ حَفِظَ','seventy thousand angels','Mazhari','The Ruh'])if(sourceText.includes(phrase))assert(converted.includes(phrase));
 const blocks=kahfBlocks('<p>&lt;script&gt;plain text&lt;/script&gt;</p>','test');assert.equal(blocks[0].text,'<script>plain text</script>');
}));
test('physical split migration matches new target definitions and first draft never copies content into Core',async()=>{
 const f=await splitFixture();try{
  for(const owner of ['core','admin']){const db=f.databases[owner];for(const name of ['course_website_documents','course_website_assets'])db.exec('DROP TABLE '+name);db.exec(readFileSync(new URL('../migrations/academy-'+owner+'/'+(owner==='core'?'0004':'0001')+'_course_websites.sql',import.meta.url),'utf8'));}
  assert.equal(f.databases.core.prepare("SELECT count(*) n FROM sqlite_schema WHERE type='trigger' AND (name LIKE 'split_fence_course_website_%' OR name LIKE 'split_epoch_course_website_%')").get().n,12);
  f.databases.core.exec("UPDATE split_deployment_state SET state='READY'");Object.assign(f.source.env,{ACADEMY_DB:f.core,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:f.prepared.report.sourceDigest,ACADEMY_SPLIT_COORDINATOR:f.namespace,ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3'});
  f.send=client(f.source.env,f.source.actor);let a=ok(await f.send('get',{activityKey:f.scopes.courseA}));a.document.name='Private split content';a.revision=ok(await save(f,a)).revision;
  assert.equal(f.databases.core.prepare('SELECT document_json FROM course_website_documents WHERE activity_key=?').get(a.activityKey).document_json,null);assert.match(f.databases.admin.prepare('SELECT document_json FROM course_website_documents WHERE activity_key=?').get(a.activityKey).document_json,/Private split content/);
  await publish(f,a);assert.equal(ok(await f.send('/api/academy/course-websites/read',{activityKey:a.activityKey},'studentA')).document.name,'Private split content');
  for(const db of Object.values(f.databases))assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
});
