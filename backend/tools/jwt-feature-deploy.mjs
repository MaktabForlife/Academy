// Explicit fresh JWT Feature profile. No native deploy fallback or setup replay.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,readdirSync,lstatSync,cpSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadFeatureApproval,freshApproval,githubClient} from '../../tools/approved-deployment.mjs';
import {releaseProfiles,releaseFreshFeature} from './jwt-feature-release-controller.mjs';
import {createFeatureReleaseOps} from './jwt-feature-release-transport.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
export async function deployJWTFeature(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,'MaktabForlife/Academy');assert.equal(process.env.GITHUB_REF,'refs/heads/feature-preview');
 const root=process.cwd(),source=process.env.GITHUB_SHA,read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
 const marker=read('config/jwt-feature-release.json');
 assert.deepEqual(marker,{schema:1,state:'READY_FOR_FEATURE_RELEASE',activationAllowed:true,storageProfile:'FRESH_PAIR_V1',appSource:'e8e26af7e5c6275656faa5c24985098e377439d0',setupReceipt:'config/jwt-feature-installation-receipt.json',baseline:'config/jwt-feature-installed-baseline.json'});
 const proof=await loadFeatureApproval(),api=githubClient(process.env.GITHUB_TOKEN);assert.equal(proof.plan.contains_jwt,true);
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();assert.equal(git('rev-parse','HEAD'),source);assert.equal(git('status','--porcelain','--untracked-files=no'),'');
 const installation=read(marker.setupReceipt),installed=read(marker.baseline),nativeReceipt=read('config/feature-initialisation-receipt.json');
 const profiles=releaseProfiles({baseWorker:read('backend/wrangler.feature.jsonc'),baseCoordinator:read('backend/wrangler.feature-coordinator.jsonc'),nativeReceipt,installation,installed,source});
 const directory=resolve(process.env.RUNNER_TEMP,'jwt-release-private'),evidenceDirectory=resolve(process.env.RUNNER_TEMP,'jwt-release-evidence');mkdirSync(directory,{recursive:true,mode:0o700});
 execFileSync(process.execPath,[resolve(root,'backend/tools/jwt-v110-feature-public-build.mjs')],{cwd:root,stdio:'pipe',env:{...process.env,JWT_V110_EVIDENCE:directory}});
 const pub=JSON.parse(readFileSync(resolve(directory,'public-build.json'),'utf8'));assert.equal(pub.origin,profiles.origin);
 const assetRoot=resolve(root,'.academy-jwt-public');cpSync(pub.directory,assetRoot,{recursive:true});
 const inventory=new Map();
 function walk(dir,map){for(const e of readdirSync(dir,{withFileTypes:true})){const path=join(dir,e.name),stat=lstatSync(path);assert(!stat.isSymbolicLink());if(e.isDirectory())walk(path,map);else{assert(stat.isFile());const name=relative(assetRoot,path);assert(!/(?:^|\/)(?:backend|config|\.git|\.github|node_modules|\.env(?:\.[^/]*)?|\.dev\.vars)(?:\/|$)|\.sql$|private.?key/i.test(name));map.set(name,hash(readFileSync(path)));}}}
 walk(assetRoot,inventory);const hostingHash=hash(readFileSync(resolve(root,'config/hosting.json')));
 const fresh=async()=>{
  await freshApproval(proof,api);assert.equal((await api('/repos/MaktabForlife/Academy/git/ref/heads/feature-preview')).object.sha,source);
  assert.equal(git('rev-parse','HEAD'),source);assert.deepEqual(git('diff','--name-only').split('\n').filter(Boolean),['config/hosting.json']);assert.equal(hash(readFileSync(resolve(root,'config/hosting.json'))),hostingHash);
  const now=new Map();walk(assetRoot,now);assert.deepEqual([...now].sort(),[...inventory].sort(),'PUBLIC_BUILD_CHANGED');
 };
 const assets=new Map([['/academy/',inventory.get('academy/index.html')],['/auth/v110/browser-config.js',inventory.get('auth/v110/browser-config.js')]]);assert([...assets.values()].every(Boolean));
 const ops=createFeatureReleaseOps({root,directory,evidenceDirectory,profiles,nativeReceipt,installation,installed,source,fresh,token:process.env.CLOUDFLARE_API_TOKEN,pin:process.env.FEATURE_TEST_ADMIN_PIN,assets});
 await releaseFreshFeature({ops});
 console.log(JSON.stringify({state:'FEATURE_VERIFIED',source,url:profiles.origin+'/academy/',productionChanged:false,setupReplayed:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 try{await deployJWTFeature();}catch{console.error('JWT_FEATURE_RELEASE_STOPPED_SEE_ALLOWLISTED_RECEIPT');process.exitCode=1;}
}
