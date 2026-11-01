import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeMediaBridgeFixture} from './fixtures/academy-native-media-bridge-fixture.mjs';
import {signedHeaders} from '../src/academy/d1/web-platform/protocol.mjs';
import worker from '../src/academy-runtime.js';
import {createSessionToken} from '../src/lib/auth-primitives.js';
import {lessonTimes} from '../src/academy/entrance.js';
import {createHash} from 'node:crypto';

const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
test('a signed-in nonmember receives a current public FREE programme Join without acquiring programme rights',async t=>{
 const f=await nativeMediaBridgeFixture({seed:source=>{
  const scope=source.scopes.programA,p=source.db.prepare("SELECT * FROM timetable_publications WHERE activity_key=? AND pattern='WEEKLY' ORDER BY version_no DESC LIMIT 1").get(scope),snapshot=JSON.parse(p.snapshot_json);snapshot.programZoomLink='';snapshot.rules=snapshot.rules.map(row=>({...row,zoomLink:'',effectiveZoomLink:'',zoomSource:'CLASS'}));
  source.db.prepare('UPDATE classes SET zoom_link=? WHERE activity_key=?').run('https://zoom.us/j/00000000000',scope);
  const encoded=JSON.stringify(snapshot),next={...p,publication_id:'free-class-'+crypto.randomUUID(),version_no:p.version_no+100,snapshot_json:encoded,source_snapshot_sha256:createHash('sha256').update(encoded).digest('hex')};
  source.db.prepare('INSERT INTO timetable_publications('+Object.keys(next).join(',')+') VALUES('+Object.keys(next).map(()=>'?').join(',')+')').run(...Object.values(next));source.db.prepare('UPDATE program_publication_state SET latest_publication_id=? WHERE activity_key=?').run(next.publication_id,scope);
 }});t.after(()=>f.close());
 f.databases.core.prepare("UPDATE website_platform_access_ownership SET state='ACADEMY' WHERE activity_key=?").run(f.scope);
 f.databases.core.prepare("INSERT INTO academy_settings(setting_key,setting_value) VALUES(?,'FREE') ON CONFLICT(setting_key) DO UPDATE SET setting_value='FREE'").run('ProgramAccess:'+f.scope.toUpperCase());
 const token=await f.source.login('0007'),sourceRef=await f.sourceRef(token),roles=f.databases.core.prepare('SELECT * FROM role_assignments WHERE account_id=? ORDER BY assignment_id').all('account-0007');
 const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());f.databases.core.prepare('UPDATE website_platform_sessions SET context_json=? WHERE source_ref=?').run(JSON.stringify({scope:claims.scope,courseId:claims.courseid||'',role:claims.role}),sourceRef);
 const call=async(path,input)=>{const signed=await signedHeaders(f.source.env.WEBSITE_TO_ACADEMY_SECRET,path,{issuedAt:Date.now(),sourceRef,...input}),response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:signed.headers,body:signed.payload}),f.source.env);return {status:response.status,body:await response.json()};};
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-09T07:55:00Z')});
 const publicReply=await worker.fetch(new Request('http://localhost/api/academy/entrance',{method:'POST',headers:{'Content-Type':'application/json','X-Academy-Workspace':'LEARN'},body:JSON.stringify({startDate:'2026-10-09'})}),f.source.env),publicHome=ok({status:publicReply.status,body:await publicReply.json()}),publicLesson=publicHome.timetable.find(row=>row.activityId===f.scope.slice(8)&&row.date==='2026-10-09'&&row.publicJoin);assert(publicLesson,'The fixture is an actual currently published public FREE programme');
 const {iat,exp,...identity}=claims,currentToken=await createSessionToken(identity,f.source.env);
 const signedHome=ok(await f.request('/api/academy/entrance',{startDate:'2026-10-09'},currentToken,'LEARN'));assert(!signedHome.personalActivities.some(row=>row.id===f.scope.slice(8)&&row.roles.length),'The account has no programme role');
 const dashboard=ok(await call('/internal/website/dashboard',{mode:'learn'})).dashboard,lesson=dashboard.timetable.find(row=>row.activityId===publicLesson.activityId&&row.date===publicLesson.date&&row.nativeJoin);
 assert(lesson,'All signed-in users must see the eligible free programme in the dashboard');
 assert.equal(dashboard.freeProgrammeJoinVersion,1);
 assert.equal(lesson.nativeJoin.joinKey,publicLesson.joinKey);assert(!JSON.stringify(lesson).includes('zoom.'));
 assert(!lesson.classNames&&!lesson.teacherNames&&!lesson.subjectName,'Public references must not reveal private classroom labels');
 const input={mode:'learn',...lesson.nativeJoin},times=lessonTimes(publicLesson),join=()=>call('/internal/website/lesson-join',input);
 t.mock.timers.setTime(times.joinAvailableAt-1);assert.equal((await join()).body.code,'LESSON_NOT_OPEN');
 const earlier=ok(await call('/internal/website/dashboard',{mode:'learn'})).dashboard;assert(earlier.timetable.some(row=>row.nativeJoin?.joinKey===input.joinKey),'Future public metadata supports the local clock without polling');
 for(const now of [times.joinAvailableAt,times.startsAt,times.endsAt-1]){t.mock.timers.setTime(now);assert.match(ok(await join()).joinUrl,/^https:\/\//);}
 t.mock.timers.setTime(times.endsAt);assert.equal((await join()).body.code,'LESSON_NOT_OPEN');
 t.mock.timers.setTime(times.startsAt);
 for(const state of ['FROZEN','STUDIO']){f.databases.core.prepare('UPDATE website_platform_access_ownership SET state=? WHERE activity_key=?').run(state,f.scope);assert.equal((await join()).body.code,'STUDIO_JOIN_REQUIRED');}
 f.databases.core.prepare("UPDATE website_platform_access_ownership SET state='ACADEMY' WHERE activity_key=?").run(f.scope);
 f.databases.core.prepare("UPDATE academy_settings SET setting_value='PAID' WHERE setting_key=?").run('ProgramAccess:'+f.scope.toUpperCase());assert.equal((await join()).body.code,'LESSON_UNAVAILABLE');
 const paid=ok(await call('/internal/website/dashboard',{mode:'learn'})).dashboard;assert(!paid.timetable.some(row=>row.nativeJoin?.joinKey===input.joinKey),'A current Paid decision removes the public reference');
 assert.deepEqual(f.databases.core.prepare('SELECT * FROM role_assignments WHERE account_id=? ORDER BY assignment_id').all('account-0007'),roles);
});
