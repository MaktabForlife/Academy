import {requireThat,uuid,safeInt} from './codec.mjs';
import {readNativeDraftResource} from './academy-native-draft-read.mjs';
// The actual native reader owns current editability and source-row values. Core
// may retain only settings identifiers; the coherent split/head/vector fence
// returned by readNativeDraftResource pins the owning Admin DTO through release.
export async function academyAdminFormDraftGuard(input){
 const {resource,rights,binding}=input;if(!['academy-app-settings','academy-pdf-defaults','academy-announcement','academy-announcements-feed'].includes(resource?.type))return null;
 const type=resource.type,announcement=type==='academy-announcement',fields=Object.keys(resource).sort().join(',');requireThat(fields===(announcement?'announcementId,creating,type':'type'),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
 if(announcement)requireThat(typeof resource.creating==='boolean'&&(resource.creating?resource.announcementId===null:uuid(resource.announcementId)),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
 requireThat(rights?.globalAdmin===true&&rights.nativeState?.account?.global_admin===1&&rights.nativeState.account.account_id===binding.sub,'ACADEMY_DRAFT_FORBIDDEN',403);
 const path=type==='academy-app-settings'?'/api/admin/platform/settings/get':type==='academy-pdf-defaults'?'/api/admin/platform/pdf-tools/get':'/api/admin/platform/announcements/drafts';
 return readNativeDraftResource(input,{path,body:{},workspace:'ADMIN',accept:dto=>{
  if(announcement||type==='academy-announcements-feed'){
   requireThat(dto.contract==='ANNOUNCEMENTS_EDITOR_V2'&&Array.isArray(dto.announcements)&&dto.announcements.length<=200&&safeInt(dto.publicGeneration),'ACADEMY_DRAFT_NATIVE_READ_INVALID',503);
   if(announcement&&!resource.creating)requireThat(dto.announcements.some(row=>row.id===resource.announcementId&&safeInt(row.revision)&&safeInt(row.publishedRevision)),'ACADEMY_DRAFT_FORBIDDEN',403);
  }else requireThat(typeof dto.revision==='string'&&/^[a-f0-9]{64}$/.test(dto.revision)&&(type==='academy-app-settings'?typeof dto.timezone==='string'&&dto.timezone.length<=100:dto.settings&&typeof dto.settings==='object'&&!Array.isArray(dto.settings)),'ACADEMY_DRAFT_NATIVE_READ_INVALID',503);
  return {sql:"SELECT 1 FROM global_role_assignments g JOIN accounts a ON g.account_id=a.account_id COLLATE NOCASE WHERE a.account_id=? COLLATE BINARY AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED'",args:[binding.sub]};
 }});
}
