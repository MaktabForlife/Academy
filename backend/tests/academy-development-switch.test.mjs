import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildAcademyAssets} from '../tools/academy-assets.mjs';
import {pagesBuildBootstrap,developmentPagesBuildCommand} from '../tools/academy-pages-build-command.mjs';
import {developmentLibraryStorageKey} from '../tools/academy-development-settings.mjs';
import {cleanupFixture} from './fixtures/academy-cleanup-fixture.mjs';
import compatibility from '../src/academy/d1/compatibility-worker.js';
import academy from '../src/academy-runtime.js';

test('Development deployments select the clean runtime and retain existing storage identities',()=>{
  const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
  assert.equal(config.env.development.main,'src/academy-worker-runtime.js');
  assert.equal(config.env.development.name,'devrebootworker');assert.equal(config.keep_vars,true);
  assert.equal(config.env.development.d1_databases[0].database_id,'7e732b79-a72f-4da6-be83-524919c49ba4');
  assert.deepEqual(config.env.development.r2_buckets.map(b=>[b.binding,b.bucket_name]),[
    ['LESSON_MEDIA_BUCKET','maktab-lesson-media-private-development'],['ASSESSMENT_BUCKET','maktab-assessments-private-development'],['MEDIA_BUCKET','maktab4lifemedia']]);
  assert.deepEqual(config.env.development.durable_objects.bindings,[{name:'PROGRAM_TIMETABLE_COORDINATOR',class_name:'ProgramTimetableCoordinator'}]);
  assert.equal(config.env.development.ratelimits[0].namespace_id,'100101');
  assert.deepEqual(config.env.development.triggers.crons,['*/15 * * * *']);
  assert.deepEqual(config.migrations,[{tag:'v1052-program-timetable',new_sqlite_classes:['ProgramTimetableCoordinator']}]);
  assert.equal(config.main,'src/worker-runtime.js');
});
test('the shared website calls Development on stable and preview addresses, with no production fallback',()=>{
  const directory=mkdtempSync('/private/tmp/academy-development-assets-');
  try{
    buildAcademyAssets({repo:new URL('../../',import.meta.url).pathname,directory,target:'development'});
    const config=readFileSync(join(directory,'js/m4l-config.js'),'utf8');
    for(const host of ['maktab-development.pages.dev','development.maktab-development.pages.dev','feature-academy-review-fixes.maktab-development.pages.dev','58d6b3bb.maktab-development.pages.dev','developmentmaktab4life.pages.dev','development.rebootdashboard.pages.dev']){
      const window={location:{hostname:host,origin:'https://'+host}};vm.runInNewContext(config,{window});assert.equal(window.M4L_CONFIG.API_BASE,'https://devrebootworker.maktab4life.workers.dev');
    }
    for(const host of ['unknown.example','maktab-development.pages.dev.evil.example','rebootyourmaktab.maktabhelper.app']){
      const window={location:{hostname:host,origin:'https://'+host}};vm.runInNewContext(config,{window});assert.equal(window.M4L_CONFIG.API_BASE,'');
    }
    assert(!config.includes('academy-feature-10660'));assert(!existsSync(join(directory,'backend')));assert(!existsSync(join(directory,'admin')));
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('the saved Pages command builds the older branch without requiring a feature-only script',()=>{
  const directory=mkdtempSync('/private/tmp/academy-older-pages-');
  try{
    const files={'academy/index.html':'older Academy','js/m4l-config.js':'Development API','functions/account/[uniqueid].js':'old account route','admin/index.html':'older admin','backend/package.json':'private source','docs/private.md':'private notes','.dev.vars':'private credentials','sources/reference.txt':'private reference'};
    for(const [file,text] of Object.entries(files)){mkdirSync(join(directory,file,'..'),{recursive:true});writeFileSync(join(directory,file),text);}
    execFileSync('git',['init','--quiet'],{cwd:directory});execFileSync('git',['add','.'],{cwd:directory});
    execFileSync('sh',['-c',developmentPagesBuildCommand.replace(/^npm --prefix backend ci && /,'')],{cwd:directory});
    for(const file of ['academy/index.html','js/m4l-config.js','functions/account/[uniqueid].js','admin/index.html'])assert.equal(readFileSync(join(directory,'.academy-pages',file),'utf8'),files[file]);
    for(const file of ['backend/package.json','docs/private.md','.dev.vars','sources/reference.txt'])assert(!existsSync(join(directory,'.academy-pages',file)));
    assert(developmentPagesBuildCommand.startsWith('npm --prefix backend ci && node -e '));
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('both Library namespace settings must identify the same existing object',()=>{
  const settings={bindings:[{name:'PLATFORM_SPREADSHEET_ID',type:'plain_text',text:'existing-platform'}]};
  assert.equal(developmentLibraryStorageKey(settings),'existing-platform:open-library-metadata');
  settings.bindings.push({name:'ACADEMY_OPEN_LIBRARY_STORAGE_KEY',type:'plain_text',text:'different:open-library-metadata'});
  assert.throws(()=>developmentLibraryStorageKey(settings),/LIBRARY_NAMESPACE_MISMATCH/);
  assert.throws(()=>developmentLibraryStorageKey({bindings:[]}),/EXISTING_LIBRARY_NAMESPACE_REQUIRED/);
});
test('switching runtime preserves signed-in sessions and Library revisions on the same database',async()=>{
  const fixture=await cleanupFixture(),{env,namespaceNames}=fixture;env.PLATFORM_SPREADSHEET_ID='synthetic-existing-platform';
  const call=async(worker,path,body={},token='')=>{
    const response=await worker.fetch(new Request('https://development.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),env);
    const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;
  };
  try{
    const {token}=await call(compatibility,'/api/account/login',{uniqueid:'login-0001',pin:'1234'});
    const id='EXTERNAL:INTERNET_ARCHIVE:branch-switch-book';
    const saved=await call(compatibility,'/api/academy/open-library/metadata/save',{id,title:'Before switch',baseRevision:0,learningAreaRefs:[]},token);
    assert.equal(saved.record.revision,1);
    assert.equal((await call(academy,'/api/account/session',{},token)).sessionStore,'D1');
    const changed=await call(academy,'/api/academy/open-library/metadata/save',{id,title:'Feature edit',baseRevision:1,learningAreaRefs:[]},token);assert.equal(changed.record.revision,2);
    const restored=await call(compatibility,'/api/academy/open-library/metadata/list',{},token);
    assert.equal(restored.records.find(row=>row.id===id).revision,2);
    assert(namespaceNames.every(name=>name==='synthetic-existing-platform:open-library-metadata'));
  }finally{fixture.db.close();fixture.metadata.close();}
});
