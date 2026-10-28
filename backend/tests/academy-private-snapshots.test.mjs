import test from 'node:test';
import {readFileSync} from 'node:fs';
import {snapshotRevisionDDL} from '../src/academy/separation/snapshot-revisions.js';
import assert from 'node:assert/strict';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
import worker from '../src/academy-runtime.js';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {privateSnapshot} from '../src/academy/d1/private-snapshot.js';
import {permissionState} from '../src/academy/d1/permission-state.js';
import {acceptedRepository} from '../src/academy/d1/setup-reader.js';
import {actorProof,verifyActor,verifyActorVersion} from '../src/academy/separation/proof.js';
import {selectWorkspace} from '../src/academy/d1/workspace-access.js';
import {splitEngine} from '../src/academy/separation/engine.js';
import {acceptFixtureSetup} from './fixtures/academy-accepted-fixture.mjs';

function bucket(){const objects=new Map();return {objects,gets:0,puts:0,async get(key){this.gets++;const raw=objects.get(key);return raw===undefined?null:{size:new TextEncoder().encode(raw).length,json:async()=>JSON.parse(raw)};},async put(key,raw){this.puts++;objects.set(key,raw);}};}
async function fixture(run,seed){const f=await splitFixture(seed);try{
 f.databases.core.exec("UPDATE split_deployment_state SET state='READY'");
 f.bucket=bucket();Object.assign(f.source.env,{ACADEMY_DB:f.core,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:f.prepared.report.sourceDigest,ACADEMY_SPLIT_COORDINATOR:f.namespace,ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_MEDIA_SEPARATION:'1',LESSON_MEDIA_BUCKET:f.bucket});
 f.request=async(path,input={},who='global',workspace='ADMIN',headers={})=>{const token=await f.source.actor(who),response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'X-Academy-Workspace':workspace,...headers},body:JSON.stringify(input)}),f.source.env);const body=await response.json();return {status:response.status,body};};
 f.auth=async(who='global',workspace='ADMIN')=>{const repository=academyD1Repository(f.source.env);await repository.ready();const state=await repository.byId(f.actors[who]),session=await repository.createSession(state,state.contexts[0]);const auth=selectWorkspace(new Request('http://localhost/api/academy/entrance',{headers:{'X-Academy-Workspace':workspace}}),{state,sid:session.sid,user:{accountid:state.account.account_id,role:state.contexts[0].role}});repository.bindActor(auth);return {repository,auth};};
 await run(f);
}finally{f.close();}}
const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};

test('a reused dashboard timetable snapshot still reflects live deactivation of published annual calendar facts',()=>fixture(async f=>{
 const input={startDate:'2026-10-11'},path='/api/academy/entrance';
 const first=ok(await f.request(path,input)),event=first.calendarEvents.find(e=>e.id==='cache-holiday');
 assert(event,'The accepted calendar fact reaches the dashboard');
 const future=ok(await f.request('/api/academy/calendar/get',{view:'learn',year:2027,month:10},'studentA','LEARN'));
 assert(future.events.some(e=>e.id==='cache-holiday'&&e.startDate==='2027-10-12'),'The cached accepted annual setting is projected for each requested year');
 const puts=f.bucket.puts;
 assert.deepEqual(ok(await f.request(path,input)).calendarEvents,first.calendarEvents);assert.equal(f.bucket.puts,puts);
 await f.core.prepare("UPDATE academy_calendar_events SET active=0 WHERE event_id='cache-holiday'").run();
 const changed=ok(await f.request(path,input));
 assert(!changed.calendarEvents.some(e=>e.id==='cache-holiday'),'A warm source cache must not retain a disabled holiday');
 assert.equal(f.bucket.puts,puts,'The expensive timetable source itself remains reusable through a calendar-only change');
 const before=ok(await f.request('/api/academy/calendar/get',{view:'learn',year:2027,month:10},'studentA','LEARN'));
 assert(!before.events.some(e=>e.id==='cache-holiday'),'Disabled events stay disabled in another account and projection');
 await f.core.prepare('UPDATE account_sessions SET revoked_at=? WHERE account_id=?').bind(new Date().toISOString(),f.actors.studentA).run();
 assert.equal((await f.request('/api/academy/calendar/get',{view:'learn',year:2027,month:10},'studentA','LEARN')).status,401,'Shared source facts cannot replace current session checks');
},source=>{
 source.db.prepare("INSERT INTO academy_calendar_events(event_id,event_type,description,start_date,end_date,teaching_impact,active,scope_key,calendar_kind,revision) VALUES('cache-holiday','TERM','Synthetic cache holiday','2026-10-12','2026-10-12','NO_TEACHING',1,'ACADEMY','ACADEMY_HOLIDAY',1)").run();
 source.db.prepare("INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademyHolidayAnnual:cache-holiday','1','2026-10-01T00:00:00Z')").run();
}));

