import {retentionBudget} from './note-retention-budget.js';
import {academyD1Repository} from './repository.js';
import {acceptedRepository,acceptedHead} from './setup-reader.js';
import {setupSchema} from './setup-schema.js';
import {lessonPdfObjectKey} from './lesson-pdf-storage.js';
import {optionalSchema} from './schema-probe.js';
import {noteExpiry} from './note-retention-policy.js';

const day=86400000,later=(...dates)=>dates.filter(Boolean).sort().at(-1);
const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
const statement=(db,sql,...values)=>db.prepare(sql).bind(...values);

// Upload commits bind the object-GC generation observed BEFORE writing bytes.
// A concurrent delete (even one that finishes before commit) forces a retry.
export async function pdfRetentionWrite(repository,p,objectKey){
 if(!repository.features?.noteRetention)return {before:[],after:[],objectKey,alternate:false};
 const row=await repository.db.prepare('SELECT state,updated_at FROM note_retention_objects WHERE object_key=?').bind(objectKey).first();
 if(row?.state==='DELETING')throw Object.assign(Error('This PDF is being cleaned up. Please retry the upload.'),{status:409});
 const alternate=row?.state==='DELETED';
 if(alternate)objectKey=objectKey.replace(/\/([a-f0-9]{64})\.pdf$/,()=>'/'+crypto.randomUUID()+'/'+objectKey.split('/').at(-1));
 const guard=crypto.randomUUID();
 return {objectKey,alternate,before:[p("INSERT INTO academy_write_guards VALUES(?,coalesce((SELECT updated_at FROM note_retention_objects WHERE object_key=?),'')=? AND NOT EXISTS(SELECT 1 FROM note_retention_objects WHERE object_key=? AND state='DELETING'))",guard,objectKey,alternate?'':row?.updated_at||'',objectKey)],after:[p('DELETE FROM academy_write_guards WHERE guard_id=?',guard)]};
}

// Filter publication JSON BEFORE live-row checks and joins. The ordinary
// accepted reader materializes whole media tables for joins; its NOCASE live
// joins can examine N*N rows. Only this maintenance selection is narrowed.
// Keep the same pinned head, live link/lesson existence and expiry tombstones.
async function officialPdfRows(repository,ids){
 if(!ids.length)return [];
 let params=[JSON.stringify(ids),JSON.stringify(ids)],assets,links,lessons;
 if(repository.setup?.reader){
  const projection=(name,column,selection,live=false)=>{
   const spec=setupSchema[name],field=c=>`json_extract(r.value,'$.${c}')`;
   return `SELECT ${spec.columns.map(c=>`${field(c)} AS ${c}`).join(',')} FROM main.setup_head_components h JOIN main.setup_components c USING(component_id) JOIN json_each(c.rows_json) r WHERE h.head_id=? AND h.table_name='${name}' AND ${field(column)} IN(${selection})${live?` AND EXISTS(SELECT 1 FROM main.${name} live WHERE ${spec.keys.map(c=>`live.${c}=${field(c)} COLLATE NOCASE`).join(' AND ')})`:''}${name==='lesson_media_assets'?" AND NOT EXISTS(SELECT 1 FROM main.note_retention_items expiry WHERE expiry.kind='SESSION_PDF' AND expiry.ref_id=json_extract(r.value,'$.asset_id') AND expiry.state IN('PURGING','DELETED'))":''}`;
  };
  assets=projection('lesson_media_assets','asset_id','SELECT value FROM json_each(?)');
  links=projection('lesson_media_links','asset_id','SELECT value FROM json_each(?)',true);
  lessons=projection('lesson_media_lessons','lesson_id','SELECT lesson_id FROM selected_links',true);
  params=[repository.setup.head,params[0],repository.setup.head,params[1],repository.setup.head];
 }else{
  assets='SELECT * FROM lesson_media_assets WHERE asset_id IN(SELECT value FROM json_each(?))';
  links='SELECT * FROM lesson_media_links WHERE asset_id IN(SELECT value FROM json_each(?))';
  lessons='SELECT * FROM lesson_media_lessons WHERE lesson_id IN(SELECT lesson_id FROM selected_links)';
 }
 return (await statement(repository.db,`WITH selected_assets AS MATERIALIZED (${assets}),selected_links AS MATERIALIZED (${links}),selected_lessons AS MATERIALIZED (${lessons})
 SELECT a.*,l.class_id,l.run_id,l.lesson_date,l.source_lessons_json,l.media_scope FROM json_each(?) chosen LEFT JOIN selected_assets a ON a.asset_id=chosen.value LEFT JOIN selected_links x ON x.asset_id=chosen.value LEFT JOIN selected_lessons l ON l.lesson_id=x.lesson_id`,...params,JSON.stringify(ids)).all()).results;
}

