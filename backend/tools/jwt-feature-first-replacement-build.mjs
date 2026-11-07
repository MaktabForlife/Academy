// Offline preparation on disposable GitHub runners only; no credential/remote API.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {firstReplacementInputs} from './jwt-feature-first-replacement-inputs.mjs';
import {freezeUploadArtifact,digest,canonical} from './jwt-feature-upload-artifact.mjs';
import {savePublicByteEvidence} from './jwt-feature-first-replacement-assets.mjs';
import {coordinatorSourceDigest} from './jwt-feature-code-digest.mjs';
export async function compileFirstReplacement({root=process.cwd(),source=process.env.GITHUB_SHA,directory}={}){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.match(source,/^[a-f0-9]{40}$/);assert(directory);
 const {configs,reference,configSHA256,sourceBlobs}=firstReplacementInputs();
 const originalHosting=readFileSync(resolve(root,'config/hosting.json'));
 const restore=()=>writeFileSync(resolve(root,'config/hosting.json'),originalHosting);
 const env={...process.env,GITHUB_SHA:source,JWT_V110_EVIDENCE:directory};
 for(const k of ['CLOUDFLARE_API_TOKEN','CF_FEATURE_DEPLOY_TOKEN','FEATURE_TEST_ADMIN_PIN','GITHUB_TOKEN','GH_TOKEN'])delete env[k];
 try{
  execFileSync(process.execPath,[resolve(root,'backend/tools/jwt-v110-feature-public-build.mjs')],{cwd:root,env,stdio:'pipe'});
  const pub=JSON.parse(readFileSync(resolve(directory,'public-build.json'),'utf8'));
  const assetRoot=resolve(directory,'assets');cpSync(pub.directory,assetRoot,{recursive:true});
  const artifact=await freezeUploadArtifact({root,directory,config:configs.worker,source,assetRoot});
  const rows=[];const walk=dir=>{for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name),s=lstatSync(p);assert(!s.isSymbolicLink());if(s.isDirectory())walk(p);else{assert(s.isFile());rows.push([relative(assetRoot,p),s.size,digest(readFileSync(p))]);}}};walk(assetRoot);rows.sort((a,b)=>a[0].localeCompare(b[0]));
  const publicHashes=Object.fromEntries(['/academy/','/auth/v110/browser-config.js'].map(p=>[p,digest(readFileSync(resolve(assetRoot,p==='/academy/'?'academy/index.html':'auth/v110/browser-config.js')))]));
  const manifest={schema:1,state:'OFFLINE_INPUT_MANIFEST_NOT_EXECUTION_AUTHORITY',recipeSource:source,origin:pub.origin,sourceBlobs,completeConfigsSHA256:configSHA256,worker:{artifactSHA256:artifact.artifactSHA256,provenance:artifact.provenance},coordinatorSourceDigest:await coordinatorSourceDigest(root),publicAssets:{count:rows.length,totalBytes:rows.reduce((n,r)=>n+r[1],0),inventorySHA256:digest(canonical(rows)),responseSHA256:publicHashes},referenceKind:reference.state,referenceOwned:false,hostedCalls:0,credentialReads:0};
  return {manifest,artifact,configs,reference,assetRoot,inventory:rows,hostingSHA256:digest(readFileSync(resolve(root,'config/hosting.json'))),restore};
 }catch(error){restore();throw error;}
}
export async function prepareFirstReplacement({root=process.cwd(),source=process.env.GITHUB_SHA,destination}={}){
 assert(destination);
 const directory=mkdtempSync(resolve(process.env.RUNNER_TEMP,'jwt-first-replacement-build-'));
 const built=await compileFirstReplacement({root,source,directory});
 try{
  mkdirSync(destination,{recursive:true});writeFileSync(resolve(destination,'first-replacement-inputs.json'),JSON.stringify(built.manifest,null,2)+'\n');
  writeFileSync(resolve(destination,'asset-inventory.json'),JSON.stringify(built.inventory,null,2)+'\n');
  savePublicByteEvidence({root,directory:destination,built});
  return built.manifest;
 }finally{built.restore();}
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 try{await prepareFirstReplacement({destination:process.env.FIRST_REPLACEMENT_OUTPUT});}catch{console.error('FIRST_REPLACEMENT_OFFLINE_BUILD_STOPPED');process.exitCode=1;}
}
