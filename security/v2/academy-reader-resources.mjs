import {readNativeDraftResource} from './academy-native-draft-read.mjs';
import {requireThat,uuid} from './codec.mjs';
export async function academyReaderDraftGuard(input){
 const {resource:r,binding,rights}=input;if(r?.type!=='academy-reader')return null;
 requireThat(Object.keys(r).sort().join(',')==='activityKey,surahId,type,workspace'&&typeof r.activityKey==='string'&&/^(COURSE|PROGRAM):[^:]{1,160}$/.test(r.activityKey)&&['LEARN','TEACH'].includes(r.workspace)&&(r.activityKey.startsWith('COURSE:')?r.surahId===null:uuid(r.surahId)),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
 requireThat(rights?.nativeState?.account?.account_id===binding.sub&&rights.nativeState.account.active===1,'ACADEMY_DRAFT_AUTHORITY_REQUIRED',503);
 // Read authority belongs to the actual protected native reader, including its
 // acquired/free access rules. It is independent of canEdit/Admin authoring.
 return readNativeDraftResource(input,{path:'/api/academy/course-websites/read',workspace:r.workspace,body:{activityKey:r.activityKey,...r.surahId===null?{}:{surahId:r.surahId}},accept:dto=>{
  requireThat(dto.document&&typeof dto.document==='object'&&!Array.isArray(dto.document)&&typeof dto.readerKey==='string'&&/^[a-f0-9]{64}$/i.test(dto.readerKey),'ACADEMY_DRAFT_FORBIDDEN',403);
  // Do not add an ACTIVE-course rule: original acquired access may remain
  // available for completed offerings. The owning native read decides this.
  return r.surahId===null?{sql:"SELECT 1 FROM activities x WHERE x.activity_key=? COLLATE NOCASE AND x.kind='COURSE'",args:[r.activityKey]}:{sql:"SELECT 1 FROM activities x JOIN program_surahs s USING(activity_key) WHERE x.activity_key=? COLLATE NOCASE AND x.kind='PROGRAM' AND s.surah_id=? COLLATE NOCASE",args:[r.activityKey,r.surahId]};
 }});
}
