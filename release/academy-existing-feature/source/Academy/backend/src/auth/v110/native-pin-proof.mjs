// Server-private one-use evidence from the owning native PIN verifier only.
// No credentials, identity or authority are serialized in the opaque handle.
const proofs=new WeakMap();
const fail=()=>{throw Object.assign(Error('Native PIN proof required'),{code:'NATIVE_PIN_PROOF_REQUIRED',status:401});};
const stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
export function captureNativePINVerification(state,context){
 const account=state?.account,at=Date.now(),monotonic=performance.now();
 if(!account||!stable(account.account_id)||typeof account.login_link_id!=='string'||!account.login_link_id.trim()||account.login_link_id.length>160||account.active!==1||account.pin_setup!==1||typeof account.pin_hash!=='string'||!account.pin_hash.trim()||!Number.isSafeInteger(account.credential_epoch)||account.credential_epoch<1||!Array.isArray(state.contexts)||!state.contexts.includes(context)||!Number.isSafeInteger(at)||!Number.isFinite(monotonic))fail();
 const cap=Object.freeze({kind:'native-pin-verification',scope:'child-unlock'});
 proofs.set(cap,{accountId:account.account_id,loginLinkId:account.login_link_id,credentialEpoch:account.credential_epoch,verifiedAtMs:at,monotonic,context:structuredClone(context),used:false});return cap;
}
export function consumeNativePINVerification(cap,{accountId,loginLinkId,credentialEpoch,now=Date.now()}={}){
 const proof=proofs.get(cap);if(!proof||proof.used)fail();proof.used=true;
 const elapsed=performance.now()-proof.monotonic;
 if(!Number.isFinite(elapsed)||elapsed<0||elapsed>5000||!Number.isSafeInteger(now)||now<proof.verifiedAtMs||now-proof.verifiedAtMs>5000||proof.accountId!==accountId||proof.loginLinkId!==loginLinkId||proof.credentialEpoch!==credentialEpoch)fail();
 return Object.freeze({accountId:proof.accountId,credentialEpoch:proof.credentialEpoch,verifiedAtS:Math.floor(proof.verifiedAtMs/1000),context:Object.freeze(structuredClone(proof.context))});
}
