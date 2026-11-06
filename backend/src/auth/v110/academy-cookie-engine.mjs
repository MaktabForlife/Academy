// The production parent-domain policy is unchanged. The only alternate cookie
// policy is the explicitly configured isolated Academy Feature Worker host.
import {AuthContractError} from './claims.mjs';
import {createNativeCookieEngine} from './native-rights.mjs';
const previewOrigin='https://feature_worker.maktab4life.workers.dev';
const fail=()=>{throw new AuthContractError('INVALID_COOKIE_CONFIG');};
export function academyCookieOptions(env){
 const mode=env.JWT_V110_COOKIE_MODE||'ROOT_SHARED';
 if(mode==='ROOT_SHARED')return {academyCookieMode:mode};
 if(mode!=='HOST_ONLY_PREVIEW'||env.ENVIRONMENT!=='feature'||env.ACADEMY_DEPLOYMENT_KIND!=='ISOLATED_PREVIEW'||env.ACADEMY_DB_GENERATION!=='SPLIT_V1'||env.JWT_V110_REQUEST_ORIGIN!==previewOrigin)fail();
 return {academyCookieMode:mode,academyPreviewProfile:'academy-feature-v110',academyPreviewOrigin:previewOrigin};
}
export async function createAcademyCookieEngine(config){
 const mode=config.academyCookieMode||'ROOT_SHARED';
 if(mode!=='ROOT_SHARED'&&(mode!=='HOST_ONLY_PREVIEW'||config.academyPreviewProfile!=='academy-feature-v110'||config.academyPreviewOrigin!==previewOrigin))fail();
 const engine=await createNativeCookieEngine(config);
 if(mode==='ROOT_SHARED')return engine;
 const hostOnly=value=>{
  const suffix='; Domain=ummabbadacademy.app';
  if(typeof value!=='string'||!value.endsWith(suffix)||config.academyCookieDomain!=='ummabbadacademy.app')fail();
  return value.slice(0,-suffix.length);
 };
 return Object.freeze({
  async issue(input,rights,now){const issued=await engine.issue(input,rights,now);return {...issued,setCookie:hostOnly(issued.setCookie)};},
  verify:(token,now)=>engine.verify(token,now),
  accessCookie:(token,expiresAt,now)=>hostOnly(engine.accessCookie(token,expiresAt,now)),
  refreshCookie:(token,expiresAt,now)=>engine.refreshCookie(token,expiresAt,now)
 });
}
