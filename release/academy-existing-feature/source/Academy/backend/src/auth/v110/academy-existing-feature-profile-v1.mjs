// Academy-only existing Feature configuration. This is not a native readiness receipt.
import selection from './academy-existing-feature-selection-v1.json' with {type:'json'};
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const selected=freeze(selection);
export const portableNativeOrigins=selected.origins;
export const portableChildOrigins=freeze({});
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=(code='ACADEMY_FEATURE_CONFIGURATION_UNAVAILABLE',status=503)=>{throw Object.assign(Error(code),{code,status});};
export function canonicalPublicJSON(v){
 if(v===null||typeof v==='boolean'||typeof v==='string')return JSON.stringify(v);
 if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonicalPublicJSON).join(',')+']';
 if(v&&Object.getPrototypeOf(v)===Object.prototype)return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalPublicJSON(v[k])).join(',')+'}';
 fail('ACADEMY_FEATURE_PROFILE_SHAPE');
}
function definition(){
 if(selected.schema!=='ACADEMY_EXISTING_FEATURE_PROFILE_V1'||selected.scope!=='ACADEMY_ONLY'||selected.runtimeReadiness!=='NOT_ATTESTED_BY_CONFIGURATION'||!hex(selected.profileCommitment)||selected.origins.academy!=='https://maktabhelper.app'||selected.issuers.academy!==selected.origins.academy||selected.audiences.academy!=='urn:ummabbadacademy:academy:api'||selected.rootCookieMode!=='APPROVED_SHARED_PARENT'||selected.rootCookieDomain!=='maktabhelper.app'||selected.childDelivery!=='OFF_UNCONFIGURED')fail();
 if(['retry','admission','pin','reader','rootBridge','timetable','rpc','childDelivery'].some(k=>selected.capabilities[k]!==false))fail('ACADEMY_FEATURE_CHILD_DISABLED');
 return selected;
}
export async function verifyPortableNativeProfile(){
 const p=definition(),payload={...p};delete payload.profileCommitment;
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalPublicJSON(payload)));
 const actual=[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(actual!==p.profileCommitment)fail('ACADEMY_FEATURE_PROFILE_COMMITMENT');return p;
}
function environment(env){
 const p=definition(),role=env?.JWT_V110_PORTABLE_APP;
 if(!['academy','coordinator'].includes(role)||env.ENVIRONMENT!=='feature'||env.ACADEMY_DEPLOYMENT_KIND!=='ISOLATED_PREVIEW'||env.ACADEMY_DB_GENERATION!=='SPLIT_V1'||env.JWT_V110_STORAGE_PROFILE!=='ACADEMY_ONLY_EXISTING_PAIR_V1'||env.JWT_V110_COOKIE_MODE!=='SHARED_PARENT_ACCESS_HOST_ONLY_REFRESH_V1'||env.JWT_V110_PORTABLE_ACTIVATION!=='ROOT_COORDINATED_ACCEPTED_PROFILE'||env.JWT_V110_PORTABLE_PROFILE_SHA256!==p.profileCommitment||env.JWT_V110_ROOT_SENSITIVE_POLICY!=='RESOURCE_PIN_V1')fail();
 if(env.JWT_V110_MASTER!=='1'||env.JWT_V110_NATIVE_COOKIE!=='1'||env.JWT_V110_ROOT_ONLY_CHILD_DELIVERY!=='OFF'||env.JWT_V110_CHILD_NATIVE_AUTH==='1'||env.HIFZ_HANDOFF_ENABLED==='1'||env.ACADEMY_WEB_PLATFORM==='1'||env.ACADEMY_WEBSITE_STUDIO==='1'||env.JWT_V110_LOCAL_INTEGRATION==='1'||Object.keys(env).some(k=>k.startsWith('JWT_LOCAL_')))fail('ACADEMY_FEATURE_CHILD_DISABLED');
 if(['AI','PROVIDERS','TRANSCRIPTION','SCHEDULES'].some(k=>env['JWT_V110_PORTABLE_'+k]!=='OFF')||env.AI_ENABLED!=='0'||env.TRANSCRIPTION_ENABLED!=='0'||env.VIDEO_AUTOLINK_HTTP_ENABLED!=='0'||env.LOCAL_VIDEO_MANUAL_SOURCE_ENABLED!=='0')fail('ACADEMY_FEATURE_HOLD');
 if(!hex(env.JWT_V110_NATIVE_RUN_ID)||env.ACADEMY_D1_RUN_ID!==env.JWT_V110_NATIVE_RUN_ID||!/^jwt-feature-v110\/[a-z0-9-]{1,64}\/$/.test(env.JWT_V110_OBJECT_NAMESPACE||'')||env.ACADEMY_OBJECT_NAMESPACE!==env.JWT_V110_OBJECT_NAMESPACE)fail('ACADEMY_FEATURE_NATIVE_SELECTION');
 if(typeof env.JWT_V110_CORE_DB?.withSession!=='function'||typeof env.JWT_V110_ADMIN_DB?.withSession!=='function'||env.JWT_V110_CORE_DB===env.JWT_V110_ADMIN_DB||env.ACADEMY_DB!==env.JWT_V110_CORE_DB||env.ACADEMY_ADMIN_DB!==env.JWT_V110_ADMIN_DB||typeof env.JWT_V110_SPLIT_COORDINATOR?.getByName!=='function'||env.ACADEMY_SPLIT_COORDINATOR!==env.JWT_V110_SPLIT_COORDINATOR)fail('ACADEMY_FEATURE_BINDINGS');
 if(env.API_ORIGIN!==p.origins.academy||env.ALLOWED_ORIGINS!==p.origins.academy||env.JWT_V110_REQUEST_ORIGIN!==p.origins.academy)fail('ACADEMY_FEATURE_ORIGIN_CONFIGURATION');
 if(role==='academy'&&(typeof env.JWT_V110_TIMETABLE_COORDINATOR?.getByName!=='function'||env.PROGRAM_TIMETABLE_COORDINATOR!==env.JWT_V110_TIMETABLE_COORDINATOR||env.JWT_V110_SPLIT_COORDINATOR===env.JWT_V110_TIMETABLE_COORDINATOR||typeof env.AUTH_LOGIN_RATE_LIMITER?.limit!=='function'||typeof env.JWT_V110_RATE_LIMITER?.limit!=='function'||env.JWT_V110_BROWSER!=='1'||env.JWT_V110_REFRESH!=='1'))fail('ACADEMY_FEATURE_API_BINDINGS');
 return freeze({...p,profileId:p.profileCommitment,deploymentIds:{academy:env.JWT_V110_NATIVE_RUN_ID}});
}
export function requirePortableNativeMethod(env,app,method){
 if(!['academy','coordinator'].includes(app)||!['http','cookie','master','coordinator','capture','prearm','refresh'].includes(method))fail('ROOT_ONLY_CHILD_DELIVERY_DISABLED');
 const p=environment(env),coordinator=env.JWT_V110_PORTABLE_APP==='coordinator';
 const permitted=coordinator?(app==='coordinator'&&['coordinator','capture','prearm'].includes(method)||app==='academy'&&method==='master'):(app==='academy'&&['http','cookie','master','refresh'].includes(method));
 if(!permitted||p.capabilities[method]!==true)fail('ACADEMY_FEATURE_ROLE');return p;
}
export function requireRootOnlyChildDeliveryOff(env){const p=environment(env);if(p.childDelivery!=='OFF_UNCONFIGURED')fail('ROOT_ONLY_CHILD_DELIVERY_DISABLED');return p;}
export function rejectRootOnlyChildEgress(){fail('ROOT_ONLY_CHILD_DELIVERY_DISABLED');}
export function portableNativeDeploymentId(app,env){if(app!=='academy'||!env)fail('ROOT_ONLY_CHILD_DELIVERY_DISABLED');return environment(env).deploymentIds.academy;}
export function requirePortablePINOriginContract(){fail('ROOT_ONLY_CHILD_PIN_DISABLED');}
export function portableChildProfile(){fail('ROOT_ONLY_CHILD_DELIVERY_DISABLED');}
export function portableChildConfigError(){fail('ROOT_ONLY_CHILD_DELIVERY_DISABLED');}
export function portableNativeBinding(){fail('ROOT_ONLY_RPC_DISABLED');}
export function portableNativeHTTPRequest(request,env,app){
 const p=requirePortableNativeMethod(env,app,'http'),u=new URL(request.url);
 if(app!=='academy'||u.origin!==p.origins.academy||u.username||u.password||u.hash||request.headers.has('Host')&&request.headers.get('Host')!==u.host)fail('PORTABLE_NATIVE_ORIGIN',403);
 if(request.headers.has('Origin')&&request.headers.get('Origin')!==p.origins.academy||!['GET','HEAD'].includes(request.method)&&(request.headers.get('Origin')!==p.origins.academy||request.headers.get('Sec-Fetch-Site')!=='same-origin'))fail('PORTABLE_NATIVE_ORIGIN',403);
 return p;
}
export function portableNativeUnavailable(){return new Response('Academy Feature authentication is unavailable.',{status:503,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}});}
export const ROOT_ONLY_PROFILE_ABI='ACADEMY_ONLY_EXISTING_FEATURE_CONFIGURATION_V1';
