import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeMediaBridgeFixture} from './fixtures/academy-native-media-bridge-fixture.mjs';
import {signedHeaders} from '../src/academy/d1/web-platform/protocol.mjs';
import {dashboardSummary,dashboardChoice} from '../src/academy/d1/web-platform/dashboard.mjs';
import {academyDestination} from '../../academy/website-platform/connect/destinations.mjs';
import {dashboardStudioSessionId,projectedSessionId} from '../src/academy/d1/web-platform/timetable.mjs';
import {bridge} from '../src/academy/d1/web-platform/bridge.mjs';
import worker from '../src/academy-runtime.js';

const path='/internal/website/lesson-join',start=Date.parse('2026-10-09T08:00:00Z');
const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
async function fixture(t){
 const f=await nativeMediaBridgeFixture();t.after(()=>f.close());
 f.databases.core.prepare("UPDATE website_platform_access_ownership SET state='ACADEMY' WHERE activity_key=?").run(f.scope);
 f.reference=async token=>{
  const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url')),sourceRef=await f.sourceRef(token);
  f.databases.core.prepare('UPDATE website_platform_sessions SET context_json=? WHERE source_ref=?').run(JSON.stringify({scope:claims.scope,courseId:claims.courseid||'',role:claims.role}),sourceRef);
  return sourceRef;
 };
 f.join=async(input,secret=f.source.env.WEBSITE_TO_ACADEMY_SECRET)=>{
  const signed=await signedHeaders(secret,path,{issuedAt:Date.now(),...input}),response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:signed.headers,body:signed.payload}),f.source.env);
  return {status:response.status,body:await response.json(),response};
 };
 const token=await f.source.login('0002');f.otherToken=await f.source.login('0007');f.teacherToken=await f.source.login('0003');f.learner=await f.reference(token);
 const entrance=ok(await f.request('/api/academy/entrance',{startDate:'2026-10-09'},token,'LEARN'));
 f.lesson=entrance.personalTimetable.find(row=>row.activityId===f.scope.slice(8)&&row.joinKey);
 assert(f.lesson,'The synthetic native learner has an actual current programme lesson');
 f.input={sourceRef:f.learner,mode:'learn',joinKey:f.lesson.joinKey,date:f.lesson.sourceDate||f.lesson.date};
 // SQLite's native strftime clock is real; create ordinary current sessions
 // before mocking the application projection clock for the historical lesson.
 t.mock.timers.enable({apis:['Date'],now:start-3600000});
 return f;
}

test('checked dashboard carries bounded native references and time fields, never meeting URLs or preview/cancelled joining authority',async()=>{
 const activity={activity_key:'PROGRAM:one',activity_id:'one',kind:'PROGRAM',active:true,lifecycle:'ACTIVE'},state={account:{active:true},activities:[activity],contexts:[{scope:'COURSE',courseId:'one',role:'STUDENT'}]};
 const row={kind:'PROGRAM',activityId:'one',activityName:'One',date:'2026-10-09',sourceDate:'2026-10-08',status:'SCHEDULED',timezone:'Africa/Johannesburg',startsAt:start,endsAt:start+3600000,joinAvailableAt:start-300000,joinKey:'["PROGRAM","one","publication",0,"2026-10-08"]',joinUrl:'https://zoom.us/j/private-synthetic',meetingGroup:'private-synthetic'};
 const home={startDate:'2026-10-04',endDate:'2026-10-10',timezone:'Africa/Johannesburg',personalActivities:[{kind:'PROGRAM',id:'one',name:'One',roles:['STUDENT']}],personalTimetable:[row,{...row,status:'CANCELLED'},{...row,preview:true},{...row,activityId:'other'}]},before=JSON.stringify(home),calls=[];
 const summary=await dashboardSummary(state,{}, {mode:'learn'},async(path)=>{calls.push(path);return path==='/api/academy/entrance'?home:{assessments:[]};});
 assert.equal(summary.nativeJoinVersion,1);assert.equal(summary.timetable.length,3);
 assert.deepEqual(summary.timetable[0].nativeJoin,{joinKey:row.joinKey,date:'2026-10-08'});
 assert.equal(summary.timetable[0].joinAvailableAt,start-300000);assert.equal(summary.timetable[0].timezone,'Africa/Johannesburg');
 assert(!summary.timetable[1].nativeJoin);assert(!summary.timetable[2].nativeJoin);
 assert.doesNotMatch(JSON.stringify(summary),/zoom\.|joinUrl|meetingGroup|private-synthetic/);
 assert.equal(JSON.stringify(home),before);assert.equal(calls.length,2,'Reference projection adds no native read');
 for(const access_owner of ['STUDIO','FROZEN']){
  const held=await dashboardSummary(state,{}, {mode:'learn'},async path=>path==='/api/academy/entrance'?home:{assessments:[]},[{activity_key:'PROGRAM:one',access_owner}]);
  assert(held.timetable.every(row=>!row.nativeJoin),'Studio-owned/frozen rows stay on their original resolver');
 }
});

