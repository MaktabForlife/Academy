import {validateAcceptedSessionPdfs} from './session-pdf-policy.js';
import {jsonRowSQL} from './json-row.js';
import {setupSchema,setupForeignKeys} from './setup-schema.js';
import {definitionSettingsSQL} from './setup-reader.js';
import {payloadHash,stableJSON} from '../../programs/timetable-model.js';
import {rehearsalError as fail} from './repository.js';
import {actualState,isAdminWorkspace,administers} from './workspace-access.js';
import {markRefresh} from './refresh-state.js';

// The source tables remain editable. Each accepted head refers to immutable,
// complete components; publication changes only the head, never source drafts.
const currentRolesSQL="SELECT account_id,activity_key,role FROM effective_activity_roles UNION SELECT e.account_id,e.activity_key,m.target_role FROM legacy_access_evidence e JOIN role_import_reviews v ON v.account_id=e.account_id AND v.activity_key=e.activity_key AND v.source_value=e.source_role JOIN role_mapping_decisions m ON m.source_role=e.source_role WHERE e.source_effective=1 AND v.status='REQUIRED'";
const teacherAreasSQL=`SELECT DISTINCT r.account_id,r.activity_key FROM (${currentRolesSQL}) r JOIN activities a USING(activity_key) WHERE r.role='TEACHER' AND a.active=1 AND a.lifecycle='ACTIVE'`;
const format='ACADEMY_SETUP_V1',id=()=>crypto.randomUUID();
const compare=(a,b)=>stableJSON(a).localeCompare(stableJSON(b),'en');
const tables=Object.keys(setupSchema);
const captureParts=tables.map(name=>{
 const spec=setupSchema[name],object=jsonRowSQL(spec.columns);
 return `('${name}',(SELECT json_group_array(json_object('scope_key',scope_key,'rows_json',json(rows_json))) FROM (SELECT ${spec.scope} scope_key,json_group_array(${object}) rows_json FROM ${name}${name==='academy_settings'?` WHERE ${definitionSettingsSQL}`:''} GROUP BY ${spec.scope})))`;
});
// VALUES avoids D1's smaller compound-SELECT limit and captures all families
// in one consistent statement without consuming one query per table.
const captureSQL=[`WITH captured(table_name,groups_json) AS(VALUES ${captureParts.join(',')}) SELECT table_name,json_extract(j.value,'$.scope_key') scope_key,json_extract(j.value,'$.rows_json') rows_json FROM captured,json_each(groups_json) j`];
const allRows=result=>result.results||[];
const key=c=>c.table_name+'|'+c.scope_key.toUpperCase();
const canonicalRows=(name,rows)=>rows.sort((a,b)=>compare(setupSchema[name].keys.map(k=>a[k]),setupSchema[name].keys.map(k=>b[k])));
const chunks=values=>{const result=[];let chunk=[],size=2;for(const value of values){const bytes=new TextEncoder().encode(JSON.stringify(value)).length+1;if(bytes>1500000)throw fail('This setup component exceeds the publication limit.',413,'SETUP_TOO_LARGE');if(size+bytes>1500000){result.push(chunk);chunk=[];size=2;}chunk.push(value);size+=bytes;}if(chunk.length)result.push(chunk);return result;};

