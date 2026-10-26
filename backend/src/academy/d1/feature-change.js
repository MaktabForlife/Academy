import {setupSchema} from './setup-schema.js';
import {definitionSettingsSQL} from './setup-reader.js';
import {jsonRowSQL} from './json-row.js';
import {targetTable,parseMutation,tokens} from '../separation/sql-plan.js';
import {sourceLayout} from '../separation/layout.js';
import {rehearsalError as fail} from './repository.js';
import {isAdminWorkspace} from './workspace-access.js';

// A normal Save confirms only the rows/columns in its server-authored owner
// plan. Capture their exact keys before mutation, including no-change retries,
// so existing private drafts can be saved without accepting other editors' work.
export async function prepareFeatureChange(repository,auth,{dataset,scope,operationId,statements,describe,scopes=[scope],enabled=true,fullRows=false,entities={}}){
 if(!repository.setup?.enabled||!isAdminWorkspace(auth)||!enabled)return null;
 const mutations=statements.map(describe).filter(s=>s&&setupSchema[targetTable(s.sql)]).map(s=>({...s,plan:parseMutation(s.sql,sourceLayout)}));
 const names=[...new Set([...mutations.map(s=>s.plan.table),...Object.keys(entities)].filter(t=>setupSchema[t]))];if(!names.length)return null;
 const db=repository.db,p=(sql,...values)=>db.prepare(sql).bind(...values),selection=[...new Set(scopes.map(s=>String(s).toUpperCase()))],bindings=JSON.stringify(mutations.map(s=>s.values));
 const inputSQL=(sql,index)=>{let out='',start=0;for(const t of tokens(sql).filter(t=>t.type==='parameter')){out+=sql.slice(start,t.start)+`json_extract((SELECT data FROM feature_input),'$[${index}][${Number(t.text.slice(1))-1}]')`;start=t.end;}return out+sql.slice(start);};
 const targets=mutations.map(({plan},index)=>{
  const spec=setupSchema[plan.table],alias=plan.alias||plan.table,fields=plan.verb==='INSERT'?(plan.sets.length?plan.sets.map(s=>s.column):plan.columns):plan.verb==='UPDATE'?plan.sets.map(s=>s.column):spec.columns;
  let query;
  if(plan.verb==='INSERT'){
   if(spec.keys.some(k=>!plan.columns.includes(k)))throw fail('This saved change needs a complete identifier.',409,'CHANGE_IDENTIFIER_REQUIRED');
   query='SELECT '+spec.keys.map(k=>plan.expressions[plan.columns.indexOf(k)]+' AS "'+k+'"').join(',')+' '+plan.suffix;
  }else query='SELECT '+spec.keys.map(k=>alias+'."'+k+'" AS "'+k+'"').join(',')+' FROM '+plan.table+(alias!==plan.table?' AS '+alias:'')+(plan.from?', '+plan.from:'')+' WHERE '+plan.where;
  return `('${plan.table}','${JSON.stringify(fields)}',(SELECT json_group_array(${jsonRowSQL(spec.keys)}) FROM (${inputSQL(query,index)})))`;
 });
 const scopeFilter=name=>selection.includes('GLOBAL')?'':` AND UPPER(${setupSchema[name].scope}) IN(SELECT value FROM json_each(?))`;
 const match=(name,row,keys)=>setupSchema[name].keys.map(k=>`${row}${k.includes('.')?k:'.'+k} IS json_extract(${keys},'$.${k}')${setupSchema[name].nocase?.includes(k)?' COLLATE NOCASE':''}`).join(' AND ');
 const scopeExpression=name=>setupSchema[name].scope;
 const rows=(name,pre)=>`SELECT json_object('scope',${scopeExpression(name)},'row',json(${jsonRowSQL(setupSchema[name].columns)})) row_json FROM ${name} WHERE ${name==='academy_settings'?'('+definitionSettingsSQL+')':'1'}${scopeFilter(name)} AND ${entities[name]?'('+entities[name].sql+')':`EXISTS(SELECT 1 FROM ${pre?'targets':'confirmed'} c,json_each(c.keys_json) k WHERE c.table_name='${name}' AND ${match(name,name,'k.value')})`}`;
 const values=()=>names.flatMap(name=>[...(scopeFilter(name)?[JSON.stringify(selection)]:[]),...(entities[name]?.values||[])]);
 const targetCTE=targets.length?`targets(table_name,fields_json,keys_json) AS MATERIALIZED(VALUES ${targets.join(',')})`:'targets(table_name,fields_json,keys_json) AS(SELECT NULL,NULL,NULL WHERE 0)';
 const captured=(await p(`WITH feature_input AS MATERIALIZED(SELECT ? data),${targetCTE},captured(table_name,rows_json) AS(VALUES ${names.map(name=>`('${name}',(SELECT json_group_array(json(row_json)) FROM (${rows(name,true)})))`).join(',')}) SELECT table_name,rows_json,(SELECT version FROM academy_write_state WHERE singleton=1) source_version,(SELECT json_group_array(json_object('table',table_name,'fields',json(fields_json),'keys',json(keys_json))) FROM targets) confirmations_json FROM captured`,bindings,...values()).all()).results;
 const before=JSON.stringify({tables:captured.map(r=>({table:r.table_name,rows:JSON.parse(r.rows_json)})),confirmations:JSON.parse(captured[0].confirmations_json)});
 if(new TextEncoder().encode(before).length>1500000)throw fail('Save a smaller group of related changes.',413,'CHANGE_TOO_LARGE');
 const version=captured[0].source_version,reference={dataset,scope,operationId};
 return {reference,version,receipt(result){
  const after=names.map(name=>`SELECT '${name}' table_name,row_json FROM (${rows(name,false)})`).join(' UNION ALL ');
  // Confirmed rows also include unchanged fields explicitly present in Save.
  const expression=`(WITH captured_before AS MATERIALIZED(SELECT ? payload),confirmed AS MATERIALIZED(SELECT json_extract(value,'$.table') table_name,json_extract(value,'$.keys') keys_json FROM captured_before,json_each(payload,'$.confirmations')),previous AS MATERIALIZED(SELECT json_extract(t.value,'$.table') table_name,r.value row_json FROM captured_before,json_each(payload,'$.tables') t,json_each(t.value,'$.rows') r),current AS MATERIALIZED(${after}),changed AS(SELECT table_name FROM previous UNION SELECT table_name FROM current) SELECT json_set(?,'$._acceptedChange',json_object('sourceVersion',?,'scopes',json(?),'fullRows',${Number(fullRows)},'confirmations',json((SELECT json_extract(payload,'$.confirmations') FROM captured_before)),'tables',json((SELECT json_group_array(json_object('table',t.table_name,'before',json((SELECT json_group_array(json(b.row_json)) FROM previous b WHERE b.table_name=t.table_name)),'after',json((SELECT json_group_array(json(a.row_json)) FROM current a WHERE a.table_name=t.table_name)))) FROM changed t)))))`;
  return {expression,values:[before,...values(),JSON.stringify(result),version+1,JSON.stringify(selection)]};
 }};
}
