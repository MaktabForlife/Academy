// Offline affected input build. Reuses accepted public bytes; no public-builder/hosted call.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {activationConfigurations} from './jwt-feature-activation-baseline.mjs';
import {freezeUploadArtifact,canonical,digest} from './jwt-feature-upload-artifact.mjs';
export const acceptedPublic=Object.freeze({artifact:13576482979,zipSHA256:'e1ecea65e3a3560b9b6b6f158f8137ba334b86894429d48f31319725a1c4a69a',inventorySHA256:'6ade67e8aa41bc28b26aa809c51bce59eefc5374b0fbcd8a20ac0a6a1e0706e1',mappingSHA256:'98654179cbf740c8878411f3f183421eb1e732d9c6ad5d791d55504b8328d25a',files:1057,bytes:116996993});
const blob=b=>createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+String.fromCharCode(0)),b])).digest('hex');
export function acceptedAssets({root,directory,archive}){
 assert.equal(digest(archive),acceptedPublic.zipSHA256,'PUBLIC_ARCHIVE_CHANGED');
 const env={...process.env};for(const k of ['CLOUDFLARE_API_TOKEN','CF_FEATURE_DEPLOY_TOKEN','FEATURE_TEST_ADMIN_PIN','GITHUB_TOKEN','GH_TOKEN'])delete env[k];
 const decode="import sys,zipfile,io,json,base64\nz=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));prefix='_temp/first-replacement-public/'\ndef read(name):return z.read(prefix+name)\nm=json.loads(read('asset-sources.json'));rows=json.loads(read('asset-inventory.json'))\ng={r['content']['file']:base64.b64encode(read(r['content']['file'])).decode() for r in m['files'] if r['content']['kind']=='GENERATED_BYTES'}\nprint(json.dumps({'mapping':m,'rows':rows,'generated':g}))\n";
 const data=JSON.parse(execFileSync('python3',['-c',decode],{input:archive,env,maxBuffer:4194304,stdio:['pipe','pipe','pipe']}));
 const m=data.mapping;assert.equal(m.mappingSHA256,acceptedPublic.mappingSHA256);assert.equal(digest(canonical(m.files)),acceptedPublic.mappingSHA256);assert.equal(digest(canonical(data.rows)),acceptedPublic.inventorySHA256);
 assert.equal(m.files.length,acceptedPublic.files);assert.equal(new Set(m.files.map(r=>r.path)).size,m.files.length);
 const assetRoot=resolve(directory,'accepted-assets');mkdirSync(assetRoot,{recursive:false});let bytes=0;
 for(const row of m.files){
  assert(row.path&&!row.path.startsWith('/')&&!row.path.split('/').some(p=>p==='..'||!p));const path=resolve(assetRoot,row.path);assert(path.startsWith(assetRoot+'/'));
  let b;
  if(row.content.kind==='GIT_BLOB'){
   const p=resolve(root,row.content.path);assert(p.startsWith(resolve(root)+'/'));const s=lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink());b=readFileSync(p);assert.equal(blob(b),row.content.blob,'ACCEPTED_ASSET_SOURCE_CHANGED');
  }else{assert.equal(row.content.kind,'GENERATED_BYTES');b=Buffer.from(data.generated[row.content.file],'base64');}
  assert.equal(b.length,row.size);assert.equal(digest(b),row.sha256);bytes+=b.length;
  mkdirSync(dirname(path),{recursive:true});writeFileSync(path,b,{flag:'wx',mode:0o400});
 }
 assert.equal(bytes,acceptedPublic.bytes);assert.equal(realpathSync(assetRoot),assetRoot);
 return {assetRoot,rows:data.rows,hostingVariantSHA256:m.hostingVariantSHA256,publicHashes:new Map([['/academy/',digest(readFileSync(resolve(assetRoot,'academy/index.html')))],['/auth/v110/browser-config.js',digest(readFileSync(resolve(assetRoot,'auth/v110/browser-config.js')))]]),delta:{added:[],removed:[],changed:[],inventorySHA256:acceptedPublic.inventorySHA256,files:acceptedPublic.files,bytes}};
}
export async function compileActivation({root=process.cwd(),directory,source,archive}){
 assert.equal(process.env.GITHUB_ACTIONS,'true');const configs=activationConfigurations(source),pub=acceptedAssets({root,directory,archive});
 const hostingPath=resolve(root,'config/hosting.json'),originalHosting=readFileSync(hostingPath),restore=()=>writeFileSync(hostingPath,originalHosting);
 const variant={schema:1,environment:'feature',academyPortalOrigin:'https://feature_worker.maktab4life.workers.dev',academyLegacyOrigins:[],academyApiOrigin:'https://feature_worker.maktab4life.workers.dev',studioOrigin:'https://studio-unavailable.invalid',studioBackendOrigin:'https://studio-unavailable.invalid',hifzOrigin:'https://hifz-unavailable.invalid'};
 const variantBytes=Buffer.from(JSON.stringify(variant,null,2)+'\n');assert.equal(digest(variantBytes),pub.hostingVariantSHA256,'ACCEPTED_HOSTING_VARIANT_CHANGED');writeFileSync(hostingPath,variantBytes);
 try{
 const active=await freezeUploadArtifact({root,directory,source,config:configs.active.worker,assetRoot:pub.assetRoot});
 const paused=await freezeUploadArtifact({root,directory,source,config:configs.paused.worker,assetRoot:pub.assetRoot});
 for(const a of [active,paused]){
  assert.equal(a.provenance.inputSHA256,'7eee6650d7841b0b579affbe488e150c07b76fb3118447ba0f640fc58af1f42f');
  assert.equal(a.provenance.codeSHA256,'2ef9bfb14803e5623a40080c832f0fcddddfe83095361c18e4234cca27b00565');
  assert.equal(a.provenance.assetsSHA256,'50cca0afba78ba20ab5ea30c7070e96c36742c82fb9d0ae99a63607c423abd64');
 }
 const manifest={schema:1,state:'OFFLINE_ACTIVATION_INPUTS_NOT_AUTHORITY',recipeSource:source,active:{artifactSHA256:active.artifactSHA256,provenance:active.provenance},paused:{artifactSHA256:paused.artifactSHA256,provenance:paused.provenance},assets:{...acceptedPublic,responseSHA256:Object.fromEntries(pub.publicHashes)},assetDelta:pub.delta,coordinatorSourceDigest:'8bdc622649bd20ceb3bc531b1161c7f42495105211a51f9e3dc2b8415f216465',hostedCalls:0,privateReceiptRead:false,hostingVariantSHA256:pub.hostingVariantSHA256};
 return {manifest,configs,artifacts:{feature_worker:active,pausedWorker:paused},assets:pub.publicHashes,assetRoot:pub.assetRoot,hostingSHA256:pub.hostingVariantSHA256,restore};
 }catch(error){restore();throw error;}
}
if(process.argv[2]==='build'){
 try{const directory=process.env.ACTIVATION_OUTPUT;assert(directory);mkdirSync(directory,{recursive:false});const out=await compileActivation({directory,source:process.env.GITHUB_SHA,archive:readFileSync(process.env.ACCEPTED_PUBLIC_ARCHIVE)});writeFileSync(resolve(directory,'activation-inputs.json'),JSON.stringify(out.manifest,null,2)+'\n');out.restore();}
 catch(error){console.error('ACTIVATION_OFFLINE_INPUT_BUILD_STOPPED',error.name,error.message);process.exitCode=1;}
}
