// Finite server-to-server receiver. Browser Origin never becomes authentication.
import {portableNativeOrigins,verifyPortableNativeProfile,requirePortableNativeMethod} from './portable-native-profile-v5.mjs';
import {parseEnvelope,route,receiverSecret,verifyMAC,mac,textDigest,boundedText,seconds,httpsPaths,httpsLimits,httpsFail} from './native-https-contract-v1.mjs';
const headers={'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'};
export async function receiveNativeHTTPS(request,env,{app,handlers,clock=Date.now}){
 const u=new URL(request.url);
 if(!Object.values(httpsPaths).includes(u.pathname))return null;
 try{
  const p=await verifyPortableNativeProfile();
  if(u.origin!==portableNativeOrigins[app]||u.search||u.username||u.password||request.method!=='POST'||request.headers.has('Cookie')||request.headers.has('Authorization')||request.headers.has('Origin')||request.headers.has('Host')&&request.headers.get('Host')!==u.host||request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')httpsFail('NATIVE_HTTPS_ORIGIN',403);
  const raw=await boundedText(request.body,httpsLimits.request,request.signal),packet=parseEnvelope(raw,app,clock),target=route(packet.from,packet.to,packet.purpose);
  requirePortableNativeMethod(env,app,packet.purpose==='security.event'?'master':packet.purpose.startsWith('pin.')?'pin':'admission');
  if(target.path!==u.pathname||typeof handlers?.[packet.purpose]!=='function')httpsFail('NATIVE_HTTPS_PURPOSE',403);
  const secret=receiverSecret(env,packet.from,packet.to,packet.purpose);
  if(!await verifyMAC(secret,'uaa-native-https-request-v1:POST',raw,request.headers.get('X-UAA-HTTPS-Signature')))httpsFail('NATIVE_HTTPS_SIGNATURE',401);
  // Original native signed body/ACK is opaque here. Its handler owns authority,
  // idempotency/CAS and commit confirmation; the envelope creates no such proof.
  const answer=await handlers[packet.purpose](Object.freeze(packet));
  if(typeof answer!=='string'||new TextEncoder().encode(answer).length>12288)httpsFail('NATIVE_HTTPS_RESULT');
  const wire=JSON.stringify({ver:1,purpose:packet.purpose,from:app,to:packet.from,requestId:packet.requestId,requestDigest:await textDigest(raw),issuedAtS:seconds(clock),body:answer});
  if(new TextEncoder().encode(wire).length>httpsLimits.response)httpsFail('NATIVE_HTTPS_RESULT');
  return new Response(wire,{status:200,headers:{...headers,'Content-Type':'application/json','X-UAA-HTTPS-Signature':await mac(secret,'uaa-native-https-response-v1',wire)}});
 }catch(e){return Response.json({code:'NATIVE_HTTPS_REJECTED'},{status:[400,401,403,409,503].includes(e?.status)?e.status:503,headers});}
}
