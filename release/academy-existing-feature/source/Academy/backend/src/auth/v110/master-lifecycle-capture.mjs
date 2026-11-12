// Append only INSIDE the actual direct Core logout/switch transaction, after
// its native tombstone/head/family/audit effects. No caller SQL or post-response
// enqueue. The surrounding native handler owns PIN/refresh/CSRF authorization.
const stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const fail=()=>{throw Object.assign(Error('Lifecycle capture unavailable'),{code:'MASTER_LIFECYCLE_UNAVAILABLE',status:503});};
export function nativeMasterLifecycleCapture(db,{enabled=false,kind,familyId,accountId,browserId,generation,operationId,now}={}){
 if(enabled!==true)return [];
 if(typeof db?.prepare!=='function'||!['parent-revoked','browser-superseded'].includes(kind)||![familyId,accountId,operationId].every(stable)||!Number.isSafeInteger(now)||now<0||now>253401695999)fail();
 const logout=kind==='parent-revoked';
 if(!logout&&(!stable(browserId)||!Number.isSafeInteger(generation)||generation<2))fail();
 const where=logout?`f.family_id=? AND f.account_id=? AND f.revoked=1
 AND EXISTS(SELECT 1 FROM jwt_v110_parent_tombstones t WHERE t.parent_session_id=f.parent_session_id AND t.expires_at_s>=f.original_expires_at_s)
 AND EXISTS(SELECT 1 FROM jwt_v110_security_audit a WHERE a.operation_id=? AND a.family_id=f.family_id AND a.event_type='NATIVE_LOGOUT')`:
 `f.family_id=? AND f.account_id=? AND f.revoked=1 AND f.browser_id=? AND f.browser_generation<?
 AND EXISTS(SELECT 1 FROM jwt_v110_browser_heads b WHERE b.browser_id=f.browser_id AND b.generation=? AND b.last_operation_id=?)
 AND EXISTS(SELECT 1 FROM jwt_v110_security_audit a JOIN jwt_v110_families n ON n.family_id=a.family_id
  WHERE a.operation_id=? AND a.event_type='sign-in' AND n.browser_id=f.browser_id AND n.browser_generation=? AND n.revoked=0)`;
 const args=logout?[familyId,accountId,operationId]:[familyId,accountId,browserId,generation,generation,operationId,operationId,generation];
 const subject=logout?'f.parent_session_id':'f.browser_id';
 const facts=logout?"json_object('parentId',f.parent_session_id)":"json_object('browserId',f.browser_id,'beforeGeneration',b.generation)";
 const candidate=logout?'jwt_v110_families f':'jwt_v110_families f JOIN jwt_v110_browser_heads b USING(browser_id)';
 const guard=crypto.randomUUID(),out=[
  db.prepare('INSERT INTO academy_write_guards(guard_id,accepted) SELECT ?,EXISTS(SELECT 1 FROM '+candidate+' WHERE '+where+')').bind(guard,...args)
 ];
 for(const app of ['studio','hifz']){
  out.push(
   db.prepare('INSERT INTO jwt_v110_master_lifecycle_streams(target_app,kind,subject_id,version) SELECT ?,?,'+subject+',0 FROM '+candidate+' WHERE '+where+' ON CONFLICT DO NOTHING').bind(app,kind,...args),
   db.prepare(`INSERT INTO jwt_v110_master_lifecycle_outbox(event_id,target_app,kind,subject_id,parent_account_id,version,operation_id,issued_at_s,retain_until_s,facts_json)
    SELECT ?,s.target_app,s.kind,s.subject_id,f.account_id,s.version+1,?,?,?,${facts}
    FROM ${candidate} JOIN jwt_v110_master_lifecycle_streams s ON s.target_app=? AND s.kind=? AND s.subject_id=${subject}
    WHERE ${where} AND NOT EXISTS(SELECT 1 FROM jwt_v110_master_lifecycle_outbox o WHERE o.target_app=s.target_app AND o.kind=s.kind AND o.subject_id=s.subject_id AND o.operation_id=?)`)
    .bind(crypto.randomUUID(),operationId,now,now+604800,app,kind,...args,operationId),
   db.prepare(`UPDATE jwt_v110_master_lifecycle_streams SET version=(SELECT MAX(o.version) FROM jwt_v110_master_lifecycle_outbox o WHERE o.target_app=jwt_v110_master_lifecycle_streams.target_app AND o.kind=jwt_v110_master_lifecycle_streams.kind AND o.subject_id=jwt_v110_master_lifecycle_streams.subject_id)
    WHERE target_app=? AND kind=? AND subject_id=(SELECT ${subject} FROM ${candidate} WHERE ${where})`).bind(app,kind,...args)
  );
 }
 out.push(db.prepare('DELETE FROM academy_write_guards WHERE guard_id=?').bind(guard));return out;
}
