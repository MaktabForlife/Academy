import {readNativeDraftResource} from './academy-native-draft-read.mjs';
import {requireThat} from './codec.mjs';
// An operation marker only: account/contact/PIN fields never enter this capsule.
export async function academyUsersDraftGuard(input){
 const {resource:r,binding,rights}=input;if(r?.type!=='academy-users')return null;
 requireThat(Object.keys(r).join(',')==='type'&&rights?.nativeState?.account?.account_id===binding.sub&&rights.nativeState.account.active===1&&rights.globalAdmin===true&&rights.nativeState.account.global_admin===1,'ACADEMY_DRAFT_FORBIDDEN',403);
 return readNativeDraftResource(input,{path:'/api/admin/platform/user-profiles/options',workspace:'ADMIN',body:{},accept:dto=>{
  requireThat(dto.prepared===true&&dto.store==='D1'&&dto.currentAccountId===binding.sub&&dto.adminDesignationEditable===true,'ACADEMY_DRAFT_FORBIDDEN',403);
  return {sql:"SELECT 1 FROM global_role_assignments g JOIN accounts owner ON owner.account_id=g.account_id COLLATE NOCASE WHERE owner.account_id=? COLLATE BINARY AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED'",args:[binding.sub]};
 }});
}
