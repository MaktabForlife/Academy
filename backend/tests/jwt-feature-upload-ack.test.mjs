import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,appendFileSync,writeFileSync,symlinkSync,linkSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {prepareUploadAck,validateUploadAck,readUploadAck} from '../tools/jwt-feature-upload-ack.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');
const now=Date.now(),stamp=new Date(now).toISOString(),v='11111111-1111-4111-8111-111111111111';
function fixture(name='feature_worker'){
 const expected={name,args:['deploy','--config','/RUNNER_ONLY/release.json'],beforeVersion:'00000000-0000-4000-8000-000000000001',source:'b'.repeat(40),configSHA256:'c'.repeat(64),startedAt:now,finishedAt:now};
 const entries=[{type:'wrangler-session',version:1,wrangler_version:'4.136.3',command_line_args:[...expected.args],log_file_path:'UNINSTALLED_PRIVATE_LOG_CANARY',timestamp:stamp},{type:'deploy',version:1,worker_name:name,worker_tag:null,version_id:v,worker_name_overridden:false,targets:name==='feature_worker'?['https://feature_worker.maktab4life.workers.dev']:[],timestamp:stamp}];
 return {expected,entries};
}
const encode=entries=>entries.map(JSON.stringify).join('\n')+'\n';
const denied=(entries,expected)=>assert.throws(()=>validateUploadAck(encode(entries),expected),e=>e.message==='UPLOAD_ACK_INVALID_OR_UNKNOWN'&&!e.message.includes('CANARY'));
for(const name of ['feature_worker','academy-feature-split-coordinator'])test('accept only exact successful '+name+' CLI record, return no raw output',()=>{
 const {expected,entries}=fixture(name),ack=validateUploadAck(encode(entries),expected);
 assert.deepEqual(ack,{schema:1,target:name,versionId:v,source:expected.source,configSHA256:expected.configSHA256,wranglerVersion:'4.136.3',kind:'PINNED_CLI_DEPLOY_ACK'});
 assert(Object.isFrozen(ack));assert(!JSON.stringify(ack).includes('CANARY'));
});
const corruptions={
 'wrong pinned CLI':e=>e[0].wrangler_version='4.136.4',
 'wrong command arguments':e=>e[0].command_line_args.push('--env','production'),
 'wrong target':e=>e[1].worker_name='production_worker',
 'unknown version':e=>e[1].version_id=null,
 'invalid version':e=>e[1].version_id='UNINSTALLED_CANARY',
 'unchanged preupload version':e=>e[1].version_id='00000000-0000-4000-8000-000000000001',
 'override target flag':e=>e[1].worker_name_overridden=true,
 'unrequested environment':e=>e[1].wrangler_environment='production',
 'unexpected public trigger':e=>e[1].targets.push('https://production.example.invalid'),
 'wrong record version':e=>e[1].version=2,
 'unknown success field':e=>e[1].rawPrivate='UNINSTALLED_CANARY',
 'version upload is not deployed ACK':e=>e[1].type='version-upload',
 'command-failed is not success':e=>e[1].type='command-failed',
 'stale output timestamp':e=>e[0].timestamp='2025-01-01T00:00:00.000Z',
 'future output timestamp':e=>e[1].timestamp='2099-01-01T00:00:00.000Z',
 'malformed timestamp':e=>e[1].timestamp='UNINSTALLED_CANARY',
 'invalid bundle size':e=>e[1].bundle_size={raw_bytes:-1,gzip_bytes:0},
 'invalid worker tag':e=>e[1].worker_tag='https://UNINSTALLED_CANARY',
 'duplicate deploy ACK':e=>e.push(e[1]),
 'duplicate CLI session':e=>e.unshift(e[0]),
 'missing ACK':e=>e.pop(),
 'auto configuration is not this operation':e=>e.push({type:'autoconfig',version:1,summary:{private:'UNINSTALLED_CANARY'}}),
};
for(const [label,change] of Object.entries(corruptions))test('reject '+label,()=>{const {entries,expected}=fixture();change(entries);denied(entries,expected);});
test('reject truncated/malformed/oversized output with fixed error only',()=>{
 const {entries,expected}=fixture();
 for(const text of [encode(entries).slice(0,-1),'UNINSTALLED_CANARY\n','x'.repeat(65537)+'\n'])assert.throws(()=>validateUploadAck(text,expected),{message:'UPLOAD_ACK_INVALID_OR_UNKNOWN'});
});
test('reject invalid expected source/config/time inputs without raw echo',()=>{
 const {entries,expected}=fixture();
 for(const patch of [{source:'CANARY'},{configSHA256:'CANARY'},{startedAt:NaN},{finishedAt:now-1},{name:'production_worker'},{beforeVersion:undefined},{beforeVersion:'CANARY'},{args:[]},{args:['versions','deploy','/RUNNER_ONLY/release.json']}])denied(entries,{...expected,...patch});
});
const directory=()=>mkdtempSync(resolve(process.env.RUNNER_TEMP,'jwt-ack-policy-'));
test('actual exclusive runner file is read bounded and cannot be reused',()=>{
 const dir=directory(),file=prepareUploadAck(dir,'release-feature_worker'),{entries,expected}=fixture();
 appendFileSync(file.path,encode(entries));assert.equal(readUploadAck(file,expected).versionId,v);
 assert.throws(()=>prepareUploadAck(dir,'release-feature_worker'));
});
test('reject existing file, symbolic directory, unsafe label before any CLI invocation',()=>{
 const dir=directory();writeFileSync(resolve(dir,'release-feature_worker.ack.private.ndjson'),'CANARY');
 assert.throws(()=>prepareUploadAck(dir,'release-feature_worker'));
 const alias=dir+'-alias';symlinkSync(dir,alias);assert.throws(()=>prepareUploadAck(alias,'owned-jwt-paused'));
 assert.throws(()=>prepareUploadAck(dir,'../CANARY'));
});
test('replaced or symlinked output does not acknowledge this invocation',()=>{
 for(const symbolic of [false,true]){
  const dir=directory(),file=prepareUploadAck(dir,'owned-jwt-paused'),{entries,expected}=fixture();
  renameSync(file.path,file.path+'.original');
  if(symbolic){writeFileSync(file.path+'.other',encode(entries));symlinkSync(file.path+'.other',file.path);}
  else writeFileSync(file.path,encode(entries));
  assert.throws(()=>readUploadAck(file,expected),{message:'UPLOAD_ACK_INVALID_OR_UNKNOWN'});
 }
});
test('multiply linked output, missing ACK and invalid UTF8 remain unknown',()=>{
 for(const kind of ['link','empty','utf8']){
  const dir=directory(),file=prepareUploadAck(dir,'owned-jwt-paused'),{entries,expected}=fixture();
  if(kind==='link'){appendFileSync(file.path,encode(entries));linkSync(file.path,file.path+'.alias');}
  if(kind==='utf8')appendFileSync(file.path,Buffer.from([255,254]));
  assert.throws(()=>readUploadAck(file,expected),{message:'UPLOAD_ACK_INVALID_OR_UNKNOWN'});
 }
});
