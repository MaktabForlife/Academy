import {sha256} from '../d1/web-platform/protocol.mjs';
import {nativeBusinessProof,businessParentCondition} from './native-business.mjs';
import {canonical,digest,requireThat,uuid} from '../../../../security/v2/codec.mjs';
export async function nativeBusinessIdentity(runtime,proof,{authority=proof.body.authority}={}){
 requireThat(nativeBusinessProof(proof),'NATIVE_RPC_BRANDED_PROOF_REQUIRED',503);const b=proof.body.binding,input=proof.body.input,store=runtime.store,now=runtime.clock(),create=input.create===true;
 requireThat(proof.body.command==='/internal/website/identity'&&uuid(input.operationId)&&input.operationId===proof.body.operationId&&input.actorId===b.sub&&Number.isSafeInteger(input.actorEpoch)&&input.actorEpoch>=0&&input.actorEpoch<=b.ce&&typeof input.offeringId==='string','NATIVE_RPC_IDENTITY_INPUT_INVALID',400);
 const scope=authority.scopes.find(s=>s.offering_id===input.offeringId),capturedGlobal=authority.globalAdmin,capturedAdmin=Boolean(scope?.active===1&&scope.kind==='COURSE'&&scope.role==='ADMIN'&&scope.can_create_account===1&&scope.source?.enabled===1);
 requireThat(capturedGlobal||create&&capturedAdmin,'NATIVE_RPC_CAPTURED_ADMIN_REQUIRED',403);
 const map=await store.first('SELECT activity_key FROM website_platform_timetable_scopes WHERE offering_id=?',input.offeringId),activity=map?.activity_key||input.offeringId;
 requireThat(capturedGlobal||activity.toUpperCase().startsWith('COURSE:'),'NATIVE_RPC_CAPTURED_ADMIN_REQUIRED',403);
 const label=create?String(input.displayName||'').trim():null;requireThat(!create||label.length>0&&label.length<=160,'NATIVE_RPC_IDENTITY_INPUT_INVALID',400);
 requireThat(create||typeof input.accountId==='string'&&input.accountId.length>0&&input.accountId.length<=180,'NATIVE_RPC_IDENTITY_INPUT_INVALID',400);
 const canonicalInput={operationId:input.operationId,offeringId:input.offeringId,actorId:b.sub,actorEpoch:input.actorEpoch,...(create?{displayName:label,create:true}:{accountId:input.accountId})},hash=await sha256(JSON.stringify(canonicalInput));
 let receipt=await store.first('SELECT * FROM website_platform_provisioning WHERE operation_id=?',input.operationId);
 requireThat(!receipt||receipt.actor_id===b.sub&&receipt.payload_hash===hash,'NATIVE_RPC_IDENTITY_OPERATION_CONFLICT',409);
 const parent=businessParentCondition(proof,{now}),current=`SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) WHERE a.account_id=? AND a.active=1 AND c.credential_epoch=? AND EXISTS(${parent.sql}) AND
 ((?=1 AND EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.active=1 AND g.review_state='CONFIRMED' AND g.role='GLOBAL_ADMIN')) OR (?=1 AND EXISTS(SELECT 1 FROM effective_activity_roles r JOIN activities x USING(activity_key) WHERE r.account_id=a.account_id AND r.activity_key=? COLLATE NOCASE AND r.role='PROGRAM_ADMIN' AND x.kind='COURSE' AND x.active=1 AND x.lifecycle='ACTIVE')))`,guardArgs=[b.sub,b.ce,...parent.args,Number(capturedGlobal),Number(create&&capturedAdmin),activity];
 // Existing receipts never substitute for current authority on an explicit retry.
 requireThat(await store.first(current,...guardArgs),'NATIVE_RPC_IDENTITY_AUTHORITY_ENDED',403);
 if(!receipt){
  const target=create?crypto.randomUUID():input.accountId,stamp=new Date(now*1000).toISOString(),loginId=create?crypto.randomUUID():null;
  requireThat(create||await store.first('SELECT account_id FROM accounts WHERE account_id=?',target),'NATIVE_RPC_IDENTITY_ACCOUNT_MISSING',404);
  const [g,clear]=store.guard(current,guardArgs),plan=[];
  if(create)plan.push(store.stmt('INSERT INTO accounts(account_id,display_name,login_link_id,active,created_at,updated_at,created_by_source_id,modified_by_source_id,revision) VALUES(?,?,?,1,?,?,?,?,1)',target,label,loginId,stamp,stamp,b.sub,b.sub),store.stmt('INSERT INTO account_credentials(account_id,pin_setup,credential_epoch) VALUES(?,0,1)',target));
  plan.push(store.stmt('INSERT INTO website_platform_admissions VALUES(?,1) ON CONFLICT(account_id) DO NOTHING',target),store.stmt('INSERT INTO website_platform_provisioning VALUES(?,?,?,?,NULL)',input.operationId,b.sub,hash,target),store.stmt("INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json) VALUES(?,?,?,?,?,?,'USER_ACCOUNT',?,?)",crypto.randomUUID(),stamp,b.sub,capturedGlobal?'GLOBAL_ADMIN':'PROGRAM_ADMIN',input.offeringId,create?'WEBSITE_ACCOUNT_CREATE':'WEBSITE_ACCOUNT_LINK',target,JSON.stringify(create?['DisplayName','AccountID','WebsiteAdmission']:['AccountID','WebsiteAdmission'])));
  try{await store.batch([g,...plan,clear]);}catch(error){receipt=await store.first('SELECT * FROM website_platform_provisioning WHERE operation_id=?',input.operationId);if(!receipt||receipt.actor_id!==b.sub||receipt.payload_hash!==hash)throw error;}
  receipt||={account_id:target};
 }
 const row=await store.first('SELECT * FROM website_platform_account_state WHERE account_id=?',receipt.account_id),account=await store.first('SELECT login_link_id FROM accounts WHERE account_id=?',receipt.account_id);requireThat(row&&account,'NATIVE_RPC_IDENTITY_ACCOUNT_MISSING',503);
 return {schema:'NATIVE_IDENTITY_V2',operationId:input.operationId,loginPath:'/account/'+account.login_link_id,account:{accountId:row.account_id,displayName:row.display_name,active:Boolean(row.active),admitted:Boolean(row.admitted),epoch:row.epoch,globalAdmin:Boolean(row.global_admin),sourceContactAtMs:now*1000}};
}
