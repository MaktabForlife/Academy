import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {classNotesFixture,seedClassNotes} from './fixtures/academy-class-notes-fixture.mjs';
import {classNoteSummaryWindow,classNoteSummaryCandidates} from '../src/academy/d1/class-note-summary.js';
import {nativeBinding} from './fixtures/academy-d1-fixture.mjs';
import runtime from '../src/academy-runtime.js';

const index=readFileSync(new URL('../migrations/academy-core/0022_class_notes_summary.sql',import.meta.url),'utf8');
async function use(fn){const f=await classNotesFixture(seedClassNotes);try{f.db.exec(index);await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{f.close();}}
async function create(f,service,classId='class-1',body='Shared lesson note'){
 const source=(await service.run('sessions',{activityKey:f.scopes.programA,date:f.today})).sources.find(s=>s.classId===classId&&s.startTime==='10:00');assert(source);
 const view=await service.run('get',{activityKey:source.activityKey,source});return service.run('post',f.post(view,{body}));
}
function insert(db,table,row){const keys=Object.keys(row);db.prepare('INSERT INTO '+table+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...Object.values(row));}
function copyNote(f,original,id,createdAt){
 const row=f.db.prepare('SELECT * FROM class_notes WHERE note_id=?').get(original.noteId),version=f.db.prepare('SELECT * FROM class_note_versions WHERE version_id=?').get(row.current_version_id),versionId=id+'-version';
 insert(f.db,'class_notes',{...row,note_id:id,created_at:createdAt,current_version_id:null,updated_at:createdAt,state:'ACTIVE',withdrawn_at:null});
 insert(f.db,'class_note_versions',{...version,version_id:versionId,note_id:id,created_at:createdAt});
 f.db.prepare('UPDATE class_notes SET current_version_id=? WHERE note_id=?').run(versionId,id);
}

test('programme history uses clamped calendar months and the Academy midnight rather than ninety days',()=>{
 const timezone='Africa/Johannesburg';
 for(const [today,expected] of [['2026-11-01','2026-08-01'],['2026-05-31','2026-02-28'],['2024-05-31','2024-02-29'],['2026-01-31','2025-10-31']]){
  const w=classNoteSummaryWindow(today,timezone,new Date(today+'T12:00:00Z'));assert.equal(w.fromDate,expected);assert.equal(w.months,3);assert.equal(w.basis,'CREATED_AT');assert.equal(new Date(w.from).getUTCHours(),22);
 }
});

test('summary pages are newest first with stable tied timestamps, a fixed cutoff and no deletion',()=>use(async f=>{
 const service=await f.notes('LEARN','original-student'),made=await create(f,service),first=await service.run('summary',{activityKey:f.scopes.programA});
 const boundary=first.window.from,old=new Date(Date.parse(boundary)-1).toISOString(),tie=new Date(Date.now()-1000).toISOString();
 copyNote(f,made,'boundary-note',boundary);copyNote(f,made,'outside-history-note',old);copyNote(f,made,'tied-a',tie);copyNote(f,made,'tied-z',tie);
 const all=await service.run('summary',{activityKey:f.scopes.programA});assert.equal(all.notes.length,4);assert(!all.notes.some(n=>n.id==='outside-history-note'));assert.equal(all.notes.at(-1).id,'boundary-note');assert(all.notes.findIndex(n=>n.id==='tied-z')<all.notes.findIndex(n=>n.id==='tied-a'));
 const found=[];let before;do{const page=await service.run('summary',{activityKey:f.scopes.programA,limit:1,...(before?{before}:{})});found.push(...page.notes.map(n=>n.id));before=page.before;}while(before);
 assert.deepEqual(found,all.notes.map(n=>n.id));assert.equal(new Set(found).size,found.length);assert.equal(f.db.prepare('SELECT count(*) n FROM class_notes').get().n,5);
 assert(all.notes.every(n=>n.source.canRead&&n.source.canPost&&n.canEdit));
 for(const input of [{limit:0},{limit:51},{before:{createdAt:old,id:'outside-history-note'}},{before:{createdAt:'bad',id:'x'}},{before:{createdAt:tie,id:''}}])await assert.rejects(service.run('summary',{activityKey:f.scopes.programA,...input}),e=>e.status===400);
}));

test('sparse pages advance past inaccessible classes without exposing their body or lesson context',()=>use(async f=>{
 const global=await f.notes('ADMIN'),student=await f.notes('LEARN','original-student'),hidden=await create(f,global,'class-shared','Private other-class body'),visible=await create(f,student,'class-1','Visible own-class body');
 copyNote(f,hidden,'hidden-newest',new Date(Date.now()-1000).toISOString());copyNote(f,visible,'visible-next',new Date(Date.now()-2000).toISOString());
 f.db.prepare("UPDATE class_notes SET state='WITHDRAWN' WHERE note_id IN(?,?)").run(hidden.noteId,visible.noteId);
 const first=await student.run('summary',{activityKey:f.scopes.programA,limit:1});assert.deepEqual(first.notes,[]);assert(first.before);assert(!JSON.stringify(first).includes('Private other-class body'));assert(!JSON.stringify(first).includes(hidden.contextId));
 const next=await student.run('summary',{activityKey:f.scopes.programA,limit:1,before:first.before});assert.equal(next.notes.length,1);assert.equal(next.notes[0].body,'Visible own-class body');assert.equal(next.before,null);
 const wrong=await f.notes('ADMIN','adminB');assert.deepEqual((await wrong.run('summary',{activityKey:f.scopes.programA})).notes,[]);
 const preview=await f.notes('ADMIN_LEARN');const reviewed=await preview.run('summary',{activityKey:f.scopes.programA});assert(reviewed.notes.length);assert(reviewed.notes.every(n=>!n.source.canPost&&!n.canEdit&&!n.canWithdraw));
 const teacher=await f.notes('TEACH','original-teacher');assert((await teacher.run('summary',{activityKey:f.scopes.programA})).notes.some(n=>n.id==='visible-next'&&n.source.canPost));
 f.db.prepare("UPDATE class_memberships SET active=0 WHERE account_id='account-0002' AND activity_key=?").run(f.scopes.programA);
 assert.deepEqual((await (await f.notes('LEARN','original-student')).run('summary',{activityKey:f.scopes.programA})).notes,[]);
}));

test('the real HTTP summary route is authenticated, read-only and reports an unapplied index safely',()=>use(async f=>{
 await create(f,await f.notes('LEARN','original-student'));
 const token=await f.login('0002'),call=async(auth=token)=>{const response=await runtime.fetch(new Request('https://academy.test/api/academy/class-notes/summary',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{}),'X-Academy-Workspace':'LEARN'},body:JSON.stringify({activityKey:f.scopes.programA})}),f.env);return {status:response.status,body:await response.json()};};
 assert.equal((await call()).status,200);assert.equal((await call('')).status,401);
 const count=f.db.prepare('SELECT count(*) n FROM class_notes').get().n;
 f.db.exec('DROP INDEX class_notes_programme_history');
 await assert.rejects((await f.notes('LEARN','original-student')).run('summary',{activityKey:f.scopes.programA}),e=>e.code==='CLASS_NOTE_SUMMARY_SCHEMA_REQUIRED');
 const missing=await call();assert.equal(missing.status,503);assert.equal(missing.body.code,'ACADEMY_D1_UNAVAILABLE');assert.equal(missing.body.retryable,true);assert(!JSON.stringify(missing.body).includes('class_notes_programme_history'));assert.equal(f.db.prepare('SELECT count(*) n FROM class_notes').get().n,count);
}));

