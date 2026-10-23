import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {separationFixture,separationScopes as scopes} from './fixtures/academy-separation-fixture.mjs';
import {initialiseAcceptedSetup} from '../src/academy/d1/setup-publication.js';
import {acceptedDatabase} from '../src/academy/d1/setup-reader.js';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {selectActiveSnapshot,excludedTables} from '../tools/academy-split/selection.mjs';
import {addAcceptedSource,prepareTargets} from '../tools/academy-split/prepare.mjs';
import {databaseSnapshot,databaseManifest,importSQL} from '../tools/academy-split/artifact.mjs';
import {sqliteD1} from '../tools/academy-split/sqlite-d1.mjs';
import {emptyCompatibilityDatabase} from '../src/academy/separation/compatibility.js';
import {emptyShapes} from '../src/academy/separation/empty-shapes.js';
import {federatedDatabase} from '../src/academy/separation/federation.js';
import {sqlCommand} from '../src/academy/separation/sql-command.js';
const at='2026-10-23T04:00:00.000Z';
async function use(fn){const f=await separationFixture();let prepared;try{
 for(const name of ['0032_accepted_setup.sql','0033_native_attendance.sql','0034_assessment_operations.sql','0035_media_contributions.sql']){f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));f.db.exec('COMMIT');}
 f.env.ACADEMY_ACCEPTED_SETUP='1';f.env.ACADEMY_LEARNING_OPERATIONS='3';f.env.ACADEMY_MEDIA_SEPARATION='1';const initial=await initialiseAcceptedSetup(f.env.ACADEMY_DB);
 f.prepare=async()=>{const source=databaseSnapshot(f.db,'synthetic',at),selection=addAcceptedSource(selectActiveSnapshot(source,{at}),source);prepared=await prepareTargets(selection);return {source,selection,...prepared};};await fn(f,initial);
 }finally{prepared?.close();f.close();}}
