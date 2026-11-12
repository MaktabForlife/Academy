// Source-only bounded POST ingress. Raw bytes/URL/browser headers remain native-owned.
export async function bufferRootOnlyPOST(request,{clock=Date.now,maxBytes=4096}={}){
 if(request.method!=='POST')return request;
 const deny=(code,status)=>{throw Object.assign(Error(code),{code,status});};
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>4096)deny('ROOT_BODY_UNAVAILABLE',503);
 if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')deny('ROOT_BODY_TYPE',415);
 const rawLength=request.headers.get('Content-Length');if(rawLength!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(rawLength)||!Number.isSafeInteger(Number(rawLength))||Number(rawLength)>maxBytes))deny('ROOT_BODY_TOO_LARGE',413);
 const start=clock(),end=start+5000,controller=new AbortController();let reader,timer,finished=false,size=0;const chunks=[];
 if(!Number.isSafeInteger(start)||start<0)deny('ROOT_BODY_UNAVAILABLE',503);
 const cancel=()=>{try{void Promise.resolve(reader?.cancel()).catch(()=>{});}catch{}};
 const reject=()=>controller.abort();request.signal.addEventListener('abort',reject,{once:true});
 const expired=new Promise((_yes,no)=>{controller.signal.addEventListener('abort',()=>{cancel();no(Object.assign(Error('ROOT_BODY_UNCONFIRMED'),{code:'ROOT_BODY_UNCONFIRMED',status:408}));},{once:true});timer=setTimeout(reject,5000);});void expired.catch(()=>{});
 const check=()=>{const now=clock();if(request.signal.aborted||controller.signal.aborted||!Number.isSafeInteger(now)||now<start||now>=end)deny('ROOT_BODY_UNCONFIRMED',408);};
 try{
  check();reader=request.body?.getReader();
  if(reader)for(;;){const reading=Promise.resolve().then(()=>{check();return reader.read();});void reading.then(()=>{if(finished)try{reader?.releaseLock();}catch{}},()=>{if(finished)try{reader?.releaseLock();}catch{}});const part=await Promise.race([reading,expired]);check();if(part.done)break;if(!(part.value instanceof Uint8Array))deny('ROOT_BODY_UNAVAILABLE',400);size+=part.value.byteLength;if(size>maxBytes)deny('ROOT_BODY_TOO_LARGE',413);chunks.push(part.value);}
  if(rawLength!==null&&Number(rawLength)!==size)deny('ROOT_BODY_LENGTH',400);
  const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.byteLength;}check();
  // New Request retains the real URL/method/Origin/Sec-Fetch/Cookie/CSRF/signal.
  // This gate neither interprets JSON nor creates PIN/session/authority proof.
  return new Request(request,{body:bytes});
 }finally{finished=true;clearTimeout(timer);request.signal.removeEventListener('abort',reject);cancel();try{reader?.releaseLock();}catch{}controller.abort();}
}
