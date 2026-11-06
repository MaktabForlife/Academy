import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {setupApproval,promoteSetupSource,validateSetupPlan} from '../tools/approved-feature-setup.mjs';
import {activeRuntime} from '../tools/approved-deployment.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),repo='MaktabForlife/Academy';
const head='a'.repeat(40),merge='b'.repeat(40),feature='c'.repeat(40),base='d'.repeat(40),tree='e'.repeat(40);
function fixture(){
 const calls=[],plan=JSON.parse(readFileSync(new URL('../deployment/jwt-feature-setup-plan.json',import.meta.url),'utf8'));
 const receipt={state:'STARTING_FOOTPRINT_REVIEWED_PRIVATE_ATTESTATION_PENDING',accountId:plan.accountId,databaseIds:plan.databaseIds,databaseNames:plan.databaseNames,reviewedSchemaPrimitive:plan.setupPrimitive,startingFootprints:{"core":{"observedObjects":1,"orderedDefinitionHash":"746047e55a185d77723c183c1652a18afafa0ea6a9ced7a623c652fe404c90bc","firstDefinitionHash":"ba6adc0dad88252e65296438061de7e8d62e238bcfd1aa882817f5e4a536f739","userRows":"NOT_QUERIED"},"admin":{"observed":"NOT_OPENED","expectedObjects":0,"expectedOrderedDefinitionHash":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"}},observed:{coreEditorSQLSubmissions:7,adminEditorOpened:false,failedBatchUsage:'UNMEASURED'}};
 const receiptRaw=JSON.stringify(receipt);plan.state='STARTING_FOOTPRINT_READY_FOR_REVIEW';plan.startingReceiptSHA256=hash(receiptRaw);
 const raw=JSON.stringify(plan),release={schema:1,request:'jwt-feature-fresh-setup-20261106a',kind:'component',target:'feature',contains_jwt:true,database_changes:false,feature_sha:feature,feature_base_sha:base};
 const pr={number:9,state:'closed',merged:true,changed_files:1,merged_at:'2026-11-06T01:00:00Z',merge_commit_sha:merge,base:{ref:'studio_dev',repo:{full_name:repo}},head:{sha:head},merged_by:{login:'MaktabForlife'},html_url:'https://github.com/'+repo+'/pull/9'};
 const comment={id:42,user:{login:'MaktabForlife'},created_at:'2026-11-06T00:59:00Z',body:'Optimisation approval\nhead: '+head+'\ntarget: feature\ndb-changes: none\nfeature-setup-source: '+feature+'\nfeature-setup-effects-sha256: '+hash(raw)+'\nsetup-database-effects: new-pair-only'};
 const status={id:10,context:'optimisation/approval',state:'success',creator:{login:'MaktabForlife'},created_at:'2026-11-06T00:59:30Z',description:'optimisation-record-sha256:'+hash(comment.body),target_url:pr.html_url+'#issuecomment-42'};
 const state={canonical:merge,feature:base,plan,raw,receiptRaw,release,pr,comment,status,behind:0};
 const encoded=s=>({size:Buffer.byteLength(s),encoding:'base64',content:Buffer.from(s).toString('base64')});
 const api=async(p,options={})=>{
  calls.push({p,method:options.method||'GET'});
  if(options.method){assert.equal(options.method,'PATCH');assert.equal(p,'/repos/'+repo+'/git/refs/heads/feature-preview');assert.deepEqual(options.body,{sha:feature,force:false});state.feature=feature;return {};}
  if(p.includes('/commits/'+merge+'/pulls'))return [pr];
  if(p.endsWith('/pulls/9'))return pr;
  if(p.includes('/pulls/9/files'))return [{filename:'deployment/release-plan.json'}];
  if(p.includes('/statuses?'))return [state.status];
  if(p.endsWith('/git/ref/heads/studio_dev'))return {object:{sha:state.canonical}};
  if(p.endsWith('/git/ref/heads/feature-preview'))return {object:{sha:state.feature}};
  if(p.endsWith('/git/commits/'+merge))return {sha:merge,tree:{sha:tree}};
  if(p.endsWith('/git/commits/'+head))return {sha:head,tree:{sha:tree}};
  if(p.includes('/contents/deployment/release-plan.json'))return encoded(JSON.stringify(state.release));
  if(p.includes('/contents/deployment/jwt-feature-setup-plan.json'))return encoded(state.raw);
  if(p.includes('/contents/config/jwt-feature-starting-receipt.json'))return encoded(state.receiptRaw);
  if(p.endsWith('/issues/comments/42'))return state.comment;
  if(p.includes('/compare/'))return {status:'ahead',behind_by:state.behind,files:[{filename:'backend/src/academy/jwt-feature-setup.mjs'}]};
  throw Error('unexpected fixture API');
 };
 return {state,calls,api,rebindComment(){status.description='optimisation-record-sha256:'+hash(comment.body);}};
}
test('source-only promotion requires merged exact approval plus explicit new-only effects and hash-bound schema receipt',async()=>{
 const f=fixture(),r=await promoteSetupSource({api:f.api,mergeSha:merge,prNumber:9,featureSha:feature});
 assert.equal(r.route,'none');assert.equal(r.cloudflareCalls,0);assert.equal(r.hostedDatabaseCalls,0);assert.equal(r.setupExecuted,false);
 assert.equal(f.calls.filter(x=>x.method==='PATCH').length,1);assert(f.calls.every(x=>x.p.startsWith('/repos/MaktabForlife/Academy/')));
});
for(const [name,change]of [
 ['ordinary approval only',f=>{f.state.comment.body=f.state.comment.body.split('\n').slice(0,4).join('\n');f.rebindComment();}],
 ['ambiguous effect line',f=>{f.state.comment.body+='\nsetup-database-effects: all';f.rebindComment();}],
 ['wrong new ID',f=>{const p=JSON.parse(f.state.raw);p.databaseIds[0]='1c8aece3-dc1d-40d1-8a82-01ab4f63336f';f.state.raw=JSON.stringify(p);}],
 ['missing schema validation',f=>{const p=JSON.parse(f.state.raw);p.state='CREATED_UNINITIALISED';f.state.raw=JSON.stringify(p);}],
 ['changed schema bytes',f=>{f.state.receiptRaw+=' ';}],
 ['production target',f=>{f.state.release.target='production';}],
 ['generic component request',f=>{f.state.release.request='unrelated-component';}],
 ['new canonical',f=>{f.state.canonical='f'.repeat(40);}],
 ['approval withdrawal',f=>{f.state.status.state='failure';}],
 ['Feature base changed',f=>{f.state.feature='f'.repeat(40);}],
 ['non fast forward',f=>{f.state.behind=1;}]
])test('no source write on '+name,async()=>{
 const f=fixture();change(f);await assert.rejects(promoteSetupSource({api:f.api,mergeSha:merge,prNumber:9,featureSha:feature}));assert.equal(f.calls.filter(x=>x.method==='PATCH').length,0);
});
test('already promoted source is idempotent; it cannot trigger setup/Cloudflare',async()=>{
 const f=fixture();f.state.feature=feature;await promoteSetupSource({api:f.api,mergeSha:merge,prNumber:9,featureSha:feature});assert.equal(f.calls.filter(x=>x.method==='PATCH').length,0);
});
test('private execution proof requires exact promoted head and can be withdrawn before every write',async()=>{
 const f=fixture();f.state.feature=feature;
 const p=await setupApproval({api:f.api,mergeSha:merge,prNumber:9,featureSha:feature});await p.fresh();
 f.state.status.state='failure';await assert.rejects(p.fresh());
});
test('control classification is narrow; application V110 stays protected',()=>{
 assert.equal(activeRuntime('tools/approved-feature-setup.mjs','109.25'),false);
 assert.equal(activeRuntime('backend/src/auth/v110/academy-master-issuer.mjs','109.25'),true);
 assert.equal(activeRuntime('backend/src/academy/jwt-feature-setup.mjs','109.25'),true);
});
