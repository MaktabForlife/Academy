import worker from '../src/academy-runtime.js';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {nativeMediaBridgeFixture} from './fixtures/academy-native-media-bridge-fixture.mjs';
import {dashboardChoice} from '../src/academy/d1/web-platform/dashboard.mjs';
import {academyDestination} from '../../academy/website-platform/connect/destinations.mjs';
test('ownership-aware media location is scoped and bounded, routes MOU/Tafseer/Course to Studio and never reads participants or writes legacy media',async()=>{
 const f=await nativeMediaBridgeFixture();try{
  const db=f.databases.core;db.exec(readFileSync(new URL('../migrations/academy-core/0017_monthly_programme_bridge.sql',import.meta.url),'utf8'));f.source.env.WEBSITE_PLATFORM_ORIGIN='https://website.test';f.source.env.WEBSITE_PLATFORM_ACADEMY_ORIGIN='http://localhost';f.source.env.ALLOWED_ORIGINS='http://localhost';
  const read=async token=>{const response=await worker.fetch(new Request('http://localhost/api/admin/platform/studio-access',{method:'POST',headers:{Origin:'http://localhost',Authorization:'Bearer '+(token||f.admin),'X-Academy-Workspace':'ADMIN','Content-Type':'application/json'},body:JSON.stringify({activityKey:f.scope,command:{action:'media-location'}})}),f.source.env);return {status:response.status,body:await response.json()};};
  for(const kind of ['TAFSEER','COURSE']){db.prepare('UPDATE website_platform_timetable_scopes SET kind=? WHERE activity_key=?').run(kind,f.scope);const result=await read();assert.equal(result.status,200,JSON.stringify(result.body));assert(result.body.managed);assert.equal(new URL(result.body.destination).searchParams.get('offering'),'synthetic-offering');assert.equal(result.body.kind,kind);assert.equal(result.body.participants,undefined);assert.equal(result.body.months,undefined);}
  db.prepare("UPDATE website_platform_timetable_scopes SET kind='TAFSEER' WHERE activity_key=?").run(f.scope);db.prepare("INSERT INTO website_platform_programmes(programme_key,activity_key,access_model,enabled) VALUES('mothers',?,'MONTHLY',1)").run(f.scope);assert.equal((await read()).body.programmeKey,'mothers');
  for(const token of [await f.source.login('0002'),await f.source.actor('adminB')])assert.equal((await read(token)).status,403);
  db.prepare("UPDATE website_platform_access_ownership SET state='FROZEN' WHERE activity_key=?").run(f.scope);assert.notEqual((await read()).status,200);
  db.prepare("UPDATE website_platform_access_ownership SET state='ACADEMY' WHERE activity_key=?").run(f.scope);assert.equal((await read()).body.monthly,false);
  db.prepare("UPDATE website_platform_access_ownership SET state='STUDIO' WHERE activity_key=?").run(f.scope);const claims=JSON.parse(Buffer.from(f.admin.split('.')[1],'base64url'));db.prepare('UPDATE account_sessions SET revoked_at=? WHERE session_id=?').run(new Date().toISOString(),claims.sid);assert.equal((await read()).status,401);
 }finally{f.close();}
});
test('the checked Participants destination retains programme context and return allowlist without adding an Access tab',()=>{
 const programme='PRG-656bcece-4310-49c7-87d7-ee06756f66c1',state={account:{active:true},activities:[{activity_key:'PROGRAM:'+programme,activity_id:programme,kind:'PROGRAM',active:true,lifecycle:'ACTIVE'}],contexts:[{scope:'COURSE',courseId:programme,role:'PROGRAM_ADMIN'}]},input={mode:'admin',tool:'participants',activityKey:'PROGRAM:'+programme};
 const result=dashboardChoice(state,input);assert.match(result.destination,/tab=participants&participants=access$/);assert.equal(new URL(result.destination,'https://academy.test').searchParams.get('program'),programme);assert(academyDestination(result.destination,'https://academy.test'));assert.equal(academyDestination(result.destination+'&return=https://evil.test','https://academy.test'),null);assert.throws(()=>dashboardChoice({...state,contexts:[{scope:'COURSE',courseId:'other',role:'PROGRAM_ADMIN'}]},input));assert.throws(()=>dashboardChoice(state,{...input,mode:'learn'}));
});
