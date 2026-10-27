import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {messagingFixture} from './fixtures/academy-messaging-fixture.mjs';
import {recoverWeeklyAbsentees,previousAttendanceWeek,weeklyAbsenteeCron} from '../src/academy/d1/weekly-absentees.js';
import worker from '../src/academy/d1/worker.js';
const monday=new Date('2026-11-02T05:00:00Z'),id='weekly-absentees:2026-10-26';
async function use(fn,split=false){const f=await messagingFixture({split});try{
 f.db.exec(readFileSync(new URL(split?'../migrations/academy-core/0005_weekly_absentees.sql':'../migrations/academy/0040_weekly_absentees.sql',import.meta.url),'utf8'));
 f.env.ACADEMY_WEEKLY_ABSENTEES='1';
 // Saved registers with frozen roster names. No live learner eligibility is needed.
 const add=(suffix,scope,day,absent=true)=>{
  f.db.prepare('INSERT INTO attendance_days VALUES(?,?,?,?,?,?)').run('day-'+suffix,scope,day,'Africa/Johannesburg','head','now');
  f.db.prepare('INSERT INTO attendance_roster_versions VALUES(?,?,?,?,?)').run('roster-'+suffix,scope,suffix,1,'now');
  f.db.prepare('INSERT INTO attendance_roster_members VALUES(?,?,?)').run('roster-'+suffix,'account-0002','Frozen learner '+suffix);
  f.db.prepare('INSERT INTO attendance_series VALUES(?,?,?,?)').run('series-'+suffix,'day-'+suffix,suffix,'version-'+suffix);
  f.db.prepare('INSERT INTO attendance_day_contexts VALUES(?,?,?,?,?,?,?,?)').run('ctx-'+suffix,'day-'+suffix,'series-'+suffix,'class',null,JSON.stringify({className:'Class '+suffix,moduleName:'Qasas',startTime:'09:00'}),'roster-'+suffix,1);
  f.db.prepare('INSERT INTO attendance_register_versions VALUES(?,?,?,?,?,?,?,?,?)').run('version-'+suffix,'series-'+suffix,null,'roster-'+suffix,Number(absent),'2026-11-01T12:00:00Z',f.actors.global,suffix,'NATIVE_V1');
  if(absent)f.db.prepare('INSERT INTO attendance_absences VALUES(?,?,?)').run('version-'+suffix,'roster-'+suffix,'account-0002');
 };
 add('a',f.scopes.programA,'2026-10-26');add('b',f.scopes.programB,'2026-10-27');add('corrected',f.scopes.courseA,'2026-10-28');add('present',f.scopes.courseA,'2026-10-29',false);add('outside',f.scopes.courseB,'2026-11-02');
 f.db.prepare('INSERT INTO attendance_register_versions VALUES(?,?,?,?,?,?,?,?,?)').run('correction','series-corrected','version-corrected','roster-corrected',0,'2026-11-01T13:00:00Z',f.actors.global,'corrected-again','NATIVE_V1');
 f.db.exec("UPDATE attendance_series SET latest_version_id='correction' WHERE series_id='series-corrected';INSERT INTO attendance_days VALUES('unsubmitted','"+f.scopes.programA+"','2026-10-30','Africa/Johannesburg','head','now')");
 await fn(f);
 }finally{f.close();}}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const get=(f,token,workspace='ADMIN')=>f.request('get',{noticeId:id,operationId:crypto.randomUUID()},token,workspace);

