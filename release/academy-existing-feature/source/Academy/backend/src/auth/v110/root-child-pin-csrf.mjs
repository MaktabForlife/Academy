// Root child-PIN form CSRF. This nonce authorizes no API/material access and
// binds the exact current Root parent plus one signed child intent.
import {childPINIntentDigest} from './child-pin-unlock-contract.mjs';
const fail=(code='CHILD_PIN_CSRF_REJECTED',status=403)=>{throw Object.assign(Error(code),{code,status});};
const encode=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const tuple=['family_id','account_id','parent_session_id','browser_id','browser_generation','credential_epoch','unlock_generation','original_signed_in_at_s','original_expires_at_s','current_permission_version'];
async function key(env,usage){
 const raw=env.JWT_V110_CSRF_SECRET;
 if(typeof raw!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(raw))fail('CHILD_PIN_CONFIG',503);
 let bytes;try{bytes=Uint8Array.from(atob(raw.replaceAll('-','+').replaceAll('_','/')+'='),x=>x.charCodeAt(0));}catch{fail('CHILD_PIN_CONFIG',503);}
 if(bytes.length!==32||encode(bytes)!==raw)fail('CHILD_PIN_CONFIG',503);
 return crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,[usage]);
}
async function packet(parent,intent){
 if(!parent||!intent||tuple.some(k=>parent[k]===undefined))fail('CHILD_PIN_CONFIG',503);
 return new TextEncoder().encode(JSON.stringify(['uaa-root-child-pin-csrf-v1','https://ummabbadacademy.app',...tuple.map(k=>parent[k]),intent.app,intent.intentId,await childPINIntentDigest(intent)]));
}
export async function rootChildPINCSRF(env,{parent,intent}){
 return encode(new Uint8Array(await crypto.subtle.sign('HMAC',await key(env,'sign'),await packet(parent,intent))));
}
export async function verifyRootChildPINCSRF(request,env,{parent,intent}){
 const token=request.headers.get('X-UAA-CHILD-PIN-CSRF');
 if(typeof token!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(token))fail();
 let bytes;try{bytes=Uint8Array.from(atob(token.replaceAll('-','+').replaceAll('_','/')+'='),x=>x.charCodeAt(0));}catch{fail();}
 if(bytes.length!==32||encode(bytes)!==token||!await crypto.subtle.verify('HMAC',await key(env,'verify'),bytes,await packet(parent,intent)))fail();
}
