// Test-only wrapper. The deployed entry validates/remaps raw fresh bindings.
import {jwtFeatureApiEnv,jwtFeatureDatabaseEnv} from '../src/academy/jwt-feature-storage.mjs';
import {measuredEnv} from './feature-local-budget-metrics.mjs';
function restoreLegacy(env,measured,api){
 const out={...measured,ACADEMY_DB:env.ACADEMY_DB,ACADEMY_ADMIN_DB:env.ACADEMY_ADMIN_DB,ACADEMY_D1_RUN_ID:env.ACADEMY_D1_RUN_ID,ACADEMY_OBJECT_NAMESPACE:env.ACADEMY_OBJECT_NAMESPACE,JWT_V110_CORE_DB:measured.ACADEMY_DB,JWT_V110_ADMIN_DB:measured.ACADEMY_ADMIN_DB};
 if(api){out.JWT_V110_SPLIT_COORDINATOR=measured.ACADEMY_SPLIT_COORDINATOR;out.JWT_V110_TIMETABLE_COORDINATOR=measured.PROGRAM_TIMETABLE_COORDINATOR;out.ACADEMY_SPLIT_COORDINATOR=env.ACADEMY_SPLIT_COORDINATOR;out.PROGRAM_TIMETABLE_COORDINATOR=env.PROGRAM_TIMETABLE_COORDINATOR;}
 return out;
}
export function measuredJWTApiEnv(env,metrics){return restoreLegacy(env,measuredEnv(jwtFeatureApiEnv(env),metrics),true);}
export function measuredJWTDatabaseEnv(env,metrics){return restoreLegacy(env,measuredEnv(jwtFeatureDatabaseEnv(env),metrics,{coordinator:false}),false);}
