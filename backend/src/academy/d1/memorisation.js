import {managementError as fail,same} from './management-store.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {programToday} from '../../programs/weekly-timetable.js';

// Use current role evidence in reads AND inside guarded write transactions.
const rolesSQL=`SELECT account_id,activity_key,role FROM effective_activity_roles UNION
 SELECT e.account_id,e.activity_key,m.target_role role FROM legacy_access_evidence e
 JOIN role_import_reviews v ON v.account_id=e.account_id AND v.activity_key=e.activity_key AND v.source_value=e.source_role
 JOIN role_mapping_decisions m ON m.source_role=e.source_role WHERE e.source_effective=1 AND v.status='REQUIRED'`;
const adminSQL=`EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=? AND g.active=1 AND g.role='GLOBAL_ADMIN' AND g.review_state='CONFIRMED')`;
const studentSQL=`(EXISTS(SELECT 1 FROM (${rolesSQL}) r JOIN activities a USING(activity_key) WHERE r.account_id=? AND r.role='STUDENT' AND a.active=1 AND a.lifecycle='ACTIVE')
 OR EXISTS(SELECT 1 FROM effective_course_subscriptions s JOIN activities a USING(activity_key) WHERE s.account_id=? AND a.active=1 AND a.lifecycle='ACTIVE')
 OR EXISTS(SELECT 1 FROM course_settings s JOIN activities a USING(activity_key) WHERE s.legacy_access_model='FREE' AND a.active=1 AND a.lifecycle='ACTIVE'))`;
const classAccessSQL=`SELECT c.activity_key,c.class_id,c.name,a.name activity_name FROM classes c JOIN activities a USING(activity_key)
 WHERE c.active=1 AND a.active=1 AND a.lifecycle='ACTIVE' AND (${adminSQL} OR
 EXISTS(SELECT 1 FROM (${rolesSQL}) r WHERE r.account_id=? AND r.activity_key=c.activity_key AND
 (r.role='PROGRAM_ADMIN' OR r.role='TEACHER' AND (EXISTS(SELECT 1 FROM class_teacher_assignments t WHERE t.activity_key=c.activity_key AND t.class_id=c.class_id AND t.account_id=r.account_id)
 OR EXISTS(SELECT 1 FROM program_publication_state ps JOIN published_lesson_classes lc ON lc.activity_key=ps.activity_key AND lc.publication_id=ps.latest_publication_id
 JOIN published_lesson_teachers lt ON lt.activity_key=lc.activity_key AND lt.publication_id=lc.publication_id AND lt.lesson_anchor=lc.lesson_anchor
 WHERE lc.activity_key=c.activity_key AND lc.class_id=c.class_id AND lt.account_id=r.account_id)))))
 UNION SELECT a.activity_key,'COURSE',a.name,a.name FROM activities a WHERE a.kind='COURSE' AND a.active=1 AND a.lifecycle='ACTIVE'
 AND (${adminSQL} OR EXISTS(SELECT 1 FROM (${rolesSQL}) r WHERE r.account_id=? AND r.activity_key=a.activity_key AND r.role IN ('TEACHER','PROGRAM_ADMIN')))`;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const progressDTO=r=>({accountId:r.account_id,taskId:r.task_id,complete:Boolean(r.complete),confirmed:Boolean(r.confirmed),revision:r.revision,completedAt:r.completed_at,confirmedAt:r.confirmed_at});
const text=(v,max,label)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw fail(`Enter ${label} of up to ${max} characters.`);return v.trim();};

