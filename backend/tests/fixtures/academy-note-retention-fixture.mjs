import {readFileSync} from 'node:fs';
import {messagingFixture} from './academy-messaging-fixture.mjs';
import {lessonPdfReference} from '../../src/academy/d1/lesson-pdf-storage.js';
import {recoverNoteRetention} from '../../src/academy/d1/note-retention.js';
const day=86400000;
export async function noteRetentionFixture(split=false){
 const f=await messagingFixture({split});f.db.exec(readFileSync(new URL('../../migrations/'+(split?'academy-core/0021':'academy/0046')+'_note_retention.sql',import.meta.url),'utf8'));
 Object.assign(f.env,{ACADEMY_NOTE_RETENTION:'1',ACADEMY_OBJECT_NAMESPACE:'dev-split-v1/'});f.time=new Date();f.db.prepare('UPDATE note_retention_policy SET enabled_at=?').run(f.time.toISOString());
 f.bytes=new Map();f.deleted=[];f.env.LESSON_MEDIA_BUCKET={delete:async key=>{f.deleted.push(key);f.bytes.delete(key);}};
 f.add=(kind,created=new Date(f.time.getTime()-130*day),sha='a'.repeat(64),area=f.scopes.programA,libraryKey=null,sourceOverride={})=>{
  const id=crypto.randomUUID(),version=crypto.randomUUID(),head=f.db.prepare('SELECT head_id FROM setup_head_state').get().head_id,at=created.toISOString();
  if(kind==='CLASS_NOTE'){
   const context=crypto.randomUUID();f.db.prepare('INSERT INTO class_note_contexts VALUES(?,?,?,?,?,?,?,?)').run(context,area,'messaging-200',at.slice(0,10),context,JSON.stringify({id:context,activityKey:area,classId:'messaging-200',date:at.slice(0,10)}),head,at);
   f.db.prepare("INSERT INTO class_notes VALUES(?,?,?,?,?,NULL,'ACTIVE',1,?,?,NULL)").run(id,area,context,'account-0002',at,at,'account-0002');
   f.db.prepare("INSERT INTO class_note_versions VALUES(?,?,1,?,?,'DATE',?,NULL,?,?,NULL,'',?,?)").run(version,id,context,'Private note text',at.slice(0,10),JSON.stringify({mode:'DATE',date:at.slice(0,10)}),head,at,'account-0002');
   f.db.prepare('UPDATE class_notes SET current_version_id=? WHERE note_id=?').run(version,id);
  }else{
   f.db.prepare("INSERT INTO lesson_note_entries VALUES(?,?,?,?,?,NULL,'ACTIVE',1,?,?)").run(id,area,JSON.stringify(['PROGRAM',at.slice(0,10),id]),'NTS-'+id,'account-0003',at,'account-0003');
   f.db.prepare('INSERT INTO lesson_note_versions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('NOTE-'+version,id,libraryKey||lessonPdfReference('dev-split-v1/','NOTE-'+version,sha),'Lesson.pdf','Lesson notes',5,sha,head,JSON.stringify({classIds:['messaging-200'],date:at.slice(0,10),...sourceOverride}),'account-0003',at);
   f.db.prepare('UPDATE lesson_note_entries SET current_version_id=? WHERE note_id=?').run('NOTE-'+version,id);f.bytes.set(libraryKey||'dev-split-v1/lesson-pdfs/sha256/'+sha+'.pdf','%PDF-');
  }return id;
 };f.tick=(days=0)=>recoverNoteRetention(f.env,new Date(f.time.getTime()+days*day));return f;
}
