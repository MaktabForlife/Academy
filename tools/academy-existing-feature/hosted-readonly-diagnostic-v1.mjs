// Read-only diagnostic for the exact first coordinator CLI preflight branch.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const A='c9a3e355b3d7a795880b1d36a1dbe123',NAME='academy-feature-split-coordinator';
const PKG='547622ada94067ea058c2158fcd0378f86c1b85701d2e01af95275f238364d97';
const CFG='90a2e61b6c4e32e22c7f1b672d8d9bcb1fe75e51a1bf562bd062f99e17c42d70';
const root='/accounts/'+A+'/workers/';
const paths={
 service:root+'services/'+NAME,
 bindings:root+'services/'+NAME+'/environments/production/bindings',
 routes:root+'services/'+NAME+'/environments/production/routes?show_zonename=true',
 domains:root+'domains/records?page=0&per_page=5&service='+NAME+'&environment=production',
 subdomain:root+'services/'+NAME+'/environments/production/subdomain',
 environment:root+'services/'+NAME+'/environments/production',
 schedules:root+'scripts/'+NAME+'/schedules'
};
const report={schema:'ACADEMY_FEATURE_SAME_CI_TOKEN_READONLY_DIAGNOSTIC_V1',status:'FAIL',GETRequests:0,mutations:0,SQLRequests:0,applicationRequests:0,CLIInvocations:0,SDKOrAppExecuted:false,AI:'OFF',secretValuesOrFingerprintsReported:false,steps:[]};
const fail=code=>{throw Object.assign(Error(code),{safeCode:code});};
const require=(v,code)=>{if(!v)fail(code);};
const hash=b=>createHash('sha256').update(b).digest('hex');
async function get(key){
 require(Object.hasOwn(paths,key)&&++report.GETRequests<=8,'PATH_OR_BUDGET');
 const step={id:key};report.steps.push(step);
 let response;
 try{response=await fetch('https://api.cloudflare.com/client/v4'+paths[key],{method:'GET',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{step.category='NETWORK_OR_REDIRECT';fail('METADATA_NETWORK');}
 step.HTTPStatus=response.status;
 const chunks=[];let bytes=0;const reader=response.body.getReader();
 for(;;){const x=await reader.read();if(x.done)break;bytes+=x.value.byteLength;if(bytes>2097152){await reader.cancel();step.category='RESPONSE_TOO_LARGE';fail('METADATA_SIZE');}chunks.push(x.value);}
 let body;
 try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{step.category='NON_JSON_RESPONSE';fail('METADATA_NON_JSON');}
 step.apiSuccess=body.success===true;
 step.errorCodes=Array.isArray(body.errors)?body.errors.map(x=>x.code).filter(x=>Number.isSafeInteger(x)&&x>=0&&x<10000000).slice(0,8):[];
 if(!response.ok||body.success!==true){step.category=key==='service'?'SERVICE_METADATA_HTTP_OR_API_FAILURE':'DASH_METADATA_HTTP_OR_API_FAILURE';fail(step.category);}
 step.category='READ_SUCCESS';return body.result;
}
function array(v){require(Array.isArray(v),'DASH_METADATA_SHAPE');return v;}
async function main(){
 require(process.platform==='linux'&&process.versions.node==='24.22.1','RUNTIME');
 require(process.env.GITHUB_REPOSITORY==='MaktabForlife/Academy'&&process.env.GITHUB_REF==='refs/heads/feature-preview'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.FEATURE_DEPLOYMENT_ENABLED==='true'&&!process.env.NODE_OPTIONS&&!process.env.NODE_PATH,'CONTEXT');
 const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8')),i=event.inputs||{};
 require(i.modern_stage==='diagnose'&&/^[a-f0-9]{40}$/.test(i.expected_sha||'')&&i.expected_sha===process.env.GITHUB_SHA&&!['true',true].includes(i.credential_preflight)&&i.package_manifest_sha256===PKG,'INPUT_CONTEXT');
 require(process.env.CLOUDFLARE_API_TOKEN&&process.env.RUNNER_TEMP&&process.env.GITHUB_WORKSPACE,'MISSING_CONTEXT_OR_CREDENTIAL');
 report.sourceSHA=process.env.GITHUB_SHA;report.runId=process.env.GITHUB_RUN_ID;
 const packageDir=join(process.env.GITHUB_WORKSPACE,'release/academy-existing-feature');
 require(hash(await readFile(join(packageDir,'CANDIDATE-MANIFEST.json')))===PKG,'PACKAGE_PIN');
 const configBytes=await readFile(join(packageDir,'configs/academy-feature-split-coordinator.wrangler.jsonc'));require(hash(configBytes)===CFG,'CONFIG_PIN');const cfg=JSON.parse(configBytes);
 const service=await get('service'),script=service?.default_environment?.script;
 require(script&&typeof script==='object','SERVICE_METADATA_SHAPE');
 const from=script.last_deployed_from;
 report.lastDeployedFrom=['api','dash','wrangler'].includes(from)?from:'OTHER';
 report.sameCITokenCanReadService=true;report.workerWritePermissionExercised=false;
 if(from!=='dash'){
  report.preUploadBranch=from==='api'?'API_UPDATED_WORKER_CONFIRMATION':from==='wrangler'?'NORMAL_PREFLIGHT_CONTINUATION':'UNRECOGNIZED_DEPLOY_ORIGIN';
  report.strictOperatorConfirmationBranch=from==='api';
  report.nextMissingGate=from==='api'?'ROOT_REVIEW_PINNED_STRICT_NONINTERACTIVE_CONFIRMATION_POLICY':'NEXT_PINNED_PREFLIGHT_CHECK_NOT_EXERCISED';
  report.status='PASS_SERVICE_READ_BRANCH_REPORTED';return;
 }
 require(service.default_environment.environment==='production','UNEXPECTED_DEFAULT_ENVIRONMENT');
 // These six GET routes exactly mirror pinned fetchWorkerConfig, restricted to this Feature service.
 // "production" here is the platform default environment of this fixed Feature Worker, not a production Worker.
 const bindings=array(await get('bindings')),routes=array(await get('routes'));
 const domainsResult=await get('domains'),domains=Array.isArray(domainsResult)?domainsResult:array(domainsResult?.domains);
 const subdomain=await get('subdomain'),environment=await get('environment'),scheduleResult=await get('schedules');
 const schedules=array(scheduleResult?.schedules),remote=environment?.script;require(remote&&typeof remote==='object','DASH_METADATA_SHAPE');
 const find=name=>bindings.find(b=>b.name===name);
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const varDiff={};for(const [name,value] of Object.entries(cfg.vars))varDiff[name]=find(name)?.text!==value;
 report.requiredConfigDifferences={
  compatibilityDate:remote.compatibility_date!==cfg.compatibility_date,
  compatibilityFlags:!same([...(remote.compatibility_flags||[])].sort(),[...cfg.compatibility_flags].sort()),
  migrationTag:remote.migration_tag!=='jwt-feature-fresh-20261106a',
  routeCount:routes.length!==(cfg.routes||[]).length,
  customDomainCount:domains.length!==0,
  workersDev:subdomain?.enabled!==cfg.workers_dev,
  previewURLs:subdomain?.previews_enabled!==cfg.preview_urls,
  scheduleCount:schedules.length!==(cfg.triggers?.crons||[]).length,
  exactJWTPair:bindings.filter(b=>b.type==='d1').length!==2||find('JWT_V110_CORE_DB')?.id!=='cdbe97bc-f3d9-400e-8806-ed9a0d143d26'||find('JWT_V110_ADMIN_DB')?.id!=='ed77f2a7-4439-4841-8691-2b41063d8960',
  exactSplitNamespace:find('JWT_V110_SPLIT_COORDINATOR')?.namespace_id!=='de95f15f19a54a9e9ba34e6e75f51847',
  nonSecretSelectedVars:varDiff
 };
 report.counts={bindings:bindings.length,routes:routes.length,customDomainsFirstPage:domains.length,schedules:schedules.length};
 report.domainPageMayBeIncomplete=domains.length===5;
 report.fullWranglerStrictDiffReimplemented=false;
 report.nextMissingGate='ROOT_REVIEW_REQUIRED_CONFIG_DIFF_AND_STRICT_POLICY';
 report.status='PASS_DASH_READONLY_REQUIRED_DIFF_REPORTED';
}
try{await main();}catch(e){report.errorCategory=/^[A-Z][A-Z0-9_]{0,80}$/.test(e?.safeCode||'')?e.safeCode:'INTERNAL_METADATA_STOP';process.exitCode=1;}
if(process.env.RUNNER_TEMP){
 const out=join(process.env.RUNNER_TEMP,'academy-feature-hosted-diagnostic');
 try{await mkdir(out,{mode:0o700});await writeFile(join(out,'sanitized.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});}catch{process.exitCode=1;report.errorCategory='SAFE_OUTPUT_WRITE_FAILED';}
}
console.log(JSON.stringify(report));
