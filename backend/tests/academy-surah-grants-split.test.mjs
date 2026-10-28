import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {splitVideoFixture} from './fixtures/academy-session-video-split-fixture.mjs';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {actorProof,verifyActor,verifyActorVersion} from '../src/academy/separation/proof.js';
import {selectWorkspace} from '../src/academy/d1/workspace-access.js';
import {storeColumns} from '../src/academy/separation/columns.js';
import {sourceLayout} from '../src/academy/separation/layout.js';
import {op,ok} from './fixtures/academy-surah-grants-fixture.mjs';
const file=name=>readFileSync(new URL('../migrations/academy-core/'+name,import.meta.url),'utf8');
function cacheBucket(){const objects=new Map();return {objects,puts:0,async get(key){const raw=objects.get(key);return raw?{size:Buffer.byteLength(raw),json:async()=>JSON.parse(raw)}:null;},async put(key,raw){this.puts++;objects.set(key,raw);}};}
async function use(run){const f=await splitVideoFixture();try{
 f.databases.core.exec(file('0006_program_monthly_subscriptions.sql'));f.databases.core.exec(file('0008_program_surah_grants.sql'));
 for(const db of Object.values(f.databases))db.prepare('UPDATE activities SET name=? WHERE activity_key=?').run('Tafseer',f.scopes.programA);
 Object.assign(f.source.env,{ACADEMY_MONTHLY_SUBSCRIPTIONS:'1',ACADEMY_SURAH_GRANTS:'1',LESSON_MEDIA_BUCKET:cacheBucket()});
 const columns=f.databases.core.prepare('PRAGMA table_info(program_surah_grants)').all().map(c=>c.name);assert.deepEqual(columns,storeColumns.core.program_surah_grants);assert.deepEqual(columns,sourceLayout.program_surah_grants.columns);
 f.token=await f.source.actor('global');f.monthly=(action,input={},token=f.token)=>f.request('/api/admin/platform/program-monthly-subscriptions/'+action,{activityKey:f.scopes.programA,...input},token);
 ok(await f.monthly('configure',{mode:'prepare',policyRevision:0,operationId:op()}));f.id=op();
 ok(await f.monthly('surah-save',{policyRevision:1,operationId:op(),entries:[{id:f.id,name:'Surah Maryam',cardKey:'yaseen',completionDate:'2024-01-16',active:true,revision:0}]}));
 f.change=(active,revision=0,token=f.token)=>f.monthly('surah-grants-save',{accountId:f.actors.studentA,policyRevision:2,operationId:op(),entries:[{id:f.id,active,revision}]},token);
 await run(f);for(const db of Object.values(f.databases))assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
}finally{f.close();}}
test('split grants use scoped current authority, per-account invalidation and cached permission proofs',()=>use(async f=>{
 const own=await f.source.actor('adminA'),outside=await f.source.actor('adminB');assert.equal((await f.change(true,0,outside)).status,403);ok(await f.change(true,0,own));
 const repo=academyD1Repository(f.source.env);await repo.ready();const student=await repo.byId(f.actors.studentA),other=await repo.byId(f.actors.studentB),session=await repo.createSession(student,student.contexts[0]),otherSession=await repo.createSession(other,other.contexts[0]);
 const read=()=>repo.session(session.sid,student.account.account_id,student.account.credential_epoch),readOther=()=>repo.session(otherSession.sid,other.account.account_id,other.account.credential_epoch);
 const first=await read();assert.equal(first.surahGrants[0].surah_id,f.id);await readOther();const puts=f.source.env.LESSON_MEDIA_BUCKET.puts;
 assert.deepEqual(JSON.parse(JSON.stringify(await read())),JSON.parse(JSON.stringify(first)));assert.equal(f.source.env.LESSON_MEDIA_BUCKET.puts,puts,'Warm navigation reuses the permission object');
 const auth=selectWorkspace(new Request('http://localhost',{headers:{'X-Academy-Workspace':'LEARN'}}),{state:first,sid:session.sid,user:{accountid:student.account.account_id}}),proof=actorProof(auth),version=await verifyActor(f.core,proof);
 assert.equal(await verifyActorVersion(f.core,proof,version),version);
 ok(await f.change(false,1,own));assert.equal((await read()).surahGrants.length,0);const after=f.source.env.LESSON_MEDIA_BUCKET.puts;await readOther();assert.equal(f.source.env.LESSON_MEDIA_BUCKET.puts,after,'Other accounts retain their warm permissions through a grant-only change');
 await assert.rejects(verifyActor(f.core,proof),{code:'SESSION_ENDED'});await assert.rejects(verifyActorVersion(f.core,proof,version),{code:'SESSION_ENDED'},'A grant mutation advances the split epoch and invalidates an older verified proof');
 const legacy={...auth,state:{...first,surahGrantsEnabled:false},authority:{...first,surahGrantsEnabled:false}};assert.equal(typeof await verifyActor(f.core,actorProof(legacy)),'number','The new coordinator remains compatible with the previous API proof');
 const source=[...f.source.env.LESSON_MEDIA_BUCKET.objects.values()].join(' ');assert(!/pin_hash|session_id|credential_epoch/.test(source));
}));
test('accepted split website and current withdrawals obey an additional grant independently of paid months',()=>use(async f=>{
 const site=(action,input={})=>f.request('/api/admin/platform/course-websites/'+action,{activityKey:f.scopes.programA,surahId:f.id,...input},f.token),student=await f.source.actor('studentA');
 const view=ok(await site('get')),saved=ok(await site('save',{document:view.document,revision:0,operationId:op()}));
 const read=()=>f.request('/api/academy/course-websites/read',{activityKey:f.scopes.programA,surahId:f.id},student,'LEARN');
 ok(await f.change(true));assert.equal((await read()).status,404);
 const published=ok(await site('publish',{revision:saved.revision,operationId:op()}));ok(await f.request('/api/academy/changes/accept',published.acceptedChange,f.token));
 assert.equal(ok(await read()).document.name,'Surah Maryam');assert.equal((await read()).status,200);
 ok(await f.change(false,1));assert.equal((await read()).status,403);ok(await f.change(true,2));assert.equal((await read()).status,200);
 ok(await site('withdraw',{revision:published.revision,operationId:op()}));assert.equal((await read()).status,404);
 assert.equal(f.databases.core.prepare('SELECT count(*) n FROM program_monthly_subscriptions').get().n,0);
}));
