// Keep imported policy evidence intact. Explicit Program decisions use the
// existing settings store and the Program revision/audit transaction.
export const programAccessKey=activity=>`ProgramAccess:${String(activity).toUpperCase()}`;
export const programAccessJoin="LEFT JOIN activity_policy_imports ap USING(activity_key) LEFT JOIN academy_settings psa ON a.kind='PROGRAM' AND psa.setting_key='ProgramAccess:'||upper(a.activity_key)";
export const programAccessSQL="CASE WHEN psa.setting_key IS NOT NULL THEN CASE WHEN psa.setting_value IN ('FREE','PAID') THEN psa.setting_value ELSE 'UNKNOWN' END ELSE COALESCE(ap.source_access_model,'UNKNOWN') END";
export const policyReadSQL=`SELECT a.activity_key,ap.source_access_model,ap.source_review_state,ap.source_stage,ap.source_description,ap.run_id,${programAccessSQL} AS access_model FROM activities a ${programAccessJoin}`;
