import {portalNativeReadRequest} from '../src/academy/d1/portal.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {generateKeyPair,exportJWK} from 'jose';
import worker from '../src/academy-runtime.js';
import {prepareFeatureSeed,featureSyntheticAccounts} from '../tools/feature-synthetic-seed.mjs';
import {sqliteD1} from '../tools/academy-split/sqlite-d1.mjs';
import {emptyCompatibilityDatabase} from '../src/academy/separation/compatibility.js';
import {emptyShapes} from '../src/academy/separation/empty-shapes.js';
import {splitEngine} from '../src/academy/separation/engine.js';
import {verifySessionToken} from '../src/lib/auth-primitives.js';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {createAccountBoundAcademyRefresh} from '../src/auth/v110/academy-refresh.mjs';
import {createNativeCookieEngine} from '../src/auth/v110/native-rights.mjs';
import {fingerprint,randomRefresh} from '../src/auth/v110/store.mjs';
import {hosting} from '../src/academy/hosting.mjs';
const h=hosting(),appOrigin=h.academyApiOrigin,now=()=>Math.floor(Date.now()/1000);
const secrets=Object.fromEntries(['PIN_SECRET','SESSION_SECRET','SHARED_PIN_SECRET','ACADEMY_OPEN_LIBRARY_STORAGE_KEY'].map(k=>[k,crypto.randomUUID()+crypto.randomUUID()]));
const records=[];let remoteAttempts=0;
const withFamily=(fn,{age=0}={})=>async()=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{remoteAttempts++;throw Error('Unexpected remote call');};
 const seed=await prepareFeatureSeed({pin:'2468',secrets});const native=seed.databases.core;
 try{
  native.exec(readFileSync(new URL('./fixtures/jwt-v110-auth-only.sql',import.meta.url),'utf8'));
  let beforeBatch=null,stageHook=null,lastFailure='',rpcUnavailable=false;const rawCore=sqliteD1(native),observedCore={...rawCore,withSession(){return observedCore;},async batch(statements){await beforeBatch?.(statements);try{return await rawCore.batch(statements);}catch(error){lastFailure=String(error.message).replace(/[A-Za-z0-9_-]{24,}/g,'[redacted]').replace(/\b\d{4}\b/g,'[digits]');throw error;}}};
  const core=emptyCompatibilityDatabase(observedCore,emptyShapes,{currentGrants:true}),admin=sqliteD1(seed.databases.admin),engine=splitEngine({core,admin,hook:async(...args)=>stageHook?.(...args)});
  const ns={getByName(){return Object.fromEntries(['read','write'].map(m=>[m,async(...args)=>{if(rpcUnavailable)throw Error('Controlled local coordinator outage');return {result:await engine[m](...JSON.parse(JSON.stringify(args)))};}]));}};
  const keys=await generateKeyPair('ES256',{extractable:true}),publicJWK={...await exportJWK(keys.publicKey),kid:'synthetic-a'},privateJWK={...await exportJWK(keys.privateKey),kid:'synthetic-a'};
  const cfg=JSON.parse(readFileSync(new URL('../wrangler.feature.jsonc',import.meta.url),'utf8'));
  const env={...cfg.vars,...secrets,ACADEMY_D1_MODE:'ACTIVE',ACADEMY_D1_RUN_ID:seed.report.sourceDigest,ACADEMY_DB:observedCore,ACADEMY_ADMIN_DB:admin,ACADEMY_SPLIT_COORDINATOR:ns,AUTH_LOGIN_RATE_LIMITER:{limit:async()=>({success:true})},JWT_V110_MASTER:'1',JWT_V110_REFRESH:'1',JWT_V110_BROWSER:'1',JWT_V110_REQUEST_ORIGIN:appOrigin,JWT_V110_PUBLIC_KEYS_JSON:JSON.stringify([publicJWK]),JWT_V110_PRIVATE_KEY_JSON:JSON.stringify(privateJWK),JWT_V110_SIGNING_KID:'synthetic-a',JWT_V110_CSRF_SECRET:randomRefresh(),JWT_V110_RATE_LIMITER:{limit:async()=>({success:true})},ALLOWED_ORIGINS:appOrigin+','+h.academyPortalOrigin};
  const loginResponse=await worker.fetch(new Request(appOrigin+'/api/account/login',{method:'POST',headers:{Origin:h.academyPortalOrigin,'Content-Type':'application/json'},body:JSON.stringify({uniqueid:featureSyntheticAccounts[0].login,pin:'2468'})}),env);
  assert.equal(loginResponse.status,200,'Native PIN prerequisite failed');const login=await loginResponse.json(),nativeClaims=await verifySessionToken(login.token,env),sid=nativeClaims.sid,id=nativeClaims.accountid,ce=nativeClaims.epoch;
  const raw=randomRefresh(),fp=await fingerprint('academy',raw),at=now()-age,browser=crypto.randomUUID();
  if(age)native.prepare('UPDATE account_sessions SET created_at=?,expires_at=? WHERE session_id=?').run(new Date(at*1000).toISOString(),new Date((at+604800)*1000).toISOString(),sid);
  native.prepare('INSERT INTO jwt_v110_accounts VALUES(?,?,?,1)').run(id,ce,1);
  native.prepare('INSERT INTO jwt_v110_browser_heads(browser_id,generation) VALUES(?,1)').run(browser);
  native.prepare('INSERT INTO jwt_v110_families(family_id,account_id,parent_session_id,browser_id,browser_generation,credential_epoch,permission_version,refresh_fp,original_signed_in_at_s,original_expires_at_s,last_fg_refresh_s,rotated_at_s) VALUES(?,?,?,?,1,?,1,?,?,?,?,?)').run(sid,id,sid,browser,ce,fp,at,at+604800,at,at);
  const config={app:'academy',issuer:'https://ummabbadacademy.app',academyCookieDomain:'ummabbadacademy.app',publicKeys:[publicJWK],signingKey:keys.privateKey,signingKid:'synthetic-a'};
  const row=()=>native.prepare('SELECT * FROM jwt_v110_families WHERE family_id=?').get(sid);
  async function call(path,{method=path.endsWith('/csrf')?'GET':'POST',body={},cookie='__Host-uaa_r='+raw,proof,origin=appOrigin,site='same-origin',extra={}}={}){
   const response=await worker.fetch(new Request(appOrigin+path,{method,headers:{Origin:origin,'Sec-Fetch-Site':site,'Content-Type':'application/json',Cookie:cookie,...(proof?{'X-UAA-CSRF':proof}:{}),...extra},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),env);
   const data=await response.json();return {status:response.status,data,response};
  }
  const csrf=async()=>{const r=await call('/auth/v110/csrf');assert.equal(r.status,200,'Own CSRF prerequisite failed: '+r.data.code);return r.data.csrf;};
  await fn({seed,native,env,raw,fp,sid,id,ce,at,browser,config,row,call,csrf,lastFailure:()=>lastFailure,engine,setRPCUnavailable:value=>rpcUnavailable=value,setBeforeBatch:fn=>beforeBatch=fn,setStageHook:fn=>stageHook=fn});
 }finally{seed.close();globalThis.fetch=originalFetch;}
};
test('Real native Academy PIN session refreshes into full-rights JWT cookies without exposing credentials',withFamily(async f=>{
 const proof=await f.csrf(),r=await f.call('/auth/v110/refresh',{proof});assert.equal(r.status,200,r.data.code);assert.deepEqual(r.data,{refreshed:true});
 const cookies=r.response.headers.getSetCookie();assert.equal(cookies.length,2);assert(cookies.every(c=>c.includes('HttpOnly')&&c.includes('Secure')));
 const access=cookies.find(c=>c.startsWith('__Secure-uaa_a='));assert(access.includes('Domain=ummabbadacademy.app'));
 const verified=await (await createNativeCookieEngine(f.config)).verify(access.split(';')[0].split('=')[1],now());assert.equal(verified.claims.sub,f.id);assert.equal(verified.claims.sid,f.sid);assert.equal(verified.claims.ce,f.ce);assert.equal(verified.rights.globalAdmin,true);assert.equal(verified.claims.exp-verified.claims.iat,900);
 assert.equal(f.row().refresh_generation,1);assert.equal(f.row().original_expires_at_s,f.at+604800);assert.equal(f.row().last_fg_refresh_s,f.at);assert.equal(f.native.prepare('SELECT count(*) n FROM jwt_v110_security_audit').get().n,1);
 const context=await f.call('/auth/v110/context',{method:'GET',cookie:access.split(';')[0]});assert.equal(context.status,200,context.data.code);assert.equal(context.data.session.parentId,f.sid);
 assert(!JSON.stringify(r.data).includes(verified.claims.sub));records.push({case:'native-http-refresh',success:true,fullNativeRights:true,existingPINSessionPrerequisite:true,masterIssuerProved:false});
}));
test('Twelve concurrent native refreshes commit one successor and one audit',withFamily(async f=>{
 const proof=await f.csrf(),results=await Promise.all(Array.from({length:12},()=>f.call('/auth/v110/refresh',{proof})));
 assert.equal(results.filter(r=>r.status===200).length,1);assert(results.filter(r=>r.status!==200).every(r=>r.status===409));assert.equal(f.row().refresh_generation,1);assert.equal(f.native.prepare('SELECT count(*) n FROM jwt_v110_security_audit').get().n,1);
}));
test('Cross-site, wrong-origin, missing/forged CSRF and duplicate cookies cannot rotate',withFamily(async f=>{
 const proof=await f.csrf();
 for(const options of [{proof,site:'cross-site'},{proof,origin:'https://untrusted.invalid'},{},{proof:randomRefresh()},{proof,cookie:'__Host-uaa_r='+f.raw+'; __Host-uaa_r='+f.raw}]){
  const r=await f.call('/auth/v110/refresh',options);assert([401,403].includes(r.status),'Unexpected denial '+r.status);assert.equal(f.row().refresh_generation,0);
 }
}));
test('Default-off, absent rate binding, invalid key registry and wrong methods fail closed',withFamily(async f=>{
 const proof=await f.csrf();f.env.JWT_V110_REFRESH='0';assert.equal((await f.call('/auth/v110/refresh',{proof})).status,404);f.env.JWT_V110_REFRESH='1';
 const rate=f.env.JWT_V110_RATE_LIMITER;delete f.env.JWT_V110_RATE_LIMITER;assert.equal((await f.call('/auth/v110/refresh',{proof})).status,503);f.env.JWT_V110_RATE_LIMITER=rate;
 f.env.JWT_V110_SIGNING_KID='other';assert.equal((await f.call('/auth/v110/refresh',{proof})).status,503);f.env.JWT_V110_SIGNING_KID='synthetic-a';
 assert.equal((await f.call('/auth/v110/refresh',{method:'GET',proof})).status,405);assert.equal(f.row().refresh_generation,0);
}));
test('Oversized, unknown and non-object refresh bodies make no rotation',withFamily(async f=>{
 const proof=await f.csrf();for(const body of ['x'.repeat(1200),{background:true},[],{foreground:'yes'}]){
  assert.equal((await f.call('/auth/v110/refresh',{proof,body})).status,400);assert.equal(f.row().refresh_generation,0);
 }
}));
test('Native epoch, inactive account, revoked native session and parent tombstone independently deny renewal',async t=>{
 for(const name of ['epoch','inactive','session','parent'])await t.test(name,withFamily(async f=>{
  const proof=await f.csrf();
  if(name==='epoch')f.native.prepare('UPDATE account_credentials SET credential_epoch=credential_epoch+1 WHERE account_id=?').run(f.id);
  if(name==='inactive')f.native.prepare('UPDATE accounts SET active=0 WHERE account_id=?').run(f.id);
  if(name==='session')f.native.prepare('UPDATE account_sessions SET revoked_at=? WHERE session_id=?').run(new Date().toISOString(),f.sid);
  if(name==='parent')f.native.prepare('INSERT INTO jwt_v110_parent_tombstones VALUES(?,?)').run(f.sid,f.at+604800);
  assert.equal((await f.call('/auth/v110/refresh',{proof})).status,401);assert.equal(f.row().refresh_generation,0);assert(f.row().refresh_fp===f.fp,'Old refresh must remain current');
 }));
});
test('Changed native rights during signing are re-prepared before the CAS',withFamily(async f=>{
 let changed=false;const service=await createAccountBoundAcademyRefresh({binding:f.env.ACADEMY_DB,repository:academyD1Repository(f.env),...f.config,authorizeRotation:async()=>{if(!changed){changed=true;f.native.prepare("UPDATE global_role_assignments SET active=0 WHERE account_id=?").run(f.id);}}});
 const result=await service.refreshAndIssue(f.raw);assert.equal(result.kind,'rotated');assert.equal(result.claims.sub,f.id);const verified=await (await createNativeCookieEngine(f.config)).verify(result.setCookies[0].split(';')[0].split('=')[1],now());assert.equal(verified.rights.globalAdmin,false);assert.equal(f.row().refresh_generation,1);
 assert.equal(Object.keys(result).includes('setCookies'),false);assert.equal(Object.keys(result).includes('claims'),false);
}));
test('Native epoch change after preparation commits no replacement',withFamily(async f=>{
 let changed=false;const service=await createAccountBoundAcademyRefresh({binding:f.env.ACADEMY_DB,repository:academyD1Repository(f.env),...f.config,authorizeRotation:async()=>{if(!changed){changed=true;f.native.prepare('UPDATE account_credentials SET credential_epoch=credential_epoch+1 WHERE account_id=?').run(f.id);}}});
 await assert.rejects(service.refreshAndIssue(f.raw),e=>e.code==='SESSION_ENDED');assert(f.row().refresh_fp===f.fp,'Old refresh must remain current');assert.equal(f.row().refresh_generation,0);
}));
test('Audit failure rolls back the primary CAS and retains the old secret',withFamily(async f=>{
 const proof=await f.csrf();f.native.exec("CREATE TRIGGER jwt_test_audit_failure BEFORE INSERT ON jwt_v110_security_audit BEGIN SELECT RAISE(ABORT,'AUDIT_TEST_FAILURE'); END;");
 assert.equal((await f.call('/auth/v110/refresh',{proof})).status,503);assert(f.row().refresh_fp===f.fp,'Old refresh must remain current');assert.equal(f.row().refresh_generation,0);assert.equal(f.native.prepare('SELECT count(*) n FROM jwt_v110_security_audit').get().n,0);
}));
test('A signing-capacity failure leaves the old refresh current',withFamily(async f=>{
 const service=await createAccountBoundAcademyRefresh({binding:f.env.ACADEMY_DB,repository:academyD1Repository(f.env),...f.config,maxTokenBytes:100});
 await assert.rejects(service.refreshAndIssue(f.raw),e=>e.code==='CLAIMS_TOO_LARGE');assert(f.row().refresh_fp===f.fp,'Old refresh must remain current');assert.equal(f.row().refresh_generation,0);
}));
test('Background and foreground refresh respect the original deadline and own ninety-minute clock',withFamily(async f=>{
 const service=await createAccountBoundAcademyRefresh({binding:f.env.ACADEMY_DB,repository:academyD1Repository(f.env),...f.config,clock:()=>f.at+60});
 const result=await service.refreshAndIssue(f.raw,{foreground:true});assert.equal(result.kind,'rotated');assert.equal(f.row().last_fg_refresh_s,f.at+60);assert.equal(f.row().original_expires_at_s,f.at+604800);
 const successor=result.setCookies[1].split(';')[0].split('=')[1],expired=await createAccountBoundAcademyRefresh({binding:f.env.ACADEMY_DB,repository:academyD1Repository(f.env),...f.config,clock:()=>f.at+60+5400});
 await assert.rejects(expired.refreshAndIssue(successor,{foreground:true}),e=>e.code==='PIN_REQUIRED');assert.equal(f.row().last_fg_refresh_s,f.at+60);assert.equal(f.row().refresh_generation,1);
}));
test('Prepared token expiry elapsing before commit cannot consume the refresh secret',withFamily(async f=>{
 let calls=0;const service=await createAccountBoundAcademyRefresh({binding:f.env.ACADEMY_DB,repository:academyD1Repository(f.env),...f.config,clock:()=>f.at+(calls++===0?0:901)});
 await assert.rejects(service.refreshAndIssue(f.raw),e=>e.code==='PREPARATION_EXPIRED');assert(f.row().refresh_fp===f.fp,'Old refresh must remain current');assert.equal(f.row().refresh_generation,0);
}));

