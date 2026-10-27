import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyFixture,scope,mp4} from './fixtures/academy-monthly-subscriptions-fixture.mjs';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const op=()=>crypto.randomUUID();
async function use(fn){const f=await monthlyFixture();try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{f.db.close();}}
async function register(f,admin,month='2026-10',accountId='account-0002'){
 if(!f.db.prepare('SELECT 1 FROM program_monthly_media_policies').get())ok(await f.monthly('configure',{mode:'prepare',policyRevision:0,operationId:op()},admin));
 const current=ok(await f.monthly('get',{month,search:accountId},admin));
 const row=current.students.find(r=>r.accountId===accountId);
 ok(await f.monthly('save',{month,policyRevision:current.policy.revision,operationId:op(),entries:[{accountId,subscribed:true,revision:row?.revision||0,classIds:['mou-class'],paymentReference:'TEST-PAID'}]},admin));
}
async function activate(f,admin){const p=f.db.prepare('SELECT revision FROM program_monthly_media_policies').get();ok(await f.monthly('configure',{mode:'activate',policyRevision:p.revision,reviewed:true,operationId:op()},admin));}
async function historical(f,admin,date,title='Earlier Tafseer lesson'){
 const created=ok(await f.media('historical-create',{activityKey:scope,date,title,classIds:['mou-class'],operationId:op()},admin));
 ok(await f.media('save',{lessonId:created.lessonId,revision:1,title,summary:'Historical lesson',state:'PUBLISHED',commentsClosed:true,videos:[{name:'Recording',url:'https://youtu.be/9IuTDcSs6vQ'}],operationId:op()},admin));return created.lessonId;
}
async function upload(f,admin,lessonId){const revision=f.db.prepare('SELECT revision FROM lesson_media_lessons WHERE lesson_id=?').get(lessonId).revision,start=ok(await f.media('video-start',{lessonId,revision,size:mp4.length,filename:'recording.mp4',operationId:op()},admin));const part=ok(await f.videoPart({lessonId,uploadToken:start.uploadToken,partNumber:1},admin));return ok(await f.media('video-complete',{lessonId,uploadToken:start.uploadToken,parts:[{partNumber:1,etag:part.etag}]},admin));}

test('month grants follow the lesson month, include late uploads and keep disjoint paid months',()=>use(async f=>{
 const admin=await f.login('0001'),student=await f.login('0002'),other=await f.login('0008');
 await register(f,admin,'2026-10');await register(f,admin,'2026-11','account-0008');await activate(f,admin);
 f.db.prepare("INSERT INTO lesson_media_lessons(lesson_id,activity_key,class_id,lesson_date,title,start_time,end_time,teacher_name,state,source_lessons_json,updated_at) SELECT 'MOU-NOV',activity_key,class_id,'2026-11-01','November lesson',start_time,end_time,teacher_name,'PUBLISHED',source_lessons_json,updated_at FROM lesson_media_lessons WHERE lesson_id='MOU-20261006'").run();
 f.db.prepare("INSERT INTO lesson_media_links VALUES('MOU-NOV','video-6')").run();
 assert.equal(ok(await f.media('list',{month:'2026-11'},student)).lessons.length,0);
 assert.equal(ok(await f.media('list',{month:'2026-11'},other)).lessons.length,1);
 const oct=ok(await f.media('list',{month:'2026-10'},student));assert.equal(oct.lessons.length,3);
 assert.equal(ok(await f.media('list',{month:'2026-10'},other)).lessons.length,0);
 assert.equal((await f.media('watch',{lessonId:'MOU-20261006',assetId:'video-6'},other)).status,403);
 const asset=await upload(f,admin,'MOU-20261006');f.db.prepare('UPDATE lesson_media_assets SET created_at=? WHERE asset_id=?').run('2026-11-15T00:00:00Z',asset.assetId);
 assert.equal((await f.media('watch',{lessonId:'MOU-20261006',assetId:asset.assetId},student)).status,200);
 assert.equal((await f.media('watch',{lessonId:'MOU-20261006',assetId:asset.assetId},other)).status,403);
 assert.equal(ok(await f.monthlyOwn('months',{},student)).programs[0].months.includes('2026-10'),true);
}));

