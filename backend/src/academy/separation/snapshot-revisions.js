const prefix='AcademySnapshot:',literal=value=>"'"+value.replaceAll("'","''")+"'";
// Immutable definitions are identified by the accepted setup head. Only these
// current facts can change a published dashboard without accepting a new head.
const rules={
 program_monthly_media_policies:{dataset:'authority',global:true},
 program_surah_grants:{dataset:'authority',account:'account_id'},
 program_monthly_subscriptions:{dataset:'authority',account:'account_id'},
 activities:{dataset:'audience',columns:['active','lifecycle','website_visible']},
 accounts:{dataset:'audience',columns:['active','display_name']},
 classes:{dataset:'audience',columns:['active']},
 modules:{dataset:'audience',columns:['active']},
 program_subjects:{dataset:'audience',columns:['active']},
 subject_catalog:{dataset:'audience',columns:['active']},
 class_memberships:{dataset:'membership',account:'account_id',columns:['account_id','activity_key','class_id','active','start_date','end_date']},
 class_teacher_assignments:{dataset:'membership',account:'account_id',columns:['account_id','activity_key','class_id']},
 // Retained legacy role mappings are derived across assignment rows. A role
 // edit can therefore change another account's effective mapped authority.
 role_assignments:{dataset:'authority',account:'account_id',global:true},
 course_subscription_decisions:{dataset:'authority',account:'account_id'},
 course_settings:{dataset:'timetable',columns:['legacy_access_model','policy_review_state']},
 course_runs:{dataset:'timetable',columns:['active']},
 course_run_access:{dataset:'timetable',columns:['access_model']},
 course_run_state:{dataset:'timetable',columns:['stage','current_publication_id']},
 program_publication_lifecycle:{dataset:'timetable'},lesson_lifecycle:{dataset:'timetable'},
 program_publication_state:{dataset:'timetable'},
 published_lesson_classes:{dataset:'timetable'},published_lesson_teachers:{dataset:'timetable'},
 assessment_recipients:{dataset:'assessment',account:'account_id',columns:['assessment_id','account_id']},
 assessments:{dataset:'assessment',columns:['schedule_published','examiner_id','deleted_at']},
 assessment_registers:{dataset:'assessment',columns:['status']},
 academy_calendar_events:{dataset:'calendar',columns:['active']},
 academy_calendar_suppressions:{dataset:'calendar'},
 teacher_availability:{dataset:'calendar',columns:['revision']},
 academy_settings:{dataset:'timetable',columns:['setting_key','setting_value'],when:row=>`(${row}.setting_key IN ('PersonalMemorisationCards','ProgramWorkspace') OR ${row}.setting_key LIKE 'ProgramAccess:%')`}
};
export const snapshotSchemaKey=prefix+'Schema';
export function snapshotKeys(kind,account){
 account=String(account).toUpperCase();
 const datasets=kind==='permissions'?['audience:GLOBAL','timetable:GLOBAL','authority:GLOBAL','authority:'+account]:kind==='timetable-source'?['audience:GLOBAL','timetable:GLOBAL','membership:'+account]:kind==='calendar'?['audience:GLOBAL','calendar:GLOBAL']:kind==='dashboard-assessments'?['audience:GLOBAL','timetable:GLOBAL','assessment:GLOBAL','membership:'+account,'assessment:'+account]:[];
 return [snapshotSchemaKey,...datasets.map(key=>prefix+key)];
}
export function snapshotRevisionDDL(tables=Object.keys(rules)){
 const existing=new Set(tables),statements=[];
 for(const [table,rule] of Object.entries(rules)){
  if(!existing.has(table))continue;
  for(const verb of ['INSERT','UPDATE','DELETE']){
   const row=verb==='DELETE'?'OLD':'NEW',scopes=rule.account?(verb==='UPDATE'?['OLD','NEW']:[row]).map(r=>`upper(${r}.${rule.account})`):["'GLOBAL'"];
   if(rule.global)scopes.push("'GLOBAL'");
   const changed=verb==='UPDATE'&&rule.columns?'('+rule.columns.map(c=>`OLD.${c} IS NOT NEW.${c}`).join(' OR ')+')':null;
   const condition=[changed,rule.when?.(row)].filter(Boolean).join(' AND ');
   const body=[...new Set(scopes)].map(scope=>`INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES(${literal(prefix+rule.dataset+':')}||${scope},'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at;`).join('\n');
   statements.push(`CREATE TRIGGER IF NOT EXISTS academy_snapshot_${table}_${verb.toLowerCase()} AFTER ${verb}${verb==='UPDATE'&&rule.columns?' OF '+rule.columns.join(','):''} ON "${table}"${condition?' WHEN '+condition:''} BEGIN ${body} END;`);
  }
 }
 statements.push(`INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES(${literal(snapshotSchemaKey)},'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO NOTHING;`);
 return statements.join('\n');
}
