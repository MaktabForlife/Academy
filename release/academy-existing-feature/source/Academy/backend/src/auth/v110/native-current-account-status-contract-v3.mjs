// SOURCE ONLY. One genuine current Source account; existing native HMAC keys.
// No auth token, caller supplied role, network route or new key material.
export const nativeAccountStatusBinding='JWT_LOCAL_STUDIO_ACCOUNT_PROJECTION_SERVICE';
export const nativeAccountStatusPath='/internal/academy/native-account-status';
export const nativeAccountStatusPurpose='maktab-web-v1:POST:'+nativeAccountStatusPath;
export const nativeAccountStatusACKPurpose='maktab-web-v1:ACK:'+nativeAccountStatusPath;
export const nativeAccountStatusMethods=Object.freeze(['deliverCurrentAccountEvent','readCurrentAccountReceipt']);
const enc=new TextEncoder();
export const statusFail=(code='NATIVE_ACCOUNT_STATUS_UNCONFIRMED')=>{throw Object.assign(Error(code),{code,status:409});};
export const statusExact=(v,keys)=>Boolean(v&&Object.getPrototypeOf(v)===Object.prototype&&!Object.getOwnPropertySymbols(v).length&&Object.keys(v).sort().join()===keys.slice().sort().join()&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value')));
export const statusUint=v=>Number.isSafeInteger(v)&&v>=0;
export const statusID=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
export function accountStatusProfile(env,app){
 if(!['academy','studio'].includes(app)||env.JWT_LOCAL_STAGE!=='V110_INTEGRATION'||env.JWT_LOCAL_TEST_ROUTE_POLICY!=='NATIVE_WEBSITE_HIFZ_V1'||env.JWT_NATIVE_CURRENT_ACCOUNT_STATUS!=='NATIVE_CURRENT_ACCOUNT_V1'||env.JWT_LOCAL_BACKEND_EGRESS!=='DENY_ALL'||['JWT_LOCAL_AI','JWT_LOCAL_PROVIDERS','JWT_LOCAL_TRANSCRIPTION','JWT_LOCAL_SCHEDULES'].some(k=>env[k]!=='OFF')||env.VIDEO_AUTOLINK_HTTP_ENABLED!=='0'||env.LOCAL_VIDEO_MANUAL_SOURCE_ENABLED!=='0'||!/^[a-f0-9]{64}$/.test(env.JWT_LOCAL_NATIVE_RUN_ID||'')||env.JWT_LOCAL_APP_BINDING!==app+':'+env.JWT_LOCAL_NATIVE_RUN_ID)statusFail();
}
export function accountStatusPacket(v){
 if(!statusExact(v,['app','body','signature','deadlineMs'])||v.app!=='studio'||v.deadlineMs!==5000||typeof v.body!=='string'||enc.encode(v.body).length>16384||typeof v.signature!=='string'||!/^[a-f0-9]{64}$/.test(v.signature))statusFail();
 return Object.freeze({...v});
}
export function accountStatusFrame(body){
 let p;try{p=JSON.parse(body);}catch{statusFail();}
 if(!statusExact(p,['ver','purpose','source','nativeBody','nativeSignature'])||p.ver!==1||p.purpose!=='uaa-native-current-account-status-v1'||!statusExact(p.source,['accountId','credentialEpoch','permissionVersion','coreRevision','startedAtMs','parentId','browserId','browserGeneration','originalSignedAtS','originalExpiresAtS'])||!statusID(p.source.accountId)||!['parentId','browserId'].every(k=>statusID(p.source[k]))||!['credentialEpoch','permissionVersion','coreRevision','startedAtMs','browserGeneration','originalSignedAtS','originalExpiresAtS'].every(k=>statusUint(p.source[k]))||p.source.originalExpiresAtS<=p.source.originalSignedAtS||p.source.originalExpiresAtS-p.source.originalSignedAtS>604800||p.source.credentialEpoch<1||p.source.permissionVersion<1||typeof p.nativeBody!=='string'||enc.encode(p.nativeBody).length>12288||typeof p.nativeSignature!=='string'||!/^[a-f0-9]{64}$/.test(p.nativeSignature))statusFail();
 let d;try{d=JSON.parse(p.nativeBody);}catch{statusFail();}
 if(!statusExact(d,['issuedAt','operationId','stream','version','event'])||!statusUint(d.issuedAt)||!statusID(d.operationId)||d.stream!=='account:'+p.source.accountId||!statusUint(d.version)||d.version<1||!statusExact(d.event,['type','account','navigation'])||d.event.type!=='account')statusFail();
 const a=d.event.account;
 if(!statusExact(a,['accountId','displayName','active','admitted','epoch','globalAdmin','verifiedAt'])||a.accountId!==p.source.accountId||a.epoch!==p.source.credentialEpoch||typeof a.displayName!=='string'||a.displayName.length>240||a.active!==true||a.admitted!==true||typeof a.globalAdmin!=='boolean'||!statusUint(a.verifiedAt))statusFail();
 return Object.freeze({...p,delivery:d,account:a});
}
export function accountStatusACK(body){
 let a;try{a=JSON.parse(body);}catch{statusFail();}
 const keys=['ver','purpose','status','operationId','stream','version','eventDigest','requestDigest','accountId','credentialEpoch','permissionVersion','coreRevision','verifiedAt','authorityRevision','snapshotDigest'];
 if(!statusExact(a,keys)||a.ver!==1||a.purpose!=='uaa-native-current-account-status-ack-v1'||!['APPLIED','EXISTING_COMMITTED','NOT_COMMITTED'].includes(a.status)||!statusID(a.operationId)||!statusID(a.accountId)||a.stream!=='account:'+a.accountId||!['version','credentialEpoch','permissionVersion','coreRevision','verifiedAt','authorityRevision'].every(k=>statusUint(a[k]))||!['eventDigest','requestDigest','snapshotDigest'].every(k=>typeof a[k]==='string'&&/^[a-f0-9]{64}$/.test(a[k])))statusFail();
 return Object.freeze(a);
}
export function withoutNativeAccountStatusCapability(env){const {[nativeAccountStatusBinding]:unused,...isolated}=env;return isolated;}
