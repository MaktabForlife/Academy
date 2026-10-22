import {WorkspaceRequest} from './fixtures/workspace-request.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildAcademyAssets} from '../tools/academy-assets.mjs';
import {developmentPagesBuildCommand} from '../tools/academy-pages-build-command.mjs';
import {cleanupFixture} from './fixtures/academy-cleanup-fixture.mjs';
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
  assert.equal(config.main,'src/academy-worker-runtime.js');assert.equal(config.name,'devrebootworker');
});
test('the shared website calls Development on stable and preview addresses, with no production fallback',()=>{
  const directory=mkdtempSync('/private/tmp/academy-development-assets-');
  try{
    buildAcademyAssets({repo:new URL('../../',import.meta.url).pathname,directory,target:'development'});
    const config=readFileSync(join(directory,'js/m4l-config.js'),'utf8');
    for(const host of ['maktab4life.org','www.maktab4life.org','academy-maktab4life.pages.dev','development.academy-maktab4life.pages.dev','maktab-development.pages.dev','development.maktab-development.pages.dev','feature-academy-review-fixes.maktab-development.pages.dev','58d6b3bb.maktab-development.pages.dev','developmentmaktab4life.pages.dev','development.rebootdashboard.pages.dev']){
      const window={location:{hostname:host,origin:'https://'+host}};vm.runInNewContext(config,{window});assert.equal(window.M4L_CONFIG.API_BASE,'https://devrebootworker.maktab4life.workers.dev');assert.equal(window.M4L_CONFIG.ENV_NAME,'development');assert.equal(window.M4L_CONFIG.IS_PRODUCTION,false);
    }
    for(const host of ['unknown.example','maktab4life.org.evil.example','evil.maktab4life.org','academy-maktab4life.pages.dev.evil.example','maktab-development.pages.dev.evil.example','rebootyourmaktab.maktabhelper.app']){
      const window={location:{hostname:host,origin:'https://'+host}};vm.runInNewContext(config,{window});assert.equal(window.M4L_CONFIG.API_BASE,'');
    }
    assert(!config.includes('academy-feature-10660'));assert(!existsSync(join(directory,'backend')));assert(!existsSync(join(directory,'admin')));
  }finally{rmSync(directory,{recursive:true,force:true});}
});


test('switching runtime preserves signed-in sessions and Library revisions on the same database',async()=>{
  const fixture=await cleanupFixture(),{env,namespaceNames}=fixture;
  const call=async(worker,path,body={},token='')=>{
    const response=await worker.fetch(new WorkspaceRequest('https://development.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),env);
    const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;
  };
  try{
    const {token}=await call(academy,'/api/account/login',{uniqueid:'login-0001',pin:'1234'});
    const id='EXTERNAL:INTERNET_ARCHIVE:branch-switch-book';
    const saved=await call(academy,'/api/academy/open-library/metadata/save',{id,title:'Before deployment',baseRevision:0,learningAreaRefs:[]},token);
    assert.equal(saved.record.revision,1);
    assert.equal((await call(academy,'/api/account/session',{},token)).sessionStore,'D1');
    const changed=await call(academy,'/api/academy/open-library/metadata/save',{id,title:'After deployment',baseRevision:1,learningAreaRefs:[]},token);assert.equal(changed.record.revision,2);
    const restored=await call(academy,'/api/academy/open-library/metadata/list',{},token);
    assert.equal(restored.records.find(row=>row.id===id).revision,2);
    assert(namespaceNames.every(name=>name==='synthetic-existing-platform:open-library-metadata'));
  }finally{fixture.db.close();fixture.metadata.close();}
});

test('Pages uses the dedicated builder without a legacy application fallback',()=>{assert.equal(developmentPagesBuildCommand,'npm --prefix backend ci && node backend/tools/academy-pages-build.mjs');});