test('cached empty annual settings stay private until accepted and a changed component refreshes every reader',()=>fixture(async f=>{
 const input={view:'learn',year:2027,month:10},read=()=>f.request('/api/academy/calendar/get',input,'studentA','LEARN');
 assert(!ok(await read()).events.some(e=>e.id==='cache-new-annual'));
 const {auth}=await f.auth();
 await splitEngine(f).write([{sql:"INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES(?,'1',?,?)",params:['AcademyHolidayAnnual:cache-new-annual',new Date().toISOString(),f.actors.global]}],actorProof(auth));
 assert(!ok(await read()).events.some(e=>e.id==='cache-new-annual'),'Saving an unpublished setting cannot replace cached published facts');
 await acceptFixtureSetup(f.source.env,await f.source.actor('global'),['GLOBAL'],['presentation']);
 assert(ok(await read()).events.some(e=>e.id==='cache-new-annual'&&e.startDate==='2027-10-12'),'A new accepted settings component invalidates both the fact cache and the calendar snapshot');
 assert(ok(await f.request('/api/academy/calendar/get',input,'studentB','LEARN')).events.some(e=>e.id==='cache-new-annual'),'The shared immutable facts work for another authorised account too');
},source=>{
 source.db.prepare("INSERT INTO academy_calendar_events(event_id,event_type,description,start_date,end_date,teaching_impact,active,scope_key,calendar_kind,revision) VALUES('cache-new-annual','TERM','New annual setting','2026-10-12','2026-10-12','NO_TEACHING',1,'ACADEMY','ACADEMY_HOLIDAY',1)").run();
}));

test('published snapshots survive unrelated work, but enrolment and live timetable facts invalidate them',()=>fixture(async f=>{
 const {repository,auth}=await f.auth('studentA','LEARN'),reader=acceptedRepository(repository,f.head);let produced=0;
 const read=(extra={})=>privateSnapshot(reader,auth,{kind:'timetable-source',input:{week:'synthetic'},...extra},async()=>({produced:++produced}));
 assert.deepEqual(await read(),{produced:1});assert.deepEqual(await read(),{produced:1});
 await f.core.prepare('UPDATE academy_write_state SET version=version+1 WHERE singleton=1').run();
 assert.deepEqual(await read(),{produced:1},'An unrelated operational write does not invalidate published data');
 await f.core.prepare("INSERT INTO class_memberships(enrollment_id,activity_key,class_id,account_id,active) SELECT 'snapshot-enrolment',activity_key,class_id,?,1 FROM classes LIMIT 1").bind(f.actors.studentA).run();
 assert.deepEqual(await read(),{produced:2},'An account-specific class assignment changes the audience source');
 await f.core.prepare("UPDATE activities SET website_visible=1-website_visible WHERE activity_key=?").bind(f.scopes.courseA).run();
 assert.deepEqual(await read(),{produced:3},'Immediate visibility changes cannot keep a stale snapshot');
 assert.deepEqual(await read({date:'2099-01-01'}),{produced:4},'The app date isolates rollover data');
 assert.deepEqual(await privateSnapshot({...reader,setup:{...reader.setup,head:'different-head'}},auth,{kind:'timetable-source',input:{week:'synthetic'}},async()=>({produced:++produced})),{produced:5});
 assert.equal(f.bucket.objects.size,1,'Date and publication changes replace the same private object');
 await f.core.prepare("INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES(?,'PAID',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value='PAID'").bind('ProgramAccess:'+f.scopes.programA.toUpperCase(),new Date().toISOString()).run();
 assert.deepEqual(await read(),{produced:6},'An immediate access-policy change cannot reuse a free-joining snapshot');
 await f.core.prepare('UPDATE modules SET active=1-active WHERE (activity_key,module_id) IN(SELECT activity_key,module_id FROM modules LIMIT 1)').run();
 assert.deepEqual(await read(),{produced:7},'Immediate curriculum disables invalidate the source too');
}));

