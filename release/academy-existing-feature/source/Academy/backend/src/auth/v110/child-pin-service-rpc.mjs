// Fixed private service capability adapter. No URL, fetch, DB or browser input.
const names=Object.freeze({studio:'JWT_LOCAL_STUDIO_PIN_SERVICE',hifz:'JWT_LOCAL_HIFZ_PIN_SERVICE'});
const fail=()=>{throw Object.assign(Error('CHILD_PIN_SERVICE_UNAVAILABLE'),{code:'CHILD_PIN_SERVICE_UNAVAILABLE',status:503});};
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function createChildPINServicePeers(env){
 const services=Object.fromEntries(Object.entries(names).map(([app,key])=>[app,env[key]]));
 if(!services.studio||!services.hifz||services.studio===services.hifz||Object.values(services).some(s=>typeof s.readIntent!=='function'||typeof s.deliverProof!=='function'))fail();
 const peers={};
 for(const app of ['studio','hifz']){
  const service=services[app];
  const check=(packet,fields)=>{
   if(!exact(packet,[...fields,'app','signal','deadlineMs'])||packet.app!==app||packet.deadlineMs!==5000||!(packet.signal instanceof AbortSignal)||packet.signal.aborted)fail();
  };
  peers[app]=Object.freeze({
   async readIntent(packet){
    check(packet,['intentId']);
    if(typeof packet.intentId!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(packet.intentId))fail();
    // AbortSignal is local only; the fixed RPC packet is structured-cloneable.
    const result=await service.readIntent({app,intentId:packet.intentId,deadlineMs:5000});
    if(packet.signal.aborted)fail();return result;
   },
   async deliverProof(packet){
    check(packet,['body','signature']);
    if(typeof packet.body!=='string'||new TextEncoder().encode(packet.body).length>6144||typeof packet.signature!=='string'||!/^[a-f0-9]{64}$/.test(packet.signature))fail();
    const result=await service.deliverProof({app,body:packet.body,signature:packet.signature,deadlineMs:5000});
    if(packet.signal.aborted)fail();return result;
   }
  });
 }
 return Object.freeze(peers);
}
export function withoutChildPINServices(env){
 const selected={...env};
 for(const key of Object.values(names))delete selected[key];
 return selected;
}
