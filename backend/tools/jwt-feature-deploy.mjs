// Explicit fresh JWT Feature profile. No native deploy fallback or setup replay.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,readdirSync,lstatSync,cpSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadFeatureApproval,freshApproval,githubClient} from '../../tools/approved-deployment.mjs';
import {coordinatorSourceDigest} from './jwt-feature-code-digest.mjs';
import {releaseProfiles,releaseFreshFeature,resumeInterruptedFeature} from './jwt-feature-release-controller.mjs';
import {createFeatureReleaseOps} from './jwt-feature-release-transport.mjs';
import {freezeUploadArtifact,canonical} from './jwt-feature-upload-artifact.mjs';
import {interruptedProfiles,assertWritePolicy} from './jwt-feature-resume-contract.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
export async function deployJWTFeature(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,'MaktabForlife/Academy');assert.equal(process.env.GITHUB_REF,'refs/heads/feature-preview');
 const root=process.cwd(),source=process.env.GITHUB_SHA,read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
 const marker=read('config/jwt-feature-release.json');
 const resume=marker.state==='READY_FOR_PAUSED_CODE_RESUME';
 const expectedKeys=resume?['schema','state','activationAllowed','storageProfile','reference','configs','writePolicy','writePolicySHA256']:['schema','state','activationAllowed','storageProfile','appSource','setupReceipt','baseline','writePolicy','writePolicySHA256'];
 assert.deepEqual(Object.keys(marker).sort(),expectedKeys.sort(),'NO_EXECUTABLE_MARKER');
 assert.equal(marker.schema,1);assert.equal(marker.storageProfile,'FRESH_PAIR_V1');
 assert.equal(marker.activationAllowed,!resume);
 if(!resume){assert.equal(marker.state,'READY_FOR_FEATURE_RELEASE');assert.equal(marker.appSource,'e8e26af7e5c6275656faa5c24985098e377439d0');}
 // All future inputs must be committed under this exact approved Feature tree.
 // There is deliberately no sample executable policy in this proposal.
 for(const k of resume?['reference','configs','writePolicy']:['setupReceipt','baseline','writePolicy'])assert.match(marker[k],/^config\/jwt-feature-[a-z0-9-]+\.json$/);
 const writePolicy=read(marker.writePolicy),writePolicySHA256=marker.writePolicySHA256;
 assert.equal(hash(canonical(writePolicy)),writePolicySHA256);
 const proof=await loadFeatureApproval(),api=githubClient(process.env.GITHUB_TOKEN);assert.equal(proof.plan.contains_jwt,true);
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();assert.equal(git('rev-parse','HEAD'),source);assert.equal(git('status','--porcelain','--untracked-files=no'),'');
 const installation=resume?undefined:read(marker.setupReceipt),installed=resume?undefined:read(marker.baseline),nativeReceipt=read('config/feature-initialisation-receipt.json');
 const coordinatorDigest=await coordinatorSourceDigest(root);
 const profiles=resume?interruptedProfiles({reference:read(marker.reference),configs:read(marker.configs),source,coordinatorSourceDigest:coordinatorDigest,coordinatorReplacement:Object.hasOwn(writePolicy.firstWrites,'academy-feature-split-coordinator')}):releaseProfiles({baseWorker:read('backend/wrangler.feature.jsonc'),baseCoordinator:read('backend/wrangler.feature-coordinator.jsonc'),nativeReceipt,installation,installed,source,coordinatorSourceDigest:coordinatorDigest});
 assert(process.env.RUNNER_TEMP);
 const directory=mkdtempSync(resolve(process.env.RUNNER_TEMP,'jwt-release-private-')),evidenceDirectory=resolve(process.env.RUNNER_TEMP,'jwt-release-evidence');
 execFileSync(process.execPath,[resolve(root,'backend/tools/jwt-v110-feature-public-build.mjs')],{cwd:root,stdio:'pipe',env:{...process.env,JWT_V110_EVIDENCE:directory}});
 const pub=JSON.parse(readFileSync(resolve(directory,'public-build.json'),'utf8'));assert.equal(pub.origin,profiles.origin);
 const assetRoot=resolve(root,'.academy-jwt-public');cpSync(pub.directory,assetRoot,{recursive:true});
 const inventory=new Map();
 function walk(dir,map){for(const e of readdirSync(dir,{withFileTypes:true})){const path=join(dir,e.name),stat=lstatSync(path);assert(!stat.isSymbolicLink());if(e.isDirectory())walk(path,map);else{assert(stat.isFile());const name=relative(assetRoot,path);assert(!/(?:^|\/)(?:backend|config|\.git|\.github|node_modules|\.env(?:\.[^/]*)?|\.dev\.vars)(?:\/|$)|\.sql$|private.?key/i.test(name));map.set(name,hash(readFileSync(path)));}}}
 walk(assetRoot,inventory);const hostingHash=hash(readFileSync(resolve(root,'config/hosting.json')));
 const selected=resume?profiles.paused:profiles.active,artifacts={};
 for(const [name,c]of [['feature_worker',selected.worker],['academy-feature-split-coordinator',selected.coordinator]])artifacts[name]=await freezeUploadArtifact({root,directory,config:c,source,assetRoot});
 artifacts.pausedWorker=resume?artifacts.feature_worker:await freezeUploadArtifact({root,directory,config:profiles.paused.worker,source,assetRoot});
 const references=resume?profiles.reference.referenceVersions:{feature_worker:installed.workerVersion,'academy-feature-split-coordinator':installed.coordinatorVersion};
 assertWritePolicy({policy:writePolicy,policySHA256:writePolicySHA256,source,references,artifacts,mode:resume?'PAUSED_RESUME':'ACTIVE'});
 const frozenInputs=new Map([['config/jwt-feature-release.json',hash(readFileSync(resolve(root,'config/jwt-feature-release.json')))],...[marker.writePolicy,...(resume?[marker.reference,marker.configs]:[marker.setupReceipt,marker.baseline])].map(p=>[p,hash(readFileSync(resolve(root,p)))])]);
 const fresh=async()=>{
  await freshApproval(proof,api);assert.equal((await api('/repos/MaktabForlife/Academy/git/ref/heads/feature-preview')).object.sha,source);
  assert.equal(git('rev-parse','HEAD'),source);assert.deepEqual(git('diff','--name-only').split('\n').filter(Boolean),['config/hosting.json']);assert.equal(hash(readFileSync(resolve(root,'config/hosting.json'))),hostingHash);
  const now=new Map();walk(assetRoot,now);assert.deepEqual([...now].sort(),[...inventory].sort(),'PUBLIC_BUILD_CHANGED');
  for(const [p,h]of frozenInputs)assert.equal(hash(readFileSync(resolve(root,p))),h,'REVIEWED_INPUT_CHANGED');
  for(const a of Object.values(artifacts))a.assertFrozen();
 };
 const assets=new Map([['/academy/',inventory.get('academy/index.html')],['/auth/v110/browser-config.js',inventory.get('auth/v110/browser-config.js')]]);assert([...assets.values()].every(Boolean));
 const ops=createFeatureReleaseOps({root,directory,evidenceDirectory,profiles,nativeReceipt,installation,installed,source,fresh,token:process.env.CLOUDFLARE_API_TOKEN,pin:resume?undefined:process.env.FEATURE_TEST_ADMIN_PIN,assets,artifacts,writePolicy,writePolicySHA256});
 await (resume?resumeInterruptedFeature({ops}):releaseFreshFeature({ops}));
 console.log(JSON.stringify({state:resume?'PAUSED_CODE_RESUME_VERIFIED':'FEATURE_VERIFIED',source,url:profiles.origin+'/academy/',productionChanged:false,setupReplayed:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 try{await deployJWTFeature();}catch{console.error('JWT_FEATURE_RELEASE_STOPPED_SEE_ALLOWLISTED_RECEIPT');process.exitCode=1;}
}