test('Studio dashboard references reuse exact projector anchors and never infer a session from titles or clocks',async()=>{
 const activity={activity_key:'PROGRAM:one',activity_id:'one',kind:'PROGRAM',active:true,lifecycle:'ACTIVE'},state={account:{active:true},activities:[activity],contexts:[{scope:'COURSE',courseId:'one',role:'STUDENT'}]},date='2026-10-09';
 const row={kind:'PROGRAM',activityId:'one',activityName:'Same title',date,status:'SCHEDULED',startsAt:start,endsAt:start+3600000,mediaSessionKey:JSON.stringify(['PROGRAM',date,'exact-original-anchor']),joinKey:JSON.stringify(['PROGRAM','one','pub',0,date])};
 const scope={activity_key:'PROGRAM:one',offering_id:'studio-mou',access_owner:'STUDIO'},read=async()=>({startDate:'2026-10-04',endDate:'2026-10-10',timezone:'Africa/Johannesburg',personalActivities:[{kind:'PROGRAM',id:'one',name:'Same title',roles:['STUDENT']}],personalTimetable:[row,{...row,status:'CANCELLED'},{...row,preview:true},{...row,mediaSessionKey:'invalid'}]});
 const value=await dashboardSummary(state,{}, {mode:'learn'},read,[scope]);assert.equal(value.studioJoinVersion,1);assert.deepEqual(value.timetable[0].studioJoin,{offeringId:'studio-mou',sessionId:await projectedSessionId(['PROGRAM','PROGRAM:one',date,'exact-original-anchor'])});assert(!value.timetable[0].nativeJoin);assert(value.timetable.slice(1).every(r=>!r.studioJoin&&!r.nativeJoin));
 const frozen=await dashboardSummary(state,{}, {mode:'learn'},read,[{...scope,access_owner:'FROZEN'}]);assert(frozen.timetable.every(r=>!r.studioJoin&&!r.nativeJoin));
 assert.equal(await dashboardStudioSessionId('PROGRAM:one',row.mediaSessionKey,'2026-10-08'),null);
 assert.equal(await dashboardStudioSessionId('COURSE:one',JSON.stringify(['COURSE','run-one','source-one']),date),await projectedSessionId(['COURSE','COURSE:one','run-one','source-one']));
 assert.equal(await dashboardStudioSessionId('PROGRAM:one',JSON.stringify(['COURSE','run-one','source-one']),date),null);
});

