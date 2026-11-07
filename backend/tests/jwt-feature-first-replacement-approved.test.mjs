import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,symlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {plan,planSHA256,workflowPath,assertContext,sourceScopeLines,assertScope,windowLines,assertWindow,assertOneAttempt,firstReplacementApproval,preparePublicSource,contextDirectory,privateJSONFile} from '../tools/jwt-feature-first-replacement-approved.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');globalThis.fetch=()=>{throw Error('HOSTED_FETCH_FORBIDDEN_SOURCE_CHECK');};
const hash=x=>createHash('sha256').update(x).digest('hex');
function fixture({publicMode=false}={}){
 const now=Date.now(),source='a'.repeat(40),merge='b'.repeat(40),head='c'.repeat(40);
 const context={repository:'MaktabForlife/Academy',ref:'refs/heads/feature-preview',event:'workflow_dispatch',source,runId:'1001',attempt:'1',workflowRef:'MaktabForlife/Academy/'+workflowPath+'@refs/heads/feature-preview'};
 const comment={id:7,user:{login:'MaktabForlife'},body:['Optimisation approval','head: '+head,'target: feature','db-changes: none',...sourceScopeLines(source)].join('\n')};
 const proof={schema:1,repo:context.repository,mergeSha:merge,pr:101,headSha:head,approvalStatusId:11,approvalURL:'https://github.com/MaktabForlife/Academy/pull/101#issuecomment-7',commentId:7,commentHash:hash(comment.body),plan:{schema:1,request:plan.request,kind:'component',target:'feature',contains_jwt:true,database_changes:false,version:plan.version,feature_base_sha:plan.featureBase,feature_sha:source}};
 const preparedRun={id:1000,path:workflowPath,event:'push',head_branch:'studio_dev',head_sha:merge,status:'completed',conclusion:'success',actor:{login:'MaktabForlife'},updated_at:new Date(now-2000).toISOString()};
 const preparedArtifacts={total_count:1,artifacts:[{id:100,name:'jwt-first-replacement-public-1000',expired:false,digest:'sha256:'+'d'.repeat(64)}]};
 const windowComment={id:8,user:{login:'MaktabForlife'},created_at:new Date(now-1000).toISOString(),updated_at:new Date(now-1000).toISOString(),body:windowLines({source,merge,preparedRun:'1000',preparedDigest:'d'.repeat(64),expires:new Date(now+600000).toISOString()}).join('\n')};
 const windowStatus={id:12,context:'optimisation/paused-first-replacement',state:'success',creator:{login:'MaktabForlife'},description:'optimisation-window-sha256:'+hash(windowComment.body),target_url:'https://github.com/MaktabForlife/Academy/pull/101#issuecomment-8',created_at:new Date(now-900).toISOString()};
 const ownRun={id:1001,path:workflowPath,event:'workflow_dispatch',head_branch:'feature-preview',head_sha:source,run_attempt:1,status:'in_progress',actor:{login:'MaktabForlife'},repository:{full_name:context.repository},head_repository:{full_name:context.repository}};
 const approvalStatus={id:11,context:'optimisation/approval',state:'success',creator:{login:'MaktabForlife'},description:'optimisation-record-sha256:'+proof.commentHash};
 const f={context,comment,proof,preparedRun,preparedArtifacts,windowComment,windowStatus,ownRun,approvalStatus,featureHead:publicMode?plan.featureBase:source,history:publicMode?[]:[ownRun],competing:false,calls:[],writes:[]};
 f.api=async(path,options={})=>{
  f.calls.push(path);
  if(options.method){assert.equal(options.method,'PATCH');assert.equal(path,'/repos/MaktabForlife/Academy/git/refs/heads/feature-preview');assert.deepEqual(options.body,{sha:source,force:false});f.writes.push(path);f.featureHead=source;return {};}
  if(path.includes('/compare/'))return {status:'ahead',behind_by:0,files:plan.sourcePaths.map(filename=>({filename,status:'added'}))};
  if(path.includes('/contents/')){const p=path.split('/contents/')[1].split('?')[0];return {sha:{...plan.frozenBlobs,...plan.canonicalControls,...plan.frozenAssetProducerBlobs}[p]};}
  if(path.endsWith('/issues/comments/7'))return comment;
  if(path.endsWith('/issues/comments/8'))return f.windowComment;
  if(path.endsWith('/git/ref/heads/studio_dev'))return {object:{sha:merge}};
  if(path.endsWith('/git/ref/heads/feature-preview'))return {object:{sha:f.featureHead}};
  if(path.includes('/commits/'+head+'/statuses'))return [f.approvalStatus];
  if(path.includes('/commits/'+source+'/statuses'))return [f.windowStatus];
  if(path.endsWith('/actions/runs/1001'))return f.ownRun;
  if(path.endsWith('/actions/runs/1000'))return f.preparedRun;
  if(path.includes('/actions/runs/1000/artifacts'))return f.preparedArtifacts;
  if(path.includes('/actions/workflows/'))return {total_count:f.history.length,workflow_runs:f.history};
  if(path.includes('/actions/runs?branch=feature-preview')){
   const runs=f.competing?[{id:9999}]:(!publicMode&&path.includes('status=in_progress')?[ownRun]:[]);return {total_count:runs.length,workflow_runs:runs};
  }
  throw Error('UNEXPECTED_GITHUB_ONLY_TEST_PATH');
 };
 f.windowArgs=()=>({proof,comment:f.windowComment,statuses:[f.windowStatus],preparedRun:f.preparedRun,preparedArtifacts:f.preparedArtifacts,context,registrationComment:8,registrationStatus:12,preparedRunId:1000,now});
 f.approvalArgs=()=>({api:f.api,mergeSha:merge,prNumber:101,context,localGuard:async()=>{},registrationComment:8,registrationStatus:12,preparedRunId:1000,resolveProof:async()=>proof});
 return f;
}
test('source scope binds exact source/PAUSED/full-bundle controls without granting a private window',()=>{
 const f=fixture();assertScope(f.proof,f.comment,{source:f.context.source,prNumber:101});
 const bad=structuredClone(f.proof);bad.plan.target='production';assert.throws(()=>assertScope(bad,f.comment));
 assert.throws(()=>assertScope(f.proof,{...f.comment,body:f.comment.body+'\npaused-first-replacement-mode: ACTIVE'}));
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
 const f=fixture();const a=await firstReplacementApproval(f.approvalArgs());f.windowStatus.state='failure';
 await assert.rejects(a.fresh());assert.deepEqual(f.writes,[]);
});
test('a competing Feature run blocks the current gate before private effects',async()=>{
 const f=fixture();f.competing=true;await assert.rejects(firstReplacementApproval(f.approvalArgs()));assert.deepEqual(f.writes,[]);
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
 await assert.rejects(firstReplacementApproval(args));assert.deepEqual(f.calls,[]);
});

