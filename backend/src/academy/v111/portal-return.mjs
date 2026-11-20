import {verifyPortalRequest,portalReply} from '../../../../security/v2/portal-business.mjs';
import {verifyNativeBusinessEnvelope,businessParentCondition} from './native-business.mjs';
import {createNativeBusinessDispatcher} from './native-business-dispatch.mjs';
import {requireThat} from '../../../../security/v2/codec.mjs';
export async function receivePortalReturn(request,runtime,{env=runtime.env,requestNative}={}){
 const peer=await verifyPortalRequest(request,runtime);
 try{
  await runtime.appControl();
  const portalEnvelope={body:peer.body,keyId:peer.kid,issuedAt:peer.time,nonce:peer.nonce,mac:request.headers.get('X-UAA-Portal-MAC')},proof=await verifyNativeBusinessEnvelope({kind:'ROOT_PORTAL_RETURN',portalEnvelope},{env,clock:runtime.clock});
  const guard=businessParentCondition(proof,{now:runtime.clock()});requireThat(await runtime.store.first(guard.sql,...guard.args),'PORTAL_RETURN_PARENT_CHANGED',401);
  const value=await createNativeBusinessDispatcher({runtime,env,requestNative})(proof),result=value instanceof Response?await value.json():value;
  return portalReply(runtime,peer,result);
 }catch(error){return portalReply(runtime,peer,{success:false,code:error.code||'PORTAL_RETURN_UNAVAILABLE',error:'The delegated native action could not complete.'},error.status||503);}
}
