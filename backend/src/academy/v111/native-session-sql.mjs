import {verifiedCoordinatorContext} from './coordinator-proof.mjs';
import {tokens} from '../separation/sql-plan.js';
const fail=()=>{throw Object.assign(Error('This native session guard requires its explicit V2 integration.'),{status:503,code:'V2_NATIVE_GUARD_REQUIRED'});};
const name=t=>t&&['word','quoted'].includes(t.type)?(t.type==='word'?t.text:t.text.slice(1,-1)).toLowerCase():null;
function tableAt(list,index){
 let n=index,table=name(list[n]);
 if(list[n]?.text==='('){const depth=list[n].depth;n=list.findIndex((t,i)=>i>n&&t.text===')'&&t.depth===depth);if(n<0)fail();table='(derived)';n++;}
 else {if(!table)return null;n++;if(list[n]?.text==='.'){table=name(list[n+1]);n+=2;}if(list[n]?.text==='('){const depth=list[n].depth,from=n;n=list.findIndex((t,i)=>i>from&&t.text===')'&&t.depth===depth);if(n<0)fail();n++;}}
 if(name(list[n])==='as')n++;
 return {table,alias:name(list[n])};
}
function hasLegacySessionTable(sql){const list=tokens(sql);return list.some((t,i)=>['from','join'].includes(name(t))&&tableAt(list,i+1)?.table==='account_sessions');}
function replaceJoin(sql,pattern,make){
 const starts=new Set(tokens(sql).filter(t=>t.type==='word').map(t=>t.start)),edits=[];
 for(const m of sql.matchAll(pattern))if(starts.has(m.index))edits.push({start:m.index,end:m.index+m[0].length,value:make(m)});
 for(const e of edits.reverse())sql=sql.slice(0,e.start)+e.value+sql.slice(e.end);return sql;
}
function scopesFor(list,length){
 const scopes=[];
 for(const t of list){if(name(t)!=='select')continue;const end=list.find(u=>u.start>t.end&&(u.text===')'&&u.depth<t.depth||u.depth===t.depth&&['union','intersect','except'].includes(name(u))))?.start??length,scope={start:t.start,end,depth:t.depth,binding:null};
  let from=false;
  for(let i=0;i<list.length;i++){const u=list[i];if(u.start<t.start||u.start>=end||u.depth!==t.depth)continue;const word=name(u);if(['where','group','order','having','limit','window','returning'].includes(word))from=false;
   if(word==='from'||word==='join'||from&&u.text===','){from=true;const relation=tableAt(list,i+1);if(relation?.alias==='s'){if(scope.binding!==null)fail();scope.binding=relation.table==='jwt_v2_families'?'family':'other';}}
  }scopes.push(scope);
 }return scopes;
}
// A pure SQL transform, not an authority grant. Only the branded coordinator
// wrapper below can use it in a native write. Names resolve to their nearest
// SELECT binding: a nested subscription alias s is never a session alias.
export function nativeSessionSQL(original){
 if(!hasLegacySessionTable(original))return original;let sql=original;
 sql=replaceJoin(sql,/accounts\s+(a|account)\s+JOIN account_credentials c USING\(account_id\) JOIN account_sessions s USING\(account_id\)/g,m=>'accounts '+m[1]+' JOIN account_credentials c USING(account_id) JOIN jwt_v2_families s ON s.sub='+m[1]+'.account_id');
 sql=replaceJoin(sql,/account_sessions s JOIN accounts a USING\(account_id\) JOIN account_credentials c USING\(account_id\)/g,()=>'jwt_v2_families s JOIN accounts a ON a.account_id=s.sub JOIN account_credentials c USING(account_id)');
 sql=replaceJoin(sql,/account_sessions s JOIN account_credentials c USING\(account_id\)/g,()=>'jwt_v2_families s JOIN account_credentials c ON c.account_id=s.sub');
 sql=replaceJoin(sql,/website_platform_account_state a JOIN account_sessions s ON s.account_id=a.account_id COLLATE NOCASE/g,()=>'website_platform_account_state a JOIN jwt_v2_families s ON s.sub=a.account_id COLLATE NOCASE');
 if(hasLegacySessionTable(sql))fail();
 const list=tokens(sql),scopes=scopesFor(list,sql.length),edits=[],columns={session_id:'s.sid',account_id:'s.sub',credential_epoch:'s.ce',expires_at:"strftime('%Y-%m-%dT%H:%M:%fZ',s.s_exp,'unixepoch')"};
 for(let i=0;i<list.length-2;i++){
  const a=list[i],dot=list[i+1],column=list[i+2];if(name(a)!=='s'||dot.text!=='.')continue;
  const binding=scopes.filter(s=>s.start<=a.start&&a.start<s.end&&s.binding!==null).sort((x,y)=>y.depth-x.depth||y.start-x.start)[0]?.binding;
  if(binding!=='family')continue;const field=name(column);if(Object.hasOwn(columns,field))edits.push({start:a.start,end:column.end,value:columns[field]});
  else if(field==='revoked_at'){if(name(list[i+3])!=='is'||name(list[i+4])!=='null')fail();edits.push({start:a.start,end:list[i+4].end,value:"(s.state='UNLOCKED' AND s.authority_ready=1)"});}
 }
 for(const e of edits.sort((x,y)=>y.start-x.start))sql=sql.slice(0,e.start)+e.value+sql.slice(e.end);return sql;
}
// The owning coordinator additionally composes its complete current-primary,
// lifecycle, credential, key and source-vector guard. No V1 row is fabricated.
export function v2NativeSessionStatement(statement,proof){
 if(!verifiedCoordinatorContext(proof))fail();const sql=nativeSessionSQL(statement.sql);return sql===statement.sql?statement:{...statement,sql};
}