export function d1Memorisation(repository,auth) {
  const db=repository.db,p=(sql,...v)=>db.prepare(sql).bind(...v),actor=auth.user.accountid;
  const today=programToday('Africa/Johannesburg');
  const classes=async()=> (await p(classAccessSQL,actor,actor,actor,actor).all()).results;
  const isStudent=async()=>Boolean((!auth.state.account.global_admin||auth.state.roles.some(r=>r.role==='STUDENT')||auth.state.subscriptions.length)&&await p(`SELECT 1 ok WHERE ${studentSQL}`,actor,actor).first());
  async function catalogue(){
    let result;
    try{result=await db.batch([p('SELECT revision FROM memorisation_catalogue_state WHERE singleton=1'),
      p(`SELECT m.module_id,c.name,m.subject,m.level,m.sort_order FROM memorisation_modules m JOIN academy_module_catalogue c USING(module_id)
         JOIN subject_catalog s USING(subject_key) WHERE c.active=1 AND s.active=1 ORDER BY m.subject DESC,m.sort_order,c.name LIMIT 201`),
      p(`SELECT t.* FROM memorisation_tasks t JOIN memorisation_modules m USING(module_id) JOIN academy_module_catalogue c USING(module_id)
         JOIN subject_catalog s USING(subject_key) WHERE c.active=1 AND s.active=1 ORDER BY t.sort_order LIMIT 5001`)]);
    }catch(e){if(/no such table: memorisation_/.test(e.message))throw fail('Memorisation progress is being prepared. Please try again shortly.',503,'MEMORISATION_SCHEMA_REQUIRED');throw e;}
    if(!result[0].results.length)throw fail('Memorisation storage is unavailable.',503,'MEMORISATION_SCHEMA_REQUIRED');
    if(result[1].results.length>200||result[2].results.length>5000)throw fail('The memorisation catalogue needs to be split into smaller collections.',409);
    return {revision:result[0].results[0].revision,modules:result[1].results.map(m=>({id:m.module_id,name:m.name,subject:m.subject,level:m.level,
      tasks:result[2].results.filter(t=>same(t.module_id,m.module_id)).map(t=>({id:t.task_id,name:t.name}))}))};
  }
  function roster(scope,classId){
    return p(`SELECT DISTINCT a.account_id,a.display_name FROM accounts a WHERE a.active=1 AND
     (EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=? AND r.role='STUDENT')
       OR (?='COURSE' AND EXISTS(SELECT 1 FROM effective_course_subscriptions s WHERE s.account_id=a.account_id AND s.activity_key=?)))
     AND (?='COURSE' OR EXISTS(SELECT 1 FROM class_memberships m WHERE m.account_id=a.account_id AND m.activity_key=? AND m.class_id=? AND m.active=1
       AND (m.start_date IS NULL OR m.start_date<=?) AND (m.end_date IS NULL OR m.end_date>=?))) LIMIT 10001`,scope,classId,scope,classId,scope,classId,today,today);
  }
  async function requireClass(input){
    const found=(await classes()).find(c=>same(c.activity_key,input.activityKey)&&same(c.class_id,input.classId));
    if(!found)throw fail('Choose one of your authorised classes.',403,'FORBIDDEN');return found;
  }
  async function receipt(scope,input,hash){
    const r=await p("SELECT * FROM operation_receipts WHERE dataset_key='MEMORISATION' AND scope_key=? AND operation_id=?",scope,input.operationId).first();
    if(!r)return null;if(!same(r.actor_account_id,actor)||r.payload_sha256!==hash)throw fail('This retry identifier belongs to a different change.',409,'OPERATION_ID_REUSED');
    return {...JSON.parse(r.result_json),replayed:true};
  }
  async function change(action,input,scope,plan){
    if(!uuid.test(input.operationId||''))throw fail('This change needs its retry identifier.');
    const hash=await payloadHash({action,input});
    for(let attempt=0;attempt<3;attempt++){
      const saved=await receipt(scope,input,hash);if(saved)return saved;
      const version=await p('SELECT version FROM academy_write_state WHERE singleton=1').first();
      const {statements,result,authoritySQL,authorityValues,authority,fields}=await plan();
      const guard=crypto.randomUUID(),now=new Date().toISOString();
      try{
        await db.batch([p(`INSERT INTO academy_write_guards(guard_id,accepted) VALUES(?,
          (SELECT version=? FROM academy_write_state WHERE singleton=1) AND EXISTS(
           SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id)
           WHERE a.account_id=? AND a.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND c.credential_epoch=?
           AND s.session_id=? AND s.revoked_at IS NULL AND s.credential_epoch=c.credential_epoch AND s.expires_at>?) AND (${authoritySQL}))`,
          guard,version.version,actor,auth.state.account.credential_epoch,auth.sid,now,...authorityValues),...statements,
          p(`INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json) VALUES(?,?,?,?,?,?,?,?,?)`,
            crypto.randomUUID(),now,actor,authority,scope,action,'MEMORISATION',input.operationId,JSON.stringify(fields)),
          p("INSERT INTO operation_receipts(dataset_key,scope_key,operation_id,payload_sha256,result_json,actor_account_id,completed_at) VALUES('MEMORISATION',?,?,?,?,?,?)",scope,input.operationId,hash,JSON.stringify(result),actor,now),
          p('UPDATE academy_write_state SET version=version+1 WHERE singleton=1'),p('DELETE FROM academy_write_guards WHERE guard_id=?',guard)]);
        return result;
      }catch(e){
        const recovered=await receipt(scope,input,hash);if(recovered)return recovered;
        if(!/academy_management_stale/.test(e.message))throw e;
        if(!await repository.session(auth.sid,actor,auth.state.account.credential_epoch))throw fail('Your Academy session has ended.',401,'SESSION_ENDED');
        if(attempt===2)throw fail('Progress changed elsewhere. Refresh and review before saving.',409,'ROW_CHANGED');
      }
    }
  }
  async function save(action,input){
    const review=action==='confirm';
    if(!Array.isArray(input.updates)||!input.updates.length||input.updates.length>100)throw fail('Save between 1 and 100 task changes together.');
    const scope=review?`${input.activityKey}:${input.classId}`:`LEARNER:${actor}`;
    return change(action,input,scope,async()=>{
      const cat=await catalogue();if(input.catalogueRevision!==cat.revision)throw fail('The module list changed. Refresh before saving.',409,'CATALOGUE_CHANGED');
      if(review)await requireClass(input);else if(!await isStudent())throw fail('Memorisation marking is available to Academy students.',403,'FORBIDDEN');
      const members=review?(await roster(input.activityKey,input.classId).all()).results:null;
      const tasks=new Set(cat.modules.flatMap(m=>m.tasks.map(t=>t.id))),seen=new Set(),statements=[],records=[],rows=[],now=new Date().toISOString();
      if(input.updates.some(u=>!u||typeof u!=='object'||Array.isArray(u)))throw fail('A task change is invalid.');
      const targets=input.updates.map(u=>({accountId:review?u.accountId:actor,taskId:u.taskId}));
      const previous=(await p(`SELECT p.* FROM learner_task_progress p JOIN json_each(?) j ON p.account_id=json_extract(j.value,'$.accountId') AND p.task_id=json_extract(j.value,'$.taskId')`,JSON.stringify(targets)).all()).results;
      for(const u of input.updates){
        const account=review?members.find(m=>same(m.account_id,u.accountId))?.account_id:actor,key=`${account}:${u.taskId}`;
        if(!review&&u.accountId&&!same(u.accountId,actor))throw fail('You can mark only your own memorisation.',403,'FORBIDDEN');
        if(!tasks.has(u.taskId)||review&&!members.some(m=>same(m.account_id,account)))throw fail('Choose a current task and learner in this class.',403,'FORBIDDEN');
        if(seen.has(key))throw fail('A task occurs more than once in this save.');seen.add(key);
        if(!Number.isInteger(u.revision)||u.revision<0||typeof u[review?'confirmed':'complete']!=='boolean')throw fail('A task change is invalid.');
        const old=previous.find(r=>same(r.account_id,account)&&same(r.task_id,u.taskId));
        if((old?.revision||0)!==u.revision)throw fail('A task changed elsewhere. Refresh and review before saving.',409,'ROW_CHANGED');
        const complete=review?Boolean(old?.complete):u.complete,confirmed=review?u.confirmed:complete&&Boolean(old?.confirmed);
        if(confirmed&&!complete)throw fail('The learner must first mark this task as memorised.',409,'NOT_MEMORISED');
        const record={account_id:account,task_id:u.taskId,complete:Number(complete),confirmed:Number(confirmed),revision:u.revision+1,
          completed_at:complete?(old?.completed_at||now):null,confirmed_at:confirmed?(old?.confirmed_at||now):null,confirmed_by:confirmed?(old?.confirmed_by||actor):null,updated_at:now};
        rows.push(record);
        records.push(progressDTO(record));
      }
      statements.push(p(`INSERT INTO learner_task_progress(account_id,task_id,complete,confirmed,revision,completed_at,confirmed_at,confirmed_by,updated_at)
        SELECT json_extract(value,'$.account_id'),json_extract(value,'$.task_id'),json_extract(value,'$.complete'),json_extract(value,'$.confirmed'),json_extract(value,'$.revision'),
          json_extract(value,'$.completed_at'),json_extract(value,'$.confirmed_at'),json_extract(value,'$.confirmed_by'),json_extract(value,'$.updated_at') FROM json_each(?) WHERE 1
        ON CONFLICT(account_id,task_id) DO UPDATE SET complete=excluded.complete,confirmed=excluded.confirmed,revision=excluded.revision,completed_at=excluded.completed_at,confirmed_at=excluded.confirmed_at,confirmed_by=excluded.confirmed_by,updated_at=excluded.updated_at`,JSON.stringify(rows)));
      return {statements,result:{records,store:'D1'},authority:review?(auth.state.account.global_admin?'GLOBAL_ADMIN':auth.state.roles.some(r=>same(r.activity_key,input.activityKey)&&r.role==='PROGRAM_ADMIN')?'PROGRAM_ADMIN':'TEACHER'):'STUDENT',fields:records.map(r=>({accountId:r.accountId,taskId:r.taskId,complete:r.complete,confirmed:r.confirmed})),
        authoritySQL:review?`EXISTS(SELECT 1 FROM (${classAccessSQL}) x WHERE x.activity_key=? AND x.class_id=?)`:`${studentSQL}`,
        authorityValues:review?[actor,actor,actor,actor,input.activityKey,input.classId]:[actor,actor]};
    });
  }
  async function upload(input){
    if(!auth.state.account.global_admin)throw fail('Module uploads require a Global Admin.',403,'FORBIDDEN');
    return change('import',input,'ACADEMY',async()=>{
      const cat=await catalogue();if(input.catalogueRevision!==cat.revision)throw fail('The module list changed. Refresh before importing.',409,'CATALOGUE_CHANGED');
      if(!Array.isArray(input.modules)||!input.modules.length||input.modules.length>30||!['ADD','REPLACE'].includes(input.mode))throw fail('Upload 1 to 30 modules and choose an import option.');
      let taskCount=0;const seen=new Set(),statements=[],resultModules=[],moduleRows=[],taskRows=[],replaceIds=[];
      const subjects=(await p("SELECT subject_key,name FROM subject_catalog WHERE source_namespace='ACADEMY' AND lower(trim(name)) IN ('surahs','duas') AND active=1").all()).results;
      const existing=(await p(`SELECT c.*,EXISTS(SELECT 1 FROM memorisation_modules m WHERE m.module_id=c.module_id) registered
        FROM academy_module_catalogue c WHERE c.subject_key IN(SELECT value FROM json_each(?))
        AND c.name_key IN(SELECT lower(trim(json_extract(value,'$.name'))) FROM json_each(?))`,JSON.stringify(subjects.map(s=>s.subject_key)),JSON.stringify(input.modules)).all()).results;
      for(const m of input.modules){
        if(!m||typeof m!=='object'||Array.isArray(m))throw fail('A module is invalid.');
        const name=text(m.name,160,'a module name'),level=text(m.level,60,'a level'),subject=m.subject;
        if(!['SURAHS','DUAS'].includes(subject)||!Array.isArray(m.tasks)||!m.tasks.length||m.tasks.length>100)throw fail('Each module needs a subject and between 1 and 100 tasks.');
        taskCount+=m.tasks.length;if(taskCount>500)throw fail('Upload at most 500 tasks together.');
        const key=`${subject}:${name.toLowerCase()}`;if(seen.has(key))throw fail('A module occurs more than once in this upload.');seen.add(key);
        const subjectRow=subjects.find(s=>s.name.trim().toUpperCase()===subject);
        if(!subjectRow)throw fail(`Create the ${subject==='SURAHS'?'Surahs':'Duas'} Subject in Subjects & Modules before importing.`,409);
        const current=existing.find(c=>same(c.subject_key,subjectRow.subject_key)&&c.name_key===name.toLowerCase()),registered=current?.registered;
        if(registered&&input.mode!=='REPLACE')throw fail(`${name} already exists. Choose Replace matching modules to reset its task list.`,409,'MODULE_EXISTS');
        const id=current?.module_id||'AM-'+crypto.randomUUID();
        if(registered)replaceIds.push(id);
        moduleRows.push({id,subjectKey:subjectRow.subject_key,name,nameKey:name.toLowerCase(),subject,level,sortOrder:cat.modules.findIndex(m=>m.id===id)>=0?cat.modules.findIndex(m=>m.id===id):cat.modules.length+resultModules.length});
        const names=new Set();m.tasks.forEach((t,i)=>{const task=text(t,240,'a task name');if(names.has(task.toLowerCase()))throw fail(`Repeated task in ${name}: ${task}`);names.add(task.toLowerCase());taskRows.push({id:'MT-'+crypto.randomUUID(),moduleId:id,name:task,sortOrder:i});});
        resultModules.push({id,name,tasks:m.tasks.length});
      }
      if(cat.modules.length+resultModules.filter(m=>!cat.modules.some(c=>c.id===m.id)).length>200)throw fail('Keep the catalogue within 200 modules.');
      const retained=cat.modules.filter(m=>!resultModules.some(r=>r.id===m.id)).reduce((n,m)=>n+m.tasks.length,0);
      if(retained+taskCount>5000)throw fail('Keep the memorisation catalogue within 5,000 tasks.');
      statements.push(
        p(`INSERT INTO academy_module_catalogue(module_id,subject_key,name,name_key,active,revision)
          SELECT json_extract(value,'$.id'),json_extract(value,'$.subjectKey'),json_extract(value,'$.name'),json_extract(value,'$.nameKey'),1,1 FROM json_each(?) WHERE 1
          ON CONFLICT(module_id) DO UPDATE SET active=1,revision=revision+CASE WHEN active=0 THEN 1 ELSE 0 END`,JSON.stringify(moduleRows)),
        p(`DELETE FROM learner_task_progress WHERE task_id IN(SELECT task_id FROM memorisation_tasks WHERE module_id IN(SELECT value FROM json_each(?)))`,JSON.stringify(replaceIds)),
        p('DELETE FROM memorisation_tasks WHERE module_id IN(SELECT value FROM json_each(?))',JSON.stringify(replaceIds)),
        p(`INSERT INTO memorisation_modules(module_id,subject,level,sort_order) SELECT json_extract(value,'$.id'),json_extract(value,'$.subject'),json_extract(value,'$.level'),json_extract(value,'$.sortOrder') FROM json_each(?) WHERE 1
          ON CONFLICT(module_id) DO UPDATE SET subject=excluded.subject,level=excluded.level`,JSON.stringify(moduleRows)),
        p(`INSERT INTO memorisation_tasks(task_id,module_id,name,sort_order) SELECT json_extract(value,'$.id'),json_extract(value,'$.moduleId'),json_extract(value,'$.name'),json_extract(value,'$.sortOrder') FROM json_each(?)`,JSON.stringify(taskRows)));
      statements.push(p('UPDATE memorisation_catalogue_state SET revision=revision+1 WHERE singleton=1'));
      return {statements,result:{modules:resultModules,catalogueRevision:cat.revision+1,store:'D1'},authoritySQL:adminSQL,authorityValues:[actor],authority:'GLOBAL_ADMIN',fields:['MemorisationModules',input.mode]};
    });
  }
  return {async run(action,input){
    if(['mark','confirm'].includes(action))return save(action,input);
    if(action==='import')return upload(input);
    const cat=await catalogue();
    if(action==='get'){
      const student=await isStudent(),groups=await classes();
      if(!student&&!groups.length&&!auth.state.account.global_admin)throw fail('Progress is available to Academy students and their teaching teams.',403,'FORBIDDEN');
      return {...cat,accountId:actor,student,canImport:Boolean(auth.state.account.global_admin),classes:groups.map(c=>({activityKey:c.activity_key,id:c.class_id,name:c.name,activityName:c.activity_name})),
        records:student?(await p('SELECT * FROM learner_task_progress WHERE account_id=?',actor).all()).results.map(progressDTO):[],store:'D1'};
    }
    if(action==='grid'){
      await requireClass(input);const module=cat.modules.find(m=>m.id===input.moduleId);if(!module)throw fail('Choose a memorisation module.',404);
      const offset=Number(input.offset||0);if(!Number.isInteger(offset)||offset<0||offset>10000)throw fail('Choose a valid class page.');
      const members=(await roster(input.activityKey,input.classId).all()).results.sort((a,b)=>a.display_name.localeCompare(b.display_name));
      if(members.length>10000)throw fail('This class is too large. Split it into smaller classes before using the grid.',409);
      const page=members.slice(offset,offset+20),ids=JSON.stringify(page.map(a=>a.account_id));
      const records=(await p(`SELECT p.* FROM learner_task_progress p JOIN memorisation_tasks t USING(task_id) WHERE t.module_id=? AND p.account_id IN(SELECT value FROM json_each(?))`,module.id,ids).all()).results;
      return {catalogueRevision:cat.revision,module,learners:page.map(a=>({id:a.account_id,name:a.display_name})),records:records.map(progressDTO),offset,total:members.length,store:'D1'};
    }
    throw fail('Unknown memorisation action.',404);
  }};
}
