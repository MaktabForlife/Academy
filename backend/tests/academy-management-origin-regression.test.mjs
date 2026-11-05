import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/academy-runtime.js';
import {hosting} from '../src/academy/hosting.mjs';
import {nativeMediaBridgeFixture} from './fixtures/academy-native-media-bridge-fixture.mjs';

const h=hosting(),access='/api/admin/platform/studio-access',artwork=access+'/playlist-cover';
const trusted=[h.academyPortalOrigin,...h.academyLegacyOrigins];
async function fixture(){
 const f=await nativeMediaBridgeFixture();
 const db=f.databases.core;
 db.exec(readFileSync(new URL('../migrations/academy-core/0017_monthly_programme_bridge.sql',import.meta.url),'utf8'));
 db.prepare("UPDATE website_platform_timetable_scopes SET kind='TAFSEER' WHERE activity_key=?").run(f.scope);
 for(const [scope,offering] of [[f.scopes.courseA,'synthetic-course'],[f.scopes.programB,'synthetic-other']]){
  db.prepare("INSERT INTO website_platform_timetable_scopes(activity_key,offering_id,kind) VALUES(?,?,'COURSE')").run(scope,offering);
  db.prepare('INSERT INTO website_platform_access_scopes(activity_key,enabled) VALUES(?,1)').run(scope);
  db.prepare("INSERT INTO website_platform_access_ownership(activity_key,state,updated_at) VALUES(?,'STUDIO',0)").run(scope);
 }
 // Reproduce the stale single-origin setting without modifying hosted config.
 f.source.env.WEBSITE_PLATFORM_ACADEMY_ORIGIN=h.academyLegacyOrigins[0]||'https://stale.invalid';
 f.source.env.ALLOWED_ORIGINS=[...trusted,'https://untrusted.invalid','https://maktab4life.org','https://ummabbadacademy.app.evil.invalid','https://ummabbadacademy.app:444'].join(',');
 f.post=async(path=access,{origin=h.academyPortalOrigin,token=f.global,workspace='ADMIN',activityKey=f.scope,command={action:'media-location'}}={})=>{
  const response=await worker.fetch(new Request(h.academyApiOrigin+path,{method:'POST',headers:{'Content-Type':'application/json','X-Academy-Workspace':workspace,...(origin===null?{}:{Origin:origin}),...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({activityKey,command})}),f.source.env);
  return {status:response.status,body:await response.json()};
 };
 return f;
}
const use=fn=>async()=>{const f=await fixture();try{await fn(f);}finally{f.close();}};
test('management endpoints accept configured portal and legacy origins for actual Course and Tafseer locations',use(async f=>{
 for(const origin of trusted)for(const [activityKey,kind] of [[f.scope,'TAFSEER'],[f.scopes.courseA,'COURSE']]){
  const r=await f.post(access,{origin,activityKey});
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.kind,kind);assert.equal(r.body.ownership,'STUDIO');assert.equal(r.body.managed,true);
  assert.equal(new URL(r.body.destination).origin,h.studioOrigin);
 }
}));
test('both management origins remain narrower than CORS and reject absent or untrusted Origin before authority reads',use(async f=>{
 for(const path of [access,artwork])for(const origin of [null,'https://untrusted.invalid','https://maktab4life.org','https://ummabbadacademy.app.evil.invalid','https://ummabbadacademy.app:444']){
  const before=f.costs.length,r=await f.post(path,{origin});
  assert.equal(r.status,403);assert.equal(r.body.code,'ORIGIN_REQUIRED');assert.equal(f.costs.length,before,'Rejected origin must not read current authority.');
 }
}));
test('trusted management origins still require authentication on access and artwork',use(async f=>{
 for(const origin of trusted)for(const path of [access,artwork]){
  const r=await f.post(path,{origin,token:''});assert.equal(r.status,401,JSON.stringify(r.body));
 }
}));
test('trusted management origins preserve current scoped Admin and workspace denial',use(async f=>{
 const student=await f.source.login('0002'),otherAdmin=await f.source.actor('adminB');
 for(const origin of trusted){
  for(const token of [student,otherAdmin]){
   const r=await f.post(access,{origin,token});assert.equal(r.status,403,JSON.stringify(r.body));
  }
  const wrongScope=await f.post(access,{origin,token:f.admin,activityKey:f.scopes.programB});assert.equal(wrongScope.status,403);
  const learn=await f.post(access,{origin,workspace:'LEARN'});assert.equal(learn.status,403);
 }
}));
test('artwork bridge accepts trusted origin without relaxing its action guard',use(async f=>{
 for(const origin of trusted){
  const r=await f.post(artwork,{origin,command:{action:'media-location'}});
  assert.equal(r.status,400,JSON.stringify(r.body));assert.equal(r.body.code,'INVALID_ACTION');
 }
}));
test('management locations continue denying revoked native sessions',use(async f=>{
 const claims=JSON.parse(Buffer.from(f.global.split('.')[1],'base64url'));
 f.databases.core.prepare("UPDATE account_sessions SET revoked_at='synthetic-revocation' WHERE account_id=?").run(claims.accountid);
 for(const origin of trusted){const r=await f.post(access,{origin});assert.equal(r.status,401,JSON.stringify(r.body));}
}));
