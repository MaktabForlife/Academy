// SOURCE ONLY reader-specific denial ACK. Positive native ACK stays unchanged.
// A denial is a native read result, NOT an operation-wide no-effect promise.
import {signAdmissionPacket,verifyAdmissionACK} from './native-admission-delivery-contract.mjs';
const enc=new TextEncoder(),purpose='uaa-studio-reader-resource-denied-v1';
const fail=()=>{throw Object.assign(Error('STUDIO_READER_ACK_REJECTED'),{code:'STUDIO_READER_ACK_REJECTED',status:503});};
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function signStudioReaderDeniedACK({secret,expected}){
 return signAdmissionPacket({secret,kind:'ack',value:{ver:1,purpose,...expected,committed:false,code:'RESOURCE_ACCESS_REQUIRED',ticketEffect:'UNCONFIRMED'}});
}
export async function verifyStudioReaderACK({packet,secret,expected}){
 if(!exact(packet,['body','signature'])||typeof packet.body!=='string'||enc.encode(packet.body).length>1024||typeof packet.signature!=='string'||!/^[a-f0-9]{64}$/.test(packet.signature))fail();
 let value;try{value=JSON.parse(packet.body);}catch{fail();}
 if(value?.purpose!==purpose){await verifyAdmissionACK({packet,secret,expected});return Object.freeze({committed:true});}
 if(typeof secret!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(secret))fail();
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('HMAC',key,Uint8Array.from(packet.signature.match(/../g),v=>parseInt(v,16)),enc.encode('uaa-child-admission-ack-v1\n'+packet.body)))fail();
 if(!exact(value,['ver','purpose','app','operationId','codeHash','packetDigest','committed','code','ticketEffect'])||value.ver!==1||value.purpose!==purpose||value.committed!==false||value.code!=='RESOURCE_ACCESS_REQUIRED'||value.ticketEffect!=='UNCONFIRMED'||['app','operationId','codeHash','packetDigest'].some(k=>value[k]!==expected[k]))fail();
 return Object.freeze({committed:false,resourceDenied:true,ticketEffect:'UNCONFIRMED'});
}
