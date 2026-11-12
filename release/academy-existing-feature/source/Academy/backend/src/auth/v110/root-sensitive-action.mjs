// Server-private action binding. The actual native route must first authorize
// its action/scope/ownership, then obtain a genuine receipt, bind this auth,
// and rebind its repository BEFORE any protected side effect.
import {trustedCookieFacts} from './academy-cookie-auth.mjs';
import {nativeRootPINReceiptBinding} from './root-pin-evidence-plan-v4.mjs';
const bindings=new WeakMap();
const fail=()=>{throw Object.assign(Error('Sensitive action authority changed.'),{status:401,code:'SESSION_ENDED'});};
export function bindNativeRootSensitiveAction(auth,cap){
 const c=trustedCookieFacts(auth),p=nativeRootPINReceiptBinding(cap);
 if(!c||Object.keys(c).some(k=>c[k]!==p.claims[k]))fail();
 const previous=bindings.get(auth);
 if(previous&&JSON.stringify(previous)!==JSON.stringify(p))fail();
 bindings.set(auth,p);return auth;
}
export function rootSensitiveActorBinding(auth){
 const p=bindings.get(auth);if(!p)return undefined;
 const c=trustedCookieFacts(auth);if(!c||Object.keys(c).some(k=>c[k]!==p.claims[k]))fail();
 return p;
}
