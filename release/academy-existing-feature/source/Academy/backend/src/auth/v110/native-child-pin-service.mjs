// Private child-side RPC implementation. Only a named WorkerEntrypoint mounts it.
// No public fetch route, Root store, URL-selected peer or ordinary resource grant.
import {localChildProfile} from './local-child-profile.mjs';
import {nativeChildPrimaryStore} from './child-auth-http.mjs';
import {readNativeChildPINIntentForRoot,receiveNativeChildPINProof} from './native-child-pin-unlock.mjs';
const fail=()=>{throw Object.assign(Error('PRIVATE_CHILD_PIN_SERVICE_REJECTED'),{code:'PRIVATE_CHILD_PIN_SERVICE_REJECTED',status:503});};
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function createNativeChildPINService(env,app){
 // The app is a source literal in the child-specific entrypoint, never RPC input.
 const profile=localChildProfile(env,app);
 if(env.JWT_LOCAL_STAGE!=='V110_INTEGRATION'||env.JWT_LOCAL_BACKEND_EGRESS!=='DENY_ALL'||env.JWT_LOCAL_AI!=='OFF'||env.JWT_LOCAL_PROVIDERS!=='OFF'||env.JWT_LOCAL_TRANSCRIPTION!=='OFF'||env.JWT_LOCAL_SCHEDULES!=='OFF'||env.JWT_V110_CHILD_PIN!=='NATIVE_ROOT_V1'||!/^[a-f0-9]{64}$/.test(env.JWT_LOCAL_ROOT_RUN_ID||'')||!/^[-A-Za-z0-9_]{43}$/.test(env.JWT_V110_CHILD_PIN_SECRET||''))fail();
 const secret=env.JWT_V110_CHILD_PIN_SECRET,rootRunId=env.JWT_LOCAL_ROOT_RUN_ID,childRunId=profile.run;
 const check=(packet,fields)=>{
  if(!exact(packet,[...fields,'app','deadlineMs'])||packet.app!==app||packet.deadlineMs!==5000)fail();
 };
 const invoke=async(kind,packet)=>{
  const store=nativeChildPrimaryStore(env);
  try{
   return await(kind==='intent'?readNativeChildPINIntentForRoot({store,app,intentId:packet.intentId,secret,rootRunId,childRunId}):receiveNativeChildPINProof({store,app,body:packet.body,signature:packet.signature,secret,rootRunId,childRunId}));
  }catch{fail();} // Never export native rows, SQL, key material or native error text.
 };
 return Object.freeze({
  readIntent(packet){check(packet,['intentId']);if(typeof packet.intentId!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(packet.intentId))fail();return invoke('intent',packet);},
  deliverProof(packet){check(packet,['body','signature']);if(typeof packet.body!=='string'||new TextEncoder().encode(packet.body).length>6144||typeof packet.signature!=='string'||!/^[a-f0-9]{64}$/.test(packet.signature))fail();return invoke('proof',packet);}
 });
}
