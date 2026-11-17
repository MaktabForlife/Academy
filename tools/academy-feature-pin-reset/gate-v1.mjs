import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const ORIGIN='https://maktabhelper.app',HOST='maktabhelper.app';
const MANIFEST='055eee5ec812cb034ab3d618276749b7cecccf9ec5e19caf9a03d770fa4bc91f';
const COMMON='0229b34114e9a4c0b130d44b5f5570cb7de09b53424a32f12856f5ba2706e3d4';
const ID='feature-test-admin',ACCOUNT='feature-synthetic-global';
const A='__Secure-uaa_a',R='__Host-uaa_r',HEX40=/^[a-f0-9]{40}$/,HEX64=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,RUN=/^[1-9][0-9]{0,19}$/;
const opaque=s=>typeof s==='string'&&/^[-A-Za-z0-9_]{43}$/.test(s);
const tuple=['accountId','sessionId','parentId','browserId','browserGeneration','credentialEpoch','securityVersion','unlockGeneration','originalSignedAtMs','originalExpiresAtMs','lastForegroundRefreshMs'];
const report={schema:'ACADEMY_FEATURE_PIN_RESET_GATE_SAFE_V1',status:'FAIL',AI:'OFF',productionAndLegacyTouched:false,SQLRequests:0,CFRequests:0,githubGETRequests:0,applicationRequests:0,assetRequests:0,http503Count:0,blockedRequests:0,accountChecks:0,loginPOSTs:0,refreshPOSTs:0,statuses:[],checks:{},privateValuesOrFingerprintsReported:false,browserClosed:false};
const fail=code=>{throw Object.assign(Error(code),{safeCode:code});};
const check=(ok,code)=>{if(!ok)fail(code);};
const sha=b=>createHash('sha256').update(b).digest('hex');
let inputs,temp,evidence,privateDir;

async function bytes(p,max=262144){
 const s=await lstat(p);
 check(s.isFile()&&!s.isSymbolicLink()&&s.size<=max,'FILE_SHAPE');
 return readFile(p);
}

async function json(p,max){
 try{return JSON.parse((await bytes(p,max)).toString('utf8'));}
 catch(e){if(e.safeCode)throw e;fail('JSON_SHAPE');}
}

async function directory(p){
 await mkdir(p,{recursive:true,mode:0o700});
 check(await realpath(p)===p,'DIRECTORY_SCOPE');
}

async function context(){
 check(process.platform==='linux'&&process.versions.node==='24.22.1','NODE_PIN');
 check(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&!process.env.NODE_DEBUG&&!process.env.DEBUG&&!process.env.PWDEBUG&&!process.env.DEBUG_FILE&&!process.env.CLOUDFLARE_API_TOKEN,'ENV_SCOPE');
 check(process.env.GITHUB_REPOSITORY==='MaktabForlife/Academy'&&process.env.GITHUB_REF==='refs/heads/feature-preview'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.FEATURE_DEPLOYMENT_ENABLED==='true','CI_SCOPE');
 inputs=(await json(process.env.GITHUB_EVENT_PATH,1048576)).inputs||{};
 check(inputs.modern_stage==='pin-reset'&&!['true',true].includes(inputs.credential_preflight)&&!['true',true].includes(inputs.check_only),'PIN_RESET_STAGE_ONLY');
 check(HEX40.test(inputs.expected_sha||'')&&inputs.expected_sha===process.env.GITHUB_SHA&&RUN.test(process.env.GITHUB_RUN_ID||''),'SOURCE_PIN');
 check(RUN.test(inputs.upload_run_id||'')&&HEX64.test(inputs.upload_receipt_sha256||'')&&HEX40.test(inputs.browser_activation_source_sha||'')&&UUID.test(inputs.browser_api_version||'')&&UUID.test(inputs.browser_coordinator_version||''),'ACTIVATION_INPUTS');
 check(inputs.package_manifest_sha256===MANIFEST,'PACKAGE_PIN');
 temp=await realpath(process.env.RUNNER_TEMP);
 evidence=join(temp,'academy-feature-pin-reset-evidence');
 privateDir=join(temp,'academy-feature-pin-reset-private');
 await directory(evidence);
 report.sourceSHA=process.env.GITHUB_SHA;
 report.runId=process.env.GITHUB_RUN_ID;
}

async function selectedReceipt(){
 const b=await bytes(join(temp,'academy-feature-pin-reset-activation/sanitized.json'),65536);
 check(sha(b)===inputs.upload_receipt_sha256,'ACTIVATION_RECEIPT_PIN');
 let r;
 try{r=JSON.parse(b.toString('utf8'));}
 catch{fail('ACTIVATION_RECEIPT_JSON');}
 check(r.schema==='ACADEMY_FEATURE_RELEASE_SAFE_RESULT_V1'&&r.stage==='activate'&&r.status==='PASS_TWO_REVIEWED_VERSIONS_ACTIVE'&&!r.errorCategory,'ACTIVATION_RECEIPT_STATUS');
 check(r.sourceSHA===inputs.browser_activation_source_sha&&r.runId===inputs.upload_run_id&&r.packageManifestSHA256===MANIFEST&&r.commonSHA256===COMMON&&r.AI==='OFF'&&r.childDelivery==='OFF','ACTIVATION_RECEIPT_CONTEXT');
 check(r.SQLRequests===0&&r.applicationRequests===0&&r.CLIInvocations===0&&r.activationTransport==='OFFICIAL_REST_EXPLICIT_VERSION'&&r.POSTRequests===2&&Array.isArray(r.POSTOutcomes)&&r.POSTOutcomes.length===2&&['coordinator','api'].every(role=>r.POSTOutcomes.some(p=>p.role===role&&p.operation==='deployment'&&p.confirmed===true&&p.apiSuccess===true&&Number.isInteger(p.HTTPStatus)&&p.HTTPStatus>=200&&p.HTTPStatus<300))&&r.journalApprovalAndActualReadbackVerified===true&&r.privateNativeSelectionEqualAndShapeValid===true&&r.nativeLoginRefreshLogoutAcceptance==='NOT_RUN','ACTIVATION_RECEIPT_GATES');
 check(Array.isArray(r.activationAttempts)&&r.activationAttempts.length===2&&r.activationAttempts.some(v=>v.name==='feature_worker'&&v.id===inputs.browser_api_version)&&r.activationAttempts.some(v=>v.name==='academy-feature-split-coordinator'&&v.id===inputs.browser_coordinator_version),'ACTIVATED_PAIR');
 report.activationSourceSHA=r.sourceSHA;
 report.activationRunId=r.runId;
 report.apiVersion=inputs.browser_api_version;
 report.coordinatorVersion=inputs.browser_coordinator_version;
 report.activationReceiptSHA256=inputs.upload_receipt_sha256;
 report.packageManifestSHA256=MANIFEST;
 return r;
}

