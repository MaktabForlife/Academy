import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createAcademyWorkerdFixture} from './jwt-v110-workerd-fixture.mjs';
test('Proposed separate JWT10per60 binding limits before authentication D1 work',async()=>{
 const f=await createAcademyWorkerdFixture(),statuses=[];try{
  for(let i=0;i<11;i++){const r=await f.runtime.dispatchFetch('https://feature_worker.maktab4life.workers.dev/auth/v110/csrf',{headers:{Origin:'https://feature_worker.maktab4life.workers.dev','Sec-Fetch-Site':'same-origin','CF-Connecting-IP':'192.0.2.33'}});statuses.push(r.status);const m=JSON.parse(r.headers.get('x-feature-local-budget'));assert.equal(m.rateChecks,1);assert(Object.values(m.d1).every(d=>d.statements===0));await r.body?.cancel();}
  assert(statuses.slice(0,10).every(s=>s===401));assert.equal(statuses[10],429);
  if(process.env.JWT_V110_EVIDENCE){mkdirSync(process.env.JWT_V110_EVIDENCE,{recursive:true});writeFileSync(process.env.JWT_V110_EVIDENCE+'/workerd-refresh-rate.json',JSON.stringify({schema:1,commit:process.env.GITHUB_SHA,actualLocalRateBinding:true,namespace:'100112',limit:10,period:60,statuses,frontWorkerRequests:11,privateCoordinatorCalls:0,d1Statements:0,fixtureDirectOldSentinelQueries:2,hostedRequests:0,limits:'Local configured binding proof; Cloudflare rate limits are approximate per-location controls, not a global hard cap.'},null,2)+'\n');}
 }finally{await f.close();}
});
