import {DatabaseSync} from 'node:sqlite';
import {cleanSchemas,adminMasters} from './schema.mjs';
import {digest,identifier} from './snapshot.mjs';
import {sqliteD1} from './sqlite-d1.mjs';
import {emptyCompatibilityDatabase} from '../../src/academy/separation/compatibility.js';
import {emptyShapes} from '../../src/academy/separation/empty-shapes.js';
import {setupSchema} from '../../src/academy/d1/setup-schema.js';
import {initialiseAcceptedSetup} from '../../src/academy/d1/setup-publication.js';
function insert(db,table,rows){for(const row of rows){const columns=Object.keys(row);db.prepare('INSERT INTO '+identifier(table)+'('+columns.map(identifier).join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(row));}}
function acceptedRows(selection,table){
 const spec=setupSchema[table],selected=selection.rows[table]||[];
 // Accepted rows are supplied separately from the source's editable masters.
 const source=selection.acceptedRows?.[table]||[];
 const signatures=new Map(selected.map(row=>[JSON.stringify(spec.keys.map(k=>String(row[k]??'').toUpperCase())),row]));
 return source.flatMap(row=>{
  const live=signatures.get(JSON.stringify(spec.keys.map(k=>String(row[k]??'').toUpperCase())));if(!live)return [];
  const merged={...row};for(const column of spec.live||[])merged[column]=live[column];if(Object.hasOwn(live,'active'))merged.active=live.active;
  // The additive fields were absent from the original accepted bootstrap.
  // Defaults are explicit, never an unpublished source-field fallback.
  if(table==='assessments')Object.assign(merged,{assessment_kind:row.assessment_kind||'EXAM',timing_mode:row.timing_mode||'TIMED',timezone:row.timezone||selection.timezone,available_from:row.available_from??null,due_at:row.due_at??null,exam_cutoff:row.exam_cutoff??null,allowance_minutes:row.allowance_minutes??15});
  return [merged];
 });
}
export function addAcceptedSource(selection,snapshot){
 const data=Object.fromEntries(snapshot.records.filter(r=>r.kind==='DATA').map(r=>[r.name,JSON.parse(r.data)])),head=data.setup_head_state?.[0]?.head_id;if(!head)throw Error('An accepted source head is required.');
 const rows={};for(const vector of data.setup_head_components.filter(v=>v.head_id===head)){const component=data.setup_components.find(c=>c.component_id===vector.component_id);if(!component)throw Error('Source head component missing');(rows[vector.table_name]??=[]).push(...JSON.parse(component.rows_json));}
 selection.acceptedRows=rows;selection.timezone=rows.academy_settings.find(r=>r.setting_key==='PlatformTimezone')?.setting_value;if(!selection.timezone)throw Error('Accepted app clock is missing.');
 // An active note/register may cite a historical immutable head. Preserve its
 // exact evidence and ancestry, without carrying unrelated candidate batches.
 const needed=new Set([...(selection.rows.attendance_days||[]).map(r=>r.setup_head),...(selection.rows.lesson_note_versions||[]).map(r=>r.source_head)].filter(Boolean));
 const original=[...needed];for(const id of needed){const h=data.setup_heads.find(h=>h.head_id===id);if(!h)throw Error('An active record cites a missing accepted head.');if(h.parent_head)needed.add(h.parent_head);}
 const heads=data.setup_heads.filter(h=>needed.has(h.head_id)),batches=new Set(heads.map(h=>h.batch_id)),vectors=data.setup_head_components.filter(v=>needed.has(v.head_id)),components=new Set(vectors.map(v=>v.component_id));
 selection.referenceHistory={setup_batches:data.setup_batches.filter(b=>batches.has(b.batch_id)),setup_components:data.setup_components.filter(c=>components.has(c.component_id)),setup_heads:heads,setup_head_components:vectors};
 if(selection.referenceHistory.setup_components.length!==components.size)throw Error('Historical accepted reference components are incomplete.');
 selection.manifest.acceptedHistory={directlyReferencedHeads:original.length,retainedHeadHeaders:heads.length,retainedComponents:components.size,policy:'Exact immutable evidence required by selected active work only; no unrelated candidates.'};
 selection.manifest.retryEvidence={retained:selection.rows.operation_receipts?.length||0,owner:'CORE',policy:'Original payload, actor and outcome; never duplicated in Admin.'};
 return selection;
}
export async function prepareTargets(selection){
 if(selection.manifest.foreignKeyBlockers.length)throw Error('Resolve source selection references before preparing targets.');
 const schemas=cleanSchemas(selection.sourceSchema),databases={core:new DatabaseSync(':memory:'),admin:new DatabaseSync(':memory:')};
 try{
  for(const [owner,db]of Object.entries(databases)){
   db.exec(schemas[owner].tableSQL);db.exec('PRAGMA foreign_keys=OFF');
   const identities=[...new Set([...(selection.rows.accounts||[]).map(r=>r.account_id),...selection.actorReferences])].map(account_id=>({account_id}));
   if(owner==='core')insert(db,'actor_refs',identities);else{insert(db,'identity_refs',identities);insert(db,'file_refs',(selection.rows.assessment_files||[]).map(r=>({file_id:r.file_id})));}
   for(const table of schemas[owner].tables){if(['actor_refs','identity_refs','file_refs'].includes(table)||table.startsWith('setup_'))continue;let rows=selection.rows[table]||[];
    if(owner==='admin'&&!adminMasters.has(table)&&table!=='academy_write_state')rows=[];
    if(owner==='core'&&setupSchema[table]){
     rows=acceptedRows(selection,table);
     if(table==='academy_settings')rows.push(...(selection.rows.academy_settings||[]).filter(r=>!rows.some(s=>s.setting_key===r.setting_key)));
    }
    // Existing retry outcomes remain Core evidence. New owner-local receipts
    // start only with the future verified writer switch; never clone outcomes.
    if(table==='operation_receipts')rows=owner==='core'?selection.rows.operation_receipts||[]:[];
    if(rows.length)insert(db,table,rows);
   }
   if(owner==='core')for(const [table,rows]of Object.entries(selection.referenceHistory||{}))insert(db,table,rows);
   db.exec(schemas[owner].afterSQL);db.exec('PRAGMA foreign_keys=ON');const fk=db.prepare('PRAGMA foreign_key_check').all();if(fk.length)throw Object.assign(Error('Target reference check failed: '+owner),{findings:fk.map(r=>({table:r.table,parent:r.parent}))});
  }
  const core=emptyCompatibilityDatabase(sqliteD1(databases.core),emptyShapes,{currentGrants:true}),initial=await initialiseAcceptedSetup(core,'SPLIT_BOOTSTRAP');
  const selectedDigest=digest(selection.manifest);databases.core.prepare("INSERT INTO split_deployment_state VALUES(1,'SPLIT_V1','PREPARING',?,?,?)").run(selection.manifest.sourceDigest,selectedDigest,selection.manifest.at);
  const report={generation:'SPLIT_V1',selectionDigest:selectedDigest,sourceDigest:selection.manifest.sourceDigest,head:initial.head,targets:{}};
  for(const [owner,db]of Object.entries(databases)){const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();const counts=Object.fromEntries(tables.map(t=>[t.name,db.prepare('SELECT count(*) n FROM '+identifier(t.name)).get().n]));report.targets[owner]={tables:tables.length,rows:Object.values(counts).reduce((a,b)=>a+b,0),counts,foreignKeyErrors:db.prepare('PRAGMA foreign_key_check').all().length,integrity:db.prepare('PRAGMA integrity_check').get().integrity_check};}
  return {databases,schemas,report,close(){for(const db of Object.values(databases))db.close();}};
 }catch(error){for(const db of Object.values(databases))db.close();throw error;}
}
