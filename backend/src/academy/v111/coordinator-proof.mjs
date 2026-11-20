import {nativeBusinessProof,verifyNativeBusinessEnvelope,businessParentCondition} from './native-business.mjs';
import {permissionSignature} from '../separation/permission-signature.js';
import {canonical,bytes,b64u,unb64u,sha256,hex,hmac,equal,digest,safeInt,uuid,requireThat} from '../../../../security/v2/codec.mjs';
import {primaryWriteCondition} from '../../../../security/v2/primary-write-guard.mjs';
import {nativeAuthContext,capturedAcademyState} from './native-context.js';
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const PORTAL_PURPOSE='academy-root-portal-coordinator-v2',BUSINESS_PURPOSE='academy-native-business-coordinator-v2',PURPOSE='academy-native-coordinator-v2',verified=new WeakMap(),local=new WeakMap();
const fail=(code,status=401)=>Object.assign(Error(code),{code,status});
function configuration(env){
 let config;try{config=typeof env?.UAA_V2_CONFIG==='string'?JSON.parse(env.UAA_V2_CONFIG):env?.UAA_V2_CONFIG;}catch{}
 requireThat(config?.schema===2&&config.app==='academy'&&config.env==='production'&&config.publicOrigin==='https://ummabbadacademy.app'&&config.AIEnabled===false&&config.activationEnabled===true,'COORDINATOR_CONFIGURATION_REQUIRED',503);return config;
}
function keyFor(env){
 configuration(env);
 let key;try{key=unb64u(env?.UAA_V2_COORDINATOR_KEY,32);}catch{throw fail('COORDINATOR_KEY_REQUIRED',503);}
 const same=[];for(const [name,value] of Object.entries(env))if(name!=='UAA_V2_COORDINATOR_KEY'&&/(?:KEY|SECRET)(?:_|$)/i.test(name)&&typeof value==='string')same.push(value);
 for(const value of same){try{if(equal(key,unb64u(value,32)))throw fail('COORDINATOR_KEY_PURPOSE_CONFLICT',503);}catch(error){if(error.code==='COORDINATOR_KEY_PURPOSE_CONFLICT')throw error;}}
 return key;
}
function inputJSON(value){
 if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isFinite(value))throw fail('COORDINATOR_INPUT_INVALID',400);return JSON.stringify(value);}
 if(value instanceof Uint8Array)return '{"$binary":'+JSON.stringify(b64u(value))+'}';
 if(value instanceof ArrayBuffer)return inputJSON(new Uint8Array(value));
 if(Array.isArray(value))return '['+value.map(inputJSON).join(',')+']';
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw fail('COORDINATOR_INPUT_INVALID',400);
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+inputJSON(value[k])).join(',')+'}';
}
export const coordinatorInputDigest=async input=>hex(await sha256(bytes(inputJSON(input))));
function shape(body){
 const keys=['app','binding','command','deadline','env','inputDigest','issuedAt','kid','nativeState','nonce','purpose','rightsHash','schema','service'];
 requireThat(body&&Object.keys(body).sort().join(',')===keys.sort().join(',')&&body.schema===2&&[PURPOSE,BUSINESS_PURPOSE,PORTAL_PURPOSE].includes(body.purpose)&&body.app==='academy'&&['production','feature'].includes(body.env)&&['read','write'].includes(body.command)&&safeInt(body.issuedAt)&&safeInt(body.deadline)&&body.deadline<=body.issuedAt+60&&uuid(body.nonce)&&/^[0-9a-f]{64}$/.test(body.inputDigest)&&/^[0-9a-f]{64}$/.test(body.rightsHash)&&typeof body.kid==='string'&&body.kid.length>0,'COORDINATOR_PROOF_INVALID',401);
 const b=body.binding,state=body.nativeState,business=body.purpose===BUSINESS_PURPOSE||body.purpose===PORTAL_PURPOSE;requireThat(business?body.command==='read'&&body.service&&body.service.body?.rightsHash===body.rightsHash:body.service===null,'COORDINATOR_SERVICE_PURPOSE_INVALID',401);
 requireThat(b?.iss===(body.purpose===BUSINESS_PURPOSE?'https://worshipuponbaseera.ummabbadacademy.app':'https://ummabbadacademy.app')&&b.env===body.env&&uuid(b.sid)&&safeInt(b.ce,1)&&safeInt(b.vat)&&safeInt(b.s_exp)&&body.deadline<=Math.min(b.vat+900,b.s_exp)&&state?.account?.account_id===b.sub&&state.account.credential_epoch===b.ce&&state.account.active===1,'COORDINATOR_PROOF_BINDING_INVALID',401);
 requireThat(bytes(canonical(body)).length<=2*1024*1024,'COORDINATOR_PROOF_TOO_LARGE',503);return body;
}
export function localActorProof(auth,plain){const context=nativeAuthContext(auth);if(!context)return null;const proof=Object.freeze({...plain});local.set(proof,context);return proof;}
export function localProofContext(proof){const context=local.get(proof);if(context)context.runtime.assertCapability(context.cap);return context;}
export async function buildCoordinatorProof(auth,{command,input,clock=null}){
 const context=nativeAuthContext(auth);if(!context||typeof context.runtime.coordinatorCapability!=='function')throw fail('COORDINATOR_BRANDED_CAPABILITY_REQUIRED',503);
 const cap=context.runtime.coordinatorCapability(context.cap),now=(clock||context.runtime.clock||(()=>Math.floor(Date.now()/1000)))();capturedAcademyState(context);
 const service=context.serviceProof;if(service)requireThat(nativeBusinessProof(service),'NATIVE_RPC_BRANDED_PROOF_REQUIRED',503);
 const body=shape({schema:2,service:service||null,purpose:service?(service.kind==='ROOT_PORTAL_RETURN'?PORTAL_PURPOSE:BUSINESS_PURPOSE):PURPOSE,app:'academy',env:cap.binding.env,command,inputDigest:await coordinatorInputDigest(input),binding:cap.binding,rightsHash:service?service.body.rightsHash:await digest(cap.rights),nativeState:capturedAcademyState(context),kid:cap.kid,issuedAt:now,deadline:Math.min(cap.deadline,cap.binding.s_exp,cap.binding.vat+900,now+60),nonce:crypto.randomUUID()});
 requireThat(body.deadline>now,'COORDINATOR_PROOF_EXPIRED',401);const signature=b64u(await hmac(keyFor(context.env),canonical(body)));return {body,signature};
}
export async function verifyCoordinatorProof(envelope,{env,command,input,inputDigest,clock=()=>Math.floor(Date.now()/1000)}){
 requireThat(env?.UAA_V2_ENABLED==='1'&&envelope&&Object.keys(envelope).sort().join(',')==='body,signature','COORDINATOR_PROOF_REQUIRED',401);
 const body=shape(envelope.body);requireThat(body.env===configuration(env).env,'COORDINATOR_ENVIRONMENT_MISMATCH',401);let signature;try{signature=unb64u(envelope.signature,32);}catch{throw fail('COORDINATOR_PROOF_INVALID');}
 requireThat(equal(signature,await hmac(keyFor(env),canonical(body))),'COORDINATOR_PROOF_INVALID',401);
 const now=clock();requireThat(body.command===command&&body.issuedAt<=now&&body.deadline>now,'COORDINATOR_PROOF_EXPIRED',401);
 requireThat(body.inputDigest===(inputDigest??await coordinatorInputDigest(input)),'COORDINATOR_INPUT_MISMATCH',401);
 const service=body.service?await verifyNativeBusinessEnvelope(body.service,{env,clock}):null;if(service)requireThat(canonical(service.body.binding)===canonical(body.binding),'COORDINATOR_SERVICE_BINDING_INVALID',401);
 const stable=freeze(JSON.parse(canonical(body))),stableEnvelope=Object.freeze({body:stable,signature:envelope.signature}),state=stable.nativeState;
 const proof=Object.freeze({accountId:stable.binding.sub,sid:stable.binding.sid,epoch:stable.binding.ce,v2:true,nativeState:state,binding:stable.binding,deadline:stable.deadline,rightsHash:stable.rightsHash,kid:stable.kid,envelope:stableEnvelope,monthlyMedia:state.monthlyMediaEnabled===true,surahGrants:state.surahGrantsEnabled===true,signature:permissionSignature({globalAdmin:state.account.global_admin,roles:state.roles,subscriptions:state.subscriptions,grants:JSON.parse(state.account.substitute_grants||'[]'),...(state.monthlyMediaEnabled?{monthlyMedia:state.monthlyMedia}:{}),...(state.surahGrantsEnabled?{surahGrants:state.surahGrants}:{})})});verified.set(proof,{body:stable,env,clock,service});return proof;
}
export function verifiedCoordinatorContext(proof){return verified.get(proof)||null;}
export function coordinatorPrimaryCondition(proof,{now=Math.floor(Date.now()/1000)}={}){
 const context=verifiedCoordinatorContext(proof);if(!context||context.body.deadline<=now)throw fail('COORDINATOR_PROOF_EXPIRED');
 if(context.service){const g=businessParentCondition(context.service,{now});return {sql:g.sql+" AND EXISTS(SELECT 1 FROM jwt_v2_nonces WHERE source_app='studio' AND key_id=? AND nonce=? AND expires_at>unixepoch())",args:[...g.args,context.service.kind==='ROOT_PORTAL_RETURN'?'portal:'+context.service.keyId:context.service.keyId,context.service.nonce]};}
 const primary=primaryWriteCondition({binding:proof.binding,app:'academy',env:proof.binding.env,now,kid:proof.kid,rightsHash:proof.rightsHash});
 // Re-evaluate wall-clock ceilings inside the actual D1 transaction after any queue delay.
 return {sql:'SELECT 1 WHERE EXISTS('+primary.sql+") AND unixepoch()<? AND EXISTS(SELECT 1 FROM jwt_v2_families WHERE sid=? AND state='UNLOCKED' AND authority_ready=1 AND deadline>unixepoch() AND idle_until>unixepoch() AND s_exp>unixepoch())",args:[...primary.args,proof.deadline,proof.binding.sid]};
}
