import {base64url} from 'jose';
import {AuthContractError} from './claims.mjs';
const issuer='https://ummabbadacademy.app';
export async function academyDisplayCSRF(env,s){
 const raw=env.JWT_V110_CSRF_SECRET;
 if(typeof raw!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(raw))throw new AuthContractError('INVALID_CONFIG');
 const secret=base64url.decode(raw);if(secret.byteLength!==32||base64url.encode(secret)!==raw)throw new AuthContractError('INVALID_CONFIG');
 const key=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 // This DTO is produced by our current verified server context, never input.
 const packet=['uaa-csrf-v1','academy',issuer,s.sessionId,s.accountId,s.parentId,s.browserId,s.browserGeneration,s.credentialEpoch,s.unlockGeneration,s.originalSignedAtMs/1000,s.originalExpiresAtMs/1000];
 return base64url.encode(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(packet)))));
}

export const academyDisplaySession=(c,lastForegroundRefreshS,serverTimeS)=>({app:'academy',accountId:c.sub,sessionId:c.sid,parentId:c.psid,browserId:c.bsid,browserGeneration:c.bv,credentialEpoch:c.ce,securityVersion:c.pv,unlockGeneration:c.ue,originalSignedAtMs:c.s_iat*1000,originalExpiresAtMs:c.s_exp*1000,lastForegroundRefreshMs:lastForegroundRefreshS*1000,serverNowMs:serverTimeS*1000});
