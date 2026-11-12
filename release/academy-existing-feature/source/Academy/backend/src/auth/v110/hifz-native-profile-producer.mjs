// Actual Root native queue/projection -> signed actual native Hifz handler
// plus V110 metadata. Route-free, bounded injected transport, no global fetch.
import {assertLocalIntegrationProfile} from './local-integration-profile.mjs';
import {hifzProfileSnapshot} from '../../academy/d1/hifz-profile-sync.js';
const origin='https://mahadarwa-hifz.ummabbadacademy.app',encoder=new TextEncoder();
const fail=(code='HIFZ_NATIVE_PROFILE_DELIVERY_UNAVAILABLE',status=503)=>{throw Object.assign(Error(code),{code,status});};
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const sha=async body=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(body)))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function key(secret,usage){if(typeof secret!=='string'||secret.length<32||secret.length>4096)fail('HIFZ_NATIVE_PROFILE_CONFIG');return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,[usage]);}
async function sign(secret,body){return [...new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret,'sign'),encoder.encode(body)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function sendBounded(send,packet){
 const controller=new AbortController();let timer,settled=false;
 try{return await new Promise((resolve,reject)=>{
  timer=setTimeout(()=>{if(!settled){settled=true;reject(Error('NATIVE_PROFILE_ACK_UNCONFIRMED'));controller.abort();}},5000);
  Promise.resolve().then(()=>send({...packet,signal:controller.signal,deadlineMs:5000})).then(ack=>{if(!settled){settled=true;resolve(ack);}},()=>{if(!settled){settled=true;reject(Error('NATIVE_PROFILE_ACK_UNCONFIRMED'));}});
 });}finally{clearTimeout(timer);}
}
const projection='FROM hifz_profile_sync q JOIN hifz_profile_sync_projection p USING(account_id) JOIN account_credentials c USING(account_id) JOIN jwt_v110_accounts v USING(account_id)';
const fields='q.account_id,q.revision,q.pin_reset_version,q.attempts,p.display_name,p.login_link_id,p.whatsapp_number,p.role,p.active,c.pin_hash,c.pin_setup,c.credential_epoch,v.permission_version';
const sameNative=(row)=>({sql:'EXISTS(SELECT 1 '+projection+' WHERE q.account_id=? AND q.revision=? AND q.pin_reset_version=? AND c.credential_epoch=? AND c.pin_hash IS ? AND c.pin_setup=? AND v.permission_version=? AND v.credential_epoch=c.credential_epoch AND p.display_name IS ? AND p.login_link_id IS ? AND p.whatsapp_number IS ? AND p.role=? AND p.active=?)',args:[row.account_id,row.revision,row.pin_reset_version,row.credential_epoch,row.pin_hash,row.pin_setup,row.permission_version,row.display_name,row.login_link_id,row.whatsapp_number,row.role,row.active]});
async function verifyACK(ack,secret,expected){
 if(typeof ack?.body!=='string'||encoder.encode(ack.body).length>4096||!hex(ack.signature)||!await crypto.subtle.verify('HMAC',await key(secret,'verify'),Uint8Array.from(ack.signature.match(/../g),x=>parseInt(x,16)),encoder.encode('uaa-hifz-native-profile-ack-v1\n'+ack.body)))fail();
 let value;try{value=JSON.parse(ack.body);}catch{fail();}
 const keys=['ver','purpose','app','origin','rootRunId','childRunId','operationId','parentAccountId','sourceRevision','sourceCredentialEpoch','parentPermissionVersion','requestDigest','committed'];
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))||value.ver!==1||value.purpose!=='uaa-hifz-native-profile-ack-v1'||value.app!=='hifz'||value.origin!==origin||value.committed!==true||Object.keys(expected).some(k=>value[k]!==expected[k]))fail();
}
export async function deliverNativeV110HifzProfiles({env,send,clock=Date.now,limit=8}){
 assertLocalIntegrationProfile(env);
 const rootRunId=env.JWT_LOCAL_NATIVE_RUN_ID,childRunId=env.JWT_LOCAL_CHILD_RUN_ID_HIFZ,secret=env.HIFZ_PROFILE_SYNC_SECRET;
 if(env.JWT_LOCAL_NATIVE_PROFILE_SYNC!=='HIFZ_V1'||env.JWT_V110_MASTER!=='1'||env.JWT_V110_NATIVE_COOKIE!=='1'||!hex(rootRunId)||!hex(childRunId)||env.ACADEMY_D1_RUN_ID!==rootRunId||env.JWT_LOCAL_APP_BINDING!=='academy:'+rootRunId||env.HIFZ_PROFILE_SYNC_TARGET!=='development'||env.HIFZ_PROFILE_SYNC_URL!==origin+'/internal/academy/profile-sync'||typeof env.ACADEMY_DB?.withSession!=='function'||typeof send!=='function'||typeof clock!=='function'||!Number.isInteger(limit)||limit<1||limit>8)fail('HIFZ_NATIVE_PROFILE_CONFIG');
 await key(secret,'sign');
 const now=clock();if(!Number.isSafeInteger(now)||now<0)fail('HIFZ_NATIVE_PROFILE_CONFIG');
 const db=env.ACADEMY_DB.withSession('first-primary');
 const rows=(await db.prepare('SELECT '+fields+' '+projection+' LEFT JOIN jwt_v110_hifz_profile_delivery d ON d.account_id=q.account_id WHERE c.credential_epoch=v.credential_epoch AND q.next_attempt_at<=? AND (d.account_id IS NULL OR q.revision>d.source_revision OR c.credential_epoch>d.source_credential_epoch OR v.permission_version>d.parent_permission_version) ORDER BY q.updated_at,q.account_id LIMIT ?').bind(now,limit).all()).results;
 let delivered=0,retry=0;
 for(const row of rows){
  try{
   const at=clock();if(!Number.isSafeInteger(at)||at<now||at-now>30000)fail();
   const profile=hifzProfileSnapshot(row),operationId='hifz-native-profile:'+await sha(JSON.stringify([row.account_id,row.revision,row.credential_epoch,row.permission_version]));
   const meta={ver:1,purpose:'uaa-hifz-native-profile-v1',app:'hifz',origin,operationId,rootRunId,childRunId,parentAccountId:row.account_id,sourceCredentialEpoch:row.credential_epoch,parentPermissionVersion:row.permission_version,sourceRevision:row.revision};
   const body=JSON.stringify({target:'development',issuedAt:at,profiles:[profile],v110:meta}),signature=await sign(secret,body),requestDigest=await sha(body);
   const ack=await sendBounded(send,{app:'hifz',url:origin+'/internal/academy/profile-sync',body,signature});
   await verifyACK(ack,secret,{rootRunId,childRunId,operationId,parentAccountId:row.account_id,sourceRevision:row.revision,sourceCredentialEpoch:row.credential_epoch,parentPermissionVersion:row.permission_version,requestDigest});
   const confirmed=clock();if(!Number.isSafeInteger(confirmed)||confirmed<at||confirmed-at>5000)fail();
   const current=sameNative(row),guard=crypto.randomUUID();
   const result=await db.batch([
    db.prepare('INSERT INTO academy_write_guards(guard_id,accepted) SELECT ?,('+current.sql+')').bind(guard,...current.args),
    db.prepare('INSERT INTO jwt_v110_hifz_profile_delivery VALUES(?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET source_revision=excluded.source_revision,source_credential_epoch=excluded.source_credential_epoch,parent_permission_version=excluded.parent_permission_version,request_digest=excluded.request_digest,confirmed_at_s=excluded.confirmed_at_s RETURNING account_id').bind(row.account_id,row.revision,row.credential_epoch,row.permission_version,requestDigest,Math.floor(confirmed/1000)),
    db.prepare('UPDATE hifz_profile_sync SET delivered_revision=MAX(delivered_revision,?),attempts=0,next_attempt_at=0,last_error_code=NULL WHERE account_id=? AND revision=?').bind(row.revision,row.account_id,row.revision),
    db.prepare('DELETE FROM academy_write_guards WHERE guard_id=?').bind(guard)
   ]);
   if(result?.[1]?.results?.length!==1||result[1].results[0].account_id!==row.account_id)fail();
   delivered++;
  }catch{
   retry++;
   const after=clock(),next=Number.isSafeInteger(after)&&after>=now?after:now;
   await db.prepare("UPDATE hifz_profile_sync SET attempts=attempts+1,next_attempt_at=?,last_error_code='V110_PROFILE_UNCONFIRMED' WHERE account_id=? AND revision=?").bind(next+Math.min(900000,15000*2**Math.min(row.attempts,6)),row.account_id,row.revision).run();
  }
 }
 return Object.freeze({selected:rows.length,delivered,retry});
}
