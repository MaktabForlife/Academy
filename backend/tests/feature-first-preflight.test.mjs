import test from 'node:test';
import assert from 'node:assert/strict';
import {readFeaturePreflight,safeBindings} from '../tools/feature-first-preflight.mjs';
test('Feature metadata evidence strips secret and unknown plain-text values',()=>{
 const result=safeBindings([{name:'PIN_SECRET',type:'secret_text',text:'must-never-appear'},{name:'UNREVIEWED',type:'plain_text',text:'must-never-appear'},{name:'ACADEMY_D1_MODE',type:'plain_text',text:'PAUSED'},{name:'ACADEMY_DB',type:'d1',id:'synthetic-db',secret:'must-never-appear'}]);
 assert(!JSON.stringify(result).includes('must-never-appear'));assert.equal(result[2].text,'PAUSED');assert.equal(result[3].id,'synthetic-db');
});
test('Preflight reads exactly two Worker configurations and Pages metadata, with no hosted app or data calls',async()=>{
 const urls=[],version='11111111-1111-4111-8111-111111111111';
 const request=async(url,options)=>{
  urls.push(url);assert.equal(options.method,undefined);assert.equal(options.headers.Authorization,'Bearer disposable-mock');
  const path=new URL(url).pathname;let result;
  if(path.endsWith('/settings'))result={bindings:[],compatibility_date:'2026-10-23',compatibility_flags:['nodejs_compat']};
  else if(path.endsWith('/subdomain'))result={enabled:false,previews_enabled:false};
  else if(path.endsWith('/schedules'))result={schedules:[]};
  else if(path.endsWith('/deployments'))result={deployments:[{versions:[{version_id:version}]}]};
  else if(path.endsWith('/versions/'+version))result={resources:{script:{migration_tag:'existing-tag'}}};
  else if(path.endsWith('/pages/projects/academy-maktab4life'))result={name:'academy-maktab4life',production_branch:'studio_dev',deployment_configs:{preview:{}}};
  else throw Error('Unexpected metadata request');
  return Response.json({success:true,result});
 };
 const r=await readFeaturePreflight({token:'disposable-mock',request});
 assert.equal(urls.length,11);assert(urls.every(u=>u.startsWith('https://api.cloudflare.com/client/v4/accounts/c9a3e355b3d7a795880b1d36a1dbe123/')));
 assert.equal(r.hostedWorkerCalls,0);assert.equal(r.hostedD1Queries,0);assert.equal(r.hostedR2Calls,0);assert.equal(r.kind,'CONTROL_PLANE_ONLY_NOT_READINESS');
 assert.deepEqual(r.workers.map(w=>w.name),['feature_worker','academy-feature-split-coordinator']);assert(r.workers.every(w=>w.migrationTag==='existing-tag'));
});
