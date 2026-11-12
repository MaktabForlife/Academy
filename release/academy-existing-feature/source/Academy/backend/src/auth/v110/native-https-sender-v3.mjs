// Whole-call bounded, certificate-verified HTTPS. No automatic user-write retry.
// Includes profile/hash/MAC/fetch/body/ACK crypto in ONE <=5s budget.
import {verifyPortableNativeProfile,requirePortableNativeMethod} from './portable-native-profile-v5.mjs';
import {route,transportSecret,mac,verifyMAC,textDigest,exactRecord,seconds,httpsLimits,httpsFail} from './native-https-contract-v1.mjs';
async function responseText(body,max,signal,check){
 const reader=body?.getReader();if(!reader)httpsFail('NATIVE_HTTPS_BODY');
 let size=0,text='',onAbort;const decoder=new TextDecoder('utf-8',{fatal:true});
 const aborted=new Promise((_yes,no)=>{onAbort=()=>no(Error('NATIVE_HTTPS_UNCONFIRMED'));signal.addEventListener('abort',onAbort,{once:true});});
 try{
  check();
  for(;;){const part=await Promise.race([reader.read(),aborted]);check();if(part.done)break;size+=part.value.byteLength;if(size>max)httpsFail('NATIVE_HTTPS_BODY_LIMIT');text+=decoder.decode(part.value,{stream:true});}
  text+=decoder.decode();check();return text;
 }finally{
  signal.removeEventListener('abort',onAbort);
  try{void Promise.resolve(reader.cancel()).catch(()=>{});}catch{}
  try{reader.releaseLock();}catch{}
 }
}
export async function sendNativeHTTPS(env,{from,to,purpose,body,requestId=crypto.randomUUID(),clock=Date.now}){
 const started=clock(),controller=new AbortController();let timer,response;
 const check=()=>{const now=clock();if(!Number.isSafeInteger(started)||started<0||!Number.isSafeInteger(now)||now<started||now-started>=5000||controller.signal.aborted)httpsFail('NATIVE_HTTPS_UNCONFIRMED');};
 const deadline=new Promise((_yes,no)=>{timer=setTimeout(()=>{controller.abort();no(Error('NATIVE_HTTPS_UNCONFIRMED'));},5000);});
 const operation=(async()=>{
  check();requirePortableNativeMethod(env,from,purpose==='security.event'?'master':purpose.startsWith('pin.')?'pin':'admission');
  await verifyPortableNativeProfile();check();
  const target=route(from,to,purpose),secret=transportSecret(env,from,to,purpose);
  if(typeof body!=='string'||new TextEncoder().encode(body).length>24576)httpsFail('NATIVE_HTTPS_BODY_LIMIT');
  const wire=JSON.stringify({ver:1,purpose,from,to,origin:target.origin,path:target.path,requestId,issuedAtS:seconds(clock),body});
  if(new TextEncoder().encode(wire).length>httpsLimits.request)httpsFail('NATIVE_HTTPS_BODY_LIMIT');
  const signature=await mac(secret,'uaa-native-https-request-v1:POST',wire);check();
  const digest=await textDigest(wire);check();
  response=await fetch(target.origin+target.path,{method:'POST',headers:{'Content-Type':'application/json','X-UAA-HTTPS-Signature':signature},body:wire,redirect:'error',signal:controller.signal});
  // Fetch may settle after the outer deadline/finally already completed.
  if(controller.signal.aborted)try{void Promise.resolve(response.body?.cancel()).catch(()=>{});}catch{}
  check();
  if(response.status!==200||response.redirected||response.headers.has('Set-Cookie')||(response.headers.get('Content-Type')||'').split(';')[0].trim()!=='application/json')httpsFail('NATIVE_HTTPS_UNCONFIRMED');
  const raw=await responseText(response.body,httpsLimits.response,controller.signal,check);check();
  const verified=await verifyMAC(secret,'uaa-native-https-response-v1',raw,response.headers.get('X-UAA-HTTPS-Signature'));check();
  if(!verified)httpsFail('NATIVE_HTTPS_ACK_SIGNATURE');
  let ack;try{ack=JSON.parse(raw);}catch{httpsFail('NATIVE_HTTPS_ACK_SHAPE');}
  exactRecord(ack,['ver','purpose','from','to','requestId','requestDigest','issuedAtS','body']);
  if(ack.ver!==1||ack.purpose!==purpose||ack.from!==to||ack.to!==from||ack.requestId!==requestId||ack.requestDigest!==digest||!Number.isSafeInteger(ack.issuedAtS)||Math.abs(seconds(clock)-ack.issuedAtS)>30||typeof ack.body!=='string')httpsFail('NATIVE_HTTPS_ACK_BINDING');
  check();return ack.body;
 })();
 try{return await Promise.race([operation,deadline]);}
 catch{httpsFail('NATIVE_HTTPS_UNCONFIRMED');}
 finally{
  clearTimeout(timer);controller.abort();
  if(response?.body&&!response.body.locked)try{void Promise.resolve(response.body.cancel()).catch(()=>{});}catch{}
 }
}
