import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {contentMediaFixture,ok} from './fixtures/academy-content-media-fixture.mjs';
import {summarizeContextReadCosts as summarize} from './fixtures/academy-context-read-growth.mjs';
import {lessonContextSQL} from '../src/academy/d1/lesson-context-reads.js';
import {lessonContextSelection,lessonContextFilter} from '../src/academy/separation/lesson-context-read.js';
const statement=(kind,key)=>({sql:lessonContextSQL[kind],params:[key],lessonContextRead:{kind,values:[key]}}),proof=key=>({signature:JSON.stringify([false,[key.toUpperCase()+'|PROGRAM_ADMIN']])});
test('native content options and exact retries stay scoped while owner write-plan growth remains measured',async()=>{
 const reports=[];
 for(const growth of [0,250]){const f=await contentMediaFixture({growth});try{
  const actions={},measure=async(name,action,input)=>{const at=f.costs.length,result=ok(await f.request(action,input,f.admin));actions[name]=summarize(f.costs.slice(at));return result;};
  const activityKey=f.scope,options=await measure('options','binding-options',{activityKey,classId:'class-1'}),input={activityKey,classId:'class-1',subjectKey:'MODULE:recorded-subject-module',recordingDate:'2026-10-28',teacherIds:['account-0006'],optionsRevision:options.optionsRevision,operationId:crypto.randomUUID()};await measure('create','binding-create',input);assert.equal((await measure('exactRetry','binding-create',input)).replayed,true);
  await measure('courseOptions','binding-options',{activityKey:f.scopes.courseA});reports.push({growth,actions});
 }finally{f.close();}}
 for(const name of ['options','create','exactRetry','courseOptions'])assert.equal(reports[0].actions[name].readCaptureRows,reports[1].actions[name].readCaptureRows,name+' unrelated captures');assert(reports[1].actions.create.writePlanCaptureRows>reports[0].actions.create.writePlanCaptureRows);
 const report={hostedActions:0,measurement:'All captured coordinator rows and statements for the measured requests; not billed D1 reads or complete physical scan counts. Generic write planning is unchanged and grows.',reports};if(process.env.CONTENT_MEDIA_BUDGET_OUTPUT)await writeFile(process.env.CONTENT_MEDIA_BUDGET_OUTPUT,JSON.stringify(report,null,2));console.log(JSON.stringify(reports.map(r=>({growth:r.growth,actions:Object.fromEntries(Object.entries(r.actions).map(([k,v])=>[k,{reads:v.readCaptureRows,writePlan:v.writePlanCaptureRows,statements:v.coordinatorStatements}]))}))));
});
test('new exact class, Surah and Teacher read recipes reject SQL, parameter, owner and scope tampering',()=>{
 const key='PROGRAM:own',auth=proof(key);
 for(const kind of ['classes','surahs','teachers']){const st=statement(kind,key);assert.equal(lessonContextSelection([st],auth,'admin').scope,key);assert.throws(()=>lessonContextSelection([{...st,sql:st.sql+' '}],auth,'admin'));assert.throws(()=>lessonContextSelection([{...st,params:['PROGRAM:other']}],auth,'admin'));assert.throws(()=>lessonContextSelection([st],auth,'core'));assert.throws(()=>lessonContextSelection([statement(kind,'PROGRAM:other')],auth,'admin'));assert.throws(()=>lessonContextSelection([{...st,acceptedScope:key}],auth,'admin'));assert.throws(()=>lessonContextFilter('accounts',{kind:'classes',values:[key]}));}
});