async function discover(repository,db,policy,now,excluded,definitions){
 const p=(sql,...v)=>statement(db,sql,...v),time=now.toISOString(),saved=[],updates=[];
 const cutoff=new Date(now.getTime()-Math.max(0,28*policy.months-policy.warning_days)*day).toISOString(),blocked=new Set(excluded.map(k=>k.toUpperCase()));
 const cursors=(await p('SELECT * FROM note_retention_discovery').all()).results;
 for(const kind of ['CLASS_NOTE','PDF_NOTE','SESSION_PDF']){
  const prior=cursors.find(c=>c.kind===kind),cursor=prior?.policy_revision===policy.revision?prior:null;if(cursor?.resume_after>time)continue;
  const created=cursor?.last_created||'',id=cursor?.last_id||'';
  const tables={CLASS_NOTE:['class_notes','note_id'],PDF_NOTE:['lesson_note_entries','note_id'],SESSION_PDF:['lesson_media_assets','asset_id']},[table,key]=tables[kind],target=kind==='SESSION_PDF'?definitions:db;
  const page=(await statement(target,`SELECT ${key} id,activity_key,created_at FROM ${table} WHERE ${kind==='SESSION_PDF'?"kind='PDF' AND ":''}(created_at,${key})>(?,?) AND created_at<=? ORDER BY created_at,${key} LIMIT 20`,created,id,cutoff).all()).results;
  const last=page.at(-1),full=page.length===20;
  updates.push(p('INSERT INTO note_retention_discovery VALUES(?,?,?,?,?) ON CONFLICT(kind) DO UPDATE SET last_created=excluded.last_created,last_id=excluded.last_id,resume_after=excluded.resume_after,policy_revision=excluded.policy_revision',kind,full?last.created_at:'',full?last.id:'',full?'':new Date(now.getTime()+day).toISOString(),policy.revision));
  const known=page.length?(await p('SELECT ref_id FROM note_retention_items WHERE kind=? AND ref_id IN(SELECT value FROM json_each(?))',kind,JSON.stringify(page.map(r=>r.id))).all()).results:[];
  const revisit=page.filter(r=>!blocked.has(r.activity_key.toUpperCase())&&known.some(k=>k.ref_id===r.id)).map(r=>r.id);
  if(revisit.length)updates.push(p("UPDATE note_retention_items SET next_check=? WHERE kind=? AND ref_id IN(SELECT value FROM json_each(?)) AND state IN('TRACKED','WARNED') AND next_check>?",time,kind,JSON.stringify(revisit),time));
  const ids=page.filter(r=>!blocked.has(r.activity_key.toUpperCase())&&!known.some(k=>k.ref_id===r.id)).map(r=>r.id);if(!ids.length)continue;
  if(kind==='CLASS_NOTE'){
   const rows=(await p('SELECT n.note_id,n.activity_key,n.created_at,c.class_id,c.lesson_date FROM class_notes n JOIN class_note_contexts c USING(context_id) WHERE n.note_id IN(SELECT value FROM json_each(?))',JSON.stringify(ids)).all()).results;
   for(const n of rows)saved.push({kind,ref:n.note_id,area:n.activity_key,created:n.created_at,classes:[n.class_id],date:n.lesson_date,label:'Class Note'});
  }else if(kind==='PDF_NOTE'){
   const rows=(await p('SELECT n.note_id,n.activity_key,n.created_at,v.source_json,v.filename,v.display_name FROM lesson_note_entries n JOIN lesson_note_versions v ON v.version_id=n.current_version_id WHERE n.note_id IN(SELECT value FROM json_each(?))',JSON.stringify(ids)).all()).results;
   for(const n of rows){const source=parse(n.source_json)||{};saved.push({kind,ref:n.note_id,area:n.activity_key,created:n.created_at,classes:source.classIds?.length?source.classIds:[source.classId||source.runId].filter(Boolean),date:source.date||'',label:n.display_name||n.filename});}
  }else{
   const rows=await officialPdfRows(repository,ids),assets=new Map();
   for(const row of rows){if(!row.asset_id)continue;if(!assets.has(row.asset_id))assets.set(row.asset_id,[]);assets.get(row.asset_id).push(row);}
   for(const [id,lessons]of assets){
    if(!lessons.some(l=>l.media_scope==='SESSION')||lessons.some(l=>l.media_scope==='COURSE'))continue;
    const asset=lessons[0],classes=new Set();
    for(const l of lessons){if(l.class_id||l.run_id)classes.add(l.class_id||l.run_id);for(const source of parse(l.source_lessons_json)||[])for(const id of source.classIds||[])classes.add(id);}
    saved.push({kind,ref:id,area:asset.activity_key,created:asset.created_at,classes:[...classes],date:asset.lesson_date||'',label:asset.display_name||asset.filename});
   }
  }
 }
 if(saved.length||updates.length)await db.batch([...saved.map(n=>p("INSERT INTO note_retention_items(item_id,kind,ref_id,activity_key,class_ids_json,lesson_date,label,created_at,next_check,delete_after) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(kind,ref_id) DO NOTHING",n.kind+':'+n.ref,n.kind,n.ref,n.area,JSON.stringify(n.classes),n.date,n.label,n.created,time,noteExpiry(n.created,policy.months))),...updates]);
 return saved.length;
}

