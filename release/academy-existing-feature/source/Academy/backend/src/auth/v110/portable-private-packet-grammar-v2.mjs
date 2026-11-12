// Same native opaque packet grammar; all local transport/config exports removed.
const methods=Object.freeze({readIntent:6144,deliverProof:2048,stageAdmission:1024,deliverMasterEvent:4096});
const enc=new TextEncoder();
export function childRPCFailure(){throw Object.assign(Error('PORTABLE_NATIVE_RPC_UNAVAILABLE'),{code:'PORTABLE_NATIVE_RPC_UNAVAILABLE',status:503});}
export function childRPCRecord(value,keys){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.getOwnPropertySymbols(value).length||Object.keys(value).sort().join()!==[...keys].sort().join())childRPCFailure();
 const copy={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))childRPCFailure();copy[key]=d.value;}return Object.freeze(copy);
}
export function childRPCPacket(app,method,packet){
 if(!['studio','hifz'].includes(app)||!Object.hasOwn(methods,method))childRPCFailure();
 const fields=method==='readIntent'?['app','deadlineMs','intentId']:['app','deadlineMs','body','signature'];
 const p=childRPCRecord(packet,fields);
 if(p.app!==app||p.deadlineMs!==5000)childRPCFailure();
 if(method==='readIntent'){if(typeof p.intentId!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(p.intentId))childRPCFailure();}
 else if(typeof p.body!=='string'||enc.encode(p.body).byteLength>(method==='deliverProof'?6144:16384)||typeof p.signature!=='string'||!/^[a-f0-9]{64}$/.test(p.signature))childRPCFailure();
 return p;
}
export function childRPCSignedReply(method,value){
 if(!Object.hasOwn(methods,method))childRPCFailure();const reply=childRPCRecord(value,['body','signature']);
 if(typeof reply.body!=='string'||enc.encode(reply.body).byteLength>methods[method]||typeof reply.signature!=='string'||!/^[a-f0-9]{64}$/.test(reply.signature))childRPCFailure();
 // Root's ORIGINAL native contract verifies signature, operation, ACK and refence.
 // Transport never parses, signs, normalizes or rewrites this signed body.
 return reply;
}
