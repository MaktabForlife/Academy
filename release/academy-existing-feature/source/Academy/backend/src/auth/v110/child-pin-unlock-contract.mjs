// Dedicated child-only PIN handoff contract. This is not Master sign-in,
// authorization from browser metadata, or a cross-app foreground renewal.
const origins=Object.freeze({studio:'https://worshipuponbaseera.ummabbadacademy.app',hifz:'https://mahadarwa-hifz.ummabbadacademy.app'});
const issuer='https://ummabbadacademy.app';
const fail=()=>{throw Object.assign(Error('Child PIN handoff rejected'),{code:'CHILD_PIN_HANDOFF_REJECTED',status:401});};
const plain=v=>Boolean(v&&Object.getPrototypeOf(v)===Object.prototype);
const uint=v=>Number.isSafeInteger(v)&&v>=0;
const stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const opaque=v=>typeof v==='string'&&/^[-A-Za-z0-9_]{43}$/.test(v);
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const exact=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const fields=['ver','purpose','app','origin','rootRunId','childRunId','intentId','familyId','nativeOwnerId','nativeEpoch','nativePermissionVersion','nativeRefreshGeneration','childUnlockGeneration','parentAccountId','parentId','browserId','browserGeneration','sourceCredentialEpoch','sourcePermissionVersion','sourceRevision','snapshotDigest','originalSignedAtS','originalExpiresAtS','challenge','state','issuedAtS','expiresAtS'];
function expected(value){if(!plain(value)||!Object.hasOwn(origins,value.app)||!uint(value.now)||value.now>253402300799)fail();}
export function parseChildPINIntent(value,expect){
 expected(expect);
 if(!exact(value,fields)||value.ver!==1||value.purpose!=='uaa-child-pin-intent-v1'||value.app!==expect.app||value.origin!==origins[expect.app]||
  !hex(value.rootRunId)||!hex(value.childRunId)||expect.rootRunId!==undefined&&value.rootRunId!==expect.rootRunId||expect.childRunId!==undefined&&value.childRunId!==expect.childRunId||
  !['familyId','nativeOwnerId','parentAccountId','parentId','browserId'].every(k=>stable(value[k]))||!['intentId','challenge','state'].every(k=>opaque(value[k]))||
  !['nativeEpoch','nativePermissionVersion','nativeRefreshGeneration','childUnlockGeneration','browserGeneration','sourceCredentialEpoch','sourcePermissionVersion','sourceRevision','originalSignedAtS','originalExpiresAtS','issuedAtS','expiresAtS'].every(k=>uint(value[k]))||value.sourceRevision<1||!hex(value.snapshotDigest)||
  value.originalSignedAtS>value.issuedAtS||value.originalExpiresAtS<=value.originalSignedAtS||value.originalExpiresAtS-value.originalSignedAtS>604800||
  value.issuedAtS>expect.now+5||value.expiresAtS<=expect.now||value.expiresAtS<=value.issuedAtS||value.expiresAtS-value.issuedAtS>60||value.expiresAtS>value.originalExpiresAtS)fail();
 return Object.freeze({...value});
}
function canonical(value){if(plain(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export async function childPINIntentDigest(value){
 const body=new TextEncoder().encode(canonical(value));if(body.byteLength>4096)fail();
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function parseChildPINUnlock(value,expect){
 expected(expect);
 const keys=['ver','purpose','issuer','app','origin','intent','intentDigest','codeHash','childUnlockGeneration','parentUnlockGeneration','pinVerifiedAtS','issuedAtS','expiresAtS'];
 if(!exact(value,keys)||value.ver!==1||value.purpose!=='uaa-child-pin-unlock-v1'||value.issuer!==issuer||value.app!==expect.app||value.origin!==origins[expect.app])fail();
 const intent=parseChildPINIntent(value.intent,expect),original=parseChildPINIntent(expect.intent,expect);
 if(fields.some(k=>intent[k]!==original[k])||value.intentDigest!==await childPINIntentDigest(intent)||!hex(value.codeHash)||
  !['childUnlockGeneration','parentUnlockGeneration','pinVerifiedAtS','issuedAtS','expiresAtS'].every(k=>uint(value[k]))||
  value.childUnlockGeneration!==intent.childUnlockGeneration+1||
  value.pinVerifiedAtS<intent.issuedAtS||value.pinVerifiedAtS>value.issuedAtS||value.issuedAtS-value.pinVerifiedAtS>5||
  value.issuedAtS>expect.now+5||value.expiresAtS<=expect.now||value.expiresAtS<=value.issuedAtS||value.expiresAtS>intent.expiresAtS||value.expiresAtS-value.pinVerifiedAtS>60)fail();
 return Object.freeze({...value,intent});
}
const encoder=new TextEncoder(),encode=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
async function keyFor(raw,usage){
 if(!opaque(raw))fail();let bytes;try{bytes=Uint8Array.from(atob(raw.replaceAll('-','+').replaceAll('_','/')+'='),x=>x.charCodeAt(0));}catch{fail();}
 if(bytes.length!==32||encode(bytes)!==raw)fail();
 return crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,[usage]);
}
const purpose=kind=>{if(!['intent','unlock'].includes(kind))fail();return 'uaa-child-pin-'+kind+'-v1';};
export async function signChildPINPacket({kind,value,secret}){
 const p=purpose(kind),body=JSON.stringify(value);if(value?.purpose!==p||encoder.encode(body).length>6144)fail();
 const key=await keyFor(secret,'sign'),signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(p+'\n'+body)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 return Object.freeze({body,signature});
}
export async function verifyChildPINPacket({kind,body,signature,secret,app,now,intent,rootRunId,childRunId}){
 const p=purpose(kind);if(typeof body!=='string'||encoder.encode(body).length>6144||!hex(signature))fail();
 const key=await keyFor(secret,'verify');
 if(!await crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g),x=>parseInt(x,16)),encoder.encode(p+'\n'+body)))fail();
 let value;try{value=JSON.parse(body);}catch{fail();}
 return kind==='intent'?parseChildPINIntent(value,{app,now,rootRunId,childRunId}):parseChildPINUnlock(value,{app,now,intent,rootRunId,childRunId});
}

