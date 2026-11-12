import {dayStart} from './academy-clock.js';
import {managementError as fail} from './management-store.js';

// Three calendar months, clamped to the target month's last real day. This is
// a read window; it does not withdraw, expire or delete a saved Class Note.
export function classNoteSummaryWindow(today,timezone,instant){
 const [year,month,day]=today.split('-').map(Number),target=new Date(Date.UTC(year,month-4,1));
 const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
 target.setUTCDate(Math.min(day,last));
 const fromDate=target.toISOString().slice(0,10);
 return {months:3,fromDate,throughDate:today,from:dayStart(fromDate,timezone),through:instant.toISOString(),timezone,basis:'CREATED_AT'};
}

export function classNoteSummaryPage(input,window){
 const limit=input.limit===undefined?20:input.limit;
 if(!Number.isInteger(limit)||limit<1||limit>50)throw fail('Choose up to 50 Class Notes.');
 const before=input.before;
 if(before!==undefined&&(!before||Array.isArray(before)||typeof before!=='object'||typeof before.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(before.createdAt)||!Number.isFinite(Date.parse(before.createdAt))||new Date(before.createdAt).toISOString()!==before.createdAt||before.createdAt<window.from||before.createdAt>window.through||typeof before.id!=='string'||!before.id||before.id.length>200||/[\u0000-\u001f\u007f]/.test(before.id)))throw fail('Choose a valid Class Notes page.');
 return {limit,before};
}

export async function classNoteSummaryCandidates(db,activityKey,input,window){
 const {limit,before}=classNoteSummaryPage(input,window);
 try{
  // Select a bounded, indexed candidate page before resolving current lesson
  // sharing. Hidden-class notes can leave a sparse page; its cursor advances
  // over the examined candidates without disclosing text, authors or contexts.
  const result=await db.prepare(`SELECT note_id,context_id,created_at FROM class_notes INDEXED BY class_notes_programme_history
   WHERE activity_key=? COLLATE NOCASE AND state='ACTIVE' AND created_at>=? AND created_at<=?${before?' AND (created_at,note_id)<(?,?)':''}
   ORDER BY created_at DESC,note_id DESC LIMIT ?`).bind(activityKey,window.from,window.through,...(before?[before.createdAt,before.id]:[]),limit+1).all();
  const rows=result.results,page=rows.slice(0,limit),last=page.at(-1);
  return {page,before:rows.length>limit?{createdAt:last.created_at,id:last.note_id}:null};
 }catch(error){
  if(/no such index.*class_notes_programme_history/i.test(error.message||''))throw fail('The programme notes summary is being prepared. Please try again shortly.',503,'CLASS_NOTE_SUMMARY_SCHEMA_REQUIRED');
  throw error;
 }
}