test('snapshots isolate accounts, personal and Admin audiences, classes and epochs',()=>fixture(async f=>{
 const {repository,auth}=await f.auth('global','ADMIN'),other=await f.auth('studentA','LEARN');let produced=0;
 const read=(repo,actor)=>privateSnapshot(repo,actor,{kind:'timetable-source'},async()=>({produced:++produced}));
 await read(repository,auth);await read(repository,auth);assert.equal(produced,1);
 await read(other.repository,other.auth);assert.equal(produced,2);
 await read(repository,{...auth,workspaceContext:'ADMIN_TEACH',workspace:'TEACH',adminView:true});assert.equal(produced,3);
 await read(repository,{...auth,workspaceContext:'ADMIN_LEARN',workspace:'LEARN',adminView:true,classView:{activityKey:f.scopes.programA,classId:'one'}});
 await read(repository,{...auth,workspaceContext:'ADMIN_LEARN',workspace:'LEARN',adminView:true,classView:{activityKey:f.scopes.programA,classId:'two'}});assert.equal(produced,5);
 const stored=[...f.bucket.objects.keys()].join(' ');assert(!stored.includes(f.actors.global));assert(!stored.includes(auth.sid));
 await f.core.prepare('UPDATE account_credentials SET credential_epoch=credential_epoch+1 WHERE account_id=?').bind(auth.user.accountid).run();
 await assert.rejects(read(repository,auth),{code:'SESSION_ENDED'});
}));

test('a successful Admin-only definition commit invalidates Admin metadata without weakening the two-store transaction',()=>fixture(async f=>{
 const {repository,auth}=await f.auth(),source=repository.authoringRepository();let produced=0;
 const read=()=>privateSnapshot(source,auth,{kind:'dashboard-assessments'},async()=>({produced:++produced}));
 await read();await read();assert.equal(produced,1);
 await splitEngine(f).write([{sql:'UPDATE activities SET name=? WHERE activity_key=?',params:['Changed draft name',f.scopes.courseA]}],actorProof(auth));
 await read();assert.equal(produced,2);
}));

test('dashboard assessment and calendar cache hits skip their expensive producers and reject revoked sessions',()=>fixture(async f=>{
 for(const [path,input] of [['/api/academy/assessments/list',{dashboard:true,view:'admin'}],['/api/academy/calendar/get',{view:'admin',year:2026,month:10}]]){
  f.costs.length=0;const first=ok(await f.request(path,input)),cold=f.costs.reduce((n,c)=>n+c.queries,0),puts=f.bucket.puts;
  f.costs.length=0;const second=ok(await f.request(path,input)),warm=f.costs.reduce((n,c)=>n+c.queries,0);
  assert.deepEqual(second,first);assert.equal(f.bucket.puts,puts);assert(warm<cold,JSON.stringify({path,cold,warm}));
  console.log('Snapshot coordinator queries',JSON.stringify({path,cold,warm}));
 }
 await f.core.prepare('UPDATE account_sessions SET revoked_at=? WHERE account_id=?').bind(new Date().toISOString(),f.actors.global).run();
 const gets=f.bucket.gets;assert.equal((await f.request('/api/academy/calendar/get',{view:'admin'})).status,401);assert.equal(f.bucket.gets,gets);
}));

test('verification fast path still detects expiry without a database mutation',()=>fixture(async f=>{
 const {auth}=await f.auth(),proof=actorProof(auth),start=Date.now(),expires=new Date(start+60000).toISOString();
 await f.core.prepare('UPDATE account_sessions SET expires_at=? WHERE session_id=?').bind(expires,auth.sid).run();
 let current=new Date(start).toISOString();f.databases.core.function('strftime',{varargs:true},()=>current);
 const version=await verifyActor(f.core,proof);assert.equal(await verifyActorVersion(f.core,proof,version),version);
 current=new Date(start+61000).toISOString();await assert.rejects(verifyActorVersion(f.core,proof,version),{code:'SESSION_ENDED'});
}));

