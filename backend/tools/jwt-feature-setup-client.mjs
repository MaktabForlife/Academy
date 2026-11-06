// Fixed one execute + one read-only status. No SQL/retry/credential-bearing output.
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
const origin='https://feature_worker.maktab4life.workers.dev';
const allowed=['schema','stage','state','source','manifestHash','planId','databaseIds','startedAt','finishedAt','phase','alreadyClaimed','sourceDigest','verification'];
async function boundedJSON(response){
 const reader=response.body?.getReader();if(!reader)throw Error('SETUP_RESPONSE');
 let size=0,parts=[];for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>16384){await reader.cancel();throw Error('SETUP_RESPONSE');}parts.push(p.value);}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw Error('SETUP_RESPONSE');}
}
export function setupClient({contract:c,issued,expires,authKey,fetcher=fetch,onRequest=()=>{},phase='seed',now=()=>Math.floor(Date.now()/1000)}){
 assert(['schema','seed'].includes(phase));if(phase==='schema')assert.equal(c.ddl?.schema,1);
 assert(Buffer.isBuffer(authKey)&&authKey.length===32);assert(Number.isSafeInteger(issued)&&Number.isSafeInteger(expires)&&expires-issued>0&&expires-issued<=900);
 let executeUsed=false,statusUsed=false,executeRequests=0,statusRequests=0;
 async function request(action){
  assert(['execute','status'].includes(action));if(action==='execute'){assert(!executeUsed,'SETUP_NO_RETRY');executeUsed=true;}else{assert(!statusUsed,'SETUP_STATUS_BUDGET');statusUsed=true;}
  const method=action==='execute'?'POST':'GET',path='/internal/feature-jwt-setup/'+(phase==='schema'?'schema-':'')+action,stamp=now(),nonce=randomBytes(32).toString('base64url');
  if(action==='execute'&&stamp>=expires)throw Error('SETUP_EXECUTE_EXPIRED');
  const packet=JSON.stringify(['jwt-feature-private-setup-v1',c.planId,c.source,c.manifestHash,c.accountId,method,path,issued,expires,stamp,nonce]);
  const proof=createHmac('sha256',authKey).update(packet).digest('base64url');
  onRequest(phase,action);action==='execute'?executeRequests++:statusRequests++;
  let response;try{response=await fetcher(origin+path,{method,redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(phase==='schema'&&action==='execute'?120000:20000),headers:{'X-JWT-Setup-Time':String(stamp),'X-JWT-Setup-Nonce':nonce,'X-JWT-Setup-Source':c.source,'X-JWT-Setup-Manifest':c.manifestHash,'X-JWT-Setup-Proof':proof}});}catch{throw Error('SETUP_'+action.toUpperCase()+'_TRANSPORT_UNKNOWN');}
  if(response.headers.get('set-cookie')||!response.headers.get('cache-control')?.includes('no-store')||response.headers.get('x-content-type-options')!=='nosniff')throw Error('SETUP_HEADERS');
  const value=await boundedJSON(response);
  if(![200,409].includes(response.status))throw Error('SETUP_'+action.toUpperCase()+'_STATUS_'+response.status);
  if(!value||value.schema!==1||(phase==='schema'?value.stage!=='SCHEMA_ONLY':value.stage!==undefined)||Object.keys(value).some(k=>!allowed.includes(k))||!['UNCLAIMED','PREPARING','UNKNOWN','VERIFIED'].includes(value.state))throw Error('SETUP_RECEIPT');
  if(value.source!==c.source||value.manifestHash!==c.manifestHash||value.planId!==c.planId||JSON.stringify(value.databaseIds)!==JSON.stringify(c.databaseIds))throw Error('SETUP_BINDING');
  const safe={state:value.state,source:c.source,manifestHash:c.manifestHash,planId:c.planId,databaseIds:[...c.databaseIds]};
  if(value.state==='VERIFIED'){
   if(value.sourceDigest!==c.sourceDigest)throw Error('SETUP_NATIVE_RUN');
   const expected=phase==='schema'?{core:{objects:1372,tables:172,userRows:0,foreignKeyErrors:0,quickCheck:'ok',fingerprint:c.objectHashes.core},admin:{objects:83,tables:55,userRows:0,foreignKeyErrors:0,quickCheck:'ok',fingerprint:c.objectHashes.admin}}:{accounts:4,credentials:4,courses:2,sessions:0,families:0,foreignKeyErrors:0,quickCheck:'ok'};
   assert.deepEqual(value.verification,expected,'SETUP_COUNTS');
   safe.sourceDigest=c.sourceDigest;safe.verification={...value.verification};
  }
  if(phase==='schema')safe.stage='SCHEMA_ONLY';
  return safe;
 }
 return {request,async run(){
  let executeOutcome='returned';try{await request('execute');}catch(e){executeOutcome=e.message.startsWith('SETUP_')?e.message:'SETUP_EXECUTE_FAILED';}
  const receipt=await request('status');if(receipt.state!=='VERIFIED')throw Error('SETUP_NOT_VERIFIED_'+receipt.state);
  return {schema:1,phase,receipt,executeOutcome,executeRequests,statusRequests,sqlReplay:false};
 }};
}
