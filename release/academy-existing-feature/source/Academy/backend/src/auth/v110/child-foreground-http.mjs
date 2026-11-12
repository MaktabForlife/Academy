// Dedicated own-app activity navigation. No JSON/body foreground assertion,
// PIN/admin proof, Master/session switch or cross-app clock update.
import {localChildProfile} from './local-child-profile.mjs';
import {createChildAccessEngine} from './child-access-engine.mjs';
import {cookieNames,parseUniqueCookie} from './claims.mjs';
import {refreshNativeChild} from './native-child-authority.mjs';
import {nativeChildCSRFKey,verifyNativeChildCSRF,nativeChildPrimaryStore,nativeChildResponse} from './child-auth-http.mjs';
const fail=(code='CHILD_FOREGROUND_REJECTED',status=403)=>{throw Object.assign(Error(code),{code,status});};
const opaque=v=>typeof v==='string'&&/^[-A-Za-z0-9_]{43}$/.test(v);
const script='parent.postMessage({type:"UAA_CHILD_FOREGROUND",operation:document.body.dataset.operation,accepted:document.body.dataset.accepted==="1"},location.origin);';
function checkNavigation(request,profile){
 const url=new URL(request.url);
 if(url.origin!==profile.origin||url.pathname!=='/api/auth/v110/foreground'||url.search||request.headers.has('Authorization')||
 request.headers.has('Host')&&request.headers.get('Host')!==url.host||request.method!=='POST'||
 request.headers.get('Origin')!==profile.origin||request.headers.get('Sec-Fetch-Site')!=='same-origin'||
 request.headers.get('Sec-Fetch-Mode')!=='navigate'||request.headers.get('Sec-Fetch-Dest')!=='iframe'||request.headers.get('Sec-Fetch-User')!=='?1'||
 !/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||''))fail();
}
async function formInput(request){
 const reader=request.body?.getReader();if(!reader)fail('CHILD_FOREGROUND_BODY',400);
 let length=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>512){await reader.cancel();fail('CHILD_FOREGROUND_BODY',400);}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
 let fields;try{fields=new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('CHILD_FOREGROUND_BODY',400);}
 if([...fields].length!==2||fields.getAll('csrf').length!==1||fields.getAll('operation').length!==1||!opaque(fields.get('csrf'))||!opaque(fields.get('operation')))fail('CHILD_FOREGROUND_BODY',400);
 return {csrf:fields.get('csrf'),operation:fields.get('operation')};
}
async function navigationResponse(operation,{accepted=false,status=200,cookies=[]}={}){
 if(!opaque(operation))fail('CHILD_FOREGROUND_BODY',400);
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(script))),hash=btoa(String.fromCharCode(...digest));
 // Validated opaque values are attribute-safe. The static hashed script
 // sends no identity, cookie, CSRF, session context or material data.
 const html='<!doctype html><html><head><meta charset="utf-8"><title>Activity</title></head><body data-operation="'+operation+'" data-accepted="'+(accepted?'1':'0')+'"><script>'+script+'</script></body></html>';
 const headers=new Headers({'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'sha256-"+hash+"'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",'X-Frame-Options':'SAMEORIGIN','Vary':'Cookie, Origin, Sec-Fetch-Site, Sec-Fetch-Mode, Sec-Fetch-Dest, Sec-Fetch-User'});
 for(const cookie of cookies)headers.append('Set-Cookie',cookie);
 return nativeChildResponse(new Response(html,{status,headers}));
}
export async function handleNativeChildForeground(request,env,{app,clock=Date.now}={}){
 if(env.JWT_V110_CHILD_NATIVE_AUTH!=='1')return Response.json({code:'V110_NOT_ENABLED'},{status:404,headers:{'Cache-Control':'no-store'}});
 if(env.JWT_V110_CHILD_FOREGROUND!=='NAVIGATION_V1')return Response.json({code:'CHILD_FOREGROUND_NOT_ENABLED'},{status:404,headers:{'Cache-Control':'no-store'}});
 let input;
 try{
  const profile=localChildProfile(env,app);checkNavigation(request,profile);
  input=await formInput(request); // All metadata/body rejection precedes DB/signing.
  const key=await nativeChildCSRFKey(env),store=nativeChildPrimaryStore(env);
  const raw=parseUniqueCookie(request.headers.get('Cookie')||'',cookieNames[app].refresh);
  const engine=await createChildAccessEngine(env,{app,signing:true});
  const result=await refreshNativeChild({store,app,engine,raw,clock,foreground:true,foregroundOperation:input.operation,
   authorizeRotation:({family})=>verifyNativeChildCSRF(request,key,profile,family,input.csrf),
   prepareClient:({cookies})=>navigationResponse(input.operation,{accepted:true,cookies})
  });
  // A hint is released only after the private refresh CAS confirms its receipt.
  return result.kind==='rotated'?result.clientResponse:navigationResponse(input.operation,{status:409});
 }catch(error){
  const status=[400,401,403,409,503].includes(error?.status)?error.status:503;
  if(input)return navigationResponse(input.operation,{status});
  return Response.json({code:status===503?'CHILD_FOREGROUND_UNAVAILABLE':'CHILD_FOREGROUND_REJECTED'},{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
}
