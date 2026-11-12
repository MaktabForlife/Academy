// Explicit NEW local child profile only. No production/legacy fallback and
// no trusted origin, app, run or key material is taken from a request.
export const childOrigins=Object.freeze({studio:'https://worshipuponbaseera.ummabbadacademy.app',hifz:'https://mahadarwa-hifz.ummabbadacademy.app'});
const fail=()=>{throw Object.assign(Error('Native JWT configuration unavailable'),{code:'CHILD_JWT_CONFIG_UNAVAILABLE',status:503});};
export function localChildProfile(env,app){
 if(!Object.hasOwn(childOrigins,app)||env.JWT_V110_CHILD_NATIVE_AUTH!=='1'||env.JWT_V110_LOCAL_INTEGRATION!=='1'||env.ENVIRONMENT!=='feature'||env.ACADEMY_DEPLOYMENT_KIND!=='ISOLATED_PREVIEW'||env.JWT_V110_STORAGE_PROFILE!=='LOCAL_TRIPLE_V1'||env.JWT_V110_COOKIE_MODE!=='HOST_ONLY_LOCAL_CHILD'||env.JWT_V110_APP!==app||env.JWT_V110_REQUEST_ORIGIN!==childOrigins[app]||env.JWT_V110_MASTER!=='0'||env.JWT_V110_BROWSER!=='1'||env.JWT_V110_REFRESH!=='1')fail();
 const run=env.JWT_LOCAL_NATIVE_RUN_ID;
 if(!/^[a-f0-9]{64}$/.test(run||'')||env.JWT_LOCAL_APP_BINDING!==app+':'+run||typeof env.DB?.withSession!=='function'||[env.ACADEMY_DB,env.ACADEMY_ADMIN_DB,env.JWT_V110_CORE_DB,env.JWT_V110_ADMIN_DB].filter(Boolean).includes(env.DB))fail();
 return Object.freeze({app,origin:childOrigins[app],run});
}
export function childConfigError(){fail();}
