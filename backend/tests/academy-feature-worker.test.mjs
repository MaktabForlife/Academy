import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {buildAcademyAssets} from '../tools/academy-assets.mjs';
import feature,{featurePreviewOrigin} from '../src/academy-feature-runtime.js';
import {cleanupFixture} from './fixtures/academy-cleanup-fixture.mjs';

test('feature packaging uses its own API and cannot select the main website',()=>{
 const directory=mkdtempSync('/private/tmp/academy-feature-assets-');
 try{
  buildAcademyAssets({repo:new URL('../../',import.meta.url).pathname,directory,target:'feature'});
  const source=readFileSync(join(directory,'js/m4l-config.js'),'utf8');
  for(const host of ['feature-admin.academy-maktab4life.pages.dev','abcdef12.academy-maktab4life.pages.dev']){
   const window={location:{hostname:host,origin:'https://'+host}};vm.runInNewContext(source,{window});
   assert.equal(window.M4L_CONFIG.API_BASE,'https://feature_worker.maktab4life.workers.dev');
  }
  for(const host of ['maktab4life.org','academy-maktab4life.pages.dev','development.academy-maktab4life.pages.dev','feature-admin.academy-maktab4life.pages.dev.evil.example','unknown.example']){
   const window={location:{hostname:host,origin:'https://'+host}};vm.runInNewContext(source,{window});assert.equal(window.M4L_CONFIG.API_BASE,'');
  }
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('the feature Worker shares current storage without changing the Development Worker or adding a schedule',()=>{
 const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8'));
 const config=read('../wrangler.feature.jsonc'),development=read('../wrangler.jsonc');
 assert.equal(config.name,'feature_worker');assert.equal(development.name,'devrebootworker');
 assert.deepEqual(config.d1_databases,development.d1_databases);assert.deepEqual(config.r2_buckets,development.r2_buckets);
 assert.deepEqual(config.ratelimits,development.ratelimits);
 assert.deepEqual(config.durable_objects.bindings,[{name:'PROGRAM_TIMETABLE_COORDINATOR',class_name:'ProgramTimetableCoordinator',script_name:'devrebootworker'}]);
 assert.deepEqual(config.triggers.crons,[]);assert.equal(feature.scheduled,undefined);assert.equal(config.migrations,undefined);
 assert(config.secrets.required.includes('SHARED_PIN_SECRET'));assert(config.secrets.required.includes('ACADEMY_OPEN_LIBRARY_STORAGE_KEY'));
});

test('only feature Pages origins pass CORS, including immutable deployments; workspace headers are accepted',async()=>{
 const f=await cleanupFixture();
 try{
  for(const origin of ['https://feature-admin.academy-maktab4life.pages.dev','https://abcdef12.academy-maktab4life.pages.dev']){
   assert(featurePreviewOrigin(origin));
   const response=await feature.fetch(new Request('https://feature.invalid/api/health',{headers:{Origin:origin}}),f.env);
   assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
   const preflight=await feature.fetch(new Request('https://feature.invalid/api/account/session',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Headers':'authorization,x-academy-workspace'}}),f.env);
   assert.equal(preflight.status,204);assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/X-Academy-Workspace/);
  }
  for(const origin of ['https://maktab4life.org','https://academy-maktab4life.pages.dev','https://feature-admin.academy-maktab4life.pages.dev.evil.example','null','http://feature-admin.academy-maktab4life.pages.dev']){
   const response=await feature.fetch(new Request('https://feature.invalid/api/health',{headers:{Origin:origin}}),f.env);
   assert.equal(response.status,403);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
  }
 }finally{f.db.close();f.metadata.close();}
});
