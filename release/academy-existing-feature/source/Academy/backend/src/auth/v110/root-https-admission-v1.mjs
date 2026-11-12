// Authenticated fixed HTTPS first-admission producer. Actual native Root authority.
// Root identity is bootstrap only; exact child commit ACK precedes code return.
import {requirePortableNativeMethod,verifyPortableNativeProfile,portableChildOrigins as origins} from './portable-native-profile-v5.mjs';
import {verifiedAcademyIdentityJWT} from './academy-cookie-auth-portable-v2.mjs';
import {sendNativeHTTPS} from './native-https-sender-v1.mjs';
import {exactRecord} from './native-https-contract-v1.mjs';
import {academyD1Repository} from '../../academy/d1/repository.js';
import {trustedCookieFacts,jwtSessionPredicate} from './academy-cookie-auth.mjs';
import {parseChildAdmission} from './child-admission-contract.mjs';
import {randomRefresh} from './store.mjs';
import {signAdmissionPacket,admissionPacketDigest,verifyAdmissionACK} from './child-admission-contract-https-v1.mjs';
const paths={studio:'/api/academy/website-studio/handoff',hifz:'/api/academy/hifz/sign-in'};
const fail=(code='NATIVE_CHILD_ADMISSION_REJECTED',status=401)=>{throw Object.assign(Error(code),{code,status});};
const encode=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const time=clock=>{const ms=clock();if(!Number.isSafeInteger(ms)||ms<0||Math.floor(ms/1000)>253401695999)fail('NATIVE_CHILD_ADMISSION_UNAVAILABLE',503);return {ms,s:Math.floor(ms/1000)};};
function currentPredicate(c,at,version,app){
 const jwt=jwtSessionPredicate(c,at.ms);
 const hifz=app==='hifz'?' AND EXISTS(SELECT 1 FROM hifz_profile_sync_projection p JOIN hifz_profile_sync q USING(account_id) WHERE p.account_id=a.account_id AND p.active=1)':'';
 return {sql:"EXISTS(SELECT 1 FROM accounts a JOIN account_credentials cred USING(account_id) JOIN account_sessions s USING(account_id) WHERE a.account_id=? AND a.active=1 AND cred.credential_epoch=? AND cred.pin_setup=1 AND length(trim(cred.pin_hash))>0 AND s.session_id=? AND s.credential_epoch=cred.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>?"+jwt.sql+hifz+" AND (SELECT version FROM split_read_state WHERE singleton=1)=?)",
  args:[c.sub,c.ce,c.sid,new Date(at.ms).toISOString(),...jwt.values,version]};
}
async function deliver(send,packet){
 const controller=new AbortController();let timer;
 try{return await Promise.race([Promise.resolve().then(()=>send({...packet,signal:controller.signal,deadlineMs:5000})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(Error('NATIVE_CHILD_ADMISSION_UNCONFIRMED'),{status:503}));},5000);})]);}
 finally{clearTimeout(timer);controller.abort();}
}
export async function handleRootHTTPSAdmission(packet,env,{clock=Date.now}={}){
 const profile=requirePortableNativeMethod(env,'academy','admission');await verifyPortableNativeProfile();
 const app=packet.from,run=profile.deploymentIds.academy;
 if(!Object.hasOwn(paths,app)||packet.to!=='academy'||packet.purpose!=='admission.request'||env.JWT_V110_NATIVE_COOKIE!=='1'||env.JWT_V110_MASTER!=='1'||typeof env.JWT_V110_RATE_LIMITER?.limit!=='function')fail('NATIVE_CHILD_ADMISSION_UNAVAILABLE',503);
 let input;try{input=JSON.parse(packet.body);exactRecord(input,['identityJWT','challenge','state']);}catch{fail('NATIVE_CHILD_ADMISSION_BODY',400);}
 if(![input.challenge,input.state].every(v=>typeof v==='string'&&/^[-A-Za-z0-9_]{43}$/.test(v)))fail('NATIVE_CHILD_ADMISSION_BODY',400);
 const secret=env['JWT_V110_CHILD_ADMISSION_SECRET_'+app.toUpperCase()],childRunId=profile.deploymentIds[app];
 if(typeof secret!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(secret))fail('NATIVE_CHILD_ADMISSION_UNAVAILABLE',503);
 const db=env.ACADEMY_DB.withSession('first-primary'),start=time(clock),version=await db.prepare('SELECT version FROM split_read_state WHERE singleton=1').first('version');
 if(!Number.isSafeInteger(version)||version<0)fail('NATIVE_CHILD_ADMISSION_UNAVAILABLE',503);
 const repository=academyD1Repository(env);let c;
 try{c=await verifiedAcademyIdentityJWT(input.identityJWT,env,start.s);}catch(e){if(e?.status===503)throw e;return JSON.stringify({code:'ACADEMY_RENEWAL_REQUIRED'});}
 const state=await repository.session(c.sid,c.sub,c.ce,new Date(start.ms),{jwtClaims:c});
 if(!state)return JSON.stringify({code:'ACADEMY_RENEWAL_REQUIRED'});
 if(!c||!state||c.sid!==c.psid||state.account.account_id!==c.sub||state.account.credential_epoch!==c.ce)fail();
 if(app==='studio'&&(!state.account.global_admin&&!state.roles.some(r=>r.role==='PROGRAM_ADMIN')))fail('NATIVE_CHILD_ADMISSION_AUTHORITY',403);
 if(app==='hifz'){
  const eligible=await db.prepare('SELECT p.account_id FROM hifz_profile_sync_projection p JOIN hifz_profile_sync q USING(account_id) WHERE p.account_id=? AND p.active=1').bind(c.sub).first();
  if(!eligible)fail('HIFZ_ACCESS_REQUIRED',403);
 }
 // Current signed access+native session+CSRF precede all private child IO.
 const budget=await signAdmissionPacket({secret,kind:'ack',value:['admission-budget-v1',app,c.sid,c.bv]});
 if((await env.JWT_V110_RATE_LIMITER.limit({key:'v110-child-admit-'+budget.signature}))?.success!==true)fail('NATIVE_CHILD_ADMISSION_RATE_LIMITED',429);
 const prepared=time(clock);if(prepared.ms<start.ms||prepared.ms-start.ms>5000)fail('NATIVE_CHILD_ADMISSION_UNAVAILABLE',503);
 const operationId=packet.requestId,code=randomRefresh(),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code)),codeHash=app==='studio'?[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''):encode(new Uint8Array(digest));
 const admission=parseChildAdmission({ver:1,purpose:'uaa-child-admission-v1',app,origin:origins[app],kind:'admit',operationId,challenge:input.challenge,state:input.state,parentAccountId:c.sub,parentId:c.sid,browserId:c.bsid,browserGeneration:c.bv,parentCredentialEpoch:c.ce,parentPermissionVersion:c.pv,parentUnlockGeneration:c.ue,originalSignedAtS:c.s_iat,originalExpiresAtS:c.s_exp,issuedAtS:prepared.s,expiresAtS:Math.min(prepared.s+60,c.s_exp)},{app,origin:origins[app],kind:'admit',challenge:input.challenge,state:input.state,now:prepared.s});
 const signed=await signAdmissionPacket({secret,value:{ver:1,purpose:'uaa-child-admission-delivery-v1',app,rootRunId:run,childRunId,codeHash,admission}}),packetDigest=await admissionPacketDigest(signed.body);
 const committed=time(clock);if(committed.ms<prepared.ms||committed.ms-start.ms>5000||committed.s>=admission.expiresAtS)fail('NATIVE_CHILD_ADMISSION_UNAVAILABLE',503);
 const guard=currentPredicate(c,committed,version,app),guardId=crypto.randomUUID();
 const result=await db.batch([
  db.prepare('INSERT INTO academy_write_guards(guard_id,accepted) SELECT ?,('+guard.sql+')').bind(guardId,...guard.args),
  db.prepare("INSERT INTO jwt_v110_security_audit(operation_id,family_id,event_type,occurred_at_s) VALUES(?,?,'child-admission-staged',?) RETURNING operation_id").bind(operationId,c.sid,committed.s),
  db.prepare('DELETE FROM academy_write_guards WHERE guard_id=?').bind(guardId)
 ]);
 if(result?.[1]?.results?.length!==1||result[1].results[0].operation_id!==operationId)fail('NATIVE_CHILD_ADMISSION_UNCONFIRMED',503);
 const rawACK=await sendNativeHTTPS(env,{from:'academy',to:app,purpose:'admission.stage',body:JSON.stringify({app,...signed,deadlineMs:5000}),requestId:operationId,clock});
 const ack=JSON.parse(rawACK);
 await verifyAdmissionACK({packet:ack,secret,expected:{app,operationId,codeHash,packetDigest}});
 const final=time(clock);if(final.ms<committed.ms||final.s>=admission.expiresAtS)fail('NATIVE_CHILD_ADMISSION_UNCONFIRMED',503);
 const fence=currentPredicate(c,final,version,app);
 if((await db.prepare('SELECT ('+fence.sql+') accepted').bind(...fence.args).first('accepted'))!==1)fail();
 // Raw one-use code leaves RAM only after exact native child commit ACK and
 // current Root re-fence. Neither own nor sibling foreground clocks move.
 return JSON.stringify({code,state:input.state,expiresAtS:admission.expiresAtS});
}
