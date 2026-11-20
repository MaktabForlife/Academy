import {verifyPortalEnvelope} from '../../../../security/v2/portal-business.mjs';
import {markPortalCapability} from '../../../../security/v2/portal-capability.mjs';
import {PrimaryStore} from '../../../../security/v2/store.mjs';
import {primaryWriteCondition} from '../../../../security/v2/primary-write-guard.mjs';
import {canonical,strictJSON,requireThat,uuid,bytes,digest} from '../../../../security/v2/codec.mjs';
const allowed=new Set(['/internal/website/media-teachers','/internal/website/course-playlist-placements','/internal/website/identity']);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export function rootPortalPrimaryCondition(proof,meta,{now}){
 const b=proof.body.binding,h=proof.body.authority.head,primary=primaryWriteCondition({binding:b,app:'academy',env:'production',now,kid:meta.apiKid,rightsHash:proof.body.rightsHash});
 const sql="SELECT 1 WHERE EXISTS("+primary.sql+") AND EXISTS(SELECT 1 FROM jwt_v2_root_delegations d WHERE d.delegation_id=? AND d.binding_json=? AND d.head_json=? AND d.expires_at>unixepoch()) AND EXISTS(SELECT 1 FROM jwt_v2_objects WHERE object_key=? AND state='ACTIVE') AND EXISTS(SELECT 1 FROM jwt_v2_objects WHERE object_key=? AND state IN('ACTIVE','SEED') AND create_claimed=1 AND seed_observed=1) AND NOT EXISTS(SELECT 1 FROM split_write_fence) AND EXISTS(SELECT 1 FROM studio_authority_heads h WHERE h.sub=? AND h.owner_epoch=? AND h.revision=? AND h.digest=? AND NOT EXISTS(SELECT 1 FROM json_each(h.source_guards_json) j LEFT JOIN jwt_v2_dependencies dep ON dep.id=json_extract(j.value,'$[0]') AND dep.scope=json_extract(j.value,'$[1]') WHERE dep.id IS NULL OR dep.owner_epoch<>json_extract(j.value,'$[2]') OR dep.revision<>json_extract(j.value,'$[3]'))) AND ?>unixepoch()";
 return {sql,args:[...primary.args,proof.body.authority.delegationId,canonical(b),canonical(h),meta.prefix+'control/app',meta.prefix+'security/session/'+b.sid,h.sub,h.ownerEpoch,h.revision,h.payloadDigest,proof.body.expiresAt]};
}
export async function verifyRootPortalProof(envelope,{env,clock}){
 requireThat(envelope?.kind==='ROOT_PORTAL_RETURN'&&envelope.portalEnvelope,'PORTAL_RETURN_PROOF_REQUIRED',401);
 const now=clock(),peer=await verifyPortalEnvelope(envelope.portalEnvelope,{env,app:'academy',now}),portal=markPortalCapability(peer.body,{now,peer}),input=peer.body.input;
 requireThat(input&&allowed.has(input.command)&&uuid(input.operationId)&&input.input&&typeof input.input==='object'&&!Array.isArray(input.input),'PORTAL_RETURN_COMMAND_INVALID',403);
 const raw=strictJSON(env.UAA_V2_CONFIG,{maxBytes:65536});requireThat(raw.app==='academy'&&raw.env==='production'&&raw.AIEnabled===false&&env.UAA_V2_ENABLED==='1','PORTAL_RETURN_CONFIG_INVALID',503);
 const store=new PrimaryStore(env.ACADEMY_DB,{app:'academy',env:'production'}),row=await store.first('SELECT * FROM jwt_v2_root_delegations WHERE delegation_id=?',portal.delegationId);
 requireThat(row&&now<row.expires_at&&portal.expiresAt<=row.expires_at&&row.binding_json===canonical(portal.binding)&&row.head_json===canonical(portal.head)&&['admin','admin-read','admin-cover'].includes(row.operation)&&typeof row.offering_id==='string'&&input.input.offeringId===row.offering_id,'PORTAL_RETURN_SCOPE_INVALID',403);
 if(input.command==='/internal/website/identity'){
  requireThat(row.operation==='admin'&&row.native_action==='resume'&&typeof row.job_id==='string'&&input.input.operationId===row.job_id,'PORTAL_IDENTITY_INTENT_REQUIRED',403);
  const intent=await store.first('SELECT * FROM jwt_v2_portal_provision_intents WHERE operation_id=?',row.job_id);
  requireThat(intent&&intent.sub===portal.binding.sub&&intent.ce===portal.binding.ce&&intent.offering_id===row.offering_id&&intent.identity_hash===await digest(input.input),'PORTAL_IDENTITY_INTENT_MISMATCH',403);
 }else requireThat(row.native_action!=='resume'&&row.native_action!=='provision','PORTAL_CALLBACK_INTENT_INVALID',403);
 const body={schema:3,env:'production',sourceApp:'studio',targetApp:'academy',operationId:input.operationId,issuedAt:peer.time,expiresAt:portal.expiresAt,binding:portal.binding,rightsHash:row.rights_hash,authority:{schema:3,delegationId:portal.delegationId,head:portal.head},command:input.command,input:input.input,resource:input.resource??null};
 if(envelope.body)requireThat(canonical(envelope.body)===canonical(body),'PORTAL_RETURN_PROOF_CHANGED',401);
 const proof=freeze({kind:'ROOT_PORTAL_RETURN',body,keyId:peer.kid,issuedAt:peer.time,nonce:peer.nonce,mac:envelope.portalEnvelope.mac,portalEnvelope:JSON.parse(canonical(envelope.portalEnvelope))}),meta={kind:'ROOT_PORTAL_RETURN',env,clock,apiKid:row.api_kid,prefix:'auth-private/v2/production/academy/'+raw.generation+'/'};
 const guard=rootPortalPrimaryCondition(proof,meta,{now});requireThat(await store.first(guard.sql,...guard.args),'PORTAL_RETURN_PARENT_CHANGED',401);
 requireThat(bytes(canonical(proof)).length<=65536,'PORTAL_RETURN_PROOF_TOO_LARGE',413);return {proof,meta};
}
