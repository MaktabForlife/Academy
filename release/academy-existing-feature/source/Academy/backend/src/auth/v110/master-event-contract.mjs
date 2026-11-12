// Stage 2 pure wire contracts. Signature verification and owning native
// transactions are mandatory caller boundaries; no route imports this file yet.
const fail=()=>{throw Object.assign(new Error('MASTER_EVENT_INVALID'),{code:'MASTER_EVENT_INVALID'});};
const plain=v=>Boolean(v&&Object.getPrototypeOf(v)===Object.prototype);
const uint=v=>Number.isSafeInteger(v)&&v>=0;
const stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const app=v=>v==='studio'||v==='hifz';
const exact=(v,names)=>plain(v)&&Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
const common=['ver','purpose','app','eventId','operationId','stream','version','parentAccountId','type','issuedAtS','retainUntilS','payloadDigest'];
const variants=Object.freeze({
  'parent-revoked':['parentId'],
  'browser-superseded':['browserId','beforeGeneration'],
  'account-security':['credentialEpoch','securityVersion'],
  'authority-updated':['permissionVersion']
});
function stableJSON(value){
  if(Array.isArray(value))return '['+value.map(stableJSON).join(',')+']';
  if(plain(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableJSON(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export async function masterEventDigest(value){
  const body=Object.fromEntries(Object.entries(value).filter(([key])=>key!=='payloadDigest'));
  const encoded=new TextEncoder().encode(stableJSON(body));
  if(encoded.byteLength>4096)fail();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoded))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function parseMasterEvent(value,expected){
  if(!plain(expected)||!app(expected.app)||!uint(expected.now)||expected.now>253402300799)fail();
  if(!plain(value)||!Object.hasOwn(variants,value.type)||
     !exact(value,[...common,...variants[value.type]])||value.ver!==1||
     value.purpose!=='uaa-master-event-v1'||value.app!==expected.app||
     !['eventId','operationId','parentAccountId'].every(k=>stable(value[k]))||
     !digest(value.stream)||!digest(value.payloadDigest)||!uint(value.version)||value.version<1||
     !uint(value.issuedAtS)||!uint(value.retainUntilS)||
     value.issuedAtS>expected.now+5||value.retainUntilS<=value.issuedAtS||
     value.retainUntilS-value.issuedAtS>604800)fail();
  if(value.type==='parent-revoked'&&!stable(value.parentId))fail();
  if(value.type==='browser-superseded'&&(!stable(value.browserId)||!uint(value.beforeGeneration)))fail();
  if(value.type==='account-security'&&(!uint(value.credentialEpoch)||!uint(value.securityVersion)))fail();
  if(value.type==='authority-updated'&&!uint(value.permissionVersion))fail();
  if(await masterEventDigest(value)!==value.payloadDigest)fail();
  // Old retained events can still be acknowledged after their cutoff. Receipt
  // of an old event never restores a family; native monotonic guards own effects.
  return Object.freeze({...value});
}
export function parseCommittedMasterACK(value,expected){
  const names=['ver','purpose','app','eventId','stream','version','payloadDigest','committed'];
  if(!exact(value,names)||!plain(expected)||value.ver!==1||
     value.purpose!=='uaa-master-ack-v1'||value.committed!==true||
     !app(value.app)||value.app!==expected.app||!stable(value.eventId)||
     !digest(value.stream)||!digest(value.payloadDigest)||!uint(value.version)||value.version<1||
     ['eventId','stream','version','payloadDigest'].some(k=>value[k]!==expected[k]))fail();
  return Object.freeze({...value});
}
