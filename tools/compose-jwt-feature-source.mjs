// Disposable GitHub-only three-way source composition. No remote mutation.
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,rmSync,openSync,closeSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
assert.equal(process.env.GITHUB_ACTIONS,'true');
const root=resolve(process.cwd()),app=resolve(process.env.JWT_APP_SOURCE_ROOT),out=resolve(process.env.RUNNER_TEMP,'jwt-composed-source'),evidence=resolve(process.env.RUNNER_TEMP,'jwt-fresh-pair-evidence','composition');
mkdirSync(out,{recursive:true});mkdirSync(evidence,{recursive:true});
const appSHA=process.env.JWT_APP_SOURCE_SHA,canonical=process.env.JWT_CANONICAL_SHA,ancestor='7873664525a3e58a613056f5a7c061c1ac17162f';
for(const s of [appSHA,canonical])assert.match(s,/^[a-f0-9]{40}$/);
const git=(cwd,args)=>execFileSync('git',args,{cwd,maxBuffer:32*1024*1024});
git(app,['fetch','--no-tags','--depth=1','origin',ancestor]);git(root,['fetch','--no-tags','--depth=1','origin',canonical]);
const head=git(root,['rev-parse','HEAD']).toString().trim();
const tree=(cwd,ref)=>new Map(git(cwd,['ls-tree','-rz',ref]).toString().split('\0').filter(Boolean).map(x=>{const [meta,path]=x.split('\t'),[mode,type,sha]=meta.split(' ');assert.equal(type,'blob');return[path,{mode,sha}];}));
const old=tree(app,ancestor),incoming=tree(app,appSHA),current=tree(root,'HEAD'),canon=tree(root,canonical);
const cache=new Map();const blob=(cwd,ref,path)=>{const key=cwd+'|'+ref+'|'+path;if(!cache.has(key))cache.set(key,git(cwd,['show',ref+':'+path]));return cache.get(key);};
const oid=data=>createHash('sha1').update('blob '+data.length+'\\0'.replace('\\\\0','\\0')).update(data).digest('hex');
const target=path=>{const p=resolve(out,path);assert(p.startsWith(out+'/'));return p;};
const write=(path,data)=>{const p=target(path);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,data);};
const final=new Map();
for(const [p,v]of current)final.set(p,{...v});
const tops=[...new Set([...current.keys()].filter(p=>!p.startsWith('release/')).map(p=>p.split('/')[0]))];
for(const [p,v]of current)if(!p.startsWith('release/'))assert(['100644','100755'].includes(v.mode),'Unreviewed symlink/mode '+p);
const archive=resolve(evidence,'source.tmp.tar'),fd=openSync(archive,'w');
try{execFileSync('git',['archive','HEAD','--',...tops],{cwd:root,stdio:['ignore',fd,'pipe']});}finally{closeSync(fd);}
execFileSync('tar',['-xf',archive,'-C',out]);rmSync(archive);
const report={schema:1,kind:'UNAPPROVED_SOURCE_COMPOSITION',preparationCommit:head,appSource:appSHA,canonical,ancestor,featureBase:'6bef65664473fa40c9074413a9c052eb9c22b454',applied:[],kept:[],conflicts:[],canonicalControls:[],hostedCalls:0,publishable:false};
const applyPath=p=>/^(?:auth\/|academy\/|account\/|js\/|portal\/|portal-adapter\/|backend\/src\/|backend\/tests\/|docs\/JWT-)/.test(p)||['version.json','backend/package.json','backend/package-lock.json','docs/RELEASE-V110.md'].includes(p)||/^\.github\/workflows\/jwt-/.test(p)||/^backend\/tools\/(?:academy-assets|academy-pages-build|academy-site|hosting-client|portal-site|jwt-v110-[a-z-]+)\.mjs$/.test(p);
function mergeJSON(a,b,c,path=''){
 if(JSON.stringify(a)===JSON.stringify(b))return c;if(JSON.stringify(c)===JSON.stringify(b)||JSON.stringify(a)===JSON.stringify(c))return a;
 if(path==='version'||path==='packages..version')return c;
 if(a&&b&&c&&[a,b,c].every(x=>typeof x==='object'&&!Array.isArray(x))){const r={};for(const k of new Set([...Object.keys(a),...Object.keys(b),...Object.keys(c)])){const v=mergeJSON(a[k],b[k],c[k],path?path+'.'+k:k);if(v!==undefined)r[k]=v;}return r;}
 throw Error('JSON conflict '+path);
}
for(const p of [...new Set([...old.keys(),...incoming.keys()])].sort()){
 if(old.get(p)?.sha===incoming.get(p)?.sha)continue;
 if(!applyPath(p)){report.kept.push(p);continue;}
 const entry=final.get(p),baseEntry=old.get(p),nextEntry=incoming.get(p);
 if(entry?.sha===nextEntry?.sha||nextEntry?.sha===baseEntry?.sha){report.kept.push(p);continue;}
 const a=entry?blob(root,'HEAD',p):null,b=baseEntry?blob(app,ancestor,p):null,c=nextEntry?blob(app,appSHA,p):null;
 let result=c;
 if(a&&c&&a.equals(c)||c&&b&&c.equals(b)){report.kept.push(p);continue;}
 if(a&&(!b||!a.equals(b))){
  if(!b||!c){report.conflicts.push({path:p,kind:'add/delete-conflict'});continue;}
  try{
   if(['version.json','js/version.json','backend/package.json','backend/package-lock.json'].includes(p))result=Buffer.from(JSON.stringify(mergeJSON(JSON.parse(a),JSON.parse(b),JSON.parse(c)),null,2)+'\n');
   else{
    const names=['ours','base','app'].map(x=>resolve(evidence,x+'.tmp'));[a,b,c].forEach((v,i)=>writeFileSync(names[i],v));
    const merged=spawnSync('git',['merge-file','-p',...names],{encoding:null,maxBuffer:8*1024*1024});
    if(merged.status!==0){writeFileSync(resolve(evidence,'conflict-'+report.conflicts.length+'.txt'),merged.stdout);report.conflicts.push({path:p,kind:'text-conflict'});continue;}
    result=merged.stdout;
   }
  }catch(error){report.conflicts.push({path:p,kind:error.message});continue;}
 }
 if(result){write(p,result);final.set(p,{mode:incoming.get(p).mode,sha:oid(result),data:result});}else{if(existsSync(target(p)))rmSync(target(p));final.delete(p);}
 report.applied.push(p);
}
const control=p=>/^\.github\/(?!workflows\/jwt-)/.test(p)||/^tools\/(?:approved-deployment|validation-cleanup|paired-release|cloud-release-check|release-health|release-safety).*\.mjs$/.test(p)||/^(?:docs\/(?:AUTOMATIC-APPROVED-DEPLOYMENTS|VALIDATION-CLEANUP)\.md|tests\/(?:approved-deployment|validation-cleanup).*)$/.test(p);
for(const [p,v]of canon)if(control(p)){const data=blob(root,canonical,p);if(final.get(p)?.sha!==v.sha){write(p,data);final.set(p,{...v,data});report.canonicalControls.push(p);}}
const feature=tree(root,'6bef65664473fa40c9074413a9c052eb9c22b454'),bug='portal/circles/app.js';
if(canon.get(bug)?.sha!==feature.get(bug)?.sha){assert.equal(final.get(bug)?.sha,feature.get(bug)?.sha,'Canonical accepted app delta needs explicit conflict review');const v=canon.get(bug),data=blob(root,canonical,bug);write(bug,data);final.set(bug,{...v,data});report.canonicalControls.push(bug);}
write('config/jwt-feature-release.json',Buffer.from(JSON.stringify({schema:1,state:'PREPARATION_ONLY',profile:'FRESH_PAIR_V1',appSource:appSHA,setupReceipt:null,activationAllowed:false},null,2)+'\n'));final.set('config/jwt-feature-release.json',{mode:'100644',data:readFileSync(target('config/jwt-feature-release.json'))});
const deployPath='backend/tools/feature-deploy.mjs';let deploy=readFileSync(target(deployPath),'utf8');
deploy=deploy.replace("readFileSync,writeFileSync,mkdtempSync,mkdirSync","readFileSync,writeFileSync,mkdtempSync,mkdirSync,existsSync");
assert(deploy.includes('async function main(){'));
deploy=deploy.replace('async function main(){',"async function main(){\n if(existsSync(resolve(root,'config/jwt-feature-release.json')))throw Error('JWT_FEATURE_PREPARATION_ONLY_NO_NATIVE_DEPLOY_FALLBACK');");
write(deployPath,Buffer.from(deploy));final.set(deployPath,{mode:'100644',data:Buffer.from(deploy)});
const changes=[];
for(const p of new Set([...current.keys(),...final.keys()])){
 const v=final.get(p),prior=current.get(p);
 if(v&&prior&&v.sha===prior.sha&&v.mode===prior.mode)continue;
 if(v&&!v.data)v.data=readFileSync(target(p));
 if(v){const dest=resolve(evidence,'changes',p);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,v.data);changes.push({path:p,mode:v.mode,sha256:createHash('sha256').update(v.data).digest('hex'),bytes:v.data.length});}
 else changes.push({path:p,deleted:true});
}
report.changes=changes;report.publishable=report.conflicts.length===0;
writeFileSync(resolve(evidence,'composition.json'),JSON.stringify(report,null,2)+'\n');
if(report.conflicts.length)throw Error('SOURCE_COMPOSITION_CONFLICTS_'+report.conflicts.length);
console.log(JSON.stringify({compositionPrepared:true,appSource:appSHA,changedFiles:changes.length,hostedCalls:0,activationBlocked:true}));
