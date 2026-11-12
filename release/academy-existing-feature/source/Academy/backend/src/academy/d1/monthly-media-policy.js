// Feature-gated schema is mandatory when enabled. Never substitute empty grants
// for unavailable authority storage, or infer a paid month from current roles.
export const monthlyEnabled=repository=>repository.features?.monthlySubscriptions===true;
export const monthlyRightsSQL=account=>`SELECT s.activity_key,s.lesson_month,s.revision,s.class_ids_json FROM program_monthly_subscriptions s
 JOIN program_monthly_media_policies p USING(activity_key) JOIN activities x USING(activity_key)
 WHERE s.account_id=${account} AND s.active=1 AND p.enabled=1 AND x.active=1 AND x.lifecycle='ACTIVE' ORDER BY s.activity_key,s.lesson_month`;
export function monthlyAudienceSQL(fallback){
 return `((NOT EXISTS(SELECT 1 FROM program_monthly_media_policies mp WHERE mp.activity_key=l.activity_key AND mp.enabled=1) AND ${fallback}) OR
 EXISTS(SELECT 1 FROM program_monthly_media_policies mp JOIN program_monthly_subscriptions ms USING(activity_key)
 WHERE mp.activity_key=l.activity_key AND mp.enabled=1 AND ms.active=1 AND ms.account_id=? AND ms.lesson_month=substr(l.lesson_date,1,7)
 AND EXISTS(SELECT 1 FROM json_each(ms.class_ids_json) mc WHERE mc.value=l.class_id COLLATE NOCASE OR EXISTS(SELECT 1 FROM json_each(l.source_lessons_json,'$[0].classIds') lc WHERE lc.value=mc.value COLLATE NOCASE))))`;
}
export const retainedRecordingPrefix=(env,key)=>(env.ACADEMY_OBJECT_NAMESPACE||'')+'retained-program-recordings/'+encodeURIComponent(key)+'/';
export const retainedRecording=(env,key,asset,policy)=>Boolean(policy?.retain_recordings===1&&asset.object_key?.startsWith(retainedRecordingPrefix(env,key)));
