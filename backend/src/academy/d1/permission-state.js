import {payloadHash} from '../../programs/timetable-model.js';
import {permissionSignature} from '../separation/proof.js';

const format='ACADEMY_PERMISSION_STATE_V2',maxBytes=2*1024*1024;
const verified=Symbol('request permission verification');
function currentState(data,gate){
 const state={...data,account:gate.account};
 Object.defineProperty(state,verified,{value:{version:gate.core,signature:permissionSignature({globalAdmin:state.account.global_admin,roles:state.roles,subscriptions:state.subscriptions,grants:JSON.parse(state.account.substitute_grants||'[]'),...(state.monthlyMediaEnabled?{monthlyMedia:state.monthlyMedia}:{} )})}});
 return state;
}
// This non-serializable marker lives only on the server's current request
// object. Neither a browser payload nor an R2 object can supply it.
export const verifiedPermissionVersion=(state,signature)=>state?.[verified]?.signature===signature?state[verified].version:undefined;
// Cache the derived directory/roles, never credentials or a decision to accept
// a session. The primary database gate validates the current session, account,
// credential epoch, timed grants and permission revision on every request.
export async function permissionState({bucket,namespace,accountId,gate,load,now=Date.now()}){
 if(!bucket?.get||!bucket.put)return load();
 const key='academy-private-permissions/v1/'+await payloadHash([namespace,accountId.toUpperCase()])+'.json';
 for(let attempt=0;attempt<2;attempt++){
  const before=await gate();if(!before)return null;if(!before.enabled)return load();
  let stored=null;
  try{const object=await bucket.get(key);if(object&&object.size<=maxBytes)stored=await object.json();}catch{/* An optional cache outage uses the same database reader. */}
  const hit=stored?.format===format&&stored.revision===before.revision&&stored.expiresAt>now&&['activities','roles','subscriptions','contexts','monthlyMedia'].every(key=>Array.isArray(stored.data?.[key]))&&typeof stored.data?.myLinksAvailable==='boolean';
  const state=hit?stored.data:await load();if(!state)return null;
  const after=await gate();if(!after)return null;if(before.revision!==after.revision)continue;
  // Explicit allowlist keeps PIN hashes, credential details and session tokens
  // out of the private cache, including after a future account schema change.
  const data=Object.fromEntries(['activities','roles','subscriptions','contexts','myLinksAvailable','monthlyMedia','monthlyMediaEnabled'].map(key=>[key,key==='monthlyMedia'?(state[key]||[]):key==='monthlyMediaEnabled'?state[key]===true:state[key]]));
  if(!hit){
   const json=JSON.stringify({format,revision:after.revision,expiresAt:now+7*86400000,data});
   if(new TextEncoder().encode(json).byteLength<=maxBytes){
    try{await bucket.put(key,json,{httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});}catch{/* Continue with the current database result. */}
    const final=await gate();if(!final)return null;if(after.revision!==final.revision)continue;
    return currentState(data,final);
   }
  }
  return currentState(data,after);
 }
 throw Object.assign(Error('Your permissions changed while loading. Please refresh.'),{status:409,code:'PERMISSIONS_CHANGED'});
}
