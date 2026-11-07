import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {releaseFreshFeature} from '../tools/jwt-feature-release-controller.mjs';
import {activationMock} from './fixtures/jwt-feature-activation-fixture.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');globalThis.fetch=()=>{throw Error('NO_HOSTED_CALLS');};
const report=f=>JSON.parse(readFileSync(resolve(f.evidenceDirectory,'deployment.json'),'utf8'));
test('actual new-baseline transport success: MAIN only22metadata/1CLI/3public/8auth, truthful false legacy and no legacy DTO',async()=>{
 const f=activationMock(),result=await releaseFreshFeature({ops:f.ops}),r=report(f);
 assert.equal(result.state,'FEATURE_VERIFIED');assert.deepEqual([f.state.provider,f.state.cli,f.state.public,f.state.auth,f.state.paused],[22,1,3,8,0]);
 assert.equal(r.installationVerified,false);assert.equal(r.baselineKind,'PAUSED_REPLACEMENT_RECEIPT');assert.equal(r.coordinatorReferenceOnly,true);assert(Object.values(r.inheritedAttestations).every(x=>x===false));
 assert(!existsSync(resolve(f.evidenceDirectory,'next-installed-baseline.json')));assert.deepEqual(Object.keys(r.ownedVersions),['feature_worker']);
 assert(f.state.loggedOut);for(const v of ['2468','SYNTHETIC_ACCESS','SYNTHETIC_REFRESH','uaa-session:SYNTHETIC','SECRET_MUST_NOT_ESCAPE'])assert(!JSON.stringify(r).includes(v));
});
for(const fault of ['public-1','public-2','public-3',...Array.from({length:8},(_,i)=>'auth-'+(i+1))])test('ordinary '+fault+' failure permits one supported owned PAUSED recovery, no extra auth/cleanup',async()=>{
 const f=activationMock({fault});await assert.rejects(releaseFreshFeature({ops:f.ops}));const r=report(f);
 assert.equal(r.recovery,'OWNED_FEATURE_PAUSED');assert.equal(r.mode,'PAUSED');assert.equal(f.state.cli,2);assert.equal(f.state.paused,1);assert(f.state.provider<=32);assert(f.state.auth<=8);
 if(fault.startsWith('auth-'))assert.equal(f.state.auth,Number(fault.slice(5)));
 if(fault==='auth-4'){assert(f.state.sessionCreated);assert.equal(f.state.loggedOut,false);}
 assert.equal(r.installationVerified,false);assert(!existsSync(resolve(f.evidenceDirectory,'next-installed-baseline.json')));
});
test('latest ordinary final failure exactly consumes32metadata/2CLI/3public/8auth/1paused, no reusable old ceiling',async()=>{
 const f=activationMock({fault:'late-final'});await assert.rejects(releaseFreshFeature({ops:f.ops}));const r=report(f);
 assert.deepEqual([f.state.provider,f.state.cli,f.state.public,f.state.auth,f.state.paused],[32,2,3,8,1]);assert.equal(r.recovery,'OWNED_FEATURE_PAUSED');assert.equal(r.activated,false);
});
for(const fault of ['withdraw-before-cli','foreign-before-cli'])test(fault+' cannot use historical MAIN ownership to authorise a write/recovery',async()=>{
 const f=activationMock({fault});await assert.rejects(releaseFreshFeature({ops:f.ops}));assert.equal(f.state.cli,0);assert.equal(f.state.public,0);assert.equal(f.state.auth,0);assert.equal(f.state.paused,0);
 assert.deepEqual(report(f).ownedVersions,{});
});
test('lost ACTIVE ACK never adopts, probes or recovers, despite earlier PAUSED ownership',async()=>{
 const f=activationMock({fault:'active-ack-loss'});await assert.rejects(releaseFreshFeature({ops:f.ops}));assert.deepEqual([f.state.provider,f.state.cli,f.state.public,f.state.auth,f.state.paused],[12,1,0,0,0]);const r=report(f);assert.deepEqual(r.ownedVersions,{});assert.equal(r.writeOutcomeUnknown,true);
});
for(const fault of ['withdraw-after-adopt','foreign-after-adopt'])test(fault+' cannot trigger blind PAUSED overwrite',async()=>{
 const f=activationMock({fault});await assert.rejects(releaseFreshFeature({ops:f.ops}));assert.equal(f.state.cli,1);assert.equal(f.state.paused,0);assert.equal(f.state.auth,0);assert.equal(report(f).recovery,'NOT_VERIFIED_NO_BLIND_OVERWRITE');
});
test('lost recovery ACK stops after the second process without third write or paused probe',async()=>{
 const f=activationMock({fault:'recovery-ack-loss'});await assert.rejects(releaseFreshFeature({ops:f.ops}));assert.equal(f.state.cli,2);assert.equal(f.state.paused,0);assert.equal(report(f).recovery,'NOT_VERIFIED_NO_BLIND_OVERWRITE');
});
test('final persistence failure never calls recovery or retries the failed writer',async()=>{
 const f=activationMock({fault:'final-persistence'});await assert.rejects(releaseFreshFeature({ops:f.ops}));assert.equal(f.state.saves,3);assert.deepEqual([f.state.provider,f.state.cli,f.state.paused],[22,1,0]);
});
