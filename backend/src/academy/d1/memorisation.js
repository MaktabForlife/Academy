import {managementError as fail,same} from './management-store.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {programToday} from '../../programs/weekly-timetable.js';
import {isAdminWorkspace,actualState,actualRole,administers} from './workspace-access.js';

// Use current role evidence in reads AND inside guarded write transactions.
const rolesSQL=`SELECT account_id,activity_key,role FROM effective_activity_roles UNION
 SELECT e.account_id,e.activity_key,m.target_role role FROM legacy_access_evidence e
 JOIN role_import_reviews v ON v.account_id=e.account_id AND v.activity_key=e.activity_key AND v.source_value=e.source_role
 JOIN role_mapping_decisions m ON m.source_role=e.source_role WHERE e.source_effective=1 AND v.status='REQUIRED'`;
const adminSQL=`EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=? AND g.active=1 AND g.role='GLOBAL_ADMIN' AND g.review_state='CONFIRMED')`;
const studentSQL=`EXISTS(SELECT 1 FROM accounts a WHERE a.account_id=? AND a.active=1) AND NOT EXISTS(SELECT 1 FROM memorisation_account_settings s WHERE s.account_id=? AND s.active=0)`;
const classAccessSQL=`SELECT c.activity_key,c.class_id,c.name,a.name activity_name,coalesce((SELECT learners_per_card FROM memorisation_activity_settings z WHERE z.activity_key=c.activity_key),20) learners_per_card FROM classes c JOIN activities a USING(activity_key)
 WHERE a.kind='PROGRAM' AND NOT EXISTS(SELECT 1 FROM memorisation_activity_settings z WHERE z.activity_key=a.activity_key AND z.active=0) AND c.active=1 AND a.active=1 AND a.lifecycle='ACTIVE' AND (${adminSQL} OR
 EXISTS(SELECT 1 FROM (${rolesSQL}) r WHERE r.account_id=? AND r.activity_key=c.activity_key AND
 (r.role='PROGRAM_ADMIN' OR r.role='TEACHER' AND (EXISTS(SELECT 1 FROM class_teacher_assignments t WHERE t.activity_key=c.activity_key AND t.class_id=c.class_id AND t.account_id=r.account_id)
 OR EXISTS(SELECT 1 FROM program_publication_state ps JOIN published_lesson_classes lc ON lc.activity_key=ps.activity_key AND lc.publication_id=ps.latest_publication_id
 JOIN published_lesson_teachers lt ON lt.activity_key=lc.activity_key AND lt.publication_id=lc.publication_id AND lt.lesson_anchor=lc.lesson_anchor
 WHERE lc.activity_key=c.activity_key AND lc.class_id=c.class_id AND lt.account_id=r.account_id)))))`;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const progressDTO=r=>({accountId:r.account_id,taskId:r.task_id,complete:Boolean(r.complete),confirmed:Boolean(r.confirmed),revision:r.revision,completedAt:r.completed_at,confirmedAt:r.confirmed_at});
const text=(v,max,label)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw fail(`Enter ${label} of up to ${max} characters.`);return v.trim();};

async function memorisationCatalogue(db){
  const p=(sql,...v)=>db.prepare(sql).bind(...v);
    let result;
    let legacy=false;
    try{result=await db.batch([p('SELECT revision FROM memorisation_catalogue_state WHERE singleton=1'),
      p(`SELECT set_id module_id,name,subject,level,sort_order FROM memorisation_sets WHERE active=1 ORDER BY subject DESC,sort_order,name LIMIT 201`),
      p(`SELECT t.* FROM memorisation_tasks t JOIN memorisation_sets s ON s.set_id=t.module_id WHERE s.active=1 ORDER BY t.sort_order LIMIT 5001`),
      p('SELECT set_id module_id,activity_key FROM memorisation_set_activities')]);
    }catch(e){
      // Rolling upgrade: reads work with the previous schema until migration 0019.
      if(!/no such table: memorisation_sets\b/.test(e.message)){
        if(/no such table: memorisation_/.test(e.message))throw fail('Memorisation progress is being prepared. Please try again shortly.',503,'MEMORISATION_SCHEMA_REQUIRED');throw e;
      }
      legacy=true;
      result=await db.batch([p('SELECT revision FROM memorisation_catalogue_state WHERE singleton=1'),
        p(`SELECT m.module_id,c.name,m.subject,m.level,m.sort_order FROM memorisation_modules m JOIN academy_module_catalogue c USING(module_id)
          JOIN subject_catalog s USING(subject_key) WHERE c.active=1 AND s.active=1 ORDER BY m.subject DESC,m.sort_order,c.name LIMIT 201`),
        p(`SELECT t.* FROM memorisation_tasks t JOIN memorisation_modules m USING(module_id) JOIN academy_module_catalogue c USING(module_id)
          JOIN subject_catalog s USING(subject_key) WHERE c.active=1 AND s.active=1 ORDER BY t.sort_order LIMIT 5001`),p('SELECT module_id,activity_key FROM memorisation_module_activities')]);
    }
    if(!result[0].results.length)throw fail('Memorisation storage is unavailable.',503,'MEMORISATION_SCHEMA_REQUIRED');
    if(result[1].results.length>200||result[2].results.length>5000)throw fail('The memorisation catalogue needs to be split into smaller collections.',409);
    return {legacy,revision:result[0].results[0].revision,modules:result[1].results.map(m=>({id:m.module_id,name:m.name,subject:m.subject,level:m.level,activityKeys:result[3].results.filter(a=>same(a.module_id,m.module_id)).map(a=>a.activity_key),
      tasks:result[2].results.filter(t=>same(t.module_id,m.module_id)).map(t=>({id:t.task_id,name:t.name}))}))};
  }

