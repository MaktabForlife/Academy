// No-network wire preparation for committed lifecycle facts. Capture occurred
// in the real owning Core logout/switch batch; this never creates an event.
import {masterEventDigest,parseMasterEvent} from './master-event-contract.mjs';
const fail=()=>{throw Object.assign(Error('Lifecycle event unavailable'),{code:'MASTER_LIFECYCLE_UNAVAILABLE',status:503});};
export async function prepareCapturedLifecycleEvent(core,eventId,now){
 if(typeof core?.prepare!=='function'||typeof eventId!=='string'||!/^[-A-Za-z0-9_:]{1,180}$/.test(eventId)||!Number.isSafeInteger(now)||now<0||now>253402300799)fail();
 const row=await core.prepare('SELECT * FROM jwt_v110_master_lifecycle_outbox WHERE event_id=?').bind(eventId).first();if(!row)fail();
 if(row.wire_json){const value=await parseMasterEvent(JSON.parse(row.wire_json),{app:row.target_app,now});if(value.eventId!==row.event_id||value.payloadDigest!==row.payload_digest)fail();return value;}
 let facts;try{facts=JSON.parse(row.facts_json);}catch{fail();}
 const bytes=new TextEncoder().encode(JSON.stringify([row.target_app,row.kind,row.subject_id]));
 const stream=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const value={ver:1,purpose:'uaa-master-event-v1',app:row.target_app,eventId:row.event_id,operationId:row.operation_id,stream,version:row.version,parentAccountId:row.parent_account_id,type:row.kind,issuedAtS:row.issued_at_s,retainUntilS:row.retain_until_s,...facts};
 value.payloadDigest=await masterEventDigest(value);
 const checked=await parseMasterEvent(value,{app:row.target_app,now});
 await core.prepare('UPDATE jwt_v110_master_lifecycle_outbox SET wire_json=?,payload_digest=? WHERE event_id=? AND wire_json IS NULL AND facts_json=?').bind(JSON.stringify(checked),checked.payloadDigest,row.event_id,row.facts_json).run();
 const saved=await core.prepare('SELECT wire_json,payload_digest FROM jwt_v110_master_lifecycle_outbox WHERE event_id=?').bind(row.event_id).first();
 if(saved?.wire_json!==JSON.stringify(checked)||saved?.payload_digest!==checked.payloadDigest)fail();return checked;
}
