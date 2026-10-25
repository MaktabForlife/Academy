import {setupSchema} from '../d1/setup-schema.js';
import {jsonRowSQL} from '../d1/json-row.js';
import {storeColumns} from './columns.js';
import {sourceLayout} from './layout.js';
import {emptyShapes} from './empty-shapes.js';
import {sqlCommand} from './sql-command.js';
import {tokens,indexedSQL,boundSQL} from './sql-plan.js';
import {adminTables,liveColumns,settingOwner,localMetadata} from './ownership.js';
const computed={effective_activity_roles:['assignment_id','account_id','activity_key','role'],effective_course_subscriptions:['account_id','activity_key'],legacy_access_evidence:['account_id','activity_key','source_role','source_effective'],role_import_reviews:['review_id','account_id','activity_key','source_value','proposed_role','status','source_locator','note','reviewed_by_account_id','reviewed_at'],role_mapping_decisions:['source_role','target_role']};
const known=new Set([...Object.keys(storeColumns.core),...Object.keys(storeColumns.admin),...Object.keys(emptyShapes),...Object.keys(computed)]),literal=v=>"'"+v.replaceAll("'","''")+"'",upper=v=>String(v??'').toUpperCase();
const identifier=t=>t&&['word','quoted'].includes(t.type)?t.text.replace(/^["`\[]|["`\]]$/g,'').toLowerCase():null;
export function readReferences(sql){
 const list=tokens(sql),local=new Set(),found=new Set(),references=[];
 for(let i=0;i<list.length;i++)if(identifier(list[i])&&list[i+1]?.text.toUpperCase()==='AS'&&list[i+2]?.text==='(')local.add(identifier(list[i]));
 for(let i=0;i<list.length;i++)if(['FROM','JOIN'].includes(list[i].text.toUpperCase())){
  let j=i+1,main=false;if(identifier(list[j])==='main'&&list[j+1]?.text==='.'){main=true;j+=2;}
  const n=identifier(list[j]);if(known.has(n)&&(main||!local.has(n))){found.add(n);references.push({name:n,start:list[i+1].start,end:list[j].end});}
 }
 return {found,local,references,list};
}
const prefix=(sql,ctes)=>{const list=tokens(sql);if(list[0]?.text.toUpperCase()!=='WITH')return 'WITH '+ctes+' '+sql;const end=(list[1]?.text.toUpperCase()==='RECURSIVE'?list[1]:list[0]).end;return sql.slice(0,end)+' '+ctes+', '+sql.slice(end).trimStart();};
export function rewriteRead(original,params,data){
 const bound=boundSQL(indexedSQL(original),params),sql=bound.sql,{found,local,references,list}=readReferences(sql),names=[...found].filter(n=>Object.hasOwn(data,n));if(!names.length)return bound;
 const selected=new Set(names),joined=names.length>1||names.some(n=>references.filter(r=>r.name===n).length>1),ctes=names.map(n=>{const cols=sourceLayout[n]?.columns||storeColumns.core[n]||computed[n]||emptyShapes[n];return '__split_read_'+n+' AS '+(joined?'MATERIALIZED ':'')+'(SELECT '+cols.map(c=>"json_extract(value,'$."+c+"')"+(setupSchema[n]?.nocase?.includes(c)?' COLLATE NOCASE':'')+' AS "'+c+'"').join(',')+' FROM json_each(?))';});
 const edits=references.filter(r=>selected.has(r.name)).map(r=>({...r,text:'__split_read_'+r.name}));
 for(let i=0;i<list.length;i++){
  const n=identifier(list[i]);if(n==='main'&&list[i+1]?.text==='.'&&selected.has(identifier(list[i+2]))&&list[i+3]?.text==='.'){
   edits.push({start:list[i].start,end:list[i+2].end,text:'__split_read_'+identifier(list[i+2])});i+=2;
  }else if(selected.has(n)&&!local.has(n)&&list[i+1]?.text==='.'&&list[i-1]?.text!=='.')edits.push({start:list[i].start,end:list[i].end,text:'__split_read_'+n});
 }
 let result='',at=0;for(const edit of edits.sort((a,b)=>a.start-b.start||b.end-a.end)){if(edit.start<at)continue;result+=sql.slice(at,edit.start)+edit.text;at=edit.end;}result+=sql.slice(at);
 return {sql:prefix(result,ctes.join(',')),params:[...names.map(n=>JSON.stringify(data[n])),...bound.params]};
}
export function federationContext({core,admin,owner='admin'}){
 const sources={core,admin};
 async function capture(store,names){
  names=[...new Set(names)].filter(n=>storeColumns[store][n]||store==='core'&&(computed[n]||emptyShapes[n]));if(!names.length)return {};
  const parts=names.map(n=>{const cols=storeColumns[store][n]||computed[n]||emptyShapes[n],row=n==='account_credentials'?"json_object('account_id',account_id,'pin_hash',CASE WHEN length(trim(pin_hash))>0 THEN 'VERIFIED' ELSE '' END,'pin_setup',pin_setup,'credential_epoch',credential_epoch)":jsonRowSQL(cols);return '('+literal(n)+',(SELECT json_group_array('+row+') FROM '+n+'))';});
  const result=await sources[store].prepare('WITH split_capture(name,data) AS(VALUES '+parts.join(',')+') SELECT name,data FROM split_capture').all();return Object.fromEntries(result.results.map(r=>[r.name,JSON.parse(r.data)]));
 }
 async function snapshot(sqls,extra=[]){
  const needs=new Set([...extra,...sqls.flatMap(s=>[...readReferences(s).found])]),cn=new Set(),an=new Set();
  for(const n of needs){if(owner==='admin'){if(adminTables.has(n)||localMetadata.has(n)||['setup_components','setup_batches'].includes(n))an.add(n);cn.add(n);}else if(['academy_settings','operation_receipts'].includes(n)){cn.add(n);an.add(n);}else if(n==='assessments'&&/main\.assessments\s+current\b/i.test(sqls.join('\n'))){cn.add(n);an.add(n);}}
  const [c,a]=await Promise.all([capture('core',[...cn]),capture('admin',[...an])]),data={};
  for(const n of needs){
   if(owner==='core'&&!an.has(n))continue;
   if(n==='academy_settings'){
    const map=new Map((c[n]||[]).map(r=>[r.setting_key,{...r}]));for(const row of a[n]||[]){const previous=map.get(row.setting_key);if(row.setting_key.startsWith('AcademyWrite:'))map.set(row.setting_key,{...row,setting_value:String(Number(row.setting_value)+Number(previous?.setting_value||0))});else if(owner==='admin'&&settingOwner(row.setting_key)==='admin')map.set(row.setting_key,row.setting_key==='PersonalMemorisationCards'&&previous?{...row,setting_value:previous.setting_value}:row);}data[n]=[...map.values()];continue;
   }
   if(['setup_components','setup_batches','operation_receipts'].includes(n)){
    const signature=r=>n==='operation_receipts'?[r.dataset_key,r.scope_key,r.operation_id].join('|'):r[n==='setup_components'?'component_id':'batch_id'],map=new Map((c[n]||[]).map(r=>[signature(r),r]));for(const row of a[n]||[])map.set(signature(row),n==='setup_batches'?{...row,accepted_head:(c[n]||[]).find(r=>r.batch_id===row.batch_id)?.accepted_head||null}:row);data[n]=[...map.values()];continue;
   }
   if(localMetadata.has(n)){const spec=sourceLayout[n],key=r=>JSON.stringify(spec.keys.map(k=>r[k])),map=new Map((c[n]||[]).map(r=>[key(r),r]));for(const row of a[n]||[])map.set(key(row),row);data[n]=[...map.values()];continue;}
   if(adminTables.has(n)){
    const spec=sourceLayout[n],factColumns=liveColumns(n);data[n]=(a[n]||[]).map(row=>{const current=(c[n]||[]).find(r=>spec.keys.every(k=>upper(r[k])===upper(row[k])));return {...current,...row,...(current?Object.fromEntries(factColumns.map(k=>[k,current[k]])):{} )};});
   }else data[n]=c[n]||[];
  }
  data.__splitSources={core:c,admin:a};return data;
 }
 async function query(sql,params,data){const compiled=rewriteRead(sql,params,data);return sources[owner].prepare(compiled.sql).bind(...compiled.params).all();}
 return {sources,capture,snapshot,query};
}
export function federatedDatabase({core,admin,owner='core',mutate=null,read=null}){
 const context=federationContext({core,admin,owner});
 async function execute(statements){if(statements.some(s=>sqlCommand(s.sql)!=='SELECT'))throw Object.assign(Error('Split writes require their owner transaction.'),{status:503,code:'SPLIT_WRITES_PREPARING'});if(read&&(owner==='admin'||statements.some(s=>/main\.assessments\s+current\b|\b(?:FROM|JOIN)\s+operation_receipts\b/i.test(s.sql))))return read(statements,owner);const data=await context.snapshot(statements.map(s=>s.sql));return context.sources[owner].batch(statements.map(s=>{const r=rewriteRead(s.sql,s.params,data);return context.sources[owner].prepare(r.sql).bind(...r.params);}));}
 const missing=()=>{throw Object.assign(Error('Fresh-store writes await their verified owner protocol.'),{status:503,code:'SPLIT_WRITES_PREPARING'});};
 const binding={splitGeneration:'SPLIT_V1',prepare(sql){let params=[];const s={sql,get params(){return params;},bind(...v){params=v;return s;},async all(){if(sqlCommand(sql)==='SELECT')return(await execute([s]))[0];return(await mutateOrFail([s]))[0];},async first(column){const row=(await s.all()).results[0]||null;return column?row?.[column]??null:row;},async run(){return(await mutateOrFail([s]))[0];}};return s;},async batch(statements){return statements.every(s=>sqlCommand(s.sql)==='SELECT')?execute(statements):mutateOrFail(statements);}};
 async function mutateOrFail(statements){if(!mutate)return missing();return mutate(statements.map(s=>({sql:s.sql,params:s.params})),owner);}
 return binding;
}
