// Source-only NEW native-baseline mode. No initialization or hosted fallback.
// The launcher/SDK separately verifies complete recipe and physical resources.
import {jwtLocalIntegrationApiEnv,jwtLocalIntegrationDatabaseEnv} from './jwt-local-integration-storage.mjs';
const fail=()=>{throw Object.assign(Error('Local native stage unavailable'),{code:'LOCAL_NATIVE_STAGE_UNAVAILABLE',status:503});};
const root='https://ummabbadacademy.app';
const nativeOff=['JWT_V110_MASTER','JWT_V110_REFRESH','JWT_V110_BROWSER','JWT_V110_NATIVE_COOKIE','JWT_LOCAL_OUTBOX','JWT_LOCAL_CHILD_PIN'];
const names=new Set(['JWT_LOCAL_CORE_DB','JWT_LOCAL_ADMIN_DB','JWT_LOCAL_STUDIO_DB','JWT_LOCAL_HIFZ_DB','JWT_LOCAL_SPLIT_COORDINATOR','JWT_LOCAL_TIMETABLE_COORDINATOR','ACADEMY_DB','ACADEMY_ADMIN_DB','JWT_V110_CORE_DB','JWT_V110_ADMIN_DB','ACADEMY_SPLIT_COORDINATOR','PROGRAM_TIMETABLE_COORDINATOR','JWT_V110_SPLIT_COORDINATOR','JWT_V110_TIMETABLE_COORDINATOR','ASSETS','AUTH_LOGIN_RATE_LIMITER','JWT_V110_RATE_LIMITER','LESSON_MEDIA_BUCKET','ASSESSMENT_BUCKET','MEDIA_BUCKET']);
export function localNativeStageEnvironment(env,{coordinator=false}={}){
 if(env.JWT_LOCAL_STAGE!=='NATIVE_BASELINE'||env.JWT_LOCAL_NATIVE_ROUTES!=='NATIVE_BASELINE'||env.JWT_LOCAL_BACKEND_EGRESS!=='DENY_ALL'||env.JWT_LOCAL_SCHEDULES!=='OFF'||env.JWT_LOCAL_AI!=='OFF'||env.JWT_LOCAL_PROVIDERS!=='OFF'||env.JWT_LOCAL_TRANSCRIPTION!=='OFF'||nativeOff.some(k=>env[k]!=='0')||env.ACADEMY_D1_MODE!=='ACTIVE'||env.ACADEMY_LIBRARY_MODE!=='PUBLIC_ONLY')fail();
 if(env.JWT_LOCAL_STUDIO_DB!==undefined||env.JWT_LOCAL_HIFZ_DB!==undefined)fail();
 if(!/^[a-f0-9]{64}$/.test(env.JWT_LOCAL_RECIPE_DIGEST||'')||!/^[a-f0-9]{64}$/.test(env.JWT_LOCAL_STAGE_CONFIG_DIGEST||''))fail();
 for(const [name,value] of Object.entries(env)){
  if(typeof value==='function'||value&&typeof value==='object'&&!names.has(name))fail();
 }
 for(const name of ['LESSON_MEDIA_BUCKET','ASSESSMENT_BUCKET','MEDIA_BUCKET']){
  const bucket=env[name];if(!bucket||!['get','head','put','list','delete'].every(method=>typeof bucket[method]==='function'))fail();
 }
 if(!coordinator&&(typeof env.AUTH_LOGIN_RATE_LIMITER?.limit!=='function'||typeof env.JWT_V110_RATE_LIMITER?.limit!=='function'||env.AUTH_LOGIN_RATE_LIMITER===env.JWT_V110_RATE_LIMITER))fail();
 if(env.HIFZ_HANDOFF_ENABLED!=='0'||env.HIFZ_PROFILE_SYNC_URL!==''||env.HIFZ_DEVELOPMENT_HANDOFF_URL!=='')fail();
 const selected=coordinator?jwtLocalIntegrationDatabaseEnv(env):jwtLocalIntegrationApiEnv(env);
 if(selected.JWT_LOCAL_APP_BINDING!=='academy:'+selected.ACADEMY_D1_RUN_ID||selected.ALLOWED_ORIGINS!==root||selected.API_ORIGIN!==root)fail();
 return selected;
}
export function guardedLocalNativeCoordinator(Base){
 return class extends Base{constructor(ctx,env){super(ctx,localNativeStageEnvironment(env,{coordinator:true}));}};
}
