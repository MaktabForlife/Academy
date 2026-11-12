// Pure NEW local fixture selection. This is not an initializer or route entry.
import {assertLocalIntegrationProfile,LOCAL_INTEGRATION_ORIGIN} from '../auth/v110/local-integration-profile.mjs';
const fail=()=>{throw Object.assign(Error('Fresh local JWT storage is unavailable'),{code:'JWT_LOCAL_STORAGE_UNAVAILABLE',status:503});};
export function jwtLocalIntegrationDatabaseEnv(env){
 assertLocalIntegrationProfile(env);
 const core=env.JWT_LOCAL_CORE_DB,admin=env.JWT_LOCAL_ADMIN_DB;
 const protectedDBs=[env.ACADEMY_DB,env.ACADEMY_ADMIN_DB,env.JWT_V110_CORE_DB,env.JWT_V110_ADMIN_DB,env.JWT_LOCAL_STUDIO_DB,env.JWT_LOCAL_HIFZ_DB].filter(Boolean);
 if(typeof core?.withSession!=='function'||typeof admin?.withSession!=='function'||core===admin||[core,admin].some(x=>protectedDBs.includes(x)))fail();
 const run=env.JWT_LOCAL_NATIVE_RUN_ID,namespace=env.JWT_LOCAL_OBJECT_NAMESPACE;
 if(!/^[a-f0-9]{64}$/.test(run||'')||[env.ACADEMY_D1_RUN_ID,env.JWT_V110_NATIVE_RUN_ID].includes(run)||!/^jwt-local-triple-v1\/[a-z0-9-]{1,64}\/$/.test(namespace||'')||[env.ACADEMY_OBJECT_NAMESPACE,env.JWT_V110_OBJECT_NAMESPACE].includes(namespace))fail();
 return {...env,ACADEMY_DB:core,ACADEMY_ADMIN_DB:admin,ACADEMY_D1_RUN_ID:run,ACADEMY_OBJECT_NAMESPACE:namespace,ALLOWED_ORIGINS:LOCAL_INTEGRATION_ORIGIN,API_ORIGIN:LOCAL_INTEGRATION_ORIGIN};
}
export function jwtLocalIntegrationApiEnv(env){
 const next=jwtLocalIntegrationDatabaseEnv(env),split=env.JWT_LOCAL_SPLIT_COORDINATOR,timetable=env.JWT_LOCAL_TIMETABLE_COORDINATOR;
 const protectedDOs=[env.ACADEMY_SPLIT_COORDINATOR,env.PROGRAM_TIMETABLE_COORDINATOR,env.JWT_V110_SPLIT_COORDINATOR,env.JWT_V110_TIMETABLE_COORDINATOR].filter(Boolean);
 if(typeof split?.getByName!=='function'||typeof timetable?.getByName!=='function'||split===timetable||[split,timetable].some(x=>protectedDOs.includes(x)))fail();
 return {...next,ACADEMY_SPLIT_COORDINATOR:split,PROGRAM_TIMETABLE_COORDINATOR:timetable};
}
