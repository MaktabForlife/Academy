// Local source slice only. Root owns the one reviewed public selection literal.
// No request-derived trust, SDK projection, hosted-readiness claim or new registry.
import {selectedPortableNativeProfile as selected} from './portable-native-profile-selection-v1.mjs';
export const portableNativeOrigins=Object.freeze({academy:'https://maktabhelper.app',studio:'https://studio.maktabhelper.app',hifz:'https://hifz.maktabhelper.app'});
export const portableChildOrigins=Object.freeze({studio:portableNativeOrigins.studio,hifz:portableNativeOrigins.hifz});
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),id=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const fail=(code='PORTABLE_NATIVE_UNAVAILABLE',status=503)=>{throw Object.assign(Error(code),{code,status});};
export function canonicalPublicJSON(v){if(v===null||['string','boolean','number'].includes(typeof v))return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonicalPublicJSON).join(',')+']';if(v&&Object.getPrototypeOf(v)===Object.prototype)return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalPublicJSON(v[k])).join(',')+'}';fail('PORTABLE_PROFILE_SHAPE');}
function bound(){
 const p=selected;
 if(!p||p.schema!=='PORTABLE_NATIVE_LOCAL_PROFILE_V1'||p.status!=='REVIEWED_LOCAL_SYNTHETIC'||p.executionKind!=='LOCAL_SYNTHETIC'||!hex(p.profileCommitment))fail();
 if(!p.origins||!p.issuers||!p.deploymentIds||!p.rootDatabaseIds||!p.workerNames||!p.capabilities)fail();
 for(const app of ['academy','studio','hifz'])if(p.origins[app]!==portableNativeOrigins[app]||p.issuers[app]!==portableNativeOrigins[app]||!hex(p.deploymentIds[app]))fail('PORTABLE_PROFILE_BINDING');
 if(new Set(Object.values(p.deploymentIds)).size!==3||p.rootCookieMode!=='APPROVED_SHARED_PARENT'||p.rootCookieDomain!=='maktabhelper.app')fail('PORTABLE_PROFILE_BINDING');
 if(!id(p.rootDatabaseIds.core)||!id(p.rootDatabaseIds.admin)||p.rootDatabaseIds.core===p.rootDatabaseIds.admin)fail('PORTABLE_PROFILE_RESOURCES');
 if(Object.values(p.workerNames).some(v=>!id(v))||new Set(Object.values(p.workerNames)).size!==4||p.capabilities.rpc!==false)fail('PORTABLE_PROFILE_RESOURCES');
 return Object.freeze({...p,profileId:p.profileCommitment});
}
export async function verifyPortableNativeProfile(){
 const p=bound(),payload={...selected};delete payload.profileCommitment;
 const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalPublicJSON(payload)));
 const actual=[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(actual!==p.profileCommitment)fail('PORTABLE_PROFILE_COMMITMENT');return p;
}
export function requirePortableNativeMethod(env,app,method){
 if(env?.JWT_V110_PORTABLE_ACTIVATION!=='ROOT_COORDINATED_ACCEPTED_PROFILE')fail();
 const p=bound();
 const coordinator=env.JWT_V110_PORTABLE_APP==='coordinator';
 if(coordinator&&!(app==='coordinator'&&method==='retry'||app==='academy'&&method==='master'&&p.capabilities.retry===true))fail('PORTABLE_NATIVE_ROLE');
 if(!['academy','coordinator','studio','hifz'].includes(app)||(!coordinator&&env.JWT_V110_PORTABLE_APP!==app)||env.JWT_V110_PORTABLE_PROFILE_SHA256!==p.profileCommitment||env.ENVIRONMENT!=='feature'||env.ACADEMY_DEPLOYMENT_KIND!=='ISOLATED_PREVIEW'||env.ACADEMY_DB_GENERATION!=='SPLIT_V1'||env.JWT_V110_LOCAL_INTEGRATION==='1'||Object.keys(env).some(k=>k.startsWith('JWT_LOCAL_')))fail();
 if(p.capabilities[method]!==true)fail('PORTABLE_NATIVE_CAPABILITY_UNCLOSED');
 if(['AI','PROVIDERS','TRANSCRIPTION','SCHEDULES'].some(k=>env['JWT_V110_PORTABLE_'+k]!=='OFF')||env.VIDEO_AUTOLINK_HTTP_ENABLED!=='0'||env.LOCAL_VIDEO_MANUAL_SOURCE_ENABLED!=='0')fail();
 return p;
}
export function requirePortablePINOriginContract(){return bound();}
export function portableNativeDeploymentId(app){const p=bound();if(!['academy','studio','hifz'].includes(app))fail();return p.deploymentIds[app];}
export function portableChildProfile(env,app,method='http'){
 const p=requirePortableNativeMethod(env,app,method);
 if(!['studio','hifz'].includes(app)||typeof env.DB?.withSession!=='function'||env.DB===env.ACADEMY_DB||env.DB===env.ACADEMY_ADMIN_DB)fail();
 return Object.freeze({app,origin:p.origins[app],issuer:p.issuers[app],run:p.deploymentIds[app],rootRunId:p.deploymentIds.academy});
}
export function portableChildConfigError(){fail();}
export function portableNativeHTTPRequest(request,env,app){
 const p=requirePortableNativeMethod(env,app,'http'),u=new URL(request.url);
 if(u.origin!==p.origins[app]||u.username||u.password||request.headers.has('Host')&&request.headers.get('Host')!==u.host||(app!=='academy'&&request.headers.has('Authorization')))fail('PORTABLE_NATIVE_ORIGIN',403);
 if(request.headers.has('Origin')&&request.headers.get('Origin')!==p.origins[app])fail('PORTABLE_NATIVE_ORIGIN',403);
 if(!['GET','HEAD'].includes(request.method)&&(request.headers.get('Origin')!==p.origins[app]||request.headers.get('Sec-Fetch-Site')!=='same-origin'))fail('PORTABLE_NATIVE_ORIGIN',403);
 return p;
}
export function portableNativeUnavailable(){return new Response('Feature authentication is not activated.',{status:503,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}});}
export function portableNativeBinding(){fail('HTTPS_TRANSPORT_REQUIRED');}
