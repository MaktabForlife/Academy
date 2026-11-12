// Resolve only referenced public teacher labels inside the publication read.
// The accounts primary key supplies each label; no separate request or account
// scan is needed. Callers omit this projection entirely for anonymous visitors.
export const publicationTeacherAccountsSQL=`(
  SELECT json_group_array(json_object('account_id',a.account_id,'display_name',a.display_name,'active',a.active))
  FROM accounts a WHERE a.account_id IN (
    SELECT trim(teacher.value)
    FROM json_each(CASE WHEN json_type(p.snapshot_json,'$.rules')='array' THEN json_extract(p.snapshot_json,'$.rules') ELSE '[]' END) rule,
      json_each(CASE WHEN rule.type='object' THEN
        CASE WHEN json_type(rule.value,'$.teacherIds')='array' AND json_array_length(rule.value,'$.teacherIds')>0
          THEN json_extract(rule.value,'$.teacherIds') ELSE json_array(json_extract(rule.value,'$.teacherId')) END
        ELSE '[]' END) teacher
    WHERE teacher.type='text' AND trim(teacher.value)<>''
    UNION
    SELECT trim(teacher.value)
    FROM json_each(CASE WHEN json_type(p.snapshot_json,'$.sessions')='array' THEN json_extract(p.snapshot_json,'$.sessions') ELSE '[]' END) session,
      json_each(CASE WHEN session.type='object' THEN json_array(json_extract(session.value,'$.TeacherAccountID')) ELSE '[]' END) teacher
    WHERE teacher.type='text' AND trim(teacher.value)<>''
  )
)`;
