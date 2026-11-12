// Exact Root PIN peer ABI over authenticated fixed HTTPS, never service bindings.
import {sendNativeHTTPS} from './native-https-sender-v1.mjs';
import {requirePortableNativeMethod} from './portable-native-profile-v5.mjs';
import {exactRecord} from './native-https-contract-v1.mjs';
const fail=()=>{throw Object.assign(Error('CHILD_PIN_SERVICE_UNAVAILABLE'),{status:503,code:'CHILD_PIN_SERVICE_UNAVAILABLE'});};
export function createChildPINServicePeers(env){
 requirePortableNativeMethod(env,'academy','pin');
 return Object.freeze(Object.fromEntries(['studio','hifz'].map(app=>[app,Object.freeze({
  async readIntent(packet){return invoke(app,'pin.intent',packet,['intentId']);},
  async deliverProof(packet){return invoke(app,'pin.proof',packet,['body','signature']);}
 })])));
 async function invoke(app,purpose,packet,fields){
  exactRecord(packet,[...fields,'app','signal','deadlineMs']);
  if(packet.app!==app||packet.deadlineMs!==5000||!(packet.signal instanceof AbortSignal)||packet.signal.aborted)fail();
  if(purpose==='pin.intent'?(typeof packet.intentId!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(packet.intentId)):(typeof packet.body!=='string'||new TextEncoder().encode(packet.body).length>6144||typeof packet.signature!=='string'||!/^[a-f0-9]{64}$/.test(packet.signature)))fail();
  const {signal,...body}=packet,result=JSON.parse(await sendNativeHTTPS(env,{from:'academy',to:packet.app,purpose,body:JSON.stringify(body)}));
  if(signal.aborted)fail();return result;
 }
}
export function withoutChildPINServices(env){const selected={...env};delete selected.JWT_LOCAL_STUDIO_PIN_SERVICE;delete selected.JWT_LOCAL_HIFZ_PIN_SERVICE;return selected;}
