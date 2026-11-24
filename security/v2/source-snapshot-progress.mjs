import {canonical,digest,requireThat,strictJSON,uuid} from './codec.mjs';
import {validateEvent} from './events.mjs';
import {requestBinding} from './snapshot.mjs';

export const sourceBuildSchemaSQL=`CREATE TABLE IF NOT EXISTS jwt_v2_snapshot_source_fences(
 snapshot_id TEXT PRIMARY KEY REFERENCES jwt_v2_reconcile_captures(snapshot_id),
 recipient_app TEXT NOT NULL CHECK(recipient_app IN('studio','hifz')),
 stream TEXT NOT NULL,owner_epoch TEXT NOT NULL,next_sequence INTEGER NOT NULL,
 split_version INTEGER NOT NULL,expires_at INTEGER NOT NULL,
 admitted INTEGER NOT NULL CHECK(admitted IN(0,1)),
 sizing_json TEXT NOT NULL CHECK(json_valid(sizing_json))
);
CREATE TABLE IF NOT EXISTS jwt_v2_snapshot_source_slots(
 recipient_app TEXT NOT NULL,stream TEXT NOT NULL,
 snapshot_id TEXT NOT NULL UNIQUE REFERENCES jwt_v2_snapshot_source_fences(snapshot_id),
 PRIMARY KEY(recipient_app,stream)
);
CREATE TABLE IF NOT EXISTS jwt_v2_snapshot_source_retirements(
 snapshot_id TEXT PRIMARY KEY REFERENCES jwt_v2_snapshot_source_fences(snapshot_id),
 retired_at INTEGER NOT NULL,reason TEXT NOT NULL CHECK(reason IN('EXPIRED','SUPERSEDED'))
);
CREATE TRIGGER IF NOT EXISTS jwt_v2_snapshot_source_fence_retained
BEFORE DELETE ON jwt_v2_snapshot_source_fences
BEGIN SELECT RAISE(ABORT,'snapshot_source_fence_retained'); END;
CREATE TRIGGER IF NOT EXISTS jwt_v2_snapshot_source_retirement_immutable
BEFORE UPDATE ON jwt_v2_snapshot_source_retirements
BEGIN SELECT RAISE(ABORT,'snapshot_source_retirement_immutable'); END;
CREATE TRIGGER IF NOT EXISTS jwt_v2_snapshot_source_retirement_retained
BEFORE DELETE ON jwt_v2_snapshot_source_retirements
BEGIN SELECT RAISE(ABORT,'snapshot_source_retirement_retained'); END;
CREATE TRIGGER IF NOT EXISTS jwt_v2_snapshot_source_slot_immutable
BEFORE UPDATE ON jwt_v2_snapshot_source_slots
BEGIN SELECT RAISE(ABORT,'snapshot_source_slot_immutable'); END;
CREATE TRIGGER IF NOT EXISTS jwt_v2_snapshot_source_slot_live
BEFORE DELETE ON jwt_v2_snapshot_source_slots WHEN NOT EXISTS(
 SELECT 1 FROM jwt_v2_snapshot_source_retirements WHERE snapshot_id=OLD.snapshot_id)
BEGIN SELECT RAISE(ABORT,'snapshot_source_slot_live'); END;
CREATE TRIGGER IF NOT EXISTS jwt_v2_snapshot_source_fence_immutable
BEFORE UPDATE ON jwt_v2_snapshot_source_fences
BEGIN SELECT RAISE(ABORT,'snapshot_source_fence_immutable'); END;
CREATE TRIGGER IF NOT EXISTS jwt_v2_snapshot_source_record_retained
BEFORE DELETE ON jwt_v2_reconcile_records WHEN EXISTS(
 SELECT 1 FROM jwt_v2_snapshot_source_fences f WHERE f.snapshot_id=OLD.snapshot_id AND NOT EXISTS(
  SELECT 1 FROM jwt_v2_snapshot_source_retirements t WHERE t.snapshot_id=f.snapshot_id))
BEGIN SELECT RAISE(ABORT,'snapshot_source_record_retained'); END;
CREATE TRIGGER IF NOT EXISTS jwt_v2_snapshot_source_part_retained
BEFORE DELETE ON jwt_v2_reconcile_parts WHEN EXISTS(
 SELECT 1 FROM jwt_v2_snapshot_source_fences f WHERE f.snapshot_id=OLD.snapshot_id AND NOT EXISTS(
  SELECT 1 FROM jwt_v2_snapshot_source_retirements t WHERE t.snapshot_id=f.snapshot_id))
BEGIN SELECT RAISE(ABORT,'snapshot_source_part_retained'); END;
CREATE TRIGGER IF NOT EXISTS jwt_v2_snapshot_source_page_retained
BEFORE DELETE ON jwt_v2_reconcile_pages WHEN EXISTS(
 SELECT 1 FROM jwt_v2_snapshot_source_fences f WHERE f.snapshot_id=OLD.snapshot_id AND NOT EXISTS(
  SELECT 1 FROM jwt_v2_snapshot_source_retirements t WHERE t.snapshot_id=f.snapshot_id))
BEGIN SELECT RAISE(ABORT,'snapshot_source_page_retained'); END;`;
const scope='sourceHistory';
const sourceFence=`SELECT f.admitted FROM jwt_v2_snapshot_source_fences f
 JOIN jwt_v2_sender_streams s ON s.target_app=f.recipient_app AND s.stream=f.stream
 JOIN split_read_state r ON r.singleton=1
 WHERE f.snapshot_id=? AND r.version=f.split_version AND s.owner_epoch=f.owner_epoch
 AND s.next_sequence=f.next_sequence AND f.expires_at>unixepoch()
 AND NOT EXISTS(SELECT 1 FROM jwt_v2_snapshot_source_retirements t WHERE t.snapshot_id=f.snapshot_id)
 AND (f.admitted=0 OR EXISTS(SELECT 1 FROM jwt_v2_snapshot_source_slots z WHERE z.snapshot_id=f.snapshot_id
  AND z.recipient_app=f.recipient_app AND z.stream=f.stream))
 AND NOT EXISTS(SELECT 1 FROM split_write_fence)
 AND NOT EXISTS(SELECT 1 FROM jwt_v2_native_outbox n WHERE n.target_app=f.recipient_app AND n.event_json IS NULL)`;