test('Real native PIN creates the first JWT family and returns cookies, not a legacy bearer',withFamily(async f=>{
 f.native.exec('DELETE FROM jwt_v110_families; DELETE FROM jwt_v110_browser_heads; DELETE FROM jwt_v110_accounts;');
 f.native.prepare('UPDATE account_sessions SET revoked_at=?').run(new Date().toISOString());
 const r=await f.call('/auth/v110/login',{cookie:'',body:{uniqueid:featureSyntheticAccounts[0].login,pin:'2468'}});
 assert.equal(r.status,200,r.data.code);assert.equal(r.data.success,true);assert.equal(r.data.cookieSession,true);assert(!Object.hasOwn(r.data,'token'));assert.equal(r.response.headers.getSetCookie().length,2);
 const access=r.response.headers.getSetCookie().find(c=>c.startsWith('__Secure-uaa_a=')).split(';')[0];
 const verified=await (await createNativeCookieEngine(f.config)).verify(access.split('=')[1],now());assert.equal(verified.claims.sub,f.id);assert.equal(verified.rights.globalAdmin,true);
 assert.equal(r.data.browserContext.sessionId,verified.claims.sid);assert.equal(r.data.browserContext.parentId,verified.claims.sid);assert.equal(r.data.sessionKey,'uaa-session:'+verified.claims.sid+':0');
 const row=f.native.prepare('SELECT * FROM jwt_v110_families').get(),session=f.native.prepare('SELECT * FROM account_sessions WHERE session_id=?').get(row.family_id);
 assert.equal(row.original_signed_in_at_s,Math.floor(Date.parse(session.created_at)/1000));assert.equal(row.original_expires_at_s,Math.floor(Date.parse(session.expires_at)/1000));assert.equal(row.refresh_generation,1);assert.equal(row.revoked,0);
 const cookie=r.response.headers.getSetCookie().find(c=>c.startsWith('__Host-uaa_r=')).split(';')[0];
 const repeat=await f.call('/auth/v110/refresh',{cookie,proof:r.data.csrf});assert.equal(repeat.status,200,repeat.data.code);records.push({case:'native-pin-to-first-jwt',nativePinToJWTInSQLite:true,hostDeliveryProved:false});
}));
test('Wrong PIN, native limiter denial and bad signer cannot create a JWT session',withFamily(async f=>{
 const nativeCount=()=>f.native.prepare('SELECT count(*) n FROM account_sessions').get().n;
 const before=nativeCount();let r=await f.call('/auth/v110/login',{body:{uniqueid:featureSyntheticAccounts[0].login,pin:'1111'}});assert.equal(r.status,401);assert.equal(nativeCount(),before);assert.equal(f.row().refresh_generation,0);
 f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:false})};r=await f.call('/auth/v110/login',{body:{uniqueid:featureSyntheticAccounts[0].login,pin:'2468'}});assert.equal(r.status,429);assert.equal(nativeCount(),before);
 f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};f.env.JWT_V110_SIGNING_KID='not-pinned';r=await f.call('/auth/v110/login',{body:{uniqueid:featureSyntheticAccounts[0].login,pin:'2468'}});assert.equal(r.status,503);assert.equal(nativeCount(),before);assert.equal(r.response.headers.getSetCookie().length,0);
}));
test('A native PIN unlock after ninety minutes keeps the old parent and seven-day deadline',withFamily(async f=>{
 assert.equal((await f.call('/auth/v110/csrf')).status,401);const previous=f.row();
 const r=await f.call('/auth/v110/login',{body:{uniqueid:featureSyntheticAccounts[0].login,pin:'2468'}});
 assert.equal(r.status,200,r.data.code);assert.equal(r.data.browserContext.sessionId,f.sid);assert.equal(r.data.browserContext.unlockGeneration,1);
 assert.equal(f.row().original_signed_in_at_s,previous.original_signed_in_at_s);assert.equal(f.row().original_expires_at_s,previous.original_expires_at_s);assert.equal(f.row().parent_session_id,f.sid);assert.equal(f.row().browser_generation,1);assert(f.row().last_fg_refresh_s>=now()-1);assert.equal(f.row().unlock_generation,1);
 const active=f.native.prepare('SELECT count(*) n FROM account_sessions WHERE account_id=? AND revoked_at IS NULL').get(f.id).n;assert.equal(active,1);
},{age:7200}));
test('Switching with a different verified native PIN revokes the prior local parent atomically',withFamily(async f=>{
 const r=await f.call('/auth/v110/login',{body:{uniqueid:featureSyntheticAccounts[2].login,pin:'2468'}});
 assert.equal(r.status,200,r.data.code);assert.equal(r.data.browserContext.accountId,featureSyntheticAccounts[2].id);assert.notEqual(r.data.browserContext.sessionId,f.sid);assert.equal(r.data.browserContext.browserId,f.browser);assert.equal(r.data.browserContext.browserGeneration,2);
 assert.equal(f.row().revoked,1);assert(f.native.prepare('SELECT revoked_at FROM account_sessions WHERE session_id=?').get(f.sid).revoked_at);
 assert(f.native.prepare('SELECT 1 FROM jwt_v110_parent_tombstones WHERE parent_session_id=?').get(f.sid));
 assert.equal(f.native.prepare('SELECT count(*) n FROM accounts').get().n,4);
}));
test('Failed prepared client response cannot rotate an existing refresh family',withFamily(async f=>{
 const service=await createAccountBoundAcademyRefresh({binding:f.env.ACADEMY_DB,repository:academyD1Repository(f.env),...f.config,prepareClient:async()=>{throw Error('Controlled preparation failure');}});
 await assert.rejects(service.refreshAndIssue(f.raw),/Controlled preparation failure/);assert(f.row().refresh_fp===f.fp,'Old refresh must remain current');assert.equal(f.row().refresh_generation,0);
}));
test('Native PIN rejects cross-origin, cross-site, unknown and oversized input before session creation',withFamily(async f=>{
 const count=f.native.prepare('SELECT count(*) n FROM account_sessions').get().n;
 for(const options of [{origin:'https://untrusted.invalid'},{site:'cross-site'},{body:{uniqueid:featureSyntheticAccounts[0].login,pin:'2468',identityConfirmed:true}},{body:'x'.repeat(5000)}]){
  const r=await f.call('/auth/v110/login',options);assert([400,403].includes(r.status));assert.equal(r.response.headers.getSetCookie().length,0);
 }
 assert.equal(f.native.prepare('SELECT count(*) n FROM account_sessions').get().n,count);assert.equal(f.row().refresh_generation,0);
}));


