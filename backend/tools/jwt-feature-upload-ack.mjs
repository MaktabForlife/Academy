// Supported schema: cloudflare/workers-sdk wrangler@4.136.3 packages/workers-utils/src/output.ts
// Docs: https://developers.cloudflare.com/workers/wrangler/system-environment-variables/#example-output-file
// Source-only primitive: an ACK is CLI provenance, not deployed-code/ownership/activation clearance.
// Only the pinned CLI's successful, bounded, per-invocation NDJSON is an ACK.
import assert from 'node:assert/strict';
import {constants,openSync,closeSync,fstatSync,lstatSync,realpathSync,readSync} from 'node:fs';
import {resolve} from 'node:path';
export const pinnedWranglerVersion='4.136.3';
const names=['feature_worker','academy-feature-split-coordinator'];
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const keys=(value,required,optional=[])=>{
 assert(value&&typeof value==='object'&&!Array.isArray(value));
 assert(required.every(k=>Object.hasOwn(value,k)));
 assert(Object.keys(value).every(k=>[...required,...optional].includes(k)));
};
export function prepareUploadAck(directory,label){
 assert.equal(realpathSync(directory),resolve(directory));
 assert(lstatSync(directory).isDirectory()&&!lstatSync(directory).isSymbolicLink());
 assert(/^(release-(?:feature_worker|academy-feature-split-coordinator)|owned-jwt-paused)$/.test(label));
 const path=resolve(directory,label+'.ack.private.ndjson');
 const fd=openSync(path,'wx',0o600);
 try{const s=fstatSync(fd);assert(s.isFile()&&s.nlink===1);return {path,dev:s.dev,ino:s.ino};}
 finally{closeSync(fd);}
}
export function validateUploadAck(text,expected){
 try{
  assert(typeof text==='string'&&Buffer.byteLength(text,'utf8')<=65536&&text.endsWith('\n'));
  const lines=text.slice(0,-1).split('\n');assert.equal(lines.length,2);
  const [session,deployed]=lines.map(line=>JSON.parse(line));
  keys(session,['type','version','wrangler_version','command_line_args','log_file_path','timestamp']);
  keys(deployed,['type','version','worker_name','worker_tag','version_id','worker_name_overridden','timestamp'],['targets','wrangler_environment','bundle_size']);
  assert.equal(session.type,'wrangler-session');assert.equal(session.version,1);
  assert.equal(session.wrangler_version,pinnedWranglerVersion);
  assert(Array.isArray(expected.args)&&expected.args.length===3&&expected.args[0]==='deploy'&&expected.args[1]==='--config'&&typeof expected.args[2]==='string'&&expected.args[2].startsWith('/')&&expected.args[2].length<=2048);
  assert.deepEqual(session.command_line_args,expected.args);
  assert(typeof expected.beforeVersion==='string'&&uuid.test(expected.beforeVersion));
  assert(typeof session.log_file_path==='string'&&session.log_file_path.length<=2048);
  assert.equal(deployed.type,'deploy');assert.equal(deployed.version,1);
  assert(names.includes(expected.name));assert.equal(deployed.worker_name,expected.name);
  assert.equal(deployed.worker_name_overridden,false);assert.equal(deployed.wrangler_environment,undefined);
  assert(deployed.worker_tag===null||(typeof deployed.worker_tag==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(deployed.worker_tag)));
  assert(typeof deployed.version_id==='string'&&uuid.test(deployed.version_id));
  assert.notEqual(deployed.version_id,expected.beforeVersion);
  assert.deepEqual(deployed.targets??[],expected.name===names[0]?['https://feature_worker.maktab4life.workers.dev']:[]);
  if(deployed.bundle_size!==undefined){keys(deployed.bundle_size,['raw_bytes','gzip_bytes']);for(const n of Object.values(deployed.bundle_size))assert(Number.isSafeInteger(n)&&n>=0);}
  const times=[session.timestamp,deployed.timestamp].map(t=>{assert(typeof t==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(t));return Date.parse(t);});
  assert(Number.isFinite(expected.startedAt)&&Number.isFinite(expected.finishedAt)&&expected.finishedAt>=expected.startedAt);
  assert(times[0]>=expected.startedAt-1000&&times[1]>=times[0]&&times[1]<=expected.finishedAt+1000);
  assert(/^[a-f0-9]{40}$/.test(expected.source));assert(/^[a-f0-9]{64}$/.test(expected.configSHA256));
  return Object.freeze({schema:1,target:expected.name,versionId:deployed.version_id,source:expected.source,configSHA256:expected.configSHA256,wranglerVersion:pinnedWranglerVersion,kind:'PINNED_CLI_DEPLOY_ACK'});
 }catch{throw Error('UPLOAD_ACK_INVALID_OR_UNKNOWN');}
}
export function readUploadAck(file,expected){
 let fd;
 try{
  const link=lstatSync(file.path);assert(!link.isSymbolicLink()&&link.isFile()&&link.nlink===1);
  fd=openSync(file.path,constants.O_RDONLY|constants.O_NOFOLLOW);
  const s=fstatSync(fd);assert.equal(s.dev,file.dev);assert.equal(s.ino,file.ino);assert(s.isFile()&&s.nlink===1&&s.size>0&&s.size<=65536);
  const bytes=Buffer.alloc(65537);let size=0;
  while(size<bytes.length){const count=readSync(fd,bytes,size,bytes.length-size,null);if(count===0)break;size+=count;}
  assert(size<=65536&&size===s.size);
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size)),after=fstatSync(fd);assert.equal(after.size,s.size);assert.equal(after.ino,s.ino);assert.equal(after.mtimeMs,s.mtimeMs);assert.equal(after.ctimeMs,s.ctimeMs);
  const linkAfter=lstatSync(file.path);assert(!linkAfter.isSymbolicLink()&&linkAfter.nlink===1);assert.equal(linkAfter.ino,s.ino);assert.equal(linkAfter.dev,s.dev);
  return validateUploadAck(text,expected);
 }catch{throw Error('UPLOAD_ACK_INVALID_OR_UNKNOWN');}
 finally{if(fd!==undefined)closeSync(fd);}
}
