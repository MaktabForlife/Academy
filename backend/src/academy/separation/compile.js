import {federationContext,rewriteRead} from './federation.js';
import {materializer} from './materialize.js';
import {adminTables,localMetadata,coreSetupTables,fieldOwner} from './ownership.js';
import {sourceLayout} from './layout.js';
import {targetTable,parseMutation,boundSQL} from './sql-plan.js';
import {sqlCommand} from './sql-command.js';
import {compactStatements} from './compact.js';
const s=(sql,...params)=>({sql,params}),q=n=>'"'+n+'"';
const append=(list,table,row)=>{const cols=Object.keys(row);list.push(s('INSERT INTO '+q(table)+'('+cols.map(q)+') VALUES('+cols.map(()=>'?')+')',...Object.values(row)));};
const dummy=()=>({success:true,results:[],meta:{changes:0}});
export async function compilePlan(core,admin,statements){
 const context=federationContext({core,admin,owner:'admin'}),targets=statements.map(x=>targetTable(x.sql)).filter(Boolean);
 const data=await context.snapshot(statements.map(x=>x.sql),targets),initial=structuredClone(data),mat=materializer(context,data),plan={core:[],admin:[],undo:[],finalize:[],preflight:[],outcomes:[],indexes:[],fileRefs:[]};
 const privateReads=frame=>Object.fromEntries(Object.entries(frame).filter(([n])=>adminTables.has(n)||localMetadata.has(n)));
 const rewrite=(item,frame=data)=>rewriteRead(item.sql,item.params,privateReads(frame));
 // Frozen components cross into Core only when their complete reviewed batch
 // is accepted. Current work fields are never copied back from that snapshot.
 const publication=statements.find(x=>targetTable(x.sql)==='setup_heads'&&/\bINSERT\b/i.test(x.sql));
 if(publication){
  const batchId=publication.params[2],batch=(data.setup_batches||[]).find(x=>x.batch_id===batchId),components=(data.setup_components||[]).filter(x=>x.batch_id===batchId);
  if(!batch||!components.length)throw Object.assign(Error('The reviewed publication is incomplete.'),{status:409,code:'SETUP_COMPONENT_MISSING'});
  append(plan.core,'setup_batches',{...batch,accepted_head:null});for(const c of components)append(plan.core,'setup_components',c);
  for(const component of components){const table=component.table_name,spec=sourceLayout[table];if(!spec||coreSetupTables.has(table)||!adminTables.has(table))continue;
   if(table==='lesson_media_links')plan.core.push(s("DELETE FROM lesson_media_links WHERE lesson_id IN(SELECT lesson_id FROM lesson_media_lessons WHERE activity_key=? COLLATE NOCASE) AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.lesson_id')=lesson_media_links.lesson_id AND json_extract(j.value,'$.asset_id')=lesson_media_links.asset_id)",component.scope_key,component.rows_json));
   for(const row of JSON.parse(component.rows_json)){
    const cols=Object.keys(row).filter(c=>spec.columns.includes(c)),update=cols.filter(c=>!spec.keys.includes(c)&&fieldOwner(table,c)==='admin');
    if(table==='academy_settings'&&row.setting_key==='PersonalMemorisationCards')continue;
    plan.core.push(s('INSERT INTO '+q(table)+'('+cols.map(q)+') VALUES('+cols.map(()=>'?')+') ON CONFLICT('+spec.keys.map(q)+') DO '+(update.length?'UPDATE SET '+update.map(c=>q(c)+'=excluded.'+q(c)):'NOTHING'),...cols.map(c=>row[c])));
   }
  }
 }
 plan.core=compactStatements(plan.core);let beforeBusiness=true;const preflightClears=[],preflightIds=new Set();
 for(const item of statements){
  const table=targetTable(item.sql);if(sqlCommand(item.sql)==='SELECT'){plan.indexes.push(plan.core.length);plan.outcomes.push(dummy());plan.core.push(rewrite(item));continue;}if(!table)throw Object.assign(Error('A split write needs an explicit target.'),{status:503,code:'SPLIT_PLAN_REQUIRED'});
  if(table==='operation_receipts'||table==='assessment_files'){
   const insert=parseMutation(item.sql,sourceLayout);if(insert.verb==='INSERT'){
    const query=boundSQL('SELECT '+insert.expressions.map((e,i)=>e+' AS '+q(insert.columns[i])).join(',')+' '+insert.suffix,item.params),rows=(await context.query(query.sql,query.params,data)).results;
    if(table==='assessment_files')plan.fileRefs.push(...rows.map(r=>({file_id:r.file_id})));
    else if(rows.some(r=>(initial.operation_receipts||[]).some(p=>p.dataset_key===r.dataset_key&&p.scope_key===r.scope_key&&p.operation_id===r.operation_id)))throw Object.assign(Error('academy_management_stale: the operation has already completed.'),{status:409,code:'ROW_CHANGED'});
   }
  }
  const isGuard=table==='academy_write_guards',guardInsert=isGuard&&/\bINSERT\b/i.test(item.sql);
  if(beforeBusiness&&isGuard){if(guardInsert){plan.preflight.push(rewrite(item,initial));preflightIds.add(item.params[0]);preflightClears.push(s('DELETE FROM academy_write_guards WHERE guard_id=?',item.params[0]));plan.indexes.push(-1);plan.outcomes.push(dummy());continue;}}
  else if(!isGuard)beforeBusiness=false;
  if(isGuard&&!guardInsert&&preflightIds.has(item.params[0])){plan.indexes.push(-1);plan.outcomes.push(dummy());continue;}
  let outcome=dummy(),coreIndex=-1;
  if(adminTables.has(table)){
   const lengths={core:mat.parts.core.length,admin:mat.parts.admin.length};outcome=await mat.apply(item);
   plan.core.push(...compactStatements(mat.parts.core.slice(lengths.core)));plan.admin.push(...mat.parts.admin.slice(lengths.admin));
  }else if(['setup_batches','setup_components'].includes(table)&&!publication){
   // Unaccepted immutable candidates belong to Admin only. They carry no
   // successful operation receipt until the Core admission has committed.
   plan.admin.push(item);
  }else if(localMetadata.has(table))plan.finalize.push(rewrite(item));
  else if(table==='setup_batches'&&publication){plan.core.push(item);plan.finalize.push(item);}
  else {coreIndex=plan.core.length;plan.core.push(rewrite(item,isGuard?initial:data));}
  plan.indexes.push(coreIndex);plan.outcomes.push(outcome);
 }
 plan.preflight.push(...preflightClears);plan.undo=compactStatements(mat.parts.undo);plan.admin=compactStatements(plan.admin);return plan;
}
