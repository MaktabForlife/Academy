// Own-child first-admission staging from a signed private Root service only.
// Creates native one-use tickets + metadata atomically, never a JWT family/grant.
import {localChildProfile} from './local-child-profile.mjs';
import {nativeChildPrimaryStore} from './child-auth-http.mjs';
import {prepareChildAuthorityGuard} from './child-authority-floor.mjs';
import {verifyAdmissionDelivery,signAdmissionPacket,admissionPacketDigest} from './native-admission-delivery-contract.mjs';
const fail=()=>{throw Object.assign(Error('NATIVE_ADMISSION_STAGE_REJECTED'),{code:'NATIVE_ADMISSION_STAGE_REJECTED',status:409});};
export async function stageNativeChildAdmission({env,app,body,signature,clock=Date.now}){
 const profile=localChildProfile(env,app),start=clock(),now=Math.floor(start/1000);
 if(!Number.isSafeInteger(start)||start<0||env.JWT_LOCAL_STAGE!=='V110_INTEGRATION'||env.JWT_LOCAL_BACKEND_EGRESS!=='DENY_ALL'||env.JWT_LOCAL_AI!=='OFF'||env.JWT_LOCAL_PROVIDERS!=='OFF'||env.JWT_LOCAL_TRANSCRIPTION!=='OFF'||env.JWT_LOCAL_SCHEDULES!=='OFF'||env.JWT_V110_CHILD_ADMISSION!=='NATIVE_ROOT_V1')fail();
 const secret=env.JWT_V110_CHILD_ADMISSION_SECRET;
 const p=await verifyAdmissionDelivery({body,signature,secret,app,rootRunId:env.JWT_LOCAL_ROOT_RUN_ID,childRunId:profile.run,now}),a=p.admission,store=nativeChildPrimaryStore(env),json=JSON.stringify(a),payloadDigest=await admissionPacketDigest(json),packetDigest=await admissionPacketDigest(body);
 const native=app==='studio'?await store.first('SELECT account_id native_owner_id,epoch native_epoch FROM accounts WHERE account_id=? AND active=1 AND admitted=1 AND epoch=?',[a.parentAccountId,a.parentCredentialEpoch]):
  await store.first('SELECT s.id native_owner_id,s.credential_epoch native_epoch,l.source_revision FROM students s JOIN academy_profile_links l ON l.student_id=s.id WHERE l.academy_user_id=? AND l.source_credential_epoch=? AND s.active=1 AND s.academy_managed=1',[a.parentAccountId,a.parentCredentialEpoch]);
 if(!native)fail();
 const authority=await prepareChildAuthorityGuard(store,{app,parentAccountId:a.parentAccountId,nativeOwnerId:native.native_owner_id,nativeEpoch:native.native_epoch,parentCredentialEpoch:a.parentCredentialEpoch,parentPermissionVersion:a.parentPermissionVersion});
 const ack=await signAdmissionPacket({secret,kind:'ack',value:{ver:1,purpose:'uaa-child-admission-ack-v1',app,operationId:a.operationId,codeHash:p.codeHash,packetDigest,committed:true}});
 const prior=await store.first('SELECT * FROM jwt_v110_admissions WHERE ticket_hash=?',[p.codeHash]);
 if(prior){
  if(prior.app!==app||prior.operation_id!==a.operationId||prior.native_owner_id!==native.native_owner_id||prior.native_epoch!==native.native_epoch||prior.payload_json!==json||prior.payload_digest!==payloadDigest)fail();
  return ack; // Idempotent same committed ticket; never create another family.
 }
 const commit=clock();if(!Number.isSafeInteger(commit)||commit<start||commit-start>5000||Math.floor(commit/1000)>=a.expiresAtS)fail();
 const guard=crypto.randomUUID(),table=app==='studio'?'guards':'jwt_v110_native_guards';
 const nativeSQL=app==='studio'?'EXISTS(SELECT 1 FROM accounts WHERE account_id=? AND epoch=? AND active=1 AND admitted=1)':
  'EXISTS(SELECT 1 FROM students s JOIN academy_profile_links l ON l.student_id=s.id WHERE s.id=? AND s.credential_epoch=? AND s.active=1 AND s.academy_managed=1 AND l.academy_user_id=? AND l.source_credential_epoch=? AND l.source_revision=?)';
 const nativeArgs=app==='studio'?[native.native_owner_id,native.native_epoch]:[native.native_owner_id,native.native_epoch,a.parentAccountId,a.parentCredentialEpoch,native.source_revision];
 const statements=[store.statement('INSERT INTO '+table+'(guard_id,accepted) SELECT ?,('+nativeSQL+') AND ('+authority.sql+') AND NOT EXISTS(SELECT 1 FROM jwt_v110_parent_tombstones WHERE parent_session_id=?) AND NOT EXISTS(SELECT 1 FROM jwt_v110_browser_heads WHERE browser_id=? AND generation>?)',[guard,...nativeArgs,...authority.params,a.parentId,a.browserId,a.browserGeneration])];
 if(app==='studio'){
  // Stable opaque native source-ref, bound to this exact signed Root packet.
  const bytes=Uint8Array.from(packetDigest.match(/../g),x=>parseInt(x,16)),sourceRef=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  statements.push(store.statement('INSERT INTO handoffs(code_hash,account_id,epoch,challenge,state,expires_at,used,source_ref) VALUES(?,?,?,?,?,?,0,?) RETURNING code_hash',[p.codeHash,native.native_owner_id,native.native_epoch,a.challenge,a.state,a.expiresAtS*1000,sourceRef]));
 }else statements.push(store.statement('INSERT INTO academy_signin_tickets(code_hash,student_id,code_challenge,credential_epoch,expires_at) VALUES(?,?,?,?,?) RETURNING code_hash',[p.codeHash,native.native_owner_id,a.challenge,native.native_epoch,a.expiresAtS*1000]));
 statements.push(store.statement('INSERT INTO jwt_v110_admissions(ticket_hash,app,kind,operation_id,native_owner_id,native_epoch,parent_account_id,parent_id,browser_id,browser_generation,original_signed_at_s,original_expires_at_s,expires_at_s,payload_json,payload_digest) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING ticket_hash',[p.codeHash,app,'admit',a.operationId,native.native_owner_id,native.native_epoch,a.parentAccountId,a.parentId,a.browserId,a.browserGeneration,a.originalSignedAtS,a.originalExpiresAtS,a.expiresAtS,json,payloadDigest]),store.statement('DELETE FROM '+table+' WHERE guard_id=?',[guard]));
 const results=await store.batch(statements);
 if(results?.[1]?.results?.length!==1||results[1].results[0].code_hash!==p.codeHash||results?.[2]?.results?.length!==1||results[2].results[0].ticket_hash!==p.codeHash)fail();
 return ack;
}
