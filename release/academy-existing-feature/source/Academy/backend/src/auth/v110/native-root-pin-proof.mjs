// SOURCE ONLY new Root-own provenance. Never a child-unlock proof or request DTO.
// Only the owning native verified-PIN branch may call capture; no public route.
const pending=new WeakMap(),consumed=new WeakMap();
const fail=()=>{throw Object.assign(Error('ROOT_NATIVE_PIN_PROOF_REQUIRED'),{code:'ROOT_NATIVE_PIN_PROOF_REQUIRED',status:401});};
const stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
export function captureNativeRootPINVerification(state,context){
 const a=state?.account,at=Date.now(),monotonic=performance.now();
 if(!a||!stable(a.account_id)||typeof a.login_link_id!=='string'||!a.login_link_id.trim()||a.login_link_id.length>160||a.active!==1||a.pin_setup!==1||typeof a.pin_hash!=='string'||!a.pin_hash.trim()||!Number.isSafeInteger(a.credential_epoch)||a.credential_epoch<1||!state.contexts?.includes(context)||!Number.isSafeInteger(at)||!Number.isFinite(monotonic))fail();
 const cap=Object.freeze({kind:'native-root-pin-verification'});
 pending.set(cap,{accountId:a.account_id,loginLinkId:a.login_link_id,credentialEpoch:a.credential_epoch,verifiedAtMs:at,monotonic,context:structuredClone(context),used:false});
 return cap;
}
export function consumeNativeRootPINVerification(cap,{accountId,loginLinkId,credentialEpoch,now=Date.now()}={}){
 const p=pending.get(cap);if(!p||p.used)fail();p.used=true;
 const elapsed=performance.now()-p.monotonic;
 if(!Number.isSafeInteger(now)||now<p.verifiedAtMs||now-p.verifiedAtMs>5000||!Number.isFinite(elapsed)||elapsed<0||elapsed>5000||p.accountId!==accountId||p.loginLinkId!==loginLinkId||p.credentialEpoch!==credentialEpoch)fail();
 const evidence=Object.freeze({kind:'consumed-native-root-pin'});
 consumed.set(evidence,{...p,pinVerifiedAtS:Math.floor(p.verifiedAtMs/1000),receiptPrepared:false});
 return evidence;
}
// Used once only by the NEW trusted issuer/refresh metadata planner.
export function consumeNativeRootPINReceiptFacts(evidence){
 const p=consumed.get(evidence);if(!p||p.receiptPrepared)fail();p.receiptPrepared=true;
 return Object.freeze({accountId:p.accountId,credentialEpoch:p.credentialEpoch,pinVerifiedAtS:p.pinVerifiedAtS});
}