test('Native website admission removed between state load and verification cannot enter a committed token',withFamily(async f=>{
 f.env.ACADEMY_WEB_PLATFORM='1';f.native.prepare("UPDATE global_role_assignments SET active=0 WHERE account_id=?").run(f.id);f.native.prepare("INSERT INTO website_platform_admissions(account_id,active) VALUES(?,1) ON CONFLICT(account_id) DO UPDATE SET active=1").run(f.id);
 const repo=academyD1Repository(f.env),load=repo.session.bind(repo);let removed=false,observed=false;
 repo.session=async(...args)=>{const state=await load(...args);if(!removed){assert(state.contexts.some(c=>c.scope==='WEBSITE'));observed=true;removed=true;f.native.prepare("UPDATE website_platform_admissions SET active=0 WHERE account_id=?").run(f.id);}return state;};
 const service=await createAccountBoundAcademyRefresh({binding:f.env.ACADEMY_DB,repository:repo,...f.config});
 const result=await service.refreshAndIssue(f.raw);assert.equal(result.kind,'rotated');assert(observed);assert.equal(f.row().refresh_generation,1);
 const v=await (await createNativeCookieEngine(f.config)).verify(result.setCookies[0].split(';')[0].split('=')[1],now());assert.equal(v.rights.websiteAdmitted,false);
}));
test('A stale cached WEBSITE context never substitutes for current native admission',withFamily(async f=>{
 f.env.ACADEMY_WEB_PLATFORM='1';f.native.prepare("UPDATE global_role_assignments SET active=0 WHERE account_id=?").run(f.id);f.native.prepare("INSERT INTO website_platform_admissions(account_id,active) VALUES(?,1) ON CONFLICT(account_id) DO UPDATE SET active=1").run(f.id);
 const repo=academyD1Repository(f.env),stale=await repo.session(f.sid,f.id,f.ce);assert(stale.contexts.some(c=>c.scope==='WEBSITE'));
 f.native.prepare("UPDATE website_platform_admissions SET active=0 WHERE account_id=?").run(f.id);repo.session=async()=>stale;
 const service=await createAccountBoundAcademyRefresh({binding:f.env.ACADEMY_DB,repository:repo,...f.config});const result=await service.refreshAndIssue(f.raw);assert.equal(result.kind,'rotated');
 const v=await (await createNativeCookieEngine(f.config)).verify(result.setCookies[0].split(';')[0].split('=')[1],now());assert.equal(v.rights.websiteAdmitted,false);
}));