test('cache outages fall back to the same reader, and a concurrent permission revocation never returns cached data',()=>fixture(async f=>{
 const {repository,auth}=await f.auth('studentA','LEARN');let produced=0;
 const read=()=>privateSnapshot(repository,auth,{kind:'timetable-source'},async()=>({produced:++produced}));
 await read();const get=f.bucket.get.bind(f.bucket);f.bucket.get=async key=>{const result=await get(key);await f.core.prepare('UPDATE account_sessions SET revoked_at=? WHERE session_id=?').bind(new Date().toISOString(),auth.sid).run();return result;};
 await assert.rejects(read(),{code:'SESSION_ENDED'});
 const fresh=await f.auth('studentA','LEARN');f.bucket.get=async()=>{throw Error('Synthetic storage outage');};f.bucket.put=async()=>{throw Error('Synthetic storage outage');};
 assert.deepEqual(await privateSnapshot(fresh.repository,fresh.auth,{kind:'timetable-source'},async()=>({produced:++produced})),{produced:2});
}));

test('revocation during a slow snapshot write prevents the response too',()=>fixture(async f=>{
 const {repository,auth}=await f.auth('studentA','LEARN'),put=f.bucket.put.bind(f.bucket);
 f.bucket.put=async(...args)=>{await put(...args);await f.core.prepare('UPDATE account_sessions SET revoked_at=? WHERE session_id=?').bind(new Date().toISOString(),auth.sid).run();};
 await assert.rejects(privateSnapshot(repository,auth,{kind:'timetable-source'},async()=>({data:'private'})),{code:'SESSION_ENDED'});
}));


