// Bounded fresh GitHub control traffic; no cache, retry, credential fallback or enterprise assumption.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export function activationGitHub({token,fetcher=fetch,maximum=680,allowPromotion=false}){
 assert(token);const stats={restRequests:0,signedArtifactGETs:0,remaining:null,armed:false,failed:false};
 let limit=null;
 const stop=()=>{stats.failed=true;throw Error('ACTIVATION_GITHUB_AUTHORITY_OR_QUOTA_UNAVAILABLE');};
 function quota(){
  if(stats.armed&&(stats.remaining===null||Math.min(stats.remaining,1000)<maximum-stats.restRequests+20))stop();
 }
 async function request(path,options={}){
  assert(!stats.failed);assert(path.startsWith('/repos/MaktabForlife/Academy/')||path==='/rate_limit');
  const method=options.method||'GET';
  assert(method==='GET'||(allowPromotion&&method==='PATCH'&&path==='/repos/MaktabForlife/Academy/git/refs/heads/feature-preview'&&options.body?.force===false));
  if(stats.restRequests>=maximum)stop();quota();stats.restRequests++;
  let r;
  try{r=await fetcher('https://api.github.com'+path,{method,redirect:'manual',cache:'no-store',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(options.body?{'Content-Type':'application/json'}:{})},...(options.body?{body:JSON.stringify(options.body)}:{}),signal:AbortSignal.timeout(30000)});}catch{stop();}
  const remaining=r.headers.get('x-ratelimit-remaining'),cap=r.headers.get('x-ratelimit-limit');
  if(!/^[0-9]+$/.test(remaining||'')||!/^[1-9][0-9]*$/.test(cap||''))stop();
  stats.remaining=stats.remaining===null?Number(remaining):Math.min(stats.remaining,Number(remaining));limit=Number(cap);if(!Number.isSafeInteger(stats.remaining)||!Number.isSafeInteger(limit)||stats.remaining>limit||stats.remaining===0)stop();quota();
  if(!r.ok&&r.status!==302)stop();return r;
 }
 const api=async(path,options)=>{const r=await request(path,options);assert.notEqual(r.status,302);if(r.status===204)return null;try{return await r.json();}catch{stop();}};
 async function archive({id,zipSHA256,maximumBytes}){
  assert(/^[1-9][0-9]*$/.test(String(id)));assert(/^[a-f0-9]{64}$/.test(zipSHA256));
  const meta=await api('/repos/MaktabForlife/Academy/actions/artifacts/'+id);assert.equal(meta.expired,false);assert.equal(meta.digest,'sha256:'+zipSHA256);
  const r=await request('/repos/MaktabForlife/Academy/actions/artifacts/'+id+'/zip');let response=r;
  if(r.status===302){
   const u=new URL(r.headers.get('location'));assert.equal(u.protocol,'https:');assert(!u.username&&!u.password&&(!u.port||u.port==='443'));
   assert(u.hostname.endsWith('.blob.core.windows.net')||u.hostname.endsWith('.githubusercontent.com')||u.hostname==='objects.githubusercontent.com','SIGNED_ARTIFACT_DESTINATION');
   assert(stats.signedArtifactGETs<2);stats.signedArtifactGETs++;
   // Signed object URL never receives the GitHub/Cloudflare credentials.
   try{response=await fetcher(u.href,{redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(30000)});}catch{stop();}
   if(!response.ok)stop();
  }
  const reader=response.body?.getReader(),parts=[];let size=0;
  try{if(reader)for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>maximumBytes){await reader.cancel();stop();}parts.push(Buffer.from(x.value));}}finally{reader?.releaseLock();}
  const bytes=Buffer.concat(parts);assert.equal(createHash('sha256').update(bytes).digest('hex'),zipSHA256,'ARTIFACT_ARCHIVE_CHANGED');return {bytes,meta};
 }
 return {api,archive,stats,
  async probe(){await api('/rate_limit');},
  arm(){if(!limit||stats.remaining===null)stop();stats.armed=true;quota();},
  assertUsable(){if(stats.failed)stop();quota();}
 };
}
