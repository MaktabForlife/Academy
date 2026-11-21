import test from 'node:test';
import assert from 'node:assert/strict';
import {strictJSON,canonical,unb64u,b64u,bytes,opaque,fingerprint,vectorDigest,compareVector} from '../codec.mjs';
import {issueToken,verifyToken,preverifyAPI,profileConfig,readCookies,readSharedAcademyAccess,cookiePair,clearCookies,ownOrigin,ORIGINS,ACADEMY_SHARED_COOKIE,ACADEMY_SHARED_AUDIENCES} from '../tokens.mjs';
import {fixture,signing} from './helpers.mjs';
const key=await signing();
test('canonical JSON uses JCS property order, UTF-8 and safe integer profile',()=>{
 assert.equal(canonical(strictJSON('{"z":1,"a":[true,null,"Arabic العربية"]}')),'{"a":[true,null,"Arabic العربية"],"z":1}');
});
for(const raw of ['{"x":1,"x":2}','{"x":{"a":1,"a":2}}','{"x":"\\ud800"}','{"x":01}','{"x":1,}','{"x":NaN}','{} trailing']){
 test('strict JSON rejects '+raw.slice(0,28),()=>assert.throws(()=>strictJSON(raw)));
}
test('malformed UTF8 rejected',()=>assert.throws(()=>strictJSON(Uint8Array.from([123,34,120,34,58,34,0xff,34,125]))));
test('canonical unsafe and fractional numbers rejected',()=>{for(const n of [Infinity,1.1,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>canonical(n));});
test('opaque credentials are independent canonical 256 bit strings',async()=>{
 const a=opaque(),b=opaque();assert.notEqual(a,b);assert.equal(a.length,43);assert.equal(unb64u(a,32).length,32);
 assert.notEqual(await fingerprint(a,{env:'production',app:'studio'}),await fingerprint(a,{env:'production',app:'hifz'}));
 for(const bad of [a+'=',a+' ',encodeURIComponent(a+'='),'a'.repeat(42),a.slice(0,42)+'B'])assert.throws(()=>unb64u(bad,32));
});
test('owner vector order canonical, epoch change requires reconciliation',async()=>{
 assert.equal(await vectorDigest([['b','e',2],['a','e',1]]),await vectorDigest([['a','e',1],['b','e',2]]));
 assert.throws(()=>compareVector([['a','old',1]],[['a','new',1]]),/RECONCILIATION/);
 assert.throws(()=>compareVector([['a','e',1],['b','e',2]],[['a','e',2],['b','e',1]]),/INCOMPARABLE/);
});
test('new addresses are exact canonical origins',()=>{
 assert.equal(ORIGINS.studio,'https://worshipuponbaseera.ummabbadacademy.app');assert.equal(ORIGINS.hifz,'https://mahadarwa-hifz.ummabbadacademy.app');
});
test('valid own-app ES256 identity/session JWT verifies complete durable binding',async()=>{
 const f=await fixture(),claims={...f.binding,iat:f.now,exp:f.deadline,jti:crypto.randomUUID()};
 const token=await issueToken(claims,{config:f.config,key:key.privateKey,kid:'studio-api-1',now:f.now,idleUntil:f.idleUntil});
 assert(token.length<=2048);const keys=new Map([['studio-api-1',key.publicKey]]);
 const actual=await verifyToken(token,{config:f.config,keys,now:f.now,projection:f.binding,idleUntil:f.idleUntil});
 assert.equal(actual.sub,f.sub);
 await assert.rejects(verifyToken(token,{config:{...f.config,app:'hifz',origin:ORIGINS.hifz},keys,now:f.now,idleUntil:f.idleUntil}));
 await assert.rejects(verifyToken(token,{config:f.config,keys,withdrawn:new Set(['studio-api-1']),now:f.now,idleUntil:f.idleUntil}));
 await assert.rejects(verifyToken(token,{config:f.config,keys,now:f.now,projection:{...f.binding,ae:10},idleUntil:f.idleUntil}));
 await assert.rejects(verifyToken(token,{config:f.config,keys,now:f.deadline,idleUntil:f.idleUntil}));
 await assert.rejects(verifyToken(token+'x'.repeat(2049),{config:f.config,keys,now:f.now,idleUntil:f.idleUntil}));
});
for(const change of [{exp:1000901},{ae:0},{bv:1.5},{s_exp:1000000+604801},{iat:1000031},{permissions:['grant']},{pv:'x'.repeat(43)},{jti:'bad'}]){
 test('invalid JWT member/time/lease rejected '+JSON.stringify(change),async()=>{
  const f=await fixture(),claims={...f.binding,iat:f.now,exp:f.deadline,jti:crypto.randomUUID(),...change};
  await assert.rejects(issueToken(claims,{config:f.config,key:key.privateKey,kid:'key',now:f.now,idleUntil:f.idleUntil}));
 });
}
test('original sign-in permits validation start before parent commit only with stored initial provenance',async()=>{
 const f=await fixture(),c={...f.binding,vat:f.now-2,iat:f.now,exp:f.now+898,jti:crypto.randomUUID()};
 await assert.rejects(issueToken(c,{config:f.config,key:key.privateKey,kid:'key',now:f.now,idleUntil:f.idleUntil}));
 const token=await issueToken(c,{config:f.config,key:key.privateKey,kid:'key',now:f.now,idleUntil:f.idleUntil,initial:true});assert(token);
});
test('proof purpose/audience/lifetime is disjoint from ordinary API tokens',async()=>{
 const f=await fixture(),c={ver:2,env:'production',iss:ORIGINS.academy,aud:'urn:uaa:production:studio:admission:v2',sub:f.sub,psid:f.psid,bsid:f.bsid,bv:1,ce:4,ae:9,s_iat:f.now,s_exp:f.now+604800,tx:crypto.randomUUID(),jti:crypto.randomUUID(),iat:f.now,exp:f.now+60,afg:f.now};
 const token=await issueToken(c,{profile:'admission',config:f.config,key:key.privateKey,kid:'handoff-1',now:f.now});
 await verifyToken(token,{profile:'admission',config:f.config,keys:new Map([['handoff-1',key.publicKey]]),now:f.now});
 await assert.rejects(verifyToken(token,{config:f.config,keys:new Map([['handoff-1',key.publicKey]]),now:f.now,idleUntil:f.idleUntil}));
 await assert.rejects(issueToken({...c,exp:c.exp+1},{profile:'admission',config:f.config,key:key.privateKey,kid:'handoff-1',now:f.now}));
});
test('duplicate current cookie, padded or whitespace refresh fails before lookup',()=>{
 const r=opaque();assert.throws(()=>readCookies('__Host-studio_r='+r+'; __Host-studio_r='+r,'studio'));
 assert.throws(()=>readCookies('__Host-studio_r='+r+' ','studio'));
 assert.throws(()=>readCookies('__Host-studio_r='+r+'=','studio'));
 assert.equal(readCookies('__Host-hifz_r='+r,'studio').refresh,undefined);
});
test('cookie pair is host-only and preserves original expiry',()=>{
 const r=opaque(),cookies=cookiePair({app:'studio',access:'jwt.parts.sig',refresh:r,now:100,accessExpires:999,originalExpires:604000});
 assert.equal(cookies.length,2);for(const s of cookies){assert(!s.includes('Domain='));assert(s.includes('HttpOnly'));assert(s.includes('SameSite=Lax'));}
 assert(cookies[1].includes('Max-Age=603900'));assert.throws(()=>cookiePair({app:'studio',access:'x',refresh:r,now:100,accessExpires:1001,originalExpires:604000}));
});
test('provider/sibling origins cannot mutate browser auth',()=>{
 const f={origin:ORIGINS.studio};
 ownOrigin(new Request(ORIGINS.studio+'/auth/v2/refresh',{headers:{Origin:ORIGINS.studio}}),f);
 for(const url of ['https://studio.ummabbadacademy.app','https://ummabbadacademy.maktab4life.org',ORIGINS.hifz])assert.throws(()=>ownOrigin(new Request(url+'/auth/v2/refresh',{headers:{Origin:ORIGINS.studio}}),f));
});

test('fractional or unsafe wire number lexemes cannot round into accepted security counters',()=>{
 for(const value of ['1.000000000000000000001','9007199254740991.1','9007199254740992','1e0','1.0','1e309'])assert.throws(()=>strictJSON('{"counter":'+value+'}'));
 assert.equal(strictJSON('{"counter":9007199254740991}').counter,Number.MAX_SAFE_INTEGER);
});

test('the dedicated Academy access token is usable only for the explicit shared profile',async()=>{
 const f=await fixture(),academy=profileConfig({app:'academy'}),keys=new Map([['academy-shared-test',key.publicKey]]);
 const binding={...f.binding,sid:f.psid,iss:academy.origin,aud:ACADEMY_SHARED_AUDIENCES[0]};
 const claims={...binding,aud:[...ACADEMY_SHARED_AUDIENCES],afg:f.now,iat:f.now,exp:f.deadline,jti:crypto.randomUUID()};
 const signing={profile:'shared',config:academy,key:key.privateKey,kid:'academy-shared-test',now:f.now,idleUntil:f.idleUntil};
 const token=await issueToken(claims,signing);
 assert(bytes(token).length<=2048);
 const verified=await preverifyAPI(token,{profile:'shared',config:academy,keys,now:f.now});
 assert.equal(verified.sid,binding.sid);
 assert.deepEqual({...await verifyToken(token,{...signing,keys,preverified:verified,projection:binding})},claims);
 for(const app of ['studio','hifz']){
  const config=profileConfig({app});
  assert.deepEqual({...await verifyToken(token,{...signing,config,keys})},claims);
  await assert.rejects(verifyToken(token,{...signing,profile:'api',config,keys}),/WRONG_TOKEN_PROFILE/);
  await assert.rejects(issueToken(claims,{...signing,config}),/SHARED_ISSUER_REQUIRED/);
 }
 await assert.rejects(verifyToken(token,{...signing,keys,withdrawn:new Set(['academy-shared-test'])}),/UNTRUSTED_KEY/);
 await assert.rejects(verifyToken(token,{...signing,config:profileConfig({app:'academy',env:'feature'}),keys}),/INVALID_SHARED_CONFIG/);
 await assert.rejects(verifyToken(token,{...signing,keys,now:f.deadline}),/TOKEN_EXPIRED/);
 await assert.rejects(issueToken({...claims,aud:[...claims.aud].reverse()},signing),/WRONG_AUDIENCE/);
 await assert.rejects(issueToken({...claims,afg:f.now+1},signing),/INVALID_FOREGROUND/);
 await assert.rejects(issueToken({...claims,sid:crypto.randomUUID()},signing),/INVALID_PARENT/);
});

test('only the shared Academy access cookie gets parent-domain scope',()=>{
 const refresh=opaque(),cookie=ACADEMY_SHARED_COOKIE+'=shared.jwt.parts',header=cookie+'; __Host-uaa_r='+refresh;
 const scope={access:'shared.jwt.parts',refresh,now:100,accessExpires:1000,originalExpires:20000};
 const [access,refreshHeader]=cookiePair({...scope,app:'academy',sharedAccess:true});
 assert(access.startsWith(cookie+'; Domain=ummabbadacademy.app; Path=/; Secure; HttpOnly; SameSite=Lax;'));
 assert(refreshHeader.startsWith('__Host-uaa_r='));
 assert(!refreshHeader.includes('Domain='));
 assert.deepEqual(readCookies(header,'academy',{sharedAccess:true}),{access:'shared.jwt.parts',refresh});
 assert.equal(readCookies('__Host-uaa_a=legacy.jwt.parts','academy',{sharedAccess:true}).access,undefined);
 assert.equal(readSharedAcademyAccess(header),'shared.jwt.parts');
 assert.throws(()=>readSharedAcademyAccess(cookie+'; '+cookie),/DUPLICATE_COOKIE/);
 assert.throws(()=>readCookies(header+'; __Host-uaa_r='+refresh,'academy',{sharedAccess:true}),/DUPLICATE_COOKIE/);
 const clears=clearCookies('academy',{sharedAccess:true});
 assert(clears[0].startsWith(ACADEMY_SHARED_COOKIE+'=; Domain=ummabbadacademy.app;'));
 assert(!clears[1].includes('Domain='));
 for(const app of ['studio','hifz']){
  assert.deepEqual(readCookies(header,app),{access:undefined,refresh:undefined});
  assert(cookiePair({...scope,app}).every(value=>!value.includes('Domain=')));
  assert.throws(()=>cookiePair({...scope,app,sharedAccess:true}),/INVALID_CONFIG/);
 }
});
