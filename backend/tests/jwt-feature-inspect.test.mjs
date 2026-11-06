import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {inspectMetadata,publicSettings,promoteInspection,inspectionApproval,originalSource,originalOwner,request} from '../tools/jwt-feature-inspect.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),repo='MaktabForlife/Academy';
const head='a'.repeat(40),merge='b'.repeat(40),feature='c'.repeat(40),tree='e'.repeat(40);
const paths=['.github/workflows/feature-jwt-inspect.yml','backend/tests/jwt-feature-inspect.test.mjs','backend/tools/jwt-feature-inspect.mjs'];
function approval(){
 const calls=[],plan={schema:1,request,kind:'component',target:'feature',contains_jwt:true,database_changes:false,version:'110.36',feature_sha:feature,feature_base_sha:originalSource};
 const pr={number:11,state:'closed',merged:true,changed_files:1,merged_at:'2026-11-06T16:00:00Z',merge_commit_sha:merge,base:{ref:'studio_dev',repo:{full_name:repo}},head:{sha:head},merged_by:{login:'MaktabForlife'},html_url:'https://github.com/'+repo+'/pull/11'};
 const comment={id:42,user:{login:'MaktabForlife'},created_at:'2026-11-06T15:59:00Z',body:'Optimisation approval\nhead: '+head+'\ntarget: feature\ndb-changes: none\nfeature-inspection-source: '+feature+'\ninspection-cloudflare-gets: 4\ninspection-hosted-writes: none'};
 const status={id:10,context:'optimisation/approval',state:'success',creator:{login:'MaktabForlife'},created_at:'2026-11-06T15:59:30Z',description:'optimisation-record-sha256:'+hash(comment.body),target_url:pr.html_url+'#issuecomment-42'};
 const state={canonical:merge,feature:originalSource,plan,pr,comment,status,files:paths.slice(),behind:0};
 const api=async(p,o={})=>{
  calls.push({p,method:o.method||'GET'});
  if(o.method){assert.equal(o.method,'PATCH');assert.equal(p,'/repos/'+repo+'/git/refs/heads/feature-preview');assert.deepEqual(o.body,{sha:feature,force:false});state.feature=feature;return {};}
  if(p.includes('/commits/'+merge+'/pulls'))return [pr];
  if(p.endsWith('/pulls/11'))return pr;
  if(p.includes('/pulls/11/files'))return [{filename:'deployment/release-plan.json'}];
  if(p.includes('/statuses?'))return [status];
  if(p.endsWith('/git/ref/heads/studio_dev'))return {object:{sha:state.canonical}};
  if(p.endsWith('/git/ref/heads/feature-preview'))return {object:{sha:state.feature}};
  if(p.endsWith('/git/commits/'+merge))return {sha:merge,tree:{sha:tree}};
  if(p.endsWith('/git/commits/'+head))return {sha:head,tree:{sha:tree}};
  if(p.includes('/contents/deployment/release-plan.json')){const raw=JSON.stringify(plan);return {size:raw.length,encoding:'base64',content:Buffer.from(raw).toString('base64')};}
  if(p.endsWith('/issues/comments/42'))return comment;
  if(p.includes('/compare/'))return {status:'ahead',behind_by:state.behind,files:state.files.map(filename=>({filename}))};
  throw Error('unexpected GitHub path');
 };
 return {state,calls,api,rebind(){status.description='optimisation-record-sha256:'+hash(comment.body);}};
}
test('exact approved three-file promotion is source-only, fast-forward and idempotent',async()=>{
 const f=approval(),r=await promoteInspection({api:f.api,mergeSha:merge});assert.equal(r.cloudflareCalls,0);assert.equal(r.hostedWrites,0);
 await promoteInspection({api:f.api,mergeSha:merge});assert.equal(f.calls.filter(x=>x.method==='PATCH').length,1);
});
for(const [name,change]of [
 ['scope missing',f=>{f.state.comment.body=f.state.comment.body.replace('inspection-cloudflare-gets: 4','');f.rebind();}],
 ['scope ambiguous',f=>{f.state.comment.body+='\ninspection-hosted-writes: any';f.rebind();}],
 ['source altered',f=>{f.state.plan.feature_base_sha='f'.repeat(40);}],
 ['new canonical',f=>{f.state.canonical='f'.repeat(40);}],
 ['withdrawn approval',f=>{f.state.status.state='failure';}],
 ['foreign Feature head',f=>{f.state.feature='f'.repeat(40);}],
 ['application change',f=>{f.state.files.push('backend/src/academy/account.js');}],
 ['not fast forward',f=>{f.state.behind=1;}]
])test('no source write after '+name,async()=>{
 const f=approval();change(f);await assert.rejects(promoteInspection({api:f.api,mergeSha:merge}));assert(!f.calls.some(x=>x.method==='PATCH'));
});
test('fresh approval detects withdrawal before a metadata request',async()=>{
 const f=approval();f.state.feature=feature;const a=await inspectionApproval({api:f.api,mergeSha:merge,prNumber:11,featureSha:feature});
 f.state.status.state='failure';let calls=0;await assert.rejects(inspectMetadata({token:'MOCK',fresh:a.fresh,fetcher:async()=>{calls++;}}));assert.equal(calls,0);
});
const rawSettings=()=>({compatibility_date:'2026-10-23',compatibility_flags:['nodejs_compat'],bindings:[
 {name:'JWT_FEATURE_INSTALL_SOURCE',type:'plain_text',text:originalSource},{name:'JWT_FEATURE_INSTALL_OWNER',type:'plain_text',text:originalOwner},
 {name:'ACADEMY_D1_MODE',type:'plain_text',text:'PAUSED'},{name:'JWT_FEATURE_SETUP_PIN',type:'secret_text',text:'NEVER_REPORT'},
 {name:'UNKNOWN_PUBLIC',type:'plain_text',text:'NEVER_REPORT'},{name:'JWT_V110_PRIVATE_KEY_JSON',type:'secret_text',text:'NEVER_REPORT'},
 {name:'JWT_V110_CORE_DB',type:'d1',id:'cdbe97bc-f3d9-400e-8806-ed9a0d143d26'},
 {name:'JWT_V110_SPLIT_COORDINATOR',type:'durable_object_namespace',class_name:'JWTFeatureAcademySplitCoordinator',namespace_id:'de95f15f19a54a9e9ba34e6e75f51847'},
 {name:'ASSETS',type:'assets',jwt:'NEVER_REPORT'}
 ],assets:{jwt:'NEVER_REPORT',config:{run_worker_first:['/api/*'],not_found_handling:'none',unexpected:'NEVER_REPORT'}}});
