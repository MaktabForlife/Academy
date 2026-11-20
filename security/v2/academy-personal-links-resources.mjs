import {readNativeDraftResource} from './academy-native-draft-read.mjs';
import {requireThat} from './codec.mjs';
export async function academyPersonalLinksDraftGuard(input){
 const {resource:r,binding,rights}=input;if(r?.type!=='academy-personal-links')return null;
 requireThat(Object.keys(r).join(',')==='type'&&rights?.nativeState?.account?.account_id===binding.sub&&rights.nativeState.account.active===1,'ACADEMY_DRAFT_FORBIDDEN',403);
 // Actual owner-only list enforces initial Teacher/Admin eligibility or an
 // established private collection. R2's existing ETag CAS remains the save gate.
 return readNativeDraftResource(input,{path:'/api/academy/my-links/list',workspace:'LEARN',body:{},accept:dto=>{
  requireThat(dto.canCreate===true&&Array.isArray(dto.links),'ACADEMY_DRAFT_FORBIDDEN',403);
  return {sql:"SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) WHERE a.account_id=? COLLATE BINARY AND a.active=1 AND c.credential_epoch=?",args:[binding.sub,binding.ce]};
 }});
}
