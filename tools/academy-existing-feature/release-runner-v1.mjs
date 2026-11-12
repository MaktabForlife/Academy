// SOURCE CANDIDATE ONLY. Root must review and select publication and execution separately.
import {readFile,writeFile,mkdir,readdir,lstat,realpath} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const ACCOUNT='c9a3e355b3d7a795880b1d36a1dbe123';
const CORE='cdbe97bc-f3d9-400e-8806-ed9a0d143d26',ADMIN='ed77f2a7-4439-4841-8691-2b41063d8960';
const SPLIT='de95f15f19a54a9e9ba34e6e75f51847',TIME='ab05473998dc4e93b792464f9e78e0e9';
const COMMON='7dee1dab81cf13f4b9fba5f1d919d200ddd5326534168dac4e5dcae31242f8bc';
const PACKAGE_PIN='547622ada94067ea058c2158fcd0378f86c1b85701d2e01af95275f238364d97';
const SQL_PIN='c9d28d1ed752ba4a2c6718a1b1298e339be3ec727ef23c61e2f1ec6d5bdd4a66';
const TAG='jwt-feature-fresh-20261106a',UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const HEX64=/^[a-f0-9]{64}$/,HEX40=/^[a-f0-9]{40}$/;
const ROLES=[
 {role:'coordinator',name:'academy-feature-split-coordinator',baseline:'98dc0bd2-7ded-4ff0-81f4-59721b9228f4',config:'configs/academy-feature-split-coordinator.wrangler.jsonc',configSHA:'90a2e61b6c4e32e22c7f1b672d8d9bcb1fe75e51a1bf562bd062f99e17c42d70',main:'coordinator-main.mjs',mainSHA:'4d72e96e084beef4cbfac9182002ff24ed09ada2c0bdbcf0d7f63f4d9a17f592',names:['AcademySplitCoordinator','JWTFeatureAcademySplitCoordinator']},
 {role:'api',name:'feature_worker',baseline:'ac9ad2c6-1c5b-4016-81dd-da710a731305',config:'configs/feature_worker.wrangler.jsonc',configSHA:'8d0151328720ba5807c1d8f17d7f8198693b19d8f9566bffdad9fa03bd341d44',main:'api-main.mjs',mainSHA:'be8148e6f5db943a20c67eba5be24b3d13ec66c9d1b1e1c1587a767c001b8171',names:['JWTFeatureProgramTimetableCoordinator','ProgramTimetableCoordinator','WebsiteStudioAcademy']}
];
const OBJECTS=[
 ['jwt_v110_master_streams','table'],['jwt_v110_master_outbox','table'],['jwt_v110_master_pending','index'],
 ['jwt_v110_master_facts_immutable','trigger'],['jwt_v110_master_wire_immutable','trigger'],
 ['jwt_v110_master_lifecycle_streams','table'],['jwt_v110_master_lifecycle_outbox','table'],
 ['jwt_v110_master_lifecycle_pending','index'],['jwt_v110_master_lifecycle_facts_immutable','trigger'],
 ['jwt_v110_master_lifecycle_wire_immutable','trigger']
];
const report={schema:'ACADEMY_FEATURE_RELEASE_SAFE_RESULT_V1',status:'FAIL',AI:'OFF',childDelivery:'OFF',SQLRequests:0,applicationRequests:0,wrapperMetadataGETRequests:0,githubGETRequests:0,CLIInvocations:0,stagedVersions:[],activationAttempts:[],secretValuesOrFingerprintsReported:false,wrapperAutomaticRetry:false,pinnedToolUploadRetryPolicy:{maxAttemptsIncludingFirst:3,maxRetryAfterSeconds:60,actualAttempts:'NOT_OBSERVED'},pinnedToolActivationPOSTRetrySource:'PLAIN_FETCHRESULT_NO_RETRY_WRAPPER'};
const fail=code=>{throw Object.assign(Error(code),{publicCode:code});};
const check=(ok,code)=>{if(!ok)fail(code);};
const digest=b=>createHash('sha256').update(b).digest('hex');
const self=fileURLToPath(import.meta.url);
let repo,pkg,out,raw,inputs,stage,runId,manifestSHA,runnerSHA,workflowSHA,nativeBaseline;
async function bytes(path,max=104857600){
 const stat=await lstat(path);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=max,'FILE_SHAPE');
 return readFile(path);
}
async function json(path,max=1048576){try{return JSON.parse((await bytes(path,max)).toString());}catch(e){if(e.publicCode)throw e;fail('JSON_SHAPE');}}
function safeRelative(path){return typeof path==='string'&&path.length>0&&!isAbsolute(path)&&!path.includes('\\')&&!path.split('/').some(x=>x==='..'||x===''||x==='.'||x==='.git');}
async function confined(root,path){check(safeRelative(path),'PATH_SCOPE');const result=resolve(root,path);check((await realpath(result))===result&&result.startsWith(root+'/'),'PATH_SCOPE');return result;}
async function walk(path,prefix=''){
 const files=[];
 for(const e of await readdir(path,{withFileTypes:true})){
  check(!e.isSymbolicLink(),'SYMLINK_REFUSED');
  const p=prefix?prefix+'/'+e.name:e.name;
  if(e.isDirectory())files.push(...await walk(join(path,e.name),p));else {check(e.isFile(),'NON_FILE_REFUSED');files.push(p);}
 }return files.sort();
}
async function boundedJSONResponse(response,limit){
 check(response.ok,'METADATA_HTTP');const reader=response.body.getReader();let size=0;const chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();fail('METADATA_SIZE');}chunks.push(value);}
 try{return JSON.parse(Buffer.concat(chunks).toString());}catch{fail('METADATA_JSON');}
}
async function cfGet(role,suffix){
 check(ROLES.some(x=>x.name===role.name)&&/^(settings|deployments|versions\/[a-f0-9-]{36})$/.test(suffix),'CF_PATH');
 check(++report.wrapperMetadataGETRequests<=10,'METADATA_BUDGET');
 let response;try{response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/workers/scripts/'+role.name+'/'+suffix,{method:'GET',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('METADATA_NETWORK');}
 const d=await boundedJSONResponse(response,2097152);check(d.success===true,'METADATA_RESPONSE');return d.result;
}
async function githubRun(id){
 check(/^[1-9][0-9]{0,19}$/.test(id)&&process.env.GITHUB_TOKEN,'UPLOAD_RUN_CONTEXT');
 report.githubGETRequests++;check(report.githubGETRequests<=1,'GITHUB_BUDGET');
 let response;try{response=await fetch('https://api.github.com/repos/MaktabForlife/Academy/actions/runs/'+id,{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('UPLOAD_RUN_NETWORK');}
 return boundedJSONResponse(response,1048576);
}
function bindingChecks(bindings,role){
 check(Array.isArray(bindings),'BINDING_SHAPE');const find=n=>bindings.find(x=>x.name===n);
 check(!['ACADEMY_DB','ACADEMY_ADMIN_DB','ACADEMY_SPLIT_COORDINATOR','PROGRAM_TIMETABLE_COORDINATOR'].some(n=>find(n)),'NO_ORDINARY_BINDINGS');
 const dos=bindings.filter(x=>x.type==='durable_object_namespace');check(dos.length===(role.role==='api'?2:1),'DO_BINDING_COUNT');
 const d1=bindings.filter(x=>x.type==='d1');
 check(d1.length===2&&find('JWT_V110_CORE_DB')?.id===CORE&&find('JWT_V110_ADMIN_DB')?.id===ADMIN,'JWT_PAIR');
 const split=find('JWT_V110_SPLIT_COORDINATOR');
 check(split?.type==='durable_object_namespace'&&split.class_name==='JWTFeatureAcademySplitCoordinator'&&split.namespace_id===SPLIT,'SPLIT_NAMESPACE');
 if(role.role==='api'){
  check(split.script_name==='academy-feature-split-coordinator','SPLIT_SERVICE');
  const t=find('JWT_V110_TIMETABLE_COORDINATOR');check(t?.class_name==='JWTFeatureProgramTimetableCoordinator'&&t.namespace_id===TIME,'TIME_NAMESPACE');
  for(const [name,id,limit] of [['AUTH_LOGIN_RATE_LIMITER','100111',5],['JWT_V110_RATE_LIMITER','100112',10]]){
   const b=find(name);check(b?.namespace_id===id&&b.simple?.limit===limit&&b.simple?.period===60,'RATE_LIMITER');
  }
  check(find('ASSETS')?.type==='assets','ASSETS_BINDING');
  for(const [name,bucket] of [['ASSESSMENT_BUCKET','maktab-assessments-private-feature'],['LESSON_MEDIA_BUCKET','maktab-lesson-media-private-feature'],['MEDIA_BUCKET','maktab-feature-media-private']])check(find(name)?.bucket_name===bucket,'R2_BINDING');
 }
 const run=find('JWT_V110_NATIVE_RUN_ID')?.text,namespace=find('JWT_V110_OBJECT_NAMESPACE')?.text;
 check(HEX64.test(run||'')&&/^jwt-feature-v110\/[a-z0-9-]{1,64}\/$/.test(namespace||''),'OPAQUE_NATIVE_SELECTION');
 return {run,namespace};
}
async function active(role,expected){
 const d=await cfGet(role,'deployments'),versions=d.deployments?.[0]?.versions;
 check(Array.isArray(versions)&&versions.length===1&&versions[0].version_id===expected&&versions[0].percentage===100,'ACTIVE_VERSION_DRIFT');
}
function lifecycle(v,role){
 const runtime=v?.resources?.script_runtime,named=v?.resources?.script?.named_handlers;
 check(runtime?.migration_tag===TAG&&!Object.hasOwn(runtime,'exports'),'LIFECYCLE_DRIFT');
 check(Array.isArray(named)&&JSON.stringify(named.map(x=>x.name).sort())===JSON.stringify([...role.names].sort()),'ROLE_EXPORT_DRIFT');
}
async function packageChecks(){
 const manifestPath=join(pkg,'CANDIDATE-MANIFEST.json');manifestSHA=digest(await bytes(manifestPath,1048576));
 check(manifestSHA===PACKAGE_PIN&&manifestSHA===inputs.package_manifest_sha256,'PACKAGE_PIN');
 const m=await json(manifestPath);
 check(m.schema==='ACADEMY_FEATURE_IMMUTABLE_CANDIDATE_MANIFEST_V1'&&m.scope==='EXISTING_ACADEMY_FEATURE_ONLY'&&m.AI==='OFF'&&m.commonSHA256===COMMON&&m.publicFileCount===104&&m.files.length===1850,'PACKAGE_CONTRACT');
 const expected=new Map();
 for(const row of m.files){
  check(safeRelative(row.path)&&!expected.has(row.path)&&HEX64.test(row.sha256)&&Number.isSafeInteger(row.bytes),'MANIFEST_ROW');
  const p=await confined(pkg,row.path),b=await bytes(p);check(b.length===row.bytes&&digest(b)===row.sha256,'PACKAGE_FILE_DRIFT');expected.set(row.path,row);
 }
 const actual=await walk(pkg);check(JSON.stringify(actual)===JSON.stringify([...expected.keys(),'CANDIDATE-MANIFEST.json'].sort()),'PACKAGE_EXTRA_FILES');
 check([...expected.keys()].filter(x=>x.startsWith('public/')).length===104,'ASSET_COUNT');
 check(expected.get('public/js/m4l-config-root-only-v1.js')?.sha256==='d39f6007166909c43b480d739afd4a4ee620a7ff31628aa59af9017fbf0965e6','FRONTEND_ORIGIN_PIN');
 for(const role of ROLES){
  role.configPath=await confined(pkg,role.config);check(digest(await bytes(role.configPath))===role.configSHA,'CONFIG_PIN');
  const c=await json(role.configPath);role.configData=c;
  const dir=join(pkg,'runtime',role.role);
  check(JSON.stringify((await readdir(dir)).sort())===JSON.stringify([role.main,'academy-existing-feature-common.mjs'].sort()),'MODULE_DIRECTORY');
  check(digest(await bytes(join(dir,role.main)))===role.mainSHA&&digest(await bytes(join(dir,'academy-existing-feature-common.mjs')))===COMMON,'ROLE_COMMON_PIN');
  check(c.account_id===ACCOUNT&&c.name===role.name&&c.keep_vars===true&&c.no_bundle===true&&c.find_additional_modules===true&&c.preserve_file_names===true,'CONFIG_SCOPE');
  check(resolve(dirname(role.configPath),c.main)===join(dir,role.main)&&resolve(dirname(role.configPath),c.base_dir)===dir,'MODULE_RESOLUTION');
  check(JSON.stringify(c.migrations)==='[{"tag":"'+TAG+'"}]'&&!Object.hasOwn(c,'exports'),'NO_LIFECYCLE_ACTIONS');
  check(c.rules.length===1&&c.rules[0].type==='ESModule'&&JSON.stringify(c.rules[0].globs)==='["academy-existing-feature-common.mjs"]','MODULE_RULE');
  check(c.vars.AI_ENABLED==='0'&&c.vars.JWT_V110_PORTABLE_AI==='OFF'&&c.vars.JWT_V110_PORTABLE_PROVIDERS==='OFF'&&c.vars.JWT_V110_PORTABLE_TRANSCRIPTION==='OFF'&&c.vars.JWT_V110_PORTABLE_SCHEDULES==='OFF'&&c.vars.JWT_V110_ROOT_ONLY_CHILD_DELIVERY==='OFF','AI_CHILD_OFF');
  check(!Object.hasOwn(c.vars,'JWT_V110_NATIVE_RUN_ID')&&!Object.hasOwn(c.vars,'JWT_V110_OBJECT_NAMESPACE'),'NO_OPAQUE_PUBLIC_VARS');
  if(role.role==='api')check(resolve(dirname(role.configPath),c.assets.directory)===join(pkg,'public')&&c.assets.binding==='ASSETS'&&c.assets.html_handling==='none'&&c.assets.not_found_handling==='none','NON_SOURCE_ASSETS');
 }
 for(const root of [repo,pkg,join(pkg,'configs')])for(const n of ['.env','.dev.vars','.env.feature','.dev.vars.feature']){
  try{await lstat(join(root,n));fail('DOTENV_REFUSED');}catch(e){if(e.publicCode)throw e;if(e.code!=='ENOENT')throw e;}
 }
 const lock=await json(join(repo,'backend/package-lock.json'),10485760);
 check(lock.packages?.['node_modules/wrangler']?.version==='4.136.3'&&lock.packages?.['node_modules/esbuild']?.version==='0.28.1','LOCK_TOOL_PIN');
 check((await json(join(repo,'backend/node_modules/wrangler/package.json'))).version==='4.136.3','INSTALLED_TOOL_PIN');
 report.packageFilesVerified=1850;report.packagePhysicalFilesVerified=1851;report.publicAssetsVerified=104;report.commonSHA256=COMMON;report.packageManifestSHA256=manifestSHA;
}
async function metadataPreflight(){
 const opaque=[];
 for(const role of ROLES){const settings=await cfGet(role,'settings');opaque.push(bindingChecks(settings.bindings,role));await active(role,role.baseline);const v=await cfGet(role,'versions/'+role.baseline);lifecycle(v,role);}
 check(opaque[0].run===opaque[1].run&&opaque[0].namespace===opaque[1].namespace,'OPAQUE_PAIR_DIFFERENCE');
 nativeBaseline=opaque[0];report.privateNativeSelectionEqualAndShapeValid=true;
}
async function cli(role,command,version){
 const machine=join(raw,role.role+'-'+command+'.ndjson'),outdir=join(raw,role.role+'-'+command+'-out');
 const args=[join(repo,'backend/node_modules/wrangler/bin/wrangler.js'),'versions',command];
 if(command==='upload')args.push('--config',role.configPath,'--name',role.name,'--no-bundle','--keep-vars','--strict','--outdir',outdir,'--tag','af-'+manifestSHA.slice(0,16),'--message','Academy Feature package '+manifestSHA+' source '+process.env.GITHUB_SHA+' role '+role.role);
 else{check(command==='deploy'&&UUID.test(version),'ACTIVATION_VERSION');args.push(version+'@100%','--config',role.configPath,'--name',role.name,'--yes','--message','Root-gated Academy Feature '+manifestSHA);}
 const env={};
 for(const k of ['PATH','HOME','USERPROFILE','SYSTEMROOT','TMPDIR','TEMP','TMP','RUNNER_TEMP','SSL_CERT_FILE','NODE_EXTRA_CA_CERTS','HTTP_PROXY','HTTPS_PROXY','NO_PROXY'])if(process.env[k])env[k]=process.env[k];
 Object.assign(env,{CLOUDFLARE_API_TOKEN:process.env.CLOUDFLARE_API_TOKEN,CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CI:'true',NO_COLOR:'1',WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false',WRANGLER_OUTPUT_FILE_PATH:machine});
 report.CLIInvocations++;check(report.CLIInvocations<=2,'CLI_BUDGET');
 await new Promise((resolvePromise,reject)=>{
  let child,exited=false,closed=false,bytesSeen=0,problem=null,killTimer,closeTimer;
  const stop=code=>{problem??=code;if(!exited&&!closed){child.kill('SIGTERM');killTimer??=setTimeout(()=>{if(!exited&&!closed)child.kill('SIGKILL');},5000);}};
  try{child=spawn(process.execPath,args,{cwd:raw,env,stdio:['ignore','pipe','pipe'],shell:false});}catch{return reject(Object.assign(Error(),{publicCode:'CLI_SPAWN'}));}
  const deadline=setTimeout(()=>stop('CLI_TIMEOUT_UNCONFIRMED_NO_RETRY'),150000);
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{bytesSeen+=chunk.length;if(bytesSeen>524288)stop('CLI_OUTPUT_CAP_UNCONFIRMED_NO_RETRY');});
  child.once('error',()=>{clearTimeout(deadline);clearTimeout(killTimer);clearTimeout(closeTimer);reject(Object.assign(Error(),{publicCode:'CLI_SPAWN'}));});
  child.once('exit',()=>{exited=true;clearTimeout(deadline);clearTimeout(killTimer);closeTimer=setTimeout(()=>{if(!closed){child.stdout.destroy();child.stderr.destroy();reject(Object.assign(Error(),{publicCode:'CLI_PIPE_CLOSE_UNCONFIRMED_NO_RETRY'}));}},5000);});
  child.once('close',(code,signal)=>{closed=true;clearTimeout(deadline);clearTimeout(killTimer);clearTimeout(closeTimer);if(problem||code!==0||signal)reject(Object.assign(Error(),{publicCode:problem||'CLI_FAILED_UNCONFIRMED_NO_RETRY'}));else resolvePromise();});
 });
 if(command==='upload'){
  const data=(await bytes(machine,262144)).toString().trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const records=data.filter(x=>x.type==='version-upload'&&x.worker_name===role.name);
  check(records.length===1&&UUID.test(records[0].version_id),'UPLOAD_ID_UNCONFIRMED_NO_RETRY');return records[0].version_id;
 }
}
async function checkedUploadedVersion(role,id,sourceSHA){
 const v=await cfGet(role,'versions/'+id);check(v.id===id,'UPLOADED_VERSION_ID');lifecycle(v,role);
 check(v.annotations?.['workers/tag']==='af-'+manifestSHA.slice(0,16)&&v.annotations?.['workers/message']==='Academy Feature package '+manifestSHA+' source '+sourceSHA+' role '+role.role,'UPLOADED_SOURCE_ANNOTATION');
 const opaque=bindingChecks(v.resources?.bindings,role);
 check(nativeBaseline&&opaque.run===nativeBaseline.run&&opaque.namespace===nativeBaseline.namespace,'OPAQUE_NATIVE_VALUES_CHANGED');
 for(const [name,value] of Object.entries(role.configData.vars))check(v.resources.bindings.find(x=>x.name===name)?.text===value,'UPLOADED_PUBLIC_CONFIGURATION');
 return opaque;
}
async function journalGate(){
 check(HEX64.test(inputs.journal_receipt_sha256||''),'ROOT_JOURNAL_GATE_REQUIRED');
 const p=join(repo,'deployment/academy-existing-feature/JOURNAL-READY.json'),b=await bytes(p,65536);
 check(digest(b)===inputs.journal_receipt_sha256,'ROOT_JOURNAL_GATE_PIN');const j=JSON.parse(b);
 const a=j.actualSchemaReadback;
 check(j.schema==='ACADEMY_FEATURE_ROOT_JOURNAL_GATE_V1'&&j.status==='PASS'&&j.humanApprovalVerified===true&&j.sqlSHA256===SQL_PIN&&j.target?.accountId===ACCOUNT&&j.target?.coreId===CORE&&j.nativeStatePreserved===true&&j.noResetOrReseed===true,'ROOT_JOURNAL_GATE_REQUIRED');
 check(a?.status==='PASS_TEN_APPROVED_OBJECTS_CREATED_AND_READ_BACK'&&a.DDLStatementsConfirmed===10&&a.readbackAllTenExact===true&&a.objects?.length===10,'ROOT_ACTUAL_SCHEMA_READBACK_REQUIRED');
 check(OBJECTS.every(([name,type])=>a.objects.some(x=>x.name===name&&x.type===type&&x.presentAfter===true&&x.typeMatches===true&&x.exactWhitespaceNormalizedDefinition===true)),'ROOT_EXACT_TEN_OBJECTS');
 report.journalApprovalAndActualReadbackVerified=true;
}
async function main(){
 check(process.platform==='linux'&&process.versions.node==='24.22.1','RUNTIME');
 check(process.env.GITHUB_REPOSITORY==='MaktabForlife/Academy'&&process.env.GITHUB_REF==='refs/heads/feature-preview'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.FEATURE_DEPLOYMENT_ENABLED==='true','CONTEXT');
 check(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH,'NODE_INJECTION');
 repo=await realpath(process.env.GITHUB_WORKSPACE);pkg=join(repo,'release/academy-existing-feature');
 const event=await json(process.env.GITHUB_EVENT_PATH,1048576);inputs=event.inputs||{};stage=inputs.modern_stage;runId=process.env.GITHUB_RUN_ID;
 check(['upload','activate'].includes(stage)&&!['true',true].includes(inputs.credential_preflight)&&HEX40.test(inputs.expected_sha||'')&&inputs.expected_sha===process.env.GITHUB_SHA&&/^[1-9][0-9]+$/.test(runId||''),'CONTEXT');
 check(process.env.CLOUDFLARE_API_TOKEN,'MISSING_CREDENTIAL');
 report.stage=stage;report.sourceSHA=process.env.GITHUB_SHA;report.runId=runId;
 out=join(process.env.RUNNER_TEMP,'academy-feature-release-evidence');raw=join(process.env.RUNNER_TEMP,'academy-feature-release-private');
 await mkdir(out,{mode:0o700});await mkdir(raw,{mode:0o700});
 runnerSHA=digest(await bytes(self));workflowSHA=digest(await bytes(join(repo,'.github/workflows/feature-jwt-release.yml')));
 await packageChecks();
 let staged;
 if(stage==='activate'){
  await journalGate();
  const input=join(process.env.RUNNER_TEMP,'academy-feature-staged-input/staged.json'),b=await bytes(input,65536);
  check(HEX64.test(inputs.upload_receipt_sha256||'')&&digest(b)===inputs.upload_receipt_sha256,'UPLOAD_RECEIPT_PIN');staged=JSON.parse(b);
  check(staged.schema==='ACADEMY_FEATURE_STAGED_VERSIONS_V1'&&staged.status==='STAGED_TWO_VERSIONS_NOT_ACTIVATED'&&staged.manifestSHA256===manifestSHA&&staged.runnerSHA256===runnerSHA&&staged.workflowSHA256===workflowSHA&&staged.runId===inputs.upload_run_id&&HEX40.test(staged.sourceSHA||''),'UPLOAD_RECEIPT_CONTEXT');
  const run=await githubRun(staged.runId);
  check(run.workflow_id===409340312&&run.event==='workflow_dispatch'&&run.head_branch==='feature-preview'&&run.head_sha===staged.sourceSHA&&run.status==='completed'&&run.conclusion==='success','UPLOAD_RUN_ATTESTATION');
  check(staged.versions?.length===2&&ROLES.every(r=>staged.versions.some(v=>v.name===r.name&&UUID.test(v.id))),'STAGED_VERSION_PAIR');
 }
 await metadataPreflight();
 if(stage==='upload'){
  const opaque=[];
  for(const role of ROLES){const id=await cli(role,'upload');report.stagedVersions.push({name:role.name,id});opaque.push(await checkedUploadedVersion(role,id,process.env.GITHUB_SHA));}
  check(opaque[0].run===opaque[1].run&&opaque[0].namespace===opaque[1].namespace,'UPLOADED_OPAQUE_PAIR_DIFFERENCE');
  for(const role of ROLES)await active(role,role.baseline);
  await packageChecks();
  staged={schema:'ACADEMY_FEATURE_STAGED_VERSIONS_V1',status:'STAGED_TWO_VERSIONS_NOT_ACTIVATED',manifestSHA256:manifestSHA,sourceSHA:process.env.GITHUB_SHA,runId,runnerSHA256:runnerSHA,workflowSHA256:workflowSHA,versions:report.stagedVersions,AI:'OFF',activationPerformed:false};
  await writeFile(join(out,'staged.json'),JSON.stringify(staged,null,2)+'\n',{mode:0o600,flag:'wx'});
  report.status='PASS_STAGED_TWO_VERSIONS_NO_ACTIVATION';
 }else{
  const opaque=[];for(const role of ROLES){const v=staged.versions.find(x=>x.name===role.name);opaque.push(await checkedUploadedVersion(role,v.id,staged.sourceSHA));}
  check(opaque[0].run===opaque[1].run&&opaque[0].namespace===opaque[1].namespace,'STAGED_OPAQUE_PAIR_DIFFERENCE');
  await packageChecks();
  for(const role of ROLES){const id=staged.versions.find(v=>v.name===role.name).id;report.activationAttempts.push({name:role.name,id});await cli(role,'deploy',id);await active(role,id);}
  report.status='PASS_TWO_REVIEWED_VERSIONS_ACTIVE';report.nativeLoginRefreshLogoutAcceptance='NOT_RUN';
 }
}
try{await main();}catch(e){report.errorCategory=/^[A-Z][A-Z0-9_]{0,95}$/.test(e?.publicCode||'')?e.publicCode:'INTERNAL_STOP_NO_RETRY';process.exitCode=1;}
if(out){try{await writeFile(join(out,'sanitized.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});}catch{process.exitCode=1;report.errorCategory='SAFE_RECEIPT_WRITE_FAILED';}}
console.log(JSON.stringify(report));
