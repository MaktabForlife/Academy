// Owning Core transaction only: reconcile actual native session revocation.
// Parent cancellation is irreversible and independent of later account snapshots.
const stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const fail=()=>{throw Object.assign(Error('Native session capture unavailable'),{code:'MASTER_SESSION_CAPTURE_UNAVAILABLE',status:503});};
export function nativeMasterSessionCapture(repository,p,{permissionAccounts=[],accountSecurity,operationId,now}={}){
 if(repository.features?.transactionalOutbox!==true)return [];
 if(repository.features.nativeCookie!==true||typeof p!=='function'||!stable(operationId)||!Number.isSafeInteger(Date.parse(now))||!Array.isArray(permissionAccounts)||permissionAccounts.length>500||permissionAccounts.some(x=>!stable(x)))fail();
 if(accountSecurity&&!stable(accountSecurity.accountId))fail();
 const ids=[...new Set([...permissionAccounts,...(accountSecurity?[accountSecurity.accountId]:[])])];
 if(!ids.length)return [];
 const at=Math.floor(Date.parse(now)/1000);if(at<0||at>253401695999)fail();
 const json=JSON.stringify(ids);
 // Indexed account/expiry candidates only. Expired history is never recaptured.
 // Require the real Master issuer's immutable native sid/parent/family binding.
 const candidate=`jwt_v110_families f JOIN account_sessions n ON n.session_id=f.family_id AND n.account_id=f.account_id`;
 const where=`f.account_id IN(SELECT value FROM json_each(?)) AND f.original_expires_at_s>?
  AND f.parent_session_id=f.family_id AND n.revoked_at IS NOT NULL`;
 const args=[json,at],out=[
  p(`INSERT INTO jwt_v110_parent_tombstones(parent_session_id,expires_at_s)
   SELECT f.parent_session_id,f.original_expires_at_s FROM ${candidate} WHERE ${where}
   ON CONFLICT(parent_session_id) DO UPDATE SET expires_at_s=max(expires_at_s,excluded.expires_at_s)`,...args),
  p(`UPDATE jwt_v110_families SET revoked=1 WHERE revoked=0 AND family_id IN(SELECT f.family_id FROM ${candidate} WHERE ${where})`,...args)
 ];
 for(const app of ['studio','hifz']){
  out.push(
   p(`INSERT INTO jwt_v110_master_lifecycle_streams(target_app,kind,subject_id,version)
    SELECT ?,'parent-revoked',f.parent_session_id,0 FROM ${candidate} WHERE ${where} ON CONFLICT DO NOTHING`,app,...args),
   p(`INSERT INTO jwt_v110_master_lifecycle_outbox(event_id,target_app,kind,subject_id,parent_account_id,version,operation_id,issued_at_s,retain_until_s,facts_json)
    SELECT lower(hex(randomblob(16))),s.target_app,s.kind,s.subject_id,f.account_id,s.version+1,?,?,?,json_object('parentId',f.parent_session_id)
    FROM ${candidate} JOIN jwt_v110_master_lifecycle_streams s ON s.target_app=? AND s.kind='parent-revoked' AND s.subject_id=f.parent_session_id
    WHERE ${where} AND NOT EXISTS(SELECT 1 FROM jwt_v110_master_lifecycle_outbox o WHERE o.target_app=s.target_app AND o.kind=s.kind AND o.subject_id=s.subject_id)`,operationId,at,at+604800,app,...args),
   p(`UPDATE jwt_v110_master_lifecycle_streams SET version=(SELECT MAX(o.version) FROM jwt_v110_master_lifecycle_outbox o
    WHERE o.target_app=jwt_v110_master_lifecycle_streams.target_app AND o.kind=jwt_v110_master_lifecycle_streams.kind AND o.subject_id=jwt_v110_master_lifecycle_streams.subject_id)
    WHERE target_app=? AND kind='parent-revoked' AND subject_id IN(SELECT f.parent_session_id FROM ${candidate} WHERE ${where})`,app,...args)
  );
 }
 return out;
}
