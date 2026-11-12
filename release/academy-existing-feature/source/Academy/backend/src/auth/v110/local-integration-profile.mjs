// Explicit local-only configuration guard. No request, storage or network access.
export const LOCAL_INTEGRATION_ORIGIN='https://ummabbadacademy.app';
const fail=()=>{throw Object.assign(Error('Local JWT integration configuration is unavailable'),{code:'JWT_LOCAL_INTEGRATION_UNAVAILABLE',status:503});};
export function assertLocalIntegrationProfile(env){
 if(env.JWT_V110_LOCAL_INTEGRATION!=='1'||env.ENVIRONMENT!=='feature'||env.ACADEMY_DEPLOYMENT_KIND!=='ISOLATED_PREVIEW'||env.ACADEMY_DB_GENERATION!=='SPLIT_V1'||env.JWT_V110_STORAGE_PROFILE!=='LOCAL_TRIPLE_V1'||env.JWT_V110_COOKIE_MODE!=='HOST_ONLY_LOCAL_INTEGRATION'||env.JWT_V110_REQUEST_ORIGIN!==LOCAL_INTEGRATION_ORIGIN)fail();
}
export function localIntegrationCookieOptions(env){
 assertLocalIntegrationProfile(env);
 return {academyCookieMode:'HOST_ONLY_LOCAL_INTEGRATION',academyLocalProfile:'msi-local-triple-v1',academyLocalOrigin:LOCAL_INTEGRATION_ORIGIN};
}
export function validLocalCookieEngineProfile(config){
 return config.academyCookieMode==='HOST_ONLY_LOCAL_INTEGRATION'&&config.academyLocalProfile==='msi-local-triple-v1'&&config.academyLocalOrigin===LOCAL_INTEGRATION_ORIGIN&&config.issuer===LOCAL_INTEGRATION_ORIGIN&&config.academyCookieDomain==='ummabbadacademy.app';
}
