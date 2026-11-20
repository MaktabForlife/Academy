import {nativeRequestContext} from './native-context.js';
import {authenticatedD1Account} from '../d1/session.js';
import {studioAdmin} from '../d1/web-platform/studio-admin.mjs';
import {requireThat} from '../../../../security/v2/codec.mjs';
// Caller has checked the exact resource and full own-primary guard both sides.
export async function studioAccessOperationStatus(repository,request,input){
 const context=nativeRequestContext(request),r=input.resource;requireThat(context&&!context.serviceProof,'ACADEMY_V2_RUNTIME_REQUIRED',403);
 if(r.editor==='live'){
  const row=await repository.db.prepare("SELECT 1 FROM website_platform_live_operations o JOIN class_memberships m ON m.enrollment_id=json_extract(o.result_json,'$.enrollmentId') WHERE o.operation_id=? AND o.actor_id=? COLLATE BINARY AND m.activity_key=? COLLATE NOCASE AND m.account_id=? COLLATE BINARY LIMIT 1").bind(input.operationId,context.cap.binding.sub,r.activityKey,r.accountId).first();
  return {operationId:input.operationId,committed:Boolean(row),acceptedChange:null,head:null,published:false};
 }
 const auth=await authenticatedD1Account(request,context.env,repository);repository.bindActor(auth);
 const value=await studioAdmin(context.env,auth,{activityKey:r.activityKey,command:{action:'operation-status',operationId:input.operationId,resource:r}});
 requireThat(value.operationId===input.operationId&&typeof value.committed==='boolean'&&value.acceptedChange===null&&value.head===null&&value.published===false,'NATIVE_OPERATION_RECEIPT_INVALID',503);
 return {operationId:input.operationId,committed:value.committed,acceptedChange:null,head:null,published:false};
}
