import {rootChildPINCSRF} from './root-child-pin-csrf.mjs';
// Dedicated child-only PIN producer. Actual native PIN verification is supplied
// by the closed-over owning worker callback. No Master issuer/refresh/clock API.
import {assertLocalIntegrationProfile} from './local-integration-profile.mjs';
import {cookieNames,parseUniqueCookie} from './claims.mjs';
import {fingerprint,randomRefresh} from './store.mjs';
import {consumeNativePINVerification} from './native-pin-proof.mjs';
import {verifyChildPINPacket,parseChildPINUnlock,childPINIntentDigest,signChildPINPacket,verifyChildPINReceipt} from './child-pin-unlock-contract.mjs';
import {d1ContextEqual} from '../../academy/d1/session.js';
const origin='https://ummabbadacademy.app';
const fail=(code='CHILD_PIN_PARENT_CHANGED',status=401)=>{throw Object.assign(Error(code),{code,status});};
const uint=v=>Number.isSafeInteger(v)&&v>=0;
const stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const tuple=['family_id','account_id','parent_session_id','browser_id','browser_generation','credential_epoch','unlock_generation','original_signed_in_at_s','original_expires_at_s'];
const parentSQL=`SELECT f.*,v.permission_version current_permission_version,n.login_link_id
 FROM jwt_v110_families f JOIN jwt_v110_accounts v USING(account_id)
 JOIN jwt_v110_browser_heads b USING(browser_id) JOIN accounts n USING(account_id)
 JOIN account_credentials c USING(account_id)
 JOIN account_sessions s ON s.session_id=f.family_id AND s.account_id=f.account_id
 WHERE (f.refresh_fp=? OR f.previous_fp=?) AND f.revoked=0 AND f.family_id=f.parent_session_id
 AND v.active=1 AND v.credential_epoch=f.credential_epoch AND n.active=1
 AND c.credential_epoch=f.credential_epoch AND c.pin_setup=1 AND length(trim(c.pin_hash))>0
 AND s.credential_epoch=f.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>?
 AND b.generation=f.browser_generation AND f.original_expires_at_s>?
 AND f.original_signed_in_at_s<=? AND f.original_expires_at_s-f.original_signed_in_at_s<=604800
 AND NOT EXISTS(SELECT 1 FROM jwt_v110_parent_tombstones t WHERE t.parent_session_id=f.parent_session_id)`;
