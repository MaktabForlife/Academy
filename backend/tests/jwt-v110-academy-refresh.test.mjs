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
const withFamily=fn=>async()=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{remoteAttempts++;throw Error('Unexpected remote call');};
 const seed=await prepareFeatureSeed({pin:'2468',secrets});const native=seed.databases.core;
 try{
  native.exec(readFileSync(new URL('./fixtures/jwt-v110-auth-only.sql',import.meta.url),'utf8'));
  const core=emptyCompatibilityDatabase(sqliteD1(native),emptyShapes,{currentGrants:true}),admin=sqliteD1(seed.databases.admin),engine=splitEngine({core,admin});
  const ns={getByName(){return Object.fromEntries(['read','write'].map(m=>[m,async(...args)=>({result:await engine[m](...args)})]));}};
  const keys=await generateKeyPair('ES256',{extractable:true}),publicJWK={...await exportJWK(keys.publicKey),kid:'synthetic-a'},privateJWK={...await exportJWK(keys.privateKey),kid:'synthetic-a'};
  const cfg=JSON.parse(readFileSync(new URL('../wrangler.feature.jsonc',import.meta.url),'utf8'));
  const env={...cfg.vars,...secrets,ACADEMY_D1_MODE:'ACTIVE',ACADEMY_D1_RUN_ID:seed.report.sourceDigest,ACADEMY_DB:sqliteD1(native),ACADEMY_ADMIN_DB:admin,ACADEMY_SPLIT_COORDINATOR:ns,AUTH_LOGIN_RATE_LIMITER:{limit:async()=>({success:true})},JWT_V110_REFRESH:'1',JWT_V110_BROWSER:'1',JWT_V110_REQUEST_ORIGIN:appOrigin,JWT_V110_PUBLIC_KEYS_JSON:JSON.stringify([publicJWK]),JWT_V110_PRIVATE_KEY_JSON:JSON.stringify(privateJWK),JWT_V110_SIGNING_KID:'synthetic-a',JWT_V110_CSRF_SECRET:randomRefresh(),JWT_V110_RATE_LIMITER:{limit:async()=>({success:true})},ALLOWED_ORIGINS:appOrigin+','+h.academyPortalOrigin};
  const loginResponse=await worker.fetch(new Request(appOrigin+'/api/account/login',{method:'POST',headers:{Origin:h.academyPortalOrigin,'Content-Type':'application/json'},body:JSON.stringify({uniqueid:featureSyntheticAccounts[0].login,pin:'2468'})}),env);
  assert.equal(loginResponse.status,200,'Native PIN prerequisite failed');const login=await loginResponse.json(),nativeClaims=await verifySessionToken(login.token,env),sid=nativeClaims.sid,id=nativeClaims.accountid,ce=nativeClaims.epoch;
  const raw=randomRefresh(),fp=await fingerprint('academy',raw),at=now(),browser=crypto.randomUUID();
  native.prepare('INSERT INTO jwt_v110_accounts VALUES(?,?,?,1)').run(id,ce,1);
  native.prepare('INSERT INTO jwt_v110_browser_heads VALUES(?,1)').run(browser);
  native.prepare('INSERT INTO jwt_v110_families(family_id,account_id,parent_session_id,browser_id,browser_generation,credential_epoch,permission_version,refresh_fp,original_signed_in_at_s,original_expires_at_s,last_fg_refresh_s,rotated_at_s) VALUES(?,?,?,?,1,?,1,?,?,?,?,?)').run(sid,id,sid,browser,ce,fp,at,at+604800,at,at);
  const config={app:'academy',issuer:'https://ummabbadacademy.app',academyCookieDomain:'ummabbadacademy.app',publicKeys:[publicJWK],signingKey:keys.privateKey,signingKid:'synthetic-a'};
  const row=()=>native.prepare('SELECT * FROM jwt_v110_families WHERE family_id=?').get(sid);
  async function call(path,{method=path.endsWith('/csrf')?'GET':'POST',body={},cookie='__Host-uaa_r='+raw,proof,origin=appOrigin,site='same-origin',extra={}}={}){
   const response=await worker.fetch(new Request(appOrigin+path,{method,headers:{Origin:origin,'Sec-Fetch-Site':site,'Content-Type':'application/json',Cookie:cookie,...(proof?{'X-UAA-CSRF':proof}:{}),...extra},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),env);
   const data=await response.json();return {status:response.status,data,response};
  }
  const csrf=async()=>{const r=await call('/auth/v110/csrf');assert.equal(r.status,200,'Own CSRF prerequisite failed: '+r.data.code);return r.data.csrf;};
  await fn({seed,native,env,raw,fp,sid,id,ce,at,browser,config,row,call,csrf});
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
test.after(()=>{
 assert.equal(remoteAttempts,0);const report={commit:process.env.GITHUB_SHA,synthetic:true,kind:'NATIVE_ACADEMY_PREPARED_REFRESH_SQLITE',records,remoteFetchAttempts:remoteAttempts,masterIssuerProved:false,foregroundHumanActivityProved:false,hostedRequests:0,hostedDBChanges:0,metrics:'No D1 row-cost claim from node:sqlite; workerd/full-flow measurement remains required.'};
 if(process.env.JWT_V110_EVIDENCE){mkdirSync(process.env.JWT_V110_EVIDENCE,{recursive:true});writeFileSync(process.env.JWT_V110_EVIDENCE+'/native-academy-refresh.json',JSON.stringify(report,null,2)+'\n');}
});