test('historical 2024/2025 lessons and subscriptions are separate by year and survive enrolment removal',()=>use(async f=>{
 const admin=await f.login('0001'),student=await f.login('0002');await register(f,admin,'2024-01');await register(f,admin,'2025-01');await activate(f,admin);
 const jan24=await historical(f,admin,'2024-01-09','January 2024'),jan25=await historical(f,admin,'2025-01-14','January 2025'),unpaid=await historical(f,admin,'2024-02-20','February 2024');
 const pdf=ok(await f.mediaUpload({lessonId:jan24,revision:2},admin));
 f.db.prepare('INSERT INTO lesson_media_links VALUES(?,?)').run(unpaid,pdf.assetId);
 f.db.prepare("DELETE FROM class_memberships WHERE account_id='account-0002' AND activity_key=?").run(scope);f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0002' AND activity_key=?").run(scope);
 const list=ok(await f.monthlyOwn('list',{activityKey:scope,month:'2024-01'},student));assert.deepEqual(list.lessons.map(r=>r.id),[jan24]);
 assert.equal(ok(await f.monthlyOwn('list',{activityKey:scope,month:'2025-01'},student)).lessons[0].id,jan25);
 assert.equal((await f.media('download',{lessonId:jan24,assetId:pdf.assetId},student)).status,200);
 assert.equal((await f.media('download',{lessonId:unpaid,assetId:pdf.assetId},student)).status,403,'A shared PDF is authorized through each parent lesson separately');
 assert.equal(ok(await f.monthlyOwn('list',{activityKey:scope,month:'2024-02'},student)).lessons.length,0);
 const asset=f.db.prepare('SELECT asset_id FROM lesson_media_links WHERE lesson_id=?').get(unpaid).asset_id;assert.equal((await f.media('watch',{lessonId:unpaid,assetId:asset},student)).status,403);
 assert.equal(f.db.prepare("SELECT count(*) n FROM role_assignments WHERE account_id='account-0002' AND activity_key=? AND active=1").get(scope).n,0,'Archive access never creates a Student role');
 f.db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0002'").run();const archiveToken=await f.login('0002');
 const home=ok(await f.call('/api/academy/entrance',{},archiveToken));assert(home.monthlyMedia.some(p=>p.activityKey===scope),'The paid-month archive remains in Learn navigation after all current roles are removed');
}));

test('a 100-student edited delta is atomic, bounded and does not publish setup or manufacture enrolments',()=>use(async f=>{
 const admin=await f.login('0001');ok(await f.monthly('configure',{mode:'prepare',policyRevision:0,operationId:op()},admin));
 const entries=Array.from({length:100},(_,i)=>({accountId:'batch-'+String(i).padStart(3,'0'),subscribed:true,revision:0,classIds:['mou-class']}));
 for(const e of entries)f.db.prepare('INSERT INTO accounts(account_id,display_name,login_link_id,active) VALUES(?,?,?,1)').run(e.accountId,'Sample '+e.accountId,'LOGIN-'+e.accountId);
 const input={month:'2025-12',policyRevision:1,operationId:op(),entries};ok(await f.monthly('save',input,admin));
 assert.equal(f.db.prepare("SELECT count(*) n FROM program_monthly_subscriptions WHERE lesson_month='2025-12'").get().n,100);
 assert.equal(f.db.prepare("SELECT count(*) n FROM role_assignments WHERE account_id LIKE 'batch-%'").get().n,0);
 assert.equal(ok(await f.monthly('save',input,admin)).replayed,true);
 const next={month:'2026-01',policyRevision:2,operationId:op(),entries:[entries[0],{...entries[1],classIds:['foreign-class']}]};assert.equal((await f.monthly('save',next,admin)).status,400);
 assert.equal(f.db.prepare("SELECT count(*) n FROM program_monthly_subscriptions WHERE lesson_month='2026-01'").get().n,0);
}));

test('historical audience grants do not bypass another class or unavailable authority storage',()=>use(async f=>{
 const admin=await f.login('0001'),student=await f.login('0002');await register(f,admin);await activate(f,admin);
 f.db.prepare('INSERT INTO classes(activity_key,class_id,name,active) VALUES(?,?,?,1)').run(scope,'other-tafseer-class','Other Tafseer class');
 f.db.prepare("UPDATE program_monthly_subscriptions SET class_ids_json='[\"other-tafseer-class\"]' WHERE account_id='account-0002'").run();
 assert.equal(ok(await f.media('list',{month:'2026-10'},student)).lessons.length,0);
 assert.equal((await f.media('watch',{lessonId:'MOU-20261006',assetId:'video-6'},student)).status,403);
 f.db.exec('DROP TABLE program_monthly_subscriptions');
 assert.equal((await f.media('list',{},student)).status,503,'Missing enabled authority storage cannot fall back to current Student access');
}));