test('the indexed candidate query does not visit unrelated or older programme notes',async()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec('CREATE TABLE class_notes(note_id TEXT PRIMARY KEY,activity_key TEXT COLLATE NOCASE,context_id TEXT,created_at TEXT,state TEXT);'+index);
  const put=db.prepare('INSERT INTO class_notes VALUES(?,?,?,?,?)'),now=new Date('2026-11-01T12:00:00.000Z'),window=classNoteSummaryWindow('2026-11-01','Africa/Johannesburg',now);
  for(let i=0;i<55;i++)put.run('visible-'+String(i).padStart(3,'0'),'PROGRAM:current','context',new Date(now.getTime()-i*1000).toISOString(),'ACTIVE');
  const queries=[],binding=nativeBinding(db),capture={prepare(sql){const st=binding.prepare(sql);return {bind(...values){queries.push({sql,values});return st.bind(...values);}};}};
  const first=await classNoteSummaryCandidates(capture,'PROGRAM:current',{limit:20},window);assert.equal(first.page.length,20);assert(first.before);
  for(let i=0;i<4000;i++){put.run('old-'+i,'PROGRAM:current','context','2025-01-01T00:00:00.000Z','ACTIVE');put.run('unrelated-'+i,'PROGRAM:other','context',now.toISOString(),'ACTIVE');}
  const after=await classNoteSummaryCandidates(capture,'PROGRAM:current',{limit:20},window);assert.deepEqual(after,first);
  const query=queries[0],plan=db.prepare('EXPLAIN QUERY PLAN '+query.sql).all(...query.values).map(r=>r.detail);assert(plan.some(line=>line.includes('class_notes_programme_history')&&line.includes('created_at>?')));assert(!plan.some(line=>line.includes('TEMP B-TREE')));
 }finally{db.close();}
});
