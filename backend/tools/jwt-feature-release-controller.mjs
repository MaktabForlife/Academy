// Routine JWT Feature release only: no DDL, seed, secret or namespace changes.
import assert from 'node:assert/strict';
import {assertFreshReceipt,renderCandidateConfigs,account,origin} from './jwt-feature-transition.mjs';
export function releaseProfiles({baseWorker,baseCoordinator,nativeReceipt,installation,installed,source,coordinatorSourceDigest}){
 assertFreshReceipt(installation,nativeReceipt);
 assert.equal(installation.installedMode,'PAUSED');assert.equal(installation.temporarySecretsRemoved,true);assert.equal(installation.temporarySurfaceRemoved,true);
 assert.match(installation.installOwner,/^[1-9][0-9]{0,19}-[1-9][0-9]{0,4}$/);
 assert.deepEqual(Object.keys(installed).sort(),['coordinatorSourceDigest','coordinatorVersion','mode','releaseId','schema','workerVersion']);
 for(const digest of [installation.coordinatorSourceDigest,installed.coordinatorSourceDigest,coordinatorSourceDigest])assert.match(digest,/^[a-f0-9]{64}$/);
 assert.equal(installed.schema,1);assert(['PAUSED','ACTIVE'].includes(installed.mode));
 for(const k of ['workerVersion','coordinatorVersion'])assert.match(installed[k],/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
 for(const v of [source,installed.releaseId])assert.match(v,/^[a-f0-9]{40}$/);
 if(installed.mode==='PAUSED'){
  assert.equal(installed.coordinatorSourceDigest,installation.coordinatorSourceDigest);
  assert.equal(installed.releaseId,installation.reviewedSetupCommit);
  assert.equal(installed.workerVersion,installation.installedVersions.feature_worker);
  assert.equal(installed.coordinatorVersion,installation.installedVersions['academy-feature-split-coordinator']);
 }
 const render=(releaseId,mode)=>{
  const p=renderCandidateConfigs(baseWorker,baseCoordinator,nativeReceipt,installation,{releaseId,mode});
  for(const c of [p.worker,p.coordinator]){
   c.vars={...c.vars,JWT_FEATURE_INSTALL_SOURCE:installation.reviewedSetupCommit,JWT_FEATURE_INSTALL_OWNER:installation.installOwner};
   assert(!Object.keys(c.vars).some(k=>k.startsWith('JWT_FEATURE_SETUP_')));
   // Installed classes are immutable prerequisites, never routine migrations.
   delete c.migrations;
  }
  assert.equal(p.worker.account_id,account);assert.equal(p.coordinator.account_id,account);
  return p;
 };
 return {before:render(installed.releaseId,installed.mode),active:render(source,'ACTIVE'),paused:render(source,'PAUSED'),origin,coordinatorSourceDigest,coordinatorChanged:coordinatorSourceDigest!==installed.coordinatorSourceDigest};
}
export async function releaseFreshFeature({ops}){
 const evidence={schema:1,state:'NOT_STARTED',activated:false,recovery:null};let touched=false;
 const save=()=>ops.save({...evidence});
 try{
  await ops.preflight();evidence.state='PREFLIGHT_VERIFIED';save();
  for(const name of ops.targets){
   await ops.fresh();await ops.owned();
   touched=true;evidence.state=name==='feature_worker'?'ACTIVATING':'COORDINATOR_UPDATE';save();
   await ops.deploy(name);await ops.adopt(name);
  }
  await ops.publicProof();
  evidence.smoke=await ops.smoke();
  await ops.verifyFinal();await ops.fresh();
  evidence.state='FEATURE_VERIFIED';evidence.activated=true;save();return evidence;
 }catch{
  evidence.activated=false;evidence.state='STOPPED';
  if(touched){
   try{await ops.owned();await ops.pause();await ops.verifyPaused();evidence.recovery='OWNED_FEATURE_PAUSED';}
   catch{evidence.recovery='NOT_VERIFIED_NO_BLIND_OVERWRITE';}
  }
  save();throw Error('JWT_FEATURE_RELEASE_STOPPED_'+(evidence.recovery||'BEFORE_WRITE'));
 }
}
