// Shared official PDFs plus unrelated accepted media/publication growth. Local only.
import {acceptFixtureSetup} from './academy-accepted-fixture.mjs';
import {lessonPdfReference,lessonPdfObjectKey} from '../../src/academy/d1/lesson-pdf-storage.js';
export async function seedOfficialRetention(f,growth=0){
 const old=new Date(f.time.getTime()-130*86400000).toISOString(),fresh=f.time.toISOString(),area=f.scopes.programA,other=f.scopes.programB,course=f.scopes.courseA;
 const stores=f.databases?[f.db,f.databases.admin]:[f.db],insert=(table,row)=>{for(const db of stores){const columns=new Set(db.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name)),entries=Object.entries(row).filter(([key])=>columns.has(key));if(!entries.length)continue;db.prepare('INSERT INTO '+table+'('+entries.map(([key])=>key).join(',')+') VALUES('+entries.map(()=>'?').join(',')+')').run(...entries.map(([,v])=>v));}};
 const add=(scope,sha,created=old,mediaScope='SESSION')=>{
  const asset=crypto.randomUUID(),lesson=crypto.randomUUID(),object=lessonPdfReference('dev-split-v1/',asset,sha);
  insert('lesson_media_lessons',{lesson_id:lesson,activity_key:scope,class_id:scope===area?'messaging-200':null,lesson_date:created.slice(0,10),title:'Local PDF fixture',start_time:'10:00',end_time:'11:00',teacher_id:'account-0003',teacher_name:'Teacher',summary:'',state:'PUBLISHED',comments_closed:1,revision:1,source_publication_id:null,source_lessons_json:JSON.stringify([{classIds:['messaging-200']}]),updated_at:created,session_key:JSON.stringify(['PROGRAM',created.slice(0,10),lesson]),run_id:'',teacher_ids_json:'["account-0003"]',media_scope:mediaScope});
  insert('lesson_media_assets',{asset_id:asset,activity_key:scope,kind:'PDF',object_key:object,filename:'Notes.pdf',byte_size:5,created_at:created,display_name:'Local notes'});insert('lesson_media_links',{lesson_id:lesson,asset_id:asset});f.bytes.set(lessonPdfObjectKey(object),'%PDF-');return asset;
 };
 const hashes=['1','2','3','4'].map(c=>c.repeat(64)),expired=hashes.map(sha=>add(area,sha));
 f.add('PDF_NOTE',f.time,hashes[1]);
 const permanent=add(course,hashes[2],fresh,'COURSE'),studio=add(other,hashes[3]);
 f.db.exec('CREATE TABLE IF NOT EXISTS website_platform_access_ownership(activity_key TEXT PRIMARY KEY,state TEXT NOT NULL,updated_at INTEGER NOT NULL)');
 f.db.prepare("INSERT OR REPLACE INTO website_platform_access_ownership(activity_key,state,updated_at) VALUES(?,'STUDIO',0)").run(other);
 for(let i=0;i<growth;i++){
  add(other,(10000+i).toString(16).padStart(64,'0'),fresh);
  insert('timetable_publications',{activity_key:other,publication_id:'unrelated-'+i,scope_key:'unrelated-'+i,version_no:i+1000,pattern:'WEEKLY',published_at:fresh,published_by_source_id:'account-0001',effective_from:fresh.slice(0,10),effective_until:null,timezone:'UTC',snapshot_json:'{}',source_snapshot_sha256:'0'.repeat(64),conversion:'EXACT'});
 }
 await acceptFixtureSetup(f.env,await f.actor('global'),[area,other,course]);
 return {expired,permanent,studio,growth,uniqueKey:'dev-split-v1/lesson-pdfs/sha256/'+hashes[0]+'.pdf',sharedKeys:hashes.slice(1).map(sha=>'dev-split-v1/lesson-pdfs/sha256/'+sha+'.pdf')};
}