test('the additive snapshot upgrade is idempotent and missing schema safely bypasses storage',()=>fixture(async f=>{
 const {repository,auth}=await f.auth('studentA','LEARN');let produced=0;
 const read=()=>privateSnapshot(repository,auth,{kind:'timetable-source'},async()=>({produced:++produced}));
 await read();const gets=f.bucket.gets;
 await f.core.prepare("DELETE FROM academy_settings WHERE setting_key='AcademySnapshot:Schema'").run();
 await read();await read();assert.equal(produced,3);assert.equal(f.bucket.gets,gets,'No stored data is read before the invalidation upgrade exists');
 for(const row of f.databases.core.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' AND name LIKE 'academy_snapshot_%'").all())f.databases.core.exec('DROP TRIGGER "'+row.name+'"');
 const sql=readFileSync(new URL('../migrations/academy-core/0002_private_dashboard_snapshots.sql',import.meta.url),'utf8');const existingTables=f.databases.core.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(r=>r.name);assert(sql.endsWith(snapshotRevisionDDL(existingTables)+'\n'));
 f.databases.core.exec('BEGIN;'+sql+'COMMIT;');
 const version=f.databases.core.prepare('SELECT version FROM split_read_state WHERE singleton=1').get().version;
 f.databases.core.exec('BEGIN;'+sql+'COMMIT;');
 assert.equal(f.databases.core.prepare('SELECT version FROM split_read_state WHERE singleton=1').get().version,version,'Reapplying the upgrade makes no writes');
 await read();await read();assert.equal(produced,3,'The original unchanged snapshot remains reusable');
}));

test('permissions reuse the login snapshot through unrelated work and reload immediately for role or subscription changes',()=>fixture(async f=>{
 const {auth}=await f.auth('adminA'),sql=[];
 const binding={withSession(...args){const session=f.core.withSession(...args);return new Proxy(session,{get(target,name){if(name==='prepare')return statement=>{sql.push(statement);return target.prepare(statement);};const value=target[name];return typeof value==='function'?value.bind(target):value;}});}};
 const repository=academyD1Repository({...f.source.env,ACADEMY_DB:binding});await repository.ready();
 const read=()=>repository.session(auth.sid,auth.user.accountid,auth.state.account.credential_epoch),roleScans=()=>sql.filter(s=>s.includes('SELECT r.activity_key,r.role FROM effective_activity_roles r JOIN activities a')).length;
 const first=await read();assert(first.roles.some(r=>r.activity_key===f.scopes.courseA&&r.role==='PROGRAM_ADMIN'));assert.equal(roleScans(),1);
 sql.length=0;const puts=f.bucket.puts;assert.deepEqual(JSON.parse(JSON.stringify(await read())),JSON.parse(JSON.stringify(first)));assert.equal(roleScans(),0,'Warm navigation does not rebuild roles or course subscriptions');
 await f.core.prepare('UPDATE academy_write_state SET version=version+1 WHERE singleton=1').run();await read();assert.equal(roleScans(),0);assert.equal(f.bucket.puts,puts);
 const fresh=await read(),cachedAuth={...auth,state:fresh,authority:fresh};sql.length=0;
 await privateSnapshot(repository,cachedAuth,{kind:'dashboard-assessments'},async()=>({safe:true}));assert.equal(sql.filter(s=>s.includes(' roles_json')).length,0,'The same request reuses its verified permission version');
 const serialized=JSON.parse(JSON.stringify(fresh));await privateSnapshot(repository,{...cachedAuth,state:serialized,authority:serialized},{kind:'dashboard-assessments'},async()=>({safe:true}));assert.equal(sql.filter(s=>s.includes(' roles_json')).length,1,'Serialized input cannot forge the server-only verification marker');
 await f.core.prepare('UPDATE role_assignments SET account_id=upper(account_id),active=0 WHERE account_id=? AND activity_key=?').bind(auth.user.accountid,f.scopes.courseA).run();
 await assert.rejects(privateSnapshot(repository,cachedAuth,{kind:'dashboard-assessments'},async()=>({safe:false})),{code:'SESSION_ENDED'},'A permission change after login verification forces a fresh authority check');
 const changed=await read();assert(!changed.roles.some(r=>r.activity_key===f.scopes.courseA));assert.equal(roleScans(),1,'Case-insensitive account references cannot bypass invalidation');
 await f.core.prepare('INSERT INTO course_subscription_decisions(account_id,activity_key,active,revision,updated_at,updated_by_account_id) VALUES(?,?,1,1,?,?) ON CONFLICT(account_id,activity_key) DO UPDATE SET active=1').bind(auth.user.accountid.toUpperCase(),f.scopes.courseB,new Date().toISOString(),f.actors.global).run();
 assert((await read()).subscriptions.some(r=>r.activity_key===f.scopes.courseB));assert.equal(roleScans(),2);
 const objects=[...f.bucket.objects].filter(([key])=>key.startsWith('academy-private-permissions/'));assert.equal(objects.length,1);
 for(const [,json] of objects){const data=JSON.parse(json).data;assert(!Object.hasOwn(data,'account'));assert(!/pin_hash|pin_setup|session_id|credential_epoch/.test(json));}
 const gets=f.bucket.gets;await f.core.prepare('UPDATE account_sessions SET revoked_at=? WHERE session_id=?').bind(new Date().toISOString(),auth.sid).run();assert.equal(await read(),null);assert.equal(f.bucket.gets,gets,'Invalid sessions never reach the cached permissions');
}));

test('login populates the permission snapshot and account blocks or PIN resets take effect immediately',()=>fixture(async f=>{
 ok(await f.request('/api/account/login',{uniqueid:'separation-global',pin:'1234'}));
 assert([...f.bucket.objects.keys()].some(key=>key.startsWith('academy-private-permissions/')));
 const {repository,auth}=await f.auth('studentA','LEARN'),read=()=>repository.session(auth.sid,auth.user.accountid,auth.state.account.credential_epoch);
 assert(await read());await f.core.prepare('UPDATE accounts SET active=0 WHERE account_id=?').bind(auth.user.accountid).run();assert.equal(await read(),null);
 await f.core.prepare('UPDATE accounts SET active=1 WHERE account_id=?').bind(auth.user.accountid).run();assert(await read());
 await f.core.prepare('UPDATE account_credentials SET credential_epoch=credential_epoch+1 WHERE account_id=?').bind(auth.user.accountid).run();assert.equal(await read(),null);
}));

test('permission snapshots retry a changing revision and reject revocation during storage without caching credentials',async()=>{
 const storage=bucket(),base={activities:[],roles:[],subscriptions:[],contexts:[],myLinksAvailable:false,account:{pin_hash:'private-secret'}},namespace=['synthetic'];let revision=1,active=true,loads=0;
 const gate=async()=>active?{enabled:true,revision:String(revision),account:{display_name:'Current'}}:null,load=async()=>{loads++;return base;};
 const read=()=>permissionState({bucket:storage,namespace,accountId:'actor',gate,load});
 assert.equal((await read()).account.display_name,'Current');await read();assert.equal(loads,1);assert(![...storage.objects.values()].join().includes('private-secret'));
 const get=storage.get.bind(storage);storage.get=async key=>{const value=await get(key);revision++;storage.get=get;return value;};await read();assert.equal(loads,2,'A changed source during a cache hit is loaded again');
 const put=storage.put.bind(storage);revision++;storage.put=async(...args)=>{await put(...args);active=false;};assert.equal(await read(),null);
 active=true;storage.get=async()=>{throw Error('Synthetic cache outage');};storage.put=async()=>{throw Error('Synthetic cache outage');};assert.equal((await read()).account.display_name,'Current');
});