export function captureSourceHistory(store,{base,version,plan}){
 const {admitted,sizing,historySQL,historyArgs}=plan;
 return [
  store.stmt('INSERT INTO jwt_v2_snapshot_source_fences VALUES(?,?,?,?,?,?,?,?,?)',
   base.snapshotId,base.recipientApp,base.stream,base.ownerEpoch,base.coveredThrough+1,version,base.expiresAt,
   Number(admitted),canonical(sizing)),
  ...(admitted?[store.stmt('INSERT INTO jwt_v2_snapshot_source_slots VALUES(?,?,?)',base.recipientApp,base.stream,base.snapshotId),
   store.stmt("INSERT INTO jwt_v2_reconcile_records(snapshot_id,bucket,raw_json) SELECT ?,?,event_json FROM ("+historySQL+")",
   base.snapshotId,scope,...historyArgs)]:[])
 ];
}

export async function sourceBuildStage({store,base,validate,status}){
 const {snapshotId}=base;
 const fence=await store.first(sourceFence,snapshotId);
 if(!fence){
  const retired=await store.first('SELECT 1 FROM jwt_v2_snapshot_source_retirements WHERE snapshot_id=?',snapshotId);
  requireThat(!retired,'SNAPSHOT_BUILD_RETIRED',409);
  requireThat(false,'SNAPSHOT_SOURCE_FENCE_CHANGED',503);
 }
 const commit=async statements=>{
  const [guard,clear]=store.guard(sourceFence,[snapshotId]);
  return store.batch([guard,...statements,clear]);
 };
 if(status==='READY')return {commit,pending:null};
 if(!fence.admitted)return {commit,pending:{pending:'BLOCKED',cursor:0}};
 const rows=await store.all(`SELECT ordinal,raw_json FROM jwt_v2_reconcile_records
  WHERE snapshot_id=? AND bucket=? AND canonical_json IS NULL ORDER BY ordinal LIMIT 20`,snapshotId,scope);
 if(!rows.length)return {commit,pending:null};
 const statements=[];
 const accepted=await Promise.all(rows.map(row=>validateEvent(strictJSON(row.raw_json),validate)));
 for(let i=0;i<rows.length;i++){
  const {ordinal}=rows[i],event=accepted[i];
  if(event.target.type==='dependency'){
   const rule=validate.dependencies.get(event.target.id);
   requireThat(rule.scope==='GLOBAL'?event.sub===null:typeof event.sub==='string','SOURCE_DEPENDENCY_SCOPE_CONFLICT',503);
  }
  statements.push(store.stmt(`UPDATE jwt_v2_reconcile_records SET canonical_json=?,semantic_key=?
   WHERE snapshot_id=? AND ordinal=? AND bucket=? AND canonical_json IS NULL`,
   canonical(event),canonical([event.ownerEpoch,event.sequence]),snapshotId,ordinal,scope));
 }
 await commit(statements);
 return {commit,pending:{pending:'HISTORY',cursor:rows.at(-1).ordinal}};
}

