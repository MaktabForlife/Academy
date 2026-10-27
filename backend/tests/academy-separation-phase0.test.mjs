import {lessonPdfObjectKey} from '../src/academy/d1/lesson-pdf-storage.js';
import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {separationFixture,separationActors as actors,separationScopes as scopes} from './fixtures/academy-separation-fixture.mjs';
import {sourceSchema,sourceBindings,routeInventory,writerInventory,repositoryRoot} from '../tools/academy-separation-baseline.mjs';

const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
async function use(fn){
 const f=await separationFixture();
 try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}
 finally{f.close();}
}
test('Phase 0 fixture contains the complete source schema with no manual-case subsystem',()=>use(async f=>{
 const schema=sourceSchema({through:31}),names=f.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
 assert.equal(schema.migrations.length,31);assert.equal(schema.tables.length,108);assert.equal(schema.columnCount,748);
 assert.deepEqual(names,schema.tables.map(r=>r.name));
 for(const {name,columns} of schema.tables)assert.deepEqual(f.db.prepare(`PRAGMA table_info("${name}")`).all().map(r=>r.name),columns.map(r=>r.name),name);
 assert(!names.some(n=>/manual_case|manual_exception|manual_result|supplemental_release/.test(n)));
 assert.equal(f.env.ENVIRONMENT,'local');assert.equal(f.env.ACADEMY_D1_MODE,'REHEARSAL');
 assert(!Object.keys(f.env).some(k=>k.startsWith('HIFZ_')));
}));
test('separate synthetic scopes and actual combined roles use the ordinary Core identity',()=>use(async f=>{
 for(const side of ['A','B']){
  const session=ok(await f.call('/api/account/session',{},await f.actor('admin'+side)));
  assert.equal(session.account.uniqueid,'separation-admin'+side);
  const managed=session.contexts.filter(c=>c.role==='PROGRAM_ADMIN').map(c=>c.courseId).sort();
  assert.deepEqual(managed,[scopes['program'+side].slice(8),scopes['course'+side].slice(7)].sort());
 }
 const dual=ok(await f.call('/api/account/session',{},await f.actor('dual')));
 assert.deepEqual([...new Set(dual.contexts.filter(c=>c.courseId===scopes.programA.slice(8)).map(c=>c.role))].sort(),['PROGRAM_ADMIN','STUDENT','TEACHER']);
 const global=ok(await f.call('/api/account/session',{},await f.actor('global')));
 assert(global.contexts.some(c=>c.scope==='PLATFORM'&&c.role==='GLOBAL_ADMIN'));
 const unique=Object.values(actors);assert.equal(new Set(unique).size,unique.length);
}));
test('disabled and unassigned accounts cannot obtain a fabricated context',()=>use(async f=>{
 assert.equal((await f.call('/api/account/login',{uniqueid:'separation-disabled',pin:'1234'})).body.code,'ACCOUNT_DISABLED');
 const none=await f.call('/api/account/login',{uniqueid:'separation-none',pin:'1234'});
 // An existing Free Course reader context, if configured, never grants Admin/Teacher.
 if(none.status===200)assert(none.body.contexts.every(c=>c.role==='STUDENT'));
 else assert.equal(none.body.code,'NO_CONTEXT');
}));
test('Global Admin inherits Course administration and scoped actors remain scoped at direct commands',()=>use(async f=>{
 const input={activityKey:scopes.courseB,operationId:crypto.randomUUID()};
 assert.equal((await f.media('course-files-create',input,await f.actor('adminA'))).status,403);
 assert.equal((await f.media('course-files-create',{...input,workspace:'ADMIN',targetAccountId:actors.global},await f.actor('teacherB'))).status,403);
 assert.equal((await f.media('course-files-create',input,await f.actor('studentB'))).status,403);
 ok(await f.media('course-files-create',input,await f.actor('global')));
}));
test('published Course PDFs retain names, original bytes, private ownership and current entitlement',()=>use(async f=>{
 const ref=await f.seedCoursePdf();
 for(const role of ['studentA','teacherA','adminA','dual','global']){
  const r=await f.media('download',ref,await f.actor(role));assert.equal(r.status,200,role);assert.match(r.headers.get('content-disposition'),/synthetic-handbook\.pdf/);
 }
 for(const role of ['studentB','teacherB','adminB'])assert.equal((await f.media('download',ref,await f.actor(role))).status,403,role);
 const admin=await f.actor('global'),before=f.db.prepare('SELECT * FROM lesson_media_assets WHERE asset_id=?').get(ref.assetId),bytes=Buffer.from(f.objects.get(lessonPdfObjectKey(before.object_key)));
 ok(await f.media('attachment-name',{...ref,name:'Renamed synthetic handbook',revision:3,operationId:crypto.randomUUID()},admin));
 const after=f.db.prepare('SELECT * FROM lesson_media_assets WHERE asset_id=?').get(ref.assetId);
 assert.equal(after.object_key,before.object_key);assert.equal(after.filename,before.filename);assert.equal(after.asset_id,before.asset_id);assert.deepEqual(Buffer.from(f.objects.get(lessonPdfObjectKey(after.object_key))),bytes);
 f.db.prepare('UPDATE role_assignments SET active=0 WHERE account_id=? AND activity_key=?').run(actors.studentA,scopes.courseA);
 assert([401,403].includes((await f.media('download',ref,await f.actor('studentA'))).status),'Revocation must deny bytes even when it also ends the selected session context');
}));
test('each fixture has its own database and R2 map and ordinary requests need no external network',async()=>{
 const a=await separationFixture(),b=await separationFixture();
 const network=mock.method(globalThis,'fetch',async()=>{throw Error('Live network is forbidden in the separation fixture');});
 try{
  await a.seedCoursePdf();assert(a.objects.size>0);assert.equal(b.objects.size,0);
  assert.equal(b.db.prepare("SELECT count(*) n FROM lesson_media_lessons WHERE media_scope='COURSE'").get().n,0);
  ok(await b.call('/api/account/session',{},await b.actor('studentA')));assert.equal(network.mock.callCount(),0);
 }finally{network.mock.restore();a.close();b.close();}
});
test('Phase 0 inventory retains legacy aliases, raw uploads, scheduled and offline writers',()=>{
 const routes=routeInventory(),writers=writerInventory();
 for(const path of ['/api/account/login','/api/academy/assessments/upload','/api/academy/lesson-media/upload','/api/admin/platform/program-library/upload-chunk','/api/academy/d1/accounts/reset-pin'])assert(routes.some(r=>r.value===path),path);
 assert(routes.some(r=>r.kind==='DISPATCH_PATTERN'&&r.value.includes('course-files-create')));
 assert(routes.some(r=>r.kind==='DISPATCH_PATTERN'&&r.value.includes('program-attendance')));
 assert(writers.some(r=>r.kind==='SCHEDULED_ENTRY'&&r.file.endsWith('d1/worker.js')));
 assert(writers.some(r=>r.kind==='TRIGGER_DEFINITION'&&r.file.includes('0028_')));
 assert(writers.some(r=>r.mode==='OFFLINE_OR_MAINTENANCE_TOOL'&&r.dynamic));
 assert(writers.some(r=>r.file.endsWith('library-storage.js')));
 assert(writers.some(r=>r.file.endsWith('assessment-files.js')&&r.kind==='SQL_WRITE'));
});
test('Phase 0 tooling captures only binding names and keeps existing layout/PDF sources available',()=>{
 const bindings=sourceBindings(),contracts=JSON.parse(readFileSync(resolve(repositoryRoot,'docs/academy-separation/contracts.json'),'utf8'));
 assert.equal(bindings.worker,'devrebootworker');assert.deepEqual(bindings.d1.map(b=>b.database_name).sort(),['dev-academy-admin','dev-academy-core']);
 assert.deepEqual(bindings.r2.map(r=>r.binding).sort(),['ASSESSMENT_BUCKET','LESSON_MEDIA_BUCKET','MEDIA_BUCKET']);
 assert(!JSON.stringify(bindings).includes('SESSION_SECRET'));assert.equal(contracts.screens.filter(s=>s.current_page_or_view.endsWith('.html')).length,24);
 for(const row of contracts.screens.filter(s=>s.current_page_or_view.endsWith('.html')))assert(existsSync(resolve(repositoryRoot,row.current_page_or_view)),row.current_page_or_view);
 for(const file of ['js/m4l-pdf-compare.mjs','js/m4l-pdf-editable.mjs','js/m4l-pdf-favourites.mjs','js/m4l-pdf-reader.mjs'])assert(existsSync(resolve(repositoryRoot,file)),file);
 assert.equal(contracts.authorityFamilies.length,40);assert.equal(contracts.tableOwnership.length,108);
});