const params=(fp,now)=>[fp,fp,new Date(now*1000).toISOString(),now,now];
function validate(parent,intent){
 if(!parent||!tuple.slice(0,4).every(k=>stable(parent[k]))||!tuple.slice(4).every(k=>uint(parent[k]))||!uint(parent.current_permission_version)||typeof parent.login_link_id!=='string'||!parent.login_link_id.trim()||parent.login_link_id.length>160)fail();
 const facts={parentAccountId:parent.account_id,parentId:parent.family_id,browserId:parent.browser_id,browserGeneration:parent.browser_generation,sourceCredentialEpoch:parent.credential_epoch,sourcePermissionVersion:parent.current_permission_version,originalSignedAtS:parent.original_signed_in_at_s,originalExpiresAtS:parent.original_expires_at_s};
 if(Object.keys(facts).some(k=>facts[k]!==intent[k]))fail();
}
function recapture(parent,fp,now){
 return {sql:'EXISTS(SELECT 1 FROM ('+parentSQL+') p WHERE '+tuple.map(k=>'p.'+k+'=?').join(' AND ')+' AND p.current_permission_version=? AND p.login_link_id=?)',args:[...params(fp,now),...tuple.map(k=>parent[k]),parent.current_permission_version,parent.login_link_id]};
}
function sameParent(before,after){if(!after||tuple.some(k=>before[k]!==after[k])||before.current_permission_version!==after.current_permission_version||before.login_link_id!==after.login_link_id)fail();}
function timestamp(clock){const ms=clock();if(!uint(ms)||Math.floor(ms/1000)>253401695999)fail('CHILD_PIN_CONFIG',503);return {ms,s:Math.floor(ms/1000)};}
async function boundedDeliver(deliver,packet){
 const controller=new AbortController();let settled=false,timer;
 try{return await new Promise((resolve,reject)=>{
  timer=setTimeout(()=>{if(settled)return;settled=true;reject(Object.assign(Error('Child PIN delivery unavailable'),{code:'CHILD_PIN_DELIVERY_UNCONFIRMED',status:503}));controller.abort();},5000);
  Promise.resolve().then(()=>deliver({...packet,signal:controller.signal,deadlineMs:5000})).then(value=>{if(!settled){settled=true;resolve(value);}},()=>{if(!settled){settled=true;reject(Object.assign(Error('Child PIN delivery unavailable'),{code:'CHILD_PIN_DELIVERY_UNCONFIRMED',status:503}));}});
 });}finally{clearTimeout(timer);}
}
export async function produceNativeChildPINUnlock({request,env,repository,app,intentBody,intentSignature,pin,authorize,verifyNativePIN,deliver,prepareClient,clock=Date.now}){
 assertLocalIntegrationProfile(env);
 const run=env.JWT_LOCAL_NATIVE_RUN_ID;
 if(env.JWT_LOCAL_CHILD_PIN!=='1'||env.JWT_V110_MASTER!=='1'||env.JWT_V110_NATIVE_COOKIE!=='1'||!/^[a-f0-9]{64}$/.test(run||'')||env.ACADEMY_D1_RUN_ID!==run||env.JWT_LOCAL_APP_BINDING!=='academy:'+run||typeof env.ACADEMY_DB?.withSession!=='function'||typeof repository?.session!=='function'||![authorize,verifyNativePIN,deliver,prepareClient,clock].every(f=>typeof f==='function')||!['studio','hifz'].includes(app))fail('CHILD_PIN_CONFIG',503);
 const url=new URL(request.url);
 if(url.origin!==origin||url.pathname!=='/auth/v110/child-pin/verify'||url.search||request.method!=='POST'||request.headers.get('Origin')!==origin||request.headers.get('Sec-Fetch-Site')!=='same-origin'||request.headers.has('Authorization')||request.headers.has('Host')&&request.headers.get('Host')!=='ummabbadacademy.app')fail('CHILD_PIN_ORIGIN_REJECTED',403);
 if(typeof pin!=='string'||!/^\d{4}$/.test(pin))fail('INVALID_PIN',400);
 const start=timestamp(clock),secret=env[app==='studio'?'JWT_LOCAL_CHILD_PIN_SECRET_STUDIO':'JWT_LOCAL_CHILD_PIN_SECRET_HIFZ'];
 if(typeof secret!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(secret))fail('CHILD_PIN_CONFIG',503);
 const childRunId=env[app==='studio'?'JWT_LOCAL_CHILD_RUN_ID_STUDIO':'JWT_LOCAL_CHILD_RUN_ID_HIFZ'];
 if(!/^[a-f0-9]{64}$/.test(childRunId||''))fail('CHILD_PIN_CONFIG',503);
 const intent=await verifyChildPINPacket({kind:'intent',body:intentBody,signature:intentSignature,secret,app,now:start.s,rootRunId:run,childRunId});
 const db=env.ACADEMY_DB.withSession('first-primary'),raw=parseUniqueCookie(request.headers.get('Cookie')||'',cookieNames.academy.refresh),fp=await fingerprint('academy',raw);
 const parent=await db.prepare(parentSQL).bind(...params(fp,start.s)).first();validate(parent,intent);
 await authorize({parent:Object.freeze(Object.fromEntries([...tuple,'current_permission_version'].map(k=>[k,parent[k]]))),intent,now:start.s});
 // Only this owning native callback receives the PIN; no caller-selected ID,
 // account setup, session creation or Master cookie issuance occurs here.
 const cap=await verifyNativePIN({uniqueid:parent.login_link_id,pin});
 const checkedAt=timestamp(clock),native=consumeNativePINVerification(cap,{accountId:parent.account_id,loginLinkId:parent.login_link_id,credentialEpoch:parent.credential_epoch,now:checkedAt.ms});
 const current=await db.prepare(parentSQL).bind(...params(fp,checkedAt.s)).first();validate(current,intent);sameParent(parent,current);
 const state=await repository.session(parent.family_id,parent.account_id,parent.credential_epoch,new Date(checkedAt.ms));
 if(!state||state.account.account_id!==parent.account_id||state.account.credential_epoch!==parent.credential_epoch||!state.contexts.some(c=>d1ContextEqual(c,native.context)))fail();
 const prepared=timestamp(clock);if(prepared.ms<checkedAt.ms||prepared.s-native.verifiedAtS>5)fail('CHILD_PIN_PREPARATION',503);
 const code=randomRefresh(),codeHash=await sha(code),intentDigest=await childPINIntentDigest(intent);
 const reply=await parseChildPINUnlock({ver:1,purpose:'uaa-child-pin-unlock-v1',issuer:origin,app,origin:intent.origin,intent,intentDigest,codeHash,childUnlockGeneration:intent.childUnlockGeneration+1,parentUnlockGeneration:parent.unlock_generation,pinVerifiedAtS:native.verifiedAtS,issuedAtS:prepared.s,expiresAtS:Math.min(intent.expiresAtS,native.verifiedAtS+60)},{app,now:prepared.s,intent});
 const packet=await signChildPINPacket({kind:'unlock',value:reply,secret}),replyDigest=await sha(packet.body);
 const response=await prepareClient({app,intentId:intent.intentId,code,state:intent.state,expiresAtS:reply.expiresAtS});
 if(!(response instanceof Response))fail('CHILD_PIN_PREPARATION',503);
 const commit=timestamp(clock);if(commit.ms<prepared.ms||commit.s-native.verifiedAtS>5)fail('CHILD_PIN_PREPARATION',503);
 const guard=recapture(parent,fp,commit.s),id=crypto.randomUUID();
 const results=await db.batch([
  db.prepare('INSERT INTO academy_write_guards(guard_id,accepted) SELECT ?,('+guard.sql+') AND ?<?').bind(id,...guard.args,commit.s,reply.expiresAtS),
  db.prepare('INSERT INTO jwt_v110_root_child_pin_proofs(app,intent_id,intent_digest,parent_family_id,parent_account_id,code_hash,reply_json,reply_signature,reply_digest,pin_verified_at_s,issued_at_s,expires_at_s) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) RETURNING intent_id').bind(app,intent.intentId,intentDigest,parent.family_id,parent.account_id,codeHash,packet.body,packet.signature,replyDigest,native.verifiedAtS,reply.issuedAtS,reply.expiresAtS),
  db.prepare('DELETE FROM academy_write_guards WHERE guard_id=?').bind(id)
 ]);
 if(results?.[1]?.results?.length!==1||results[1].results[0].intent_id!==intent.intentId)fail('CHILD_PIN_PRODUCER_COMMIT_UNCONFIRMED',503);
 const ack=await boundedDeliver(deliver,{app,body:packet.body,signature:packet.signature});
 await verifyChildPINReceipt({...ack,secret,expected:{app,intentId:intent.intentId,intentDigest,replyDigest,codeHash}});
 // A staged proof is not a browser credential. Release the prepared one-use
 // code only after exact child commit ACK and a current Root parent re-fence.
 const confirmed=timestamp(clock);if(confirmed.ms<commit.ms)fail('CHILD_PIN_DELIVERY_UNCONFIRMED',503);
 const final=recapture(parent,fp,confirmed.s),finalGuard=crypto.randomUUID();
 const delivered=await db.batch([
  db.prepare('INSERT INTO academy_write_guards(guard_id,accepted) SELECT ?,('+final.sql+') AND ?<? AND EXISTS(SELECT 1 FROM jwt_v110_root_child_pin_proofs WHERE app=? AND intent_id=? AND reply_digest=? AND code_hash=?)').bind(finalGuard,...final.args,confirmed.s,reply.expiresAtS,app,intent.intentId,replyDigest,codeHash),
  db.prepare('UPDATE jwt_v110_root_child_pin_proofs SET delivery_confirmed_at_s=? WHERE app=? AND intent_id=? AND reply_digest=? AND code_hash=? RETURNING intent_id').bind(confirmed.s,app,intent.intentId,replyDigest,codeHash),
  db.prepare('DELETE FROM academy_write_guards WHERE guard_id=?').bind(finalGuard)
 ]);
 if(delivered?.[1]?.results?.length!==1||delivered[1].results[0].intent_id!==intent.intentId)fail('CHILD_PIN_DELIVERY_UNCONFIRMED',503);
 const result={kind:'prepared-child-unlock'};Object.defineProperty(result,'clientResponse',{value:response});return Object.freeze(result);
}