test('Manage destinations preserve checked Admin context and the narrow connector route allowlist',()=>{
 const context={scope:'COURSE',courseId:'one',role:'PROGRAM_ADMIN'},state={account:{active:true},contexts:[context],activities:[{activity_key:'PROGRAM:one',activity_id:'one',kind:'PROGRAM',active:true,lifecycle:'ACTIVE'}]};
 for(const tool of ['users','assessment']){const value=dashboardChoice(state,{mode:'admin',tool});assert.equal(value.context,context);assert(academyDestination(value.destination,'https://academy.test'));assert.throws(()=>dashboardChoice(state,{mode:'learn',tool}),e=>e.status===403);}
 const media=dashboardChoice(state,{mode:'admin',tool:'media',activityKey:'PROGRAM:one'});assert.equal(media.destination,'/academy/admin/#administration/media/PROGRAM/one');assert(academyDestination(media.destination,'https://academy.test'));
 assert.throws(()=>dashboardChoice(state,{mode:'learn',tool:'media',activityKey:'PROGRAM:one'}),e=>e.status===403);assert.throws(()=>dashboardChoice(state,{mode:'admin',tool:'media',activityKey:'PROGRAM:other'}),e=>e.status===403);
 for(const value of ['/academy/admin/#administration/media/UNKNOWN/one','/academy/admin/?unsafe=1#administration/media/PROGRAM/one','/academy/admin/#administration/media/PROGRAM/one%2Fevil','https://elsewhere.test/academy/admin/#administration/users'])assert.equal(academyDestination(value,'https://academy.test'),null);
});

