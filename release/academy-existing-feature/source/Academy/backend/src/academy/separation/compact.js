import {sourceLayout} from './layout.js';
const q=n=>'"'+n+'"';
function shape(s){
 let m=s.sql.match(/^INSERT INTO "(\w+)"\(([^)]+)\) VALUES\((\?(?:,\?)*)\)(.*)$/);if(m)return {verb:'INSERT',table:m[1],fields:m[2].split(',').map(x=>x.replaceAll('"','')),tail:m[4]};
 m=s.sql.match(/^UPDATE "(\w+)" SET (.+) WHERE (.+)$/);if(m&&/^"\w+"=\?(?:,"\w+"=\?)*$/.test(m[2])&&/^"\w+" IS \?(?: AND "\w+" IS \?)*$/.test(m[3]))return {verb:'UPDATE',table:m[1],fields:m[2].split(',').map(x=>x.split('=')[0].replaceAll('"','')),keys:m[3].split(' AND ').map(x=>x.split(' ')[0].replaceAll('"',''))};return null;
}
// Keep order and do not merge repeated keys: temporary rename passes, guards,
// owner boundaries and later dependent statements remain distinct operations.
export function compactStatements(statements){const out=[];for(let i=0;i<statements.length;){const first=statements[i],spec=shape(first);if(!spec){out.push(first);i++;continue;}const rows=[],seen=new Set();let size=2,j=i;
 for(;j<statements.length&&statements[j].sql===first.sql;j++){
  const params=statements[j].params,fields=spec.verb==='INSERT'?spec.fields:[...spec.fields,...spec.keys],row=Object.fromEntries(fields.map((c,k)=>[c,params[k]])),keys=spec.keys||sourceLayout[spec.table]?.keys||spec.fields,key=JSON.stringify(keys.map(c=>row[c])),bytes=new TextEncoder().encode(JSON.stringify(row)).length+1;
  if(seen.has(key)||size+bytes>1400000)break;seen.add(key);rows.push(row);size+=bytes;
 }
 if(rows.length<2){out.push(first);i++;continue;}
 const value=c=>"json_extract(j.value,'$."+c+"')";
 if(spec.verb==='INSERT')out.push({sql:'INSERT INTO '+q(spec.table)+'('+spec.fields.map(q)+') SELECT '+spec.fields.map(value)+' FROM json_each(?) j WHERE 1'+spec.tail,params:[JSON.stringify(rows)]});
 else out.push({sql:'UPDATE '+q(spec.table)+' AS target SET '+spec.fields.map(c=>q(c)+'='+value(c))+' FROM json_each(?) j WHERE '+spec.keys.map(c=>'target.'+q(c)+' IS '+value(c)).join(' AND '),params:[JSON.stringify(rows)]});i=j;
 }return out;}
