import {readNativeDraftResource} from './academy-native-draft-read.mjs';
import {requireThat,safeInt} from './codec.mjs';
import {isOpenLibraryMetadataId} from '../../backend/src/lib/open-library-metadata.js';
export async function academyLibraryDraftGuard(input){
 const {resource,binding,rights}=input;if(resource?.type!=='academy-open-library-metadata')return null;
 requireThat(Object.keys(resource).sort().join(',')==='resourceId,type'&&isOpenLibraryMetadataId(resource.resourceId),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
 requireThat(rights?.globalAdmin===true&&rights.nativeState?.account?.account_id===binding.sub&&rights.nativeState.account.active===1&&rights.nativeState.account.global_admin===1,'ACADEMY_DRAFT_FORBIDDEN',403);
 return readNativeDraftResource(input,{path:'/api/academy/open-library/metadata/get',workspace:'ADMIN',body:{resourceId:resource.resourceId},accept:dto=>{
  requireThat(dto.record===null||dto.record?.id===resource.resourceId&&safeInt(dto.record.revision,1),'ACADEMY_DRAFT_FORBIDDEN',403);
  // Editing taxonomy/public metadata is a native Global Admin authority. A
  // draft key grants no row write: Save separately binds the exact actual DO
  // row/hash/taxonomy to the owning-primary journal and local CAS.
  return {sql:"SELECT 1 FROM global_role_assignments g JOIN accounts global_owner ON global_owner.account_id=g.account_id COLLATE NOCASE WHERE global_owner.account_id=? COLLATE BINARY AND g.active=1 AND g.review_state='CONFIRMED' AND g.role='GLOBAL_ADMIN'",args:[binding.sub]};
 }});
}
