import {setupSchema,privateSetupTables} from '../d1/setup-schema.js';
import {jsonRowSQL} from '../d1/json-row.js';
import {storeColumns} from './columns.js';
import {emptyShapes} from './empty-shapes.js';
import {sqlCommand} from './sql-command.js';
const masters=new Set([...Object.keys(setupSchema),...privateSetupTables]),key=value=>String(value??'').toUpperCase();
const computedColumns={effective_activity_roles:['assignment_id','account_id','activity_key','role'],effective_course_subscriptions:['account_id','activity_key'],legacy_access_evidence:['account_id','activity_key','source_role','source_effective'],role_import_reviews:['review_id','account_id','activity_key','source_value','proposed_role','status','source_locator','note','reviewed_by_account_id','reviewed_at'],role_mapping_decisions:['source_role','target_role']};
const known=new Set([...Object.keys(storeColumns.core),...Object.keys(storeColumns.admin),...Object.keys(emptyShapes),...Object.keys(computedColumns)]);
const literal=v=>"'"+v.replaceAll("'","''")+"'";
function references(sql){const found=new Set(),local=new Set([...sql.matchAll(/\b([a-z_][a-z_0-9]*)\s+AS\s*\(/gi)].map(m=>m[1].toLowerCase()));for(const m of sql.matchAll(/\b(?:FROM|JOIN)\s+(main\.)?([a-z_][a-z_0-9]*)\b/gi)){const name=m[2].toLowerCase();if(known.has(name)&&(m[1]||!local.has(name)))found.add(name);}return {found,local};}
function prefix(sql,ctes){return /^\s*WITH\b/i.test(sql)?sql.replace(/^\s*WITH(\s+RECURSIVE)?\s+/i,(_,recursive)=>'WITH'+(recursive||'')+' '+ctes+', '):'WITH '+ctes+' '+sql;}
export function federatedDatabase({core,admin,owner='core',mutate=null}){
 const sources={core,admin};
 async function capture(store,names){
  if(!names.length)return {};
  const parts=names.map(name=>{
   const columns=computedColumns[name]||storeColumns[store][name]||emptyShapes[name];if(!columns)throw Error('Unknown target data shape: '+name);
   const row=name==='account_credentials'?"json_object('account_id',account_id,'pin_hash',CASE WHEN length(trim(pin_hash))>0 THEN 'VERIFIED' ELSE '' END,'pin_setup',pin_setup,'credential_epoch',credential_epoch)":jsonRowSQL(columns);
   return '('+literal(name)+',(SELECT json_group_array('+row+') FROM '+name+'))';
  });
  const result=await sources[store].prepare('WITH split_capture(name,data) AS(VALUES '+parts.join(',')+') SELECT name,data FROM split_capture').all();return Object.fromEntries(result.results.map(r=>[r.name,JSON.parse(r.data)]));
 }
 async function frames(sqls){
  const needs=new Set(sqls.flatMap(sql=>[...references(sql).found])),coreNames=new Set(),adminNames=new Set();
  for(const name of needs){
   if(owner==='admin'){
    if(masters.has(name)||['setup_components','setup_batches'].includes(name))adminNames.add(name);
    if(!masters.has(name)||setupSchema[name]?.live?.length||setupSchema[name]?.columns.includes('active')||['academy_settings','setup_components','setup_batches'].includes(name))coreNames.add(name);
   }else if(/main\.assessments\s+current\b/i.test(sqls.join('\n'))&&name==='assessments'){adminNames.add(name);coreNames.add(name);}
  }
  for(const name of [...coreNames])if(!storeColumns.core[name]&&!computedColumns[name])coreNames.delete(name);
  const [coreRows,adminRows]=await Promise.all([capture('core',[...coreNames]),capture('admin',[...adminNames])]),data={};
  for(const name of needs){
   if(owner==='core'&&!adminNames.has(name))continue;
   if(name==='academy_settings'){
    const map=new Map((coreRows[name]||[]).map(r=>[r.setting_key,{...r}]));for(const row of adminRows[name]||[]){const existing=map.get(row.setting_key);if(row.setting_key.startsWith('AcademyWrite:')&&existing)map.set(row.setting_key,{...row,setting_value:String(Number(row.setting_value)+Number(existing.setting_value))});else map.set(row.setting_key,row);}data[name]=[...map.values()];continue;
   }
   if(['setup_components','setup_batches'].includes(name)){
    const pk=name==='setup_components'?'component_id':'batch_id',map=new Map((coreRows[name]||[]).map(r=>[r[pk],r]));for(const row of adminRows[name]||[])map.set(row[pk],name==='setup_batches'?{...row,accepted_head:(coreRows[name]||[]).find(c=>c[pk]===row[pk])?.accepted_head||null}:row);data[name]=[...map.values()];continue;
   }
   if(masters.has(name)){
    const spec=setupSchema[name],live=spec?[...new Set([...(spec.live||[]),...(spec.columns.includes('active')?['active']:[])])]:[];
    data[name]=(adminRows[name]||[]).map(row=>{const current=(coreRows[name]||[]).find(c=>spec?.keys.every(k=>key(c[k])===key(row[k])));return current?{...row,...Object.fromEntries(live.map(k=>[k,current[k]]))}:row;});
   }else data[name]=coreRows[name]||[];
  }
  return data;
 }
 function rewrite(sql,params,data){
  const {found,local}=references(sql),names=[...found].filter(name=>Object.hasOwn(data,name));if(!names.length)return {sql,params};
  const ctes=names.map(name=>{const columns=storeColumns[owner][name]||storeColumns.core[name]||computedColumns[name]||emptyShapes[name];return '__split_read_'+name+' AS(SELECT '+columns.map(c=>"json_extract(value,'$."+c+"') AS \""+c+'\"').join(',')+' FROM json_each(?))';});
  let result=sql;for(const name of names){result=result.replace(new RegExp('\\b(FROM|JOIN)\\s+(main\\.)?'+name+'\\b','gi'),(whole,verb,main)=>!main&&local.has(name)?whole:verb+' __split_read_'+name);result=result.replace(new RegExp('\\bmain\\.'+name+'\\.','gi'),'__split_read_'+name+'.');if(!local.has(name))result=result.replace(new RegExp('\\b'+name+'\\.','gi'),'__split_read_'+name+'.');}
  return {sql:prefix(result,ctes.join(',')),params:[...names.map(n=>JSON.stringify(data[n])),...params]};
 }
 async function read(statements){if(statements.some(s=>sqlCommand(s.sql)!=='SELECT'))throw Object.assign(Error('Only reads are available during split preparation.'),{status:503,code:'SPLIT_WRITES_PREPARING'});const data=await frames(statements.map(s=>s.sql));return sources[owner].batch(statements.map(s=>{const r=rewrite(s.sql,s.params,data);return sources[owner].prepare(r.sql).bind(...r.params);}));}
 const binding={splitGeneration:'SPLIT_V1',prepare(sql){let params=[];const statement={sql,get params(){return params;},bind(...values){params=values;return statement;},async all(){return (await read([statement]))[0];},async first(column){const row=(await statement.all()).results[0]||null;return column?row?.[column]??null:row;},async run(){if(!mutate)throw Object.assign(Error('Fresh-store writes are awaiting the verified owner protocol.'),{status:503,code:'SPLIT_WRITES_PREPARING'});return (await mutate([statement],{owner,frames,rewrite,sources}))[0];}};return statement;},async batch(statements){if(statements.every(s=>sqlCommand(s.sql)==='SELECT'))return read(statements);if(!mutate)throw Object.assign(Error('Fresh-store writes are awaiting the verified owner protocol.'),{status:503,code:'SPLIT_WRITES_PREPARING'});return mutate(statements,{owner,frames,rewrite,sources});}};
 return binding;
}
