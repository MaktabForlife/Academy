// SOURCE provenance and frozen CLI inputs. Hashes do not attest remote code.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,lstatSync,realpathSync,readdirSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {build,version as esbuildVersion} from 'esbuild';
import {account,origin,workerFirst} from './jwt-feature-transition.mjs';
export const targets=['feature_worker','academy-feature-split-coordinator'];
export const digest=x=>createHash('sha256').update(x).digest('hex');
const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
export const canonical=x=>JSON.stringify(sorted(x));
export function assertHostConfig(c){
 assert(targets.includes(c.name));assert.equal(c.account_id,account);
 assert.equal(c.workers_dev,c.name===targets[0]);assert.equal(c.preview_urls,false);assert.equal(c.keep_vars,false);
 assert.equal(c.migrations,undefined);assert.deepEqual(c.triggers,{crons:[]});
 for(const k of ['routes','route','env','services','kv_namespaces','queues','unsafe','dispatch_namespaces','send_email'])assert.equal(c[k],undefined,'UNREVIEWED_HOST_EFFECT');
 assert(!Object.keys(c.vars||{}).some(k=>k.startsWith('JWT_FEATURE_SETUP_')));
 assert(!/setup/i.test(c.main));assert.equal(c.vars.ENVIRONMENT,'feature');
 if(c.name===targets[0]){
  assert.equal(c.main,'src/academy-feature-jwt-runtime.js');
  assert.equal(c.vars.JWT_V110_REQUEST_ORIGIN,origin);
  assert.equal(c.vars.JWT_V110_COOKIE_MODE,'HOST_ONLY_PREVIEW');
  assert.deepEqual(c.assets?.run_worker_first,workerFirst);assert.equal(c.assets.binding,'ASSETS');assert.equal(c.assets.not_found_handling,'none');
 }else{assert.equal(c.main,'src/academy-split-coordinator.js');assert.equal(c.assets,undefined);}
}
function inventory(directory){
 assert.equal(realpathSync(directory),resolve(directory));
 const rows=[];
 const walk=dir=>{for(const name of readdirSync(dir).sort()){
  const p=join(dir,name),s=lstatSync(p);assert(!s.isSymbolicLink());
  if(s.isDirectory())walk(p);else{
   assert(s.isFile()&&s.nlink===1);const key=relative(directory,p);
   assert(!/(?:^|\/)(?:backend|config|\.git|\.github|node_modules|\.env(?:\.[^/]*)?|\.dev\.vars)(?:\/|$)|\.sql$|private.?key/i.test(key));
   rows.push([key,digest(readFileSync(p))]);
  }
 }};
 walk(directory);return rows.sort((a,b)=>a[0].localeCompare(b[0]));
}
export async function freezeUploadArtifact({root,directory,config,source,assetRoot}){
 assertHostConfig(config);config=structuredClone(config);assert.match(source,/^[a-f0-9]{40}$/);
 assert.equal(realpathSync(directory),resolve(directory));assert.equal(esbuildVersion,'0.28.1');
 const entry='backend/'+config.main;
 const out=await build({absWorkingDir:root,entryPoints:[entry],bundle:true,format:'esm',platform:'browser',write:false,metafile:true,sourcemap:false,external:['cloudflare:workers','node:*']});
 assert.equal(out.outputFiles.length,1);
 const inputs=Object.keys(out.metafile.inputs).sort().map(path=>{
  const name=relative(root,resolve(root,path));assert(!name.startsWith('../')&&!name.startsWith('backend/tests/'));
  return [name,digest(readFileSync(resolve(root,name)))];
 });
 inputs.push(['backend/package-lock.json',digest(readFileSync(resolve(root,'backend/package-lock.json')))]);
 const publicFiles=config.assets?inventory(assetRoot):[];
 const logical=structuredClone(config);delete logical.$schema;
 if(logical.vars.JWT_V110_RELEASE_ID===source)logical.vars.JWT_V110_RELEASE_ID='$APPROVED_EXECUTION_SOURCE';
 if(logical.assets)logical.assets.directory='$FROZEN_ASSETS';
 const provenance={schema:1,target:config.name,compiler:'esbuild@0.28.1',entry,inputSHA256:digest(canonical(inputs)),codeSHA256:digest(out.outputFiles[0].contents),assetsSHA256:digest(canonical(publicFiles)),logicalConfigSHA256:digest(canonical(logical))};
 const artifactSHA256=digest(canonical(provenance)),path=resolve(directory,config.name+'-'+artifactSHA256+'.mjs');
 writeFileSync(path,out.outputFiles[0].contents,{flag:'wx',mode:0o400});
 const stat=lstatSync(path);
 const assertFrozen=()=>{
  const s=lstatSync(path);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.dev===stat.dev&&s.ino===stat.ino);
  assert.equal(digest(readFileSync(path)),provenance.codeSHA256,'COMPILED_BYTES_CHANGED');
  for(const [p,h]of inputs)assert.equal(digest(readFileSync(resolve(root,p))),h,'COMPILE_INPUT_CHANGED');
  if(config.assets)assert.deepEqual(inventory(assetRoot),publicFiles,'PUBLIC_BYTES_CHANGED');
 };
 const render=c=>{
  assert.deepEqual(c,config,'LOGICAL_CONFIG_CHANGED');assertFrozen();
  const rendered={...structuredClone(c),main:path,no_bundle:true,...(c.assets?{assets:{...c.assets,directory:resolve(assetRoot)}}:{})};delete rendered.$schema;
  return rendered;
 };
 return Object.freeze({source,provenance:Object.freeze(provenance),artifactSHA256,render,assertFrozen});
}
