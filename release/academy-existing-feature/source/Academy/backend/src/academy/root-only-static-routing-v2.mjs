// v2: final hash shares the original absolute deadline gate.
// SOURCE ONLY. Exact public source bytes; no SPA fallback, no credential forwarding.
import manifest from './root-only-static-manifest-v1.json' with {type:'json'};
export const rootStaticManifestSHA256='c8c595524cf550ff7532314a005b084c25b64b782eddd8adb13f61cce04c03d7';
const assets=new Map(manifest.assets.map(item=>[item.urlPath,item]));
const fail=()=>{throw Object.assign(Error('ROOT_ONLY_STATIC_UNAVAILABLE'),{code:'ROOT_ONLY_STATIC_UNAVAILABLE',status:503});};
export function rootOnlyResponse(response){
 const headers=new Headers();for(const[k,v]of response.headers)if(k.toLowerCase()!=='set-cookie')headers.append(k,v);
 if(response.headers.has('Set-Cookie')){if(typeof response.headers.getSetCookie!=='function')fail();for(const value of response.headers.getSetCookie())headers.append('Set-Cookie',value);}
 for(const[k,v]of Object.entries(manifest.headers))headers.set(k,v);
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export async function serveRootOnlyStatic(request,env){
 const url=new URL(request.url),item=assets.get(url.pathname);if(!item)return null;
 if(!['GET','HEAD'].includes(request.method))return rootOnlyResponse(new Response('Use GET or HEAD.',{status:405,headers:{Allow:'GET, HEAD'}}));
 if(!item.allowedSearches.includes(url.search))return rootOnlyResponse(new Response('Not found',{status:404}));
 if(url.origin!==manifest.origin||url.username||url.password||url.hash||env.JWT_V110_ROOT_ONLY_ASSET_MANIFEST_SHA256!==rootStaticManifestSHA256||typeof env.ASSETS?.fetch!=='function'||!Number.isSafeInteger(item.bytes)||item.bytes<0||item.bytes>2097152||!/^[a-f0-9]{64}$/.test(item.sha256))fail();
 const controller=new AbortController(),start=Date.now(),end=start+5000;let response,reader,timer,finished=false,size=0;const chunks=[];
 const cancel=()=>{try{void Promise.resolve(reader?reader.cancel():response?.body?.cancel()).catch(()=>{});}catch{}};
 const check=()=>{const now=Date.now();if(controller.signal.aborted||request.signal.aborted||now<start||now>=end)fail();};
 const abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});
 const expired=new Promise((_yes,no)=>{controller.signal.addEventListener('abort',()=>{cancel();no(Object.assign(Error('ROOT_ONLY_STATIC_UNAVAILABLE'),{code:'ROOT_ONLY_STATIC_UNAVAILABLE'}));},{once:true});timer=setTimeout(abort,5000);});void expired.catch(()=>{});
 try{
  check();const fetching=Promise.resolve().then(()=>{check();return env.ASSETS.fetch(new Request(manifest.origin+url.pathname,{method:'GET',signal:controller.signal,redirect:'error',headers:{'Accept-Encoding':'identity'}}));});
  void fetching.then(value=>{if(finished||controller.signal.aborted)try{void Promise.resolve(value.body?.cancel()).catch(()=>{});}catch{}},()=>{});
  response=await Promise.race([fetching,expired]);check();if(response.status!==200)fail();reader=response.body?.getReader();
  if(reader)for(;;){const part=await Promise.race([reader.read(),expired]);check();if(part.done)break;if(!(part.value instanceof Uint8Array))fail();size+=part.value.byteLength;if(size>item.bytes)fail();chunks.push(part.value);}
  if(size!==item.bytes)fail();const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.byteLength;}
  const digest=[...new Uint8Array(await Promise.race([crypto.subtle.digest('SHA-256',bytes),expired]))].map(n=>n.toString(16).padStart(2,'0')).join('');check();if(digest!==item.sha256)fail();
  return rootOnlyResponse(new Response(request.method==='HEAD'?null:bytes,{status:200,headers:{'Content-Type':item.mime,'Content-Length':String(size)}}));
 }finally{finished=true;clearTimeout(timer);request.signal.removeEventListener('abort',abort);cancel();try{reader?.releaseLock();}catch{}controller.abort();}
}