const moduleInActivity=(m,activity)=>!m.activityKeys.length||m.activityKeys.some(k=>same(k,activity));
const moduleForUser=(m,allowed)=>!m.activityKeys.length||allowed===null||m.activityKeys.some(k=>allowed.some(a=>same(a,k)));
export async function d1MemorisationPreview(repository){
  const cat=await memorisationCatalogue(repository.db),modules=cat.modules.filter(m=>!m.activityKeys.length).map(({activityKeys,...m})=>m);
  return {sets:modules,modules,visitor:true,accountId:'VISITOR',student:true,personalActive:true,canImport:false,classes:[],records:[],store:'PREVIEW'};
}

export function d1Memorisation(repository,auth) {
  const db=repository.db,p=(sql,...v)=>db.prepare(sql).bind(...v),actor=auth.user.accountid;
  const today=programToday('Africa/Johannesburg');
  const classes=async(preview=false)=>{
    const sql=isAdminWorkspace(auth)||auth.adminView&&auth.workspace==='TEACH'?classAccessSQL:classAccessSQL.replace(adminSQL,'? IS NULL').replace("r.role='PROGRAM_ADMIN'",'0');
    const own=(await p(sql,actor,actor).all()).results.filter(c=>!auth.adminView||administers(auth,c.activity_key));
    if(!preview||isAdminWorkspace(auth)||!auth.adminView)return own;
    const real=actualState(auth),keys=real.roles.filter(r=>r.role==='PROGRAM_ADMIN').map(r=>r.activity_key);
    const extra=(await p(`SELECT c.activity_key,c.class_id,c.name,a.name activity_name,coalesce(s.learners_per_card,20) learners_per_card FROM classes c JOIN activities a USING(activity_key) LEFT JOIN memorisation_activity_settings s USING(activity_key) WHERE c.active=1 AND a.active=1 AND a.lifecycle='ACTIVE' AND coalesce(s.active,1)=1 AND (?=1 OR c.activity_key IN(SELECT value FROM json_each(?)))`,Number(Boolean(real.account.global_admin)),JSON.stringify(keys)).all()).results;
    return [...new Map([...own,...extra].map(r=>[r.activity_key+':'+r.class_id,r])).values()];
  };
  const isStudent=async()=>Boolean(await p(`SELECT 1 ok WHERE ${studentSQL}`,actor,actor).first());
  const catalogue=()=>memorisationCatalogue(db);
  async function accessibleActivities(){
    if(auth.state.account.global_admin)return null;
    const rows=(await p(`SELECT a.activity_key FROM activities a WHERE a.active=1 AND a.lifecycle='ACTIVE' AND a.kind IN ('PROGRAM','COURSE') AND
      (EXISTS(SELECT 1 FROM (${rolesSQL}) r WHERE r.account_id=? AND r.activity_key=a.activity_key)
      OR EXISTS(SELECT 1 FROM effective_course_subscriptions s WHERE s.account_id=? AND s.activity_key=a.activity_key))`,actor,actor).all()).results.map(a=>a.activity_key);
    return isAdminWorkspace(auth)?rows:actualState(auth).activities.filter(a=>administers(auth,a.activity_key)||actualRole(auth,a.activity_key,auth.workspace==='TEACH'?'TEACHER':'STUDENT')||auth.workspace==='LEARN'&&auth.state.subscriptions.some(s=>same(s.activity_key,a.activity_key))).map(a=>a.activity_key);
  }
  let activityChoices;
  async function activityOptions(){return activityChoices ||= (async()=> (await p(`SELECT a.activity_key,a.kind,a.name,coalesce(s.active,1) progress_active,coalesce(s.revision,0) revision,coalesce(s.learners_per_card,20) learners_per_card FROM activities a LEFT JOIN memorisation_activity_settings s USING(activity_key)
    WHERE a.kind IN ('PROGRAM','COURSE') AND a.active=1 AND a.lifecycle='ACTIVE' ORDER BY a.kind DESC,a.name`).all()).results.map(a=>({id:a.activity_key,kind:a.kind,name:a.name,active:Boolean(a.progress_active),revision:a.revision,learnersPerCard:a.learners_per_card})))();}
  async function assignments(value,fallback=[]){
    const keys=value===undefined?fallback:value;
    if(!Array.isArray(keys)||keys.length>200||keys.some(k=>typeof k!=='string'||k.length>200)||new Set(keys.map(k=>k.toUpperCase())).size!==keys.length)throw fail('Choose valid Programs or Courses for this set.');
    const choices=await activityOptions();return keys.map(k=>{const a=choices.find(a=>same(a.id,k));if(!a)throw fail('Choose a current Program or Course.');return a.id;});
  }
  function assignmentStatements(moduleId,keys){return [p('DELETE FROM memorisation_set_activities WHERE set_id=?',moduleId),p(`INSERT INTO memorisation_set_activities(set_id,activity_key) SELECT ?,value FROM json_each(?)`,moduleId,JSON.stringify(keys))];}
  function roster(scope,classId){
    return p(`SELECT DISTINCT a.account_id,a.display_name FROM accounts a WHERE a.active=1 AND
     (EXISTS(SELECT 1 FROM (${rolesSQL}) r WHERE r.account_id=a.account_id AND r.activity_key=? AND r.role='STUDENT')
       OR EXISTS(SELECT 1 FROM effective_course_subscriptions s WHERE s.account_id=a.account_id AND s.activity_key=?))
     AND (?='COURSE' OR EXISTS(SELECT 1 FROM class_memberships m WHERE m.account_id=a.account_id AND m.activity_key=? AND m.class_id=? AND m.active=1
       AND (m.start_date IS NULL OR m.start_date<=?) AND (m.end_date IS NULL OR m.end_date>=?))) LIMIT 10001`,scope,scope,classId,scope,classId,today,today);
  }
  async function classCounts(groups){
    if(!groups.length)return [];
    return (await p(`SELECT m.activity_key,m.class_id,count(DISTINCT a.account_id) total FROM class_memberships m JOIN accounts a USING(account_id)
      JOIN json_each(?) j ON m.activity_key=json_extract(j.value,'$.activity_key') AND m.class_id=json_extract(j.value,'$.class_id')
      WHERE a.active=1 AND m.active=1 AND (m.start_date IS NULL OR m.start_date<=?) AND (m.end_date IS NULL OR m.end_date>=?)
      AND EXISTS(SELECT 1 FROM (${rolesSQL}) r WHERE r.account_id=a.account_id AND r.activity_key=m.activity_key AND r.role='STUDENT') GROUP BY m.activity_key,m.class_id`,JSON.stringify(groups),today,today).all()).results;
  }
  async function requireClass(input,preview=false){
    const found=(await classes(preview)).find(c=>same(c.activity_key,input.activityKey)&&same(c.class_id,input.classId));
    if(!found)throw fail('Choose one of your authorised classes.',403,'FORBIDDEN');return found;
  }
  async function receipt(scope,input,hash){
    const r=await p("SELECT * FROM operation_receipts WHERE dataset_key='MEMORISATION' AND scope_key=? AND operation_id=?",scope,input.operationId).first();
    if(!r)return null;if(!same(r.actor_account_id,actor)||r.payload_sha256!==hash)throw fail('This retry identifier belongs to a different change.',409,'OPERATION_ID_REUSED');
    return {...JSON.parse(r.result_json),replayed:true};
  }
  async function change(action,input,scope,plan){
    if(!isAdminWorkspace(auth)&&action==='confirm')await requireClass(input);
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
    if(review&&!isAdminWorkspace(auth))await requireClass(input);
    if(!Array.isArray(input.updates)||!input.updates.length||input.updates.length>100)throw fail('Save between 1 and 100 task changes together.');
    const scope=review?`${input.activityKey}:${input.classId}`:`LEARNER:${actor}`;
    return change(action,input,scope,async()=>{
      const cat=await catalogue();if(input.catalogueRevision!==cat.revision)throw fail('The set list changed. Refresh before saving.',409,'CATALOGUE_CHANGED');
      if(review)await requireClass(input);else if(!await isStudent())throw fail('Your personal memorisation card is inactive.',403,'FORBIDDEN');
      const members=review?(await roster(input.activityKey,input.classId).all()).results:null;
      const allowed=review?null:await accessibleActivities();
      const tasks=new Set(cat.modules.filter(m=>review?moduleInActivity(m,input.activityKey):moduleForUser(m,allowed)).flatMap(m=>m.tasks.map(t=>t.id))),seen=new Set(),statements=[],records=[],rows=[],now=new Date().toISOString();
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
        const complete=review?Boolean(old?.complete):u.complete,confirmed=review?u.confirmed:Boolean(old?.confirmed);
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
        authoritySQL:review?`EXISTS(SELECT 1 FROM (${isAdminWorkspace(auth)||auth.adminView&&auth.workspace==='TEACH'?classAccessSQL:classAccessSQL.replace(adminSQL,'? IS NULL').replace("r.role='PROGRAM_ADMIN'",'0')}) x WHERE x.activity_key=? AND x.class_id=?)`:`${studentSQL}`,
        authorityValues:review?[actor,actor,input.activityKey,input.classId]:[actor,actor]};
    });
  }
  async function upload(input){
    if(!auth.state.account.global_admin)throw fail('Set uploads require a Global Admin.',403,'FORBIDDEN');
    return change('import',input,'ACADEMY',async()=>{
      const cat=await catalogue();if(input.catalogueRevision!==cat.revision)throw fail('The set list changed. Refresh before importing.',409,'CATALOGUE_CHANGED');
      const imported=input.sets??input.modules;
      if(!Array.isArray(imported)||!imported.length||imported.length>30||!['ADD','REPLACE'].includes(input.mode))throw fail('Upload 1 to 30 sets and choose an import option.');
      let taskCount=0;const seen=new Set(),statements=[],resultModules=[],moduleRows=[],taskRows=[],replaceIds=[],accessRows=[];
      if(cat.legacy)throw fail('The set catalogue is being prepared. Please try again shortly.',503,'MEMORISATION_SCHEMA_REQUIRED');
      const existing=(await p(`SELECT set_id module_id,name_key,subject FROM memorisation_sets
        WHERE name_key IN(SELECT lower(trim(json_extract(value,'$.name'))) FROM json_each(?))`,JSON.stringify(imported)).all()).results;
      for(const m of imported){
        if(!m||typeof m!=='object'||Array.isArray(m))throw fail('A set is invalid.');
        const name=text(m.name,160,'a set name'),level=text(m.level,60,'a level'),subject=m.subject;
        if(!['SURAHS','DUAS'].includes(subject)||!Array.isArray(m.tasks)||!m.tasks.length||m.tasks.length>100)throw fail('Each set needs a subject and between 1 and 100 tasks.');
        taskCount+=m.tasks.length;if(taskCount>500)throw fail('Upload at most 500 tasks together.');
        const key=`${subject}:${name.toLowerCase()}`;if(seen.has(key))throw fail('A set occurs more than once in this upload.');seen.add(key);
        const current=existing.find(c=>c.subject===subject&&c.name_key===name.toLowerCase()),registered=Boolean(current);
        if(registered&&input.mode!=='REPLACE')throw fail(`${name} already exists. Choose Replace matching sets to reset its item list.`,409,'MODULE_EXISTS');
        const id=current?.module_id||'MS-'+crypto.randomUUID();
        const access=await assignments(m.activityKeys,cat.modules.find(m=>m.id===id)?.activityKeys||[]);accessRows.push(...access.map(activityKey=>({moduleId:id,activityKey})));
        if(registered)replaceIds.push(id);
        moduleRows.push({id,name,nameKey:name.toLowerCase(),subject,level,sortOrder:cat.modules.findIndex(m=>m.id===id)>=0?cat.modules.findIndex(m=>m.id===id):cat.modules.length+resultModules.length});
        const names=new Set();m.tasks.forEach((t,i)=>{const task=text(t,240,'a task name');if(names.has(task.toLowerCase()))throw fail(`Repeated task in ${name}: ${task}`);names.add(task.toLowerCase());taskRows.push({id:'MT-'+crypto.randomUUID(),moduleId:id,name:task,sortOrder:i});});
        resultModules.push({id,name,tasks:m.tasks.length});
      }
      if(cat.modules.length+resultModules.filter(m=>!cat.modules.some(c=>c.id===m.id)).length>200)throw fail('Keep the catalogue within 200 sets.');
      const retained=cat.modules.filter(m=>!resultModules.some(r=>r.id===m.id)).reduce((n,m)=>n+m.tasks.length,0);
      if(retained+taskCount>5000)throw fail('Keep the memorisation catalogue within 5,000 tasks.');
      statements.push(
        p(`DELETE FROM learner_task_progress WHERE task_id IN(SELECT task_id FROM memorisation_tasks WHERE module_id IN(SELECT value FROM json_each(?)))`,JSON.stringify(replaceIds)),
        p('DELETE FROM memorisation_tasks WHERE module_id IN(SELECT value FROM json_each(?))',JSON.stringify(replaceIds)),
        p(`INSERT INTO memorisation_sets(set_id,name,name_key,subject,level,sort_order,active,revision)
          SELECT json_extract(value,'$.id'),json_extract(value,'$.name'),json_extract(value,'$.nameKey'),json_extract(value,'$.subject'),json_extract(value,'$.level'),json_extract(value,'$.sortOrder'),1,1 FROM json_each(?) WHERE 1
          ON CONFLICT(set_id) DO UPDATE SET name=excluded.name,name_key=excluded.name_key,subject=excluded.subject,level=excluded.level,active=1,revision=revision+1`,JSON.stringify(moduleRows)),
        p(`INSERT INTO memorisation_tasks(task_id,module_id,name,sort_order) SELECT json_extract(value,'$.id'),json_extract(value,'$.moduleId'),json_extract(value,'$.name'),json_extract(value,'$.sortOrder') FROM json_each(?)`,JSON.stringify(taskRows)));
      statements.push(p(`DELETE FROM memorisation_set_activities WHERE set_id IN(SELECT json_extract(value,'$.id') FROM json_each(?))`,JSON.stringify(moduleRows)),p(`INSERT INTO memorisation_set_activities(set_id,activity_key) SELECT json_extract(value,'$.moduleId'),json_extract(value,'$.activityKey') FROM json_each(?)`,JSON.stringify(accessRows)),p('UPDATE memorisation_catalogue_state SET revision=revision+1 WHERE singleton=1'));
      return {statements,result:{sets:resultModules,modules:resultModules,catalogueRevision:cat.revision+1,store:'D1'},authoritySQL:adminSQL,authorityValues:[actor],authority:'GLOBAL_ADMIN',fields:['MemorisationSets',input.mode]};
    });
  }
  async function editModule(input){
    if(!auth.state.account.global_admin)throw fail('Shared set editing requires a Global Admin.',403,'FORBIDDEN');
    return change('module-save',input,'ACADEMY',async()=>{
      const cat=await catalogue();if(input.catalogueRevision!==cat.revision)throw fail('The set list changed. Refresh and review your edits.',409,'CATALOGUE_CHANGED');
      const old=input.moduleId?cat.modules.find(m=>same(m.id,input.moduleId)):null;
      if(input.moduleId&&!old)throw fail('This set is no longer available.',409,'MODULE_CHANGED');
      const activityKeys=await assignments(input.activityKeys,old?.activityKeys||[]);
      const name=text(input.name,160,'a set name'),level=text(input.level,60,'a level'),subject=input.subject;
      if(!['SURAHS','DUAS'].includes(subject)||!Array.isArray(input.tasks)||!input.tasks.length||input.tasks.length>100)throw fail('Choose a subject and include 1 to 100 items.');
      if(cat.legacy)throw fail('The set catalogue is being prepared. Please try again shortly.',503,'MEMORISATION_SCHEMA_REQUIRED');
      const id=old?.id||'MS-'+crypto.randomUUID(),collision=await p('SELECT set_id FROM memorisation_sets WHERE subject=? AND name_key=? AND set_id<>?',subject,name.toLowerCase(),id).first();
      if(collision)throw fail('A set with this name already exists in this subject.',409,'MODULE_EXISTS');
      if(!old&&cat.modules.length>=200)throw fail('Keep the catalogue within 200 sets.');
      const used=new Set(),rows=input.tasks.map((t,i)=>{
        if(!t||typeof t!=='object')throw fail('An item is invalid.');
        if(t.id&&(!old?.tasks.some(o=>o.id===t.id)||used.has(t.id)))throw fail('An edited item is invalid.');
        if(t.id)used.add(t.id);
        const target=t.moduleId||id;if(target!==id&&!cat.modules.some(m=>m.id===target))throw fail('Choose a current destination set.');
        return {id:t.id||'MT-'+crypto.randomUUID(),moduleId:target,name:text(t.name,240,'an item name'),sortOrder:target===id?i:(cat.modules.find(m=>m.id===target)?.tasks.length||0)+i};
      });
      const removed=(old?.tasks||[]).filter(t=>!used.has(t.id)).map(t=>t.id);
      if(removed.length&&!input.confirmRemoval)throw fail('Confirm the removal of these items and their saved progress.');
      const remaining=cat.modules.flatMap(m=>m.tasks.filter(t=>m.id!==id).map(t=>({id:t.id,moduleId:m.id,name:t.name}))).concat(rows),names=new Set();
      for(const t of remaining){const k=t.moduleId+':'+t.name.toLowerCase();if(names.has(k))throw fail('An item name is repeated in its destination set.');names.add(k);}
      if(remaining.length>5000)throw fail('Keep the catalogue within 5,000 items.');
      for(const target of new Set(rows.map(t=>t.moduleId)))if(remaining.filter(t=>t.moduleId===target).length>100)throw fail('Keep each set within 100 items.');
      if(!rows.some(t=>t.moduleId===id))throw fail('Keep at least one item in this set.');
      const statements=[p(`INSERT INTO memorisation_sets(set_id,name,name_key,subject,level,sort_order,active,revision) VALUES(?,?,?,?,?,?,1,1)
        ON CONFLICT(set_id) DO UPDATE SET name=excluded.name,name_key=excluded.name_key,subject=excluded.subject,level=excluded.level,revision=revision+1`,id,name,name.toLowerCase(),subject,level,old?cat.modules.findIndex(m=>m.id===id):cat.modules.length),
        p('DELETE FROM learner_task_progress WHERE task_id IN(SELECT value FROM json_each(?))',JSON.stringify(removed)),
        p('DELETE FROM memorisation_tasks WHERE task_id IN(SELECT value FROM json_each(?))',JSON.stringify(removed)),
        p("UPDATE memorisation_tasks SET name='__editing_'||task_id WHERE task_id IN(SELECT value FROM json_each(?))",JSON.stringify([...used])),
        p(`INSERT INTO memorisation_tasks(task_id,module_id,name,sort_order) SELECT json_extract(value,'$.id'),json_extract(value,'$.moduleId'),json_extract(value,'$.name'),json_extract(value,'$.sortOrder') FROM json_each(?) WHERE 1
          ON CONFLICT(task_id) DO UPDATE SET module_id=excluded.module_id,name=excluded.name,sort_order=excluded.sort_order`,JSON.stringify(rows)),
        ...assignmentStatements(id,activityKeys),p('UPDATE memorisation_catalogue_state SET revision=revision+1 WHERE singleton=1')];
      return {statements,result:{setId:id,moduleId:id,catalogueRevision:cat.revision+1,removed:removed.length,store:'D1'},authoritySQL:adminSQL,authorityValues:[actor],authority:'GLOBAL_ADMIN',fields:['SetName','Subject','Level','Tasks','SetAccess']};
    });
  }
  async function userCards(input){
    if(!auth.state.account.global_admin)throw fail('User card controls require a Global Admin.',403,'FORBIDDEN');
    const query=String(input.query||'').trim();if(query.length>80)throw fail('Search using up to 80 characters.');
    const offset=Number(input.offset||0);if(!Number.isInteger(offset)||offset<0||offset>100000)throw fail('Choose a valid user page.');
    const term='%'+query.replace(/[\\%_]/g,c=>'\\'+c)+'%';
    const filter="(a.display_name LIKE ? ESCAPE '\\' OR a.login_link_id LIKE ? ESCAPE '\\')";
    const result=await db.batch([p(`SELECT count(*) total FROM accounts a WHERE ${filter}`,term,term),p(`SELECT a.account_id,a.display_name,a.login_link_id,a.active account_active,coalesce(s.active,1) card_active,coalesce(s.revision,0) revision,
      EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.active=1 AND g.review_state='CONFIRMED') global_admin,
      (SELECT group_concat(DISTINCT r.role) FROM (${rolesSQL}) r WHERE r.account_id=a.account_id) roles
      FROM accounts a LEFT JOIN memorisation_account_settings s USING(account_id) WHERE ${filter} ORDER BY a.display_name,a.account_id LIMIT 20 OFFSET ?`,term,term,offset)]);
    return {users:result[1].results.map(a=>({id:a.account_id,name:a.display_name,loginId:a.login_link_id,accountActive:Boolean(a.account_active),active:Boolean(a.card_active),revision:a.revision,roles:a.global_admin?['GLOBAL_ADMIN']:(a.roles||'').split(',').filter(Boolean)})),offset,total:result[0].results[0].total,store:'D1'};
  }
  async function setCard(input){
    if(!auth.state.account.global_admin)throw fail('User card controls require a Global Admin.',403,'FORBIDDEN');
    return change('card-active',input,'ACADEMY',async()=>{
      if(typeof input.active!=='boolean'||!Number.isInteger(input.revision)||input.revision<0)throw fail('Choose a valid card setting.');
      const account=await p('SELECT account_id FROM accounts WHERE account_id=?',text(input.accountId,160,'an account')).first();if(!account)throw fail('This user is unavailable.',404);
      const old=await p('SELECT revision FROM memorisation_account_settings WHERE account_id=?',account.account_id).first();if((old?.revision||0)!==input.revision)throw fail('This card changed elsewhere. Refresh and review.',409,'ROW_CHANGED');
      const statements=[p(`INSERT INTO memorisation_account_settings(account_id,active,revision,updated_at,updated_by) VALUES(?,?,?,?,?)
        ON CONFLICT(account_id) DO UPDATE SET active=excluded.active,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,account.account_id,Number(input.active),input.revision+1,new Date().toISOString(),actor)];
      return {statements,result:{accountId:account.account_id,active:input.active,revision:input.revision+1,store:'D1'},authoritySQL:adminSQL,authorityValues:[actor],authority:'GLOBAL_ADMIN',fields:['PersonalMemorisationCardActive']};
    });
  }
  async function setActivity(input){
    if(!auth.state.account.global_admin)throw fail('Learning area controls require a Global Admin.',403,'FORBIDDEN');
    return change('activity-active',input,'ACADEMY',async()=>{
      if(typeof input.active!=='boolean'||!Number.isInteger(input.revision)||input.revision<0)throw fail('Choose a valid learning area setting.');
      const activity=(await activityOptions()).find(a=>same(a.id,input.activityKey));if(!activity)throw fail('Choose a current Program or Course.',404);
      const limit=input.learnersPerCard??activity.learnersPerCard;if(!Number.isInteger(limit)||limit<5||limit>50)throw fail('Show between 5 and 50 learners per class card.');
      if(activity.revision!==input.revision)throw fail('This learning area changed elsewhere. Refresh and review.',409,'ROW_CHANGED');
      return {statements:[p(`INSERT INTO memorisation_activity_settings(activity_key,active,revision,updated_at,updated_by,learners_per_card) VALUES(?,?,?,?,?,?)
        ON CONFLICT(activity_key) DO UPDATE SET active=excluded.active,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by,learners_per_card=excluded.learners_per_card`,activity.id,Number(input.active),input.revision+1,new Date().toISOString(),actor,limit)],
        result:{learnersPerCard:limit,activityKey:activity.id,active:input.active,revision:input.revision+1,store:'D1'},authoritySQL:adminSQL,authorityValues:[actor],authority:'GLOBAL_ADMIN',fields:['ClassProgressActive','LearnersPerCard']};
    });
  }
  return {async run(action,input){
    if(action==='activity-active')return setActivity(input);
    if(action==='module-save'||action==='set-save')return editModule(input);
    if(action==='cards')return userCards(input);
    if(action==='card-active')return setCard(input);
    if(['mark','confirm'].includes(action))return save(action,input);
    if(action==='import')return upload(input);
    const cat=await catalogue();
    if(action==='get'){
      const view=input.view||'self';if(!['self','teach','admin'].includes(view))throw fail('Choose a Surahs and Duas page.');
      const activityKey=input.activityKey||'';if(typeof activityKey!=='string'||activityKey.length>200)throw fail('Choose a valid learning area.');
      if(auth.adminView&&activityKey&&!administers(auth,activityKey))throw fail('This area is outside your Admin view.',403,'FORBIDDEN');
      const student=!auth.adminView&&!auth.classView&&await isStudent(),setting=await p('SELECT active FROM memorisation_account_settings WHERE account_id=?',actor).first();
      const scopedAdmins=(await p(`SELECT DISTINCT r.activity_key FROM (${rolesSQL}) r JOIN activities a USING(activity_key)
        WHERE r.account_id=? AND r.role='PROGRAM_ADMIN' AND a.active=1 AND a.lifecycle='ACTIVE'`,actor).all()).results;
      const canAdmin=isAdminWorkspace(auth)&&Boolean(auth.state.account.global_admin||scopedAdmins.some(a=>activityKey?same(a.activity_key,activityKey):input.kind==='COURSE'?a.activity_key.startsWith('COURSE:'):true));
      if(view==='admin'&&!canAdmin)throw fail('Set administration requires an authorised administrator.',403,'FORBIDDEN');
      const groups=view==='teach'?(await classes(true)).filter(c=>activityKey?same(c.activity_key,activityKey):input.kind==='COURSE'?c.activity_key.startsWith('COURSE:'):true).sort((a,b)=>a.name.localeCompare(b.name)):[];
      if(!auth.adminView&&!auth.classView&&!student&&!groups.length&&!auth.state.account.global_admin&&setting?.active!==0&&view!=='admin')throw fail('Progress is available to Academy students and their teaching teams.',403,'FORBIDDEN');
      const allowed=await accessibleActivities(),visible=cat.modules.filter(m=>view==='admin'&&auth.state.account.global_admin?true:view==='teach'?groups.some(c=>moduleInActivity(m,c.activity_key)):auth.classView?moduleInActivity(m,auth.classView.activityKey):moduleForUser(m,allowed));
      const visibleTasks=new Set(visible.flatMap(m=>m.tasks.map(t=>t.id))),counts=await classCounts(groups);
      return {revision:cat.revision,sets:visible,modules:visible,...(view==='admin'&&auth.state.account.global_admin?{activities:await activityOptions()}:{}),accountId:actor,student,readOnly:Boolean(auth.adminView&&auth.workspace==='LEARN'),personalActive:auth.adminView||setting?.active!==0,canImport:view==='admin'&&Boolean(auth.state.account.global_admin),classes:groups.map(c=>({activityKey:c.activity_key,id:c.class_id,name:c.name,activityName:c.activity_name,learnersPerCard:c.learners_per_card,learnerCount:counts.find(n=>same(n.activity_key,c.activity_key)&&same(n.class_id,c.class_id))?.total||0})),
        records:view==='self'&&student?(await p('SELECT * FROM learner_task_progress WHERE account_id=?',actor).all()).results.filter(r=>visibleTasks.has(r.task_id)).map(progressDTO):[],store:'D1'};
    }
    if(action==='grid'){
      const classInfo=await requireClass(input,true);const module=cat.modules.find(m=>m.id===input.moduleId&&moduleInActivity(m,input.activityKey));if(!module)throw fail('Choose a memorisation set.',404);
      const offset=Number(input.offset||0);if(!Number.isInteger(offset)||offset<0||offset>10000)throw fail('Choose a valid class page.');
      const members=(await roster(input.activityKey,input.classId).all()).results.sort((a,b)=>a.display_name.localeCompare(b.display_name));
      if(members.length>10000)throw fail('This class is too large. Split it into smaller classes before using the grid.',409);
      const pageSize=classInfo.learners_per_card,page=members.slice(offset,offset+pageSize),ids=JSON.stringify(page.map(a=>a.account_id));
      const records=(await p(`SELECT p.* FROM learner_task_progress p JOIN memorisation_tasks t USING(task_id) WHERE t.module_id=? AND p.account_id IN(SELECT value FROM json_each(?))`,module.id,ids).all()).results;
      return {catalogueRevision:cat.revision,set:module,module,learners:page.map(a=>({id:a.account_id,name:a.display_name})),records:records.map(progressDTO),readOnly:!isAdminWorkspace(auth)&&!(await classes()).some(c=>same(c.activity_key,input.activityKey)&&same(c.class_id,input.classId)),pageSize,offset,total:members.length,store:'D1'};
    }
    throw fail('Unknown memorisation action.',404);
  }};
}