// Class notices use only current, genuine learners. They carry no file URL,
// note body, role or access grant. The ordinary protected reader still applies.
async function warn(repository,db,item,policy,deadline,now){
 if(!(parse(item.class_ids_json)||[]).length)return false;
 const p=(sql,...v)=>statement(db,sql,...v),guard=crypto.randomUUID(),today=now.toISOString().slice(0,10),time=now.toISOString(),versionTable=repository.features.splitDatabases?'split_read_state':'academy_write_state';
 const version=(await p(`SELECT version FROM ${versionTable} WHERE singleton=1`).first()).version;

 await db.batch([
  p(`INSERT INTO academy_write_guards VALUES(?,EXISTS(SELECT 1 FROM note_retention_policy WHERE revision=?) AND EXISTS(SELECT 1 FROM note_retention_items WHERE item_id=? AND state='TRACKED') ${repository.retentionOwnerTable?"AND NOT EXISTS(SELECT 1 FROM website_platform_access_ownership WHERE activity_key=? COLLATE NOCASE AND state IN('FROZEN','STUDIO'))":''} AND (SELECT version FROM ${versionTable} WHERE singleton=1)=?)`,guard,policy.revision,item.item_id,...(repository.retentionOwnerTable?[item.activity_key]:[]),version),
  p("UPDATE note_retention_items SET state='WARNED',warned_at=?,delete_after=?,next_check=? WHERE item_id=?",time,deadline,deadline,item.item_id),
  p('DELETE FROM academy_write_guards WHERE guard_id=?',guard)
 ]);
 return Boolean(await p("SELECT 1 FROM note_retention_items WHERE item_id=? AND state='WARNED'",item.item_id).first());
}