async function github(path){
 check(process.env.GITHUB_TOKEN&&++report.githubGETRequests<=3,'GITHUB_CONTEXT');
 let r;
 try{
  r=await fetch('https://api.github.com/repos/MaktabForlife/Academy/'+path,{
   headers:{
    Authorization:'Bearer '+process.env.GITHUB_TOKEN,
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2026-03-10'
   },
   redirect:'error',
   signal:AbortSignal.timeout(20000)
  });
 }catch{fail('GITHUB_READ_FAILED');}
 check(r.ok,'GITHUB_READ_STATUS');
 const reader=r.body.getReader(),parts=[];
 let size=0;
 for(;;){
  const p=await reader.read();
  if(p.done)break;
  size+=p.value.byteLength;
  if(size>1048576){
   await reader.cancel();
   fail('GITHUB_READ_SIZE');
  }
  parts.push(p.value);
 }
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}
 catch{fail('GITHUB_READ_JSON');}
}

async function verify(){
 check(!process.env.FEATURE_TEST_ADMIN_PIN,'PIN_NOT_FOR_GATE');
 const receipt=await selectedReceipt();
 const run=await github('actions/runs/'+receipt.runId);
 check(run.workflow_id===409340312&&run.event==='workflow_dispatch'&&run.head_branch==='feature-preview'&&run.head_sha===receipt.sourceSHA&&run.status==='completed'&&run.conclusion==='success','ACTIVATION_RUN_ATTESTATION');
 const commit=await github('commits/'+process.env.GITHUB_SHA);
 check(commit.sha===process.env.GITHUB_SHA&&commit.parents?.length===1,'ONE_LINEAR_PARENT_REQUIRED');
 if(commit.parents[0].sha!==receipt.sourceSHA){
  const comparison=await github('compare/'+receipt.sourceSHA+'...'+process.env.GITHUB_SHA);
  const allowed=new Set(['.github/workflows/feature-jwt-release.yml','tools/academy-feature-browser/acceptance-v1.mjs','tools/academy-feature-browser/package.json','tools/academy-feature-browser/package-lock.json','tools/academy-feature-browser/SOURCE-REVIEW.json','tools/academy-feature-browser/protocol-v1.mjs','tools/academy-feature-pin-reset/gate-v1.mjs','tools/academy-feature-pin-reset/reset-v1.mjs','tools/academy-feature-pin-reset/DELIVERY-PUBLIC.pem']);
  check(comparison.status==='ahead'&&comparison.behind_by===0&&comparison.ahead_by>=1&&comparison.ahead_by<=6&&comparison.base_commit?.sha===receipt.sourceSHA&&comparison.merge_base_commit?.sha===receipt.sourceSHA,'ACTIVATED_SOURCE_ANCESTRY');
  check(comparison.commits?.length===comparison.ahead_by&&comparison.files?.length>0&&comparison.files.length<=allowed.size&&comparison.files.every(f=>allowed.has(f.filename)&&['added','modified'].includes(f.status)&&!f.previous_filename),'SCOPED_MAINTENANCE_SOURCE_DELTA');
  let parent=receipt.sourceSHA;
  for(const c of comparison.commits){check(c.parents?.length===1&&c.parents[0].sha===parent,'LINEAR_SCOPED_COMMITS');parent=c.sha;}
  check(parent===process.env.GITHUB_SHA,'TEST_ONLY_HEAD');
  report.testOnlyDescendantCommits=comparison.ahead_by;
 }
 await directory(privateDir);
 await writeFile(join(privateDir,'gate.json'),JSON.stringify({
  schema:'ACADEMY_FEATURE_BROWSER_GATE_V1',
  sourceSHA:process.env.GITHUB_SHA,
  activationReceiptSHA256:inputs.upload_receipt_sha256,
  activationSourceSHA:receipt.sourceSHA,
  runAttested:true,
  oneParentAttested:true
 })+'\n',{mode:0o600,flag:'wx'});
 report.status='PASS_RECEIPT_AND_ONE_PARENT_GATE_ONLY';
}


try{await context();if(process.argv[2]==='verify')await verify();else {check(process.argv[2]==='inputs','MODE');report.status='PASS_PIN_RESET_INPUTS_ONLY';}}catch(e){report.status='FAIL';report.errorCategory=/^[A-Z][A-Z0-9_]{0,95}$/.test(e?.safeCode||'')?e.safeCode:'GATE_STOP';process.exitCode=1;}
if(evidence&&report.status==='FAIL')await writeFile(join(evidence,'sanitized.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify(report));
