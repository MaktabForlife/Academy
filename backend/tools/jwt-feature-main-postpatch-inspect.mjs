// Fixed two-GET MAIN-only post-PATCH observation. No modifier or Worker route.
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {readFileSync} from 'node:fs';
import {expectedPausedMetadataProfiles} from './jwt-feature-finalise.mjs';
const freeze=x=>{for(const v of Object.values(x))if(v&&typeof v==='object')freeze(v);return Object.freeze(x);};
export const diagnosticPlan=freeze(JSON.parse(readFileSync(new URL('../../deployment/jwt-feature-main-postpatch-diagnostic.json',import.meta.url),'utf8')));
const type=x=>x===null?'null':Array.isArray(x)?'array':typeof x;
const types=new Set(['null','array','undefined','object','string','number','boolean']);
const bindingTypes=new Set(['plain_text','secret_text','d1','r2_bucket','durable_object_namespace','ratelimit','assets']);
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
function expected(){
 const {worker:c}=expectedPausedMetadataProfiles(),m=new Map();
 for(const b of c.d1_databases)m.set(b.binding,{type:'d1',id:b.database_id});
 for(const b of c.r2_buckets||[])m.set(b.binding,{type:'r2_bucket',bucket_name:b.bucket_name});
 for(const [name,text]of Object.entries(c.vars))m.set(name,{type:'plain_text',text});
 for(const name of c.secrets.required)m.set(name,{type:'secret_text'});
 for(const b of c.ratelimits)m.set(b.name,{type:'ratelimit',namespace_id:b.namespace_id,simple:b.simple});
 for(const b of c.durable_objects.bindings){
  const ns=b.class_name==='ProgramTimetableCoordinator'?'7d99a5300b8d4f948c4fb85ce23b344e':b.class_name==='AcademySplitCoordinator'?'21e47da10960439ea4c2bb1ce5736718':b.class_name==='JWTFeatureProgramTimetableCoordinator'?'ab05473998dc4e93b792464f9e78e0e9':'de95f15f19a54a9e9ba34e6e75f51847';
  m.set(b.name,{type:'durable_object_namespace',namespace_id:ns,class_name:b.class_name,script_name:b.script_name||c.name});
 }
 m.set('ASSETS',{type:'assets'});return {c,m};
}
const temporary=['JWT_FEATURE_SETUP_PIN','JWT_FEATURE_SETUP_AUTH'];
const categories=new Set(['SETTINGS_SHAPE','BINDINGS_SHAPE','BINDING_LIMIT','BINDING_COUNT','MISSING_BINDING','UNEXPECTED_BINDING','UNEXPECTED_TEMPORARY_SECRET','DUPLICATE_BINDING','FIELD_MISMATCH','D1_ALIAS_CONFLICT','ASSET_CONFIG_SHAPE']);
const topFields=['settings','bindings','compatibility_date','compatibility_flags','observability.enabled','tail_consumers','assets.config','assets.config.run_worker_first','assets.config.not_found_handling','assets.config.base_path','assets.config.html_handling'];
function allowedFields(){
 const {m}=expected(),set=new Set(topFields);
 for(const [name,e]of m)for(const f of [...Object.keys(e),'presence','script_name'])set.add(name+'.'+f);
 for(const name of temporary)set.add(name+'.presence');
 for(let i=0;i<128;i++)set.add('bindings['+i+']');return set;
}
export function comparePostPatchSettings(raw){
 const {c,m}=expected(),labels=[];let mismatchCount=0;
 const issue=(field,category,want,actual)=>{mismatchCount++;if(labels.length<64)labels.push({field,category,expectedType:type(want),observedType:type(actual)});};
 const out={settingsType:type(raw),bindingsReported:0,knownBindings:[],secretPresence:[],originalSourceMatches:false,originalOwnerMatches:false,assetConfigurationReturned:false,assetRoutingVerified:false,expectedMetadataMatches:false,mismatchCount:0,labelsTruncated:false,labels};
 if(!raw||typeof raw!=='object'||Array.isArray(raw)){issue('settings','SETTINGS_SHAPE',{},raw);return finish();}
 const bs=raw.bindings;out.bindingsReported=Array.isArray(bs)?bs.length:0;
 const known=new Set([...m.keys(),...temporary]),seen=new Map();
 if(!Array.isArray(bs))issue('bindings','BINDINGS_SHAPE',[],bs);
 else{
  if(bs.length>128)issue('bindings','BINDING_LIMIT',128,bs.length);
  if(bs.length!==m.size)issue('bindings','BINDING_COUNT',m.size,bs.length);
  for(let i=0;i<Math.min(bs.length,128);i++){
   const b=bs[i],name=b?.name;
   if(!b||typeof b!=='object'||Array.isArray(b)||!known.has(name)){issue('bindings['+i+']','UNEXPECTED_BINDING',undefined,b);continue;}
   out.knownBindings.push({name,bindingType:bindingTypes.has(b.type)?b.type:'UNRECOGNISED'});
   if(seen.has(name))issue(name+'.presence','DUPLICATE_BINDING',false,true);seen.set(name,b);
   const e=m.get(name);
   if(!e){issue(name+'.presence','UNEXPECTED_TEMPORARY_SECRET',undefined,true);continue;}
   for(const [field,want]of Object.entries(e)){
    let actual=b[field];
    if(field==='id'){
     if(b.database_id!==undefined&&b.id!==undefined&&b.database_id!==b.id)issue(name+'.id','D1_ALIAS_CONFLICT',b.database_id,b.id);
     actual=b.database_id??b.id;
    }
    if(field==='script_name'&&!b.script_name)continue; // Same-script omission, as in the strict reviewed verifier.
    if(!isDeepStrictEqual(actual,want))issue(name+'.'+field,'FIELD_MISMATCH',want,actual);
   }
  }
 }
 for(const name of m.keys())if(!seen.has(name))issue(name+'.presence','MISSING_BINDING',true,undefined);
 for(const name of [...c.secrets.required,...temporary])out.secretPresence.push({name,present:seen.has(name),hasSecretType:seen.get(name)?.type==='secret_text'});
 out.originalSourceMatches=seen.get('JWT_FEATURE_INSTALL_SOURCE')?.type==='plain_text'&&seen.get('JWT_FEATURE_INSTALL_SOURCE').text===diagnosticPlan.originalInstallSource;
 out.originalOwnerMatches=seen.get('JWT_FEATURE_INSTALL_OWNER')?.type==='plain_text'&&seen.get('JWT_FEATURE_INSTALL_OWNER').text===diagnosticPlan.originalInstallOwner;
 for(const [field,want,actual]of [
  ['compatibility_date',c.compatibility_date,raw.compatibility_date],
  ['compatibility_flags',c.compatibility_flags,raw.compatibility_flags],
  ['observability.enabled',Boolean(c.observability?.enabled),raw.observability?.enabled??raw.observabilityEnabled??false],
  ['tail_consumers',0,Array.isArray(raw.tail_consumers)?raw.tail_consumers.length:raw.tailConsumerCount||0]
 ])if(!isDeepStrictEqual(want,actual))issue(field,'FIELD_MISMATCH',want,actual);
 const a=raw.assets?.config;
 if(a!==undefined&&a!==null){
  out.assetConfigurationReturned=true;
  if(type(a)!=='object')issue('assets.config','ASSET_CONFIG_SHAPE',{},a);
  else{
   if(!isDeepStrictEqual(a.run_worker_first,c.assets.run_worker_first))issue('assets.config.run_worker_first','FIELD_MISMATCH',c.assets.run_worker_first,a.run_worker_first);
   for(const [field,allowed]of [['not_found_handling',['none',undefined]],['base_path',['/',undefined]],['html_handling',['auto-trailing-slash',undefined]]])
    if(!allowed.includes(a[field]))issue('assets.config.'+field,'FIELD_MISMATCH',allowed[0],a[field]);
  }
 }
 return finish();
 function finish(){out.mismatchCount=mismatchCount;out.labelsTruncated=mismatchCount>labels.length;out.expectedMetadataMatches=mismatchCount===0;return out;}
}
export function deploymentObservation(raw){
 const row=Array.isArray(raw)?raw[0]:raw?.deployments?.[0],vs=row?.versions;
 const versions=Array.isArray(vs)?vs.slice(0,4).map(v=>({versionId:typeof v?.version_id==='string'&&uuid.test(v.version_id)?v.version_id:null,percentage:typeof v?.percentage==='number'&&v.percentage>=0&&v.percentage<=100?v.percentage:null})):[];
 const valid=Array.isArray(vs)&&vs.length===1&&uuid.test(vs[0]?.version_id||'')&&[100,undefined].includes(vs[0]?.percentage);
 const currentVersion=valid?vs[0].version_id:null;
 return {versionsReported:Array.isArray(vs)?vs.length:0,versions,currentVersion,relationToPrePatchReference:currentVersion?(currentVersion===diagnosticPlan.prePatchVersionReference?'SAME_AS_PREPATCH_REFERENCE':'DIFFERENT_FROM_PREPATCH_REFERENCE'):'UNDETERMINED',ownedVersionAdopted:false};
}
const outcomes=new Set(['CAPTURED','TRANSPORT_FAILURE','HTTP_FAILURE','PROVIDER_FAILURE','BODY_FAILURE','RESULT_SHAPE_FAILURE']);
const states=new Set(['NOT_STARTED','READ_ONLY_MAIN_OBSERVATIONS_CAPTURED_NO_RECOVERY_AUTHORITY','READ_ONLY_MAIN_DIAGNOSTIC_STOPPED']);
const exact=(x,keys)=>assert.deepEqual(Object.keys(x).sort(),[...keys].sort(),'UNEXPECTED_EVIDENCE_FIELD');
export function assertSafeDiagnosticReceipt(e){
 exact(e,['schema','state','observations','explicitGetAttempts','priorExplicitGets','cumulativeExplicitGetAttempts','originalHardGetLimit','reservedOriginalGets','countsAreFetchAttempts','hostedWrites','workerHTTP','sqlRequests','codeContentReads','secretValueReads','activated','cleanupVerified','ownedVersionAdopted','observationsAtomic','deploymentVersionBindsSettings','historicalFailureCause']);
 assert.equal(e.schema,1);assert(states.has(e.state));assert(Number.isSafeInteger(e.explicitGetAttempts)&&e.explicitGetAttempts>=0&&e.explicitGetAttempts<=2);
 assert.equal(e.priorExplicitGets,54);assert.equal(e.cumulativeExplicitGetAttempts,54+e.explicitGetAttempts);assert.equal(e.originalHardGetLimit,60);assert.equal(e.reservedOriginalGets,4);assert.equal(e.countsAreFetchAttempts,true);
 for(const k of ['hostedWrites','workerHTTP','sqlRequests','codeContentReads','secretValueReads'])assert.equal(e[k],0);
 for(const k of ['activated','cleanupVerified','ownedVersionAdopted','observationsAtomic','deploymentVersionBindsSettings'])assert.equal(e[k],false);
 assert.equal(e.historicalFailureCause,'UNKNOWN_NO_RAW_POST_SETTINGS_SAVED');
 assert(Array.isArray(e.observations)&&e.observations.length<=2);assert.equal(e.observations.length,e.explicitGetAttempts);
 if(e.state==='READ_ONLY_MAIN_OBSERVATIONS_CAPTURED_NO_RECOVERY_AUTHORITY')assert(e.explicitGetAttempts===2&&e.observations.every(o=>o.outcome==='CAPTURED'));
 const {c,m}=expected(),known=new Set([...m.keys(),...temporary]),fields=allowedFields();
 for(let i=0;i<e.observations.length;i++){
  const o=e.observations[i];exact(o,['endpoint','attempt','outcome','httpStatus','providerCodes','deployment','settings']);
  assert.equal(o.endpoint,['deployments','settings'][i]);assert.equal(o.attempt,i+1);assert(outcomes.has(o.outcome));
  assert(o.httpStatus===null||Number.isInteger(o.httpStatus)&&o.httpStatus>=100&&o.httpStatus<=599);
  assert(o.providerCodes.length<=8&&o.providerCodes.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647));
  if(o.deployment!==null){
   const d=o.deployment;exact(d,['versionsReported','versions','currentVersion','relationToPrePatchReference','ownedVersionAdopted']);
   assert(Number.isSafeInteger(d.versionsReported)&&d.versionsReported>=0&&d.versionsReported<=1048576);assert(d.versions.length<=4);
   for(const v of d.versions){exact(v,['versionId','percentage']);assert(v.versionId===null||uuid.test(v.versionId));assert(v.percentage===null||typeof v.percentage==='number'&&v.percentage>=0&&v.percentage<=100);}
   assert(d.currentVersion===null||uuid.test(d.currentVersion));assert(['SAME_AS_PREPATCH_REFERENCE','DIFFERENT_FROM_PREPATCH_REFERENCE','UNDETERMINED'].includes(d.relationToPrePatchReference));assert.equal(d.ownedVersionAdopted,false);
  }
  if(o.settings!==null){
   const s=o.settings;exact(s,['settingsType','bindingsReported','knownBindings','secretPresence','originalSourceMatches','originalOwnerMatches','assetConfigurationReturned','assetRoutingVerified','expectedMetadataMatches','mismatchCount','labelsTruncated','labels']);
   assert(types.has(s.settingsType));for(const k of ['bindingsReported','mismatchCount'])assert(Number.isSafeInteger(s[k])&&s[k]>=0&&s[k]<=1048576);
   assert(s.knownBindings.length<=128&&s.labels.length<=64);
   for(const b of s.knownBindings){exact(b,['name','bindingType']);assert(known.has(b.name));assert(bindingTypes.has(b.bindingType)||b.bindingType==='UNRECOGNISED');}
   for(const b of s.secretPresence){exact(b,['name','present','hasSecretType']);assert([...c.secrets.required,...temporary].includes(b.name));assert.equal(typeof b.present,'boolean');assert.equal(typeof b.hasSecretType,'boolean');}
   assert(s.secretPresence.length<=8);for(const k of ['originalSourceMatches','originalOwnerMatches','assetConfigurationReturned','expectedMetadataMatches','labelsTruncated'])assert.equal(typeof s[k],'boolean');assert.equal(s.assetRoutingVerified,false);assert.equal(s.expectedMetadataMatches,s.mismatchCount===0);assert.equal(s.labelsTruncated,s.mismatchCount>s.labels.length);
   for(const l of s.labels){exact(l,['field','category','expectedType','observedType']);assert(fields.has(l.field));assert(categories.has(l.category));assert(types.has(l.expectedType)&&types.has(l.observedType));}
  }
 }
 return e;
}
async function jsonBody(r){
 assert(r.body);const rd=r.body.getReader(),parts=[];let n=0;
 try{for(;;){const {value,done}=await rd.read();if(done)break;n+=value.byteLength;assert(n<=1048576);parts.push(Buffer.from(value));}}finally{await rd.cancel().catch(()=>{});rd.releaseLock();}
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export async function inspectMainPostPatch({token,fresh,fetcher=fetch,save=()=>{}}){
 assert(typeof token==='string'&&token.length>0);assert.equal(typeof fresh,'function','FRESH_PROTECTED_GUARD_REQUIRED');
 const e={schema:1,state:'NOT_STARTED',observations:[],explicitGetAttempts:0,priorExplicitGets:54,cumulativeExplicitGetAttempts:54,originalHardGetLimit:60,reservedOriginalGets:4,countsAreFetchAttempts:true,hostedWrites:0,workerHTTP:0,sqlRequests:0,codeContentReads:0,secretValueReads:0,activated:false,cleanupVerified:false,ownedVersionAdopted:false,observationsAtomic:false,deploymentVersionBindsSettings:false,historicalFailureCause:'UNKNOWN_NO_RAW_POST_SETTINGS_SAVED'};
 const persist=()=>save(structuredClone(assertSafeDiagnosticReceipt(e)));persist();
 try{
  for(const endpoint of ['deployments','settings']){
   await fresh();e.explicitGetAttempts++;e.cumulativeExplicitGetAttempts=54+e.explicitGetAttempts;assert(e.explicitGetAttempts<=2&&e.cumulativeExplicitGetAttempts<=56);
   const o={endpoint,attempt:e.explicitGetAttempts,outcome:'TRANSPORT_FAILURE',httpStatus:null,providerCodes:[],deployment:null,settings:null};e.observations.push(o);
   let r;try{r=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+diagnosticPlan.accountId+'/workers/scripts/feature_worker/'+endpoint,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token}});}catch{persist();throw Error('TRANSPORT_FAILURE');}
   o.httpStatus=Number.isInteger(r.status)&&r.status>=100&&r.status<=599?r.status:null;let body;try{body=await jsonBody(r);}catch{o.outcome=r.ok?'BODY_FAILURE':'HTTP_FAILURE';persist();throw Error('BODY_FAILURE');}
   o.providerCodes=(Array.isArray(body?.errors)?body.errors:[]).slice(0,8).map(x=>x?.code).filter(x=>Number.isSafeInteger(x)&&x>=0&&x<=2147483647);
   if(!r.ok){o.outcome='HTTP_FAILURE';persist();throw Error('HTTP_FAILURE');}
   if(body?.success!==true){o.outcome='PROVIDER_FAILURE';persist();throw Error('PROVIDER_FAILURE');}
   if(body.result===undefined){o.outcome='RESULT_SHAPE_FAILURE';persist();throw Error('RESULT_SHAPE_FAILURE');}
   o.outcome='CAPTURED';if(endpoint==='deployments')o.deployment=deploymentObservation(body.result);else o.settings=comparePostPatchSettings(body.result);
   persist();
  }
  e.state='READ_ONLY_MAIN_OBSERVATIONS_CAPTURED_NO_RECOVERY_AUTHORITY';persist();return structuredClone(e);
 }catch{
  e.state='READ_ONLY_MAIN_DIAGNOSTIC_STOPPED';persist();throw Object.assign(Error('READ_ONLY_MAIN_DIAGNOSTIC_STOPPED'),{evidence:structuredClone(e)});
 }
}