test('the fresh stores preserve authority and accepted content while Admin alone keeps private drafts',()=>use(async f=>{
 const old=f.db.prepare('SELECT name FROM activities WHERE activity_key=?').get(scopes.programA).name;
 f.db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Unpublished private definition',scopes.programA);
 f.db.prepare("INSERT INTO operation_receipts VALUES('USER_PROFILES','ACADEMY','retry-kept',?,'{\"saved\":true}',?,?)").run('a'.repeat(64),f.actors.global,at);
 const {databases,selection,report}=await f.prepare(),core=emptyCompatibilityDatabase(sqliteD1(databases.core),emptyShapes,{currentGrants:true});
 assert.equal(databases.admin.prepare('SELECT name FROM activities WHERE activity_key=?').get(scopes.programA).name,'Unpublished private definition');
 const read=acceptedDatabase(core,report.head,{mediaSeparation:true});assert.equal((await read.prepare('SELECT name FROM activities WHERE activity_key=?').bind(scopes.programA).first()).name,old);
 for(const table of ['accounts','account_credentials','account_sessions','role_assignments','global_role_assignments'])assert(!databases.admin.prepare('SELECT 1 FROM sqlite_schema WHERE type=\'table\' AND name=?').get(table));
 for(const table of excludedTables)for(const db of Object.values(databases))assert(!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table));
 assert.equal(databases.core.prepare("SELECT count(*) n FROM operation_receipts WHERE operation_id='retry-kept'").get().n,1);assert.equal(databases.admin.prepare('SELECT count(*) n FROM operation_receipts').get().n,0);
 const before=academyD1Repository(f.env),after=academyD1Repository({...f.env,ACADEMY_DB:sqliteD1(databases.core),ACADEMY_ADMIN_DB:sqliteD1(databases.admin),ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_SPLIT_COORDINATOR:{getByName(){throw Error('Offline copy is read-only');}},ACADEMY_D1_RUN_ID:selection.manifest.sourceDigest});
 for(const row of selection.rows.accounts){const original=await before.byId(row.account_id),copied=await after.byId(row.account_id);assert.deepEqual(copied.roles,original.roles);assert.deepEqual(copied.contexts,original.contexts);assert.equal(copied.account.pin_hash,original.account.pin_hash);}
 await assert.rejects(after.ready(),e=>e.code==='SPLIT_PREPARATION_REQUIRED');
}));
test('exact accepted history required by active attendance is retained without unrelated candidates',()=>use(async(f,initial)=>{
 f.db.prepare('INSERT INTO attendance_days VALUES(?,?,?,?,?,?)').run('selected-day',scopes.programA,'2026-10-23','Africa/Johannesburg',initial.head,at);
 const {selection,databases,report}=await f.prepare();assert.equal(selection.manifest.acceptedHistory.directlyReferencedHeads,1);assert(databases.core.prepare('SELECT 1 FROM setup_heads WHERE head_id=?').get(initial.head));assert.notEqual(initial.head,report.head);assert.equal(databases.core.prepare("SELECT setup_head FROM attendance_days WHERE day_id='selected-day'").get().setup_head,initial.head);
 const original=f.db.prepare('SELECT component_id,rows_json,digest FROM setup_components ORDER BY component_id').all(),kept=databases.core.prepare('SELECT component_id,rows_json,digest FROM setup_components WHERE batch_id=? ORDER BY component_id').all(f.db.prepare('SELECT batch_id FROM setup_heads WHERE head_id=?').get(initial.head).batch_id);assert.deepEqual(kept,original);
 assert.deepEqual(databases.core.prepare('PRAGMA foreign_key_check').all(),[]);
}));
test('private SQL round trips enforce foreign keys and preserve Unicode, large frozen bytes and exact hashes',()=>use(async f=>{
 const message='﷽ 🌍 assignment\n'.repeat(12000);f.db.prepare("INSERT INTO academy_announcements(announcement_id,title,message,active,display_order,revision,created_at,updated_at,updated_by) VALUES('large-utf8','Copy test',?,1,0,1,?,?,?)").run(message,at,at,f.actors.global);
 const {databases,schemas}=await f.prepare();for(const owner of ['core','admin']){const sql=importSQL(databases[owner],schemas[owner]),copy=new DatabaseSync(':memory:');try{copy.exec('PRAGMA foreign_keys=ON;'+sql);assert.deepEqual(databaseManifest(copy),databaseManifest(databases[owner]));assert.equal(copy.prepare("SELECT count(*) n FROM sqlite_schema WHERE name='_split_import_values'").get().n,0);assert.deepEqual(copy.prepare('PRAGMA foreign_key_check').all(),[]);if(owner==='admin'){assert(sql.includes('UPDATE _split_import_values SET'));assert.equal(copy.prepare("SELECT message FROM academy_announcements WHERE announcement_id='large-utf8'").get().message,message);}}finally{copy.close();}}
}));
test('read federation keeps Core credentials private, uses current disable facts and refuses all writes including WITH mutations',()=>use(async f=>{
 const {databases}=await f.prepare(),core=emptyCompatibilityDatabase(sqliteD1(databases.core),emptyShapes,{currentGrants:true}),admin=sqliteD1(databases.admin),view=federatedDatabase({core,admin,owner:'admin'});
 databases.admin.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Private Admin name',scopes.programA);databases.core.prepare('UPDATE activities SET active=0 WHERE activity_key=?').run(scopes.programA);
 const row=await view.prepare('SELECT name,active FROM activities WHERE activity_key=?').bind(scopes.programA).first();assert.equal(row.name,'Private Admin name');assert.equal(row.active,0);
 const credentials=await view.prepare('SELECT pin_hash,credential_epoch FROM account_credentials WHERE account_id=?').bind(f.actors.global).first();assert.equal(credentials.pin_hash,'VERIFIED');assert.equal(credentials.credential_epoch,1);
 assert((await view.prepare('SELECT count(*) n FROM effective_activity_roles').first()).n>0);
 const sql='WITH change AS(SELECT 1) UPDATE activities SET active=1';assert.equal(sqlCommand(sql),'UPDATE');await assert.rejects(view.prepare(sql).all(),e=>e.code==='SPLIT_WRITES_PREPARING');await assert.rejects(view.batch([view.prepare(sql)]),e=>e.code==='SPLIT_WRITES_PREPARING');assert.equal(databases.core.prepare('SELECT active FROM activities WHERE activity_key=?').get(scopes.programA).active,0);
}));
test('SQL command classification ignores comments, strings and nested CTEs',()=>{
 for(const sql of ["/* UPDATE fake */ SELECT 'DELETE FROM accounts'",'WITH x AS(SELECT 1), y AS(SELECT * FROM x) SELECT * FROM y','WITH RECURSIVE x(n) AS(SELECT 1 UNION SELECT n+1 FROM x WHERE n<3) SELECT * FROM x'])assert.equal(sqlCommand(sql),'SELECT');
 for(const verb of ['INSERT','UPDATE','DELETE','REPLACE'])assert.equal(sqlCommand('WITH x AS(SELECT \'SELECT\') '+verb+' INTO examples'),verb);
});
test('federation preserves quoted literals, quoted table references and numbered bindings after comments',()=>use(async f=>{
 const {databases}=await f.prepare(),view=federatedDatabase({core:emptyCompatibilityDatabase(sqliteD1(databases.core),emptyShapes,{currentGrants:true}),admin:sqliteD1(databases.admin),owner:'admin'}),row=await view.prepare(`/* source comment */ WITH x AS(SELECT '?2 FROM activities' note) SELECT "activities".name,x.note,?2 suffix FROM "activities" CROSS JOIN x WHERE activity_key=?1`).bind(scopes.programA,'literal binding').first();assert.equal(row.note,'?2 FROM activities');assert.equal(row.suffix,'literal binding');assert(row.name);
}));
