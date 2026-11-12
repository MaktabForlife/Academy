import {localRootRelayHeaderPolicy} from './jwt-local-public-relay-policy.mjs';
// Exact public assets only; no DB, dynamic Root API, credential or authority.
// This gateway can also be mounted independently by the reviewed local router.
export const rootV110PublicFiles=Object.freeze(['browser-bootstrap.js','browser-config.js','browser-entry.mjs','browser-control-client.mjs','browser-display-state.mjs','child-cookie-transport.mjs','academy-cookie-loader.js','academy-cookie-transport.mjs','browser-control.html','browser-control-relay.mjs','browser-app-privacy.mjs','local-prepaint.js'].map(n=>'/auth/v110/'+n));
const root='https://ummabbadacademy.app',relay='/auth/v110/browser-control.html';
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
const missing=()=>new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
export function createRootV110PublicGateway({records=[]}={}){
 if(!Array.isArray(records)||records.length>rootV110PublicFiles.length)throw Error('INVALID_PUBLIC_AUTH_MANIFEST');
 const files=new Map();
 for(const r of records){
  if(!r||!rootV110PublicFiles.includes(r.path)||files.has(r.path)||!/^[a-f0-9]{64}$/.test(r.sha256||''))throw Error('INVALID_PUBLIC_AUTH_MANIFEST');
  let headers={'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-site'};
  if(r.path===relay){
   headers={...r.headers};
   const h=new Headers(headers),ancestors="frame-ancestors https://ummabbadacademy.app https://worshipuponbaseera.ummabbadacademy.app https://mahadarwa-hifz.ummabbadacademy.app";
   if(h.has('X-Frame-Options')||h.has('Set-Cookie')||h.get('Cache-Control')!=='no-store'||h.get('Content-Type')!=='text/html; charset=utf-8'||!h.get('Content-Security-Policy')?.split(';').map(s=>s.trim()).includes(ancestors)||h.get('X-Content-Type-Options')!=='nosniff')throw Error('INVALID_PUBLIC_RELAY_HEADERS');
  }else if(r.headers!==undefined)throw Error('UNREVIEWED_PUBLIC_SCRIPT_HEADERS');
  files.set(r.path,Object.freeze({sha256:r.sha256,headers:Object.freeze(headers)}));
 }
 return Object.freeze({has:path=>files.has(path),async fetch(request,assets){
  const u=new URL(request.url),r=files.get(u.pathname);
  if(u.origin!==root||u.search||u.hash||!r)return missing();
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
  if(typeof assets?.fetch!=='function')return missing();
  // GET for both methods verifies exact public bytes; never forward asset
  // response cookies/redirects/headers or request credentials upstream.
  const response=await assets.fetch(new Request(u.href,{method:'GET',headers:{Accept:r.headers['Content-Type']}}));
  if(response.status!==200)return missing();
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength>1048576||await sha(bytes)!==r.sha256)return missing();
  if(u.pathname===relay){
   let exact;try{exact=await localRootRelayHeaderPolicy({html:new TextDecoder('utf-8',{fatal:true}).decode(bytes),approvedHTMLSHA256:r.sha256});}catch{return missing();}
   const canonical=value=>JSON.stringify([...new Headers(value).entries()].sort(([a],[b])=>a.localeCompare(b)));
   if(canonical(exact)!==canonical(r.headers))return missing();
  }
  return new Response(request.method==='HEAD'?null:bytes,{status:200,headers:r.headers});
 }});
}
