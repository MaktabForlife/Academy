// SOURCE ONLY. Resource-bound own-account status, no browser authority or new RPC method.
import {statusExact as exact,statusFail as fail,statusID as id,statusUint as uint,accountStatusFrame} from './native-current-account-status-contract-v3.mjs';
import {parseStudioReaderResource} from './studio-reader-admission-contract-v1.mjs';
export {accountStatusPacket,accountStatusACK,accountStatusProfile,nativeAccountStatusBinding,statusFail,statusUint} from './native-current-account-status-contract-v3.mjs';
export const readerStatusPurpose='maktab-web-v1:POST:/internal/academy/native-reader-account-status';
export const readerStatusACKPurpose='maktab-web-v1:ACK:/internal/academy/native-reader-account-status';
export const readerProbePurpose='maktab-web-v1:READ:/internal/academy/native-reader-account-authority';
export const readerProbeACKPurpose='maktab-web-v1:ACK:/internal/academy/native-reader-account-authority';
export function readerResource(v){
 if(!exact(v,['resource','workspace'])||!['LEARN','TEACH'].includes(v.workspace))fail();
 return Object.freeze({resource:parseStudioReaderResource(v.resource),workspace:v.workspace});
}
function source(v){
 const keys=['accountId','credentialEpoch','permissionVersion','coreRevision','startedAtMs','parentId','browserId','browserGeneration','originalSignedAtS','originalExpiresAtS'];
 if(!exact(v,keys)||!['accountId','parentId','browserId'].every(k=>id(v[k]))||!keys.filter(k=>!['accountId','parentId','browserId'].includes(k)).every(k=>uint(v[k]))||v.credentialEpoch<1||v.permissionVersion<1||v.originalExpiresAtS<=v.originalSignedAtS||v.originalExpiresAtS-v.originalSignedAtS>604800)fail();return Object.freeze({...v});
}
export function readerStatusFrame(body){
 let p;try{p=JSON.parse(body);}catch{fail();}
 if(!exact(p,['ver','purpose','source','nativeBody','nativeSignature','reader'])||p.purpose!=='uaa-native-current-reader-account-status-v1')fail();
 const {reader,...base}=p,value=accountStatusFrame(JSON.stringify({...base,purpose:'uaa-native-current-account-status-v1'}));
 if(value.account.globalAdmin!==false)fail();return Object.freeze({...value,purpose:p.purpose,reader:readerResource(reader)});
}
export function readerProbeFrame(body){
 let p;try{p=JSON.parse(body);}catch{fail();}
 if(!exact(p,['ver','purpose','source','account','reader'])||p.ver!==1||p.purpose!=='uaa-native-current-reader-authority-v1')fail();
 const s=source(p.source),a=p.account;
 if(!exact(a,['accountId','displayName','active','admitted','epoch','globalAdmin'])||a.accountId!==s.accountId||a.epoch!==s.credentialEpoch||typeof a.displayName!=='string'||a.displayName.length>240||a.active!==true||a.admitted!==true||a.globalAdmin!==false)fail();
 return Object.freeze({...p,source:s,account:Object.freeze({...a}),reader:readerResource(p.reader)});
}
export function readerProbeACK(body){
 let a;try{a=JSON.parse(body);}catch{fail();}
 if(!exact(a,['ver','purpose','accepted','reason','invocationWrites','requestDigest','resourceDigest','accountId','credentialEpoch','permissionVersion','coreRevision','authorityRevision','snapshotDigest'])||a.ver!==1||a.purpose!=='uaa-native-current-reader-authority-ack-v1'||typeof a.accepted!=='boolean'||a.reason!==(a.accepted?'NATIVE_READER_ACCESS_CONFIRMED':'RESOURCE_ACCESS_REQUIRED')||a.invocationWrites!=='NONE'||!id(a.accountId)||!['credentialEpoch','permissionVersion','coreRevision','authorityRevision'].every(k=>uint(a[k]))||a.authorityRevision<1||!['requestDigest','resourceDigest','snapshotDigest'].every(k=>typeof a[k]==='string'&&/^[a-f0-9]{64}$/.test(a[k])))fail();
 return Object.freeze(a);
}
