import {readNativeDraftResource} from './academy-native-draft-read.mjs';
import {requireThat} from './codec.mjs';
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(v);
export async function academyCatalogueDraftGuard(input){
 const {resource:r,binding,rights}=input;if(r?.type!=='academy-learning-catalogue')return null;
 requireThat(Object.keys(r).sort().join(',')==='kind,recordId,type'&&['subject','module'].includes(r.kind)&&(r.recordId===null||id(r.recordId)),'ACADEMY_DRAFT_RESOURCE_REQUIRED',403);
 requireThat(rights?.globalAdmin===true&&rights.nativeState?.account?.account_id===binding.sub&&rights.nativeState.account.active===1&&rights.nativeState.account.global_admin===1,'ACADEMY_DRAFT_FORBIDDEN',403);
 return readNativeDraftResource(input,{path:'/api/admin/platform/learning-catalogue/get',body:{},workspace:'ADMIN',accept:dto=>{
  requireThat(dto.store==='D1'&&dto.viewerAccountId===binding.sub&&Array.isArray(dto.subjects)&&Array.isArray(dto.modules)&&(r.kind!=='module'||dto.modulesReady===true),'ACADEMY_DRAFT_FORBIDDEN',403);
  if(r.recordId!==null)requireThat((r.kind==='subject'?dto.subjects:dto.modules).some(row=>(r.kind==='subject'?row.SubjectID:row.id)===r.recordId),'ACADEMY_DRAFT_FORBIDDEN',403);
  // Catalogue definitions are Admin-owned. The exact reader decision is pinned
  // by the source/head/vector fence; Core compatibility revisions are not a CAS.
  return {sql:"SELECT 1 FROM global_role_assignments g JOIN accounts owner ON owner.account_id=g.account_id COLLATE NOCASE WHERE owner.account_id=? COLLATE BINARY AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED'",args:[binding.sub]};
 }});
}
