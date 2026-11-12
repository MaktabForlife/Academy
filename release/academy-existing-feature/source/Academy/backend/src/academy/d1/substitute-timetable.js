import {publicationRecord,publicationSchedule} from '../../programs/weekly-timetable.js';
import {localInstant} from './academy-clock.js';
import {currentProgramZoom} from './program-zoom.js';
import {noTeachingCalendarEvents,holidayOnDate} from './calendar-holidays.js';
import {same} from './management-store.js';

// A substitute grant is an exact dated session capability, never a Teacher role.
export async function substituteTimetable(repository,auth,data,now){
 const actor=auth.user.accountid,timestamp=now.toISOString(),db=repository.db;
 const [grants,classes,zoom]=(await db.batch([
  db.prepare("SELECT g.*,a.activity_id,a.kind,a.name FROM attendance_substitutes g JOIN activities a USING(activity_key) WHERE g.account_id=? AND a.active=1 AND a.lifecycle='ACTIVE' AND g.revoked_at IS NULL AND g.starts_at<=? AND max(g.correction_until,coalesce(g.correction_reopen_until,''))>? AND g.attendance_date BETWEEN ? AND ?").bind(actor,timestamp,timestamp,data.start,data.end),
  db.prepare("SELECT c.* FROM classes c WHERE c.active=1 AND EXISTS(SELECT 1 FROM attendance_substitutes g WHERE g.activity_key=c.activity_key AND g.account_id=? AND g.revoked_at IS NULL)").bind(actor),
  db.prepare("SELECT setting_key,setting_value FROM academy_settings WHERE setting_key LIKE 'ProgramZoom:%'")
 ])).map(r=>r.results),rows=[],areas=[];
 for(const grant of grants){
  if(holidayOnDate(noTeachingCalendarEvents(data,grant.attendance_date,grant.attendance_date,grant.activity_key),grant.attendance_date))continue;
  let lesson,meeting='',timezone;
  if(grant.kind==='PROGRAM'){
   const candidates=data.publications.filter(p=>same(p.activity_key,grant.activity_key)&&p.pattern!=='COURSE');
   const history=candidates.map(p=>publicationRecord({PublicationID:p.publication_id,VersionNo:p.version_no,SnapshotJSON:p.snapshot_json,PublishedDate:p.published_at,Lifecycle:data.stopped.find(s=>same(s.publication_id,p.publication_id))?.status||''},{id:grant.activity_id}));
   const current=publicationSchedule(history,grant.attendance_date).currentPublicationId;
   for(const p of candidates.filter(p=>same(p.publication_id,current))){
    const publication=publicationRecord({PublicationID:p.publication_id,VersionNo:p.version_no,SnapshotJSON:p.snapshot_json,PublishedDate:p.published_at},{id:grant.activity_id});
    const weekday=new Date(grant.attendance_date+'T12:00:00Z').getUTCDay();
    const row=publication.occurrences.find(l=>l.kind!=='BREAK'&&l.status!=='CANCELLED'&&(publication.pattern==='WEEKLY'?l.weekday===weekday:l.date===grant.attendance_date)&&(l.classIds||[]).some(id=>JSON.stringify(['PROGRAM',l.ruleId||l.anchor,id])===grant.stable_key&&classes.some(c=>same(c.activity_key,grant.activity_key)&&same(c.class_id,id))));
    if(row){lesson={title:row.moduleName||row.subjectName||grant.name,startTime:row.startTime,endTime:row.endTime,classNames:row.classNames||[],teacherNames:row.teacherNames||[row.teacherName].filter(Boolean)};timezone=p.timezone;meeting=currentProgramZoom(zoom.find(z=>z.setting_key==='ProgramZoom:'+grant.activity_key.toUpperCase())?.setting_value,row,publication,classes.filter(c=>same(c.activity_key,grant.activity_key)));break;}
   }
  }else for(const run of data.runs.filter(r=>same(r.activity_key,grant.activity_key))){
   const state=data.runStates.find(s=>same(s.run_id,run.run_id)),p=data.publications.find(p=>same(p.publication_id,state?.current_publication_id));if(!p||state.stage==='CANCELLED')continue;
   const row=JSON.parse(p.snapshot_json).sessions?.find(s=>s.SessionDate===grant.attendance_date&&s.SessionKind!=='BREAK'&&JSON.stringify(['COURSE',run.run_id,s.SourceSessionID||s.PublishedSessionID])===grant.stable_key&&!data.lifecycles.some(l=>same(l.publication_id,p.publication_id)&&same(l.source_session_id,s.SourceSessionID||s.PublishedSessionID)&&['CANCELLED','REPLACED'].includes(l.status)));
   if(row){lesson={title:row.ModuleName||row.SessionDescription||grant.name,startTime:row.StartTime,endTime:row.EndTime,classNames:[run.name],teacherNames:[row.TeacherName].filter(Boolean)};timezone=row.Timezone||run.timezone;meeting=row.ZoomLink||row.ZoomURL||row.MeetingLink||'';break;}
  }
  if(!lesson)continue;
  const event={...lesson,kind:grant.kind,activityId:grant.activity_id,activityName:grant.name,date:grant.attendance_date,timezone,status:'SCHEDULED',relevant:true,involvement:'substitute',joinKey:JSON.stringify(['SUBSTITUTE',grant.assignment_id,grant.attendance_date]),substitute:true};
  const start=Date.parse(localInstant(event.date,event.startTime,timezone)),end=Date.parse(localInstant(event.date,event.endTime,timezone));
  if(/^https:\/\//i.test(meeting)&&now.getTime()>=start-300000&&now.getTime()<end)event.joinUrl=meeting;
  rows.push(event);if(!areas.some(a=>a.id===grant.activity_id&&a.kind===grant.kind))areas.push({id:grant.activity_id,kind:grant.kind,name:grant.name,roles:['SUBSTITUTE'],substituteOnly:true,menuAvailable:true,timetable:[]});
 }
 return {rows,areas};
}