test('previous full week and Riyadh schedule use Monday 08:00 with bounded retry ticks',()=>{
 assert.deepEqual(previousAttendanceWeek(monday),{start:'2026-10-26',end:'2026-11-01'});
 assert.deepEqual(previousAttendanceWeek(new Date('2027-01-04T05:00:00Z')),{start:'2026-12-28',end:'2027-01-03'});
 assert.equal(weeklyAbsenteeCron,'0,15,30,45 5-6 * * MON');
});
for(const split of [false,true])test('weekly snapshot and inbox preserve latest marks, scope, revocation and retries'+(split?' through split runtime':''),()=>use(async f=>{
 assert((await recoverWeeklyAbsentees(f.env,new Date('2026-11-02T04:59:00Z'))).skipped);
 const global=await f.actor('global'),adminA=await f.actor('adminA'),teacher=await f.actor('teacherA');
 f.db.prepare("UPDATE accounts SET active=0 WHERE account_id='account-0002'").run();
 await Promise.all([recoverWeeklyAbsentees(f.env,monday),recoverWeeklyAbsentees(f.env,monday)]);assert((await recoverWeeklyAbsentees(f.env,new Date('2026-11-02T05:15:00Z'))).replayed);
 assert.equal(f.db.prepare('SELECT count(*) n FROM weekly_absentee_reports').get().n,1);
 assert.equal(f.db.prepare('SELECT count(*) n FROM weekly_absentee_rows').get().n,2);
 assert.equal(f.db.prepare('SELECT count(*) n FROM weekly_absentee_recipients WHERE account_id=?').get(f.actors.global).n,1);
 assert.equal(f.db.prepare('SELECT count(*) n FROM weekly_absentee_recipients WHERE account_id=?').get(f.actors.teacherA).n,0);
 const summary=ok(await f.request('summary',{},global,'ADMIN'));assert.equal(summary.counts.unread,1);assert.equal(summary.notices[0].id,id);
 const list=ok(await f.request('list',{},global,'ADMIN'));assert.equal(list.notices[0].body,'');assert.equal(list.notices[0].sender,'Academy');
 const report=ok(await get(f,global)).notice;assert.match(report.body,/Frozen learner a/);assert.match(report.body,/Frozen learner b/);assert.doesNotMatch(report.body,/Frozen learner (corrected|present|outside)/);
 const scoped=ok(await get(f,adminA)).notice.body;assert.match(scoped,/Frozen learner a/);assert.doesNotMatch(scoped,/Frozen learner b/);
 assert.equal((await get(f,teacher)).status,403);assert.equal((await get(f,global,'ADMIN_LEARN')).status,403);assert.equal((await get(f,global,'LEARN')).status,403);
 assert.equal(ok(await f.request('summary',{},global,'ADMIN')).counts.unread,0);
 ok(await f.request('archive',{noticeId:id,operationId:crypto.randomUUID()},global,'ADMIN'));assert.equal(ok(await f.request('list',{},global,'ADMIN')).notices.length,0);
 assert.equal(ok(await f.request('list',{folder:'archived'},global,'ADMIN')).notices[0].id,id);
 ok(await f.request('restore',{noticeId:id,operationId:crypto.randomUUID()},global,'ADMIN'));
 // A late correction cannot mutate a delivered historical snapshot.
 f.db.prepare('INSERT INTO attendance_register_versions VALUES(?,?,?,?,?,?,?,?,?)').run('late-correction','series-a','version-a','roster-a',0,'2026-11-02T06:00:00Z',f.actors.global,'late-correction','NATIVE_V1');f.db.exec("UPDATE attendance_series SET latest_version_id='late-correction' WHERE series_id='series-a'");assert.match(ok(await get(f,adminA)).notice.body,/Frozen learner a/);
 f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id=? AND role='PROGRAM_ADMIN'").run(f.actors.adminA);
 assert([401,403].includes((await get(f,adminA)).status));
 if(split){assert.equal(f.databases.admin.prepare("SELECT count(*) n FROM sqlite_schema WHERE name LIKE 'weekly_absentee_%'").get().n,0);f.db.exec("INSERT INTO split_commands(command_id,phase,payload_hash,created_at) VALUES('weekly-held','PREPARING','held','now');INSERT INTO split_write_fence VALUES(1,'weekly-held',0)");assert.throws(()=>f.db.exec('UPDATE weekly_absentee_recipients SET unread=1'),/split_write_busy/);f.db.exec('DELETE FROM split_write_fence');}
},split));
test('failed generation rolls back all snapshots and notices, then recovers without duplication',()=>use(async f=>{
 f.db.exec("CREATE TRIGGER weekly_failure BEFORE INSERT ON weekly_absentee_recipients BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
 await assert.rejects(recoverWeeklyAbsentees(f.env,monday),/synthetic failure/);
 for(const t of ['reports','rows','recipients'])assert.equal(f.db.prepare('SELECT count(*) n FROM weekly_absentee_'+t).get().n,0);
 f.db.exec('DROP TRIGGER weekly_failure');await recoverWeeklyAbsentees(f.env,monday);
 assert.equal(f.db.prepare('SELECT count(*) n FROM weekly_absentee_reports').get().n,1);
}));
test('only the weekly cron starts weekly work; ordinary minute ticks do not query report tables',async()=>{
 const tasks=[];await worker.scheduled({cron:weeklyAbsenteeCron,scheduledTime:monday.getTime()},{ENVIRONMENT:'local',ACADEMY_D1_MODE:'REHEARSAL'}, {waitUntil:p=>tasks.push(p)});await Promise.all(tasks);assert.equal(tasks.length,1);
});
