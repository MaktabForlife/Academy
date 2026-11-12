// SOURCE ONLY Root request reader. One deadline; cancellation is requested, never awaited.
import {AuthContractError} from './claims.mjs';
export async function readRootBrowserJSON(request,{maxBytes=1024,deadlineMs=5000,invalidCode='INVALID_ROOT_BROWSER_BODY',unavailableCode='ROOT_BROWSER_BODY_UNAVAILABLE',clock=()=>performance.now()}={}){
 const error=(code,status)=>Object.assign(new AuthContractError(code),{status});
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>32768||!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>5000||typeof clock!=='function')throw error(unavailableCode,503);
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||''))throw error(invalidCode,400);
 const start=clock();if(!Number.isFinite(start)||start<0)throw error(unavailableCode,503);
 const end=start+deadlineMs,signal=request.signal;let reader,timer,onAbort,finished=false;
 const release=()=>{try{reader?.releaseLock();}catch{}};
 const cancel=()=>{try{void Promise.resolve(reader?.cancel()).catch(()=>{});}catch{}};
 const check=()=>{const now=clock();if(signal?.aborted||!Number.isFinite(now)||now<start||now>=end)throw error(unavailableCode,503);};
 const gate=new Promise((_yes,no)=>{
  const reject=()=>{cancel();no(error(unavailableCode,503));};
  timer=setTimeout(reject,deadlineMs);onAbort=reject;
  if(signal?.aborted)reject();else signal?.addEventListener('abort',onAbort,{once:true});
 });
 // A synchronous getReader/decode failure must not leave a rejected gate unobserved.
 void gate.catch(()=>{});
 let text='',size=0;const decoder=new TextDecoder('utf-8',{fatal:true});
 try{
  check();reader=request.body?.getReader();
  if(reader)for(;;){
   check();
   const pending=Promise.resolve().then(()=>reader.read());
   void pending.then(()=>{if(finished)release();},()=>{if(finished)release();});
   const part=await Promise.race([pending,gate]);check();
   if(part.done)break;
   if(!(part.value instanceof Uint8Array))throw error(invalidCode,400);
   size+=part.value.byteLength;if(size>maxBytes)throw error(invalidCode,400);
   text+=decoder.decode(part.value,{stream:true});
  }
  text+=decoder.decode();check();
  const value=JSON.parse(text||'{}');
  if(!value||Object.getPrototypeOf(value)!==Object.prototype)throw error(invalidCode,400);
  check();return value;
 }catch(e){
  if(e instanceof AuthContractError)throw e;
  if(signal?.aborted)throw error(unavailableCode,503);
  throw error(invalidCode,400);
 }finally{
  finished=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);cancel();release();
 }
}
