import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {studentJournalFixture} from './fixtures/academy-student-journal-fixture.mjs';
import {studentJournalKey,JOURNAL_FORMAT,JOURNAL_RECEIPTS,JOURNAL_MAX_BYTES,JOURNAL_MAX_ENTRIES} from '../src/academy/d1/student-journal.js';
const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
const create=(fields={},extra={})=>({id:crypto.randomUUID(),revision:0,version:null,operationId:crypto.randomUUID(),fields,...extra});
const use=fn=>async()=>{const f=await studentJournalFixture();try{await fn(f);}finally{f.close();}};
const update=(saved,fields)=>({id:saved.entry.id,revision:saved.entry.revision,version:saved.version,operationId:crypto.randomUUID(),fields});

test('one private JSON object per student persists locally; all fields can be omitted or cleared',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'student-journal-r2-'));let f;
 try{f=await studentJournalFixture({journalDirectory:directory});const blank=ok(await f.journal('save',create()));for(const key of ['course','surah','lesson','ayah','question','reflection','entryDate'])assert.equal(blank.entry[key],'');
  const fields={course:'Tafseer',surah:'الكهف',lesson:'Intention',ayah:'18:10–15',question:'What will I carry?',reflection:'Private thoughts',entryDate:'2026-10-28'},other=ok(await f.journal('save',create(fields),'studentB'));
  const cleared=ok(await f.journal('save',update(other,Object.fromEntries(Object.keys(fields).map(key=>[key,'']))),'studentB'));for(const key of Object.keys(fields))assert.equal(cleared.entry[key],'');
  assert.equal(cleared.entry.createdAt,other.entry.createdAt);assert.equal(f.journalBucket.objects.size,2);assert.equal(readdirSync(directory).length,2);for(const name of ['journal_entries','journal_operations'])assert.equal(f.db.prepare('SELECT 1 FROM sqlite_schema WHERE name=?').get(name),undefined);
  f.close();f=await studentJournalFixture({journalDirectory:directory});assert.equal(ok(await f.journal('sync')).entries[0].id,blank.entry.id);
 }finally{f?.close();rmSync(directory,{recursive:true,force:true});}
});
test('ownership, current sessions and private previews remain enforced with no staff override',use(async f=>{
 const saved=ok(await f.journal('save',create({reflection:'PRIVATE-STUDENT-ONLY'})));
 for(const who of ['studentB','teacherA','adminA','global'])assert.deepEqual(ok(await f.journal('sync',{},who)).entries,[]);
 for(const key of ['owner','owner_id','ownerId','accountId','accountid','key'])assert.equal((await f.journal('sync',{[key]:f.actors.studentA},'global')).status,403);
 assert.equal((await f.journal('sync',{},null)).status,401);for(const workspace of ['ADMIN_LEARN','ADMIN_TEACH'])assert.equal((await f.journal('sync',{},'global',workspace)).status,403);
 f.db.prepare('UPDATE accounts SET active=0 WHERE account_id=?').run(f.actors.studentA);assert.equal((await f.journal('sync',{version:saved.version})).status,401);
}));
test('sync is one conditional R2 get; Save returns the entire confirmed copy with one get and one put',use(async f=>{
 const saved=ok(await f.journal('save',create({reflection:'First'})));assert.equal(f.journalBucket.calls.get,1);assert.equal(f.journalBucket.calls.put,1);assert.equal(saved.entries[0].reflection,'First');assert(!Object.hasOwn(saved,'receipts'));assert(!Object.hasOwn(saved,'owner'));
 const sync=ok(await f.journal('sync',{version:saved.version}));assert.equal(sync.notModified,true);assert(!Object.hasOwn(sync,'entries'));assert.equal(f.journalBucket.calls.get,2);assert.equal(f.journalBucket.calls.put,1);assert.equal(f.journalBucket.calls.heads,0);
}));
test('stale whole-file saves and concurrent replacements are refused without blind overwrites',use(async f=>{
 const saved=ok(await f.journal('save',create({reflection:'First'}))),edit=value=>update(saved,{reflection:value});
 const results=await Promise.all([f.journal('save',edit('Device A')),f.journal('save',edit('Device B'))]);assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);assert.equal(ok(await f.journal('sync')).entries[0].revision,2);
 const staleNew=await f.journal('save',create({reflection:'Stale new entry'},{version:saved.version}));assert.equal(staleNew.status,409);assert.equal(ok(await f.journal('sync')).entries.length,1);
}));
test('exact retries do not rewrite files, and receipts retain bounded metadata without reflection copies',use(async f=>{
 const input=create({reflection:'Secret original words'});let saved=ok(await f.journal('save',input));assert.equal(ok(await f.journal('save',input)).replayed,true);assert.equal(f.journalBucket.calls.put,1);
 assert.equal((await f.journal('save',{...input,fields:{reflection:'Changed retry'}})).status,409);
 for(let i=0;i<JOURNAL_RECEIPTS+3;i++)saved=ok(await f.journal('save',update(saved,{reflection:'Current '+i})));
 const document=f.journalBucket.documents()[0];assert.equal(document.receipts.length,JOURNAL_RECEIPTS);assert(!JSON.stringify(document.receipts).includes('reflection'));assert(!JSON.stringify(document).includes('Secret original words'));assert.equal(f.journalBucket.objects.size,1);
}));
test('source IDs remain stable when optional labels are edited or cleared',use(async f=>{
 const sourceKey='reflection:v1:one',initial=ok(await f.journal('save',create({course:'Tafseer',question:'Original',reflection:'First'},{sourceKey})));
 assert.equal((await f.journal('save',create({reflection:'Duplicate'},{sourceKey,version:initial.version}))).status,409);
 const edited=ok(await f.journal('save',update(initial,{course:'',surah:'Yaseen',question:'My own question',entryDate:''}))),inline=ok(await f.journal('save',update(edited,{reflection:'Later thought'})));
 for(const [key,value] of Object.entries({course:'',surah:'Yaseen',question:'My own question',entryDate:''}))assert.equal(inline.entry[key],value);
 assert.equal((await f.journal('save',{...update(inline,{}),sourceKey:'other'})).status,400);
}));
test('invalid fields, unavailable storage and corrupt files fail closed without creating journal SQL',use(async f=>{
 for(const fields of [{entryDate:'2026-02-30'},{entryDate:'2026-99-99'},{course:42},{reflection:'x'.repeat(50001)},{owner_id:'forged'},{createdAt:'2024-01-01'}])assert.equal((await f.journal('save',create(fields))).status,400);
 ok(await f.journal('save',create({entryDate:null,course:null})));const key=await studentJournalKey(f.actors.studentA),object=f.journalBucket.objects.get(key);object.body='{}';assert.equal((await f.journal('sync')).status,503);
 delete f.env.ACADEMY_JOURNAL_BUCKET;assert.equal((await f.journal('save',create())).status,503);assert.equal(f.db.prepare("SELECT 1 FROM sqlite_schema WHERE name='journal_entries'").get(),undefined);
}));
test('large journals are read within the bound, and oversized replacement preserves the previous file',use(async f=>{
 const fields={course:'',surah:'',lesson:'',ayah:'',question:'',entryDate:'',reflection:'ن'.repeat(1800)},now=new Date().toISOString(),document={format:JOURNAL_FORMAT,owner:f.actors.studentA,revision:1,updatedAt:now,receipts:[],entries:Array.from({length:100},()=>({id:crypto.randomUUID(),sourceKey:null,...fields,revision:1,createdAt:now,updatedAt:now}))};
 const key=await studentJournalKey(f.actors.studentA),bytes=()=>Buffer.byteLength(JSON.stringify(document));
 while(bytes()<JOURNAL_MAX_BYTES-60000){document.entries.push({...document.entries[0],id:crypto.randomUUID()});}
 const remaining=JOURNAL_MAX_BYTES-bytes()-2000;document.entries.push({...document.entries[0],id:crypto.randomUUID(),reflection:'x'.repeat(Math.max(0,Math.min(49000,remaining)))});
 while(bytes()>JOURNAL_MAX_BYTES-1000)document.entries.at(-1).reflection=document.entries.at(-1).reflection.slice(0,-1000);
 await f.journalBucket.put(key,JSON.stringify(document),{customMetadata:{format:JOURNAL_FORMAT}});const started=performance.now(),copy=ok(await f.journal('sync'));assert.equal(copy.entries.length,document.entries.length);assert(bytes()<JOURNAL_MAX_BYTES);
 const result=await f.journal('save',{id:copy.entries[0].id,revision:1,version:copy.version,operationId:crypto.randomUUID(),fields:{reflection:'ن'.repeat(50000)}});assert.equal(result.status,413);assert.equal(f.journalBucket.documents()[0].revision,1);
 console.log(JSON.stringify({largeJournalEntries:copy.entries.length,bytes:bytes(),readAndBoundCheckMs:Math.round(performance.now()-started)}));
}));

test('the initial entry bound refuses additions while allowing edits to existing entries',use(async f=>{
 const initial=ok(await f.journal('save',create())),key=await studentJournalKey(f.actors.studentA),document=f.journalBucket.documents()[0];
 document.entries=Array.from({length:JOURNAL_MAX_ENTRIES},(_,index)=>({...initial.entry,id:index?crypto.randomUUID():initial.entry.id}));
 await f.journalBucket.put(key,JSON.stringify(document),{customMetadata:{format:JOURNAL_FORMAT}});const copy=ok(await f.journal('sync'));
 assert.equal((await f.journal('save',create({reflection:'Beyond the bound'},{version:copy.version}))).status,413);
 const edited=ok(await f.journal('save',{id:initial.entry.id,revision:1,version:copy.version,operationId:crypto.randomUUID(),fields:{reflection:'Still editable'}}));assert.equal(edited.entries.length,JOURNAL_MAX_ENTRIES);assert.equal(edited.entry.reflection,'Still editable');
}));