test('Tafseer MP4s retain private playback after 14 days and existing recordings can be retained safely',()=>use(async f=>{
 const admin=await f.login('0001'),student=await f.login('0002');const old=await upload(f,admin,'MOU-20261006');
 await register(f,admin);await activate(f,admin);
 const revision=f.db.prepare('SELECT revision FROM lesson_media_lessons WHERE lesson_id=?').get('MOU-20261006').revision;
 const retained=ok(await f.media('video-retain',{lessonId:'MOU-20261006',assetId:old.assetId,revision,operationId:op()},admin));assert(retained.retained);
 const asset=await upload(f,admin,'MOU-20261007');
 for(const id of [old.assetId,asset.assetId])f.db.prepare('UPDATE lesson_media_assets SET created_at=? WHERE asset_id=?').run('2024-01-01T00:00:00Z',id);
 for(const [lessonId,id] of [['MOU-20261006',old.assetId],['MOU-20261007',asset.assetId]]){const watch=ok(await f.media('watch',{lessonId,assetId:id},student));assert(watch.retained);assert.equal(watch.expiresAt,null);const response=await f.videoGet(watch.playbackPath,{Range:'bytes=4-11'});assert.equal(response.status,206);assert.equal(await response.text(),'ftypisom');}
 const list=ok(await f.media('list',{},student));assert(list.lessons.flatMap(r=>r.assets).filter(a=>a.kind==='MP4').every(a=>a.retained&&!a.expired));
 assert([...f.env.LESSON_MEDIA_BUCKET.objects.keys()].some(key=>key.includes('/retained-program-recordings/')||key.startsWith('retained-program-recordings/')));
}));

test('revocation invalidates lists, PDFs and previously issued recording tickets without deleting other months',()=>use(async f=>{
 const admin=await f.login('0001'),student=await f.login('0002');await register(f,admin);await register(f,admin,'2024-01');await activate(f,admin);
 const asset=await upload(f,admin,'MOU-20261006'),path=ok(await f.media('watch',{lessonId:'MOU-20261006',assetId:asset.assetId},student)).playbackPath;
 const current=ok(await f.monthly('get',{month:'2026-10'},admin)),row=current.students.find(r=>r.accountId==='account-0002');
 ok(await f.monthly('save',{month:'2026-10',policyRevision:current.policy.revision,operationId:op(),entries:[{accountId:row.accountId,subscribed:false,revision:row.revision,classIds:row.classIds,note:'Payment recorded for the wrong student'}]},admin));
 assert.equal((await f.videoGet(path)).status,403);assert.equal(ok(await f.media('list',{month:'2026-10'},student)).lessons.length,0);
 assert.deepEqual(ok(await f.monthlyOwn('months',{},student)).programs[0].months,['2024-01']);
}));

test('scoped authority, retries, conflicts and filtered delta saves preserve other students and months',()=>use(async f=>{
 const admin=await f.login('0001'),teacher=await f.login('0003'),scoped=await f.login('0004');await register(f,admin);await register(f,admin,'2026-09','account-0008');
 assert.equal((await f.monthly('get',{month:'2026-10'},teacher)).status,403);
 const current=ok(await f.monthly('get',{month:'2026-10',search:'0002'},scoped)),row=current.students.find(r=>r.accountId==='account-0002');
 const input={month:'2026-10',policyRevision:current.policy.revision,operationId:op(),entries:[{accountId:row.accountId,subscribed:true,revision:row.revision,classIds:row.classIds,paymentReference:'corrected'}]};
 ok(await f.monthly('save',input,scoped));assert.equal(ok(await f.monthly('save',input,scoped)).replayed,true);
 assert.equal((await f.monthly('save',{...input,operationId:op()},scoped)).status,409);
 assert.equal((await f.monthly('save',{...input,entries:[{...input.entries[0],note:'Different payload'}]},scoped)).status,409);
 assert.equal(f.db.prepare("SELECT active FROM program_monthly_subscriptions WHERE account_id='account-0008' AND lesson_month='2026-09'").get().active,1);
 assert.equal((await f.media('historical-create',{date:'2025-01-01',title:'Earlier',classIds:['mou-class'],operationId:op()},teacher)).status,403);
}));

test('invalid dates, future historical lessons, foreign classes and unsafe activation are rejected',()=>use(async f=>{
 const admin=await f.login('0001');ok(await f.monthly('configure',{mode:'prepare',policyRevision:0,operationId:op()},admin));
 assert.equal((await f.monthly('configure',{mode:'activate',policyRevision:1,reviewed:true,operationId:op()},admin)).status,409);
 for(const month of ['2024-13','2024-00','24-01','2024-01-01'])assert.equal((await f.monthly('get',{month},admin)).status,400);
 for(const date of ['2025-02-30','2099-01-01'])assert.equal((await f.media('historical-create',{date,title:'Earlier',classIds:['mou-class'],operationId:op()},admin)).status,400);
 assert.equal((await f.monthly('save',{month:'2024-01',policyRevision:1,operationId:op(),entries:[{accountId:'account-0002',subscribed:true,revision:0,classIds:['foreign-class']}]},admin)).status,400);
 assert.equal(f.db.prepare('SELECT count(*) n FROM program_monthly_subscriptions').get().n,0);
}));
