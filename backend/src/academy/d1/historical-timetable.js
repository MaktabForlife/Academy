// Project a verified weekly schedule only over an explicitly approved past
// range. The synthetic version is below every real version, so it cannot
// supersede, cancel or end a live publication. Nothing is written during reads.
export async function historicalPublications(repository,start,end){
 if(!await repository.db.prepare("SELECT 1 ok FROM academy_settings WHERE setting_key='LessonMediaPilot' AND setting_value='1'").first())return [];
 const rows=(await repository.db.prepare(`SELECT p.*,e.extension_id,e.start_date,e.end_date FROM program_historical_extensions e JOIN timetable_publications p USING(activity_key,publication_id) WHERE e.start_date<=? AND e.end_date>=?`).bind(end,start).all()).results;
 return rows.map(row=>{
  const snapshot=JSON.parse(row.snapshot_json);
  if(row.pattern!=='WEEKLY'||row.end_date>=snapshot.effectiveFrom)throw Error('Invalid bounded historical timetable extension.');
  return {...row,publication_id:row.extension_id,version_no:0,effective_from:row.start_date,effective_until:row.end_date,
   snapshot_json:JSON.stringify({...snapshot,effectiveFrom:row.start_date,endDate:row.end_date})};
 });
}
