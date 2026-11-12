// Local construction contract only; external transport must also be blocked by
// the SDK/launcher. This module cannot prove network containment or DB identity.
import {jwtLocalIntegrationApiEnv,jwtLocalIntegrationDatabaseEnv} from './jwt-local-integration-storage.mjs';
const fail=()=>{throw Object.assign(Error('Local entry unavailable'),{code:'JWT_LOCAL_ENTRY_UNAVAILABLE',status:503});};
export function localEntryEnvironment(env,{coordinator=false}={}){
 if(env.JWT_LOCAL_BACKEND_EGRESS!=='DENY_ALL'||env.JWT_LOCAL_SCHEDULES!=='OFF'||env.JWT_LOCAL_AI!=='OFF'||env.JWT_LOCAL_NATIVE_ROUTES!=='OFF')fail();
 // This first slice allows only the reviewed storage/namespace object names.
 // No R2/KV/AI/service/provider binding or arbitrary function is admitted.
 const objects=new Set(['ACADEMY_DB','ACADEMY_ADMIN_DB','JWT_V110_CORE_DB','JWT_V110_ADMIN_DB','JWT_LOCAL_CORE_DB','JWT_LOCAL_ADMIN_DB','JWT_LOCAL_STUDIO_DB','JWT_LOCAL_HIFZ_DB','ACADEMY_SPLIT_COORDINATOR','PROGRAM_TIMETABLE_COORDINATOR','JWT_V110_SPLIT_COORDINATOR','JWT_V110_TIMETABLE_COORDINATOR','JWT_LOCAL_SPLIT_COORDINATOR','JWT_LOCAL_TIMETABLE_COORDINATOR']);
 for(const [name,value] of Object.entries(env)){
  if(name==='ASSETS'){
   if(value!==undefined&&(!value||typeof value!=='object'||typeof value.fetch!=='function'))fail();
   continue;
  }
  if(typeof value==='function'||value&&typeof value==='object'&&(!objects.has(name)||typeof value.fetch==='function'||typeof value.run==='function'))fail();
 }
 return coordinator?jwtLocalIntegrationDatabaseEnv(env):jwtLocalIntegrationApiEnv(env);
}
export function guardedLocalCoordinator(Base){
 // Selection/contract validation occurs before the native constructor opens
 // a session. Native constructors retain their actual implementation.
 return class extends Base{
  constructor(ctx,env){super(ctx,localEntryEnvironment(env,{coordinator:true}));}
 };
}
