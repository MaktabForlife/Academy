// Fixed HTTPS adapter for the original signed native reader procedures only.
import {sendNativeHTTPS} from './native-https-sender-v2.mjs';
import {requirePortableNativeMethod} from './portable-native-profile-v5.mjs';
import {exactRecord} from './native-https-contract-v1.mjs';
const purposes={READER_AUTHORITY:'uaa-native-current-reader-authority-v1',READER_ACCOUNT_APPLY:'uaa-native-current-reader-account-status-v1',READER_ACCOUNT_RECEIPT:'uaa-native-current-reader-account-status-v1',READER_ADMISSION:'uaa-studio-reader-admission-delivery-v1'};
const fail=()=>{throw Object.assign(Error('STUDIO_READER_HTTPS_UNCONFIRMED'),{status:503,code:'STUDIO_READER_HTTPS_UNCONFIRMED'});};
export function createStudioReaderHTTPSPeers(env,{clock=Date.now}={}){
 requirePortableNativeMethod(env,'academy','reader');
 const invoke=async(operation,packet)=>{
  exactRecord(packet,['app','body','signature','deadlineMs']);
  if(packet.app!=='studio'||packet.deadlineMs!==5000||typeof packet.body!=='string'||new TextEncoder().encode(packet.body).length>16384||typeof packet.signature!=='string'||!/^[a-f0-9]{64}$/.test(packet.signature))fail();
  let purpose;try{purpose=JSON.parse(packet.body)?.purpose;}catch{fail();}
  if(purpose!==purposes[operation])fail();
  const raw=await sendNativeHTTPS(env,{from:'academy',to:'studio',purpose:'admission.stage',body:JSON.stringify({...packet,operation}),clock});
  let answer;try{answer=JSON.parse(raw);exactRecord(answer,['body','signature']);}catch{fail();}
  if(typeof answer.body!=='string'||new TextEncoder().encode(answer.body).length>4096||typeof answer.signature!=='string'||!/^[a-f0-9]{64}$/.test(answer.signature))fail();
  return answer; // Owning Root native verifier still authenticates inner ACK.
 };
 return Object.freeze({
  deliverCurrentAccountEvent:packet=>invoke('READER_ACCOUNT_APPLY',packet),
  readCurrentAccountReceipt:packet=>{
   let purpose;try{purpose=JSON.parse(packet.body)?.purpose;}catch{fail();}
   return invoke(purpose==='uaa-native-current-reader-authority-v1'?'READER_AUTHORITY':'READER_ACCOUNT_RECEIPT',packet);
  },
  stageAdmission:packet=>invoke('READER_ADMISSION',packet)
 });
}
