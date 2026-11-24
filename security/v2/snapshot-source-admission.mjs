import {canonical,requireThat,safeInt,strictJSON} from './codec.mjs';
import {sharedAccountSelector} from './shared-account-baselines.mjs';
import {snapshotBuildLimits} from './snapshot.mjs';

export const sourceAdmissionLimits=Object.freeze({
 accounts:512,historyBytes:524288,historyRecordBytes:16384,recordBytes:2800,recordOverhead:128
});
const bytesOf=column=>'length(CAST('+column+' AS BLOB))';
const sizeOf=(sql,column)=>`SELECT json_array(count(*),coalesce(sum(${bytesOf(column)}),0),
 coalesce(max(${bytesOf(column)}),0)) size FROM (${sql})`;
const asSize=row=>strictJSON(row.size);
const accountProbe=`SELECT count(*) n FROM (SELECT account_id FROM accounts LIMIT ${sourceAdmissionLimits.accounts+1})`;

export async function planSnapshotAdmission(store,{base,epochs,factBuckets}){
 const historyExpected=epochs.reduce((total,epoch)=>total+epoch.through,0);
 const sizing={epochs:epochs.length,historyExpected};
 const blocked=reason=>({admitted:false,selectors:[],sizing:{...sizing,reason}});
 if(epochs.length>snapshotBuildLimits.epochs)return blocked('EPOCHS');
 if(!safeInt(historyExpected)||historyExpected>snapshotBuildLimits.history)return blocked('HISTORY_ROWS');

 // The small frozen epoch list drives indexed range seeks on the immutable
 // sender ledger. An unbounded UNION with the delivery outbox is unnecessary.
 const historySQL=`SELECT f.event_id,f.target_app,f.stream,f.owner_epoch,f.sequence,f.digest,f.event_json
  FROM json_each(?) ranges CROSS JOIN jwt_v2_sender_facts f
  WHERE f.target_app=? AND f.stream=? AND f.owner_epoch=json_extract(ranges.value,'$.epoch')
  AND f.sequence BETWEEN 1 AND json_extract(ranges.value,'$.through')
  LIMIT ${snapshotBuildLimits.history+1}`;
 const historyArgs=[canonical(epochs),base.recipientApp,base.stream];
 const historyProbe=sizeOf(historySQL,'event_json');
 const history=asSize(await store.first(historyProbe,...historyArgs));
 requireThat(history[0]===historyExpected,'SOURCE_OPERATIONAL_HISTORY_UNAVAILABLE',503);
 sizing.history=history;
 if(history[1]>sourceAdmissionLimits.historyBytes||history[2]>sourceAdmissionLimits.historyRecordBytes)return blocked('HISTORY_BYTES');
 const conflict=`SELECT 1 FROM (${historySQL}) f LEFT JOIN jwt_v2_outbox o ON o.event_id=f.event_id
  WHERE f.event_id IS NOT json_extract(f.event_json,'$.eventId')
  OR f.target_app IS NOT json_extract(f.event_json,'$.targetApp')
  OR f.stream IS NOT json_extract(f.event_json,'$.stream')
  OR f.owner_epoch IS NOT json_extract(f.event_json,'$.ownerEpoch')
  OR f.sequence IS NOT json_extract(f.event_json,'$.sequence')
  OR f.digest IS NOT json_extract(f.event_json,'$.digest')
  OR o.event_id IS NOT NULL AND (o.event_json<>f.event_json OR o.digest<>f.digest OR o.target_app<>f.target_app)`;
 requireThat(!await store.first(conflict,...historyArgs),'SOURCE_OPERATIONAL_COVERAGE_CONFLICT',503);

 if(base.stream==='account-security'){
  sizing.accounts=(await store.first(accountProbe)).n;
  if(sizing.accounts>sourceAdmissionLimits.accounts)return blocked('ACCOUNT_CANDIDATES');
 }
 const selectors=Object.entries(factBuckets).map(([type,bucket])=>({
  bucket,sql:`SELECT DISTINCT ${type==='dependency'
   ?"json_set(json_extract(event_json,'$.target'),'$.sub',json_extract(event_json,'$.sub'))"
   :"json_extract(event_json,'$.target')"} record_json
   FROM (${historySQL}) WHERE json_extract(event_json,'$.target.type')=?
   LIMIT ${snapshotBuildLimits.records+1}`,args:[...historyArgs,type]
 }));
 if(base.stream==='account-security'){
  const baseline=sharedAccountSelector(base.recipientApp);
  selectors.push({...baseline,sql:`SELECT record_json FROM (${baseline.sql}) LIMIT ${snapshotBuildLimits.records+1}`});
 }
 const probes=selectors.map(selector=>({sql:sizeOf(selector.sql,'record_json'),args:selector.args}));
 const results=await store.readBatch(probes.map(probe=>[probe.sql,...probe.args]));
 const sizes=results.map(rows=>asSize(rows[0]));
 sizing.buckets=Object.fromEntries(selectors.map((selector,index)=>[selector.bucket,sizes[index]]));
 const recordCount=sizes.reduce((n,size)=>n+size[0],0);
 if(recordCount>snapshotBuildLimits.records)return blocked('RECORD_ROWS');
 const recordBytes=sizes.reduce((n,size)=>n+size[1]+size[0]*sourceAdmissionLimits.recordOverhead,0);
 const pageCapacity=Math.floor((61440-2)/20)-sourceAdmissionLimits.recordOverhead;
 requireThat(sourceAdmissionLimits.recordBytes<=pageCapacity,'INVALID_SOURCE_ADMISSION_PROFILE',503);
 if(recordBytes>snapshotBuildLimits.bytes||sizes.some(size=>size[2]>sourceAdmissionLimits.recordBytes))
  return blocked('RECORD_BYTES');
 const digestReads=sizes.reduce((n,size)=>n+(size[0]?Math.floor(size[0]/20)+1:0),0);
 if(digestReads>snapshotBuildLimits.digestReads)return blocked('DIGEST_READS');
 sizing.records=recordCount;
 sizing.recordBytes=recordBytes;
 sizing.digestReads=digestReads;
 const checks=[
  ['('+historyProbe+')=?',[...historyArgs,canonical(history)]],
  ['NOT EXISTS('+conflict+')',historyArgs],
  ...(base.stream==='account-security'?[['('+accountProbe+')=?',[sizing.accounts]]]:[]),
  ...probes.map((probe,index)=>['('+probe.sql+')=?',[...probe.args,canonical(sizes[index])]])
 ];
 return {admitted:true,selectors,sizing,historySQL,historyArgs,checks};
}
