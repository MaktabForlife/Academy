// Bounded source outbox pump. No scheduler, route, provider or fetch import.
// send is a trusted finite local transport injected only by future composition.
// ACK failure leaves the immutable event pending with durable bounded backoff.
import {prepareCapturedMasterEvent} from './master-event-prepare.mjs';
import {prepareCapturedLifecycleEvent} from './master-lifecycle-prepare.mjs';
import {parseCommittedMasterACK} from './master-event-contract.mjs';
const enc=new TextEncoder(),origins={studio:'https://worshipuponbaseera.ummabbadacademy.app',hifz:'https://mahadarwa-hifz.ummabbadacademy.app'};
const fail=()=>{throw Object.assign(Error('Master delivery unavailable'),{code:'MASTER_DELIVERY_UNAVAILABLE',status:503});};
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
// Trusted server configuration only; no HTTP/request field supplies this.
async function boundedSend(send,packet,deliveryTimeoutMs){
 const controller=new AbortController();let timer;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error('MASTER_DELIVERY_TIMEOUT'));controller.abort();},deliveryTimeoutMs);});
 try{return await Promise.race([Promise.resolve().then(()=>send(Object.freeze({...packet,signal:controller.signal}))),deadline]);}
 finally{clearTimeout(timer);controller.abort();}
}
export async function pumpMasterOutbox({core,app,kind='account',secret,send,clock=Date.now,limit=8,deliveryTimeoutMs=5000}){
 if(typeof core?.prepare!=='function'||!Object.hasOwn(origins,app)||!['account','lifecycle'].includes(kind)||typeof secret!=='string'||secret.length<32||typeof send!=='function'||typeof clock!=='function'||!Number.isInteger(limit)||limit<1||limit>8||!Number.isInteger(deliveryTimeoutMs)||deliveryTimeoutMs<1||deliveryTimeoutMs>5000)fail();
 const time=()=>{const ms=clock();if(!Number.isSafeInteger(ms)||ms<0||Math.floor(ms/1000)>253402299899)fail();return Math.floor(ms/1000);};
 const now=time(),table=kind==='account'?'jwt_v110_master_outbox':'jwt_v110_master_lifecycle_outbox',subject=kind==='account'?'parent_account_id':'subject_id';
 const rows=(await core.prepare(`SELECT o.event_id,o.attempts FROM ${table} o WHERE o.target_app=? AND o.delivered_at_s IS NULL AND o.next_attempt_at_s<=?
 AND NOT EXISTS(SELECT 1 FROM ${table} p WHERE p.target_app=o.target_app AND p.kind=o.kind AND p.${subject}=o.${subject} AND p.version<o.version AND p.delivered_at_s IS NULL)
 ORDER BY o.issued_at_s,o.event_id LIMIT ?`).bind(app,now,limit).all()).results;
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
 let delivered=0,retry=0;
 for(const row of rows){
  if(!Number.isSafeInteger(row.attempts)||row.attempts<0||row.attempts>=Number.MAX_SAFE_INTEGER)fail();
  try{
   const event=await(kind==='account'?prepareCapturedMasterEvent:prepareCapturedLifecycleEvent)(core,row.event_id,time());
   const body=JSON.stringify({ver:1,purpose:'uaa-event-delivery-v1',app,origin:origins[app],issuedAtS:time(),event});
   const signature=hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode('uaa-event-delivery-v1\n'+body))));
   const ack=await boundedSend(send,{app,origin:origins[app],body,signature},deliveryTimeoutMs);
   if(!ack||typeof ack.body!=='string'||enc.encode(ack.body).length>8192||typeof ack.signature!=='string'||!/^[a-f0-9]{64}$/.test(ack.signature)||!await crypto.subtle.verify('HMAC',key,Uint8Array.from(ack.signature.match(/../g),x=>parseInt(x,16)),enc.encode('uaa-event-ack-v1\n'+ack.body)))throw Error('ACK_SIGNATURE');
   parseCommittedMasterACK(JSON.parse(ack.body),event);
   const result=await core.prepare(`UPDATE ${table} SET delivered_at_s=? WHERE event_id=? AND payload_digest=? AND version=? AND delivered_at_s IS NULL`).bind(time(),event.eventId,event.payloadDigest,event.version).run();
   delivered+=Number(result.meta?.changes===1);
  }catch{
   const next=time()+Math.min(900,15*2**Math.min(row.attempts,6));
   const result=await core.prepare(`UPDATE ${table} SET attempts=attempts+1,next_attempt_at_s=? WHERE event_id=? AND delivered_at_s IS NULL AND attempts=?`).bind(next,row.event_id,row.attempts).run();
   retry+=Number(result.meta?.changes===1);
  }
 }
 return Object.freeze({selected:rows.length,delivered,retry});
}