async function purge(repository,db,item,policy,now,limit=8){
 const p=(sql,...v)=>statement(db,sql,...v),guard=crypto.randomUUID(),time=now.toISOString();
 let keys=[],versions=[],more=false;
 if(item.kind==='CLASS_NOTE')versions=(await p('SELECT version_id FROM class_note_versions WHERE note_id=? ORDER BY revision DESC LIMIT ?',item.ref_id,limit+1).all()).results;
 if(item.kind==='PDF_NOTE')versions=(await p('SELECT version_id,object_key FROM lesson_note_versions WHERE note_id=? ORDER BY version_id LIMIT ?',item.ref_id,limit+1).all()).results;
 more=versions.length>limit;versions=versions.slice(0,limit);
 if(item.kind==='PDF_NOTE')keys=versions.map(row=>lessonPdfObjectKey(row.object_key));
 if(item.kind==='SESSION_PDF'){
  const rows=await officialPdfRows(repository,[item.ref_id]);
  if(rows.some(row=>row.media_scope==='COURSE')){await db.batch([p("UPDATE note_retention_items SET state='EXEMPT' WHERE item_id=?",item.item_id),p('DELETE FROM note_retention_recipients WHERE item_id=?',item.item_id)]);return {removed:false,versions:0};}
  const asset=rows[0];if(asset?.object_key)keys=[lessonPdfObjectKey(asset.object_key)];
 }
 const writes=[p(`INSERT INTO academy_write_guards VALUES(?,EXISTS(SELECT 1 FROM note_retention_policy WHERE revision=?) AND EXISTS(SELECT 1 FROM note_retention_items WHERE item_id=? AND state=? AND delete_after<=?) ${repository.retentionOwnerTable?"AND NOT EXISTS(SELECT 1 FROM website_platform_access_ownership WHERE activity_key=? COLLATE NOCASE AND state IN('FROZEN','STUDIO'))":""})`,guard,policy.revision,item.item_id,item.state,time,...(repository.retentionOwnerTable?[item.activity_key]:[])),p("UPDATE note_retention_items SET state='PURGING',next_check=? WHERE item_id=?",time,item.item_id)];
 if(item.kind==='CLASS_NOTE'){
  if(item.state!=='PURGING')writes.push(p("UPDATE class_notes SET state='WITHDRAWN',current_version_id=NULL,revision=revision+1 WHERE note_id=?",item.ref_id));
  if(versions.length)writes.push(p('DELETE FROM class_note_versions WHERE version_id IN(SELECT value FROM json_each(?))',JSON.stringify(versions.map(v=>v.version_id))));
  if(!more)writes.push(p('DELETE FROM class_notes WHERE note_id=?',item.ref_id));
 }
 if(item.kind==='PDF_NOTE'){
  if(item.state!=='PURGING')writes.push(p("UPDATE lesson_note_entries SET state='WITHDRAWN',current_version_id=NULL,revision=revision+1 WHERE note_id=?",item.ref_id));
  if(versions.length)writes.push(p('DELETE FROM lesson_note_versions WHERE version_id IN(SELECT value FROM json_each(?))',JSON.stringify(versions.map(v=>v.version_id))));
  if(!more)writes.push(p('DELETE FROM lesson_note_entries WHERE note_id=?',item.ref_id));
 }
 writes.push(p('DELETE FROM note_retention_recipients WHERE item_id=?',item.item_id));
 if(!more)writes.push(p("UPDATE note_retention_items SET state='DELETED',deleted_at=?,label='' WHERE item_id=?",time,item.item_id));
 for(const key of new Set(keys))writes.push(p("INSERT INTO note_retention_objects VALUES(?,'PENDING',?) ON CONFLICT(object_key) DO UPDATE SET state='PENDING',updated_at=excluded.updated_at WHERE state='DELETED'",key,time));
 writes.push(p('UPDATE academy_write_state SET version=version+1 WHERE singleton=1'),p('DELETE FROM academy_write_guards WHERE guard_id=?',guard));
 await db.batch(writes);return {removed:!more,versions:versions.length};
}

