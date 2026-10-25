import {tokens} from '../separation/sql-plan.js';

// Only independent class plans use this helper. Keep the first occurrence's
// dependency order, while sending each repeated class statement as one SQL
// operation. The private split coordinator and its recovery protocol are unchanged.
export function assessmentBatch(statements,describe,prepare){
 const groups=new Map();
 for(const statement of statements){const entry=describe(statement);if(!entry)throw Error('Missing assessment statement metadata.');if(!groups.has(entry.sql))groups.set(entry.sql,[]);groups.get(entry.sql).push({...entry,statement});}
 return [...groups.values()].map(rows=>{
  if(rows.length===1)return rows[0].statement;
  const {sql}=rows[0],list=tokens(sql),top=list.filter(t=>t.depth===0),verb=top[0]?.text.toUpperCase(),params=rows.map(r=>r.values);
  const bound=fragment=>{let output='',start=0;for(const t of tokens(fragment).filter(t=>t.type==='parameter')){output+=fragment.slice(start,t.start)+`json_extract(_assessment_batch.row_json,'$[${Number(t.text.slice(1))-1}]')`;start=t.end;}return output+fragment.slice(start);};
  // Number parameters before slicing so nested SELECTs retain their bindings.
  let numbered='',start=0,index=0;for(const t of list.filter(t=>t.type==='parameter')){numbered+=sql.slice(start,t.start)+'?'+(++index);start=t.end;}numbered+=sql.slice(start);
  const numberedTop=tokens(numbered).filter(t=>t.depth===0),find=w=>numberedTop.find(t=>t.text.toUpperCase()===w),batch='(SELECT value AS row_json FROM json_each(?)) AS _assessment_batch';
  if(verb==='UPDATE'){
   const where=find('WHERE');if(!where||find('FROM'))throw Error('Unsupported shared assessment update.');
   return prepare(bound(numbered.slice(0,where.start))+' FROM '+batch+' WHERE '+bound(numbered.slice(where.end)),JSON.stringify(params));
  }
  if(verb==='INSERT'){
   const values=find('VALUES'),select=find('SELECT'),conflict=numberedTop.find((t,i)=>t.text.toUpperCase()==='ON'&&numberedTop[i+1]?.text.toUpperCase()==='CONFLICT');
   const end=conflict?.start??numbered.length,tail=numbered.slice(end);let prefix,projection,suffix='',condition='1';
   if(values){prefix=numbered.slice(0,values.start);const body=numbered.slice(values.end,end).trim();projection=body.slice(1,-1);}
   else if(select){prefix=numbered.slice(0,select.start);const from=find('FROM');projection=numbered.slice(select.end,from?.start??end);if(from){const where=find('WHERE');suffix=' CROSS JOIN '+bound(numbered.slice(from.end,where?.start??end));if(where)condition=bound(numbered.slice(where.end,end));}}
   else throw Error('Unsupported shared assessment insert.');
   return prepare(prefix+' SELECT '+bound(projection)+' FROM '+batch+suffix+' WHERE '+condition+' '+tail,JSON.stringify(params));
  }
  if(verb==='DELETE'){
   const where=find('WHERE');if(!where)throw Error('A shared assessment delete needs its class predicate.');
   const predicate=numbered.slice(where.end),classParameter=predicate.match(/\bassessment_id\s*=\s*\?([0-9]+)/i);if(!classParameter)throw Error('A shared assessment delete needs its exact assessment.');
   return prepare(numbered.slice(0,where.end)+` assessment_id IN(SELECT json_extract(row_json,'$[${Number(classParameter[1])-1}]') FROM ${batch}) AND EXISTS(SELECT 1 FROM ${batch} WHERE ${bound(predicate)})`,JSON.stringify(params),JSON.stringify(params));
  }
  throw Error('Unsupported shared assessment statement.');
 });
}
