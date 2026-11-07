import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {firstReplacementInputs,profilesForFirstReplacement} from '../tools/jwt-feature-first-replacement-inputs.mjs';
import {expectedPausedMetadataProfiles} from '../tools/jwt-feature-finalise.mjs';
import {prepareFirstReplacement} from '../tools/jwt-feature-first-replacement-build.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');
globalThis.fetch=()=>{throw Error('HOSTED_FETCH_FORBIDDEN_SOURCE_PREPARATION');};
test('full explicit configurations agree with the reviewed public metadata basis without using it as a constructor',()=>{
 const {configs}=firstReplacementInputs(),expected=expectedPausedMetadataProfiles();
 for(const name of ['worker','coordinator']){
  const projection=Object.fromEntries(Object.keys(expected[name]).map(k=>[k,structuredClone(configs[name][k])]));
  if(projection.assets)delete projection.assets.directory;
  assert.deepEqual(projection,expected[name]);
  assert(configs[name].main&&Object.hasOwn(configs[name],'workers_dev'));
  assert.equal(configs[name].migrations,undefined);
 }
});
test('public observed UUIDs remain interrupted unowned references with no installation/key/code attestation',()=>{
 const {reference}=firstReplacementInputs();
 assert.equal(reference.state,'INTERRUPTED_PAUSED_REFERENCE');
 for(const v of Object.values(reference.claims))assert.equal(v,false);
 const p=profilesForFirstReplacement({source:process.env.GITHUB_SHA,coordinatorSourceDigest:'e'.repeat(64)});
 assert.equal(p.mode,'PAUSED_RESUME');assert.equal(p.coordinatorChanged,false);assert.equal(p.active,undefined);
 assert.equal(p.before.worker.vars.ACADEMY_D1_MODE,'PAUSED');
});
test('the minimal candidate preserves native stores/classes and disables all four auth flags without migrations or secret values',()=>{
 const {configs}=firstReplacementInputs();
 const base=JSON.parse(readFileSync(new URL('../wrangler.feature.jsonc',import.meta.url),'utf8'));
 assert.deepEqual(configs.worker.d1_databases.slice(0,2),base.d1_databases);
 assert.deepEqual(configs.worker.r2_buckets,base.r2_buckets);
 assert.deepEqual(configs.worker.durable_objects.bindings.slice(0,2),base.durable_objects.bindings);
 assert.deepEqual(configs.worker.secrets.required.slice(0,4),base.secrets.required);
 for(const k of ['JWT_V110_MASTER','JWT_V110_REFRESH','JWT_V110_BROWSER','JWT_V110_NATIVE_COOKIE'])assert.equal(configs.worker.vars[k],'0');
 assert(!Object.keys(configs.worker.vars).some(k=>k.startsWith('JWT_FEATURE_SETUP_')));
 assert.equal(configs.worker.assets.run_worker_first.length,9);
 assert.equal(configs.worker.workers_dev,true);assert.equal(configs.coordinator.workers_dev,false);
});
test('full offline Worker/public artifact fingerprints are independent of later control-commit identities',async()=>{
 const root=process.cwd(),before=readFileSync(resolve(root,'config/hosting.json'));
 const a=await prepareFirstReplacement({root,source:'a'.repeat(40),destination:mkdtempSync(resolve(process.env.RUNNER_TEMP,'jwt-input-a-'))});
 const b=await prepareFirstReplacement({root,source:'b'.repeat(40),destination:mkdtempSync(resolve(process.env.RUNNER_TEMP,'jwt-input-b-'))});
 assert.notEqual(a.recipeSource,b.recipeSource);
 for(const k of ['completeConfigsSHA256','worker','coordinatorSourceDigest','publicAssets'])assert.deepEqual(a[k],b[k]);
 assert(a.publicAssets.count>0&&a.publicAssets.totalBytes>0);
 assert.equal(a.referenceOwned,false);assert.equal(a.hostedCalls,0);assert.equal(a.credentialReads,0);
 assert.deepEqual(readFileSync(resolve(root,'config/hosting.json')),before);
});
