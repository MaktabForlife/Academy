// Classify the outer command, not a keyword inside a CTE, comment or string.
// A WITH prefix does not make a mutation a read.
export function sqlCommand(sql){
 let depth=0,quote='',line=false,block=false;
 for(let i=0;i<sql.length;i++){
  const ch=sql[i],next=sql[i+1];
  if(line){if(ch==='\n')line=false;continue;}
  if(block){if(ch==='*'&&next==='/'){block=false;i++;}continue;}
  if(quote){if(ch===quote){if(next===quote)i++;else quote='';}continue;}
  if(ch==='-'&&next==='-'){line=true;i++;continue;}
  if(ch==='/'&&next==='*'){block=true;i++;continue;}
  if(["'",'"','`'].includes(ch)){quote=ch;continue;}
  if(ch==='['){const end=sql.indexOf(']',i+1);if(end<0)return '';i=end;continue;}
  if(ch==='('){depth++;continue;}if(ch===')'){depth--;continue;}
  if(depth===0&&/[a-z_]/i.test(ch)){
   const token=sql.slice(i).match(/^[a-z_][a-z_0-9]*/i)[0].toUpperCase();i+=token.length-1;
   if(['SELECT','INSERT','UPDATE','DELETE','REPLACE','PRAGMA','CREATE','DROP','ALTER'].includes(token))return token;
  }
 }
 return '';
}
