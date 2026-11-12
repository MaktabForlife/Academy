// SOURCE ONLY finite availability feature exclusion; never native authority.
// Preserve bytes/headers/signal. Native cookie/CSRF/scope/PIN/owner guards remain.
export const localAvailabilityPaths=Object.freeze([
 '/api/academy/teacher-availability/get','/api/academy/teacher-availability/save','/api/academy/calendar/get'
]);
const fields=Object.freeze({
 '/api/academy/teacher-availability/get':Object.freeze(['accountId']),
 '/api/academy/teacher-availability/save':Object.freeze(['accountId','revision','ranges','operationId']),
 '/api/academy/calendar/get':Object.freeze(['year','month','scopeKey','teacherId','view','includeWorkload'])
});
const denied=()=>Response.json({success:false,code:'LOCAL_PREVIEW_ACTION_UNAVAILABLE',error:'This action is unavailable in this local test.'},{status:503,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}});
async function bytes(request,maximum){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||'')||!request.body||request.signal.aborted)throw Error('LOCAL_AVAILABILITY_BODY');
 const reader=request.body.getReader(),chunks=[];let size=0,complete=false,timer,abort;
 const stop=new Promise((_yes,no)=>{timer=setTimeout(()=>no(Error('LOCAL_AVAILABILITY_BODY_TIMEOUT')),5000);abort=()=>no(Error('LOCAL_AVAILABILITY_BODY_ABORTED'));request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();});
 try{
  for(;;){const part=await Promise.race([reader.read(),stop]);if(part.done){complete=true;break;}size+=part.value.byteLength;if(size>maximum)throw Error('LOCAL_AVAILABILITY_BODY_LIMIT');chunks.push(part.value);}
  const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}
  try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));if(!value||Object.getPrototypeOf(value)!==Object.prototype)throw Error('LOCAL_AVAILABILITY_BODY');return {all,value};}catch(error){all.fill(0);throw error;}
 }finally{
  clearTimeout(timer);request.signal.removeEventListener('abort',abort);
  try{if(!complete){let timeout;try{await Promise.race([reader.cancel(),new Promise((_yes,no)=>{timeout=setTimeout(()=>no(Error('LOCAL_AVAILABILITY_CANCEL_UNCONFIRMED')),1000);})]);}finally{clearTimeout(timeout);}}}
  finally{reader.releaseLock();for(const chunk of chunks)chunk.fill(0);}
 }
}
export async function prepareLocalNativeAvailabilityRequest(request,env){
 let u;try{u=new URL(request.url);}catch{return {denied:denied()};}
 if(!Object.hasOwn(fields,u.pathname)||u.origin!=='https://ummabbadacademy.app'||u.username||u.password||u.search||u.hash||request.method!=='POST'||request.headers.get('Origin')!==u.origin||request.headers.get('Sec-Fetch-Site')!=='same-origin'||request.headers.has('Host')&&request.headers.get('Host')!==u.host)return {denied:denied()};
 if(env.JWT_LOCAL_ROOT_TEACHER_AVAILABILITY!=='NATIVE_PIN_AVAILABILITY_V1'||env.JWT_LOCAL_TEST_ROUTE_POLICY!=='NATIVE_WEBSITE_HIFZ_V1'||env.JWT_LOCAL_STAGE!=='V110_INTEGRATION'||env.JWT_LOCAL_NATIVE_ROUTES!=='V110_INTEGRATION'||env.JWT_V110_NATIVE_COOKIE!=='1'||env.JWT_V110_MASTER!=='1'||env.JWT_V110_ROOT_SENSITIVE_POLICY!=='RESOURCE_PIN_V1'||env.JWT_LOCAL_BACKEND_EGRESS!=='DENY_ALL'||env.JWT_LOCAL_AI!=='OFF'||env.JWT_LOCAL_PROVIDERS!=='OFF'||env.JWT_LOCAL_TRANSCRIPTION!=='OFF'||env.JWT_LOCAL_SCHEDULES!=='OFF'||env.VIDEO_AUTOLINK_HTTP_ENABLED!=='0'||env.LOCAL_VIDEO_MANUAL_SOURCE_ENABLED!=='0')return {denied:denied()};
 let parsed;
 try{
  // Save retains the native existing 131072-byte limit; reads need only selectors.
  parsed=await bytes(request,u.pathname.endsWith('/save')?131072:4096);
  if(request.signal.aborted||Object.keys(parsed.value).some(k=>!fields[u.pathname].includes(k)))return {denied:denied()};
  return {request:new Request(request,{body:parsed.all})};
 }catch{return {denied:denied()};}finally{parsed?.all.fill(0);}
}
