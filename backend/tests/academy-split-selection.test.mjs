import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {separationFixture,separationScopes as scopes} from './fixtures/academy-separation-fixture.mjs';
import {selectActiveSnapshot,excludedTables} from '../tools/academy-split/selection.mjs';
const at='2026-10-23T04:00:00.000Z';
function snapshot(db){const schema=db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all();return {format:'ACADEMY_PRIVATE_RECOVERY_V1',database:'synthetic',at,records:[...schema.map(r=>({kind:'SCHEMA',type:r.type,name:r.name,data:r.sql})),...schema.filter(r=>r.type==='table').map(r=>({kind:'DATA',name:r.name,data:JSON.stringify(db.prepare('SELECT * FROM "'+r.name+'"').all())}))]};}
async function use(fn){const f=await separationFixture();try{for(const name of ['0039_course_websites.sql','0032_accepted_setup.sql','0033_native_attendance.sql','0034_assessment_operations.sql','0035_media_contributions.sql']){f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));f.db.exec('COMMIT');}await fn(f);}finally{f.close();}}
test('fresh selection excludes inactive identities and expired sessions, without re-enabling current deny policies',()=>use(async f=>{
 f.db.prepare('UPDATE accounts SET active=0 WHERE account_id=?').run(f.actors.studentB);
 f.db.prepare("INSERT INTO memorisation_account_settings(account_id,active,revision,updated_at,updated_by) VALUES(?,0,1,?,?)").run(f.actors.studentA,at,f.actors.global);
 f.db.prepare("INSERT INTO memorisation_activity_settings(activity_key,active,revision,updated_at,updated_by) VALUES(?,0,1,?,?) ON CONFLICT(activity_key) DO UPDATE SET active=0").run(scopes.programA,at,f.actors.global);
 const source=snapshot(f.db),before=JSON.stringify(source),plan=selectActiveSnapshot(source,{at});
 assert(!plan.rows.accounts.some(r=>r.account_id===f.actors.studentB));assert(!plan.rows.account_credentials.some(r=>r.account_id===f.actors.studentB));
 assert(plan.rows.account_sessions.every(r=>r.expires_at>at&&!r.revoked_at));assert.equal(plan.rows.memorisation_account_settings.find(r=>r.account_id===f.actors.studentA).active,0);assert.equal(plan.rows.memorisation_activity_settings.find(r=>r.activity_key===scopes.programA).active,0);
 assert.equal(JSON.stringify(source),before);for(const name of excludedTables)assert(!Object.hasOwn(plan.rows,name));
}));
test('only currently effective source roles/subscriptions are materialised; a designation adds no scoped role',()=>use(async f=>{
 f.db.prepare('INSERT INTO academy_teacher_designations(account_id,active,revision,updated_at,updated_by_account_id) VALUES(?,1,1,?,?)').run(f.actors.none,at,f.actors.global);
 const plan=selectActiveSnapshot(snapshot(f.db),{at});assert(plan.rows.role_assignments.some(r=>r.account_id===f.actors.teacherA&&r.activity_key===scopes.programA&&r.role==='TEACHER'));assert(!plan.rows.role_assignments.some(r=>r.account_id===f.actors.none));
 const expected=f.db.prepare('SELECT account_id,activity_key FROM effective_course_subscriptions').all().filter(r=>plan.rows.accounts.some(a=>a.account_id===r.account_id));
 assert.deepEqual(plan.rows.course_subscription_decisions.map(r=>[r.account_id,r.activity_key]).sort(),expected.map(r=>[r.account_id,r.activity_key]).sort());assert(!plan.rows.role_assignments.some(r=>!r.active||r.review_state!=='CONFIRMED'));
}));
test('inactive and archived Course deliveries leave no selected sessions, lifecycle rows or publications',()=>use(async f=>{
 f.db.prepare("UPDATE course_runs SET active=0 WHERE activity_key='COURSE:subject-1'").run();const plan=selectActiveSnapshot(snapshot(f.db),{at});
 for(const table of ['course_runs','course_draft_sessions','course_run_state','course_session_state','course_draft_lifecycle','course_management_drafts'])assert(!plan.rows[table].some(r=>r.activity_key==='COURSE:subject-1'));
 assert(!plan.rows.timetable_publications.some(r=>r.activity_key==='COURSE:subject-1'));assert(!plan.rows.lesson_lifecycle.some(r=>r.activity_key==='COURSE:subject-1'));assert(plan.rows.accounts.length);
}));