test('Prepared client response survives the CAS privately without entering public JSON',withFamily(async f=>{
 const service=await createAccountBoundAcademyRefresh({binding:f.env.ACADEMY_DB,repository:academyD1Repository(f.env),...f.config,prepareClient:async()=>()=>Response.json({ready:true})});
 const result=await service.refreshAndIssue(f.raw);assert.equal(result.kind,'rotated');assert(result.clientResponse instanceof Response);assert.deepEqual(await result.clientResponse.json(),{ready:true});assert.equal(Object.keys(result).includes('clientResponse'),false);
}));


test('Cookie-backed native session and material reads preserve the existing owner scope',withFamily(async f=>{
 f.env.JWT_V110_NATIVE_COOKIE='1';
 const pin=await f.call('/auth/v110/login',{body:{uniqueid:featureSyntheticAccounts[2].login,pin:'2468'}});assert.equal(pin.status,200,pin.data.code);
 const cookie=pin.response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),proof=pin.data.csrf,extra={Authorization:'Bearer '+pin.data.sessionKey,'X-UAA-CSRF':proof};
 const me=await f.call('/api/account/session',{cookie,extra});assert.equal(me.status,200,me.data.code);assert.equal(me.data.account.accountId,featureSyntheticAccounts[2].id);assert.equal(me.data.cookieSession,true);assert.equal(me.data.context.role,'STUDENT');
 const yes=await f.call('/api/academy/lesson-media/list',{cookie,extra:{...extra,'X-Academy-Workspace':'LEARN'},body:{activityKey:'COURSE:FEATURE-SYNTHETIC-A'}});assert.equal(yes.status,200,yes.data.code);
 const no=await f.call('/api/academy/lesson-media/list',{cookie,extra:{...extra,'X-Academy-Workspace':'LEARN'},body:{activityKey:'COURSE:FEATURE-SYNTHETIC-B'}});assert.equal(no.status,403);
 const noCSRF=await f.call('/api/account/session',{cookie,extra:{Authorization:extra.Authorization}});assert.equal(noCSRF.status,403);
 const noCookie=await f.call('/api/account/session',{cookie:'',extra});assert.equal(noCookie.status,401);
 const oldNative=await f.call('/api/account/login',{cookie,body:{uniqueid:featureSyntheticAccounts[2].login,pin:'2468'}});assert.equal(oldNative.status,409);
}));
test('Forging a context selector cannot grant an unassigned role',withFamily(async f=>{
 f.env.JWT_V110_NATIVE_COOKIE='1';const pin=await f.call('/auth/v110/login',{body:{uniqueid:featureSyntheticAccounts[2].login,pin:'2468'}});assert.equal(pin.status,200,pin.data.code);
 const cookie=pin.response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),c=pin.data.browserContext;
 const value={sid:c.sessionId,ue:c.unlockGeneration,scope:'PLATFORM',courseId:'',role:'GLOBAL_ADMIN'};
 const encoded=Buffer.from(JSON.stringify(value)).toString('base64url');
 const r=await f.call('/api/account/session',{cookie,extra:{Authorization:'Bearer uaa-context:'+encoded,'X-UAA-CSRF':pin.data.csrf}});assert.equal(r.status,401);
}));
test('The explicit isolated Feature cookie profile is host-only and cannot be enabled for another environment',withFamily(async f=>{
 const host='https://feature_worker.maktab4life.workers.dev';f.env.JWT_V110_REQUEST_ORIGIN=host;f.env.JWT_V110_COOKIE_MODE='HOST_ONLY_PREVIEW';f.env.ALLOWED_ORIGINS=host;
 const call=async()=>worker.fetch(new Request(host+'/auth/v110/login',{method:'POST',headers:{Origin:host,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify({uniqueid:featureSyntheticAccounts[0].login,pin:'2468'})}),f.env);
 const r=await call();assert.equal(r.status,200,'Explicit Feature cookie profile must work');assert(r.headers.getSetCookie().every(c=>!c.includes('Domain=')));assert(r.headers.getSetCookie().every(c=>c.includes('Secure')&&c.includes('HttpOnly')&&c.includes('SameSite=Lax')));
 f.env.ENVIRONMENT='production';const blocked=await call();assert.equal(blocked.status,503);assert.equal(blocked.headers.getSetCookie().length,0);
}));
test('An asynchronous final response factory fails before consuming the current refresh',withFamily(async f=>{
 const service=await createAccountBoundAcademyRefresh({binding:f.env.ACADEMY_DB,repository:academyD1Repository(f.env),...f.config,prepareClient:async()=>async()=>Response.json({ready:true})});
 await assert.rejects(service.refreshAndIssue(f.raw),e=>e.code==='INVALID_PREPARATION');assert(f.row().refresh_fp===f.fp,'Old refresh must remain current');assert.equal(f.row().refresh_generation,0);
}));


async function nativeCookieLogin(f,index=0){
 f.env.JWT_V110_NATIVE_COOKIE='1';
 const pin=await f.call('/auth/v110/login',{body:{uniqueid:featureSyntheticAccounts[index].login,pin:'2468'}});
 assert.equal(pin.status,200,pin.data.code);
 return {cookie:pin.response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),extra:{Authorization:'Bearer '+pin.data.sessionKey,'X-UAA-CSRF':pin.data.csrf},pin};
}
test('Native cookie configuration failures remain 503; client CSRF failures remain 403',withFamily(async f=>{
 const auth=await nativeCookieLogin(f);
 for(const [key,value] of [['JWT_V110_PUBLIC_KEYS_JSON','{'],['JWT_V110_PUBLIC_KEYS_JSON','[]'],['JWT_V110_REQUEST_ORIGIN','not an origin'],['JWT_V110_CSRF_SECRET','bad']]){
  const old=f.env[key],before=f.row().refresh_generation;f.env[key]=value;
  const r=await f.call('/api/account/session',auth);assert.equal(r.status,503,key);assert.equal(r.response.headers.getSetCookie().length,0);assert.equal(f.row().refresh_generation,before);f.env[key]=old;
 }
 const savedSecret=f.env.JWT_V110_CSRF_SECRET;f.env.JWT_V110_CSRF_SECRET='A'.repeat(42)+'B';
 for(const clientProof of [undefined,'bad']){const extra={...auth.extra};if(clientProof===undefined)delete extra['X-UAA-CSRF'];else extra['X-UAA-CSRF']=clientProof;const broken=await f.call('/api/account/session',{...auth,extra});assert.equal(broken.status,503,'Noncanonical server configuration must precede client CSRF rejection');}
 f.env.JWT_V110_CSRF_SECRET=savedSecret;
 const bad=await f.call('/api/account/session',{...auth,extra:{...auth.extra,'X-UAA-CSRF':randomRefresh()}});assert.equal(bad.status,403);
}));
test('Core-only actual bookmark save rechecks JWT cancellation at its final transaction',withFamily(async f=>{
 const auth=await nativeCookieLogin(f),path='/api/academy/bookmarks/save',file='/pdf-file/'+Buffer.from('https://archive.org/download/synthetic/fixture.pdf').toString('base64url');
 const save=page=>f.call(path,{...auth,extra:{...auth.extra,'X-Academy-Workspace':'ADMIN'},body:{bookmark:{file,title:'Synthetic fixture',page,pageLabel:String(page)}}});
 let ownerWrites=0;f.setStageHook(stage=>{if(stage==='admin-applied')ownerWrites++;});
 const yes=await save(1);assert.equal(yes.status,200,yes.data.code);assert.equal(ownerWrites,0,'This actual protected route must use the ordinary Core-only transaction');
 const before=f.native.prepare('SELECT count(*) n FROM academy_pdf_bookmarks').get().n,audit=f.native.prepare('SELECT count(*) n FROM audit_events').get().n;
 let raced=false;f.setBeforeBatch(statements=>{
  if(!raced&&statements.some(s=>/INSERT\s+INTO\s+["`]?academy_pdf_bookmarks/i.test(s.sql))){raced=true;f.native.prepare('UPDATE jwt_v110_families SET unlock_generation=unlock_generation+1 WHERE family_id=?').run(f.sid);}
 });
 const no=await save(2);assert(raced,'The mutation must occur after authentication before the Core transaction');assert.notEqual(no.status,200);assert.equal(ownerWrites,0);assert.equal(f.native.prepare('SELECT count(*) n FROM academy_pdf_bookmarks').get().n,before);assert.equal(f.native.prepare('SELECT count(*) n FROM audit_events').get().n,audit);assert.equal(f.native.prepare('SELECT revoked_at FROM account_sessions WHERE session_id=?').get(f.sid).revoked_at,null);
}));
test('Actual Course card owner save rolls back Admin if the JWT is superseded after Admin staging',withFamily(async f=>{
 const auth=await nativeCookieLogin(f),base='/api/admin/platform/courses/',courseId='FEATURE-SYNTHETIC-A';
 const get=()=>f.call(base+'get',{...auth,extra:{...auth.extra,'X-Academy-Workspace':'ADMIN'},body:{courseId}});
 const first=await get();assert.equal(first.status,200,first.data.code);
 const save=(revision,title)=>f.call(base+'public-card-save',{...auth,extra:{...auth.extra,'X-Academy-Workspace':'ADMIN'},body:{operationId:crypto.randomUUID(),courseId,baseCardRevision:revision,publicCard:{time:'10:00',title,description:'Synthetic review fixture'}}});
 let applied=0;f.setStageHook(stage=>{if(stage==='admin-applied')applied++;});
 const yes=await save(first.data.course.publicCardRevision,'Accepted synthetic card');assert.equal(yes.status,200,yes.data.code);assert(applied>0,'Positive request must use actual Core/Admin coordination');
 const current=await get();assert.equal(current.status,200,current.data.code);
 const snapshot=()=>JSON.stringify(f.seed.databases.admin.prepare("SELECT * FROM academy_settings WHERE setting_key LIKE 'AcademyCoursePublicCard:%' ORDER BY setting_key").all()),before=snapshot(),auditCore=f.native.prepare('SELECT count(*) n FROM audit_events').get().n,auditAdmin=f.seed.databases.admin.prepare('SELECT count(*) n FROM audit_events').get().n;
 let raced=false;f.setStageHook(stage=>{if(stage==='admin-applied'&&!raced){raced=true;f.native.prepare('INSERT INTO jwt_v110_parent_tombstones VALUES(?,?)').run(f.sid,f.at+604800);}});
 const no=await save(current.data.course.publicCardRevision,'Must be rolled back');assert(raced,'The cancellation must occur after actual Admin staging');assert.notEqual(no.status,200);assert.equal(snapshot(),before);assert.equal(f.native.prepare('SELECT count(*) n FROM audit_events').get().n,auditCore);assert.equal(f.seed.databases.admin.prepare('SELECT count(*) n FROM audit_events').get().n,auditAdmin);assert.equal(f.native.prepare('SELECT revoked_at FROM account_sessions WHERE session_id=?').get(f.sid).revoked_at,null);assert.equal(f.native.prepare('SELECT count(*) n FROM split_write_fence').get().n,0);
}));
test('Actual hub bootstrap and open retain cookie binding through nested native reads',withFamily(async f=>{
 const host='https://feature_worker.maktab4life.workers.dev';f.env.JWT_V110_COOKIE_MODE='HOST_ONLY_PREVIEW';f.env.JWT_V110_REQUEST_ORIGIN=host;f.env.ALLOWED_ORIGINS=host;f.env.ACADEMY_WEB_PLATFORM='1';f.env.WEBSITE_PLATFORM_SERVICE={fetch:async()=>Response.json({error:'Synthetic unavailable Studio',code:'STUDIO_UNAVAILABLE'},{status:503})};
 // No outbound Studio service is configured in this isolated synthetic fixture.
 // Bootstrap must retain its native dashboard and report the unavailable navigation.
 const call=async(path,body,auth={})=>{
  const r=await worker.fetch(new Request(host+path,{method:'POST',headers:{Origin:host,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json',...(auth.headers||{})},body:JSON.stringify(body)}),f.env);
  return {response:r,status:r.status,data:await r.json()};
 };
 f.env.JWT_V110_NATIVE_COOKIE='1';
 const pin=await call('/auth/v110/login',{uniqueid:featureSyntheticAccounts[0].login,pin:'2468'});assert.equal(pin.status,200,pin.data.code);
 const auth={headers:{Cookie:pin.response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),Authorization:'Bearer '+pin.data.sessionKey,'X-UAA-CSRF':pin.data.csrf}};
 const bootstrap=await call('/api/academy/hub/read',{kind:'bootstrap',input:{mode:'learn'}},auth);assert.equal(bootstrap.status,200,bootstrap.data.code);assert.equal(bootstrap.data.account.accountId,f.id);assert(bootstrap.data.dashboard,'Native nested dashboard reads must succeed');assert.equal(bootstrap.data.configuration.academyOrigin,host);assert(!bootstrap.data.errors?.dashboard);
 const readURL=new URL(host+'/api/academy/hub/read');readURL.searchParams.set('request',JSON.stringify({kind:'bootstrap',input:{mode:'learn'}}));
 const get=site=>worker.fetch(new Request(readURL,{headers:{Cookie:auth.headers.Cookie,Authorization:auth.headers.Authorization,...(site?{'Sec-Fetch-Site':site}:{})}}),f.env);
 const same=await get('same-origin');assert.equal(same.status,200,'Real same-origin GET omits Origin');const own=await same.json();assert.equal(own.account.accountId,f.id);assert(own.dashboard);
 for(const site of ['cross-site','same-site',null])assert.equal((await get(site)).status,403,'Absent Origin requires the exact same-origin browser metadata');
 const opened=await call('/api/academy/hub/open',{dashboard:{mode:'learn',tool:'home'}},auth);assert.equal(opened.status,200,opened.data.code);assert.equal(opened.data.cookieSession,true);assert(!Object.hasOwn(opened.data,'token'));assert(opened.data.sessionKey.startsWith('uaa-context:'));
 const session=await call('/api/account/session',{}, {headers:{...auth.headers,Authorization:'Bearer '+opened.data.sessionKey}});assert.equal(session.status,200,session.data.code);
}));

test('Actual native cookie logout ends the native session',withFamily(async f=>{
 const auth=await nativeCookieLogin(f);const r=await f.call('/api/account/logout',auth);assert.equal(r.status,200,'Native logout '+f.lastFailure());assert.equal((await f.call('/api/account/session',auth)).status,401);
}));


test('Interrupted actual owner write rechecks the persisted JWT tuple during recovery',withFamily(async f=>{
 const auth=await nativeCookieLogin(f),courseId='FEATURE-SYNTHETIC-A',base='/api/admin/platform/courses/';
 const extra={...auth.extra,'X-Academy-Workspace':'ADMIN'};
 const current=await f.call(base+'get',{...auth,extra,body:{courseId}});assert.equal(current.status,200,current.data.code);
 const card=()=>JSON.stringify(f.seed.databases.admin.prepare("SELECT * FROM academy_settings WHERE setting_key LIKE 'AcademyCoursePublicCard:%' ORDER BY setting_key").all()),before=card(),audit=f.native.prepare('SELECT count(*) n FROM audit_events').get().n,adminAudit=f.seed.databases.admin.prepare('SELECT count(*) n FROM audit_events').get().n,operationId=crypto.randomUUID();
 let interrupted=false;f.setStageHook(stage=>{if(stage==='admin-applied'&&!interrupted){interrupted=true;f.setRPCUnavailable(true);throw Error('Controlled local interruption');}});
 const pending=await f.call(base+'public-card-save',{...auth,extra,body:{operationId,courseId,baseCardRevision:current.data.course.publicCardRevision,publicCard:{time:'10:00',title:'Interrupted synthetic card',description:'Must reverse after persisted proof is cancelled'}}});
 assert(interrupted);assert.equal(pending.status,503);assert.notEqual(card(),before,'The Admin stage must genuinely have been applied');
 const command=f.native.prepare("SELECT proof_json FROM split_commands WHERE phase='PENDING'").get();assert(command);const proof=JSON.parse(command.proof_json);assert.equal(proof.jwt.sid,f.sid);assert.equal(proof.jwt.sub,f.id);assert(!Object.hasOwn(proof.jwt,'token'));assert(!Object.hasOwn(proof.jwt,'refresh_fp'));
 f.native.prepare('UPDATE jwt_v110_accounts SET permission_version=permission_version+1 WHERE account_id=?').run(f.id);f.setStageHook(null);f.setRPCUnavailable(false);await f.engine.recover();
 assert.equal(card(),before);assert.equal(f.native.prepare('SELECT count(*) n FROM audit_events').get().n,audit);assert.equal(f.seed.databases.admin.prepare('SELECT count(*) n FROM audit_events').get().n,adminAudit);assert.equal(f.native.prepare('SELECT count(*) n FROM operation_receipts WHERE operation_id=?').get(operationId).n,0);assert.equal(f.native.prepare('SELECT count(*) n FROM split_write_fence').get().n,0);assert.equal(f.native.prepare('SELECT revoked_at FROM account_sessions WHERE session_id=?').get(f.sid).revoked_at,null);
}));


test('Cookie display context carries same-family CSRF and own renewal returns current public clock metadata',withFamily(async f=>{
 const auth=await nativeCookieLogin(f);
 const context=await f.call('/auth/v110/context',{...auth,method:'GET'});assert.equal(context.status,200,context.data.code);assert.equal(context.data.csrf,auth.pin.data.csrf);assert.equal(context.data.session.accountId,f.id);
 const refreshed=await f.call('/auth/v110/refresh',auth);assert.equal(refreshed.status,200,refreshed.data.code);assert.equal(refreshed.data.refreshed,true);assert.equal(refreshed.data.browserContext.sessionId,f.sid);assert.equal(refreshed.data.browserContext.lastForegroundRefreshMs,f.row().last_fg_refresh_s*1000);assert.equal(refreshed.data.browserContext.originalExpiresAtMs,f.at*1000+604800000);assert(refreshed.data.accessExpiresAtMs>Date.now());assert(refreshed.data.accessExpiresAtMs<=Date.now()+900000);
}));

test('The safe hub GET cannot manufacture an internal mutation or accept unbranded browser facts',async()=>{
 const env={JWT_V110_NATIVE_COOKIE:'1'},request=new Request('https://ummabbadacademy.app/api/academy/hub/read',{headers:{'Sec-Fetch-Site':'same-origin'}});
 await assert.rejects(portalNativeReadRequest('/api/account/logout',{},'learn',request,{},env),e=>e.status===403);
 await assert.rejects(portalNativeReadRequest('/api/academy/entrance',{},'learn',request,{cookieClaims:{sid:'forged'}},env),e=>e.status===401);
});
test.after(()=>{
 assert.equal(remoteAttempts,0);const report={commit:process.env.GITHUB_SHA,synthetic:true,kind:'NATIVE_ACADEMY_PREPARED_REFRESH_SQLITE',records,remoteFetchAttempts:remoteAttempts,masterIssuerProved:false,foregroundHumanActivityProved:false,hostedRequests:0,hostedDBChanges:0,metrics:'No D1 row-cost claim from node:sqlite; workerd/full-flow measurement remains required.'};
 if(process.env.JWT_V110_EVIDENCE){mkdirSync(process.env.JWT_V110_EVIDENCE,{recursive:true});writeFileSync(process.env.JWT_V110_EVIDENCE+'/native-academy-refresh.json',JSON.stringify(report,null,2)+'\n');}
});
