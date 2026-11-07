// Offline public-byte evidence only. No hosted API, credential or private report.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync,cpSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {canonical,digest} from './jwt-feature-upload-artifact.mjs';
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16777216,stdio:['ignore','pipe','pipe']}).trim();
const gitBlob=b=>createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');
const allowed=p=>assert(!/(?:^|\/)(?:backend|config|\.git|\.github|node_modules|\.env(?:\.[^/]*)?|\.dev\.vars)(?:\/|$)|\.sql$|private.?key/i.test(p),'FORBIDDEN_PUBLIC_PATH');
function rows(root){
 const out=[];
 const walk=dir=>{for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name),s=lstatSync(p);assert(!s.isSymbolicLink());if(s.isDirectory())walk(p);else{assert(s.isFile());const name=relative(root,p);allowed(name);out.push([name,s.size,digest(readFileSync(p))]);}}};
 walk(root);return out.sort((a,b)=>a[0].localeCompare(b[0]));
}
export function savePublicByteEvidence({root,directory,built}){
 const source=git(root,'rev-parse','HEAD'),tree=git(root,'rev-parse','HEAD^{tree}');
 assert.match(source,/^[a-f0-9]{40}$/);assert.match(tree,/^[a-f0-9]{40}$/);
 const entries=execFileSync('git',['ls-tree','-r','-z','HEAD'],{cwd:root,maxBuffer:16777216,stdio:['ignore','pipe','pipe']}).toString().split('\0').filter(Boolean);
 const index=new Map();for(const e of entries){const m=e.match(/^100(?:644|755) blob ([a-f0-9]{40})\t([\s\S]+)$/);if(m){const list=index.get(m[1])||[];list.push(m[2]);index.set(m[1],list);}}
 const mapping=[],generated=new Map();mkdirSync(resolve(directory,'generated'),{recursive:true});
 for(const [path,size,sha256]of built.inventory){
  allowed(path);const bytes=readFileSync(resolve(built.assetRoot,path));assert.equal(bytes.length,size);assert.equal(digest(bytes),sha256);
  const id=gitBlob(bytes),candidates=(index.get(id)||[]).sort(),mapped=candidates.includes(path)?path:candidates[0];
  let content;
  if(mapped){
   assert.equal(digest(readFileSync(resolve(root,mapped))),sha256);
   content={kind:'GIT_BLOB',repository:'MaktabForlife/Academy',source,path:mapped,blob:id};
  }else{
   const file='generated/'+sha256;if(!generated.has(file)){writeFileSync(resolve(directory,file),bytes,{flag:'wx'});generated.set(file,size);}
   content={kind:'GENERATED_BYTES',file};
  }
  mapping.push({path,size,sha256,content});
 }
 assert.equal(digest(canonical(built.inventory)),built.manifest.publicAssets.inventorySHA256);
 const code=readFileSync(built.artifact.render(built.configs.worker).main);
 assert.equal(digest(code),built.manifest.worker.provenance.codeSHA256);
 writeFileSync(resolve(directory,'compiled-worker.mjs'),code);
 const builderPaths=['backend/tools/jwt-v110-feature-public-build.mjs','backend/tools/academy-assets.mjs','backend/tools/portal-assets.mjs','backend/tools/hosting-client.mjs','config/hosting.json'];
 const builderBlobs=Object.fromEntries(builderPaths.map(p=>[p,git(root,'rev-parse','HEAD:'+p)]));
 const result={schema:1,state:'OFFLINE_PUBLIC_BYTE_EVIDENCE_NOT_PUBLICATION_AUTHORITY',source,tree,builderBlobs,hostingVariantSHA256:built.hostingSHA256,assetInventorySHA256:digest(canonical(built.inventory)),mappingSHA256:digest(canonical(mapping)),files:mapping,generatedFiles:generated.size,generatedBytes:[...generated.values()].reduce((a,b)=>a+b,0),compiledWorker:{file:'compiled-worker.mjs',sha256:digest(code),bytes:code.length},privateMaterialIncluded:false,hostedCalls:0};
 writeFileSync(resolve(directory,'asset-sources.json'),JSON.stringify(result,null,2)+'\n');
 return result;
}
export function compareOriginalPublicBuild({originalRepo,originalEvidence,currentEvidence,destination}){
 const source=git(originalRepo,'rev-parse','HEAD');assert.equal(source,'c660e3813908127561ad454ab503f9f66fa6d700');
 const pub=JSON.parse(readFileSync(resolve(originalEvidence,'public-build.json'),'utf8')),old=rows(pub.directory);
 const now=JSON.parse(readFileSync(resolve(currentEvidence,'asset-inventory.json'),'utf8'));
 const previous=new Map(old.map(r=>[r[0],r])),next=new Map(now.map(r=>[r[0],r]));
 const added=now.filter(r=>!previous.has(r[0])),removed=old.filter(r=>!next.has(r[0])),changed=now.filter(r=>previous.has(r[0])&&(previous.get(r[0])[1]!==r[1]||previous.get(r[0])[2]!==r[2])).map(r=>({path:r[0],before:previous.get(r[0]).slice(1),after:r.slice(1)}));
 const ext={};for(const [p,n]of now){const type=p.includes('.')?p.slice(p.lastIndexOf('.')).toLowerCase():'[none]';ext[type]??={files:0,bytes:0};ext[type].files++;ext[type].bytes+=n;}
 const result={schema:1,state:'OFFLINE_REPRODUCED_PUBLIC_BUILD_COMPARISON_NOT_HOSTED_READBACK',originalSource:source,originalTree:git(originalRepo,'rev-parse','HEAD^{tree}'),originalBuilderBlob:git(originalRepo,'rev-parse','HEAD:backend/tools/jwt-v110-feature-public-build.mjs'),original:{files:old.length,bytes:old.reduce((n,r)=>n+r[1],0),inventorySHA256:digest(canonical(old))},candidate:{files:now.length,bytes:now.reduce((n,r)=>n+r[1],0),inventorySHA256:digest(canonical(now))},equalBytes:added.length===0&&removed.length===0&&changed.length===0,added,removed,changed,extensions:ext,largest:[...now].sort((a,b)=>b[1]-a[1]).slice(0,12),notDeployedAssetProof:true,noMediaAttachmentOrPublicationAPICalled:true,hostedCalls:0};
 writeFileSync(destination,JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[2]==='compare'){
 try{assert.equal(process.env.GITHUB_ACTIONS,'true');compareOriginalPublicBuild({originalRepo:resolve(process.cwd(),'.original-public-source'),originalEvidence:process.env.ORIGINAL_PUBLIC_EVIDENCE,currentEvidence:process.env.FIRST_REPLACEMENT_OUTPUT,destination:resolve(process.env.FIRST_REPLACEMENT_OUTPUT,'original-public-comparison.json')});}
 catch{console.error('OFFLINE_PUBLIC_COMPARISON_STOPPED');process.exitCode=1;}
}
