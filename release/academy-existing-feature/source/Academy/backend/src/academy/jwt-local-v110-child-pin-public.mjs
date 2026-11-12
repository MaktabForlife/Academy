// Exact public Root PIN form bytes. Source-reviewed records are required.
// No authority, credentials, remote fetch, upstream headers or cache reuse.
const root='https://ummabbadacademy.app',form='/account/child-pin/index.html';
export const rootChildPINPublicPaths=Object.freeze(['/account/child-pin/',form,'/js/jwt-child-pin-form.js','/js/jwt-child-pin-form.css']);
const sources=Object.freeze([form,'/js/jwt-child-pin-form.js','/js/jwt-child-pin-form.css']);
const missing=()=>new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
export function createRootChildPINPublicGateway(records){
 if(!Array.isArray(records)||records.length!==3)throw Error('CHILD_PIN_PUBLIC_MANIFEST_REQUIRED');
 const files=new Map();
 for(const r of records){
  if(!r||Object.keys(r).sort().join(',')!=='path,sha256'||!sources.includes(r.path)||files.has(r.path)||!/^[a-f0-9]{64}$/.test(r.sha256||''))throw Error('CHILD_PIN_PUBLIC_MANIFEST_REJECTED');
  files.set(r.path,r.sha256);
 }
 return Object.freeze({has:path=>rootChildPINPublicPaths.includes(path),async fetch(request,assets){
  const u=new URL(request.url);
  if(u.origin!==root||u.search||u.hash||u.username||u.password||!rootChildPINPublicPaths.includes(u.pathname))return missing();
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
  if(typeof assets?.fetch!=='function')return missing();
  const path=u.pathname==='/account/child-pin/'?form:u.pathname;
  const response=await assets.fetch(new Request(root+path,{method:'GET'}));
  if(response.status!==200||!response.body)return missing();
  const reader=response.body.getReader(),parts=[];let size=0;
  try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>1048576){await reader.cancel();return missing();}parts.push(p.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  if(await sha(bytes)!==files.get(path))return missing();
  const html=path===form;
  const headers={'Content-Type':html?'text/html; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'private, no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
   // Cross-origin child popup opener is required for source/origin/state checks.
   'Cross-Origin-Opener-Policy':'unsafe-none',
   'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"};
  return new Response(request.method==='HEAD'?null:bytes,{status:200,headers});
 }});
}
