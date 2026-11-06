// Strict allowlisted metadata. Secret values and asset upload JWTs are discarded.
import assert from 'node:assert/strict';
const blockedNamespaces=new Set(['b722f4cf54a04d6fb2a5a299e12722e2','aa75328c13ee4f42b406ccf5ebbe851a']);
export function sanitiseSettings(s){
 return {compatibility_date:s.compatibility_date,compatibility_flags:s.compatibility_flags,
  bindings:(s.bindings||[]).map(b=>{
   if(b.type==='secret_text')return {name:b.name,type:b.type};
   if(b.type==='plain_text')return {name:b.name,type:b.type,text:b.text};
   if(b.type==='d1')return {name:b.name,type:b.type,id:b.id};
   if(b.type==='r2_bucket')return {name:b.name,type:b.type,bucket_name:b.bucket_name};
   if(b.type==='durable_object_namespace')return {name:b.name,type:b.type,class_name:b.class_name,namespace_id:b.namespace_id,...(b.script_name?{script_name:b.script_name}:{})};
   if(b.type==='ratelimit')return {name:b.name,type:b.type,namespace_id:b.namespace_id,simple:b.simple};
   return {name:b.name,type:b.type};
  }),assets:s.assets?{config:s.assets.config}:null,tailConsumerCount:Array.isArray(s.tail_consumers)?s.tail_consumers.length:(s.tailConsumerCount||0)};
}
export function currentVersion(deployments){
 const row=(deployments.deployments||deployments)[0];assert(row?.versions?.length===1,'SINGLE_VERSION_REQUIRED');
 const v=row.versions[0];assert(v.percentage===undefined||v.percentage===100,'GRADUAL_DEPLOYMENT_FORBIDDEN');
 assert.match(v.version_id,/^[a-f0-9-]{36}$/);return v.version_id;
}
export function assertRemoteProfile(settings,config,baseline,namespaces,{secretNames=config.secrets?.required||[],discover=false}={}){
 const s=sanitiseSettings(settings),expected=new Map(),seen=new Set();
 for(const b of config.d1_databases||[])expected.set(b.binding,{type:'d1',id:b.database_id});
 for(const b of config.r2_buckets||[])expected.set(b.binding,{type:'r2_bucket',bucket_name:b.bucket_name});
 for(const [name,text]of Object.entries(config.vars||{}))expected.set(name,{type:'plain_text',text});
 for(const name of secretNames)expected.set(name,{type:'secret_text'});
 for(const b of config.ratelimits||[])expected.set(b.name,{type:'ratelimit',namespace_id:b.namespace_id,simple:b.simple});
 if(config.assets)expected.set(config.assets.binding,{type:'assets'});
 for(const b of config.durable_objects?.bindings||[]){
  const old=b.class_name==='ProgramTimetableCoordinator'?baseline.timetableNamespaceId:b.class_name==='AcademySplitCoordinator'?baseline.splitNamespaceId:null;
  const kind=b.class_name==='JWTFeatureProgramTimetableCoordinator'?'timetable':b.class_name==='JWTFeatureAcademySplitCoordinator'?'split':null;
  assert(old||kind,'UNKNOWN_CLASS');
  const actual=s.bindings.find(x=>x.name===b.name);assert(actual,'MISSING_DO');
  if(kind){
   assert.match(actual.namespace_id,/^[a-f0-9]{32}$/);
   assert(!blockedNamespaces.has(actual.namespace_id)&&![baseline.timetableNamespaceId,baseline.splitNamespaceId].includes(actual.namespace_id),'HELD_NAMESPACE');
   if(discover&&!namespaces[kind])namespaces[kind]=actual.namespace_id;
   assert.equal(actual.namespace_id,namespaces[kind],'NAMESPACE_CHANGED');
  }
  expected.set(b.name,{type:'durable_object_namespace',class_name:b.class_name,namespace_id:old||namespaces[kind]});
  if(actual.script_name)assert.equal(actual.script_name,b.script_name||config.name,'WRONG_DO_SCRIPT');
 }
 if(namespaces.split&&namespaces.timetable)assert.notEqual(namespaces.split,namespaces.timetable,'SAME_NAMESPACE');
 assert.equal(s.bindings.length,expected.size,'EXTRA_BINDINGS');
 for(const b of s.bindings){
  assert(!seen.has(b.name),'DUPLICATE_BINDING');seen.add(b.name);const e=expected.get(b.name);assert(e,'UNKNOWN_BINDING');
  for(const [k,v]of Object.entries(e))assert.deepEqual(b[k],v,'BINDING_MISMATCH');
 }
 assert.equal(s.compatibility_date,config.compatibility_date);assert.deepEqual(s.compatibility_flags,config.compatibility_flags);assert.equal(s.tailConsumerCount,0);
 if(config.assets){
  assert(s.assets?.config,'ASSETS_CONFIG_MISSING');
  assert.deepEqual(s.assets.config.run_worker_first,config.assets.run_worker_first);
  assert.equal(s.assets.config.not_found_handling,'none');
  assert(['/',undefined].includes(s.assets.config.base_path));
  assert(['auto-trailing-slash',undefined].includes(s.assets.config.html_handling));
 }else assert(!s.assets,'ASSETS_FORBIDDEN_DURING_SETUP');
 return s;
}
