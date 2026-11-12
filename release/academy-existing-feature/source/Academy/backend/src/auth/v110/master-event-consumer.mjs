// Signed internal event consumer, route-free. Events invalidate/bound existing
// native authority; they never fabricate accounts, grants or Hifz journal IDs.
import {parseMasterEvent} from './master-event-contract.mjs';
const enc=new TextEncoder(),origins={studio:'https://worshipuponbaseera.ummabbadacademy.app',hifz:'https://mahadarwa-hifz.ummabbadacademy.app'};
const fail=(code='MASTER_DELIVERY_REJECTED',status=409)=>{throw Object.assign(Error(code),{code,status});};
const exact=(v,fields)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===fields.length&&fields.every(k=>Object.hasOwn(v,k));
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const sha=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))));
async function hmac(secret,usage){return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,[usage]);}
export async function consumeSignedMasterEvent({store,app,body,signature,secret,clock=Date.now}){
 if(!Object.hasOwn(origins,app)||typeof store?.first!=='function'||typeof store?.statement!=='function'||typeof store?.batch!=='function'||typeof secret!=='string'||secret.length<32||typeof clock!=='function')fail('MASTER_DELIVERY_CONFIG',503);
 if(typeof body!=='string'||enc.encode(body).length>16384||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))fail('MASTER_DELIVERY_SIGNATURE',401);
 const verifyKey=await hmac(secret,'verify');
 if(!await crypto.subtle.verify('HMAC',verifyKey,Uint8Array.from(signature.match(/../g),x=>parseInt(x,16)),enc.encode('uaa-event-delivery-v1\n'+body)))fail('MASTER_DELIVERY_SIGNATURE',401);
 let packet;try{packet=JSON.parse(body);}catch{fail();}
 const start=clock(),now=Math.floor(start/1000);
 if(!Number.isSafeInteger(start)||start<0||now>253402300799||!exact(packet,['ver','purpose','app','origin','issuedAtS','event'])||packet.ver!==1||packet.purpose!=='uaa-event-delivery-v1'||packet.app!==app||packet.origin!==origins[app]||!Number.isSafeInteger(packet.issuedAtS)||Math.abs(packet.issuedAtS-now)>30)fail('MASTER_DELIVERY_ENVELOPE',401);
 const event=await parseMasterEvent(packet.event,{app,now});
 const subject=event.type==='browser-superseded'?event.browserId:event.type==='parent-revoked'?event.parentId:event.parentAccountId;
 if(event.stream!==await sha(JSON.stringify([app,event.type,subject])))fail('MASTER_DELIVERY_STREAM');
 const ack={ver:1,purpose:'uaa-master-ack-v1',app,eventId:event.eventId,stream:event.stream,version:event.version,payloadDigest:event.payloadDigest,committed:true};
 const ackBody=JSON.stringify(ack),signKey=await hmac(secret,'sign');
 const ackSignature=hex(new Uint8Array(await crypto.subtle.sign('HMAC',signKey,enc.encode('uaa-event-ack-v1\n'+ackBody))));
 const response=()=>Object.freeze({body:ackBody,signature:ackSignature});
 const prior=await store.first('SELECT * FROM jwt_v110_delivery_receipts WHERE app=? AND event_id=?',[app,event.eventId]);
 if(prior){if(prior.stream!==event.stream||prior.version!==event.version||prior.payload_digest!==event.payloadDigest)fail('MASTER_DELIVERY_CONFLICT');return response();}
 const head=await store.first('SELECT * FROM jwt_v110_delivery_heads WHERE app=? AND stream=?',[app,event.stream]);
 if(head&&(!Number.isSafeInteger(head.version)||head.version<1)||event.version!==(head?.version||0)+1)fail('MASTER_DELIVERY_GAP');
 const guard=crypto.randomUUID(),guardTable=app==='studio'?'guards':'jwt_v110_native_guards';
 const headSQL=head?'EXISTS(SELECT 1 FROM jwt_v110_delivery_heads WHERE app=? AND stream=? AND version=? AND payload_digest=? AND event_id=?)':'NOT EXISTS(SELECT 1 FROM jwt_v110_delivery_heads WHERE app=? AND stream=?)';
 const headArgs=head?[app,event.stream,head.version,head.payload_digest,head.event_id]:[app,event.stream];
 const statements=[store.statement('INSERT INTO '+guardTable+'(guard_id,accepted) SELECT ?,('+headSQL+') AND NOT EXISTS(SELECT 1 FROM jwt_v110_delivery_receipts WHERE app=? AND event_id=?)',[guard,...headArgs,app,event.eventId])];
 if(event.type==='parent-revoked'){
  statements.push(
   store.statement('INSERT INTO jwt_v110_parent_tombstones VALUES(?,?) ON CONFLICT(parent_session_id) DO UPDATE SET expires_at_s=MAX(expires_at_s,excluded.expires_at_s)',[event.parentId,event.retainUntilS]),
   store.statement('UPDATE jwt_v110_families SET revoked=1 WHERE parent_session_id=? AND family_id IN(SELECT family_id FROM jwt_v110_native_bindings WHERE parent_account_id=?)',[event.parentId,event.parentAccountId]));
 }else if(event.type==='browser-superseded'){
  // A browser stream is global to the browser subject, never parent-account
  // scoped. Cancel old generations across all of its native account mappings.
  statements.push(
   store.statement('INSERT INTO jwt_v110_browser_heads VALUES(?,?,?) ON CONFLICT(browser_id) DO UPDATE SET generation=MAX(generation,excluded.generation),last_operation_id=CASE WHEN excluded.generation>generation THEN excluded.last_operation_id ELSE last_operation_id END',[event.browserId,event.beforeGeneration,event.eventId]),
   store.statement('UPDATE jwt_v110_families SET revoked=1 WHERE browser_id=? AND browser_generation<?',[event.browserId,event.beforeGeneration]));
 }else{
  const ce=event.type==='account-security'?event.credentialEpoch:0,pv=event.type==='authority-updated'?event.permissionVersion:0,sv=event.type==='account-security'?event.securityVersion:0;
  statements.push(store.statement('INSERT INTO jwt_v110_source_requirements VALUES(?,?,?,?,?) ON CONFLICT(app,parent_account_id) DO UPDATE SET credential_epoch_floor=MAX(credential_epoch_floor,excluded.credential_epoch_floor),permission_version_floor=MAX(permission_version_floor,excluded.permission_version_floor),security_version=MAX(security_version,excluded.security_version)',[app,event.parentAccountId,ce,pv,sv]));
  if(event.type==='authority-updated'){
   statements.push(store.statement('UPDATE jwt_v110_authority_floors SET required_permission_version=MAX(required_permission_version,?) WHERE app=? AND parent_account_id=?',[pv,app,event.parentAccountId]));
  }else{
   // Both actual supported native security actions increment Master CE.
   // Preserve legitimate families born at the new CE before delayed delivery;
   // never assign that Master CE to Hifz's independent native journal epoch.
   const boundCE=app==='hifz'?'b.source_credential_epoch':'f.credential_epoch';
   statements.push(
    store.statement('UPDATE jwt_v110_authority_floors SET source_credential_epoch=MAX(source_credential_epoch,?) WHERE app=? AND parent_account_id=?',[ce,app,event.parentAccountId]),
    store.statement('UPDATE jwt_v110_families SET revoked=1 WHERE family_id IN(SELECT f.family_id FROM jwt_v110_families f JOIN jwt_v110_native_bindings b USING(family_id) WHERE b.parent_account_id=? AND '+boundCE+'<?)',[event.parentAccountId,ce]));
  }
 }
 const commitAt=clock();if(!Number.isSafeInteger(commitAt)||commitAt<start||commitAt-start>5000||Math.abs(Math.floor(commitAt/1000)-packet.issuedAtS)>30)fail('MASTER_DELIVERY_EXPIRED',401);
 statements.push(
  store.statement('INSERT INTO jwt_v110_delivery_heads VALUES(?,?,?,?,?) ON CONFLICT(app,stream) DO UPDATE SET version=excluded.version,payload_digest=excluded.payload_digest,event_id=excluded.event_id',[app,event.stream,event.version,event.payloadDigest,event.eventId]),
  store.statement('INSERT INTO jwt_v110_delivery_receipts VALUES(?,?,?,?,?,?) RETURNING event_id,stream,version,payload_digest',[app,event.eventId,event.stream,event.version,event.payloadDigest,Math.floor(commitAt/1000)]),
  store.statement('DELETE FROM '+guardTable+' WHERE guard_id=?',[guard]));
 const receiptIndex=statements.length-2;
 try{const results=await store.batch(statements),row=results?.[receiptIndex]?.results?.[0];if(results?.[receiptIndex]?.results?.length!==1||row.event_id!==event.eventId||row.stream!==event.stream||row.version!==event.version||row.payload_digest!==event.payloadDigest)fail('MASTER_DELIVERY_COMMIT_UNCONFIRMED',503);}
 catch{fail('MASTER_DELIVERY_COMMIT_FAILED');}
 return response();
}
