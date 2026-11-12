// Stage 2 shape/time/binding contract only. This module does NOT verify a
// signature, consume a ticket, grant admission or create a session.
// Call only AFTER native signedInput/handoff signature verification; native
// owner/epoch/parent/browser checks and atomic consumption remain mandatory.
const fail=()=>{throw Object.assign(new Error('CHILD_ADMISSION_INVALID'),{code:'CHILD_ADMISSION_INVALID'});};
const plain=value=>Boolean(value&&Object.getPrototypeOf(value)===Object.prototype);
const uint=value=>Number.isSafeInteger(value)&&value>=0;
const stable=value=>typeof value==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(value);
const nonce=value=>typeof value==='string'&&/^[-A-Za-z0-9_]{43}$/.test(value);
const fields=[
  'ver','purpose','app','origin','kind','operationId','challenge','state',
  'parentAccountId','parentId','browserId','browserGeneration',
  'parentCredentialEpoch','parentPermissionVersion','parentUnlockGeneration',
  'originalSignedAtS','originalExpiresAtS','issuedAtS','expiresAtS'
];
function canonicalOrigin(value){
  try{
    const url=new URL(value);
    return typeof value==='string'&&url.protocol==='https:'&&
      value.length<=300&&url.hostname.length<=253&&url.origin===value&&!url.username&&!url.password&&!url.port;
  }catch{return false;}
}
export function parseChildAdmission(payload,expected){
  if(!plain(expected)||!['studio','hifz'].includes(expected.app)||
     !canonicalOrigin(expected.origin)||!nonce(expected.challenge)||
     !nonce(expected.state)||!uint(expected.now)||expected.now>253402300799||
     !['admit','unlock'].includes(expected.kind))fail();
  if(!plain(payload)||payload.ver!==1||payload.purpose!=='uaa-child-admission-v1'||payload.app!==expected.app||
     payload.origin!==expected.origin||payload.kind!==expected.kind||
     payload.challenge!==expected.challenge||payload.state!==expected.state)fail();
  const names=payload.kind==='unlock'?[...fields,'childFamilyId']:fields;
  if(Object.keys(payload).length!==names.length||
     names.some(name=>!Object.hasOwn(payload,name)))fail();
  if(!['operationId','parentAccountId','parentId','browserId'].every(name=>stable(payload[name])))fail();
  const numeric=['browserGeneration','parentCredentialEpoch','parentPermissionVersion',
    'parentUnlockGeneration','originalSignedAtS','originalExpiresAtS','issuedAtS','expiresAtS'];
  if(!numeric.every(name=>uint(payload[name])))fail();
  const p=payload,now=expected.now;
  if(p.originalSignedAtS>now||p.originalExpiresAtS<=now||
     p.originalExpiresAtS<=p.originalSignedAtS||
     p.originalExpiresAtS-p.originalSignedAtS>604800||
     p.issuedAtS>now+5||p.issuedAtS<p.originalSignedAtS||
     p.expiresAtS<=now||p.expiresAtS<=p.issuedAtS||
     p.expiresAtS-p.issuedAtS>60||p.expiresAtS>p.originalExpiresAtS)fail();
  if(p.kind==='unlock'&&(!stable(expected.childFamilyId)||
     p.childFamilyId!==expected.childFamilyId))fail();
  // No native child account ID/role/rights is accepted from this payload.
  // The caller must resolve its exact own native owner from the checked ticket.
  return Object.freeze(Object.fromEntries(names.map(name=>[name,p[name]])));
}
