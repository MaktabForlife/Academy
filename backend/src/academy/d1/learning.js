import {usedInProgramLessons} from './curriculum-removal.js';
import {workspaceQueries,workspaceCatalog,workspaceValidation,workspaceId,recordStatement,assertWorkspaceDraft,snapshotDraft,canEditWorkspace} from './program-workspace.js';
import {applyProgramZoom} from './program-zoom.js';
import {normalizeWeeklyDraft} from '../../programs/weekly-timetable.js';
import {canEditTeacherAvailability} from './teacher-availability.js';
import {subjectView} from './subjects.js';
import {d1Programs} from './programs.js';
import {managementStore,managementError,liveRoles,same} from './management-store.js';
import {requireLearning} from './learning-state.js';
import {timetableService} from '../../programs/timetable-service.js';
import {attendanceService} from '../../programs/attendance-service.js';
import {WEEKLY_SCHEMA,publicationRecord,programToday} from '../../programs/weekly-timetable.js';
import {payloadHash,TIMETABLE_SCHEMA} from '../../programs/timetable-model.js';
import {insertRecords} from './insert-records.js';
import {readerRoles,isAdminWorkspace,administers} from './workspace-access.js';

export function learningCatalog(loaded) {
  const t=loaded.current.snapshot,shared=loaded.shared;
  const students=new Set(shared.accounts.filter(a=>a.Active&&a.Roles.includes('STUDENT')).map(a=>a.AccountID));
  return {
    subjects:t.ProgramSubjects.map(r=>{const s=shared.subjects.find(s=>same(s.SubjectID,r.SubjectID));return {id:r.ProgramSubjectID,courseId:r.CourseID,subjectId:r.SubjectID,name:s?.SubjectName||r.SubjectID,active:r.Active&&Boolean(s?.Active)};}),
    levels:t.ProgramLevels.map(r=>({id:r.LevelID,programSubjectId:r.ProgramSubjectID,name:r.Name,active:r.Active})),
    modules:t.ProgramModules.map(r=>({id:r.ProgramModuleID,programSubjectId:r.ProgramSubjectID,levelId:r.LevelID,name:r.Name,active:r.Active})),
    classes:t.ProgramClasses.map(r=>({id:r.ClassID,courseId:r.CourseID,name:r.Name,academicYear:r.AcademicYear,zoomLink:r.ZoomLink,classTeacherId:r.TeacherAccountID,active:r.Active})),
    teachers:shared.accounts.filter(a=>a.Active&&a.Roles.some(r=>['TEACHER','ADMIN'].includes(r))).map(a=>({id:a.AccountID,name:a.DisplayName,active:true})),
    enrollments:t.ProgramEnrollments.map(r=>({id:r.EnrollmentID,courseId:r.CourseID,classId:r.ClassID,accountId:r.AccountID,startDate:r.StartDate,endDate:r.EndDate,active:r.Active&&students.has(r.AccountID)}))
  };
}
export function d1Learning(repository,auth,now=()=>new Date()) {
  const store=managementStore(repository,auth),p=store.p,programs=d1Programs(repository,auth);
  let readiness;
  const ready=()=>readiness??=requireLearning(repository.db);
  async function load(id,{timetableOnly=false}={}) {
    await ready();
    const activity=`PROGRAM:${id}`;
    const workspace=await workspaceQueries(repository,activity);
    const loaded=await programs.load(id,{...workspace,
      drafts:p('SELECT * FROM timetable_drafts WHERE activity_key=?',activity),
      publications:p('SELECT * FROM timetable_publications WHERE activity_key=? ORDER BY version_no',activity),
      pointer:p('SELECT * FROM program_publication_state WHERE activity_key=?',activity),
      registers:p('SELECT * FROM attendance_registers WHERE activity_key=? ORDER BY sequence',activity),
      ...(!timetableOnly?{marks:p('SELECT * FROM attendance_marks WHERE activity_key=?',activity)}:{})
    },{timetableOnly});
    const roles=readerRoles(auth,liveRoles(loaded.data,auth.user.accountid,loaded.a.activity_key));
    loaded.roles=roles;
    if(loaded.data.teacherStaff){
      const ids=new Set(workspaceCatalog(loaded,learningCatalog(loaded)).teachers.map(t=>t.id));
      for(const a of loaded.data.accounts.filter(a=>ids.has(a.account_id)&&!loaded.shared.accounts.some(s=>same(s.AccountID,a.account_id))))loaded.shared.accounts.push({AccountID:a.account_id,DisplayName:a.display_name,Active:Boolean(a.active),Roles:['TEACHER']});
      loaded.shared.grantedTeachers=[...ids].map(AccountID=>({AccountID}));
    }
    if(!auth.state.account.global_admin&&(loaded.a.lifecycle!=='ACTIVE'||!roles.length&&!administers(auth,loaded.a.activity_key)))throw managementError('This Program is unavailable to your account.',403,'FORBIDDEN');
    loaded.program.timetableEditable=loaded.a.lifecycle!=='ARCHIVED';
    const tables=loaded.viewData.tables;
    tables.ProgramTimetableState=loaded.data.drafts.map(r=>({CourseID:loaded.program.id,SchemaVersion:JSON.parse(r.draft_json).format===WEEKLY_SCHEMA?WEEKLY_SCHEMA:TIMETABLE_SCHEMA,Revision:r.source_revision||'',Sequence:r.source_sequence,DraftJSON:JSON.stringify(applyProgramZoom(JSON.parse(r.draft_json),loaded.program)),CurrentPublicationID:loaded.data.pointer[0]?.latest_publication_id||''}));
    tables.ProgramTimetablePublications=loaded.data.publications.map(r=>({Lifecycle:loaded.data.publicationLifecycle?.find(l=>same(l.publication_id,r.publication_id))?.status||'',PublicationID:r.publication_id,CourseID:loaded.program.id,VersionNo:r.version_no,PublishedDate:r.published_at,PublishedByAccountID:r.published_by_source_id,SnapshotJSON:r.snapshot_json}));
    tables.ProgramTimetableOperations=[];
    loaded.attendance={prepared:true,source:loaded.viewData,tables:{
      ProgramAttendanceRegisters:loaded.data.registers.map(r=>({RegisterID:r.register_id,CourseID:loaded.program.id,AttendanceDate:r.attendance_date,PublicationID:r.publication_id,LessonAnchor:r.lesson_anchor,LessonJSON:r.lesson_json,LearnerCount:r.learner_count,SubmittedDate:r.submitted_at,SubmittedByAccountID:r.submitted_by_account_id||r.source_actor_id,OperationID:r.operation_id})),
      ProgramAttendanceMarks:(loaded.data.marks||[]).map(r=>({RegisterID:r.register_id,AccountID:r.account_id,DisplayName:r.display_name,Status:r.status})),ProgramAttendanceOperations:[]}};
    return loaded;
  }
  const timetable=loaded=>timetableService({load:async()=>loaded.viewData,catalog:async()=>workspaceCatalog(loaded,learningCatalog(loaded)),managementReferences:async()=>loaded.shared,
    hasAttendanceOn:async date=>loaded.data.registers.some(r=>r.attendance_date===date),plan:(_data,records)=>records},loaded.program,now);
  function requireRole(loaded,roles) {
    if(!auth.state.account.global_admin&&!loaded.roles.some(r=>roles.includes(r)))throw managementError('This action requires an authorised Program role.',403,'FORBIDDEN');
  }
  async function timetableStatements(loaded,records) {
    const activity=loaded.a.activity_key,statements=[];
    for(const {table,record:r} of records) {
      if(table==='ProgramTimetablePublications') {
        const pub=publicationRecord(r,loaded.program);
        statements.push(p(`INSERT INTO timetable_publications(activity_key,publication_id,scope_key,version_no,pattern,published_at,published_by_source_id,effective_from,timezone,snapshot_json,source_snapshot_sha256,conversion)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,'EXACT')`,activity,pub.id,activity,pub.version,pub.pattern,pub.date,pub.by,pub.effectiveFrom,pub.snapshot.timezone||loaded.program.timezone,r.SnapshotJSON,await payloadHash(pub.snapshot)));
        const lessons=[],classes=[],teachers=[];
        for(const l of pub.occurrences) {
          lessons.push({activity_key:activity,publication_id:pub.id,lesson_anchor:l.anchor,source_rule_id:l.sourceRuleId||l.ruleId||null,module_id:l.moduleId||null,kind:l.kind||'LESSON',status:l.status||'SCHEDULED',weekday:Number.isInteger(l.weekday)?l.weekday:null,lesson_date:l.date||l.sessionDate||null,start_time:l.startTime,end_time:l.endTime,timezone:pub.snapshot.timezone||loaded.program.timezone,title:l.moduleName||l.title||null,zoom_link:l.zoomLink||null,snapshot_json:JSON.stringify(l)});
          for(const id of new Set(l.classIds||[]))classes.push({activity_key:activity,publication_id:pub.id,lesson_anchor:l.anchor,class_id:id});
          for(const id of new Set([l.teacherId,...(l.teacherIds||[])].filter(Boolean)))teachers.push({activity_key:activity,publication_id:pub.id,lesson_anchor:l.anchor,account_id:id});
        }
        statements.push(...insertRecords(p,'published_lessons',lessons),...insertRecords(p,'published_lesson_classes',classes),...insertRecords(p,'published_lesson_teachers',teachers));
        // Publication opens a new Program as well as its schedule. Both changes
        // commit together, so Home cannot be left with a published inactive draft.
        statements.push(p("UPDATE activities SET active=1,lifecycle='ACTIVE',website_visible=1,revision=revision+CASE WHEN active=0 OR lifecycle<>'ACTIVE' THEN 1 ELSE 0 END,updated_at=? WHERE activity_key=? AND lifecycle<>'ARCHIVED'",new Date().toISOString(),activity));
      }
      if(table==='ProgramTimetableState')statements.push(p(`INSERT INTO timetable_drafts(activity_key,scope_key,source_revision,source_sequence,draft_json,source_draft_sha256,modified_at) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(activity_key,scope_key) DO UPDATE SET source_revision=excluded.source_revision,source_sequence=excluded.source_sequence,draft_json=excluded.draft_json,source_draft_sha256=excluded.source_draft_sha256,modified_at=excluded.modified_at`,activity,activity,r.Revision,r.Sequence,r.DraftJSON,await payloadHash(JSON.parse(r.DraftJSON)),r.ModifiedDate),
        p('INSERT INTO program_publication_state VALUES(?,?) ON CONFLICT(activity_key) DO UPDATE SET latest_publication_id=excluded.latest_publication_id',activity,r.CurrentPublicationID||null));
    }
    return statements;
  }
  return {
    load,
    async timetable(action,input) {
      await ready();
      const selected=async options=>{const loaded=await load(input.id,options);if(input.draft?.timezone&&input.draft.timezone!==loaded.program.timezone)throw managementError('Time zone is an app setting managed by Global Admin.',403,'APP_TIMEZONE_ONLY');return loaded;};
      const write=['save','publish','copy','status'].includes(action);
      if(action==='validate'&&input.operationId)return store.change('PROGRAM_TIMETABLE',`PROGRAM:${String(input.id).toUpperCase()}`,action,input,async()=>{
        const loaded=await selected();requireRole(loaded,['PROGRAM_ADMIN']);
        if(!loaded.data.workspaceRecords)throw managementError('The Program workspace needs its database upgrade.',503);
        const current=await timetable(loaded).read('get');
        if(input.revision!==current.revision||await payloadHash(normalizeWeeklyDraft(input.draft))!==await payloadHash(normalizeWeeklyDraft({...current.draft,timetableId:workspaceId(loaded)})))throw managementError('Save the current draft before validating.',409);
        const id=assertWorkspaceDraft(loaded,input),result=await workspaceValidation(loaded,input.draft,workspaceCatalog(loaded,learningCatalog(loaded)),input.effectiveFrom);
        return {data:loaded.data,statements:[recordStatement(p,loaded,id,input.draft,result.valid?'VALID':'DRAFT',null,null,result.valid?result.validationHash:null)],result,fields:['TimetableValidation']};
      });
      if(['copy','status'].includes(action))return store.change('PROGRAM_TIMETABLE',`PROGRAM:${String(input.id).toUpperCase()}`,action,input,async()=>{
        const loaded=await selected();requireRole(loaded,['PROGRAM_ADMIN']);
        if(!loaded.data.workspaceRecords)throw managementError('The Program workspace needs its database upgrade.',503);
        if(loaded.a.lifecycle==='ARCHIVED')throw managementError('Reactivate the Program before changing timetables.',409);
        const current=await timetable(loaded).read('get');
        if(input.revision!==current.revision)throw managementError('This timetable changed elsewhere. Reload before continuing.',409);
        const record=loaded.data.workspaceRecords.find(r=>r.timetable_id===input.timetableId),publication=loaded.data.publications.find(r=>same(r.publication_id,input.timetableId));
        if(input.timetableId!==workspaceId(loaded)&&!record&&!publication)throw managementError('Choose a timetable in this Program.',404);
        const statements=[];let result;
        if(action==='copy'){
          const id='TT-'+crypto.randomUUID(),source=record?JSON.parse(record.draft_json):publication?snapshotDraft(JSON.parse(publication.snapshot_json),id):current.draft,draft=normalizeWeeklyDraft({...source,timetableId:id});
          if(!loaded.data.workspaceRecords.some(r=>r.timetable_id===workspaceId(loaded)))statements.push(recordStatement(p,loaded,workspaceId(loaded),current.draft));
          const planned=await timetable(loaded).plan('save',{...input,draft:{...current.draft,timetableId:id}},auth.user,await payloadHash(input));
          statements.push(...await timetableStatements(loaded,planned.plan),recordStatement(p,loaded,id,draft,'DRAFT',input.timetableId));
          // Save the selected source, rather than the previous board, as the new editable draft.
          statements.push(p('UPDATE timetable_drafts SET draft_json=?,source_draft_sha256=? WHERE activity_key=? AND scope_key=?',JSON.stringify(draft),await payloadHash(draft),loaded.a.activity_key,loaded.a.activity_key));
          result={...planned.result,timetableId:id};
        }else{
          if(!['ARCHIVED','CANCELLED'].includes(input.status))throw managementError('Choose Archived or Cancelled.');
          const id=record?.timetable_id||(publication?'TT-'+publication.publication_id:input.timetableId),pubId=record?.publication_id||publication?.publication_id;
          statements.push(recordStatement(p,loaded,id,record?JSON.parse(record.draft_json):publication?snapshotDraft(JSON.parse(publication.snapshot_json),id):current.draft,input.status,null,pubId));
          if(pubId)statements.push(p('INSERT INTO program_publication_lifecycle VALUES(?,?,?,?) ON CONFLICT(activity_key,publication_id) DO UPDATE SET status=excluded.status,changed_at=excluded.changed_at',loaded.a.activity_key,pubId,input.status,new Date().toISOString()));
          result={timetableId:id,status:input.status};
        }
        return {data:loaded.data,statements,result,fields:['Timetable',action]};
      });
      if(write)return store.change('PROGRAM_TIMETABLE',`PROGRAM:${String(input.id).toUpperCase()}`,action,input,async()=>{
        const loaded=await selected({timetableOnly:true});requireRole(loaded,['PROGRAM_ADMIN']);
        input={...input,draft:applyProgramZoom(input.draft,loaded.program)};
        let timetableId,review;
        if(loaded.data.workspaceRecords){
          timetableId=assertWorkspaceDraft(loaded,input);
          input={...input,draft:{...input.draft,timetableId}};
          if(action==='publish'){
            const today=programToday(loaded.program.timezone,now()),date=input.effectiveFrom;
            if(!date||date<=today)throw managementError('Choose a future effective date, from tomorrow onwards.',409);
            review=await workspaceValidation(loaded,input.draft,workspaceCatalog(loaded,learningCatalog(loaded)),date);
            if(!review.valid)throw managementError('Resolve teacher availability and timetable validation issues before publishing.',409);
          }
        }
        const planned=await timetable(loaded).plan(action,input,auth.user,await payloadHash({action,input}));
        const statements=await timetableStatements(loaded,planned.plan);
        if(timetableId){statements.push(recordStatement(p,loaded,timetableId,normalizeWeeklyDraft(input.draft),action==='publish'?'PUBLISHED':'DRAFT',null,planned.result.publicationId,review?.validationHash));
          if(action==='publish'){
            const teachers=[...new Set((review.occurrences||[]).flatMap(r=>r.teacherIds||[]))].map(teacherId=>({teacherId,assignmentId:crypto.randomUUID()}));
            if(teachers.length)statements.push(p(`INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state,granted_at,granted_by_account_id,revision)
              SELECT json_extract(j.value,'$.assignmentId'),json_extract(j.value,'$.teacherId'),?,'TEACHER',1,'CONFIRMED',?,?,1 FROM json_each(?) j
              WHERE NOT EXISTS(SELECT 1 FROM effective_activity_roles WHERE account_id=json_extract(j.value,'$.teacherId') AND activity_key=? AND role='TEACHER')`,loaded.a.activity_key,new Date().toISOString(),auth.user.accountid,JSON.stringify(teachers),loaded.a.activity_key));
          }
        }
        const publishedProgram=action==='publish'?{...loaded.program,active:true,status:'ACTIVE',revision:String(loaded.a.revision+Number(!loaded.a.active||loaded.a.lifecycle!=='ACTIVE'))}:null;
        return {data:loaded.data,statements,result:{...planned.result,...(timetableId?{timetableId}: {}),...(publishedProgram?{program:publishedProgram}:{})},fields:['Timetable',...(action==='publish'?['Publication',...(loaded.a.lifecycle==='DRAFT'?['ProgramLifecycle']:[])]:[])]};
      });
      const loaded=await selected();requireRole(loaded,['PROGRAM_ADMIN']);
      if(['prepare','prepare-library'].includes(action))return {prepared:true,libraryPrepared:true};
      if(action==='recover')return {recovered:false};
      if(action==='record'){
        const record=loaded.data.workspaceRecords?.find(r=>r.timetable_id===input.timetableId);if(!record)throw managementError('Timetable not found in this Program.',404);
        const review=await workspaceValidation(loaded,JSON.parse(record.draft_json),workspaceCatalog(loaded,learningCatalog(loaded)),programToday(loaded.program.timezone,now()));
        return {...review,status:record.status==='VALID'&&(!review.valid||review.validationHash!==record.validation_hash)?'DRAFT':record.status,timetableId:record.timetable_id};
      }
      if(!['get','history','published','preview','validate','manage-get'].includes(action))throw managementError('Unknown timetable action.',404);
      let result=await timetable(loaded).read(action,input);
      if(loaded.data.workspaceRecords){
        const catalog=workspaceCatalog(loaded,learningCatalog(loaded));
        if(['validate','preview'].includes(action))result=await workspaceValidation(loaded,input.draft,catalog,input.effectiveFrom||programToday(loaded.program.timezone,now()));
        if(action==='get'){
          result.draft=applyProgramZoom(result.draft,loaded.program);
          result.draft.timetableId=workspaceId(loaded);
          const record=loaded.data.workspaceRecords.find(r=>r.timetable_id===result.draft.timetableId);
          const checked=record?.status==='VALID'?await workspaceValidation(loaded,result.draft,catalog,programToday(loaded.program.timezone,now())):null;
          const availabilityData={...loaded.data,teachers:loaded.data.teacherStaff,classes:loaded.data.teachers.filter(t=>catalog.classes.some(c=>c.active&&same(c.id,t.class_id)))};
          const displayCatalog={...catalog,subjects:catalog.subjects.map(row=>({...row,lessonUsed:usedInProgramLessons(loaded,'subjects',row.id)})),modules:catalog.modules.map(row=>({...row,lessonUsed:usedInProgramLessons(loaded,'modules',row.id)})),teachers:catalog.teachers.map(t=>({...t,availabilityEditable:canEditTeacherAvailability(availabilityData,auth.user.accountid,t.id)}))};
          result={...result,catalog:displayCatalog,workspaceReady:true,timetableId:result.draft.timetableId,timetableStatus:record?.status==='VALID'&&(!checked.valid||checked.validationHash!==record.validation_hash)?'DRAFT':record?.status||'DRAFT',timetableEditable:canEditWorkspace(loaded),availability:loaded.data.availability.map(a=>({teacherId:a.account_id,ranges:JSON.parse(a.ranges_json),revision:a.revision})),setup:{...await subjectView(await timetable(loaded).read('manage-get'),auth.state.account.global_admin),sharedModules:(loaded.data.academyModules||[]).map(m=>({id:m.module_id,name:m.name,subjectId:loaded.data.subjects.find(s=>same(s.subject_key,m.subject_key))?.subject_id,active:Boolean(m.active)}))}};
        }
        if(action==='history')result.records=await Promise.all(loaded.data.workspaceRecords.map(async r=>{
          const review=r.status==='VALID'?await workspaceValidation(loaded,JSON.parse(r.draft_json),catalog,programToday(loaded.program.timezone,now())):null;
          return {id:r.timetable_id,status:review&&(!review.valid||review.validationHash!==r.validation_hash)?'DRAFT':r.status,sourceId:r.source_id,publicationId:r.publication_id,updatedAt:r.updated_at};
        }));
      }
      if(action==='manage-get'&&loaded.data.workspaceRecords){
        const catalog=workspaceCatalog(loaded,learningCatalog(loaded));
        const authority={...loaded.data,teachers:loaded.data.teacherStaff,classes:loaded.data.teachers.filter(t=>catalog.classes.some(c=>c.active&&same(c.id,t.class_id)))};
        const teachers=catalog.teachers.filter(t=>canEditTeacherAvailability(authority,auth.user.accountid,t.id));
        result.teacherAvailability={teachers,availability:loaded.data.availability.filter(a=>teachers.some(t=>same(t.id,a.account_id))).map(a=>({teacherId:a.account_id,ranges:JSON.parse(a.ranges_json),revision:a.revision}))};
      }
      return {...(action==='manage-get'?await subjectView(result,auth.state.account.global_admin):result),...(action==='manage-get'&&loaded.data.academyModules?{sharedModules:loaded.data.academyModules.map(m=>({id:m.module_id,name:m.name,subjectId:loaded.data.subjects.find(s=>same(s.subject_key,m.subject_key))?.subject_id||'',active:Boolean(m.active)}))}:{}),program:loaded.program,store:'D1',coordinatorAvailable:true,managementEditable:loaded.a.lifecycle!=='ARCHIVED',globalProfilesAvailable:Boolean(auth.state.account.global_admin),learningWorkflowsReady:true};
    },
    async attendance(action,input) {
      await ready();
      const plan=async()=>{
        const loaded=await load(input.id),preview=auth.workspace==='TEACH'&&!loaded.roles.includes('TEACHER')&&administers(auth,loaded.a.activity_key);
        if(!preview||action!=='get')requireRole(loaded,['PROGRAM_ADMIN','TEACHER']);
        const user={...auth.user,...(!isAdminWorkspace(auth)?{role:'TEACHER'}:{}),readOnlyPreview:preview,programRoles:loaded.roles.map(r=>r==='PROGRAM_ADMIN'?'ADMIN':r)};
        const service=attendanceService({load:async()=>loaded.attendance,accounts:async()=>loaded.shared.accounts,timetable:{catalog:async()=>learningCatalog(loaded)},plan:(_data,records)=>records},loaded.program,now);
        return {loaded,service,user};
      };
      if(action==='submit')return store.change('PROGRAM_ATTENDANCE',`PROGRAM:${String(input.id).toUpperCase()}`,action,input,async()=>{
        const {loaded,service,user}=await plan(),planned=await service.plan('save',input,user,await payloadHash(input));
        let sequence=Math.max(0,...loaded.data.registers.map(r=>r.sequence));const registers=[],marks=[],activity=loaded.a.activity_key;
        for(const {table,record:r} of planned.plan) {
          if(table==='ProgramAttendanceRegisters')registers.push({activity_key:activity,register_id:r.RegisterID,sequence:++sequence,attendance_date:r.AttendanceDate,publication_id:r.PublicationID,lesson_anchor:r.LessonAnchor,lesson_json:r.LessonJSON,learner_count:r.LearnerCount,submitted_at:r.SubmittedDate,submitted_by_account_id:auth.user.accountid,source_actor_id:auth.user.accountid,operation_id:input.operationId});
          if(table==='ProgramAttendanceMarks')marks.push({activity_key:activity,register_id:r.RegisterID,account_id:r.AccountID,display_name:r.DisplayName,status:r.Status});
        }
        return {data:loaded.data,statements:[...insertRecords(p,'attendance_registers',registers),...insertRecords(p,'attendance_marks',marks)],result:planned.result,fields:['Attendance']};
      });
      const {service,user}=await plan();
      if(action==='get')return {...await service.read(input.date,user),readOnly:Boolean(user.readOnlyPreview),store:'D1'};
      if(action==='recover')return {recovered:false};
      if(action==='prepare'){if(!auth.state.account.global_admin)throw managementError('Only a Global Admin can prepare storage.',403);return {prepared:true};}
      throw managementError('Unknown attendance action.',404);
    }
  };
}
