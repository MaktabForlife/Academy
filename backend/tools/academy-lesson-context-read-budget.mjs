// Compare only disposable synthetic databases, without editing either checkout.
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {seedContextReadGrowth,summarizeContextReadCosts} from '../tests/fixtures/academy-context-read-growth.mjs';
import {ok,correction} from '../tests/fixtures/academy-recorded-context-fixture.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),baseline=process.env.LESSON_CONTEXT_BASELINE_ROOT||resolve(root,'../Academy-academic-lesson-corrections'),out=process.env.LESSON_CONTEXT_BUDGET_OUTPUT||'/private/tmp/academy-lesson-context-read-budget';await mkdir(out,{recursive:true});const comparisons=[];
for(const [candidate,path] of [['reviewed-editor',baseline],['scoped-editor-reads',root]]){
 const {splitVideoFixture}=await import(pathToFileURL(resolve(path,'backend/tests/fixtures/academy-session-video-split-fixture.mjs')).href);
 for(const growth of [0,250]){
  const f=await splitVideoFixture(source=>seedContextReadGrowth(source,growth));try{
   const admin=await f.source.actor('adminA'),scope=f.scopes.programA,period={activityKey:scope,startDate:'2026-10-27',endDate:'2026-10-27'},session=ok(await f.request('sessions',period,admin)).sessions[0],lessonId=ok(await f.request('create',{...period,sessionKey:session.sessionKey,sessionVersion:session.sessionVersion,operationId:crypto.randomUUID()},admin)).lessonId,actions={};
   const input=correction(lessonId);for(const [name,action,body] of [['coldOptions','context-options',{lessonId}],['repeatOptions','context-options',{lessonId}],['save','context-save',input],['exactRetry','context-save',input]]){const at=f.costs.length,result=ok(await f.request(action,body,admin));if(name==='exactRetry')assert(result.replayed);actions[name]=summarizeContextReadCosts(f.costs.slice(at));}
   comparisons.push({candidate,root:path,growth,actions});for(const db of Object.values(f.databases))assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{f.close();}
 }
}
const result={hostedActions:0,baselineCommit:'ad1401ee3ca34f49aff8dcda08b3cd4da92e7ac5',measurement:'Same synthetic fixtures; coordinator SQL statements and transferred/materialized rows only. Not billed D1 rows_read, bytes read, or complete HTTP request cost.',growth:'250 unrelated accounts, lessons, subjects/modules, activities, classes, settings and retry receipts',comparisons};await writeFile(resolve(out,'comparison.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(comparisons.map(c=>({candidate:c.candidate,growth:c.growth,actions:Object.fromEntries(Object.entries(c.actions).map(([name,a])=>[name,{statements:a.coordinatorStatements,readRows:a.readCaptureRows,writePlanRows:a.writePlanCaptureRows}]))}))));
