// SOURCE ONLY default-off reader admission envelope. Resource selectors are
// Root-derived correlation only; native Studio acquired rights remain authority.
import {parseChildAdmission} from './child-admission-contract.mjs';
export {signAdmissionPacket,admissionPacketDigest,verifyAdmissionACK} from './child-admission-contract-https-v1.mjs';
export const studioReaderAdmissionPurpose='uaa-studio-reader-admission-delivery-v1';
import {portableChildOrigins} from './portable-native-profile-v5.mjs';
const origin=portableChildOrigins.studio,enc=new TextEncoder();
const fail=()=>{throw Object.assign(Error('STUDIO_READER_ADMISSION_REJECTED'),{code:'STUDIO_READER_ADMISSION_REJECTED',status:403});};
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function parseStudioReaderResource(value){
 if(!exact(value,['activityKey','offeringId','websiteId','surahId'])||!['activityKey','offeringId','websiteId'].every(k=>stable(value[k])))fail();
 if(value.activityKey.startsWith('COURSE:')){if(value.surahId!==null)fail();}
 else if(value.activityKey.startsWith('PROGRAM:')){if(!uuid(value.surahId))fail();}
 else fail();
 return Object.freeze({...value});
}
export async function verifyStudioReaderAdmissionDelivery({body,signature,secret,rootRunId,childRunId,now}){
 if(typeof body!=='string'||enc.encode(body).byteLength>6144||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||typeof secret!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(secret)||!/^[a-f0-9]{64}$/.test(rootRunId||'')||!/^[a-f0-9]{64}$/.test(childRunId||'')||!Number.isSafeInteger(now)||now<0)fail();
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g),x=>parseInt(x,16)),enc.encode('uaa-child-admission-delivery-v1\n'+body)))fail();
 let p;try{p=JSON.parse(body);}catch{fail();}
 if(!exact(p,['ver','purpose','app','rootRunId','childRunId','codeHash','admission','parentGlobalAdmin','resource'])||p.ver!==1||p.purpose!==studioReaderAdmissionPurpose||p.app!=='studio'||p.rootRunId!==rootRunId||p.childRunId!==childRunId||typeof p.codeHash!=='string'||!/^[a-f0-9]{64}$/.test(p.codeHash)||typeof p.parentGlobalAdmin!=='boolean')fail();
 const admission=parseChildAdmission(p.admission,{app:'studio',origin,kind:'admit',challenge:p.admission?.challenge,state:p.admission?.state,now});
 return Object.freeze({...p,admission,resource:parseStudioReaderResource(p.resource)});
}
