import {rehearsalError} from './repository.js';
import {hifzProfileSnapshot,hifzSyncEnabled} from './hifz-profile-sync.js';
export async function issueHifzHandoff(env,auth,input,{fetcher=fetch}={}){
 if(env.HIFZ_HANDOFF_ENABLED!=='1'||!hifzSyncEnabled(env)||!env.SHARED_PIN_SECRET)throw rehearsalError('Hifz sign-in is unavailable.',503);
 const target=input.environment||env.HIFZ_PROFILE_SYNC_TARGET;
 const receiver=target===env.HIFZ_PROFILE_SYNC_TARGET?env.HIFZ_PROFILE_SYNC_URL:target==='development'?env.HIFZ_DEVELOPMENT_HANDOFF_URL:null;
 if(!receiver)throw rehearsalError('This Hifz environment is unavailable.',400);
 if(!/^[A-Za-z0-9_-]{43}$/.test(input.codeChallenge||'')||typeof input.expectedLoginId!=='string'||input.expectedLoginId.toLowerCase()!==auth.state.account.login_link_id.toLowerCase())throw rehearsalError('Your Academy account changed. Open Hifz again from Academy.',409,'HIFZ_ACCOUNT_CHANGED');
 const accountId=auth.state.account.account_id,db=env.ACADEMY_DB;
 // A current server-side session and effective Hifz membership are mandatory.
 // Login IDs and requested roles supplied by the browser never grant access.
 await db.prepare(`INSERT INTO hifz_profile_sync(account_id) SELECT account_id FROM hifz_profile_sync_projection WHERE account_id=? AND active=1 ON CONFLICT(account_id) DO NOTHING`).bind(accountId).run();
 const row=await db.prepare(`SELECT p.*,q.revision,q.pin_reset_version,c.pin_hash,c.pin_setup,c.credential_epoch
  FROM hifz_profile_sync_projection p JOIN hifz_profile_sync q USING(account_id) JOIN account_credentials c USING(account_id)
  WHERE p.account_id=? AND p.active=1 AND c.pin_setup=1 AND c.credential_epoch=?
  AND EXISTS(SELECT 1 FROM account_sessions s WHERE s.session_id=? AND s.account_id=p.account_id AND s.credential_epoch=c.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>?)`)
  .bind(accountId,auth.state.account.credential_epoch,auth.sid,new Date().toISOString()).first();
 if(!row)throw rehearsalError('Your account does not currently have Hifz access.',403,'HIFZ_ACCESS_REQUIRED');
 const url=new URL(receiver);
 if(url.protocol!=='https:'||url.pathname!=='/internal/academy/profile-sync'||url.username||url.password||url.search||url.hash)throw rehearsalError('Hifz sign-in is unavailable.',503);
 url.pathname='/internal/academy/handoff';
 const body=JSON.stringify({target,issuedAt:Date.now(),codeChallenge:input.codeChallenge,profile:hifzProfileSnapshot(row)});
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.HIFZ_PROFILE_SYNC_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('hifz-handoff-v1:'+body)))].map(b=>b.toString(16).padStart(2,'0')).join('');
 let response;try{response=await fetcher(url.href,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json','X-Academy-Handoff-Signature':signature},body});}
 catch{throw rehearsalError('Hifz is temporarily unavailable. Please try again.',503);}
 if(response.status!==200){await response.body?.cancel();throw rehearsalError('Hifz could not complete sign-in. Please try again.',503);}
 // The receiver's response contains only the one-use code, never credentials.
 const reader=response.body?.getReader();let text='',size=0;const decoder=new TextDecoder();
 if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();throw rehearsalError('Invalid Hifz response.',503);}text+=decoder.decode(value,{stream:true});}}finally{reader.releaseLock();}
 text+=decoder.decode();let result;try{result=JSON.parse(text);}catch{throw rehearsalError('Invalid Hifz response.',503);}
 if(!/^[A-Za-z0-9_-]{43}$/.test(result?.code||'')||result.expiresIn!==60)throw rehearsalError('Invalid Hifz response.',503);
 return {success:true,code:result.code,expiresIn:60};
}
