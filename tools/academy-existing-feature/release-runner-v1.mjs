// SOURCE CANDIDATE ONLY. Root must review and select publication and execution separately.
import {readFile,writeFile,mkdir,readdir,lstat,realpath} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {extname} from 'node:path';
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
const report={schema:'ACADEMY_FEATURE_RELEASE_SAFE_RESULT_V1',status:'FAIL',AI:'OFF',childDelivery:'OFF',SQLRequests:0,applicationRequests:0,wrapperMetadataGETRequests:0,githubGETRequests:0,CLIInvocations:0,stagedVersions:[],activationAttempts:[],secretValuesOrFingerprintsReported:false,wrapperAutomaticRetry:false,uploadTransport:'OFFICIAL_REST_MULTIPART',activationTransport:'OFFICIAL_REST_EXPLICIT_VERSION',POSTRequests:0,POSTOutcomes:[],automaticPOSTRetry:false,requestBudgets:{metadataGET:12,versionPOST:2,assetSessionPOST:1,assetFilePOST:103,deploymentPOST:2}};
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
 check(ROLES.includes(role)&&(/^(settings|deployments|versions\/[a-f0-9-]{36})$/.test(suffix)||suffix==='versions?page=1&per_page=100'),'CF_PATH');
 check(++report.wrapperMetadataGETRequests<=12,'METADATA_BUDGET');
 let response;try{response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/workers/scripts/'+role.name+'/'+suffix,{method:'GET',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('METADATA_NETWORK');}
 const d=await boundedJSONResponse(response,2097152);check(d.success===true,'METADATA_RESPONSE');if(suffix==='versions?page=1&per_page=100')return {items:d.result?.items,resultInfo:d.result_info};return d.result;
}
async function githubRun(id){
 check(/^[1-9][0-9]{0,19}$/.test(id)&&process.env.GITHUB_TOKEN,'UPLOAD_RUN_CONTEXT');
 report.githubGETRequests++;check(report.githubGETRequests<=1,'GITHUB_BUDGET');
 let response;try{response=await fetch('https://api.github.com/repos/MaktabForlife/Academy/actions/runs/'+id,{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('UPLOAD_RUN_NETWORK');}
 return boundedJSONResponse(response,1048576);
}
function d1Id(binding){
 check(binding&&binding.type==='d1','D1_BINDING_TYPE');
 if(binding.id!==undefined&&binding.database_id!==undefined)check(binding.id===binding.database_id,'D1_ID_ALIAS_CONFLICT');
 return binding.database_id??binding.id;
}
function secretNamesAndTypes(bindings){
 const selected=bindings.filter(b=>b.type==='secret_text'||b.type==='secret_key').map(b=>({name:b.name,type:b.type}));
 check(selected.every(b=>typeof b.name==='string'&&b.name.length>0)&&new Set(selected.map(b=>b.name)).size===selected.length,'SECRET_BINDING_SHAPE');
 return selected.sort((a,b)=>a.name.localeCompare(b.name)||a.type.localeCompare(b.type));
}
async function latestUploaded(role,expected){
 check(UUID.test(expected),'LATEST_EXPECTED_ID');
 const d=await cfGet(role,'versions?page=1&per_page=100'),items=d.items,info=d.resultInfo;
 check(Array.isArray(items)&&items.length>0&&items.length<100,'LATEST_LIST_COMPLETE_REQUIRED');
 check(items.every(v=>UUID.test(v.id||'')&&Number.isSafeInteger(v.number)&&v.number>0&&Number.isFinite(Date.parse(v.metadata?.created_on||''))),'LATEST_LIST_SHAPE');
 check(new Set(items.map(v=>v.id)).size===items.length&&new Set(items.map(v=>v.number)).size===items.length,'LATEST_LIST_DUPLICATE');
 // One requested page of 100; a short page is complete under the documented pagination contract.
 // If the response supplies pagination metadata, require it to confirm that same complete page.
 if(info!==undefined){
  check(info&&info.page===1&&info.per_page===100&&info.count===items.length&&info.total_count===items.length,'LATEST_PAGINATION_UNCONFIRMED');
  if(info.total_pages!==undefined)check(info.total_pages===1,'LATEST_PAGINATION_UNCONFIRMED');
 }
 const latest=items.reduce((a,b)=>a.number>b.number?a:b),newestTime=Math.max(...items.map(v=>Date.parse(v.metadata.created_on)));
 check(Date.parse(latest.metadata.created_on)===newestTime&&latest.id===expected,'LATEST_UPLOADED_VERSION_DRIFT');
 report.latestUploadedVersionGuards??=[];report.latestUploadedVersionGuards.push({role:role.role,stage,expectedId:expected,latestId:latest.id,completeFirstPageCount:items.length,requestedPageSize:100,paginationMetadataConfirmed:info!==undefined,sequentialNumberAndCreatedTimeAgree:true});
}
function bindingChecks(bindings,role){
 check(Array.isArray(bindings),'BINDING_SHAPE');const find=n=>bindings.find(x=>x.name===n);
 check(!['ACADEMY_DB','ACADEMY_ADMIN_DB','ACADEMY_SPLIT_COORDINATOR','PROGRAM_TIMETABLE_COORDINATOR'].some(n=>find(n)),'NO_ORDINARY_BINDINGS');
 const dos=bindings.filter(x=>x.type==='durable_object_namespace');check(dos.length===(role.role==='api'?2:1),'DO_BINDING_COUNT');
 const d1=bindings.filter(x=>x.type==='d1');
 check(d1.length===2&&d1Id(find('JWT_V110_CORE_DB'))===CORE&&d1Id(find('JWT_V110_ADMIN_DB'))===ADMIN,'JWT_PAIR');
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
 check(lock.packages?.['node_modules/blake3-wasm']?.version==='2.1.5'&&(await json(join(repo,'backend/node_modules/blake3-wasm/package.json'))).version==='2.1.5','ASSET_HASH_DEPENDENCY_PIN');
 report.packageFilesVerified=1850;report.packagePhysicalFilesVerified=1851;report.publicAssetsVerified=104;report.commonSHA256=COMMON;report.packageManifestSHA256=manifestSHA;
}
async function metadataPreflight(){
 const opaque=[];
 for(const role of ROLES){const settings=await cfGet(role,'settings');opaque.push(bindingChecks(settings.bindings,role));role.privateSecretBindings=secretNamesAndTypes(settings.bindings);await active(role,role.baseline);const v=await cfGet(role,'versions/'+role.baseline);lifecycle(v,role);}
 check(opaque[0].run===opaque[1].run&&opaque[0].namespace===opaque[1].namespace,'OPAQUE_PAIR_DIFFERENCE');
 nativeBaseline=opaque[0];report.privateNativeSelectionEqualAndShapeValid=true;
}
// Fixed-account/version API only. No route/domain/settings/schedule/resource-creation endpoints.
const postCounts={versions:0,assetsSession:0,assetsBulk:0,assetsSingle:0,deployment:0};
function jwtShape(value){return typeof value==='string'&&value.length>16&&value.length<=16384&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);}
async function post(role,operation,body,assetToken=null,assetHash=null){
 check(ROLES.includes(role),'POST_ROLE');
 let suffix,headers={Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN};
 if(operation==='versions'){
  check(stage==='upload'&&++postCounts.versions<=2,'VERSION_POST_BUDGET');
  suffix='/workers/scripts/'+role.name+'/versions?bindings_inherit=strict';
 }else if(operation==='assetsSession'){
  check(stage==='upload'&&role.role==='api'&&++postCounts.assetsSession===1,'ASSET_SESSION_BUDGET');
  suffix='/workers/scripts/feature_worker/assets-upload-session';headers['Content-Type']='application/json';
 }else if(operation==='assetsBulk'||operation==='assetsSingle'){
  check(stage==='upload'&&role.role==='api'&&jwtShape(assetToken),'ASSET_POST_CONTEXT');
  postCounts[operation]++;check(postCounts.assetsBulk+postCounts.assetsSingle<=103,'ASSET_POST_BUDGET');
  headers={Authorization:'Bearer '+assetToken};
  if(operation==='assetsBulk')suffix='/workers/assets/upload?base64=true';
  else {check(/^[a-f0-9]{32}$/.test(assetHash||'')&&body instanceof Blob,'ASSET_HASH');suffix='/workers/assets/upload/'+assetHash;headers['Content-Type']=body.type;}
 }else{
  check(operation==='deployment'&&stage==='activate'&&++postCounts.deployment<=2,'DEPLOYMENT_POST_BUDGET');
  suffix='/workers/scripts/'+role.name+'/deployments';headers['Content-Type']='application/json';
 }
 const outcome={role:role.role,operation,HTTPStatus:null,apiSuccess:null,errorCodes:[],confirmed:false};
 report.POSTOutcomes.push(outcome);report.POSTRequests++;
 let response;
 try{response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+suffix,{method:'POST',headers,body,redirect:'error',signal:AbortSignal.timeout(60000)});}
 catch{fail('POST_NETWORK_UNCONFIRMED_NO_RETRY');}
 outcome.HTTPStatus=response.status;
 let d;
 try{
  check(response.body,'POST_EMPTY_BODY_UNCONFIRMED_NO_RETRY');
  const reader=response.body.getReader();let size=0;const chunks=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2097152){await reader.cancel();fail('POST_SIZE_UNCONFIRMED_NO_RETRY');}chunks.push(value);}
  try{d=JSON.parse(Buffer.concat(chunks).toString());}catch{fail('POST_JSON_UNCONFIRMED_NO_RETRY');}
 }catch(e){if(e.publicCode)throw e;fail('POST_READ_UNCONFIRMED_NO_RETRY');}
 outcome.apiSuccess=d?.success===true;
 outcome.errorCodes=Array.isArray(d?.errors)?[...new Set(d.errors.map(x=>x?.code).filter(x=>Number.isInteger(x)&&x>=1000&&x<=9999999))].slice(0,8):[];
 check(response.ok&&d?.success===true&&d.result&&typeof d.result==='object','POST_API_FAILURE_NO_RETRY');
 outcome.confirmed=true;return d.result;
}
function uploadBindings(role){
 const c=role.configData,bindings=Object.entries(c.vars).map(([name,text])=>({name,type:'plain_text',text}));
 for(const d of c.d1_databases)bindings.push({name:d.binding,type:'d1',database_id:d.database_id});
 for(const d of c.durable_objects.bindings){
  const namespace_id=d.name==='JWT_V110_SPLIT_COORDINATOR'?SPLIT:d.name==='JWT_V110_TIMETABLE_COORDINATOR'?TIME:null;
  check(namespace_id,'UNREVIEWED_DO_BINDING');
  bindings.push({name:d.name,type:'durable_object_namespace',class_name:d.class_name,namespace_id,...d.script_name?{script_name:d.script_name}:{}});
 }
 for(const r of c.r2_buckets||[])bindings.push({name:r.binding,type:'r2_bucket',bucket_name:r.bucket_name});
 for(const r of c.ratelimits||[])bindings.push({name:r.name,type:'ratelimit',namespace_id:r.namespace_id,simple:r.simple});
 for(const name of ['JWT_V110_NATIVE_RUN_ID','JWT_V110_OBJECT_NAMESPACE'])bindings.push({name,type:'inherit'});
 if(role.role==='api')bindings.push({name:'ASSETS',type:'assets'});
 check(new Set(bindings.map(x=>x.name)).size===bindings.length,'DUPLICATE_UPLOAD_BINDINGS');
 return bindings;
}
const assetTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.ttf':'font/ttf'};
async function assets(role){
 check(role.role==='api','ASSET_ROLE');
 const root=join(pkg,'public'),paths=await walk(root);
 check(paths.length===104&&paths.includes('_headers')&&!paths.includes('_redirects')&&!paths.includes('.assetsignore'),'RESERVED_ASSET_SCOPE');
 const require=createRequire(join(repo,'backend/package.json')),blake=require('blake3-wasm');
 const manifest={},lookup=new Map();
 for(const path of paths){
  if(path==='_headers')continue;
  const ext=extname(path);check(Object.hasOwn(assetTypes,ext),'UNREVIEWED_ASSET_EXTENSION');
  const b=await bytes(await confined(root,path),26214400),hash=blake.hash(b.toString('base64')+ext.slice(1)).toString('hex').slice(0,32);
  check(/^[a-f0-9]{32}$/.test(hash),'ASSET_HASH_SHAPE');
  manifest['/'+path]={hash,size:b.length};
  const previous=lookup.get(hash);check(!previous||previous.bytes.equals(b),'ASSET_HASH_COLLISION');
  lookup.set(hash,{bytes:b,type:assetTypes[ext]});
 }
 check(Object.keys(manifest).length===103,'ASSET_MANIFEST_COUNT');
 report.assetManifestFileCount=103;report.assetMetadataFileCount=1;
 let session=await post(role,'assetsSession',JSON.stringify({manifest}));
 check(jwtShape(session.jwt)&&Array.isArray(session.buckets)&&session.buckets.length<=103,'ASSET_SESSION_SHAPE');
 const hashes=session.buckets.flat();
 check(hashes.length<=103&&new Set(hashes).size===hashes.length&&hashes.every(h=>typeof h==='string'&&lookup.has(h)),'ASSET_SESSION_REQUEST_SCOPE');
 check(session.buckets.every(b=>Array.isArray(b)&&b.length>0&&b.length<=103),'ASSET_BUCKET_SHAPE');
 let single=false;
 try{single=JSON.parse(Buffer.from(session.jwt.split('.')[1],'base64url').toString()).wrangler_single_asset_uploads===true;}catch{fail('ASSET_SESSION_MODE');}
 report.assetUploadMode=single?'PINNED_SINGLE_ASSET_RAW':'DOCUMENTED_BUCKET_BASE64';
 report.assetUploadRequestedFiles=hashes.length;report.assetFilesUploaded=0;
 const token=session.jwt;let completion=hashes.length===0?token:null;
 const buckets=single?hashes.map(h=>[h]):session.buckets;
 for(const bucket of buckets){
  let result;
  if(single){
   const h=bucket[0],f=lookup.get(h);result=await post(role,'assetsSingle',new Blob([f.bytes],{type:f.type}),token,h);
  }else{
   const form=new FormData();
   for(const h of bucket){const f=lookup.get(h);form.set(h,new File([f.bytes.toString('base64')],h,{type:f.type}),h);}
   result=await post(role,'assetsBulk',form,token);
  }
  report.assetFilesUploaded+=bucket.length;
  if(result.jwt!==undefined){check(jwtShape(result.jwt),'ASSET_COMPLETION_SHAPE');completion=result.jwt;}
 }
 check(jwtShape(completion),'ASSET_COMPLETION_REQUIRED');
 const headers=(await bytes(await confined(root,'_headers'),65536)).toString();
 return {jwt:completion,config:{html_handling:role.configData.assets.html_handling,not_found_handling:role.configData.assets.not_found_handling,run_worker_first:role.configData.assets.run_worker_first,_headers:headers}};
}
async function upload(role){
 const metadata={main_module:role.main,compatibility_date:role.configData.compatibility_date,compatibility_flags:role.configData.compatibility_flags,bindings:uploadBindings(role),keep_bindings:['plain_text','json','secret_text','secret_key'],annotations:{'workers/tag':'af-'+manifestSHA.slice(0,16),'workers/message':'Academy Feature package '+manifestSHA+' source '+process.env.GITHUB_SHA+' role '+role.role}};
 if(role.role==='api')metadata.assets=await assets(role);
 check(!Object.hasOwn(metadata,'exports')&&!Object.hasOwn(metadata,'migrations')&&!Object.hasOwn(metadata,'routes'),'NO_LIFECYCLE_OR_ROUTE_METADATA');
 const form=new FormData();form.set('metadata',JSON.stringify(metadata));
 for(const name of [role.main,'academy-existing-feature-common.mjs']){
  const b=await bytes(join(pkg,'runtime',role.role,name));form.set(name,new File([b],name,{type:'application/javascript+module'}),name);
 }
 await latestUploaded(role,role.baseline);
 const result=await post(role,'versions',form);
 check(UUID.test(result.id||''),'UPLOAD_ID_UNCONFIRMED_NO_RETRY');
 return result.id;
}
async function deploy(role,id){
 check(UUID.test(id),'DEPLOYMENT_VERSION');
 const body={strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Root-gated Academy Feature '+manifestSHA}};
 await latestUploaded(role,id);
 const result=await post(role,'deployment',JSON.stringify(body));
 check(UUID.test(result.id||''),'DEPLOYMENT_ID_UNCONFIRMED_NO_RETRY');
}
async function checkedUploadedVersion(role,id,sourceSHA){
 const v=await cfGet(role,'versions/'+id);check(v.id===id,'UPLOADED_VERSION_ID');lifecycle(v,role);
 check(v.annotations?.['workers/tag']==='af-'+manifestSHA.slice(0,16)&&v.annotations?.['workers/message']==='Academy Feature package '+manifestSHA+' source '+sourceSHA+' role '+role.role,'UPLOADED_SOURCE_ANNOTATION');
 const opaque=bindingChecks(v.resources?.bindings,role);
 check(Array.isArray(role.privateSecretBindings)&&JSON.stringify(secretNamesAndTypes(v.resources.bindings))===JSON.stringify(role.privateSecretBindings),'UPLOADED_SECRET_BINDING_NAMES_OR_TYPES_CHANGED');
 report.secretBindingNamesAndTypesPreserved=true;
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
  for(const role of ROLES){const id=await upload(role);report.stagedVersions.push({name:role.name,id});opaque.push(await checkedUploadedVersion(role,id,process.env.GITHUB_SHA));}
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
  for(const role of ROLES){const id=staged.versions.find(v=>v.name===role.name).id;report.activationAttempts.push({name:role.name,id});await deploy(role,id);await active(role,id);}
  report.status='PASS_TWO_REVIEWED_VERSIONS_ACTIVE';report.nativeLoginRefreshLogoutAcceptance='NOT_RUN';
 }
}
try{await main();}catch(e){report.errorCategory=/^[A-Z][A-Z0-9_]{0,95}$/.test(e?.publicCode||'')?e.publicCode:'INTERNAL_STOP_NO_RETRY';process.exitCode=1;}
if(out){try{await writeFile(join(out,'sanitized.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});}catch{process.exitCode=1;report.errorCategory='SAFE_RECEIPT_WRITE_FAILED';}}
console.log(JSON.stringify(report));
