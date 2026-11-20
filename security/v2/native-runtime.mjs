import {prepareAdmissionAuthority,assertCodeAuthority} from '../../backend/src/academy/v111/studio-authority-preparation.mjs';
import {AcademyNativeAdapter} from './native-adapter.mjs';
import {requireThat,canonical} from './codec.mjs';

// Credential receipts retain the originating adapter's private WeakMap brand.
// A JSON copy is never accepted as evidence that a native PIN was checked.
export async function createNativeRuntime({env,store,clock,dependenciesFor}){
 if(env?.UAA_V2_ENABLED==='1')requireThat(env.ACADEMY_DB_GENERATION==='SPLIT_V1'&&typeof env.ACADEMY_SPLIT_COORDINATOR?.getByName==='function','ACADEMY_V2_SPLIT_COORDINATOR_REQUIRED',503);
 const receipts=new WeakMap();
 const adapter=sub=>new AcademyNativeAdapter({env,clock,dependencies:dependenciesFor(sub)});
 const remember=(value,owner)=>{receipts.set(value,owner);return value;};
 const owner=value=>{const found=receipts.get(value);requireThat(found,'NATIVE_CREDENTIAL_RECEIPT_REQUIRED',503);return found;};
 const credentialSnapshot=async sub=>{const a=adapter(sub);return remember(await a.credentialSnapshot(sub),a);};
 const identity=async sub=>{
  const row=await store.first('SELECT a.account_id,a.login_link_id,a.display_name,a.active,a.global_admin,c.credential_epoch,c.pin_setup FROM accounts a JOIN account_credentials c USING(account_id) WHERE a.account_id=? COLLATE NOCASE',sub);
  requireThat(row&&row.active===1,'NATIVE_ACCOUNT_UNAVAILABLE',401);
  return {sub:row.account_id,ce:row.credential_epoch,displayName:row.display_name||row.login_link_id,uniqueid:row.login_link_id,globalAdmin:row.global_admin===1,setupComplete:row.pin_setup===1};
 };
 const mappingGuard=b=>({sql:'SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) WHERE a.account_id=? AND a.active=1 AND c.credential_epoch=? AND c.pin_setup=1 AND NOT EXISTS(SELECT 1 FROM split_write_fence)',args:[b.sub,b.ce]});
 return {
  identity,credentialSnapshot,mappingGuard,prepareAdmissionAuthority,assertCodeAuthority,
  selection:async loginId=>{const a=adapter(loginId);return remember(await a.selection(loginId),a);},
  credentialGuard:receipt=>owner(receipt).credentialGuard(receipt),
  verifyPin:(pin,receipt)=>owner(receipt).verifyPin(pin,receipt),
  setupCredentialPlan:input=>owner(input.credential).setupCredentialPlan(input),
  capture:async({binding})=>{
   const capture=await adapter(binding.sub).capture({sub:binding.sub,credentialEpoch:binding.ce});
   const current=capture.nativeIdentity;
   requireThat(current.ce===binding.ce,'CREDENTIAL_CHANGED',409);
   capture.rights.nativeIdentity=current;
   return capture;
  },
  draftGuard:async input=>{
   const {academyDraftGuard}=await import('./academy-native-resources.mjs');
   return academyDraftGuard({store,env,...input});
  }
 };
}
