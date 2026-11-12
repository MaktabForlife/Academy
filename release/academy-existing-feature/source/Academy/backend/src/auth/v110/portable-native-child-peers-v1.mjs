// Source-only portable replacement for MSI loopback. No fetch/URL/Request,
// envelope reserialization, signed-body rewrite, synthetic ACK or auto retry.
import {WorkerEntrypoint} from 'cloudflare:workers';
import {requirePortableNativeMethod,portableNativeBinding,portableNativeUnavailable} from './portable-native-profile-v1.mjs';
import {childRPCPacket,childRPCSignedReply} from './portable-private-packet-grammar-v1.mjs';
const fail=()=>{throw Object.assign(Error('PORTABLE_NATIVE_RPC_UNAVAILABLE'),{code:'PORTABLE_NATIVE_RPC_UNAVAILABLE',status:503});};
async function invoke(env,app,binding,method,packet){
 requirePortableNativeMethod(env,'academy','rpc');
 const p=childRPCPacket(app,method,packet),service=portableNativeBinding(env,binding,method);let timer;
 try{return childRPCSignedReply(method,await Promise.race([service[method](p),new Promise((_yes,no)=>{timer=setTimeout(()=>no(Object.assign(Error('PORTABLE_NATIVE_RPC_TIMEOUT'),{status:503})),5000);})]));}
 catch{fail();}finally{clearTimeout(timer);}
}
export class StudioPINPeer extends WorkerEntrypoint {
 fetch(){return portableNativeUnavailable();}
 readIntent(packet){requirePortableNativeMethod(this.env,'academy','rpc');return invoke(this.env,'studio','studioPIN','readIntent',packet);}
 deliverProof(packet){requirePortableNativeMethod(this.env,'academy','rpc');return invoke(this.env,'studio','studioPIN','deliverProof',packet);}
}
export class HifzPINPeer extends WorkerEntrypoint {
 fetch(){return portableNativeUnavailable();}
 readIntent(packet){requirePortableNativeMethod(this.env,'academy','rpc');return invoke(this.env,'hifz','hifzPIN','readIntent',packet);}
 deliverProof(packet){requirePortableNativeMethod(this.env,'academy','rpc');return invoke(this.env,'hifz','hifzPIN','deliverProof',packet);}
}
export class StudioAuthPeer extends WorkerEntrypoint {
 fetch(){return portableNativeUnavailable();}
 stageAdmission(packet){requirePortableNativeMethod(this.env,'academy','rpc');return invoke(this.env,'studio','studioAuth','stageAdmission',packet);}
 deliverMasterEvent(packet){requirePortableNativeMethod(this.env,'academy','rpc');return invoke(this.env,'studio','studioAuth','deliverMasterEvent',packet);}
}
export class HifzAuthPeer extends WorkerEntrypoint {
 fetch(){return portableNativeUnavailable();}
 stageAdmission(packet){requirePortableNativeMethod(this.env,'academy','rpc');return invoke(this.env,'hifz','hifzAuth','stageAdmission',packet);}
 deliverMasterEvent(packet){requirePortableNativeMethod(this.env,'academy','rpc');return invoke(this.env,'hifz','hifzAuth','deliverMasterEvent',packet);}
}
export function createPortableNativeChildPeers(env){
 requirePortableNativeMethod(env,'academy','rpc');
 return Object.freeze({
 studio:Object.freeze({readIntent:p=>invoke(env,'studio','studioPIN','readIntent',p),deliverProof:p=>invoke(env,'studio','studioPIN','deliverProof',p),stageAdmission:p=>invoke(env,'studio','studioAuth','stageAdmission',p),deliverMasterEvent:p=>invoke(env,'studio','studioAuth','deliverMasterEvent',p)}),
 hifz:Object.freeze({readIntent:p=>invoke(env,'hifz','hifzPIN','readIntent',p),deliverProof:p=>invoke(env,'hifz','hifzPIN','deliverProof',p),stageAdmission:p=>invoke(env,'hifz','hifzAuth','stageAdmission',p),deliverMasterEvent:p=>invoke(env,'hifz','hifzAuth','deliverMasterEvent',p)})
 });
}
