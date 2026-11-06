import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const account='c9a3e355b3d7a795880b1d36a1dbe123';
const d1=[{binding:'ACADEMY_DB',database_name:'feature-academy-core',database_id:'0eaf6d46-bbaa-46e3-8287-b6113ef8f2a8'},{binding:'ACADEMY_ADMIN_DB',database_name:'feature-academy-admin',database_id:'18ad0efb-cd34-42a4-b510-7051f0303200'}];
const buckets=[{binding:'LESSON_MEDIA_BUCKET',bucket_name:'maktab-lesson-media-private-feature'},{binding:'ASSESSMENT_BUCKET',bucket_name:'maktab-assessments-private-feature'},{binding:'MEDIA_BUCKET',bucket_name:'maktab-feature-media-private'}];
const allowed=new Set(['$schema','name','account_id','main','compatibility_date','compatibility_flags','workers_dev','preview_urls','keep_vars','d1_databases','r2_buckets','ratelimits','durable_objects','migrations','triggers','observability','vars','secrets']);
const read=(repo,path)=>JSON.parse(readFileSync(resolve(repo,path),'utf8'));
export function assertFeatureTargets(worker,coordinator,hosting){
 for(const c of [worker,coordinator]){
  for(const k of Object.keys(c))assert(allowed.has(k),'Unexpected binding/config key: '+k);
  assert.equal(c.account_id,account);assert.deepEqual(c.d1_databases,d1);assert.deepEqual(c.triggers,{crons:[]});
  assert.equal(c.keep_vars,false);assert.equal(c.preview_urls,false);assert.equal(c.compatibility_date,'2026-10-23');assert.deepEqual(c.compatibility_flags,['nodejs_compat']);
 }
 assert.equal(worker.name,'feature_worker');assert.equal(worker.main,'src/academy-development-runtime.js');assert.equal(worker.workers_dev,true);
 assert.deepEqual(worker.r2_buckets,buckets);
 assert.deepEqual(worker.durable_objects,{bindings:[{name:'PROGRAM_TIMETABLE_COORDINATOR',class_name:'ProgramTimetableCoordinator'},{name:'ACADEMY_SPLIT_COORDINATOR',class_name:'AcademySplitCoordinator',script_name:'academy-feature-split-coordinator'}]});
 assert.deepEqual(worker.migrations,[{tag:'feature-isolated-v1',new_sqlite_classes:['ProgramTimetableCoordinator']}]);
 assert.deepEqual(worker.secrets,{required:['PIN_SECRET','SESSION_SECRET','SHARED_PIN_SECRET','ACADEMY_OPEN_LIBRARY_STORAGE_KEY']});
 assert.deepEqual(worker.ratelimits,[{name:'AUTH_LOGIN_RATE_LIMITER',namespace_id:'100111',simple:{limit:5,period:60}}]);
 const vars={ACADEMY_D1_MODE:'PAUSED',ACADEMY_LIBRARY_MODE:'PUBLIC_ONLY',ENVIRONMENT:'feature',ALLOWED_ORIGINS:'https://feature-preview.academy-maktab4life.pages.dev',API_ORIGIN:'https://feature_worker.maktab4life.workers.dev',ACADEMY_OBJECT_NAMESPACE:'feature-isolated-v1/',ACADEMY_D1_RUN_ID:'FEATURE_NOT_INITIALISED',ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_DEPLOYMENT_KIND:'ISOLATED_PREVIEW',ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_MEDIA_SEPARATION:'1',ACADEMY_NOTE_RETENTION:'1',ACADEMY_MESSAGING:'1',ACADEMY_WEEKLY_ABSENTEES:'1',ACADEMY_MONTHLY_SUBSCRIPTIONS:'1',ACADEMY_SURAH_GRANTS:'1',ACADEMY_WEB_PLATFORM:'0',ACADEMY_WEBSITE_STUDIO:'0',HIFZ_HANDOFF_ENABLED:'0',HIFZ_PROFILE_SYNC_URL:'',HIFZ_DEVELOPMENT_HANDOFF_URL:''};
 assert.deepEqual(worker.vars,vars);
 assert.equal(coordinator.name,'academy-feature-split-coordinator');assert.equal(coordinator.main,'src/academy-split-coordinator.js');assert.equal(coordinator.workers_dev,false);
 assert.deepEqual(Object.keys(coordinator).filter(k=>!['$schema','name','account_id','main','compatibility_date','compatibility_flags','workers_dev','preview_urls','keep_vars','d1_databases','durable_objects','migrations','triggers','observability'].includes(k)),[]);
 assert.deepEqual(coordinator.durable_objects,{bindings:[{name:'ACADEMY_SPLIT_COORDINATOR',class_name:'AcademySplitCoordinator'}]});
 assert.deepEqual(coordinator.migrations,[{tag:'feature-isolated-v1',new_sqlite_classes:['AcademySplitCoordinator']}]);
 assert.deepEqual(hosting,{schema:1,environment:'feature',academyPortalOrigin:'https://feature-preview.academy-maktab4life.pages.dev',academyLegacyOrigins:[],academyApiOrigin:'https://feature_worker.maktab4life.workers.dev',studioOrigin:'https://studio-unavailable.invalid',studioBackendOrigin:'https://studio-unavailable.invalid',hifzOrigin:'https://hifz-unavailable.invalid'});
 return {account,worker:worker.name,coordinator:coordinator.name,databaseIds:d1.map(v=>v.database_id),buckets:buckets.map(v=>v.bucket_name),mode:'PAUSED',productionBindings:0};
}
export function checkFeatureTargets(repo=resolve('..')){
 return assertFeatureTargets(read(repo,'backend/wrangler.feature.jsonc'),read(repo,'backend/wrangler.feature-coordinator.jsonc'),read(repo,'config/hosting.feature.json'));
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname)console.log(JSON.stringify(checkFeatureTargets(process.argv[2]||resolve('.'))));
