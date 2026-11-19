#!/usr/bin/env node
// Source/config/in-memory schema/test verification only; never deploys or grants approval.
import {readFileSync,readdirSync,existsSync,realpathSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
const SHA=/^[0-9a-f]{40}$/,HASH=/^[0-9a-f]{64}$/;
const EXPECTED=Object.freeze({
 Academy:{app:'academy',base:'15d1a1e5d96e831af8946a59eb70f9ce97023cfe',origin:'https://ummabbadacademy.app',alias:null},
 AcademyStudio:{app:'studio',base:'9a8c117e9279a2b67e62eb044be4da989db4a096',origin:'https://worshipuponbaseera.ummabbadacademy.app',alias:'ummabbadacademy.maktab4life.org'},
 Hifz:{app:'hifz',base:'ba0ea53f23b933b0c175c87fe41788df74afbb2f',origin:'https://mahadarwa-hifz.ummabbadacademy.app',alias:'ummabbadacademy.hifz-helper.app'}
});
const REQUIRED_COMMON=['cache.mjs','capture.mjs','ceremonies.mjs','codec.mjs','events.mjs','outbox.mjs','policy.mjs','publication.mjs','schema.mjs','snapshot.mjs','store.mjs','tokens.mjs'];
const cleanEnvironment=()=>Object.fromEntries(['PATH','Path','PATHEXT','SYSTEMROOT','SystemRoot','WINDIR','COMSPEC','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','APPDATA','LANG','LC_ALL'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]));
const SCHEMAS={'schema.mjs':'schemaSQL','ceremonies.mjs':'ceremonySchemaSQL','policy.mjs':'policySchemaSQL','snapshot.mjs':'snapshotSchemaSQL','recovery.mjs':'recoverySchemaSQL','outbox.mjs':'outboxSchemaSQL','issuance-floors.mjs':'issuanceFloorSchemaSQL','control-publication.mjs':'controlPublicationSchemaSQL'};
const hash=b=>createHash('sha256').update(b).digest('hex');
const assert=(ok,code)=>{if(!ok)throw Error(code);};
const data=p=>JSON.parse(readFileSync(p,'utf8'));
const fileHash=p=>hash(readFileSync(p));
const scrub=s=>String(s||'').replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[REDACTED_SYNTHETIC_JWT]').replace(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g,'[REDACTED_OPAQUE_VALUE]').replace(/("(?:pin|confirmPin|csrf|refresh|accessToken)"\s*:\s*")[^"]*"/gi,'$1[REDACTED]"');
function usage(){return [
 'V111 source-only preflight; never deploys or grants approval.',
 'node tools/v111-foundation-preflight.mjs --workspace-root <parent-of-three-repos>',
 ' --source-manifest <combined-json> [--git-evidence <WSL-read-only-receipt>]',
 ' [--run-tests] [--output <new-evidence-json>]',
 'Manifest: {schema:1,deploymentApproval:"PENDING",apps:[{app:"Academy",',
 ' base:"selected 40-char source base",head:"optional candidate commit",',
 ' files:[{path:"security/v2/codec.mjs",sha256:"64-char hash"},...]},...]}',
 'Require all three apps and every common module/config/native registry/Academy test.',
 'Optional WSL receipt: {schema:1,scope:"WSL_GIT_LOCAL_READ_ONLY",recordedAtUtc,',
 ' apps:[{app,base,commit,branch,workingTreeClean,pushesDisabled},...]}',
 'A supplied receipt remains separate from NOT_VERIFIED direct Git checks.',
 'Exit 0=source checks/tests requested passed; 1=failed; 2=verification pending.',
 'No exit status establishes deployment or native three-app readiness.'
].join('\n');}
function parse(argv){
 const o={runTests:false},fields={'--workspace-root':'workspaceRoot','--source-manifest':'sourceManifest','--git-evidence':'gitEvidence','--output':'output'};
 for(let i=0;i<argv.length;i++){
  const k=argv[i];if(k==='--help'){o.help=true;continue;}if(k==='--run-tests'){o.runTests=true;continue;}
  assert(fields[k]&&!Object.hasOwn(o,fields[k])&&argv[i+1]&&!argv[i+1].startsWith('--'),'INVALID_ARGUMENT');o[fields[k]]=argv[++i];
 }
 if(!o.help)assert(o.workspaceRoot&&o.sourceManifest,'WORKSPACE_AND_SOURCE_MANIFEST_REQUIRED');return o;
}
function within(root,path){
 assert(typeof path==='string'&&path.length>0&&path.length<=400&&!path.includes('\\')&&!path.includes('\0')&&!isAbsolute(path)&&!path.split('/').some(p=>p==='..'||p==='.'||p===''),'INVALID_MANIFEST_PATH');
 assert(/^(?:security\/v2\/|config\/v111-auth\.json$|tools\/v111-foundation-preflight\.mjs$|\.github\/workflows\/v111-foundation-check\.yml$|backend\/src\/|src\/|worker\/src\/)/.test(path),'UNREVIEWED_MANIFEST_PATH');
 assert(/\.(?:mjs|js|json|jsonc|sql|txt|yml)$/.test(path)&&!/(?:^|\/)(?:\.env|keys?|exports?|backups?|private-data)(?:[./]|$)/i.test(path),'UNSAFE_MANIFEST_FILE');
 const actual=realpathSync(resolve(root,...path.split('/'))),rel=relative(realpathSync(root),actual);
 assert(rel!==''&&!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel),'SOURCE_PATH_ESCAPES_REPOSITORY');return actual;
}
function git(root,args){
 const r=spawnSync('git',['-c','core.fsmonitor=false','-C',root,...args],{encoding:'utf8',timeout:15000,windowsHide:true,env:{...cleanEnvironment(),GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'}});
 return !r.error&&r.status===0?r.stdout.trim():null;
}
function gitState(root,base,head){
 const actual=git(root,['rev-parse','HEAD']);
 if(!actual||!SHA.test(actual))return {status:'NOT_VERIFIED',reason:'GIT_UNAVAILABLE_OR_FOREIGN_WORKTREE_POINTER',required:'Root WSL Git receipt/review; copied files do not prove Git identity.'};
 const validBase=git(root,['rev-parse','--verify',base+'^{commit}']);
 const ancestor=spawnSync('git',['-c','core.fsmonitor=false','-C',root,'merge-base','--is-ancestor',base,actual],{encoding:'utf8',timeout:15000,windowsHide:true,env:{...cleanEnvironment(),GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'}});
 assert(validBase===base&&ancestor.status===0,'SELECTED_BASE_NOT_IN_CANDIDATE_HISTORY');if(head!==undefined)assert(actual===head,'CANDIDATE_HEAD_MISMATCH');
 const status=git(root,['status','--porcelain=v1']),branch=git(root,['symbolic-ref','--short','-q','HEAD']),push=git(root,['remote','get-url','--push','--all','origin']);
 return {status:status===null?'NOT_VERIFIED':'VERIFIED_LOCAL_GIT',commit:actual,base,branch:branch||'DETACHED',workingTreeClean:status===null?null:status.length===0,
  originPushesDisabled:push===null?null:push.split(/\r?\n/).every(u=>/(?:disabled|do-not-push|no-push|push-blocked)/i.test(u)),
  networkAccess:false,pushAttempted:false,qualification:'Dirty preparation bytes are checked by file hashes. Deployment later requires reviewed clean/pushed commits.'};
}
function registry(path,e){
 const r=data(path);assert(r.schema===2&&r.app===e.app&&r.sourceCommit===e.base,'NATIVE_REGISTRY_BASE_MISMATCH');assert(r.rules&&Object.keys(r.rules).length&&r.schemaColumns,'NATIVE_REGISTRY_MISSING');
 let count=0;for(const [t,v] of Object.entries(r.rules)){
  assert(/^[a-z_][a-z0-9_]*$/.test(t)&&Array.isArray(v.columns)&&v.columns.length&&Array.isArray(r.schemaColumns[t]),'INVALID_AUTHORITY_RULE');
  assert(v.columns.every(c=>/^[a-z_][a-z0-9_]*$/.test(c)&&r.schemaColumns[t].includes(c)),'UNDECLARED_AUTHORITY_COLUMN');count+=v.columns.length;
 }return {status:'VALIDATED_STATIC_REGISTRY',tables:Object.keys(r.rules).length,columns:count,qualification:'Installed schema and native writer/phase acceptance remain separate.'};
}
function config(path,e){
 const c=data(path);assert(c.schema===2&&c.app===e.app&&c.env==='production','CONFIG_NAMESPACE_MISMATCH');
 assert(c.publicOrigin===e.origin&&c.academyOrigin===EXPECTED.Academy.origin&&c.providerAlias===e.alias,'CANONICAL_ORIGIN_OVERRIDE_MISMATCH');
 assert(c.activationEnabled===false&&c.AIEnabled===false,'ACTIVATION_OR_AI_MUST_STAY_OFF');assert(['PENDING','REQUIRED'].includes(c.deploymentApproval),'DEPLOYMENT_APPROVAL_HOLD_MISSING');
 assert(c.timing?.accessSeconds===900&&c.timing.originalSessionSeconds===604800&&Number.isSafeInteger(c.timing.defaultInactivityMinutes)&&c.timing.defaultInactivityMinutes>=15&&c.timing.defaultInactivityMinutes<=200,'APPROVED_TIMINGS_MISMATCH');
 return {status:'PASS',app:e.app,publicOrigin:e.origin,activationEnabled:false,AIEnabled:false,accessSeconds:900,originalSessionSeconds:604800};
}
async function schemas(root,common){
 const db=new DatabaseSync(':memory:'),recipes=[];
 try{
  for(const [file,name] of Object.entries(SCHEMAS)){
   assert(common.includes(file),'SCHEMA_MODULE_MISSING');const module=await import(pathToFileURL(join(root,'security','v2',file)).href),sql=module[name];
   assert(typeof sql==='string'&&sql.length>0&&sql.length<=1024*1024,'ADDITIVE_SCHEMA_EXPORT_MISSING');
   assert(!/\b(?:ATTACH|DETACH|VACUUM|load_extension)\b/i.test(sql)&&!/\bDROP\s+(?:TABLE|TRIGGER|INDEX|VIEW)\b/i.test(sql)&&!/\bALTER\s+TABLE\b/i.test(sql),'NON_ADDITIVE_SCHEMA_RECIPE');
   const created=[...sql.matchAll(/\bCREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|TRIGGER|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?["\x60\[]?([a-z_][a-z0-9_]*)/gi)].map(m=>m[1]);
   assert(created.length&&created.every(n=>n.startsWith('jwt_v2_')),'UNVERSIONED_SCHEMA_OBJECT');db.exec(sql);recipes.push({module:file,export:name,sha256:hash(sql),objects:created.length});
  }
  const objects=db.prepare("SELECT type,name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();assert(objects.every(x=>x.name.startsWith('jwt_v2_')),'UNVERSIONED_SCHEMA_OBJECT');
  return {status:'PASS_ISOLATED_SCHEMA_RECIPE',recipes,objects:objects.length,appliedTo:'Fresh :memory: SQLite only; no existing database path opened.',installedSchema:'NOT_INSPECTED',rollbackCompatibility:'NOT_PROVEN'};
 }finally{db.close();}
}
function legacy(root){
 const f=join(root,'.github','workflows');return existsSync(f)?readdirSync(f).filter(n=>/\.ya?ml$/.test(n)).filter(n=>/\bfeature-preview\b|\bfeature_worker\b|CF_FEATURE_DEPLOY_TOKEN/.test(readFileSync(join(f,n),'utf8'))):[];
}
function testSources(root){
 const base=join(root,'security','v2','test'),files=[];
 function walk(folder){for(const item of readdirSync(folder,{withFileTypes:true})){const path=join(folder,item.name);if(item.isSymbolicLink())throw Error('SYMLINKED_TEST_SOURCE_NOT_SUPPORTED');if(item.isDirectory())walk(path);else if(item.isFile()&&/\.(?:mjs|js|json|sql)$/.test(item.name))files.push(relative(base,path).split(sep).join('/'));}}
 assert(existsSync(base),'FOUNDATION_TESTS_MISSING');walk(base);return files.sort();
}
function tests(root){
 const f=join(root,'security','v2','test');assert(existsSync(f),'FOUNDATION_TESTS_MISSING');const a=readdirSync(f).filter(n=>n.endsWith('.test.mjs')).sort();assert(a.length,'FOUNDATION_TESTS_MISSING');return a.includes('all.test.mjs')?['all.test.mjs']:a;
}
async function main(){
 const o=parse(process.argv.slice(2));if(o.help){console.log(usage());return;}
 const workspace=realpathSync(resolve(o.workspaceRoot)),source=realpathSync(resolve(o.sourceManifest)),manifest=data(source);
 assert(manifest.schema===1&&manifest.deploymentApproval==='PENDING'&&Array.isArray(manifest.apps)&&manifest.apps.length===3,'INVALID_SOURCE_MANIFEST');
 const report={schema:1,release:'V111-milestone2',scope:'SOURCE_ONLY_PREFLIGHT',recordedAtUtc:new Date().toISOString(),deploymentApproval:'PENDING',deploymentPermitted:false,AI:'OFF_REQUIRED',
  sourceManifest:{sha256:fileHash(source),qualification:'File bytes plus selected bases; no self-referential enclosing commit requirement.'},checks:[],apps:{},tests:{status:'NOT_RUN'},
  hosting:{status:'NOT_TESTED',reportedReceipt:'C:/maktab/hosting-readiness/jwt-hostnames-20261119-r1/completion.json',qualification:'Coordination reports SaaS/SSL ready. No HTTP/TLS/provider request or app acceptance is performed.'},
  remainingGates:['Independent milestone 2 review and native writer/phase acceptance','Milestone 3 native HTTP/relay/UI, Studio wrapper and Hifz Static Assets','Coherent source/build/config/key/resource manifests and clean pushed commits before activation','Retired Feature automation isolation reviewed before later source push/dispatch','Separate owner deployment approval']};
 let failed=false,pending=false;const roots={},entries={},common={};
 const check=async(name,fn)=>{try{const detail=await fn();const status=detail?.status==='NOT_VERIFIED'?'NOT_VERIFIED':detail?.status==='SUPPLIED_FOR_ROOT_REVIEW'?'REVIEW_REQUIRED':'PASS';report.checks.push({name,status,detail});return detail;}catch(e){failed=true;report.checks.push({name,status:'FAIL',reason:String(e.message||'CHECK_FAILED')});return null;}};
 for(const [app,e] of Object.entries(EXPECTED)){
  roots[app]=realpathSync(join(workspace,app));
  await check(app+':source-manifest',()=>{
   const rows=manifest.apps.filter(v=>v.app===app);assert(rows.length===1,'APP_MANIFEST_DUPLICATE_OR_MISSING');const entry=rows[0];entries[app]=entry;
   if(app==='Academy')assert(realpathSync(fileURLToPath(import.meta.url))===realpathSync(join(roots[app],'tools','v111-foundation-preflight.mjs')),'PREFLIGHT_TOOL_NOT_SELECTED_SOURCE');
   assert((entry.base||entry.sourceBase)===e.base&&SHA.test(entry.base||entry.sourceBase),'SELECTED_BASE_MISMATCH');if(entry.head!==undefined)assert(SHA.test(entry.head),'INVALID_CANDIDATE_HEAD');
   assert(Array.isArray(entry.files)&&entry.files.length,'SOURCE_FILE_MANIFEST_MISSING');const seen=new Set();
   for(const f of entry.files){assert(f&&HASH.test(f.sha256)&&!seen.has(f.path),'INVALID_SOURCE_FILE_MANIFEST');seen.add(f.path);assert(fileHash(within(roots[app],f.path))===f.sha256,'SOURCE_FILE_HASH_MISMATCH:'+f.path);}
   common[app]=readdirSync(join(roots[app],'security','v2')).filter(n=>n.endsWith('.mjs')&&n!=='native-adapter.mjs').sort();assert(REQUIRED_COMMON.every(n=>common[app].includes(n)),'COMMON_FOUNDATION_MODULE_MISSING');
   const required=['config/v111-auth.json','security/v2/native-authority.json','security/v2/native-adapter.mjs',...common[app].map(n=>'security/v2/'+n)];if(app==='Academy'){required.push('tools/v111-foundation-preflight.mjs','.github/workflows/v111-foundation-check.yml','security/v2/README.txt');for(const n of testSources(roots[app]))required.push('security/v2/test/'+n);}
   assert(required.every(n=>seen.has(n)),'FOUNDATION_MANIFEST_COVERAGE_INCOMPLETE');return {base:e.base,head:entry.head||null,files:seen.size,commonModules:common[app].length};
  });
  const c=await check(app+':inactive-configuration',()=>config(join(roots[app],'config','v111-auth.json'),e));
  const r=await check(app+':native-registry',()=>registry(join(roots[app],'security','v2','native-authority.json'),e));
  const g=await check(app+':local-git',()=>gitState(roots[app],e.base,entries[app]?.head));if(g?.status==='NOT_VERIFIED')pending=true;report.apps[app]={config:c,registry:r,git:g};
 }
 await check('common-module-byte-agreement',()=>{
  assert(Object.keys(common).length===3,'COMMON_MODULES_NOT_VERIFIED');const names=common.Academy;assert(Object.values(common).every(v=>JSON.stringify(v)===JSON.stringify(names)),'COMMON_MODULE_SET_MISMATCH');
  return {files:names.map(name=>{const sha=fileHash(join(roots.Academy,'security','v2',name));for(const app of ['AcademyStudio','Hifz'])assert(fileHash(join(roots[app],'security','v2',name))===sha,'COMMON_MODULE_HASH_MISMATCH:'+app+'/'+name);return {path:'security/v2/'+name,sha256:sha};})};
 });
 if(!failed)await check('foundation-module-syntax',()=>{
  for(const name of common.Academy){
   const result=spawnSync(process.execPath,['--check',join(roots.Academy,'security','v2',name)],{encoding:'utf8',timeout:15000,windowsHide:true,env:cleanEnvironment()});
   assert(!result.error&&result.status===0,'FOUNDATION_SYNTAX_FAILED:'+name);
  }
  return {modules:common.Academy.length,workerBundle:'NOT_BUILT_BY_SOURCE_ONLY_CHECK'};
 });
 if(!failed)await check('additive-schema-recipes',()=>schemas(roots.Academy,common.Academy));
 if(o.gitEvidence)await check('operator-supplied-wsl-git-receipt',()=>{
  const path=realpathSync(resolve(o.gitEvidence)),receipt=data(path);assert(receipt.schema===1&&receipt.scope==='WSL_GIT_LOCAL_READ_ONLY'&&typeof receipt.recordedAtUtc==='string'&&Array.isArray(receipt.apps),'INVALID_WSL_GIT_RECEIPT');
  const observations=Object.entries(EXPECTED).map(([app,e])=>{
   const rows=receipt.apps.filter(v=>v.app===app);assert(rows.length===1,'WSL_GIT_RECEIPT_APP_MISSING');const r=rows[0];
   assert(r.base===e.base&&SHA.test(r.commit)&&typeof r.workingTreeClean==='boolean'&&typeof r.pushesDisabled==='boolean','WSL_GIT_RECEIPT_MISMATCH');if(entries[app]?.head)assert(r.commit===entries[app].head,'WSL_GIT_RECEIPT_HEAD_MISMATCH');if(report.apps[app].git?.commit)assert(r.commit===report.apps[app].git.commit,'WSL_GIT_RECEIPT_HEAD_MISMATCH');
   return {app,base:r.base,commit:r.commit,branch:r.branch||null,workingTreeClean:r.workingTreeClean,pushesDisabled:r.pushesDisabled};
  });
  return {status:'SUPPLIED_FOR_ROOT_REVIEW',sha256:fileHash(path),observations,qualification:'Direct NOT_VERIFIED Git checks stay explicit. Root must review WSL evidence before closing preparation.'};
 });
 report.legacyAutomation=Object.fromEntries(Object.keys(EXPECTED).map(app=>[app,legacy(roots[app])]));
 if(o.runTests&&!failed){
  const results=[];
  for(const name of tests(roots.Academy)){
   const r=spawnSync(process.execPath,[join(roots.Academy,'security','v2','test',name)],{cwd:roots.Academy,encoding:'utf8',timeout:300000,windowsHide:true,maxBuffer:4*1024*1024,env:{...cleanEnvironment(),WRANGLER_SEND_METRICS:'false'}});
   const output=scrub((r.stdout||'')+(r.stderr||'')),ok=!r.error&&r.status===0,item={file:'security/v2/test/'+name,status:ok?'PASS':'FAIL',exitCode:r.status??null,outputSha256:hash(output)};
   if(o.output){const dir=join(dirname(resolve(o.output)),'test-logs');mkdirSync(dir,{recursive:true});const path=join(dir,name+'.txt');writeFileSync(path,output,{flag:'wx'});item.log=relative(dirname(resolve(o.output)),path).split(sep).join('/');}
   results.push(item);if(!ok)failed=true;
  }
  report.tests={status:results.every(r=>r.status==='PASS')?'PASS_ISOLATED_TESTS':'FAIL',results,qualification:'Synthetic local tests, not full browser/hosted acceptance or production cost evidence.'};
 }
 await check('source-bytes-stable-after-checks',()=>{
  assert(fileHash(source)===report.sourceManifest.sha256,'SOURCE_MANIFEST_CHANGED_DURING_CHECK');
  for(const [app,entry] of Object.entries(entries)){
   for(const f of entry.files)assert(fileHash(within(roots[app],f.path))===f.sha256,'SOURCE_CHANGED_DURING_CHECK:'+app+'/'+f.path);
   assert(JSON.stringify(readdirSync(join(roots[app],'security','v2')).filter(n=>n.endsWith('.mjs')&&n!=='native-adapter.mjs').sort())===JSON.stringify(common[app]),'COMMON_MODULE_SET_CHANGED_DURING_CHECK');
  }
  return {stable:true};
 });
 report.AI=Object.values(report.apps).every(a=>a.config?.AIEnabled===false)?'OFF_IN_VALIDATED_SOURCE_CONFIGS':'NOT_VERIFIED';
 report.status=failed?'FAIL':pending?'SOURCE_CHECKS_PENDING_GIT_VERIFICATION':'PASS_SOURCE_ONLY';report.nativeThreeAppAcceptance='PENDING_MILESTONE_3';report.independentMilestone2Acceptance='PENDING_ROOT_REVIEW';
 report.mutations={deployment:false,provider:false,database:'Disposable :memory: schema/test stores only',secretsRead:false,applicationAI:false,git:false};
 if(o.output){const path=resolve(o.output);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
 console.log(JSON.stringify({status:report.status,deploymentApproval:'PENDING',deploymentPermitted:false,checks:report.checks.map(c=>({name:c.name,status:c.status,...(c.reason?{reason:c.reason}:{})})),tests:report.tests.status,nativeThreeAppAcceptance:report.nativeThreeAppAcceptance,outputWritten:Boolean(o.output)},null,2));
 process.exitCode=failed?1:pending?2:0;
}
main().catch(e=>{console.error(JSON.stringify({status:'FAIL',scope:'SOURCE_ONLY_PREFLIGHT',deploymentApproval:'PENDING',deploymentPermitted:false,reason:String(e.message||'PREFLIGHT_FAILED')}));process.exitCode=1;});
