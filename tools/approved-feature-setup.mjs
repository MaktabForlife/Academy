// One-time source preparation + separately explicit fresh-only setup approval.
// Never creates databases, executes DDL, seeds, installs secrets or calls Cloudflare.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {resolveApproval,freshApproval,githubClient,assertFeatureComparison} from './approved-deployment.mjs';
const repo='MaktabForlife/Academy',hash=x=>createHash('sha256').update(x).digest('hex');
export function validateSetupPlan(p){
 assert.deepEqual(Object.keys(p).sort(),["accountId","activationIncluded","appSource","databaseIds","databaseNames","finalMode","nativeSecretsChanged","newFeatureSecrets","ordinaryReleaseDatabaseChanges","purpose","schema","schemaReceiptSHA256","scripts","setupDatabaseEffects","setupPrimitive","state","temporarySecrets"]);
 assert.equal(p.schema,1);assert.equal(p.purpose,'FRESH_FEATURE_SETUP_20261106a');assert.equal(p.state,'SCHEMA_LOADED_READY_FOR_REVIEW');
 assert.equal(p.accountId,'c9a3e355b3d7a795880b1d36a1dbe123');
 assert.deepEqual(p.scripts,['feature_worker','academy-feature-split-coordinator']);
 assert.deepEqual(p.databaseIds,['cdbe97bc-f3d9-400e-8806-ed9a0d143d26','ed77f2a7-4439-4841-8691-2b41063d8960']);
 assert.deepEqual(p.databaseNames,['jwt-feature-core-20261106a','jwt-feature-admin-20261106a']);
 assert.match(p.schemaReceiptSHA256,/^[a-f0-9]{64}$/);
 assert.equal(p.appSource,'e8e26af7e5c6275656faa5c24985098e377439d0');
 assert.equal(p.setupPrimitive,'254661e642e19aea618cdae1ddada831cbd7d1e3');
 assert.equal(p.ordinaryReleaseDatabaseChanges,false);
 assert.deepEqual(p.setupDatabaseEffects,{scope:'NEW_PAIR_ONLY',coreSeedStatements:35,adminSeedStatements:8,syntheticAccounts:4,syntheticCourses:2,productionData:false,existingStoreChanges:false,retrySeed:false});
 assert.deepEqual(p.temporarySecrets,['JWT_FEATURE_SETUP_PIN','JWT_FEATURE_SETUP_AUTH']);
 assert.deepEqual(p.newFeatureSecrets,['JWT_V110_PRIVATE_KEY_JSON','JWT_V110_CSRF_SECRET']);
 assert.deepEqual(p.nativeSecretsChanged,[]);assert.equal(p.finalMode,'PAUSED');assert.equal(p.activationIncluded,false);
 return p;
}
export async function setupApproval({api,mergeSha,prNumber,featureSha,requirePromoted=true}){
 const proof=await resolveApproval({repo,mergeSha,api});
 assert.equal(proof.plan.request,'jwt-feature-fresh-setup-20261106a');assert.equal(proof.pr,Number(prNumber));assert.equal(proof.plan.kind,'component');assert.equal(proof.plan.target,'feature');assert.equal(proof.plan.contains_jwt,true);
 assert.equal(proof.plan.feature_sha,featureSha);assert(proof.plan.feature_base_sha);
 const file=await api('/repos/'+repo+'/contents/deployment/jwt-feature-setup-plan.json?ref='+featureSha);
 assert(file.encoding==='base64'&&file.size<32768);
 const raw=Buffer.from(file.content,'base64').toString('utf8'),plan=validateSetupPlan(JSON.parse(raw)),planHash=hash(raw);
 const receipt=await api('/repos/'+repo+'/contents/config/jwt-feature-schema-receipt.json?ref='+featureSha);
 assert(receipt.encoding==='base64'&&receipt.size<16384);
 const receiptBytes=Buffer.from(receipt.content,'base64');assert.equal(hash(receiptBytes),plan.schemaReceiptSHA256,'SCHEMA_RECEIPT_NOT_BOUND');
 const schemaReceipt=JSON.parse(receiptBytes.toString('utf8'));
 assert.equal(schemaReceipt.state,'LOADED_COUNTS_CHECKED_FULL_PRIVATE_ATTESTATION_PENDING');assert.equal(schemaReceipt.accountId,plan.accountId);assert.deepEqual(schemaReceipt.databaseIds,plan.databaseIds);assert.deepEqual(schemaReceipt.databaseNames,plan.databaseNames);
 assert.deepEqual(schemaReceipt.checks,{coreRows:0,adminRows:0,coreObjects:1372,adminObjects:83,coreTables:172,adminTables:55,coreForeignKeys:0,adminForeignKeys:0,coreQuick:'ok',adminQuick:'ok',fullSchemaAttestation:'PENDING_PRIVATE_SETUP'});
 const comment=await api('/repos/'+repo+'/issues/comments/'+proof.commentId),lines=comment.body.split(/\r?\n/).map(x=>x.trim());
 for(const line of ['feature-setup-source: '+featureSha,'feature-setup-effects-sha256: '+planHash,'setup-database-effects: new-pair-only'])assert.equal(lines.filter(x=>x===line).length,1,'EXPLICIT_SETUP_APPROVAL_REQUIRED');
 for(const prefix of ['feature-setup-source:','feature-setup-effects-sha256:','setup-database-effects:'])assert.equal(lines.filter(x=>x.startsWith(prefix)).length,1,'AMBIGUOUS_SETUP_APPROVAL');
 if(requirePromoted)assert.equal((await api('/repos/'+repo+'/git/ref/heads/feature-preview')).object.sha,featureSha,'FEATURE_SOURCE_CHANGED');
 return {proof,plan,planHash,async fresh(){
  await freshApproval(proof,api);
  if(requirePromoted)assert.equal((await api('/repos/'+repo+'/git/ref/heads/feature-preview')).object.sha,featureSha,'FEATURE_SOURCE_CHANGED');
 }};
}
export async function promoteSetupSource({api,mergeSha,prNumber,featureSha}){
 const approval=await setupApproval({api,mergeSha,prNumber,featureSha,requirePromoted:false}),p=approval.proof.plan;
 const current=(await api('/repos/'+repo+'/git/ref/heads/feature-preview')).object.sha;
 assert([p.feature_base_sha,p.feature_sha].includes(current),'FEATURE_BASE_CHANGED');
 const compare=await api('/repos/'+repo+'/compare/'+p.feature_base_sha+'...'+p.feature_sha);assertFeatureComparison(compare,p);
 await approval.fresh();
 assert.equal((await api('/repos/'+repo+'/git/ref/heads/feature-preview')).object.sha,current,'FEATURE_BASE_CHANGED');
 if(current!==p.feature_sha)await api('/repos/'+repo+'/git/refs/heads/feature-preview',{method:'PATCH',body:{sha:p.feature_sha,force:false}});
 return {schema:1,sourcePrepared:true,featureSha:p.feature_sha,route:'none',cloudflareCalls:0,hostedDatabaseCalls:0,setupExecuted:false,activation:false};
}
async function main(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,repo);assert.equal(process.env.GITHUB_REF,'refs/heads/studio_dev');
 const selected=JSON.parse(readFileSync('deployment/release-plan.json','utf8'));
 if(!(selected.request==='jwt-feature-fresh-setup-20261106a'&&selected.kind==='component'&&selected.target==='feature'&&selected.feature_sha)){console.log(JSON.stringify({setupSourcePreparation:'NOT_SELECTED',cloudflareCalls:0,hostedDatabaseCalls:0}));return;}
 const api=githubClient(process.env.GITHUB_TOKEN),mergeSha=process.env.GITHUB_SHA,proof=await resolveApproval({repo,mergeSha,api});
 const out=await promoteSetupSource({api,mergeSha,prNumber:proof.pr,featureSha:proof.plan.feature_sha});console.log(JSON.stringify(out));
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname)await main();