test('metadata recorder issues only the four fixed GETs and emits no credentials/unknown values',async()=>{
 const calls=[];let fresh=0;
 const r=await inspectMetadata({token:'NEVER_REPORT',fresh:async()=>{fresh++;},fetcher:async(url,o)=>{
  calls.push({url,o});assert.equal(o.method,'GET');assert.equal(o.redirect,'error');assert.equal(o.cache,'no-store');assert.equal(o.body,undefined);
  const result=url.endsWith('/settings')?rawSettings():{deployments:[{versions:[{version_id:'4704b2cc-c111-4e5b-9f8b-887bd38db650',percentage:100}]}]};
  return {ok:true,json:async()=>({success:true,result})};
 }});
 assert.equal(fresh,4);assert.equal(calls.length,4);
 assert.deepEqual(calls.map(x=>x.url.split('/scripts/')[1]),['feature_worker/deployments','feature_worker/settings','academy-feature-split-coordinator/deployments','academy-feature-split-coordinator/settings']);
 assert(calls.every(x=>x.url.startsWith('https://api.cloudflare.com/client/v4/accounts/c9a3e355b3d7a795880b1d36a1dbe123/workers/')));
 assert.equal(r.cumulativeExplicitGetAttempts,40);assert.equal(r.hostedWrites,0);assert.equal(r.d1Calls,0);assert.equal(r.workerHTTP,0);
 assert(!JSON.stringify(r).includes('NEVER_REPORT'));assert.equal(r.observed.feature_worker.ownerMarkerMatches,true);assert.equal(r.observed.feature_worker.sourceMarkerMatches,true);
 assert.equal(r.cleanupVerified,false);assert.equal(r.activated,false);
});
for(const kind of ['transport','http','json','provider'])test('one failed metadata attempt stops without retry: '+kind,async()=>{
 let calls=0;await assert.rejects(inspectMetadata({token:'MOCK',fetcher:async()=>{
  calls++;if(kind==='transport')throw Error('NEVER_REPORT');
  return {ok:kind!=='http',status:403,json:async()=>{if(kind==='json')throw Error('NEVER_REPORT');return {success:false,errors:[{message:'NEVER_REPORT'}]};}};
 }}),e=>e.attempts===1&&!e.message.includes('NEVER_REPORT'));assert.equal(calls,1);
});
test('foreign owner/source and gradual deployment are recorded without adopting or writing',async()=>{
 const r=await inspectMetadata({token:'MOCK',fetcher:async url=>({ok:true,json:async()=>({success:true,result:url.endsWith('/settings')?{bindings:[{name:'JWT_FEATURE_INSTALL_OWNER',type:'plain_text',text:'99-1'}]}:{deployments:[{versions:[{version_id:'4704b2cc-c111-4e5b-9f8b-887bd38db650',percentage:50}]}]}})})});
 assert.equal(r.observed.feature_worker.currentVersion,null);assert.equal(r.observed.feature_worker.ownerMarkerMatches,false);assert.equal(r.observed.feature_worker.sourceMarkerMatches,false);assert.equal(r.hostedWrites,0);
});
test('unexpected plain values and asset JWTs/config values are excluded',()=>{
 const raw=rawSettings();raw.bindings.push({name:'ACADEMY_D1_MODE',type:'plain_text',text:'NEVER_REPORT'});
 assert(!JSON.stringify(publicSettings(raw)).includes('NEVER_REPORT'));
});
test('workflow isolates private credential from source preparation and forbids PIN/setup/Wrangler',()=>{
 const w=readFileSync(new URL('../../.github/workflows/feature-jwt-inspect.yml',import.meta.url),'utf8');
 assert.equal((w.match(/CF_FEATURE_DEPLOY_TOKEN/g)||[]).length,1);assert(!/FEATURE_TEST_ADMIN_PIN|npm ci|wrangler|jwt-feature-install\.mjs/.test(w));
 assert(w.includes('environment: feature'));assert(w.includes('needs: validate'));assert(w.includes('contents: write'));
});
