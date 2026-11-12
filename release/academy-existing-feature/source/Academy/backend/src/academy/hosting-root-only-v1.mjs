// Root-only trusted address map. No request-header or legacy-origin configuration.
const origin='https://maktabhelper.app';
const fixed=Object.freeze({academyPortalOrigin:origin,academyApiOrigin:origin,academyLegacyOrigins:Object.freeze([]),environment:'feature'});
const fail=()=>{throw Object.assign(Error('ROOT_ONLY_HOSTING_UNAVAILABLE'),{code:'ROOT_ONLY_HOSTING_UNAVAILABLE',status:503});};
export function exactOrigin(value){if(value!==origin)fail();return origin;}
export function hosting(value){if(value!==undefined&&value!==fixed)fail();return fixed;}
export function academyManagementOriginAllowed(value,config){if(config!==undefined&&config!==fixed)fail();return value===origin;}
export function hostingEnvironment(env){
 if(env.API_ORIGIN!==origin||env.ALLOWED_ORIGINS!==origin||env.ENVIRONMENT!=='feature'||['WEBSITE_PLATFORM_ORIGIN','WEBSITE_PLATFORM_SERVER_ORIGIN','WEBSITE_STUDIO_ORIGIN','WEBSITE_STUDIO_CONTENT','HIFZ_PROFILE_SYNC_URL'].some(k=>Object.hasOwn(env,k)))fail();
 return {...env,ALLOWED_ORIGINS:origin};
}
