import {sqlCommand} from './sql-command.js';
const fail=()=>{throw Object.assign(Error('This statement needs an explicit split owner plan.'),{status:503,code:'SPLIT_PLAN_REQUIRED'});};
// Server-authored statements only. Quoted strings and nested expressions are
// never searched/replaced as SQL identifiers or parameter markers.
export function tokens(sql){
 const result=[];let depth=0;
 for(let i=0;i<sql.length;){const start=i,ch=sql[i];
  if(/\s/.test(ch)){i++;continue;}
  if(sql.slice(i,i+2)==='--'){const end=sql.indexOf('\n',i+2);i=end<0?sql.length:end+1;continue;}
  if(sql.slice(i,i+2)==='/*'){const end=sql.indexOf('*/',i+2);if(end<0)fail();i=end+2;continue;}
  if(["'",'"','`','['].includes(ch)){const end=ch==='['?']':ch;i++;while(i<sql.length){if(sql[i]===end){i++;if(sql[i]===end&&end!==']'){i++;continue;}break;}i++;}result.push({start,end:i,text:sql.slice(start,i),type:ch==="'"?'string':'quoted',depth});continue;}
  if(ch==='('){result.push({start,end:++i,text:ch,type:'punct',depth});depth++;continue;}if(ch===')'){depth--;result.push({start,end:++i,text:ch,type:'punct',depth});continue;}
  const match=sql.slice(i).match(/^(?:[a-z_][a-z_0-9]*|\?[0-9]*|[0-9]+(?:\.[0-9]+)?)/i);const text=match?match[0]:ch;i+=text.length;result.push({start,end:i,text,type:text[0]==='?'?'parameter':/^[a-z_]/i.test(text)?'word':'punct',depth});
 }if(depth!==0)fail();return result;
}
export function splitSQL(sql){const commas=tokens(sql).filter(t=>t.depth===0&&t.text===','),parts=[];let start=0;for(const t of commas){parts.push(sql.slice(start,t.start).trim());start=t.end;}parts.push(sql.slice(start).trim());return parts;}
export function indexedSQL(sql){let count=0,result='',start=0;for(const t of tokens(sql).filter(t=>t.type==='parameter')){const index=t.text.length>1?Number(t.text.slice(1)):count+1;count=Math.max(count,index);result+=sql.slice(start,t.start)+'?'+index;start=t.end;}return result+sql.slice(start);}
export function boundSQL(sql,params){let start=0,result='';const values=[];for(const t of tokens(sql).filter(t=>t.type==='parameter')){const index=Number(t.text.slice(1));if(!index||index>params.length)fail();result+=sql.slice(start,t.start)+'?';values.push(params[index-1]);start=t.end;}return {sql:result+sql.slice(start),params:values};}
const name=value=>{const n=value.replace(/^["`\[]|["`\]]$/g,'').toLowerCase();if(!/^[a-z_][a-z_0-9]*$/.test(n))fail();return n;};
export function targetTable(sql){const verb=sqlCommand(sql),start=tokens(sql).find(t=>t.depth===0&&t.text.toUpperCase()===verb)?.start;if(start===undefined)return null;return sql.slice(start).match(/^\s*(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+(?:main\.)?["`]?([a-z_][a-z_0-9]*)/i)?.[1]?.toLowerCase()||null;}
function assignments(sql){return splitSQL(sql).map(part=>{const list=tokens(part),equal=list.find(t=>t.depth===0&&t.text==='=');if(!equal)fail();const column=name(part.slice(0,equal.start).trim().split('.').at(-1));return {column,expression:part.slice(equal.end).trim()};});}
export function parseMutation(original,layout){
 const sql=indexedSQL(original),verb=sqlCommand(sql),table=targetTable(sql);if(!table||!layout[table])fail();const top=tokens(sql).filter(t=>t.depth===0),keyword=(word,after=0)=>top.find(t=>t.start>=after&&t.text.toUpperCase()===word);
 if(verb==='UPDATE'){
  const set=keyword('SET');if(!set)fail();const from=keyword('FROM',set.end),where=keyword('WHERE',set.end),end=Math.min(...[from?.start,where?.start,sql.length].filter(v=>v!==undefined));
  const target=sql.slice(keyword('UPDATE').end,set.start).trim(),alias=target.match(/\s+(?:AS\s+)?([a-z_][a-z_0-9]*)$/i)?.[1]||table;
  return {verb,table,sql,alias,sets:assignments(sql.slice(set.end,end)),from:from?sql.slice(from.end,where?.start??sql.length).trim():'',where:where?sql.slice(where.end).trim():'1'};
 }
 if(verb==='DELETE'){const from=keyword('FROM'),where=keyword('WHERE',from.end);return {verb,table,sql,alias:table,where:where?sql.slice(where.end).trim():'1'};}
 if(verb!=='INSERT'&&verb!=='REPLACE')fail();
 const into=keyword('INTO');let index=top.findIndex(t=>t.start>=into.end&&name(t.text)===table),after=top[index].end,columns=layout[table].columns;
 const opening=top[index+1];if(opening?.text==='('){const close=top[index+2];if(close?.text!==')')fail();columns=splitSQL(sql.slice(opening.end,close.start)).map(name);after=close.end;}
 const conflict=top.find((t,i)=>t.start>=after&&t.text.toUpperCase()==='ON'&&top[i+1]?.text.toUpperCase()==='CONFLICT'),body=sql.slice(after,conflict?.start??sql.length).trim();let expressions=[],suffix='';
 if(/^VALUES\b/i.test(body)){const start=body.indexOf('('),end=body.lastIndexOf(')');if(start<0||end<0)fail();expressions=splitSQL(body.slice(start+1,end));}
 else if(/^SELECT\b/i.test(body)){const from=tokens(body).find(t=>t.depth===0&&t.text.toUpperCase()==='FROM');expressions=splitSQL(body.slice(6,from?.start??body.length));suffix=from?body.slice(from.start):'';}
 else fail();if(expressions.length!==columns.length)fail();
 let sets=[],conflictKeys=layout[table].keys,ignore=/\bOR IGNORE\b/i.test(sql);
 if(conflict){const tail=sql.slice(conflict.end),set=tokens(tail).find(t=>t.depth===0&&t.text.toUpperCase()==='SET'),keyMatch=tail.match(/^\s*\(([^)]+)\)/);if(keyMatch)conflictKeys=splitSQL(keyMatch[1]).map(name);if(set)sets=assignments(tail.slice(set.end));else ignore=true;}
 return {verb:'INSERT',table,sql,columns,expressions,suffix,sets,conflictKeys,hasConflict:Boolean(conflict),ignore};
}
export function qualifyExpression(expression,table,columns){
 const list=tokens(expression),set=new Set(columns);let output='',start=0;for(let i=0;i<list.length;i++){const t=list[i],column=t.type==='word'?t.text.toLowerCase():null;if(!column||!set.has(column)||list[i-1]?.text==='.'||list[i+1]?.text==='.'||list[i+1]?.text==='(')continue;output+=expression.slice(start,t.start)+table+'.'+t.text;start=t.end;}return output+expression.slice(start);
}