const ackKeys=['ver','purpose','app','origin','intentId','intentDigest','replyDigest','codeHash','committed'];
export async function signChildPINReceipt({app,intentId,intentDigest,replyDigest,codeHash,secret}){
 if(!Object.hasOwn(origins,app)||!opaque(intentId)||![intentDigest,replyDigest,codeHash].every(hex))fail();
 const value={ver:1,purpose:'uaa-child-pin-receipt-v1',app,origin:origins[app],intentId,intentDigest,replyDigest,codeHash,committed:true},body=JSON.stringify(value),key=await keyFor(secret,'sign');
 const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode('uaa-child-pin-receipt-v1\n'+body)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 return Object.freeze({body,signature});
}
export async function verifyChildPINReceipt({body,signature,secret,expected}){
 if(typeof body!=='string'||encoder.encode(body).length>2048||!hex(signature)||!plain(expected)||!Object.hasOwn(origins,expected.app))fail();
 const key=await keyFor(secret,'verify');
 if(!await crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g),x=>parseInt(x,16)),encoder.encode('uaa-child-pin-receipt-v1\n'+body)))fail();
 let value;try{value=JSON.parse(body);}catch{fail();}
 if(!exact(value,ackKeys)||value.ver!==1||value.purpose!=='uaa-child-pin-receipt-v1'||value.origin!==origins[expected.app]||value.committed!==true||!['app','intentId','intentDigest','replyDigest','codeHash'].every(k=>value[k]===expected[k]))fail();
 return Object.freeze(value);
}
