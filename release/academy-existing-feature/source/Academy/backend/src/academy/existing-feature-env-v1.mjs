// Internal mapping only. Never add/restore ordinary Cloudflare bindings or use a second pair.
import {requirePortableNativeMethod} from '../auth/v110/academy-existing-feature-profile-v1.mjs';
const fail=()=>{throw Object.assign(Error('ACADEMY_FEATURE_BINDINGS_UNAVAILABLE'),{code:'ACADEMY_FEATURE_BINDINGS_UNAVAILABLE',status:503});};
const omittedChildOrigins=['WEBSITE_PLATFORM_ORIGIN','WEBSITE_PLATFORM_SERVER_ORIGIN','WEBSITE_STUDIO_ORIGIN','WEBSITE_STUDIO_CONTENT','HIFZ_PROFILE_SYNC_URL'];
export function existingFeatureEnv(env,role){
 if(!env||!['academy','coordinator'].includes(role)||env.JWT_V110_PORTABLE_APP!==role||env.JWT_V110_STORAGE_PROFILE!=='ACADEMY_ONLY_EXISTING_PAIR_V1')fail();
 const core=env.JWT_V110_CORE_DB,admin=env.JWT_V110_ADMIN_DB,split=env.JWT_V110_SPLIT_COORDINATOR,timetable=env.JWT_V110_TIMETABLE_COORDINATOR;
 if(typeof core?.withSession!=='function'||typeof admin?.withSession!=='function'||core===admin||typeof split?.getByName!=='function'||role==='academy'&&(typeof timetable?.getByName!=='function'||split===timetable))fail();
 // An already mapped native environment is accepted; any different ordinary binding is refused.
 if(env.ACADEMY_DB!==undefined&&env.ACADEMY_DB!==core||env.ACADEMY_ADMIN_DB!==undefined&&env.ACADEMY_ADMIN_DB!==admin||env.ACADEMY_SPLIT_COORDINATOR!==undefined&&env.ACADEMY_SPLIT_COORDINATOR!==split||env.PROGRAM_TIMETABLE_COORDINATOR!==undefined&&env.PROGRAM_TIMETABLE_COORDINATOR!==timetable)fail();
 const mapped={...env,ACADEMY_DB:core,ACADEMY_ADMIN_DB:admin,ACADEMY_SPLIT_COORDINATOR:split,ACADEMY_D1_RUN_ID:env.JWT_V110_NATIVE_RUN_ID,ACADEMY_OBJECT_NAMESPACE:env.JWT_V110_OBJECT_NAMESPACE};
 if(timetable!==undefined)mapped.PROGRAM_TIMETABLE_COORDINATOR=timetable;
 // Preserve retained bindings/secrets on the platform. The Academy-only internal view has no child URL.
 for(const name of omittedChildOrigins)delete mapped[name];
 requirePortableNativeMethod(mapped,role==='academy'?'academy':'coordinator',role==='academy'?'http':'coordinator');
 return mapped;
}
export const jwtFeatureDatabaseEnv=env=>existingFeatureEnv(env,env?.JWT_V110_PORTABLE_APP);
export const jwtFeatureApiEnv=env=>existingFeatureEnv(env,'academy');