// Exact Root form preparation reuses this owning producer's signed-intent and
// current-parent predicates. It performs no PIN check/session/family/FG write.
export async function prepareNativeRootChildPINForm({request,env,app,intentBody,intentSignature,clock=Date.now}){
 assertLocalIntegrationProfile(env);
 const run=env.JWT_LOCAL_NATIVE_RUN_ID,url=new URL(request.url);
 if(env.JWT_LOCAL_CHILD_PIN!=='1'||env.JWT_V110_MASTER!=='1'||env.JWT_V110_NATIVE_COOKIE!=='1'||!['studio','hifz'].includes(app)||!hexRun(run)||env.ACADEMY_D1_RUN_ID!==run||env.JWT_LOCAL_APP_BINDING!=='academy:'+run||typeof env.ACADEMY_DB?.withSession!=='function')fail('CHILD_PIN_CONFIG',503);
 if(url.origin!==origin||url.pathname!=='/auth/v110/child-pin/prepare'||url.search||request.method!=='POST'||request.headers.get('Origin')!==origin||request.headers.get('Sec-Fetch-Site')!=='same-origin'||request.headers.has('Authorization')||request.headers.has('Host')&&request.headers.get('Host')!=='ummabbadacademy.app')fail('CHILD_PIN_ORIGIN_REJECTED',403);
 const secret=env[app==='studio'?'JWT_LOCAL_CHILD_PIN_SECRET_STUDIO':'JWT_LOCAL_CHILD_PIN_SECRET_HIFZ'],childRunId=env[app==='studio'?'JWT_LOCAL_CHILD_RUN_ID_STUDIO':'JWT_LOCAL_CHILD_RUN_ID_HIFZ'];
 if(typeof secret!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(secret)||!hexRun(childRunId))fail('CHILD_PIN_CONFIG',503);
 const at=timestamp(clock),intent=await verifyChildPINPacket({kind:'intent',body:intentBody,signature:intentSignature,secret,app,now:at.s,rootRunId:run,childRunId});
 const raw=parseUniqueCookie(request.headers.get('Cookie')||'',cookieNames.academy.refresh),fp=await fingerprint('academy',raw),db=env.ACADEMY_DB.withSession('first-primary');
 const parent=await db.prepare(parentSQL).bind(...params(fp,at.s)).first();validate(parent,intent);
 const csrf=await rootChildPINCSRF(env,{parent,intent}),after=timestamp(clock);
 const current=await db.prepare(parentSQL).bind(...params(fp,after.s)).first();validate(current,intent);sameParent(parent,current);
 if(after.ms<at.ms||after.ms-at.ms>5000||after.s>=intent.expiresAtS)fail('CHILD_PIN_PREPARATION',503);
 return Object.freeze({app,intentId:intent.intentId,csrf,expiresAtS:intent.expiresAtS});
}
const hexRun=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);


