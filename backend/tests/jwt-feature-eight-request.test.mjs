import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {runEightRequestSmoke} from '../tools/jwt-feature-eight-request-smoke.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');
test('fixed eight actual native API requests measure own learner flow and replay cancellation without extra DB probes',async()=>{
 const root=resolve(process.env.JWT_APP_SOURCE_ROOT),{createAcademyWorkerdFixture}=await import(pathToFileURL(resolve(root,'backend/tests/jwt-v110-workerd-fixture.mjs')).href);
 const fixture=await createAcademyWorkerdFixture();
 try{
  const result=await runEightRequestSmoke({dispatch:(url,options)=>fixture.runtime.dispatchFetch(url,options),uniqueid:'feature-test-learner',pin:'2468',expectedAccount:'feature-synthetic-learner-a'});
  assert.equal(result.calls.length,8);assert.deepEqual(result.calls.map(x=>x.status),[200,200,200,200,403,200,200,401]);assert(result.replayedNonemptyPreLogoutCookie);assert.equal(result.totals.remote,0);
  for(const row of result.calls)assert.deepEqual(Object.keys(row).sort(),['label','method','metrics','path','setCookieCount','status']);
  const report={...result,preparationCommit:process.env.GITHUB_SHA,appSource:process.env.JWT_APP_SOURCE_SHA,fixturePlacement:'Parent1e76 four-binding disposable fresh Core/Admin with held empty sentinels; release composition still pending',compatibilityDate:'2026-10-23',runtime:{miniflare:JSON.parse(readFileSync(resolve(process.env.FEATURE_MF_ROOT,'node_modules/miniflare/package.json'))).version,workerd:JSON.parse(readFileSync(resolve(process.env.FEATURE_MF_ROOT,'node_modules/workerd/package.json'))).version},hostedExecuted:false,hostedDBReads:0,hostedWorkerCalls:0,verifierSelects:2,verifierScope:'Parent fixture close checks two held LOCAL sentinels; excluded from front API projection; no hosted equivalent proposed'};
  const out=resolve(process.env.RUNNER_TEMP,'jwt-fresh-pair-evidence');mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'eight-request-projection.json'),JSON.stringify(report,null,2)+'\n');
 }finally{await fixture.close();}
});
test('HTTP status failure stops after one request with no response/body credential detail',async()=>{
 let n=0;const token='synthetic-credential-value';
 await assert.rejects(runEightRequestSmoke({dispatch:async()=>{n++;return Response.json({error:token},{status:403});},uniqueid:'synthetic',pin:'1234',expectedAccount:'synthetic',requireMetrics:false}),e=>e.message==='JWT_SMOKE_login_STATUS_403'&&!e.message.includes(token));
 assert.equal(n,1);
});
test('transport failure emits an allowlisted step code and never retries',async()=>{
 let n=0;await assert.rejects(runEightRequestSmoke({dispatch:async()=>{n++;throw Error('private synthetic failure detail');},uniqueid:'synthetic',pin:'1234',expectedAccount:'synthetic',requireMetrics:false}),e=>e.message==='JWT_SMOKE_login_TRANSPORT');assert.equal(n,1);
});
