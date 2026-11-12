// GET-only CI preflight; never invokes deployment, SQL or application endpoints.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const A='c9a3e355b3d7a795880b1d36a1dbe123';
const CORE='cdbe97bc-f3d9-400e-8806-ed9a0d143d26',ADMIN='ed77f2a7-4439-4841-8691-2b41063d8960';
const SPLIT='de95f15f19a54a9e9ba34e6e75f51847',TIME='ab05473998dc4e93b792464f9e78e0e9';
const report={schema:'ACADEMY_FEATURE_CI_CREDENTIAL_PREFLIGHT_V1',operation:'GET_METADATA_ONLY',mutations:0,applicationRequests:0,SQLRequests:0,secretValuesOrFingerprintsReported:false,workersWriteAccess:'NOT_EXERCISED',workers:[],databases:[]};
let count=0;
const codes=new Set(['CONTEXT','MISSING_CREDENTIAL','NETWORK','RESPONSE','TOKEN_IDENTITY','RESOURCE_MISMATCH']);
const fail=code=>{throw Object.assign(Error(code),{code});};
async function get(path,optional=false){
 if(!path.startsWith('/accounts/'+A+'/')&&!/^\/user\/tokens\/(?:verify|[a-f0-9]{32})$/.test(path))fail('CONTEXT');
 count++;
 let response;try{response=await fetch('https://api.cloudflare.com/client/v4'+path,{method:'GET',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('NETWORK');}
 let body;try{body=await response.json();}catch{if(optional)return {ok:false,http:response.status};fail('RESPONSE');}
 if(!response.ok||body.success!==true){if(optional)return {ok:false,http:response.status};report.lastMetadataHTTPStatus=response.status;fail('RESPONSE');}
 return {ok:true,value:body.result};
}
try{
 if(process.env.GITHUB_REPOSITORY!=='MaktabForlife/Academy'||process.env.GITHUB_REF!=='refs/heads/feature-preview'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||!process.env.GITHUB_EVENT_PATH||!process.env.RUNNER_TEMP)fail('CONTEXT');
 const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8')),inputs=event.inputs||{};
 if(!['true',true].includes(inputs.credential_preflight)||!/^[a-f0-9]{40}$/.test(inputs.expected_sha||'')||inputs.expected_sha!==process.env.GITHUB_SHA||!/^[a-f0-9]{32}$/.test(inputs.expected_token_id||''))fail('CONTEXT');
 report.sourceSHA=process.env.GITHUB_SHA;
 if(!process.env.CLOUDFLARE_API_TOKEN)fail('MISSING_CREDENTIAL');
 let token=await get('/accounts/'+A+'/tokens/verify',true),tokenBase='/accounts/'+A+'/tokens/';
 if(!token.ok){token=await get('/user/tokens/verify',true);tokenBase='/user/tokens/';}
 report.tokenActive=token.ok&&token.value?.status==='active';
 report.tokenMatchesReviewedMetadata=token.ok&&token.value?.id===inputs.expected_token_id;
 report.expiryMatchesReviewedDate=typeof token.value?.expires_on==='string'?token.value.expires_on.startsWith('2026-12-06'):null;
 if(!report.tokenActive||!report.tokenMatchesReviewedMetadata||report.expiryMatchesReviewedDate===false)fail('TOKEN_IDENTITY');
 // Token identifiers and full policy responses remain in memory, never logged or persisted.
 const policy=await get(tokenBase+token.value.id,true);
 report.policyMetadataReadable=policy.ok;
 report.declaredWorkerPermissionNames=policy.ok?[...new Set((policy.value?.policies||[]).flatMap(p=>p.effect==='allow'?(p.permission_groups||[]).map(g=>g.name).filter(n=>['Workers Scripts Write','Workers Admin','Workers Editor','Individual Workers Editor','Individual Workers Admin'].includes(n)):[]))]:[];
 for(const name of ['feature_worker','academy-feature-split-coordinator']){
  const settings=(await get('/accounts/'+A+'/workers/scripts/'+name+'/settings')).value,b=settings.bindings||[],find=n=>b.find(x=>x.name===n),split=find('JWT_V110_SPLIT_COORDINATOR'),time=find('JWT_V110_TIMETABLE_COORDINATOR');
  const pair=b.filter(x=>x.type==='d1').length===2&&find('JWT_V110_CORE_DB')?.id===CORE&&find('JWT_V110_ADMIN_DB')?.id===ADMIN;
  const splitOK=split?.class_name==='JWTFeatureAcademySplitCoordinator'&&split.namespace_id===SPLIT&&(name!=='feature_worker'||split.script_name==='academy-feature-split-coordinator');
  const timeOK=name!=='feature_worker'||time?.class_name==='JWTFeatureProgramTimetableCoordinator'&&time.namespace_id===TIME;
  const limit=(n,id,num)=>find(n)?.namespace_id===id&&find(n)?.simple?.limit===num&&find(n)?.simple?.period===60;
  const limitsOK=name!=='feature_worker'||limit('AUTH_LOGIN_RATE_LIMITER','100111',5)&&limit('JWT_V110_RATE_LIMITER','100112',10);
  const assetsOK=name!=='feature_worker'||find('ASSETS')?.type==='assets';
  const deployments=(await get('/accounts/'+A+'/workers/scripts/'+name+'/deployments')).value;
  report.workers.push({name,exactAccountReadable:true,exactJWTPair:pair,retainedSplitNamespace:splitOK,retainedTimetableNamespace:timeOK,retainedRateLimits:limitsOK,assetsPresent:assetsOK,compatibilityDate:settings.compatibility_date,activeVersions:(deployments.deployments?.[0]?.versions||[]).map(v=>({version:v.version_id,percentage:v.percentage}))});
  if(!pair||!splitOK||!timeOK||!limitsOK||!assetsOK)fail('RESOURCE_MISMATCH');
 }
 // D1 read privilege is reported separately; the deployment token need not have D1 mutation scope.
 for(const [uuid,name] of [[CORE,'jwt-feature-core-20261106a'],[ADMIN,'jwt-feature-admin-20261106a']]){
  const d=await get('/accounts/'+A+'/d1/database/'+uuid,true);
  report.databases.push({name,metadataReadable:d.ok,exactResource:d.ok?d.value?.uuid===uuid&&d.value?.name===name:null,...(!d.ok?{httpStatus:d.http}:{})});
  if(d.ok&&(d.value?.uuid!==uuid||d.value?.name!==name))fail('RESOURCE_MISMATCH');
 }
 report.status='PASS_WORKER_READONLY_METADATA';
}catch(error){report.status='FAIL';report.errorCategory=codes.has(error?.code)?error.code:'INTERNAL';process.exitCode=1;}
report.GETRequests=count;
if(!process.env.RUNNER_TEMP)throw Error('PREFLIGHT_OUTPUT_UNAVAILABLE');
const out=join(process.env.RUNNER_TEMP,'academy-feature-credential-preflight');
await mkdir(out,{mode:0o700,recursive:true});
await writeFile(join(out,'sanitized.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify(report));
