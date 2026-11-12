// Fixed intended HTTPS contract; native signed payloads stay opaque and unchanged.
import {portableNativeOrigins} from './portable-native-profile-v5.mjs';
const enc=new TextEncoder();
export const httpsLimits=Object.freeze({request:32768,response:16384,deadlineMs:5000,freshSeconds:30});
export const httpsPaths=Object.freeze({admission:'/internal/v110/admission',pin:'/internal/v110/pin',security:'/internal/v110/security'});
export const httpsFail=(code='NATIVE_HTTPS_REJECTED',status=503)=>{throw Object.assign(Error(code),{code,status});};
export function exactRecord(v,keys){if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.getOwnPropertySymbols(v).length||Object.keys(v).sort().join(',')!==keys.slice().sort().join(',')||keys.some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value')))httpsFail('NATIVE_HTTPS_SHAPE',400);return v;}
const operations=Object.freeze({'admission.request':'admission','admission.stage':'admission','pin.intent':'pin','pin.proof':'pin','security.event':'security'});
export function route(from,to,purpose){
 const group=operations[purpose];if(!group||!['academy','studio','hifz'].includes(from)||!['academy','studio','hifz'].includes(to)||from===to)httpsFail('NATIVE_HTTPS_ROUTE',403);
 if(purpose==='admission.request'?(to!=='academy'||from==='academy'):(from!=='academy'||to==='academy'))httpsFail('NATIVE_HTTPS_ROUTE',403);
 return Object.freeze({origin:portableNativeOrigins[to],path:httpsPaths[group],group});
}
export function transportSecret(env,app,peer,purpose){
 const group=route(app,peer,purpose).group,child=app==='academy'?peer:app;
 const name='JWT_V110_HTTPS_'+child.toUpperCase()+'_'+group.toUpperCase()+'_SECRET',secret=env[name];
 if(typeof secret!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(secret))httpsFail('NATIVE_HTTPS_CONFIG');return secret;
}
export function receiverSecret(env,from,to,purpose){
 const r=route(from,to,purpose),child=from==='academy'?to:from;
 const secret=env['JWT_V110_HTTPS_'+child.toUpperCase()+'_'+r.group.toUpperCase()+'_SECRET'];
 if(typeof secret!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(secret))httpsFail('NATIVE_HTTPS_CONFIG');return secret;
}
export async function mac(secret,prefix,text){
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(prefix+'\n'+text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function verifyMAC(secret,prefix,text,signature){
 if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))return false;
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g),x=>parseInt(x,16)),enc.encode(prefix+'\n'+text));
}
export async function textDigest(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function seconds(clock){const ms=clock();if(!Number.isSafeInteger(ms)||ms<0)httpsFail('NATIVE_HTTPS_CLOCK');return Math.floor(ms/1000);}
export async function boundedText(body,max,signal){
 const reader=body?.getReader();if(!reader)httpsFail('NATIVE_HTTPS_BODY',400);
 let n=0,text='',timer;const decoder=new TextDecoder('utf-8',{fatal:true});
 const deadline=new Promise((_yes,no)=>{timer=setTimeout(()=>no(Object.assign(Error('NATIVE_HTTPS_BODY_TIMEOUT'),{status:503})),5000);});
 try{for(;;){if(signal?.aborted)httpsFail('NATIVE_HTTPS_ABORTED');const part=await Promise.race([reader.read(),deadline]);if(part.done)break;n+=part.value.byteLength;if(n>max)httpsFail('NATIVE_HTTPS_BODY_LIMIT',400);text+=decoder.decode(part.value,{stream:true});}return text+decoder.decode();}
 finally{clearTimeout(timer);try{void Promise.resolve(reader.cancel()).catch(()=>{});}catch{}try{reader.releaseLock();}catch{}}
}
export function parseEnvelope(raw,to,clock){
 let p;try{p=JSON.parse(raw);}catch{httpsFail('NATIVE_HTTPS_JSON',400);}
 exactRecord(p,['ver','purpose','from','to','origin','path','requestId','issuedAtS','body']);
 const r=route(p.from,p.to,p.purpose),now=seconds(clock);
 if(p.ver!==1||p.to!==to||p.origin!==r.origin||p.path!==r.path||typeof p.requestId!=='string'||!/^[-A-Za-z0-9_:]{1,180}$/.test(p.requestId)||!Number.isSafeInteger(p.issuedAtS)||Math.abs(now-p.issuedAtS)>30||typeof p.body!=='string'||enc.encode(p.body).length>24576)httpsFail('NATIVE_HTTPS_ENVELOPE',401);
 return Object.freeze({...p});
}
