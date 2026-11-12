import {websiteActivity} from './website-access.js';
import {isAdminWorkspace,actualState} from './workspace-access.js';
import {verifySessionToken} from '../../lib/auth-primitives.js';
import {canonicalSite,siteId,sha256,boundedJSON,error} from '../../../../website-studio/src/protocol.mjs';
export function studioOrigin(env){if(env.ACADEMY_WEBSITE_STUDIO!=='1'||!env.WEBSITE_STUDIO_CONTENT||!env.WEBSITE_STUDIO_ORIGIN)return null;const url=new URL(env.WEBSITE_STUDIO_ORIGIN);if(url.origin!==env.WEBSITE_STUDIO_ORIGIN||url.protocol!=='https:'&&!(env.ENVIRONMENT==='local'&&url.hostname==='localhost'))throw error('Website Studio configuration is invalid.',503);return url.origin;}
export async function studioHandoff(request,env,repository,auth,input){
 const origin=studioOrigin(env);if(!origin)throw error('Website Studio is not enabled.',503,'STUDIO_DISABLED');
 if(!isAdminWorkspace(auth)||auth.adminView||!actualState(auth).account.global_admin&&!actualState(auth).roles.some(r=>r.role==='PROGRAM_ADMIN'))throw error('Open Admin with current website authority.',403);
 if(!/^[A-Za-z0-9_-]{43}$/.test(input.codeChallenge||'')||!/^[A-Za-z0-9_-]{43}$/.test(input.state||''))throw error('Reopen Website Studio from Academy.');
 const selection=input.activityKey?canonicalSite(input):null;if(selection){siteId(selection);await websiteActivity(repository.authoringRepository(),auth,selection,true);}
 const token=request.headers.get('Authorization').slice(7),signed=await verifySessionToken(token,env);
 const response=await env.WEBSITE_STUDIO_CONTENT.fetch(new Request('https://studio-content.internal/handoff',{method:'POST',body:JSON.stringify({token,challenge:input.codeChallenge,state:input.state,selection,accountId:auth.user.accountid,sourceTokenHash:await sha256(token),sessionExpiresAt:signed.exp*1000})}));
 if(!response.ok)throw error('Website Studio sign-in is temporarily unavailable.',503);const data=await boundedJSON(response.body,4096);
 if(!/^[A-Za-z0-9_-]{43}$/.test(data.code||''))throw error('Website Studio sign-in is temporarily unavailable.',503);
 return {success:true,url:origin+'/connect#'+new URLSearchParams({code:data.code,state:input.state}),expiresIn:60};
}
