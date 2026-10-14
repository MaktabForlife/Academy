import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import worker from '../src/academy-runtime.js';
import {academyDependencyGraph} from '../tools/academy-boundary.mjs';
import {buildAcademyAssets} from '../tools/academy-assets.mjs';
import {cleanupFixture} from './fixtures/academy-cleanup-fixture.mjs';
import {PROGRAM_IDS} from './fixtures/academy-migration-fixture.mjs';
const post=async(env,path,input={},token='')=>{const r=await worker.fetch(new Request('https://academy.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);return {status:r.status,body:await r.json()};};
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,id='0001')=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+id,pin:'1234'})).token;
async function use(fn){const f=await cleanupFixture(),original=globalThis.fetch;let requests=0;globalThis.fetch=async()=>{requests++;throw Error('Unexpected outbound request');};try{await fn(f);assert.equal(requests,0);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{globalThis.fetch=original;f.db.close();f.metadata.close();}}
test('the complete Academy entrypoint and storage export have no Google backend clients',()=>{const graph=academyDependencyGraph();assert(graph.includes('academy/d1/library-storage.js'));assert(graph.includes('domain/platform-global-timetable.js'));assert(graph.includes('lib/auth-primitives.js'));});
test('missing, OFF, invalid, non-isolated rehearsal and paused modes cannot select legacy storage',async()=>{
 for(const mode of [undefined,'OFF','INVALID','PAUSED','REHEARSAL']){let reads=0;const env={ACADEMY_D1_MODE:mode,ENVIRONMENT:'development',ACADEMY_LIBRARY_MODE:'PUBLIC_ONLY',get ACADEMY_DB(){reads++;throw Error('Must reject before storage');}};const response=await worker.fetch(new Request('https://academy.invalid/api/account/login',{method:'POST',body:'{}'}),env);assert.equal(response.status,503);assert.equal(reads,0);}
});
test('core Academy flows work without Google credentials or spreadsheet settings',()=>use(async({env})=>{
 const token=await login(env),learner=await login(env,'0002');
 assert.equal(ok(await post(env,'/api/account/session',{},token)).sessionStore,'D1');
 for(const [path,input] of [['/api/academy/entrance',{}],['/api/admin/platform/user-profiles/get',{}],['/api/admin/platform/programs/list',{}],['/api/admin/platform/global/get',{}],['/api/admin/platform/courses/list',{}],['/api/admin/platform/learning-catalogue/get',{}],['/api/academy/calendar/get',{}],['/api/academy/planning/list',{}],['/api/academy/timetable',{startDate:'2026-09-24'}]])ok(await post(env,path,input,token));
 assert.equal(ok(await post(env,'/api/admin/platform/global/get',{},token)).capabilities.resourceManagement,false);
 assert(ok(await post(env,'/api/program-library/available',{},learner)).programs.length>0);
 assert.equal((await post(env,'/api/admin/platform/user-profiles/get',{},learner)).status,403);
 assert.equal(ok(await post(env,'/api/academy/library/catalogue',{},learner)).libraryMode,'PUBLIC_ONLY');
}));
test('the neutral Library key preserves existing IDs, revisions, covers and authorised edits',()=>use(async({env,metadata,namespaceNames,objects})=>{
 const id='EXTERNAL:INTERNET_ARCHIVE:cleanup-book',coverKey='AcademyOpenLibrary/Covers/'+crypto.randomUUID()+'.png';objects.set(coverKey,{bytes:new Uint8Array([1,2,3]),mime:'image/png'});
 metadata.prepare('INSERT INTO open_library_metadata VALUES(?,?,?,?,?)').run(id,JSON.stringify({id,title:'Existing book',coverKey}),3,'2026-10-14','synthetic');
 const response=await worker.fetch(new Request('https://academy.invalid/api/academy/open-library/metadata/public'),env),data=await response.json();assert.equal(response.status,200);assert.equal(data.records[0].id,id);assert.equal(data.records[0].revision,3);
 const token=await login(env);
 const result=ok(await post(env,'/api/academy/open-library/metadata/save',{id,title:'Updated title',baseRevision:3,subjectRef:'GLOBAL:subject-1',moduleRef:'GLOBAL:module-1',learningAreaRefs:['PROGRAM:'+PROGRAM_IDS[0]]},token));assert.equal(result.record.revision,4);assert.equal(metadata.prepare('SELECT count(*) n FROM open_library_metadata').get().n,1);
 assert(namespaceNames.every(n=>n==='synthetic-existing-platform:open-library-metadata'));
 delete env.ACADEMY_OPEN_LIBRARY_STORAGE_KEY;const before=namespaceNames.length;assert.equal((await worker.fetch(new Request('https://academy.invalid/api/academy/open-library/metadata/public'),env)).status,503);assert.equal(namespaceNames.length,before);
}));
test('retired private Library and old Sheets routes cannot issue files or write Google data',()=>use(async({env})=>{
 const token=await login(env);
 for(const path of ['/api/admin/platform/program-library/upload-start','/api/admin/platform/program-library/upload-chunk','/api/admin/platform/global/drive/browse','/api/academy/library/access']){const r=await post(env,path,{},token);assert.equal(r.status,403);assert.equal(r.body.code,'PRIVATE_MEDIA_NOT_ENABLED');}
 for(const path of ['/api/login','/api/admin/weekly-planner/save-preview','/api/admin/resources/create'])assert.equal((await post(env,path,{},token)).status,501);
}));
test('the publish artifact excludes legacy applications, backend source and private tools',()=>{
 const directory=mkdtempSync('/private/tmp/academy-cleanup-assets-');
 try{const report=buildAcademyAssets({repo:new URL('../../',import.meta.url).pathname,directory});assert(report.files.includes('academy/index.html'));assert(report.files.includes('js/m4l-pdf-reader.mjs'));assert(report.files.includes('js/version.json'));
 for(const file of ['app.js','admin/index.html','student/index.html','js/m4l-program-library.js','backend/src/worker.js','apps-script/code.gs','AGENTS.md'])assert.equal(existsSync(join(directory,file)),false,file);
 assert(!readFileSync(join(directory,'programs/library.html'),'utf8').includes('m4l-program-library.js'));
 const config=readFileSync(join(directory,'js/m4l-config.js'),'utf8');assert(!config.includes('devrebootworker'));assert(!config.includes('api.rebootyourmaktab'));
 for(const host of ['academy-feature-10660.maktab4life.workers.dev','feature-academy-review-fixes-10660.maktab-development.pages.dev','unknown.example']){const window={location:{hostname:host,origin:'https://'+host}};vm.runInNewContext(config,{window});assert.equal(window.M4L_CONFIG.API_BASE,host==='unknown.example'?'':'https://academy-feature-10660.maktab4life.workers.dev');}
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('intentional public media remains supported while private Worker file URLs stay excluded',async()=>{
 const {publicPdfTarget}=await import('../tools/academy-public-media.mjs');
 const encode=value=>Buffer.from(value).toString('base64url');
 for(const url of ['https://archive.org/download/book/file.pdf','https://drive.google.com/file/d/public_file/view','https://docs.google.com/uc?id=public_file'])assert(publicPdfTarget(encode(url)),url);
 for(const url of ['https://devrebootworker.maktab4life.workers.dev/api/academy/d1/library/file?access=private','https://api.rebootyourmaktab.maktabhelper.app/api/library/drive/file/private','http://drive.google.com/file/d/book','https://drive.google.com.evil.invalid/file/d/book'])assert.equal(publicPdfTarget(encode(url)),false,url);
 const {serveAcademySite}=await import('../tools/academy-site.mjs');let assets=0;
 const health=await serveAcademySite(new Request('https://preview.invalid/api/feature-preview/health'),{});assert.equal((await health.json()).version,JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version);
 const env={ASSETS:{fetch:async()=>{assets++;return new Response('asset');}}};
 assert.equal((await serveAcademySite(new Request('https://preview.invalid/admin/'),env)).status,302);
 assert.equal((await serveAcademySite(new Request('https://preview.invalid/backend/src/worker.js'),env)).status,404);
 assert.equal(assets,0);
});
