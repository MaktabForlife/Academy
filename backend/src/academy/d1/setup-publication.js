import {jsonRowSQL} from './json-row.js';
import {setupSchema,setupForeignKeys} from './setup-schema.js';
import {definitionSettingsSQL} from './setup-reader.js';
import {payloadHash,stableJSON} from '../../programs/timetable-model.js';
import {rehearsalError as fail} from './repository.js';
import {actualState,isAdminWorkspace,administers} from './workspace-access.js';

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
function selections(auth,input,snapshot){
 if(!Array.isArray(input.scopes)||input.families!==undefined&&!Array.isArray(input.families))throw fail('Choose the areas to review.',400,'INVALID_SETUP_SELECTION');
 const scopes=[...new Set((input.scopes||[]).map(s=>String(s).toUpperCase()))];
 const families=input.families?.length===1&&input.families[0]==='media'?['media']:[...new Set(Object.values(setupSchema).map(s=>s.family))];
 if(!scopes.length||scopes.length>250||!Array.isArray(families)||families.some(f=>!Object.values(setupSchema).some(s=>s.family===f)))throw fail('Choose the areas and setup to review.',400,'INVALID_SETUP_SELECTION');
 authorize(auth,scopes,snapshot.teacherAreas);
 // Availability is shared by a teacher's areas; publication checks every
 // affected area rather than widening a scoped administrator's authority.
 const permitted=scope=>scopes.includes(scope.toUpperCase())||scopes.includes('GLOBAL')&&scope.startsWith('TEACHER:');
 const selected=new Map();
 for(const c of [...snapshot.accepted,...snapshot.current])if(permitted(c.scope_key)&&families.includes(setupSchema[c.table_name].family))selected.set(key(c),{...c,rows_json:'[]'});
 for(const scope of scopes)for(const name of tables)if(families.includes(setupSchema[name].family)&&!['GLOBAL','TEACHER:'].some(prefix=>scope.startsWith(prefix))&&setupSchema[name].scope.includes('activity_key'))selected.set(name+'|'+scope,{table_name:name,scope_key:scope,rows_json:'[]'});
 for(const c of snapshot.current)if(selected.has(key(c)))selected.set(key(c),c);
 return {scopes,families,selected};
}
function includeCatalogueDependencies(snapshot,selected,scopes){
 const old=new Map(snapshot.accepted.map(c=>[key(c),c])),current=new Map(snapshot.current.map(c=>[key(c),c]));
 const addRow=(table,row)=>{const k=table+'|GLOBAL',base=selected.get(k)||old.get(k)||{table_name:table,scope_key:'GLOBAL',rows_json:'[]'},spec=setupSchema[table],rows=JSON.parse(base.rows_json),index=rows.findIndex(r=>spec.keys.every(k=>r[k]===row[k]));if(index<0)rows.push(row);else rows[index]=row;selected.set(k,{...base,rows_json:JSON.stringify(rows)});if(!scopes.includes('GLOBAL'))scopes.push('GLOBAL');};
 const catalogue=JSON.parse(current.get('academy_module_catalogue|GLOBAL')?.rows_json||'[]'),previous=JSON.parse(old.get('academy_module_catalogue|GLOBAL')?.rows_json||'[]');
 for(const c of [...selected.values()])if(c.table_name==='academy_module_usage')for(const u of JSON.parse(c.rows_json)){
  const shared=catalogue.find(r=>r.module_id===u.academy_module_id),before=previous.find(r=>r.module_id===u.academy_module_id),local=JSON.parse(selected.get('modules|'+c.scope_key.toUpperCase())?.rows_json||'[]').find(r=>r.module_id===u.module_id);
  if(shared&&local&&(!before||before.name!==shared.name)&&local.name===shared.name){
   addRow('academy_module_catalogue',shared);
   if(shared.subject_key&&!JSON.parse(old.get('subject_catalog|GLOBAL')?.rows_json||'[]').some(r=>r.subject_key===shared.subject_key)){
    const subject=JSON.parse(current.get('subject_catalog|GLOBAL')?.rows_json||'[]').find(r=>r.subject_key===shared.subject_key);if(subject)addRow('subject_catalog',subject);
   }
  }
 }
 // A new Program subject needs its exact shared definition, without accepting
 // other pending catalogue rows as a side effect.
 for(const c of [...selected.values()])if(c.table_name==='program_subjects')for(const row of JSON.parse(c.rows_json))if(!JSON.parse(old.get('subject_catalog|GLOBAL')?.rows_json||'[]').some(r=>r.subject_key===row.subject_key)){
  const subject=JSON.parse(current.get('subject_catalog|GLOBAL')?.rows_json||'[]').find(r=>r.subject_key===row.subject_key);if(subject)addRow('subject_catalog',subject);
 }
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
function includeAvailability(snapshot,selected,scopes){
 const old=new Map(snapshot.accepted.map(c=>[key(c),c])),current=new Map(snapshot.current.map(c=>[key(c),c]));
 const ids=new Set([...selected.values()].filter(c=>['program_publication_state','course_run_state'].includes(c.table_name)).flatMap(c=>JSON.parse(c.rows_json)).flatMap(r=>[r.latest_publication_id,r.current_publication_id]).filter(Boolean));
 const teachers=new Set([...selected.values()].filter(c=>c.table_name==='published_lesson_teachers').flatMap(c=>JSON.parse(c.rows_json)).filter(r=>ids.has(r.publication_id)).map(r=>r.account_id.toUpperCase()));
 for(const account of teachers){const scope='TEACHER:'+account,k='teacher_availability|'+scope,c=current.get(k);if(c&&c.rows_json!==old.get(k)?.rows_json){selected.set(k,c);if(!scopes.includes(scope))scopes.push(scope);}}
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
   for(const r of rows.get(name)){const values=group.map(k=>r[k.from]);if(values.some(v=>v===null||v===undefined))continue;if(!indexes.get(indexKey).has(normal(values)))throw fail('This change needs its related setup published together. Review all affected areas and shared setup.',409,'SETUP_REFERENCE_MISSING');}
  }
 }
}
async function candidate(db,auth,input){
 const snapshot=await source(db);
 if(input.sourceOperation){const receipt=await sourceOperation(db,auth,input.sourceOperation);if(snapshot.version!==receipt.sourceVersion)throw fail('Other work was saved after this publication. Open Review setup to review the current complete change.',409,'SETUP_REVIEW_CHANGED');input={...input,scopes:receipt.scopes,families:receipt.families||input.families};}
 const {scopes,families,selected}=selections(auth,input,snapshot);
 if(!snapshot.head)throw fail('Initial accepted setup must be prepared before publishing.',503,'SETUP_PUBLICATION_REQUIRED');
 includeCatalogueDependencies(snapshot,selected,scopes);includeSharedNames(snapshot,selected,scopes);includeAvailability(snapshot,selected,scopes);const authorityScopes=authorize(auth,scopes,snapshot.teacherAreas);
 validateReferences(snapshot.accepted,selected);
 const previous=new Map(snapshot.accepted.map(c=>[key(c),c]));
 const components=[];
 for(const c of selected.values()){
  const rows=canonicalRows(c.table_name,JSON.parse(c.rows_json)),json=JSON.stringify(rows),digest=await payloadHash(rows);
  if(rows.length===0&&!previous.has(key(c)))continue;
  if(digest!==previous.get(key(c))?.digest)components.push({table_name:c.table_name,scope_key:c.scope_key,rows_json:json,row_count:rows.length,digest});
 }
 components.sort((a,b)=>key(a).localeCompare(key(b),'en'));
 const changes=components.map(c=>{const spec=setupSchema[c.table_name],old=JSON.parse(previous.get(key(c))?.rows_json||'[]'),next=JSON.parse(c.rows_json),identity=r=>stableJSON(spec.keys.map(k=>r[k])),oldRows=new Map(old.map(r=>[identity(r),r])),nextRows=new Map(next.map(r=>[identity(r),r]));const entries=[];for(const [id,r] of nextRows){const before=oldRows.get(id),fields=spec.columns.filter(k=>stableJSON(before?.[k]??null)!==stableJSON(r[k]??null));if(!before||fields.length)entries.push({id,label:r.name||r.title||r.display_name||r.filename||r.lesson_date||r.calendar_date||'Entry',action:before?'Changed':'Added',fields:fields.map(field=>({field,before:String(before?.[field]??'').slice(0,180),after:String(r[field]??'').slice(0,180)}))});}for(const [id,row] of oldRows)if(!nextRows.has(id))entries.push({id,label:row.name||row.title||row.display_name||row.filename||row.lesson_date||row.calendar_date||'Entry',action:'Removed',fields:[]});return {table:c.table_name,scope:c.scope_key,count:entries.length,entries:entries.slice(0,100)};});
 const manifest={format,schemaDigest:await payloadHash(setupSchema),selection:{scopes:input.scopes.map(s=>String(s).toUpperCase()).sort(),families:families.slice().sort()},...(input.sourceOperation?{sourceOperation:{dataset:input.sourceOperation.dataset,scope:input.sourceOperation.scope,operationId:input.sourceOperation.operationId}}:{}),sourceVersion:snapshot.version,expectedHead:snapshot.head,scopes:scopes.sort(),authorityScopes:authorityScopes.sort(),families:families.slice().sort(),components:components.map(({table_name,scope_key,row_count,digest})=>({table:table_name,scope:scope_key,rows:row_count,digest,previousRows:previous.get(table_name+'|'+scope_key.toUpperCase())?.row_count||0}))};
 return {manifest,components,changes,digest:await payloadHash(manifest)};
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
async function sourceOperation(db,auth,operation){
 const row=await db.prepare('SELECT actor_account_id,result_json FROM operation_receipts WHERE dataset_key=? AND scope_key=? AND operation_id=?').bind(String(operation.dataset||''),String(operation.scope||''),String(operation.operationId||'')).first();
 const publication=row&&JSON.parse(row.result_json).setupPublication;
 if(!publication||row.actor_account_id!==auth.user.accountid)throw fail('The original saved publication is not available.',404,'SETUP_SOURCE_NOT_FOUND');
 return publication;
}
export function setupPublication(repository,auth){
 const db=repository.db;
 return {async run(action,input={}){
  if(action==='publish'){
   const saved=await db.prepare('SELECT * FROM setup_batches WHERE batch_id=?').bind(String(input.batchId||'')).first();
   if(saved?.accepted_head&&saved.actor_account_id===auth.user.accountid&&saved.digest===input.digest)return {head:saved.accepted_head,batchId:saved.batch_id,replayed:true};
  }
  if(action==='resolve'){await sourceOperation(db,auth,input.sourceOperation||{});const batch=await db.prepare("SELECT accepted_head FROM setup_batches WHERE actor_account_id=? AND json_extract(manifest_json,'$.sourceOperation.operationId')=? AND json_extract(manifest_json,'$.sourceOperation.dataset')=? AND json_extract(manifest_json,'$.sourceOperation.scope')=? AND accepted_head IS NOT NULL ORDER BY created_at LIMIT 1").bind(auth.user.accountid,input.sourceOperation.operationId,input.sourceOperation.dataset,input.sourceOperation.scope).first();return {head:batch?.accepted_head||null};}
  requireAdmin(auth);
  if(action==='options'){
   const state=actualState(auth),areas=(await db.prepare('SELECT activity_key,name FROM activities ORDER BY name').all()).results.filter(a=>administers(auth,a.activity_key));
   const teacherAreas=(await db.prepare(teacherAreasSQL).all()).results,availability=(await db.prepare('SELECT t.account_id,a.display_name FROM teacher_availability t JOIN accounts a USING(account_id) ORDER BY a.display_name').all()).results.filter(t=>state.account.global_admin||teacherAreas.some(a=>a.account_id===t.account_id)&&teacherAreas.filter(a=>a.account_id===t.account_id).every(a=>administers(auth,a.activity_key)));
   return {areas:[...(state.account.global_admin?[{activity_key:'GLOBAL',name:'Academy shared setup'}]:[]),...areas,...availability.map(t=>({activity_key:'TEACHER:'+t.account_id.toUpperCase(),name:t.display_name+' availability'}))],families:[...new Set(Object.values(setupSchema).map(s=>s.family))]};
  }
  if(action==='review'){
   const c=await candidate(db,auth,input);return {manifest:c.manifest,digest:c.digest,changes:c.changes};
  }
  if(action==='freeze'){
   const c=await candidate(db,auth,input);
   if(input.digest!==c.digest)throw fail('Setup changed after review. Review the complete change again.',409,'SETUP_REVIEW_CHANGED');
   if(!c.components.length)throw fail('There are no unpublished changes in this selection.',409,'SETUP_NO_CHANGES');
   const batch=id(),now=new Date().toISOString(),g=guard(db,{version:c.manifest.sourceVersion,head:c.manifest.expectedHead},auth,c.manifest.authorityScopes);
   try{await db.batch([g.check,db.prepare('INSERT INTO setup_batches VALUES(?,?,?,?,?,?,?,?,NULL)').bind(batch,auth.user.accountid,JSON.stringify(c.manifest.scopes),c.manifest.sourceVersion,c.manifest.expectedHead,c.digest,JSON.stringify(c.manifest),now),...insertComponents(db,batch,c.components),g.clear]);}
   catch(e){if(/academy_management_stale/.test(e.message))throw fail('Setup or your access changed. Review again.',409,'SETUP_REVIEW_CHANGED');throw e;}
   return {batchId:batch,digest:c.digest,manifest:c.manifest};
  }
  if(action==='publish'){
   const batch=await db.prepare('SELECT * FROM setup_batches WHERE batch_id=?').bind(String(input.batchId||'')).first();
   if(!batch||batch.actor_account_id!==auth.user.accountid||batch.digest!==input.digest)throw fail('This reviewed publication is not available.',404,'SETUP_BATCH_NOT_FOUND');
   const manifest=JSON.parse(batch.manifest_json);authorize(auth,manifest.authorityScopes);
   if(batch.accepted_head)return {head:batch.accepted_head,batchId:batch.batch_id,replayed:true};
   const components=(await db.prepare('SELECT * FROM setup_components WHERE batch_id=? ORDER BY table_name,scope_key').bind(batch.batch_id).all()).results;
   if(components.length!==manifest.components.length)throw fail('The complete publication is not available.',409,'SETUP_COMPONENT_MISSING');
   for(const c of components){const entry=manifest.components.find(e=>e.table===c.table_name&&e.scope===c.scope_key);if(!entry||entry.digest!==c.digest||c.row_count!==entry.rows||await payloadHash(JSON.parse(c.rows_json))!==c.digest)throw fail('Publication verification failed.',409,'SETUP_COMPONENT_CHANGED');}
   const current=await candidate(db,auth,{...manifest.selection,...(manifest.sourceOperation?{sourceOperation:manifest.sourceOperation}:{})});
   if(current.digest!==batch.digest)throw fail('Setup changed after review. Review again before publishing.',409,'SETUP_REVIEW_CHANGED');
   const head=id(),now=new Date().toISOString(),g=guard(db,{version:batch.source_version,head:batch.expected_head},auth,manifest.authorityScopes);
   try{await db.batch([g.check,...headStatements(db,batch.batch_id,head,batch.expected_head,auth.user.accountid,now,repository.features?.mediaSeparation),db.prepare(`INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json) VALUES(?,?,?,?,?,'setup-publish','ACCEPTED_SETUP',?,?)`).bind(id(),now,auth.user.accountid,actualState(auth).account.global_admin?'GLOBAL_ADMIN':'PROGRAM_ADMIN',manifest.scopes.join(','),batch.batch_id,JSON.stringify(manifest.components)),g.clear]);}
   catch(e){const saved=await db.prepare('SELECT accepted_head FROM setup_batches WHERE batch_id=?').bind(batch.batch_id).first();if(saved?.accepted_head)return {head:saved.accepted_head,batchId:batch.batch_id,replayed:true};if(/lesson_media_pdf_limit/.test(e.message))throw fail('A session would exceed ten PDFs including Teacher notes. Curate its attachments before publishing.',409,'SETUP_MEDIA_LIMIT');if(/academy_management_stale/.test(e.message))throw fail('Setup, publication or access changed. Review again.',409,'SETUP_REVIEW_CHANGED');throw e;}
   return {head,batchId:batch.batch_id};
  }
  throw fail('Unknown setup action.',400);
 }};
}
