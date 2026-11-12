// Route-free authority-floor guard for future native admission/resource batches.
// This verifies persisted metadata only, not signatures, entitlement contents,
// event delivery, physical storage or native actor identity. A trusted signed
// projection writer must create/update the floor WITH actual native authority.
const fail=()=>{throw Object.assign(Error('Child authority unavailable'),{code:'CHILD_AUTHORITY_UNAVAILABLE',status:409});};
const uint=v=>Number.isSafeInteger(v)&&v>=0;
const stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const fields=['app','parentAccountId','nativeOwnerId','nativeEpoch','parentCredentialEpoch','parentPermissionVersion'];
function expected(input){
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).length!==fields.length||fields.some(k=>!Object.hasOwn(input,k))||!['studio','hifz'].includes(input.app)||!['parentAccountId','nativeOwnerId'].every(k=>stable(input[k]))||!['nativeEpoch','parentCredentialEpoch','parentPermissionVersion'].every(k=>uint(input[k])))fail();
 return Object.freeze({...input});
}
const columns='app,parent_account_id,native_owner_id,native_epoch,source_credential_epoch,required_permission_version,committed_permission_version,source_revision,snapshot_digest,active';
export async function prepareChildAuthorityGuard(store,input){
 const value=expected(input);
 if(typeof store?.first!=='function')fail();
 const requirement=await store.first('SELECT * FROM jwt_v110_source_requirements WHERE app=? AND parent_account_id=?',[value.app,value.parentAccountId]);
 if(requirement&&(!['credential_epoch_floor','permission_version_floor','security_version'].every(k=>uint(requirement[k]))||requirement.credential_epoch_floor>value.parentCredentialEpoch||requirement.permission_version_floor>value.parentPermissionVersion))fail();
 const requirementSQL=requirement?'EXISTS(SELECT 1 FROM jwt_v110_source_requirements r WHERE r.app=? AND r.parent_account_id=? AND r.credential_epoch_floor=? AND r.permission_version_floor=? AND r.security_version=?)':'NOT EXISTS(SELECT 1 FROM jwt_v110_source_requirements r WHERE r.app=? AND r.parent_account_id=?)';
 const requirementArgs=requirement?[value.app,value.parentAccountId,requirement.credential_epoch_floor,requirement.permission_version_floor,requirement.security_version]:[value.app,value.parentAccountId];
 const row=await store.first('SELECT '+columns+' FROM jwt_v110_authority_floors WHERE app=? AND parent_account_id=?',[value.app,value.parentAccountId]);
 if(!row||row.app!==value.app||row.parent_account_id!==value.parentAccountId||row.native_owner_id!==value.nativeOwnerId||row.native_epoch!==value.nativeEpoch||row.source_credential_epoch!==value.parentCredentialEpoch||row.active!==1||row.required_permission_version!==value.parentPermissionVersion||row.committed_permission_version!==value.parentPermissionVersion||!uint(row.source_revision)||row.source_revision<1||typeof row.snapshot_digest!=='string'||!/^[a-f0-9]{64}$/.test(row.snapshot_digest))fail();
 // The caller MUST place this predicate in the SAME native CHECK guard/batch
 // that consumes the ticket and creates its family. A pre-read alone is unsafe.
 // Revision+digest also fence a changed native projection with unchanged PV.
 return Object.freeze({
  sql:`EXISTS(SELECT 1 FROM jwt_v110_authority_floors f WHERE f.app=? AND f.parent_account_id=? AND f.native_owner_id=? AND f.native_epoch=? AND f.source_credential_epoch=? AND f.required_permission_version=? AND f.committed_permission_version=? AND f.source_revision=? AND f.snapshot_digest=? AND f.active=1)`+' AND ('+requirementSQL+')',
  params:Object.freeze([value.app,value.parentAccountId,value.nativeOwnerId,value.nativeEpoch,value.parentCredentialEpoch,value.parentPermissionVersion,value.parentPermissionVersion,row.source_revision,row.snapshot_digest,...requirementArgs])
 });
}
