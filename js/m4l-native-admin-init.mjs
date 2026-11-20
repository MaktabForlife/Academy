// One initial neutral auth-preflight recovery. This never sends/retries a
// native business read, Save, upload, PIN/admission or operation-status request.
const fields=['app','sub','sid','psid','bsid','bv','ce','ae','le','ue'];
const same=(a,b)=>a&&b&&fields.every(key=>a[key]===b[key]);
export async function prepareInitialAdminForm(client,{hasPrivateWork=()=>false,onRetry=()=>{}}={}){
 const before=client.getContext();await client.ensureFresh();
 try{return await client.prepareSensitive({activeWork:true});}
 catch(error){
  const now=client.getContext(),state=client.getState();
  if(error?.code!=='STALE_BROWSER_RESPONSE'||hasPrivateWork()||state?.state!=='UNLOCKED'||state.suspended||state.validationRequired||!now||(before!==null&&!same(before,now)))throw error;
  await client.ensureFresh();const fresh=client.getContext(),current=client.getState();
  if(hasPrivateWork()||!same(now,fresh)||current?.state!=='UNLOCKED'||current.suspended||current.validationRequired)throw error;
  onRetry({attempt:1});return client.prepareSensitive({activeWork:false});
 }
}