const retirementScope=`FROM jwt_v2_reconcile_captures c
 JOIN jwt_v2_snapshot_source_fences f ON f.snapshot_id=c.snapshot_id
 JOIN split_read_state r ON r.singleton=1
 JOIN jwt_v2_sender_streams s ON s.target_app=f.recipient_app AND s.stream=f.stream
 WHERE c.request_id=? AND
 json_extract(c.request_binding,'$.buildProtocol')='stepped-v1'`;
const retiredScope=`SELECT f.snapshot_id,t.retired_at,t.reason
 FROM jwt_v2_reconcile_captures c JOIN jwt_v2_snapshot_source_fences f USING(snapshot_id)
 JOIN jwt_v2_snapshot_source_retirements t USING(snapshot_id) WHERE c.request_id=?`;

export async function retireSourceSnapshot(runtime,requestId){
 requireThat(runtime.app==='academy'&&uuid(requestId),'INVALID_SNAPSHOT_RETIREMENT',400);
 const store=runtime.store;
 const retired=async()=>{
  const row=await store.first(retiredScope,requestId);
  return row?{snapshotId:row.snapshot_id,retiredAt:row.retired_at,reason:row.reason}:null;
 };
 const existing=await retired();
 if(existing)return existing;
 const canRetire=`(f.expires_at<=unixepoch() OR r.version>f.split_version
  OR s.owner_epoch=f.owner_epoch AND s.next_sequence>f.next_sequence)`;
 const planned=await store.first(`SELECT f.snapshot_id ${retirementScope} AND ${canRetire}`,requestId);
 requireThat(planned,'SNAPSHOT_BUILD_STILL_LIVE',409);
 const {snapshot_id:snapshotId}=planned;
 const [guard,clear]=store.guard(`SELECT 1 ${retirementScope} AND f.snapshot_id=? AND ${canRetire}`,[requestId,snapshotId]);
 await store.batch([guard,
  store.stmt(`INSERT INTO jwt_v2_snapshot_source_retirements
   SELECT f.snapshot_id,unixepoch(),CASE WHEN f.expires_at<=unixepoch() THEN 'EXPIRED' ELSE 'SUPERSEDED' END
   ${retirementScope} AND f.snapshot_id=? ON CONFLICT(snapshot_id) DO NOTHING`,requestId,snapshotId),
  store.stmt('DELETE FROM jwt_v2_reconcile_pages WHERE snapshot_id=?',snapshotId),
  store.stmt('DELETE FROM jwt_v2_reconcile_parts WHERE snapshot_id=?',snapshotId),
  store.stmt('DELETE FROM jwt_v2_reconcile_records WHERE snapshot_id=?',snapshotId),
  store.stmt('DELETE FROM jwt_v2_snapshot_source_slots WHERE snapshot_id=?',snapshotId),
  clear]);
 return retired();
}

export async function buildPending(base,request,result){
 return {mode:'BUILD_PENDING',base,requestDigest:await digest(JSON.parse(requestBinding(request))),
  phase:result.pending,cursor:result.cursor??0,code:result.pending==='BLOCKED'?'SNAPSHOT_BUILD_ENVELOPE_EXCEEDED':null};
}