test('signed native Join works for Academy-only sessions at the exact five-minute/end boundaries without a projected Studio session',async t=>{
 const f=await fixture(t),core=f.databases.core;
 core.prepare('DELETE FROM website_platform_access_ownership WHERE activity_key=?').run(f.scope);
 core.prepare('DELETE FROM website_platform_access_scopes WHERE activity_key=?').run(f.scope);
 core.prepare('DELETE FROM website_platform_timetable_scopes WHERE activity_key=?').run(f.scope);
 const before={roles:core.prepare('SELECT * FROM role_assignments ORDER BY assignment_id').all(),memberships:core.prepare('SELECT * FROM class_memberships ORDER BY enrollment_id').all()};
 for(const [when,status] of [[f.lesson.joinAvailableAt-1,409],[f.lesson.joinAvailableAt,200],[f.lesson.endsAt-1,200],[f.lesson.endsAt,409]]){
  t.mock.timers.setTime(when);const result=await f.join(f.input);assert.equal(result.status,status,JSON.stringify(result.body));
  if(status===200){assert.match(result.body.joinUrl,/^https:\/\//);assert.deepEqual(Object.keys(result.body).sort(),['joinUrl','success']);}
  else assert.equal(result.body.code,'LESSON_NOT_OPEN');
  assert.equal(result.response.headers.get('Cache-Control'),'private, no-store');
 }
 assert.deepEqual(core.prepare('SELECT * FROM role_assignments ORDER BY assignment_id').all(),before.roles);
 assert.deepEqual(core.prepare('SELECT * FROM class_memberships ORDER BY enrollment_id').all(),before.memberships);
});

test('signed Join validates input, HMAC age, selected native workspace and the current learner audience',async t=>{
 const f=await fixture(t);t.mock.timers.setTime(start);
 for(const bad of [{mode:'admin'},{mode:'teach'}])assert.equal((await f.join({...f.input,...bad})).status,403);
 for(const bad of [{mode:'ADMIN'},{joinKey:''},{joinKey:'x'.repeat(1201)},{date:'2026-02-30'},{date:'not-a-date'},{joinUrl:'https://zoom.us/j/forged'},{mode:undefined}])assert.equal((await f.join({...f.input,...bad})).status,400,JSON.stringify(bad));
 const forged=JSON.parse(f.input.joinKey);forged[2]='other-publication';assert.equal((await f.join({...f.input,joinKey:JSON.stringify(forged)})).status,403);
 assert.equal((await f.join({...f.input,issuedAt:Date.now()-300001})).status,401);
 assert.equal((await f.join(f.input,'not-the-shared-secret'.repeat(3))).status,401);
 const other=await f.reference(f.otherToken);
 assert.equal((await f.join({...f.input,sourceRef:other})).status,403,'A copied reference cannot grant another programme/class audience');
 assert.equal((await f.join({...f.input,sourceRef:'unknown-source-session'})).status,401);
});

test('cached native references cannot outlive current membership, admission, credential epoch or session revocation',async t=>{
 const f=await fixture(t),core=f.databases.core;t.mock.timers.setTime(start);ok(await f.join(f.input));
 const actor=core.prepare('SELECT account_id,session_id FROM website_platform_sessions WHERE source_ref=?').get(f.learner);
 core.prepare('UPDATE class_memberships SET active=0 WHERE account_id=? AND activity_key=?').run(actor.account_id,f.scope);
 assert.equal((await f.join(f.input)).status,403,'Removing the current class closes an earlier reference');
 core.prepare('UPDATE class_memberships SET active=1 WHERE account_id=? AND activity_key=?').run(actor.account_id,f.scope);
 ok(await f.join(f.input));
 core.prepare('INSERT INTO website_platform_admissions VALUES(?,0) ON CONFLICT(account_id) DO UPDATE SET active=0').run(actor.account_id);
 assert.equal((await f.join(f.input)).status,401);
 core.prepare('UPDATE website_platform_admissions SET active=1 WHERE account_id=?').run(actor.account_id);
 core.prepare('UPDATE account_credentials SET credential_epoch=credential_epoch+1 WHERE account_id=?').run(actor.account_id);
 assert.equal((await f.join(f.input)).status,401);
 core.prepare('UPDATE account_credentials SET credential_epoch=credential_epoch-1 WHERE account_id=?').run(actor.account_id);
 core.prepare('UPDATE account_sessions SET revoked_at=? WHERE session_id=?').run(new Date().toISOString(),actor.session_id);
 assert.equal((await f.join(f.input)).status,401);
});

test('native Teacher/Admin audiences are preserved and current programme cancellation closes a cached reference',async t=>{
 const f=await fixture(t);t.mock.timers.setTime(start);
 const teacher=await f.reference(f.teacherToken),global=await f.reference(f.global);
 ok(await f.join({...f.input,sourceRef:teacher,mode:'teach'}));
 ok(await f.join({...f.input,sourceRef:global,mode:'admin'}));
 for(const mode of ['learn','teach'])ok(await f.join({...f.input,sourceRef:global,mode}));
 const [,activityId,publicationId]=JSON.parse(f.input.joinKey),scope='PROGRAM:'+activityId;
 f.databases.core.prepare("INSERT INTO program_publication_lifecycle VALUES(?,?,'CANCELLED',?)").run(scope,publicationId,new Date().toISOString());
 for(const input of [f.input,{...f.input,sourceRef:teacher,mode:'teach'},...['learn','teach','admin'].map(mode=>({...f.input,sourceRef:global,mode}))])assert.equal((await f.join(input)).status,403,'Native cancellation is rechecked on the next click in every Global Admin presentation');
});

test('Studio or frozen ownership cannot be bypassed with a cached native class reference',async t=>{
 const f=await fixture(t);t.mock.timers.setTime(start);ok(await f.join(f.input));
 for(const state of ['STUDIO','FROZEN']){
  f.databases.core.prepare('UPDATE website_platform_access_ownership SET state=? WHERE activity_key=?').run(state,f.scope);
  const result=await f.join(f.input);assert.equal(result.status,409);assert.equal(result.body.code,'STUDIO_JOIN_REQUIRED');assert(!result.body.joinUrl);
 }
});

test('a source admission change during an awaited Join cannot return the resolved meeting URL',async t=>{
 const f=await fixture(t);t.mock.timers.setTime(start);
 const signed=await signedHeaders(f.source.env.WEBSITE_TO_ACADEMY_SECRET,path,{issuedAt:Date.now(),...f.input});
 const request=new Request('http://localhost'+path,{method:'POST',headers:signed.headers,body:signed.payload});
 await assert.rejects(bridge(request,f.source.env,{lessonJoin:async session=>{
  f.databases.core.prepare('INSERT INTO website_platform_admissions VALUES(?,0) ON CONFLICT(account_id) DO UPDATE SET active=0').run(session.account_id);
  return {success:true,joinUrl:'https://zoom.us/j/never-return-this-synthetic'};
 }}),error=>error.status===401);
});
