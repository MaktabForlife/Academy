// Source-only private first-admission envelope. Native grants remain app-owned.
import {parseChildAdmission} from './child-admission-contract.mjs';
import {portableChildOrigins as origins} from './portable-native-profile-v5.mjs';
const enc=new TextEncoder();
const fail=()=>{throw Object.assign(Error('NATIVE_ADMISSION_DELIVERY_REJECTED'),{code:'NATIVE_ADMISSION_DELIVERY_REJECTED',status:401});};
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
export const admissionPacketDigest=async value=>hex(await crypto.subtle.digest('SHA-256',enc.encode(value)));
async function key(secret,usage){if(typeof secret!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(secret))fail();return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,[usage]);}
export async function signAdmissionPacket({value,secret,kind='delivery'}){
 if(!['delivery','ack'].includes(kind))fail();
 const body=JSON.stringify(value);if(enc.encode(body).length>6144)fail();
 return Object.freeze({body,signature:hex(await crypto.subtle.sign('HMAC',await key(secret,'sign'),enc.encode('uaa-child-admission-'+kind+'-v1\n'+body)))});
}
export async function verifyAdmissionDelivery({body,signature,secret,app,rootRunId,childRunId,now}){
 if(typeof body!=='string'||enc.encode(body).length>6144||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||!Object.hasOwn(origins,app)||!Number.isSafeInteger(now)||now<0||!/^[a-f0-9]{64}$/.test(rootRunId||'')||!/^[a-f0-9]{64}$/.test(childRunId||''))fail();
 if(!await crypto.subtle.verify('HMAC',await key(secret,'verify'),Uint8Array.from(signature.match(/../g),x=>parseInt(x,16)),enc.encode('uaa-child-admission-delivery-v1\n'+body)))fail();
 let p;try{p=JSON.parse(body);}catch{fail();}
 if(!exact(p,['ver','purpose','app','rootRunId','childRunId','codeHash','admission'])||p.ver!==1||p.purpose!=='uaa-child-admission-delivery-v1'||p.app!==app||p.rootRunId!==rootRunId||p.childRunId!==childRunId||typeof p.codeHash!=='string'||!(app==='studio'?/^[a-f0-9]{64}$/:/^[-A-Za-z0-9_]{43}$/).test(p.codeHash))fail();
 const admission=parseChildAdmission(p.admission,{app,origin:origins[app],kind:'admit',challenge:p.admission?.challenge,state:p.admission?.state,now});
 return Object.freeze({...p,admission});
}
export async function verifyAdmissionACK({packet,secret,expected}){
 if(!exact(packet,['body','signature'])||typeof packet.body!=='string'||enc.encode(packet.body).length>1024||typeof packet.signature!=='string'||!/^[a-f0-9]{64}$/.test(packet.signature))fail();
 if(!await crypto.subtle.verify('HMAC',await key(secret,'verify'),Uint8Array.from(packet.signature.match(/../g),x=>parseInt(x,16)),enc.encode('uaa-child-admission-ack-v1\n'+packet.body)))fail();
 let a;try{a=JSON.parse(packet.body);}catch{fail();}
 if(!exact(a,['ver','purpose','app','operationId','codeHash','packetDigest','committed'])||a.ver!==1||a.purpose!=='uaa-child-admission-ack-v1'||a.committed!==true||['app','operationId','codeHash','packetDigest'].some(k=>a[k]!==expected[k]))fail();
 return true;
}
