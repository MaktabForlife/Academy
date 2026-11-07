import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePausedReplacement,activationConfigurations,activationProfiles,activationPolicy,activationFlags} from '../tools/jwt-feature-activation-baseline.mjs';
import {pausedFixture} from './fixtures/jwt-feature-activation-fixture.mjs';
import {digest} from '../tools/jwt-feature-upload-artifact.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');globalThis.fetch=()=>{throw Error('NO_HOSTED_CALLS');};
const source='c'.repeat(40),coordDigest='8bdc622649bd20ceb3bc531b1161c7f42495105211a51f9e3dc2b8415f216465';
test('truthful PAUSED baseline keeps scoped MAIN ownership, reference-only coordinator and all false attestations',()=>{
 const f=pausedFixture(),b=parsePausedReplacement(f.bytes,f.binding);
 assert.equal(b.kind,'PAUSED_REPLACEMENT_RECEIPT');assert.deepEqual(Object.keys(b.baselineOwnedVersions),['feature_worker']);assert.equal(b.coordinatorReferenceOnly,true);
 assert(Object.values(b.inheritedAttestations).every(x=>x===false));assert.equal(b.schemaSeedProvenance,'HISTORICAL_INSTALL_STOPPED_SOURCE_CONTROL_FLOW_ONLY_NOT_NEW_DB_READBACK');
 const p=activationProfiles({...f,source,coordinatorSourceDigest:coordDigest});assert.equal(p.coordinatorChanged,false);
 assert.equal(p.before.worker.vars.JWT_V110_RELEASE_ID,b.before.worker.vars.JWT_V110_RELEASE_ID);assert.notEqual(p.before.worker.vars.JWT_V110_RELEASE_ID,f.binding.source);
});
for(const [name,change]of [
 ['fake legacy VERIFIED',r=>r.state='VERIFIED'],['legacy install true',r=>r.legacyInstallationVerified=true],['cleanup true',r=>r.cleanupVerified=true],['key true',r=>r.privateKeyVerified=true],
 ['missing ACK',r=>delete r.ack],['wrong ACK source',r=>r.ack.source='f'.repeat(40)],['unowned observation',r=>r.ownedMainVersion='00000000-0000-4000-8000-000000000999'],
 ['foreign same-profile MAIN',r=>r.observedVersions.feature_worker='00000000-0000-4000-8000-000000000999'],['coordinator fabricated owned',r=>r.observedVersions['academy-feature-split-coordinator']='00000000-0000-4000-8000-000000000999'],['budget refund',r=>r.remainingAllowanceReusable=true]
])test('rejects '+name+' even with matching file digest',()=>{const f=pausedFixture(change);assert.throws(()=>parsePausedReplacement(f.bytes,f.binding));});
test('unavailable/changed authoritative bytes and changed coordinator graph stop before a caller exists',()=>{
 const f=pausedFixture();assert.throws(()=>parsePausedReplacement(Buffer.from('{}'),f.binding));
 assert.throws(()=>activationProfiles({...f,source,coordinatorSourceDigest:'e'.repeat(64)}));
});
test('full ACTIVE and recovery PAUSED profiles change only intended mode/flags/release; all storage/classes preserved',()=>{
 const c=activationConfigurations(source);
 for(const [p,mode,flag]of [[c.active,'ACTIVE','1'],[c.paused,'PAUSED','0']]){
  const expected=structuredClone(c.before);Object.assign(expected.worker.vars,{ACADEMY_D1_MODE:mode,JWT_V110_RELEASE_ID:source});for(const k of activationFlags)expected.worker.vars[k]=flag;
  assert.deepEqual(p,expected);assert.equal(p.worker.migrations,undefined);assert.equal(p.coordinator.migrations,undefined);
 }
 const f=pausedFixture(),p=activationProfiles({...f,source,coordinatorSourceDigest:coordDigest}),artifacts={feature_worker:{artifactSHA256:digest('ACTIVE')},pausedWorker:{artifactSHA256:digest('PAUSED')}};
 const policy=activationPolicy(p,artifacts);assert.deepEqual(Object.keys(policy.firstWrites),['feature_worker']);assert.equal(policy.recovery.target,'feature_worker');
 assert.deepEqual(policy.budgets,{metadataGETs:24,uploads:2,publicGETs:3,smokeRequests:8,pausedGETs:1});
});
