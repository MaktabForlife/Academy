// Owning Core writer appends these statements AFTER its real native JWT
// effects and BEFORE its operation receipt/commit. No post-response enqueue.
// Business retry idempotence remains the native owner's operation receipt.
const stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const fail=()=>{throw Object.assign(Error('Master event capture unavailable'),{code:'MASTER_CAPTURE_UNAVAILABLE',status:503});};
export function nativeMasterAccountCapture(repository,p,{permissionAccounts=[],accountSecurity,operationId,now}={}){
 if(repository.features?.transactionalOutbox!==true)return [];
 if(repository.features.nativeCookie!==true||typeof p!=='function'||!stable(operationId)||!Number.isSafeInteger(Date.parse(now))||!Array.isArray(permissionAccounts)||permissionAccounts.length>500||permissionAccounts.some(x=>!stable(x)))fail();
 const at=Math.floor(Date.parse(now)/1000);if(at<0||at>253401695999)fail();
 const work=[...new Set(permissionAccounts)].map(accountId=>({kind:'authority-updated',accountId}));
 if(accountSecurity){if(!stable(accountSecurity.accountId)||!['PIN_RESET','SUSPICIOUS_ACTIVITY','CREDENTIAL_UPDATED'].includes(accountSecurity.eventType))fail();work.push({kind:'account-security',accountId:accountSecurity.accountId});}
 const deliveries=work.flatMap(({kind,accountId})=>['studio','hifz'].map(app=>({app,kind,accountId,eventId:crypto.randomUUID()})));
 if(!deliveries.length)return [];
 const json=JSON.stringify(deliveries),guard=crypto.randomUUID();
 // Fixed statement count: no per-account queries or batch growth. Source
 // facts are SELECTed after authority effects in the owning Core transaction.
 return [
  p(`INSERT INTO academy_write_guards(guard_id,accepted) SELECT ?,NOT EXISTS(
   SELECT 1 FROM json_each(?) w LEFT JOIN account_credentials c ON c.account_id=json_extract(w.value,'$.accountId')
   WHERE c.account_id IS NULL)`,guard,json),
  p(`INSERT INTO jwt_v110_master_streams(target_app,kind,parent_account_id,version)
   SELECT json_extract(w.value,'$.app'),json_extract(w.value,'$.kind'),a.account_id,0 FROM json_each(?) w JOIN accounts a ON a.account_id=json_extract(w.value,'$.accountId')
   WHERE 1 ON CONFLICT DO NOTHING`,json),
  p(`INSERT INTO jwt_v110_master_outbox(event_id,target_app,kind,parent_account_id,version,operation_id,issued_at_s,retain_until_s,facts_json)
   SELECT json_extract(w.value,'$.eventId'),s.target_app,s.kind,a.account_id,s.version+1,?,?,?,
    CASE WHEN s.kind='account-security' THEN json_object('credentialEpoch',c.credential_epoch,'securityVersion',s.version+1)
    ELSE json_object('permissionVersion',COALESCE(v.permission_version,0)) END
   FROM json_each(?) w JOIN accounts a ON a.account_id=json_extract(w.value,'$.accountId')
   JOIN account_credentials c USING(account_id) LEFT JOIN jwt_v110_accounts v USING(account_id)
   JOIN jwt_v110_master_streams s ON s.target_app=json_extract(w.value,'$.app') AND s.kind=json_extract(w.value,'$.kind') AND s.parent_account_id=a.account_id
   WHERE NOT EXISTS(SELECT 1 FROM jwt_v110_master_outbox o WHERE o.target_app=s.target_app AND o.kind=s.kind AND o.parent_account_id=s.parent_account_id AND o.operation_id=?)`,operationId,at,at+604800,json,operationId),
  p(`UPDATE jwt_v110_master_streams SET version=(SELECT MAX(o.version) FROM jwt_v110_master_outbox o WHERE o.target_app=jwt_v110_master_streams.target_app AND o.kind=jwt_v110_master_streams.kind AND o.parent_account_id=jwt_v110_master_streams.parent_account_id)
   WHERE EXISTS(SELECT 1 FROM json_each(?) w JOIN accounts a ON a.account_id=json_extract(w.value,'$.accountId')
    WHERE a.account_id=jwt_v110_master_streams.parent_account_id AND json_extract(w.value,'$.app')=jwt_v110_master_streams.target_app AND json_extract(w.value,'$.kind')=jwt_v110_master_streams.kind)`,json),
  p('DELETE FROM academy_write_guards WHERE guard_id=?',guard)
 ];
}
