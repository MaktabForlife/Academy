import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,symlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {plan,planSHA256,workflowPath,assertContext,sourceScopeLines,assertScope,windowLines,assertWindow,assertOneAttempt,activationApproval,preparePublicSource,contextDirectory,privateJSONFile} from '../tools/jwt-feature-activation-approved.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');globalThis.fetch=()=>{throw Error('HOSTED_FETCH_FORBIDDEN_SOURCE_CHECK');};
const hash=x=>createHash('sha256').update(x).digest('hex');
import {fixture} from './fixtures/jwt-feature-activation-approval-fixture.mjs';

test('source scope binds exact source/ACTIVE/full-bundle controls without granting a private window',()=>{
 const f=fixture();assertScope(f.proof,f.comment,{source:f.context.source,prNumber:101});
 const bad=structuredClone(f.proof);bad.plan.target='production';assert.throws(()=>assertScope(bad,f.comment));
 assert.throws(()=>assertScope(f.proof,{...f.comment,body:f.comment.body+'\njwt-activation-mode: PAUSED'}));
});
test('only a fresh exact post-preparation owner window passes',()=>{
 const f=fixture(),r=assertWindow(f.windowArgs());assert.equal(r.window,plan.window.lease);assert.equal(r.preparedRunId,1000);
});
for(const change of ['withdrawn','wrong-owner','edited','expired','before-preparation','artifact','active-line','retry-line'])test('registration rejects '+change,()=>{
 const f=fixture();
 if(change==='withdrawn')f.windowStatus.state='failure';
 if(change==='wrong-owner')f.windowComment.user.login='Other';
 if(change==='edited')f.windowComment.updated_at=new Date(Date.now()+1000).toISOString();
 if(change==='expired')f.windowArgs=(()=>{const old=f.windowArgs;return ()=>({...old(),now:Date.now()+3600000});})();
 if(change==='before-preparation')f.preparedRun.updated_at=new Date(Date.now()+1000).toISOString();
 if(change==='artifact')f.preparedArtifacts.artifacts[0].digest='sha256:'+'e'.repeat(64);
 if(change==='active-line'||change==='retry-line'){f.windowComment.body+='\n'+(change==='active-line'?'mode: ACTIVE':'retry: allowed');f.windowStatus.description='optimisation-window-sha256:'+hash(f.windowComment.body);}
 assert.throws(()=>assertWindow(f.windowArgs()));
});
test('single-attempt identity rejects reruns and spent dispatches on any other source head',async()=>{
 const f=fixture();await assertOneAttempt(f.api,f.context);
 assert.throws(()=>assertContext({...f.context,attempt:'2'}));
 f.history.push({...f.ownRun,id:999,status:'completed',head_sha:'f'.repeat(40),conclusion:'cancelled'});
 await assert.rejects(assertOneAttempt(f.api,f.context));
});
test('current approval/window withdrawal stops the real composed gate with no writes',async()=>{
 const f=fixture();const a=await activationApproval(f.approvalArgs());f.windowStatus.state='failure';
 await assert.rejects(a.fresh());assert.deepEqual(f.writes,[]);
});
test('a competing Feature run blocks the current gate before private effects',async()=>{
 const f=fixture();f.competing=true;await assert.rejects(activationApproval(f.approvalArgs()));assert.deepEqual(f.writes,[]);
});
test('public preparation can only fast-forward the approved source and never dispatch',async()=>{
 const f=fixture({publicMode:true});
 const r=await preparePublicSource({api:f.api,mergeSha:f.proof.mergeSha,expectedCandidate:f.context.source,localGuard:async()=>{},resolveProof:async()=>f.proof});
 assert.equal(r.dispatched,false);assert.equal(r.cloudflareCalls,0);assert.equal(f.writes.length,1);
 assert(!f.calls.some(p=>p.includes('dispatches')));
});
test('public preparation cannot renew a spent private attempt or overwrite a foreign Feature source',async()=>{
 for(const kind of ['spent','foreign']){
  const f=fixture({publicMode:true});if(kind==='spent')f.history=[f.ownRun];else f.featureHead='e'.repeat(40);
  await assert.rejects(preparePublicSource({api:f.api,mergeSha:f.proof.mergeSha,expectedCandidate:f.context.source,localGuard:async()=>{},resolveProof:async()=>f.proof}));
  assert.deepEqual(f.writes,[]);
 }
});
test('private identity directory/file binding refuses aliases and does not follow a receipt symlink',()=>{
 const f=fixture(),temp=mkdtempSync(resolve(process.env.RUNNER_TEMP,'first-replacement-files-')),dir=contextDirectory(temp,f.context,{create:true});
 privateJSONFile(dir,'identity.json',{value:{schema:1},exclusive:true});assert.throws(()=>privateJSONFile(dir,'identity.json',{value:{schema:2},exclusive:true}));
 const outside=resolve(temp,'outside.txt');writeFileSync(outside,'UNCHANGED');symlinkSync(outside,resolve(dir,'checkpoint.json'));
 assert.throws(()=>privateJSONFile(dir,'checkpoint.json',{value:{x:1}}));assert.equal(readFileSync(outside,'utf8'),'UNCHANGED');
 assert.throws(()=>privateJSONFile(dir,'../escape.json',{value:{x:1}}));
 writeFileSync(resolve(dir,'large.json'),' '.repeat(1000));assert.throws(()=>privateJSONFile(dir,'large.json',{maximum:50}));
});

test('registration IDs reject path/query injection before the first GitHub request',async()=>{
 const f=fixture(),args=f.approvalArgs();args.registrationComment='../secrets?x=1';
 await assert.rejects(activationApproval(args));assert.deepEqual(f.calls,[]);
});

test('complete Feature list rejects incomplete coverage and includes old-run reruns outside the new window',async()=>{
 for(const kind of ['old-run','incomplete']){
  const f=fixture();if(kind==='old-run')f.competing=true;else f.incomplete=true;
  await assert.rejects(activationApproval(f.approvalArgs()));assert.deepEqual(f.writes,[]);
 }
});
test('real retained PR resolution plus all new fresh invariants cost21 then10 REST reads, no freshness cache',async()=>{
 const f=fixture(),args=f.approvalArgs();delete args.resolveProof;
 const before=f.calls.length,a=await activationApproval(args);assert.equal(f.calls.length-before,21);
 const n=f.calls.length;await a.fresh();assert.equal(f.calls.length-n,10);
 assert.equal(f.calls.filter(x=>x.includes('/actions/runs?branch=feature-preview&per_page=100')).length,2);
});
