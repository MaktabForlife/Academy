// SOURCE ONLY UNBOUND. Portable profile is a compiled source commitment.
// No request, binding lookup, storage, keys or environment projection at import.
const frozen=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))frozen(x);Object.freeze(v);}return v;};
const selected=frozen({
 schema:'PORTABLE_NATIVE_FEATURE_PROFILE_V1',status:'UNBOUND',profileId:null,
 origins:{academy:null,studio:null,hifz:null},
 issuers:{academy:null,studio:null,hifz:null},
 deploymentIds:{academy:null,studio:null,hifz:null},
 rootCookieMode:null,rootCookieDomain:null,
 bindingNames:{studioPIN:null,hifzPIN:null,studioAuth:null,hifzAuth:null,studioStatus:null},
 rootDatabaseIds:{core:null,admin:null},workerNames:{academy:null,coordinator:null,studio:null,hifz:null},
 // Null means source closure is NOT implemented/reviewed, never an env switch.
 contracts:{rpc:'DIRECT_PRIVATE_NATIVE_PACKET_V1',pin:'NATIVE_PIN_ORIGIN_PARALLEL_V1',master:'NATIVE_SIGNED_MASTER_EVENT_V1',http:null,admission:null,reader:null,coordinator:null,timetable:null,rootBridge:null}
});
export const portableNativeOrigins=selected.origins;
export const portableChildOrigins=Object.freeze({studio:selected.origins.studio,hifz:selected.origins.hifz});
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=(code='PORTABLE_NATIVE_UNAVAILABLE',status=503)=>{throw Object.assign(Error(code),{code,status});};
export function portableNativeUnavailable(){return new Response('Feature authentication is not activated.',{status:503,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}});}
function bound(){
 if(selected.status!=='ROOT_REVIEWED_PORTABLE_NATIVE_V1'||!hex(selected.profileId))fail();
 for(const app of ['academy','studio','hifz']){
  const origin=selected.origins[app];let u;try{u=new URL(origin);}catch{fail();}
  if(typeof origin!=='string'||u.origin!==origin||u.protocol!=='https:'||u.username||u.password||u.port||selected.issuers[app]!==origin||!hex(selected.deploymentIds[app]))fail();
  if(['https://ummabbadacademy.app','https://worshipuponbaseera.ummabbadacademy.app','https://mahadarwa-hifz.ummabbadacademy.app'].includes(origin))fail();
 }
 if(new Set(Object.values(selected.origins)).size!==3||new Set(Object.values(selected.deploymentIds)).size!==3||!['HOST_ONLY','APPROVED_SHARED_PARENT'].includes(selected.rootCookieMode))fail();
 if(selected.rootCookieMode==='HOST_ONLY'&&selected.rootCookieDomain!==null)fail();
 if(selected.rootCookieMode==='APPROVED_SHARED_PARENT'){
  const domain=selected.rootCookieDomain;if(domain!==new URL(selected.origins.academy).hostname||typeof domain!=='string'||domain.endsWith('workers.dev')||!Object.values(selected.origins).every(v=>{const h=new URL(v).hostname;return h===domain||h.endsWith('.'+domain);}))fail();
 }
 const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
 if(!uuid(selected.rootDatabaseIds.core)||!uuid(selected.rootDatabaseIds.admin)||selected.rootDatabaseIds.core===selected.rootDatabaseIds.admin)fail();
 const names=Object.values(selected.workerNames);
 if(names.some(n=>typeof n!=='string'||!/^[-a-z0-9]{3,63}$/.test(n)||['feature_worker','academy-feature-split-coordinator'].includes(n))||new Set(names).size!==4)fail();
 const peers=Object.values(selected.bindingNames);
 if(peers.some(n=>typeof n!=='string'||!/^[_A-Za-z][_A-Za-z0-9]*$/.test(n))||new Set(peers).size!==peers.length)fail();
 return selected;
}
export function requirePortablePINOriginContract(){return bound();}
export function portableNativeDeploymentId(app){const p=bound();if(!['academy','studio','hifz'].includes(app))fail();return p.deploymentIds[app];}
export function requirePortableNativeMethod(env,app,method){
 // The OFF branch precedes profile, binding, DB, secret and native construction.
 if(env?.JWT_V110_PORTABLE_ACTIVATION!=='ROOT_COORDINATED_ACCEPTED_PROFILE')fail();
 const p=bound();
 if(!['academy','coordinator','studio','hifz'].includes(app)||env.JWT_V110_PORTABLE_APP!==app||env.JWT_V110_PORTABLE_PROFILE_SHA256!==p.profileId||env.ENVIRONMENT!=='feature'||env.ACADEMY_DEPLOYMENT_KIND!=='ISOLATED_PORTABLE_FEATURE'||env.JWT_V110_LOCAL_INTEGRATION==='1'||Object.keys(env).some(k=>k.startsWith('JWT_LOCAL_')))fail();
 if(!Object.hasOwn(p.contracts,method)||p.contracts[method]===null)fail('PORTABLE_NATIVE_CAPABILITY_UNCLOSED');
 if(env.JWT_V110_PORTABLE_AI!=='OFF'||env.JWT_V110_PORTABLE_PROVIDERS!=='OFF'||env.JWT_V110_PORTABLE_TRANSCRIPTION!=='OFF'||env.JWT_V110_PORTABLE_SCHEDULES!=='OFF'||env.VIDEO_AUTOLINK_HTTP_ENABLED!=='0'||env.LOCAL_VIDEO_MANUAL_SOURCE_ENABLED!=='0')fail();
 return p;
}
export function portableChildProfile(env,app,method='http'){
 const p=requirePortableNativeMethod(env,app,method);
 if(!['studio','hifz'].includes(app)||typeof env.DB?.withSession!=='function'||env.DB===env.ACADEMY_DB||env.DB===env.ACADEMY_ADMIN_DB)fail();
 return Object.freeze({app,origin:p.origins[app],issuer:p.issuers[app],run:p.deploymentIds[app],rootRunId:p.deploymentIds.academy});
}
export function portableChildConfigError(){fail();}
export function portableNativeHTTPRequest(request,env,app){
 const p=requirePortableNativeMethod(env,app,'http'),u=new URL(request.url);
 if(u.origin!==p.origins[app]||u.username||u.password||request.headers.has('Host')&&request.headers.get('Host')!==u.host||request.headers.has('Authorization'))fail('PORTABLE_NATIVE_ORIGIN',403);
 if(request.headers.has('Origin')&&request.headers.get('Origin')!==p.origins[app])fail('PORTABLE_NATIVE_ORIGIN',403);
 if(!['GET','HEAD'].includes(request.method)&&(request.headers.get('Origin')!==p.origins[app]||request.headers.get('Sec-Fetch-Site')!=='same-origin'))fail('PORTABLE_NATIVE_ORIGIN',403);
 return p;
}
export function portableNativeBinding(env,name,method){
 const p=requirePortableNativeMethod(env,'academy','rpc'),binding=p.bindingNames[name];
 if(typeof binding!=='string'||!/^[-A-Za-z0-9_]{1,100}$/.test(binding)||typeof env[binding]?.[method]!=='function')fail();
 return env[binding];
}
