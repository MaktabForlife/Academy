// Isolate the real PDF-admission triggers; no account, R2 or hosted storage.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export const originalAdmission=[...readFileSync(new URL('../../migrations/academy/0035_media_contributions.sql',import.meta.url),'utf8').matchAll(/CREATE TRIGGER (lesson_media_accepted_pdf_limit_(?:insert|update))[\s\S]+? END;/g)].map(m=>({type:'trigger',name:m[1],sql:m[0]}));
export const admissionUpgrade=readFileSync(new URL('../../migrations/academy-core/0009_publication_pdf_projection_cache.sql',import.meta.url),'utf8');
export const admissionSchema=[
 'CREATE TABLE setup_components(component_id TEXT PRIMARY KEY,batch_id TEXT,table_name TEXT,scope_key TEXT,rows_json TEXT)',
 'CREATE TABLE setup_head_components(head_id TEXT,table_name TEXT,scope_key TEXT,component_id TEXT,PRIMARY KEY(head_id,table_name,scope_key))',
 'CREATE TABLE setup_head_state(singleton INTEGER PRIMARY KEY,head_id TEXT)',
 'CREATE TABLE lesson_note_entries(activity_key TEXT,session_key TEXT,state TEXT)',
 'CREATE INDEX lesson_notes_session ON lesson_note_entries(activity_key,session_key,state)'
];
export function admissionRows({count=1,pdfs=0,videos=0,notes=0,withdrawn=0,activity='PROGRAM:one',state='PUBLISHED',mediaScope='SESSION'}={}){
 const lessons=[],links=[],assets=[],ownNotes=[];
 for(let i=0;i<count;i++){
  const id=activity+'-lesson-'+i,session='session-'+i;
  lessons.push({lesson_id:id,activity_key:activity,session_key:session,state,...(mediaScope===null?{}:{media_scope:mediaScope})});
  for(let j=0;j<pdfs+videos;j++){const asset=activity+'-asset-'+i+'-'+j;links.push({lesson_id:id,asset_id:asset});assets.push({asset_id:asset,kind:j<pdfs?'PDF':(i+j)%2?'YOUTUBE':'MP4'});}
  for(let j=0;j<notes+withdrawn;j++)ownNotes.push({activity_key:activity,session_key:session,state:j<notes?'ACTIVE':'WITHDRAWN'});
 }
 return {lessons,links,assets,ownNotes};
}
export function admissionFixture({upgrade=true,rows=admissionRows(),extra=[],archived=[]}={}){
 const db=new DatabaseSync(':memory:');db.exec(admissionSchema.join(';'));for(const trigger of originalAdmission)db.exec(trigger.sql);
 if(upgrade)db.exec(admissionUpgrade);
 const add=(head,groups)=>{
  const merged={lessons:[],links:[],assets:[],ownNotes:[]};for(const group of groups)for(const key of Object.keys(merged))merged[key].push(...group[key]);
  for(const [table,list]of [['lesson_media_lessons',merged.lessons],['lesson_media_links',merged.links],['lesson_media_assets',merged.assets]]){
   const id=head+'-'+table;db.prepare('INSERT INTO setup_components VALUES(?,?,?,?,?)').run(id,'batch',table,'GLOBAL',JSON.stringify(list));db.prepare('INSERT INTO setup_head_components VALUES(?,?,?,?)').run(head,table,'GLOBAL',id);
  }
  for(const note of merged.ownNotes)db.prepare('INSERT INTO lesson_note_entries VALUES(?,?,?)').run(note.activity_key,note.session_key,note.state);
 };
 add('candidate',[rows,...extra]);if(archived.length)add('archived',archived);
 return {db,insert:()=>db.prepare("INSERT INTO setup_head_state VALUES(1,'candidate')").run(),update:()=>{db.prepare("INSERT INTO setup_head_state VALUES(1,'old')").run();return db.prepare("UPDATE setup_head_state SET head_id='candidate' WHERE singleton=1").run();},close:()=>db.close()};
}
