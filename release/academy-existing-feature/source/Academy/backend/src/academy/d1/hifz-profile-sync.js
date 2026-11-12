import {isSharedPinHash} from '../../lib/shared-pin-credential.js';
// The durable queue is written by D1 triggers in the Academy transaction.
// Network delivery runs after the save or on the existing recovery schedule.
export const hifzSyncEnabled=env=>Boolean(env.HIFZ_PROFILE_SYNC_URL&&env.HIFZ_PROFILE_SYNC_TARGET&&typeof env.HIFZ_PROFILE_SYNC_SECRET==='string'&&env.HIFZ_PROFILE_SYNC_SECRET.length>=32);
export const hifzSyncChangePath=path=>['/api/account/login','/api/account/setup-pin'].includes(path)||/^\/api\/admin\/platform\/(user-profiles\/save|programs\/(save|create|copy)|courses\/(participants-save|participant-create))$/.test(path);
export async function deliverHifzProfiles(env,{limit=8,fetcher=fetch,now=Date.now()}={}){
  if(!hifzSyncEnabled(env))return {enabled:false,delivered:0};
  const url=new URL(env.HIFZ_PROFILE_SYNC_URL);
  if(url.protocol!=='https:'||url.pathname!=='/internal/academy/profile-sync'||url.username||url.password||url.search||url.hash)throw new Error('Invalid Hifz delivery target');
  const db=env.ACADEMY_DB,p=(sql,...args)=>db.prepare(sql).bind(...args);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.HIFZ_PROFILE_SYNC_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  let delivered=0,attempted=0;
  for(let offset=0;offset<Math.min(limit,40);offset+=8){
    const {results:rows}=await p(`SELECT q.account_id,q.revision,q.pin_reset_version,q.attempts,p.display_name,p.login_link_id,p.whatsapp_number,p.role,p.active,c.pin_hash,c.pin_setup,c.credential_epoch
      FROM hifz_profile_sync q JOIN hifz_profile_sync_projection p USING(account_id) JOIN account_credentials c USING(account_id)
      WHERE q.revision>q.delivered_revision AND q.next_attempt_at<=? ORDER BY q.updated_at,q.account_id LIMIT ?`,now,Math.min(8,limit-offset)).all();
    if(!rows.length)break;
    const profiles=rows.map(hifzProfileSnapshot);
    const body=JSON.stringify({target:env.HIFZ_PROFILE_SYNC_TARGET,issuedAt:Date.now(),profiles});
    const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)))].map(b=>b.toString(16).padStart(2,'0')).join('');
    let errorCode=null;attempted+=rows.length;
    try{
      const response=await fetcher(url.href,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json','X-Academy-Sync-Signature':signature},body});
      if(response.status!==200)errorCode='HTTP_'+response.status;
      await response.body?.cancel();
    }catch{errorCode='DELIVERY_UNAVAILABLE';}
    const receipts=JSON.stringify(rows.map(r=>({id:r.account_id,revision:r.revision,retryAt:now+Math.min(900000,15000*2**Math.min(r.attempts,6))})));
    if(errorCode){
      await p(`UPDATE hifz_profile_sync SET attempts=attempts+1,last_error_code=?,next_attempt_at=(SELECT json_extract(value,'$.retryAt') FROM json_each(?) WHERE json_extract(value,'$.id')=hifz_profile_sync.account_id)
        WHERE account_id IN(SELECT json_extract(value,'$.id') FROM json_each(?)) AND revision=(SELECT json_extract(value,'$.revision') FROM json_each(?) WHERE json_extract(value,'$.id')=hifz_profile_sync.account_id)`,errorCode,receipts,receipts,receipts).run();
    }else{
      await p(`UPDATE hifz_profile_sync SET delivered_revision=MAX(delivered_revision,(SELECT json_extract(value,'$.revision') FROM json_each(?) WHERE json_extract(value,'$.id')=hifz_profile_sync.account_id)),attempts=0,next_attempt_at=0,last_error_code=NULL
        WHERE account_id IN(SELECT json_extract(value,'$.id') FROM json_each(?))`,receipts,receipts).run();
      delivered+=rows.length;
    }
  }
  return {enabled:true,attempted,delivered};
}
export async function recoverHifzProfiles(env,options){
  try{return await deliverHifzProfiles(env,options);}
  catch{console.error('hifz_profile_sync_unavailable');return {enabled:hifzSyncEnabled(env),delivered:0,error:'QUEUE_UNAVAILABLE'};}
}

// A legacy Academy hash is not copied: its old pepper remains private. The
// next successful Academy sign-in upgrades it and delivers the shared record.
export function hifzProfileSnapshot(r){
 return {academyUserId:r.account_id,revision:r.revision,pinResetVersion:r.pin_reset_version,name:r.display_name,loginId:r.login_link_id,whatsappNumber:r.whatsapp_number,role:r.role,active:r.active,
  ...(Number.isSafeInteger(r.credential_epoch)?{credentialEpoch:r.credential_epoch}:{}),
  ...(isSharedPinHash(r.pin_hash)?{pinHash:r.pin_hash}:{})};
}
