// Actual built-in certificate-verified HTTPS only. No private binding/URL injection.
// NO automatic admission/PIN/user-write retry. Security pump alone owns retry.
import {verifyPortableNativeProfile,requirePortableNativeMethod} from './portable-native-profile-v5.mjs';
import {route,transportSecret,mac,verifyMAC,textDigest,boundedText,exactRecord,seconds,httpsLimits,httpsFail} from './native-https-contract-v1.mjs';
export async function sendNativeHTTPS(env,{from,to,purpose,body,requestId=crypto.randomUUID(),clock=Date.now}){
 requirePortableNativeMethod(env,from,purpose==='security.event'?'master':purpose.startsWith('pin.')?'pin':'admission');await verifyPortableNativeProfile();
 const target=route(from,to,purpose),secret=transportSecret(env,from,to,purpose);
 if(typeof body!=='string'||new TextEncoder().encode(body).length>24576)httpsFail('NATIVE_HTTPS_BODY_LIMIT');
 const wire=JSON.stringify({ver:1,purpose,from,to,origin:target.origin,path:target.path,requestId,issuedAtS:seconds(clock),body});
 if(new TextEncoder().encode(wire).length>httpsLimits.request)httpsFail('NATIVE_HTTPS_BODY_LIMIT');
 const signature=await mac(secret,'uaa-native-https-request-v1:POST',wire),digest=await textDigest(wire),controller=new AbortController();let timer,response;
 const deadline=new Promise((_yes,no)=>{timer=setTimeout(()=>{controller.abort();no(Object.assign(Error('NATIVE_HTTPS_UNCONFIRMED'),{code:'NATIVE_HTTPS_UNCONFIRMED',status:503}));},5000);});
 try{
  response=await Promise.race([fetch(target.origin+target.path,{method:'POST',headers:{'Content-Type':'application/json','X-UAA-HTTPS-Signature':signature},body:wire,redirect:'error',signal:controller.signal}),deadline]);
  if(response.status!==200||response.redirected||response.headers.has('Set-Cookie')||(response.headers.get('Content-Type')||'').split(';')[0].trim()!=='application/json')httpsFail('NATIVE_HTTPS_UNCONFIRMED');
  const raw=await Promise.race([boundedText(response.body,httpsLimits.response,controller.signal),deadline]);
  if(!await verifyMAC(secret,'uaa-native-https-response-v1',raw,response.headers.get('X-UAA-HTTPS-Signature')))httpsFail('NATIVE_HTTPS_ACK_SIGNATURE');
  let ack;try{ack=JSON.parse(raw);}catch{httpsFail('NATIVE_HTTPS_ACK_SHAPE');}
  exactRecord(ack,['ver','purpose','from','to','requestId','requestDigest','issuedAtS','body']);
  if(ack.ver!==1||ack.purpose!==purpose||ack.from!==to||ack.to!==from||ack.requestId!==requestId||ack.requestDigest!==digest||!Number.isSafeInteger(ack.issuedAtS)||Math.abs(seconds(clock)-ack.issuedAtS)>30||typeof ack.body!=='string')httpsFail('NATIVE_HTTPS_ACK_BINDING');
  return ack.body;
 }catch{httpsFail('NATIVE_HTTPS_UNCONFIRMED');}
 finally{clearTimeout(timer);controller.abort();if(response?.body&&!response.body.locked)try{void Promise.resolve(response.body.cancel()).catch(()=>{});}catch{}}
}
