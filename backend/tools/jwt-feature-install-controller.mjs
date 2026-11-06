// Dependency-injected one-time controller. Each adapter write is exactly one attempt.
import assert from 'node:assert/strict';
import {temporarySecrets} from './jwt-feature-install-package.mjs';
const worker='feature_worker',coordinator='academy-feature-split-coordinator';
export async function installFreshFeature({ops,packageInfo,privateCapsule}){
 const evidence={schema:1,source:packageInfo.publicManifest.source,owner:packageInfo.publicManifest.owner,state:'NOT_STARTED',writes:[],setupRequests:0,probeRequests:0,seedReplay:false,activated:false,cleanupVerified:false};
 let touched=false,uncertainWrite=false;
 const safeSave=()=>ops.save(structuredClone(evidence)); // allowlisted evidence only
 async function write(label,action){
  await ops.candidateGuard();await ops.ownedGuard({initial:!touched});
  touched=true;uncertainWrite=true;
  await action();await ops.adoptExpected(label);uncertainWrite=false;evidence.writes.push(label);await safeSave();
 }
 try{
  await ops.preflight();
  evidence.state='PREFLIGHT_VERIFIED';await safeSave();
  await write('QUARANTINE_WORKER',()=>ops.deploy(worker,'QUARANTINE'));
  await write('SETUP_COORDINATOR',()=>ops.deploy(coordinator,'SETUP'));
  await write('SETUP_WORKER',()=>ops.deploy(worker,'SETUP'));
  evidence.state='SETUP_PAUSED';
  await ops.probe('ordinary-paused');evidence.probeRequests++;
  // Native secret names/values are never included or rotated.
  await write('PRIVATE_NEW_SECRETS',()=>privateCapsule.ingress(ops.patchSecrets));
  const setup=await ops.setup(privateCapsule);
  evidence.setupRequests=setup.executeRequests+setup.statusRequests;
  assert.equal(setup.receipt.state,'VERIFIED','SETUP_NOT_VERIFIED');
  evidence.state='SEED_VERIFIED';
  await ops.prepareFinal(setup.receipt,privateCapsule.publicKey);
  await write('FINAL_COORDINATOR',()=>ops.deploy(coordinator,'FINAL_PAUSED'));
  await write('FINAL_WORKER_PAUSED',()=>ops.deploy(worker,'FINAL_PAUSED'));
  await write('REMOVE_TEMPORARY_SECRETS',()=>ops.patchSecrets(Object.fromEntries(temporarySecrets.map(n=>[n,null]))));
  await ops.probe('final-paused');evidence.probeRequests++;
  await ops.probe('setup-http-removed');evidence.probeRequests++;
  await ops.verifyFinal();
  evidence.state='PAUSED_VERIFIED';evidence.cleanupVerified=true;await safeSave();
  return evidence;
 }catch{
  evidence.state='INSTALL_STOPPED';evidence.writeOutcomeUncertain=uncertainWrite;await safeSave();
  if(touched){
   try{
    // This is separately owned safe recovery, not renewed activation permission.
    await ops.ownedGuard({recovery:true,uncertainWrite});
    await ops.pauseRecovery();await ops.verifyRecovery();
    evidence.recovery='OWNED_PAUSED_VERIFIED';
   }catch{evidence.recovery='NOT_VERIFIED_NO_OVERWRITE';}
  }
  await safeSave();throw Object.assign(Error('JWT_FEATURE_INSTALL_STOPPED'),{evidence});
 }finally{privateCapsule.destroy();}
}