async function collectObjects(repository,db,env,now){
 const bucket=env.LESSON_MEDIA_BUCKET;if(!bucket?.delete)return 0;
 const p=(sql,...v)=>statement(db,sql,...v),q=(sql,...v)=>statement(repository.db,sql,...v),defer=key=>p('UPDATE note_retention_objects SET updated_at=? WHERE object_key=?',now.toISOString(),key).run();
 const pending=await Promise.all(['PENDING','DELETING'].map(state=>p('SELECT * FROM note_retention_objects WHERE state=? ORDER BY updated_at,object_key LIMIT 5',state).all()));
 const rows=pending.flatMap(r=>r.results).sort((a,b)=>a.updated_at.localeCompare(b.updated_at)||a.object_key.localeCompare(b.object_key)).slice(0,5);
 let deleted=0;
 for(const row of rows){
  const key=row.object_key,namespace=env.ACADEMY_OBJECT_NAMESPACE||'';
  // Recovery copies and non-note media are outside this cleanup's namespace.
  if(!namespace||!key.startsWith(namespace)||!key.endsWith('.pdf')||!/^(?:lesson-pdfs|lesson-notes|lessons)\//.test(key.slice(namespace.length))){await defer(key);continue;}
  if(row.state==='PENDING'){
   const versionTable=repository.features.splitDatabases?'split_read_state':'academy_write_state',version=await p(`SELECT version FROM ${versionTable} WHERE singleton=1`).first();
   const sha=key.match(/\/([a-f0-9]{64})\.pdf$/)?.[1]||'';
   if(await p('SELECT 1 FROM lesson_note_versions WHERE object_key=? OR (?<>\'\' AND sha256=?) LIMIT 1',key,sha,sha).first()){await defer(key);continue;}
   const match=sha?sha+'.pdf':key,matchSQL=sha?'substr(object_key,-68)=?':'object_key=?';
   const refs=(await q(`SELECT asset_id FROM lesson_media_assets WHERE kind='PDF' AND ${matchSQL}`,match).all()).results;
   // Unpublished Admin attachments also retain their bytes.
   {const definitions=env.ACADEMY_ADMIN_DB?.withSession('first-primary')||db;refs.push(...(await statement(definitions,`SELECT asset_id FROM lesson_media_assets WHERE kind='PDF' AND ${matchSQL}`,match).all()).results);}
   const ids=[...new Set(refs.map(r=>r.asset_id))];
   const expired=ids.length?(await p("SELECT ref_id FROM note_retention_items WHERE kind='SESSION_PDF' AND state='DELETED' AND ref_id IN(SELECT value FROM json_each(?))",JSON.stringify(ids)).all()).results:[];
   if(ids.some(id=>!expired.some(r=>r.ref_id===id))){await defer(key);continue;}
   const guard=crypto.randomUUID();await db.batch([p(`INSERT INTO academy_write_guards VALUES(?,(SELECT version FROM ${versionTable} WHERE singleton=1)=?)`,guard,version.version),p("UPDATE note_retention_objects SET state='DELETING',updated_at=? WHERE object_key=? AND state='PENDING'",now.toISOString()+':'+crypto.randomUUID(),key),p('DELETE FROM academy_write_guards WHERE guard_id=?',guard)]);
  }
  await bucket.delete(key);
  await p("UPDATE note_retention_objects SET state='DELETED' WHERE object_key=? AND state='DELETING'",key).run();deleted++;
 }
 return deleted;
}

export const noteRetentionCron='7 * * * *';
export async function recoverNoteRetention(env,now=new Date()){
 if(env.ACADEMY_NOTE_RETENTION!=='1')return {skipped:true};
 const budget=retentionBudget(env);
 try{return {...await runRetention(budget.env,now),dbCalls:budget.state.calls};}
 catch(error){if(budget.state.exhausted)return {budgetLimited:true,dbCalls:budget.state.calls};throw error;}
}
async function runRetention(env,now){
 const db=env.ACADEMY_DB.withSession('first-primary'),p=(sql,...v)=>statement(db,sql,...v),policy=await p('SELECT * FROM note_retention_policy WHERE singleton=1').first();
 if(!policy)throw Error('Note retention needs its database upgrade.');
 const source=academyD1Repository(env);await source.ready();
 const repository=env.ACADEMY_ACCEPTED_SETUP==='1'?acceptedRepository(source,await acceptedHead(source)):source;
 repository.retentionOwnerTable=await optionalSchema(db,'SELECT activity_key FROM website_platform_access_ownership WHERE 0');
 const excluded=repository.retentionOwnerTable?(await p("SELECT activity_key FROM website_platform_access_ownership WHERE state IN('FROZEN','STUDIO')").all()).results.map(r=>r.activity_key):[];
 const found=await discover(repository,db,policy,now,excluded,env.ACADEMY_ADMIN_DB?.withSession('first-primary')||db),time=now.toISOString();
 const due=await Promise.all(['TRACKED','WARNED'].map(state=>p('SELECT * FROM note_retention_items WHERE state=? AND next_check<=? ORDER BY next_check,item_id LIMIT 20',state,time).all()));
 const continuing=(await p("SELECT * FROM note_retention_items WHERE state='PURGING' ORDER BY next_check,item_id LIMIT 4").all()).results;
 const rows=due.flatMap(r=>r.results).sort((a,b)=>a.next_check.localeCompare(b.next_check)||a.item_id.localeCompare(b.item_id)).slice(0,20-continuing.length).concat(continuing);
 let warned=0,removed=0,freshVersions=24,resumedVersions=16,versionsDeleted=0;
 for(const item of rows){
  if(excluded.some(key=>key.toUpperCase()===item.activity_key.toUpperCase())){await p('UPDATE note_retention_items SET next_check=? WHERE item_id=?',new Date(now.getTime()+day).toISOString(),item.item_id).run();continue;}
  if(item.state==='PURGING'){const result=await purge(repository,db,item,policy,now,Math.min(4,resumedVersions));resumedVersions-=result.versions;versionsDeleted+=result.versions;removed+=Number(result.removed);continue;}
  let deadline=later(noteExpiry(item.created_at,policy.months),new Date(Date.parse(policy.enabled_at)+policy.warning_days*day).toISOString(),item.warned_at?item.delete_after:null,item.warned_at?new Date(Date.parse(item.warned_at)+policy.warning_days*day).toISOString():null);
  if(item.kind!=='CLASS_NOTE'&&item.warned_at&&deadline>item.delete_after&&Date.parse(deadline)-policy.warning_days*day>now.getTime()){
   await db.batch([p("UPDATE note_retention_items SET state='TRACKED',warned_at=NULL,delete_after=?,next_check=? WHERE item_id=?",deadline,new Date(Date.parse(deadline)-policy.warning_days*day).toISOString(),item.item_id),p('DELETE FROM note_retention_recipients WHERE item_id=?',item.item_id)]);continue;
  }
  if(item.kind!=='CLASS_NOTE'&&!item.warned_at){
   if(Date.parse(deadline)-policy.warning_days*day<=now.getTime()){
    deadline=later(deadline,new Date(now.getTime()+policy.warning_days*day).toISOString());
    if(await warn(repository,db,item,policy,deadline,now)){warned++;continue;}
   }
   await p('UPDATE note_retention_items SET next_check=?,delete_after=? WHERE item_id=?',new Date(Math.max(now.getTime()+day,Date.parse(deadline)-policy.warning_days*day)).toISOString(),deadline,item.item_id).run();continue;
  }
  await p('UPDATE note_retention_items SET delete_after=? WHERE item_id=?',deadline,item.item_id).run();item.delete_after=deadline;
  if(deadline<=time){if(item.kind!=='SESSION_PDF'&&freshVersions<=0){await p('UPDATE note_retention_items SET next_check=? WHERE item_id=?',new Date(now.getTime()+3600000).toISOString(),item.item_id).run();continue;}const result=await purge(repository,db,item,policy,now,Math.min(8,freshVersions));freshVersions-=result.versions;versionsDeleted+=result.versions;removed+=Number(result.removed);}
  else await p('UPDATE note_retention_items SET next_check=? WHERE item_id=?',new Date(Math.min(Date.parse(deadline),now.getTime()+day)).toISOString(),item.item_id).run();
 }
 return {found,checked:rows.length,warned,removed,versionsDeleted,objectsDeleted:await collectObjects(repository,db,env,now)};
}
