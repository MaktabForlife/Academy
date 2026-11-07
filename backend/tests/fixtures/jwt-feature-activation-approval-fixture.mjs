import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {plan,planSHA256,workflowPath,sourceScopeLines,windowLines} from '../../tools/jwt-feature-activation-approved.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
export function fixture({publicMode=false}={}){
 const now=Date.now(),source='a'.repeat(40),merge='b'.repeat(40),head='c'.repeat(40);
 const context={repository:'MaktabForlife/Academy',ref:'refs/heads/feature-preview',event:'workflow_dispatch',source,runId:'1001',attempt:'1',workflowRef:'MaktabForlife/Academy/'+workflowPath+'@refs/heads/feature-preview'};
 const comment={id:7,user:{login:'MaktabForlife'},created_at:new Date(now-10000).toISOString(),updated_at:new Date(now-10000).toISOString(),body:['Optimisation approval','head: '+head,'target: feature','db-changes: none',...sourceScopeLines(source)].join('\n')};
 const proof={schema:1,repo:context.repository,mergeSha:merge,pr:101,headSha:head,approvalStatusId:11,approvalURL:'https://github.com/MaktabForlife/Academy/pull/101#issuecomment-7',commentId:7,commentHash:hash(comment.body),plan:{schema:1,request:plan.request,kind:'component',target:'feature',contains_jwt:true,database_changes:false,version:plan.version,feature_base_sha:plan.featureBase,feature_sha:source}};
 const preparedRun={id:1000,path:workflowPath,event:'push',head_branch:'studio_dev',head_sha:merge,status:'completed',conclusion:'success',actor:{login:'MaktabForlife'},updated_at:new Date(now-2000).toISOString()};
 const preparedArtifacts={total_count:1,artifacts:[{id:100,name:'jwt-activation-public-1000',expired:false,digest:'sha256:'+'d'.repeat(64)}]};
 const windowComment={id:8,user:{login:'MaktabForlife'},created_at:new Date(now-1000).toISOString(),updated_at:new Date(now-1000).toISOString(),body:windowLines({source,merge,preparedRun:'1000',preparedDigest:'d'.repeat(64),expires:new Date(now+600000).toISOString()}).join('\n')};
 const windowStatus={id:12,context:'optimisation/jwt-feature-activation',state:'success',creator:{login:'MaktabForlife'},description:'optimisation-window-sha256:'+hash(windowComment.body),target_url:'https://github.com/MaktabForlife/Academy/pull/101#issuecomment-8',created_at:new Date(now-900).toISOString()};
 const ownRun={id:1001,path:workflowPath,event:'workflow_dispatch',head_branch:'feature-preview',head_sha:source,run_attempt:1,status:'in_progress',actor:{login:'MaktabForlife'},repository:{full_name:context.repository},head_repository:{full_name:context.repository}};
 const approvalStatus={id:11,context:'optimisation/approval',state:'success',creator:{login:'MaktabForlife'},description:'optimisation-record-sha256:'+proof.commentHash,target_url:proof.approvalURL,created_at:new Date(now-9000).toISOString()};
 const f={context,comment,proof,preparedRun,preparedArtifacts,windowComment,windowStatus,ownRun,approvalStatus,featureHead:publicMode?plan.featureBase:source,history:publicMode?[]:[ownRun],competing:false,calls:[],writes:[]};
 f.api=async(path,options={})=>{
  f.calls.push(path);
  if(options.method){assert.equal(options.method,'PATCH');assert.equal(path,'/repos/MaktabForlife/Academy/git/refs/heads/feature-preview');assert.deepEqual(options.body,{sha:source,force:false});f.writes.push(path);f.featureHead=source;return {};}
  if(path.includes('/commits/'+merge+'/pulls'))return [{state:'closed',merge_commit_sha:merge,base:{ref:'studio_dev'}}];
  if(path.endsWith('/pulls/101'))return {number:101,state:'closed',merged:true,merged_at:new Date(now-5000).toISOString(),merged_by:{login:'MaktabForlife'},merge_commit_sha:merge,base:{ref:'studio_dev',repo:{full_name:context.repository}},head:{sha:head},html_url:'https://github.com/MaktabForlife/Academy/pull/101',changed_files:2};
  if(path.includes('/pulls/101/files'))return [{filename:'deployment/release-plan.json'},{filename:workflowPath}];
  if(path.endsWith('/git/commits/'+merge))return {sha:merge,tree:{sha:'f'.repeat(40)}};
  if(path.endsWith('/git/commits/'+head))return {sha:head,tree:{sha:'f'.repeat(40)}};
  if(path.includes('/contents/deployment/release-plan.json?ref='+head)){const text=JSON.stringify(proof.plan);return {encoding:'base64',size:Buffer.byteLength(text),content:Buffer.from(text).toString('base64')};}
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
   const runs=f.competing?[{id:9999,status:'queued',created_at:'2000-01-01T00:00:00Z'}]:(!publicMode?[ownRun]:[]);return {total_count:f.incomplete?101:runs.length,workflow_runs:runs};
  }
  throw Error('UNEXPECTED_GITHUB_ONLY_TEST_PATH');
 };
 f.windowArgs=()=>({proof,comment:f.windowComment,statuses:[f.windowStatus],preparedRun:f.preparedRun,preparedArtifacts:f.preparedArtifacts,context,registrationComment:8,registrationStatus:12,preparedRunId:1000,now});
 f.approvalArgs=()=>({api:f.api,mergeSha:merge,prNumber:101,context,localGuard:async()=>{},registrationComment:8,registrationStatus:12,preparedRunId:1000,resolveProof:async()=>proof});
 return f;
}
