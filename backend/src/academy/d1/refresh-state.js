export const refreshKinds=['profile-labels','public-timetable'];
export const refreshSetting=kind=>'AcademyRefresh:'+kind;
export const refreshObject=(env,kind)=>`academy-refresh/v1/${encodeURIComponent(env.ENVIRONMENT)}/${encodeURIComponent(env.ACADEMY_D1_RUN_ID||'rehearsal')}/${kind}.json`;
export function markRefresh(p,kind,actor) {
  if(!refreshKinds.includes(kind))throw Error('Unknown cache refresh kind');
  return p(`INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id)
    VALUES(?,json_object('requested',1,'published',0,'attempts',0,'nextAttemptAt',0,'leaseUntil',0),?,?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=json_set(academy_settings.setting_value,
      '$.requested',COALESCE(json_extract(academy_settings.setting_value,'$.requested'),0)+1,
      '$.attempts',0,'$.nextAttemptAt',0,'$.leaseUntil',0),updated_at=excluded.updated_at,updated_by_account_id=excluded.updated_by_account_id`,refreshSetting(kind),new Date().toISOString(),actor);
}
export function managementSettings(p,versions,effects,actor,now) {
  const entries=[...versions.map(key=>({key:writeVersionKey(key),value:'1'})),...effects.map(kind=>({key:refreshSetting(kind),value:JSON.stringify({requested:1,published:0,attempts:0,nextAttemptAt:0,leaseUntil:0})}))];
  return p(`INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id)
    SELECT json_extract(value,'$.key'),json_extract(value,'$.value'),?,? FROM json_each(?) WHERE 1
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=CASE WHEN academy_settings.setting_key LIKE 'AcademyRefresh:%'
      THEN json_set(academy_settings.setting_value,'$.requested',COALESCE(json_extract(academy_settings.setting_value,'$.requested'),0)+1,'$.attempts',0,'$.nextAttemptAt',0,'$.leaseUntil',0)
      ELSE CAST(CAST(academy_settings.setting_value AS INTEGER)+1 AS TEXT) END,updated_at=excluded.updated_at,updated_by_account_id=excluded.updated_by_account_id`,now,actor,JSON.stringify(entries));
}
export function publicRefreshNeeded(dataset,action,input,fields=[]) {
  if(dataset==='ACADEMY_CALENDAR')return true;
  if(dataset==='PROGRAM_TIMETABLE')return ['publish','status'].includes(action);
  if(dataset==='COURSE_MANAGEMENT')return ['course-editor/publish','course-editor/public-card-save'].includes(action)||action==='course-editor/status'&&['COMPLETE','CANCELLED','ARCHIVED'].includes(input.stage)||fields.some(f=>/^GlobalTimetable|^AcademyCalendar|^GlobalSubject(?:Runs|List|AccessPolicy)$/.test(f));
  return false;
}
import {writeVersionKey} from './change-scopes.js';
