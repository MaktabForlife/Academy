import {verifyRootPortalProof,rootPortalPrimaryCondition} from './portal-return-proof.mjs';
import {canonical,strictJSON,requireThat,uuid,safeInt,bytes,digest,hmac,equal,unb64u} from '../../../../security/v2/codec.mjs';
import {nativeRPCSigner} from '../../../../security/v2/native-domain.mjs';
import {validateStudioBusinessAuthority,studioBusinessCommands} from './studio-business-authority.mjs';
const verified=new WeakMap(),origin='https://ummabbadacademy.app';
const fail=(code,status=401)=>Object.assign(Error(code),{code,status});
const exact=(value,keys)=>requireThat(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.slice().sort().join(','),'NATIVE_RPC_BODY_INVALID',400);
function bindingShape(b,body,now){
 exact(b,['ver','env','iss','aud','sub','sid','psid','bsid','bv','ce','ae','le','sv','ue','pv','vat','s_iat','s_exp']);
 requireThat(b.ver===2&&b.env===body.env&&b.iss==='https://worshipuponbaseera.ummabbadacademy.app'&&b.aud==='urn:uaa:production:studio:api:v2'&&typeof b.sub==='string'&&b.sub.length>0&&b.sub.length<=180&&[b.sid,b.psid,b.bsid].every(uuid)&&['bv','ce','ae','sv'].every(k=>safeInt(b[k],1))&&['le','ue','vat','s_iat','s_exp'].every(k=>safeInt(b[k]))&&typeof b.pv==='string'&&b.pv.length<=200&&b.s_exp===b.s_iat+604800&&b.s_iat<=b.vat&&b.vat<=now&&body.expiresAt<=Math.min(b.s_exp,b.vat+900),'NATIVE_RPC_BINDING_INVALID',401);
}
function config(env){let c;try{c=typeof env.UAA_V2_CONFIG==='string'?JSON.parse(env.UAA_V2_CONFIG):env.UAA_V2_CONFIG;}catch{}requireThat(env.UAA_V2_ENABLED==='1'&&c?.schema===2&&c.app==='academy'&&c.env==='production'&&c.publicOrigin===origin&&c.AIEnabled===false&&c.activationEnabled===true,'NATIVE_RPC_CONFIGURATION_REQUIRED',503);return c;}
export function nativeBusinessProof(proof){return verified.get(proof)||null;}
export function businessParentCondition(proof,{now=Math.floor(Date.now()/1000)}={}){
 const meta=nativeBusinessProof(proof);requireThat(meta&&proof.body.expiresAt>now,'NATIVE_RPC_LEASE_EXPIRED',401);const b=proof.body.binding;
 if(meta.kind==='ROOT_PORTAL_RETURN')return rootPortalPrimaryCondition(proof,meta,{now});
 // Academy inactivity is independent. LOCKED is permitted; terminal parent,
 // reset, suspicious-account cutoff and browser cancellation always deny.
 const floor=`NOT EXISTS(SELECT 1 FROM jwt_v2_restrictions r WHERE
 (json_extract(r.target_json,'$.type')='accountCutoff' AND json_extract(r.target_json,'$.sub')=? AND (?<json_extract(r.target_json,'$.maxCe') OR (?=json_extract(r.target_json,'$.maxCe') AND ?<=json_extract(r.target_json,'$.maxAe')))) OR
 (json_extract(r.target_json,'$.type')='credentialEpoch' AND json_extract(r.target_json,'$.sub')=? AND ?<json_extract(r.target_json,'$.newCe')) OR
 (json_extract(r.target_json,'$.type')='browser' AND json_extract(r.target_json,'$.bsid')=? AND ?<=json_extract(r.target_json,'$.maxBv')) OR
 (json_extract(r.target_json,'$.type')='parent' AND json_extract(r.target_json,'$.sub')=? AND json_extract(r.target_json,'$.psid')=? AND json_extract(r.target_json,'$.bsid')=? AND json_extract(r.target_json,'$.bv')=? AND json_extract(r.target_json,'$.ce')=? AND json_extract(r.target_json,'$.ae')=?))`;
 return {sql:`SELECT 1 FROM jwt_v2_accounts a JOIN jwt_v2_parents p ON p.sub=a.sub JOIN jwt_v2_browsers b ON b.bsid=p.bsid
 WHERE a.sub=? AND a.active=1 AND a.ce=? AND a.ae=? AND p.psid=? AND p.ce=a.ce AND p.ae=a.ae AND p.bsid=? AND p.bv=? AND p.s_iat=? AND p.s_exp=? AND p.state IN('UNLOCKED','LOCKED') AND p.s_exp>? AND p.s_exp>unixepoch() AND ?>unixepoch() AND b.sub=a.sub AND b.psid=p.psid AND b.bv=p.bv AND b.cancelled_through<p.bv AND `+floor,
 args:[b.sub,b.ce,b.ae,b.psid,b.bsid,b.bv,b.s_iat,b.s_exp,now,proof.body.expiresAt,b.sub,b.ce,b.ce,b.ae,b.sub,b.ce,b.bsid,b.bv,b.sub,b.psid,b.bsid,b.bv,b.ce,b.ae]};
}
async function readBody(request){const reader=request.body?.getReader();requireThat(reader,'NATIVE_RPC_BODY_REQUIRED',400);const chunks=[];let length=0;try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>65536){await reader.cancel();throw fail('NATIVE_RPC_SCOPE_PARTITION_REQUIRED',413);}chunks.push(value);}}finally{reader.releaseLock();}const raw=new Uint8Array(length);let offset=0;for(const part of chunks){raw.set(part,offset);offset+=part.byteLength;}return strictJSON(raw,{maxBytes:65536});}
export async function verifyNativeBusinessEnvelope(envelope,{env,clock=()=>Math.floor(Date.now()/1000)}){
 config(env);if(envelope?.kind==='ROOT_PORTAL_RETURN'){const value=await verifyRootPortalProof(envelope,{env,clock});verified.set(value.proof,value.meta);return value.proof;}
 exact(envelope,['body','keyId','issuedAt','nonce','mac']);const {body,keyId,issuedAt,nonce,mac}=envelope,now=clock();
 exact(body,['schema','env','sourceApp','targetApp','operationId','issuedAt','expiresAt','binding','rightsHash','authority','command','input','resource']);
 requireThat(body.schema===2&&body.env==='production'&&body.sourceApp==='studio'&&body.targetApp==='academy'&&studioBusinessCommands.includes(body.command)&&uuid(body.operationId)&&safeInt(body.issuedAt)&&body.issuedAt===issuedAt&&body.issuedAt<=now&&safeInt(body.expiresAt)&&now<body.expiresAt&&body.expiresAt<=body.issuedAt+60&&/^[0-9a-f]{64}$/.test(body.rightsHash)&&body.input&&typeof body.input==='object'&&!Array.isArray(body.input)&&typeof nonce==='string'&&/^[A-Za-z0-9_-]{43}$/.test(nonce),'NATIVE_RPC_BODY_INVALID',401);
 requireThat(bytes(canonical(body)).length<=65536,'NATIVE_RPC_SCOPE_PARTITION_REQUIRED',413);bindingShape(body.binding,body,now);validateStudioBusinessAuthority(body.authority);
 const signer=nativeRPCSigner({env,settings:{raw:{nativeRPCSigningKid:keyId}}},body.command,now),packet={purpose:'uaa-native-business-v2',method:'POST',path:body.command,env:body.env,sourceApp:'studio',targetApp:'academy',keyId,issuedAt,nonce,bodyDigest:await digest(body)};
 let signature;try{signature=unb64u(mac,32);}catch{throw fail('NATIVE_RPC_MAC_INVALID');}requireThat(equal(signature,await hmac(signer.key,canonical(packet))),'NATIVE_RPC_MAC_INVALID',401);
 const stable=JSON.parse(canonical(envelope)),freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};freeze(stable);verified.set(stable,{env,clock});return stable;
}
export async function receiveNativeBusiness(request,{env,store,clock=()=>Math.floor(Date.now()/1000),dispatch}){
 const url=new URL(request.url);requireThat(url.origin===origin&&request.method==='POST'&&studioBusinessCommands.includes(url.pathname)&&!url.search,'NATIVE_RPC_PATH_INVALID',404);
 const issuedAt=Number(request.headers.get('X-UAA-Native-Time')),body=await readBody(request),proof=await verifyNativeBusinessEnvelope({body,keyId:request.headers.get('X-UAA-Native-Key'),issuedAt,nonce:request.headers.get('X-UAA-Native-Nonce'),mac:request.headers.get('X-UAA-Native-MAC')},{env,clock});
 requireThat(body.command===url.pathname,'NATIVE_RPC_PATH_INVALID',401);const parent=businessParentCondition(proof,{now:clock()}),[g,clear]=store.guard(parent.sql,parent.args);
 try{await store.batch([g,store.stmt('INSERT INTO jwt_v2_nonces VALUES(?,?,?,?)','studio',proof.keyId,proof.nonce,proof.body.expiresAt),clear]);}catch(error){if(await store.first('SELECT 1 FROM jwt_v2_nonces WHERE source_app=? AND key_id=? AND nonce=?','studio',proof.keyId,proof.nonce))throw fail('NATIVE_RPC_NONCE_REUSED');throw fail('NATIVE_RPC_PARENT_UNAVAILABLE');}
 requireThat(typeof dispatch==='function','NATIVE_RPC_DISPATCH_REQUIRED',503);const result=await dispatch(proof);requireThat(proof.body.expiresAt>clock(),'NATIVE_RPC_LEASE_EXPIRED',401);
 return result instanceof Response?result:Response.json(result,{headers:{'Cache-Control':'no-store'}});
}