// Pre-lookup metadata gate, intentionally no PIN attempt and no Master/FG write.
// Refresh ownership is checked against the CURRENT native Root parent; it grants
// only a bounded private intent lookup, not ordinary Root/child resource access.
export async function authorizeNativeRootChildPINLookup({request,env,app,clock=Date.now}){
 assertLocalIntegrationProfile(env);const url=new URL(request.url),run=env.JWT_LOCAL_NATIVE_RUN_ID;
 if(env.JWT_LOCAL_CHILD_PIN!=='1'||env.JWT_V110_MASTER!=='1'||env.JWT_V110_NATIVE_COOKIE!=='1'||!hexRun(run)||env.ACADEMY_D1_RUN_ID!==run||env.JWT_LOCAL_APP_BINDING!=='academy:'+run||!env.ACADEMY_DB?.withSession||typeof env.JWT_V110_RATE_LIMITER?.limit!=='function')fail('CHILD_PIN_CONFIG',503);
 if(!['studio','hifz'].includes(app)||url.origin!==origin||!['/auth/v110/child-pin/prepare','/auth/v110/child-pin/verify'].includes(url.pathname)||url.search||request.method!=='POST'||request.headers.get('Origin')!==origin||request.headers.get('Sec-Fetch-Site')!=='same-origin'||request.headers.has('Authorization')||request.headers.has('Host')&&request.headers.get('Host')!=='ummabbadacademy.app')fail('CHILD_PIN_ORIGIN_REJECTED',403);
 const at=timestamp(clock),db=env.ACADEMY_DB.withSession('first-primary'),raw=parseUniqueCookie(request.headers.get('Cookie')||'',cookieNames.academy.refresh),fp=await fingerprint('academy',raw);
 const parent=await db.prepare(parentSQL).bind(...params(fp,at.s)).first();
 if(!parent||!tuple.slice(0,4).every(k=>stable(parent[k]))||!tuple.slice(4).every(k=>uint(parent[k]))||!uint(parent.current_permission_version)||typeof parent.login_link_id!=='string'||!parent.login_link_id.trim())fail();
 const secret=env.JWT_V110_CSRF_SECRET;if(typeof secret!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(secret))fail('CHILD_PIN_CONFIG',503);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const rate=encodeLookupRate(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(['uaa-child-pin-metadata-v1',app,parent.family_id,parent.browser_generation])))));
 if((await env.JWT_V110_RATE_LIMITER.limit({key:'v110-child-pin-metadata-'+rate}))?.success!==true)fail('CHILD_PIN_METADATA_RATE_LIMITED',429);
 const after=timestamp(clock),current=await db.prepare(parentSQL).bind(...params(fp,after.s)).first();sameParent(parent,current);
 if(after.ms<at.ms||after.ms-at.ms>5000)fail('CHILD_PIN_PREPARATION',503);
 return Object.freeze({authorized:true});
}
const encodeLookupRate=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