test('public workflow scheduling is separated while private isolation and all accepted job controls stay byte-identical',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/feature-jwt-paused-first-replacement.yml',import.meta.url),'utf8');
 const group="${{ github.event_name == 'workflow_dispatch' && format('feature-isolation-{0}', github.ref) || format('jwt-first-replacement-public-{0}-{1}', github.workflow, github.ref) }}",line='  group: '+group;
 assert.equal(workflow.split(line).length,2,'Exactly one reviewed concurrency expression');
 const restored=workflow.replace(line,"  group: feature-isolation-${{ github.ref }}");
 const bytes=Buffer.from(restored);
 assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+String.fromCharCode(0)),bytes])).digest('hex'),'2b52a34cf4e9e4714c36ccc9d6d99987d97f93e1','Only the group expression may differ from accepted b9 workflow');
 assert(workflow.includes('  cancel-in-progress: false\n'));
 // Evaluate the exact approved expression, not an alternate workflow model.
 const evaluate=new Function('github','format','return ('+group.slice(3,-2)+');');
 const format=(pattern,...args)=>pattern.replace(/\{([0-9]+)\}/g,(_,i)=>String(args[Number(i)]));
 const own='Protected PAUSED JWT Feature first replacement',legacy=['Approved four-GET JWT Feature inspection','Protected MAIN post-PATCH read-only inspection','Protected owned JWT Feature cleanup','Protected read-only JWT Feature final fences'];
 const events=[['push','refs/heads/studio_dev'],['pull_request','refs/pull/17/merge']];
 for(const [event_name,ref]of events){
  const selected=evaluate({event_name,ref,workflow:own},format);
  assert.equal(selected,'jwt-first-replacement-public-'+own+'-'+ref);
  assert.notEqual(selected,'feature-isolation-'+ref);
  for(const workflow of legacy)assert.notEqual(selected,evaluate({event_name,ref,workflow},format));
  assert.notEqual(selected,evaluate({event_name,ref:ref+'-other',workflow:own},format));
 }
 for(const ref of ['refs/heads/feature-preview','refs/heads/studio_dev']){
  for(const workflow of [own,...legacy]){
   assert.equal(evaluate({event_name:'workflow_dispatch',ref,workflow},format),'feature-isolation-'+ref,'Private dispatch retains the exact shared group');
  }
 }
 assert(workflow.includes("  prepare:\n    needs: check\n    if: github.event_name == 'push' && github.ref == 'refs/heads/studio_dev' && needs.check.outputs.selected == 'true'"));
 const publicJobs=workflow.slice(0,workflow.indexOf('  validate:\n'));
 for(const forbidden of ['environment: feature','CLOUDFLARE_API_TOKEN','CF_FEATURE_DEPLOY_TOKEN','/dispatches'])assert(!publicJobs.includes(forbidden),'No private privilege or dispatch in public check/preparation');
 assert(workflow.includes("  validate:\n    if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/feature-preview'"));
 assert(workflow.includes("  execute:\n    needs: validate\n    if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/feature-preview'\n    environment: feature"));
});
