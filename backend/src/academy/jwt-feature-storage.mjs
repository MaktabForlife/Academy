// Feature-only environment selection. No I/O; legacy bindings remain untouched.
const origin='https://feature_worker.maktab4life.workers.dev';
const fail=()=>{throw Object.assign(Error('Fresh JWT Feature storage is unavailable'),{code:'JWT_FEATURE_STORAGE_UNAVAILABLE',status:503});};
export function jwtFeatureDatabaseEnv(env){
 if(env.ENVIRONMENT!=='feature'||env.ACADEMY_DEPLOYMENT_KIND!=='ISOLATED_PREVIEW'||env.JWT_V110_STORAGE_PROFILE!=='FRESH_PAIR_V1')fail();
 const core=env.JWT_V110_CORE_DB,admin=env.JWT_V110_ADMIN_DB;
 if(!core?.withSession||!admin?.withSession||core===admin||core===env.ACADEMY_DB||core===env.ACADEMY_ADMIN_DB||admin===env.ACADEMY_DB||admin===env.ACADEMY_ADMIN_DB)fail();
 if(!/^[a-f0-9]{64}$/.test(env.JWT_V110_NATIVE_RUN_ID||'')||env.JWT_V110_NATIVE_RUN_ID===env.ACADEMY_D1_RUN_ID||!/^jwt-feature-v110\/[a-z0-9-]{1,64}\/$/.test(env.JWT_V110_OBJECT_NAMESPACE||''))fail();
 return {...env,ACADEMY_DB:core,ACADEMY_ADMIN_DB:admin,ACADEMY_D1_RUN_ID:env.JWT_V110_NATIVE_RUN_ID,ACADEMY_OBJECT_NAMESPACE:env.JWT_V110_OBJECT_NAMESPACE,ALLOWED_ORIGINS:origin,API_ORIGIN:origin};
}
export function jwtFeatureApiEnv(env){
 const next=jwtFeatureDatabaseEnv(env),split=env.JWT_V110_SPLIT_COORDINATOR,timetable=env.JWT_V110_TIMETABLE_COORDINATOR;
 if(!split?.getByName||!timetable?.getByName||split===env.ACADEMY_SPLIT_COORDINATOR||timetable===env.PROGRAM_TIMETABLE_COORDINATOR||split===timetable)fail();
 return {...next,ACADEMY_SPLIT_COORDINATOR:split,PROGRAM_TIMETABLE_COORDINATOR:timetable};
}
