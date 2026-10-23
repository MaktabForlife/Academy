import {sourceLayout} from './layout.js';
import {storeColumns} from './columns.js';
import {adminTables,fieldOwner,settingOwner} from './ownership.js';
import {parseMutation,boundSQL,qualifyExpression,tokens} from './sql-plan.js';
const quote=n=>'"'+n+'"',key=(table,row)=>JSON.stringify(sourceLayout[table].keys.map(c=>String(row[c]??'').toUpperCase()));
const same=(table,a,b)=>key(table,a)===key(table,b),statement=(sql,params=[])=>({sql,params});
const pick=(row,columns)=>Object.fromEntries(columns.map(c=>[c,row[c]??null]));
function simple(expression,params,current={},incoming={}){
 const text=expression.trim();if(/^\?[0-9]+$/.test(text))return {value:params[Number(text.slice(1))-1]};if(/^NULL$/i.test(text))return {value:null};if(/^-?[0-9]+(?:\.[0-9]+)?$/.test(text))return {value:Number(text)};if(/^'(?:[^']|'')*'$/.test(text))return {value:text.slice(1,-1).replaceAll("''","'")};
 const match=text.match(/^(?:(excluded|[a-z_][a-z_0-9]*)\.)?([a-z_][a-z_0-9]*)$/i);if(match){const row=match[1]?.toLowerCase()==='excluded'?incoming:current;if(Object.hasOwn(row,match[2]))return {value:row[match[2]]};}return null;
}
function replaceVirtual(data,table,before,after){const rows=data[table]??=[],index=rows.findIndex(r=>same(table,r,before||after));if(after){if(index<0)rows.push(after);else rows[index]=after;}else if(index>=0)rows.splice(index,1);data[table]=rows;}
function rowPatch(table,keys,row,columns,{insert=false,ignore=false}={}){
 if(row===null)return statement('DELETE FROM '+quote(table)+' WHERE '+keys.map(c=>quote(c)+' IS ?').join(' AND '),keys.map(c=>columns[c]));
 const fields=Object.keys(row);if(!insert){const values=fields.filter(c=>!keys.includes(c));if(!values.length)return null;return statement('UPDATE '+quote(table)+' SET '+values.map(c=>quote(c)+'=?').join(',')+' WHERE '+keys.map(c=>quote(c)+' IS ?').join(' AND '),[...values.map(c=>row[c]),...keys.map(c=>row[c])]);}
 return statement('INSERT INTO '+quote(table)+'('+fields.map(quote).join(',')+') VALUES('+fields.map(()=>'?').join(',')+')'+(ignore?' ON CONFLICT('+keys.map(quote).join(',')+') DO NOTHING':''),Object.values(row));
}
export function materializer(context,data,{metadataOwner='admin'}={}){
 const raw=data.__splitSources||{core:{},admin:{}},parts={core:[],admin:[],undo:[]},outcomes=[];
 async function evaluate(sql,params){const bound=boundSQL(sql,params);return (await context.query(bound.sql,bound.params,data)).results;}
 async function incomingRows(plan,params){
  const spec=sourceLayout[plan.table],expressions=new Map(plan.columns.map((c,i)=>[c,plan.expressions[i]])),defaults=spec.columns.map(c=>({column:c,expression:expressions.get(c)??spec.defaults[c]??'NULL'}));
  if(!plan.suffix){const values=defaults.map(p=>simple(p.expression,params));if(values.every(Boolean))return [Object.fromEntries(defaults.map((p,i)=>[p.column,values[i].value]))];}
  return evaluate('SELECT '+defaults.map(p=>p.expression+' AS '+quote(p.column)).join(',')+' '+plan.suffix,params);
 }
 async function updatedRow(table,current,incoming,sets,params){
  const direct=sets.map(s=>simple(s.expression,params,current,incoming));if(direct.every(Boolean))return {...current,...Object.fromEntries(sets.map((s,i)=>[s.column,direct[i].value]))};
  const cols=sourceLayout[table].columns,projection=(position,alias)=>alias+' AS(SELECT '+cols.map(c=>"json_extract(?"+position+",'$."+c+"') AS "+quote(c)).join(',')+')',values=[JSON.stringify(current),JSON.stringify(incoming)];
  // Excluded and current are separate rows. Unqualified UPSERT references use
  // the current target, as SQLite does; strings and JSON paths stay literal.
  const expressions=sets.map(s=>{const bound=boundSQL(qualifyExpression(s.expression,table,cols),params);let result='',start=0,index=0;for(const t of tokens(bound.sql).filter(t=>t.type==='parameter')){result+=bound.sql.slice(start,t.start)+'?'+(values.length+1);values.push(bound.params[index++]);start=t.end;}return result+bound.sql.slice(start);});
  const query='WITH '+projection(1,table)+','+projection(2,'excluded')+' SELECT '+expressions.map((e,i)=>e+' AS '+quote(sets[i].column)).join(',')+' FROM '+quote(table)+' CROSS JOIN excluded';
  const result=await context.sources.admin.prepare(query).bind(...values).first();return {...current,...result};
 }
 function addChange(table,before,after,changed){
  const spec=sourceLayout[table],keys=spec.keys,ownerFor=c=>table==='academy_settings'?((after||before).setting_key==='PersonalMemorisationCards'?'both':String((after||before).setting_key).startsWith('AcademyWrite:')?metadataOwner:settingOwner((after||before).setting_key)):fieldOwner(table,c);
  for(const owner of ['admin','core']){
   // Accepted associations change with their head. Stable Core anchors also
   // survive deletion of an editable definition for existing work/history.
   if(owner==='core'&&(table==='lesson_media_links'||!after))continue;
   if(!storeColumns[owner][table])continue;const local=raw[owner][table]??=[],prior=local.find(r=>same(table,r,before||after))||null,physical=storeColumns[owner][table];
   if(table==='academy_settings'&&owner!==ownerFor('setting_value')&&ownerFor('setting_value')!=='both')continue;
   if(!after){if(!prior)continue;const op=rowPatch(table,keys,null,before);parts[owner].push(op);if(owner==='admin')parts.undo.unshift(rowPatch(table,keys,prior,null,{insert:true}));replaceVirtual(raw[owner],table,prior,null);continue;}
   const own=physical.filter(c=>!keys.includes(c)&&(ownerFor(c)===owner||ownerFor(c)==='both')),fields=changed.filter(c=>own.includes(c));
   if(owner==='core'&&before&&!fields.length)continue;
   if(!prior){let values=pick(after,physical);if(table==='academy_settings'&&String(after.setting_key).startsWith('AcademyWrite:'))values.setting_value=String(Number(after.setting_value)-Number(before?.setting_value||0));if(owner==='core'&&adminTables.has(table)&&table!=='academy_settings')values=Object.fromEntries(physical.map(c=>[c,keys.includes(c)||spec.referenceColumns.includes(c)||fieldOwner(table,c)==='core'?after[c]??null:null]));
    parts[owner].push(rowPatch(table,keys,values,null,{insert:true,ignore:owner==='core'}));if(owner==='admin'){const undo=statement('DELETE FROM '+quote(table)+' WHERE '+keys.map(c=>quote(c)+' IS ?').join(' AND '),keys.map(c=>after[c]));parts.undo.unshift(undo);}replaceVirtual(raw[owner],table,null,values);
   }else if(fields.length){let values={...pick(after,keys),...pick(after,fields)};
    if(table==='academy_settings'&&String(after.setting_key).startsWith('AcademyWrite:'))values.setting_value=String(Number(prior.setting_value||0)+Number(after.setting_value)-Number(before?.setting_value||0));
    parts[owner].push(rowPatch(table,keys,values));if(owner==='admin')parts.undo.unshift(rowPatch(table,keys,{...pick(prior,keys),...pick(prior,fields)}));replaceVirtual(raw[owner],table,prior,{...prior,...values});
   }
  }
  replaceVirtual(data,table,before,after);
 }
 async function apply(original){
  const plan=parseMutation(original.sql,sourceLayout),table=plan.table,spec=sourceLayout[table],params=original.params;let changes=0;
  if(plan.sets?.some(s=>spec.keys.includes(s.column)))throw Object.assign(Error('Changing a definition identifier requires an explicit owner plan.'),{status:409,code:'SPLIT_IDENTIFIER_CHANGE'});
  if(plan.verb==='INSERT')for(const input of await incomingRows(plan,params)){
   const existing=(data[table]||[]).find(row=>plan.conflictKeys.every(c=>String(row[c]??'').toUpperCase()===String(input[c]??'').toUpperCase()));let after=input;
   if(existing){if(!plan.hasConflict&&!plan.ignore)throw Object.assign(Error('A definition with this identifier already exists.'),{status:409,code:'ROW_CHANGED'});if(plan.ignore&&!plan.sets.length)continue;after=await updatedRow(table,existing,input,plan.sets,params);}
   addChange(table,existing||null,after,existing?plan.sets.map(s=>s.column):spec.columns);changes++;
  }else{
   const alias=plan.alias,selected=spec.keys.map(c=>alias+'.'+quote(c)+' AS '+quote(c)),expressions=plan.verb==='UPDATE'?plan.sets.map(s=>s.expression+' AS '+quote('__new_'+s.column)):[];
   const rows=await evaluate('SELECT '+[...selected,...expressions].join(',')+' FROM '+table+(alias!==table?' AS '+alias:'')+(plan.from?', '+plan.from:'')+' WHERE '+plan.where,params);
   for(const row of rows){const before=(data[table]||[]).find(old=>same(table,old,row));if(!before)throw Error('Definition predicate changed during planning.');const after=plan.verb==='DELETE'?null:{...before,...Object.fromEntries(plan.sets.map(s=>[s.column,row['__new_'+s.column]]))};addChange(table,before,after,plan.sets?.map(s=>s.column)||spec.columns);changes++;}
  }
  const result={success:true,results:[],meta:{changes}};outcomes.push(result);return result;
 }
 return {apply,parts,outcomes};
}