async function source(db){
 const result=await db.batch([db.prepare('SELECT version FROM academy_write_state WHERE singleton=1'),db.prepare('SELECT head_id FROM setup_head_state WHERE singleton=1'),...captureSQL.map(sql=>db.prepare(sql)),db.prepare('SELECT c.* FROM setup_head_components v JOIN setup_components c USING(component_id) WHERE v.head_id=(SELECT head_id FROM setup_head_state WHERE singleton=1)'),db.prepare(teacherAreasSQL)]);
 return {version:result[0].results[0].version,head:result[1].results[0]?.head_id||null,current:result.slice(2,2+captureSQL.length).flatMap(allRows),accepted:allRows(result[2+captureSQL.length]),teacherAreas:allRows(result[3+captureSQL.length])};
}
function requireAdmin(auth){if(!isAdminWorkspace(auth)||!actualState(auth).account.global_admin&&!actualState(auth).roles.some(r=>r.role==='PROGRAM_ADMIN'))throw fail('Open Admin with an authorised account.',403,'FORBIDDEN');}
function authorize(auth,scopes,teacherAreas=[]){
 requireAdmin(auth);
 const authorityScopes=[...new Set(scopes.flatMap(s=>s.startsWith('TEACHER:')?teacherAreas.filter(t=>t.account_id.toUpperCase()===s.slice(8).toUpperCase()).map(t=>t.activity_key.toUpperCase()):[s]))];
 if(!actualState(auth).account.global_admin&&scopes.some(s=>s.startsWith('TEACHER:')&&!teacherAreas.some(t=>t.account_id.toUpperCase()===s.slice(8).toUpperCase())))throw fail('This availability publication needs a Global Admin.',403,'SETUP_SCOPE_FORBIDDEN');
 if(authorityScopes.some(s=>!administers(auth,s)))throw fail('The complete change needs an administrator for every affected area.',403,'SETUP_SCOPE_FORBIDDEN');
 return authorityScopes;
}
function renameSnapshot(value,renames,scope){
 if(Array.isArray(value))return value.map(v=>renameSnapshot(v,renames,scope));
 if(!value||typeof value!=='object')return value;
 const next=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,renameSnapshot(v,renames,scope)]));
 for(const kind of ['module','subject','class']){
  const name=renames.get(kind+':'+scope+'|'+String(value[kind+'Id']||value[kind+'Key']||''))||renames.get(kind+':'+String(value[kind+'Id']||value[kind+'Key']||''));
  if(name&&Object.hasOwn(next,kind+'Name'))next[kind+'Name']=name;
  const upper=kind[0].toUpperCase()+kind.slice(1),upperName=renames.get(kind+':'+scope+'|'+String(value[upper+'ID']||''))||renames.get(kind+':'+String(value[upper+'ID']||''));
  if(upperName&&Object.hasOwn(next,upper+'Name'))next[upper+'Name']=upperName;
 }
 if(Array.isArray(value.classIds)&&Array.isArray(value.classNames))next.classNames=value.classIds.map((v,i)=>renames.get('class:'+scope+'|'+v)||value.classNames[i]);
 return next;
}
function includeSharedNames(snapshot,selected,scopes){
 const old=new Map(snapshot.accepted.map(c=>[key(c),c]));
 const renames=new Map(),usage=JSON.parse(old.get('academy_module_usage|GLOBAL')?.rows_json||'[]');
 for(const c of snapshot.accepted)if(c.table_name==='academy_module_usage')usage.push(...JSON.parse(c.rows_json));
 for(const c of selected.values()){
  const before=JSON.parse(old.get(key(c))?.rows_json||'[]');
  for(const row of JSON.parse(c.rows_json)){
   const spec=setupSchema[c.table_name],previous=before.find(r=>spec.keys.every(k=>r[k]===row[k]));
   if(!previous||!row.name||row.name===previous.name)continue;
   if(c.table_name==='academy_module_catalogue')for(const u of usage.filter(u=>u.academy_module_id===row.module_id))renames.set('module:'+u.activity_key+'|'+u.module_id,row.name);
   if(c.table_name==='subject_catalog'){renames.set('subject:'+row.subject_key,row.name);renames.set('subject:'+row.subject_id,row.name);}
   if(c.table_name==='modules')renames.set('module:'+c.scope_key+'|'+row.module_id,row.name);
   if(c.table_name==='classes')renames.set('class:'+c.scope_key+'|'+row.class_id,row.name);
  }
 }
 if(!renames.size)return;
 // Patch only labels in the previously accepted dependent components. Other
 // areas' unreviewed drafts and historical publication snapshots stay intact.
 const states=snapshot.accepted.filter(c=>['program_publication_state','course_run_state'].includes(c.table_name)).flatMap(c=>JSON.parse(c.rows_json));
 const currentIds=new Set(states.flatMap(s=>[s.latest_publication_id,s.current_publication_id,s.publication_id]).filter(Boolean));
 for(const c of snapshot.accepted){
  if(!['modules','published_lessons','timetable_publications'].includes(c.table_name))continue;
  const base=selected.get(key(c))||c;
  let changed=false;
  const rows=JSON.parse(base.rows_json).map(row=>{
   const next={...row};
   if(c.table_name==='modules'&&renames.has('module:'+c.scope_key+'|'+row.module_id)){next.name=renames.get('module:'+c.scope_key+'|'+row.module_id);changed=true;}
   if(c.table_name==='published_lessons'&&currentIds.has(row.publication_id)&&row.snapshot_json){next.snapshot_json=JSON.stringify(renameSnapshot(JSON.parse(row.snapshot_json),renames,c.scope_key));changed ||=next.snapshot_json!==row.snapshot_json;}
   if(c.table_name==='timetable_publications'&&currentIds.has(row.publication_id)&&row.snapshot_json){next.snapshot_json=JSON.stringify(renameSnapshot(JSON.parse(row.snapshot_json),renames,c.scope_key));changed ||=next.snapshot_json!==row.snapshot_json;}
   return next;
  });
  if(changed){selected.set(key(c),{...base,rows_json:JSON.stringify(rows)});if(!scopes.includes(c.scope_key.toUpperCase()))scopes.push(c.scope_key.toUpperCase());}
 }
}
async function includeRequiredDefinitions(db,accepted,selected,scopes,touchedRegisters,auth){
 const rows=(table,source=[...selected.values()])=>source.filter(c=>c.table_name===table).flatMap(c=>JSON.parse(c.rows_json));
 const present=(table,column,id)=>rows(table,[...accepted,...selected.values()]).some(r=>String(r[column]).toUpperCase()===String(id).toUpperCase());
 const add=(table,scope,row,globalAuthority=true)=>{const k=table+'|'+scope.toUpperCase(),base=selected.get(k)||accepted.find(c=>key(c)===k)||{table_name:table,scope_key:scope,rows_json:'[]'},data=JSON.parse(base.rows_json);if(!data.some(r=>setupSchema[table].keys.every(k=>r[k]===row[k])))data.push(row);selected.set(k,{...base,rows_json:JSON.stringify(data)});if(globalAuthority&&!scopes.includes(scope.toUpperCase()))scopes.push(scope.toUpperCase());};
 const modules=[...new Set(rows('academy_module_usage').map(r=>r.academy_module_id).filter(id=>!present('academy_module_catalogue','module_id',id)))];
 if(modules.length){const found=(await db.prepare('SELECT * FROM academy_module_catalogue WHERE module_id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(modules)).all()).results;for(const row of found)add('academy_module_catalogue','GLOBAL',row);}
 const subjects=[...new Set([...rows('program_subjects').map(r=>r.subject_key),...rows('academy_module_catalogue').map(r=>r.subject_key)].filter(id=>id&&!present('subject_catalog','subject_key',id)))];
 if(subjects.length){const found=(await db.prepare('SELECT * FROM subject_catalog WHERE subject_key IN(SELECT value FROM json_each(?))').bind(JSON.stringify(subjects)).all()).results;for(const row of found)add('subject_catalog','GLOBAL',row);}
 const registers=[...new Set(rows('assessments').map(r=>r.register_id).filter(id=>id&&!present('assessment_registers','register_id',id)))],relevant=[...new Set([...registers,...touchedRegisters])];
 if(relevant.length){const result=await db.batch([db.prepare('SELECT * FROM assessment_registers WHERE register_id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(registers)),db.prepare('SELECT * FROM assessment_register_areas WHERE register_id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(relevant))]),areas=result[1].results;
  if(areas.some(r=>registers.includes(r.register_id)&&!scopes.includes(r.activity_key.toUpperCase())))throw fail('Publish this Imtihaan with all its learning areas from its register.',409,'SETUP_REFERENCE_MISSING');
  for(const row of areas){if(!scopes.includes(row.activity_key.toUpperCase()))scopes.push(row.activity_key.toUpperCase());add('assessment_register_areas',row.activity_key,row,false);}
  if([...touchedRegisters].some(id=>!areas.some(r=>r.register_id===id))&&!actualState(auth).account.global_admin)throw fail('This shared Imtihaan needs an authorised learning area.',403,'FORBIDDEN');
  for(const row of result[0].results)add('assessment_registers',row.class_activity_key||'GLOBAL',row,false);
 }

}
function validateReferences(accepted,selected){
 const combined=new Map(accepted.map(c=>[key(c),c]));for(const [k,c] of selected)combined.set(k,c);
 const rows=new Map(tables.map(t=>[t,[]]));for(const c of combined.values())rows.get(c.table_name).push(...JSON.parse(c.rows_json));
 const indexes=new Map();
 for(const [name,keys] of Object.entries(setupForeignKeys)){
  const groups=new Map();for(const fk of keys){if(!groups.has(fk.id))groups.set(fk.id,[]);groups.get(fk.id).push(fk);}
  for(const group of groups.values()){
   group.sort((a,b)=>a.seq-b.seq);const target=group[0].table,indexKey=target+'|'+group.map(k=>k.to).join('|'),normal=value=>JSON.stringify(value.map(v=>typeof v==='string'?v.toUpperCase():v));
   if(!indexes.has(indexKey))indexes.set(indexKey,new Set(rows.get(target).map(r=>normal(group.map(k=>r[k.to])))));
   for(const r of rows.get(name)){const values=group.map(k=>r[k.from]);if(values.some(v=>v===null||v===undefined))continue;if(!indexes.get(indexKey).has(normal(values)))throw fail('Save the related setup before completing this change.',409,'SETUP_REFERENCE_MISSING');}
  }
 }
}
function guard(db,{version,head},auth,scopes){
 const guardId=id(),now=new Date().toISOString(),base=`(SELECT version=? FROM academy_write_state WHERE singleton=1) AND (SELECT head_id FROM setup_head_state WHERE singleton=1) IS ?`;
 const values=[guardId,version,head];
 let authority='';
 if(auth){authority=` AND EXISTS(SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id) WHERE a.account_id=? AND a.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND c.credential_epoch=? AND s.session_id=? AND s.revoked_at IS NULL AND s.credential_epoch=c.credential_epoch AND s.expires_at>?) AND (EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=? AND g.active=1 AND g.review_state='CONFIRMED' AND g.role='GLOBAL_ADMIN') OR NOT EXISTS(SELECT 1 FROM json_each(?) scope WHERE NOT EXISTS(SELECT 1 FROM (SELECT account_id,activity_key,role FROM effective_activity_roles UNION SELECT e.account_id,e.activity_key,m.target_role FROM legacy_access_evidence e JOIN role_import_reviews v ON v.account_id=e.account_id AND v.activity_key=e.activity_key AND v.source_value=e.source_role JOIN role_mapping_decisions m ON m.source_role=e.source_role WHERE e.source_effective=1 AND v.status='REQUIRED') r JOIN activities a USING(activity_key) WHERE r.account_id=? AND r.role='PROGRAM_ADMIN' AND r.activity_key=scope.value COLLATE NOCASE AND a.active=1 AND a.lifecycle='ACTIVE')))`;values.push(auth.user.accountid,actualState(auth).account.credential_epoch,auth.sid,now,auth.user.accountid,JSON.stringify(scopes),auth.user.accountid);}
 return {check:db.prepare(`INSERT INTO academy_write_guards VALUES(?,${base}${authority})`).bind(...values),clear:db.prepare('DELETE FROM academy_write_guards WHERE guard_id=?').bind(guardId)};
}
const insertComponents=(db,batch,components)=>chunks(components.map(c=>({...c,component_id:id()}))).map(chunk=>db.prepare(`INSERT INTO setup_components(component_id,batch_id,table_name,scope_key,rows_json,row_count,digest) SELECT json_extract(value,'$.component_id'),?,json_extract(value,'$.table_name'),json_extract(value,'$.scope_key'),json_extract(value,'$.rows_json'),json_extract(value,'$.row_count'),json_extract(value,'$.digest') FROM json_each(?)`).bind(batch,JSON.stringify(chunk)));
function headStatements(db,batch,head,parent,actor,now,mediaSeparation=false){return [
 db.prepare('INSERT INTO setup_heads VALUES(?,?,?,?,?)').bind(head,parent,batch,now,actor),
 ...(parent?[db.prepare(`INSERT INTO setup_head_components SELECT ?,v.table_name,v.scope_key,v.component_id FROM setup_head_components v WHERE v.head_id=? AND NOT EXISTS(SELECT 1 FROM setup_components c WHERE c.batch_id=? AND c.table_name=v.table_name AND c.scope_key=v.scope_key)`).bind(head,parent,batch)]:[]),
 db.prepare('INSERT INTO setup_head_components SELECT ?,table_name,scope_key,component_id FROM setup_components WHERE batch_id=?').bind(head,batch),
 db.prepare('INSERT INTO setup_head_state VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET head_id=excluded.head_id').bind(head),
 ...(mediaSeparation?[db.prepare(`UPDATE lesson_media_visibility SET visible=1,updated_at=?,updated_by=? WHERE lesson_id IN(SELECT json_extract(row.value,'$.lesson_id') FROM setup_components c,json_each(c.rows_json) row JOIN lesson_media_lessons current ON current.lesson_id=json_extract(row.value,'$.lesson_id') WHERE c.batch_id=? AND c.table_name='lesson_media_lessons' AND json_extract(row.value,'$.state')='PUBLISHED' AND current.state='PUBLISHED')`).bind(now,actor,batch)]:[]),
 db.prepare('UPDATE setup_batches SET accepted_head=? WHERE batch_id=?').bind(head,batch)
 ];}
export async function initialiseAcceptedSetup(db,actor='RELEASE_BOOTSTRAP'){
 const snapshot=await source(db);if(snapshot.head)return {head:snapshot.head,existing:true};
 const components=[];for(const c of snapshot.current){const rows=canonicalRows(c.table_name,JSON.parse(c.rows_json));components.push({...c,rows_json:JSON.stringify(rows),row_count:rows.length,digest:await payloadHash(rows)});}
 const batch=id(),head=id(),now=new Date().toISOString(),manifest={format,schemaDigest:await payloadHash(setupSchema),bootstrap:true,sourceVersion:snapshot.version,components:components.map(c=>({table:c.table_name,scope:c.scope_key,rows:c.row_count,digest:c.digest}))},digest=await payloadHash(manifest),g=guard(db,{version:snapshot.version,head:null});
 await db.batch([g.check,db.prepare('INSERT INTO setup_batches VALUES(?,?,?,?,?,?,?,?,NULL)').bind(batch,actor,'["GLOBAL"]',snapshot.version,null,digest,JSON.stringify(manifest),now),...insertComponents(db,batch,components),...headStatements(db,batch,head,null,actor,now),g.clear]);
 return {head,batchId:batch,components:components.length,digest};
}
// Finish one verified feature operation. The receipt contains only that
// operation's before/after rows, captured inside its source transaction.
export async function acceptFeatureChange(repository,auth,input){
 requireAdmin(auth);const db=repository.db,p=(sql,...values)=>db.prepare(sql).bind(...values);
 if(!['dataset','scope','operationId'].every(k=>typeof input[k]==='string'&&input[k].length<=250))throw fail('Choose the saved change.',400,'INVALID_CHANGE');
 for(let attempt=0;attempt<3;attempt++){
  const receipt=await p('SELECT * FROM operation_receipts WHERE dataset_key=? AND scope_key=? AND operation_id=?',input.dataset,input.scope,input.operationId).first();
  if(!receipt||receipt.actor_account_id!==auth.user.accountid)throw fail('This saved change belongs to another account.',403,'FORBIDDEN');
  const saved=JSON.parse(receipt.result_json),change=saved._acceptedChange;
  if(!change)throw fail('Open this older change in its editor and save it again.',409,'LEGACY_CHANGE_RETRY');
  const read=(await db.batch([p('SELECT version,(SELECT head_id FROM setup_head_state WHERE singleton=1) head FROM academy_write_state WHERE singleton=1'),p('SELECT c.* FROM setup_head_components v JOIN setup_components c USING(component_id) WHERE v.head_id=(SELECT head_id FROM setup_head_state WHERE singleton=1)'),p(teacherAreasSQL)])).map(r=>r.results);
  const state=read[0][0],accepted=read[1];
  if(saved._acceptedHead)return {head:state.head,replayed:true,...(saved._acceptedPublic?{cacheRefreshPending:['public-timetable']}:{})};
  const selected=new Map(),scopes=[],touchedRegisters=new Set();
  for(const delta of change.tables){
   const spec=setupSchema[delta.table];if(!spec)throw fail('Saved change verification failed.',409,'CHANGE_INVALID');
   const identity=row=>stableJSON(spec.keys.map(k=>typeof row[k]==='string'&&spec.nocase?.includes(k)?row[k].toUpperCase():row[k]));
   const before=new Map(delta.before.map(v=>[identity(v.row),v])),after=new Map(delta.after.map(v=>[identity(v.row),v]));
   const keys=[...new Set([...before.keys(),...after.keys()])];if(delta.table==='assessment_registers')for(const v of [...before.values(),...after.values()])touchedRegisters.add(v.row.register_id);
   const sourceRows=(await p(`SELECT ${jsonRowSQL(spec.columns)} row_json FROM json_each(?) key JOIN ${delta.table} ON ${spec.keys.map(k=>`${delta.table}.${k} IS json_extract(key.value,'$.${k}')${spec.nocase?.includes(k)?' COLLATE NOCASE':''}`).join(' AND ')}`,JSON.stringify(keys.map(key=>Object.fromEntries(spec.keys.map(k=>[k,(after.get(key)||before.get(key)).row[k]]))))).all()).results;
   const source=new Map(sourceRows.map(r=>{const row=JSON.parse(r.row_json);return [identity(row),row];}));
   const material=spec.columns.filter(c=>!spec.live?.includes(c)&&(!['revision','updated_at','updated_by','updated_by_account_id','created_at'].includes(c)||c===spec.publicationRevision));
   for(const rowKey of keys){
    const prior=before.get(rowKey),next=after.get(rowKey),scope=String((next||prior).scope).toUpperCase(),componentKey=delta.table+'|'+scope,current=source.get(rowKey);
    const confirmed=new Set((change.confirmations||[]).filter(c=>c.table===delta.table&&c.keys.some(k=>identity(k)===rowKey)).flatMap(c=>c.fields));
    const changed=next?material.filter(k=>change.fullRows||confirmed.has(k)||!prior||stableJSON(prior.row[k])!==stableJSON(next.row[k])):material;
    if(next?(!current||changed.some(k=>stableJSON(current[k])!==stableJSON(next.row[k]))):current)throw fail('This saved entry has changed again. Open the latest entry before saving.',409,'CHANGE_SUPERSEDED');
    if(!selected.has(componentKey)){const old=accepted.find(c=>key(c)===componentKey);selected.set(componentKey,{table_name:delta.table,scope_key:scope,rows_json:old?.rows_json||'[]'});}
    const component=selected.get(componentKey),rows=JSON.parse(component.rows_json),index=rows.findIndex(r=>identity(r)===rowKey);
    if(!next){if(index>=0)rows.splice(index,1);}
    else if(index<0)rows.push(next.row);
    else{const row={...rows[index]};for(const field of changed)row[field]=next.row[field];rows[index]=row;}
    component.rows_json=JSON.stringify(rows);if(!(delta.table==='assessment_registers'&&scope==='GLOBAL')&&!scopes.includes(scope))scopes.push(scope);
   }
  }
  await includeRequiredDefinitions(db,accepted,selected,scopes,touchedRegisters,auth);includeSharedNames({accepted},selected,scopes);const authorityScopes=authorize(auth,scopes,read[2]);
  validateReferences(accepted,selected);await validateAcceptedSessionPdfs(db,accepted,selected);
  const components=[];for(const c of selected.values()){
   const rows=canonicalRows(c.table_name,JSON.parse(c.rows_json)),digest=await payloadHash(rows),previous=accepted.find(v=>key(v)===key(c));
   if(digest!==previous?.digest&&(rows.length||previous))components.push({...c,rows_json:JSON.stringify(rows),row_count:rows.length,digest});
  }
  const batch=id(),head=components.length?id():state.head,now=new Date().toISOString(),publicChanged=components.some(c=>['activities','program_settings','course_settings','course_runs','course_run_state','timetable_publications','published_lessons','program_publication_state','academy_calendar_events','academy_calendar_suppressions','academy_settings'].includes(c.table_name)),g=guard(db,{version:state.version,head:state.head},auth,authorityScopes);
  const manifest={format,schemaDigest:await payloadHash(setupSchema),sourceOperation:{dataset:input.dataset,scope:input.scope,operationId:input.operationId},sourceVersion:state.version,expectedHead:state.head,automatic:true,scopes,authorityScopes,components:components.map(c=>({table:c.table_name,scope:c.scope_key,rows:c.row_count,digest:c.digest}))};
  try{
   // Immutable candidates are staged privately before Core acceptance. This
   // retains the existing split coordinator's publication fence and recovery.
   if(components.length)await db.batch([g.check,p('INSERT INTO setup_batches VALUES(?,?,?,?,?,?,?,?,NULL)',batch,auth.user.accountid,JSON.stringify(scopes),state.version,state.head,await payloadHash(manifest),JSON.stringify(manifest),now),...insertComponents(db,batch,components),g.clear]);
   const websiteFlags=[...selected.values()].filter(c=>['course_website_documents','program_surah_website_documents'].includes(c.table_name)).flatMap(c=>JSON.parse(c.rows_json).map(row=>p("INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES(?,?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by_account_id=excluded.updated_by_account_id",(c.table_name==='course_website_documents'?'CourseWebsitePublished:'+row.activity_key.toUpperCase():'SurahWebsitePublished:'+row.surah_id),row.enabled===0?'0':'1',now,auth.user.accountid)));
   await db.batch([g.check,...websiteFlags,...(components.length?headStatements(db,batch,head,state.head,auth.user.accountid,now,repository.features?.mediaSeparation):[]),...(publicChanged?[markRefresh(p,'public-timetable',auth.user.accountid)]:[]),p("UPDATE operation_receipts SET result_json=json_set(result_json,'$._acceptedHead',?,'$._acceptedPublic',?) WHERE dataset_key=? AND scope_key=? AND operation_id=? AND actor_account_id=?",head,Number(publicChanged),input.dataset,input.scope,input.operationId,auth.user.accountid),p("INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json) VALUES(?,?,?,?,?,'feature-accept','ACCEPTED_SETUP',?,?)",id(),now,auth.user.accountid,actualState(auth).account.global_admin?'GLOBAL_ADMIN':'PROGRAM_ADMIN',scopes.join(','),input.operationId,JSON.stringify(manifest.components)),g.clear]);}
  catch(error){if(/academy_management_stale/.test(error.message)&&attempt<2)continue;if(/lesson_media_pdf_limit/.test(error.message))throw fail('A session would exceed ten PDFs including Teacher notes. Curate its attachments before publishing.',409,'SETUP_MEDIA_LIMIT');throw error;}
  if(components.some(c=>['assessments','assessment_registers','assessment_phases','classes','activities'].includes(c.table_name)))try{await repository.onAssessmentPublication?.(head);}catch{/* Accepted publication is committed; private snapshots can recover on read. */}
  return {head,...(publicChanged?{cacheRefreshPending:['public-timetable']}:{})};
 }
 throw fail('Other work changed while saving. Retry this change.',409,'CHANGE_CHANGED');
}
