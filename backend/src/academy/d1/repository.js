import {calendarFacts,holidaySettings} from './published-facts-cache.js';
import {monthlyRightsSQL} from './monthly-media-policy.js';
import {personalLinksEstablished} from './personal-links.js';
import {publishedSettings} from './published-settings.js';
import {permissionState,verifiedPermissionVersion} from './permission-state.js';
import {emptyCompatibilityDatabase} from '../separation/compatibility.js';
import {emptyShapes} from '../separation/empty-shapes.js';
import {splitClient} from '../separation/client.js';
import {actorProof,verifyActor,verifyActorVersion} from '../separation/proof.js';
import {snapshotKeys,snapshotSchemaKey} from '../separation/snapshot-revisions.js';
import { authorityRank, normalizePlatformIdentifier as key } from '../../lib/platform-schema.js';
import {CORE_ACTIVATION_CHECKS,newActivityOwnership} from './activation-policy.js';
import {programAccessJoin,programAccessSQL} from './program-access.js';
import {programZoomJoin} from './program-zoom.js';
import {publicationTeacherAccountsSQL} from './publication-teachers.js';

export const rehearsalError = (message, status=503, code='ACADEMY_D1_UNAVAILABLE') => Object.assign(new Error(message), {status,code});
const publicAccount = row => ({AccountID:row.account_id,DisplayName:row.display_name,UniqueID:row.login_link_id,Active:Boolean(row.active),PlatformRole:row.global_admin?'GLOBAL_ADMIN':''});

// One primary-anchored session per HTTP request. Never cache account permissions,
// credentials or database handles in module-level request state.
export function academyD1Repository(env) {
  if (!['local','development'].includes(env.ENVIRONMENT) || !['REHEARSAL','ACTIVE'].includes(env.ACADEMY_D1_MODE) || !env.ACADEMY_DB)
    throw rehearsalError('Academy database rehearsal is not enabled.');
  if(env.ACADEMY_D1_MODE==='ACTIVE'&&(!String(env.ACADEMY_D1_RUN_ID||'').trim()||env.ACADEMY_LIBRARY_MODE!=='PUBLIC_ONLY'))
    throw rehearsalError('Academy activation configuration is incomplete.',503,'ACTIVATION_REQUIRED');
  const split=env.ACADEMY_DB_GENERATION==='SPLIT_V1';
  if(split&&!env.ACADEMY_ADMIN_DB)throw rehearsalError('The Admin database binding is required.',503,'SPLIT_BINDING_REQUIRED');
  const raw=env.ACADEMY_DB.withSession('first-primary'),compatible=split?emptyCompatibilityDatabase(raw,emptyShapes,{currentGrants:true}):raw;
  const adminRaw=split?env.ACADEMY_ADMIN_DB.withSession('first-primary'):null;
  const client=split?splitClient(env,compatible,adminRaw):null,db=client?.core||compatible;
  const privateSnapshots=split&&env.LESSON_MEDIA_BUCKET?{
    bucket:env.LESSON_MEDIA_BUCKET,namespace:[env.ENVIRONMENT,env.ACADEMY_D1_RUN_ID],
    async revision(auth,previous,kind){
      const keys=snapshotKeys(kind,auth.user.accountid),rows=(await raw.prepare('SELECT setting_key,setting_value FROM academy_settings WHERE setting_key IN(SELECT value FROM json_each(?)) ORDER BY setting_key').bind(JSON.stringify(keys)).all()).results;
      if(rows.find(r=>r.setting_key===snapshotSchemaKey)?.setting_value!=='1')return {enabled:false};
      const proof=actorProof(auth),verified=previous?.core??verifiedPermissionVersion(auth.authority||auth.state,proof.signature);
      const core=await (Number.isInteger(verified)?verifyActorVersion(compatible,proof,verified):verifyActor(compatible,proof));
      // Admin dashboards retain editable draft semantics; published readers
      // reuse snapshots through unrelated attendance, marking and note writes.
      const source=(auth.workspace==='ADMIN'&&kind!=='timetable-source')||keys.length===1?core:rows;
      return {enabled:true,core,source};
    }
  }:null;
  const prepare=(sql,...values)=>db.prepare(sql).bind(...values);
  const configurationNamespace=[env.ENVIRONMENT,env.ACADEMY_D1_RUN_ID,env.ACADEMY_DB_GENERATION];
  let schemas,activation;
  async function schemaNames(){
    if(split)return ['role_mapping_decisions','effective_course_subscriptions'];
    schemas??=prepare("SELECT name FROM sqlite_schema WHERE name IN ('role_mapping_decisions','effective_course_subscriptions') AND type IN ('table','view')").all();
    return (await schemas).results.map(r=>r.name);
  }
  async function subscriptionSource(){
    return (await schemaNames()).includes('effective_course_subscriptions')?'effective_course_subscriptions':"(SELECT account_id,activity_key FROM legacy_access_evidence WHERE source_role='LEGACY_SUBSCRIPTION' AND source_effective=1)";
  }
  const activityColumns=env.ACADEMY_ACCEPTED_SETUP==='1'?`a.activity_key,a.activity_id,a.kind,COALESCE((SELECT json_extract(r.value,'$.name') FROM setup_head_state h JOIN setup_head_components v ON v.head_id=h.head_id AND v.table_name='activities' JOIN setup_components c USING(component_id) JOIN json_each(c.rows_json) r WHERE h.singleton=1 AND json_extract(r.value,'$.activity_key')=a.activity_key COLLATE NOCASE LIMIT 1),'Learning area') AS name,a.active,a.lifecycle,a.website_visible,a.created_at,a.updated_at,a.revision`:'a.*';
  const accountSQL=`SELECT a.*,c.pin_hash,c.pin_setup,c.credential_epoch,
    ${env.ACADEMY_LEARNING_OPERATIONS==='3'?`(SELECT json_group_array(json_object('id',g.assignment_id,'activityKey',g.activity_key)) FROM attendance_substitutes g JOIN activities area USING(activity_key) WHERE g.account_id=a.account_id AND area.active=1 AND area.lifecycle='ACTIVE' AND g.revoked_at IS NULL AND g.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND max(g.correction_until,coalesce(g.correction_reopen_until,''))>strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS substitute_grants,`:''}
    EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED') AS global_admin
    FROM accounts a JOIN account_credentials c ON c.account_id=a.account_id`;
  async function stateFor(where,values) {
    const mapped=(await schemaNames()).includes('role_mapping_decisions');
    const subscriptionsTable=await subscriptionSource();
    const target=`(SELECT a.account_id FROM accounts a JOIN account_credentials c USING(account_id) WHERE ${where})`;
    const results=await db.batch([
      prepare(`${accountSQL} WHERE ${where}`,...values),
      prepare(`SELECT ${activityColumns},cs.legacy_access_model,cs.policy_review_state FROM activities a LEFT JOIN course_settings cs USING(activity_key)
        WHERE a.active=1 AND a.lifecycle='ACTIVE' AND a.kind IN ('PROGRAM','COURSE')`),
      prepare(`SELECT r.activity_key,r.role FROM effective_activity_roles r JOIN activities a USING(activity_key)
        WHERE r.account_id=${target} AND a.active=1 AND a.lifecycle='ACTIVE'
        UNION SELECT e.activity_key,${mapped?'m.target_role':'e.source_role'} AS role FROM legacy_access_evidence e
        JOIN activities a USING(activity_key) JOIN role_import_reviews v ON v.account_id=e.account_id AND v.activity_key=e.activity_key AND v.source_value=e.source_role
        ${mapped?'JOIN role_mapping_decisions m ON m.source_role=e.source_role':''}
        WHERE e.account_id=${target} AND e.source_role IN ('ADMIN','SENIOR') AND e.source_effective=1 AND v.status='REQUIRED' AND a.active=1 AND a.lifecycle='ACTIVE'`,...values,...values),
      prepare(`SELECT activity_key FROM ${subscriptionsTable} WHERE account_id=${target}`,...values)
    ]);
    const [accounts,activities,roles,subscriptions]=results.map(r=>r.results),account=accounts[0];
    if(!account)return null;
    const monthlyMedia=env.ACADEMY_MONTHLY_SUBSCRIPTIONS==='1'?(await prepare(monthlyRightsSQL('?'),account.account_id).all()).results:[];
    const contexts=[];
    if(account.global_admin)contexts.push({scope:'PLATFORM',courseId:'',courseName:'M4L Platform',role:'GLOBAL_ADMIN'});
    for(const activity of activities.filter(a=>a.kind==='PROGRAM')) {
      if(account.global_admin)continue;
      const assigned=roles.filter(r=>key(r.activity_key)===key(activity.activity_key)).map(r=>r.role);
      // Mapping requires the explicit owner-approved decision records. Older
      // three-migration imports keep their original isolated compatibility view.
      for(const role of [...new Set(assigned)].filter(r=>['PROGRAM_ADMIN','ADMIN','SENIOR','TEACHER','STUDENT'].includes(r)))
        contexts.push({scope:'COURSE',courseId:activity.activity_id,courseName:activity.name,role,programLibrary:true});
    }
    if(!account.global_admin)for(const activity of activities.filter(a=>a.kind==='COURSE')) {
      for(const role of [...new Set(roles.filter(r=>key(r.activity_key)===key(activity.activity_key)).map(r=>r.role))].filter(r=>['PROGRAM_ADMIN','TEACHER','STUDENT'].includes(r)))
        contexts.push({scope:'GLOBAL',courseId:activity.activity_id,courseName:activity.name,role,activityKind:'COURSE'});
    }
    for(const grant of JSON.parse(account.substitute_grants||'[]')){const area=activities.find(a=>key(a.activity_key)===key(grant.activityKey));if(area)contexts.push({scope:'SUBSTITUTE',courseId:grant.id,courseName:area.name,role:'SUBSTITUTE',activityKey:area.activity_key});}
    if(!account.global_admin)for(const activity of activities.filter(a=>a.kind==='PROGRAM'&&monthlyMedia.some(g=>key(g.activity_key)===key(a.activity_key)))){
      if(!contexts.some(c=>c.scope==='COURSE'&&key(c.courseId)===key(activity.activity_id)&&c.role==='STUDENT'))contexts.push({scope:'COURSE',courseId:activity.activity_id,courseName:activity.name,role:'MEDIA_READER',mediaOnly:true});
    }
    const rank=role=>role==='PROGRAM_ADMIN'?1:authorityRank(role);
    contexts.sort((a,b)=>rank(a.role)-rank(b.role)||a.courseName.localeCompare(b.courseName)||a.role.localeCompare(b.role));
    if(!account.global_admin&&activities.some(a=>a.kind==='COURSE'&&(a.legacy_access_model==='FREE'||subscriptions.some(s=>key(s.activity_key)===key(a.activity_key)))))
      contexts.push({scope:'GLOBAL',courseId:'',courseName:'Global Subjects',role:'STUDENT'});
    const myLinksAvailable=env.ACADEMY_MEDIA_SEPARATION==='1'&&Boolean(account.global_admin||roles.some(r=>['TEACHER','PROGRAM_ADMIN'].includes(r.role))||!contexts.length&&await personalLinksEstablished(env,account.account_id));
    if(myLinksAvailable&&!contexts.length)contexts.push({scope:'OWN_LIBRARY',courseId:'',courseName:'My links',role:'LIBRARY_OWNER'});
    return {account,activities,roles,subscriptions,contexts,myLinksAvailable,monthlyMedia,monthlyMediaEnabled:env.ACADEMY_MONTHLY_SUBSCRIPTIONS==='1'};
  }
  function audit(actor,target,action,fields,conditional=false) {
    return prepare(`INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json)
      SELECT ?,?,?,?,?,?,?,?,? ${conditional?'WHERE changes()=1':''}`,crypto.randomUUID(),new Date().toISOString(),actor,env.ACADEMY_D1_MODE==='ACTIVE'?'D1_ACCOUNT':'D1_REHEARSAL','ACADEMY',action,'USER_ACCOUNT',target,JSON.stringify(fields));
  }
  return {
    publishedFactsSource:{db:raw,namespace:configurationNamespace,requests:new Map(),versionSQL:split?'(SELECT version FROM split_read_state WHERE singleton=1)':'(SELECT version FROM academy_write_state WHERE singleton=1)'},
    privateSnapshots,recordingEnv:{ACADEMY_OBJECT_NAMESPACE:env.ACADEMY_OBJECT_NAMESPACE},
    bindActor:auth=>client?.bindActor(auth),
    authoringRepository(){return client?{...this,db:client.admin}:this;},
    db,coreDb:db,adminDb:split?env.ACADEMY_ADMIN_DB.withSession('first-primary'):null,setup:{enabled:env.ACADEMY_ACCEPTED_SETUP==='1'},features:{weeklyAbsentees:env.ACADEMY_WEEKLY_ABSENTEES==='1',monthlySubscriptions:env.ACADEMY_MONTHLY_SUBSCRIPTIONS==='1',nativeAttendance:env.ACADEMY_LEARNING_OPERATIONS==='3',mediaSeparation:env.ACADEMY_MEDIA_SEPARATION==='1',splitDatabases:split},
    ownershipForNewActivity:activity=>newActivityOwnership(activity,env),
    subscriptionSource,
    publicAccount,
    async publishedConfiguration(head){
      const settings=await publishedSettings(raw,configurationNamespace,head);if(!settings)return null;
      const live=await raw.prepare("SELECT setting_value FROM academy_settings WHERE setting_key='PersonalMemorisationCards'").first();
      return {...settings,memorisation_cards:live?.setting_value==='0'?'0':settings.memorisation_cards};
    },
    async homeConfiguration(){
      if(activation)return {setting_value:activation.timezone,courseWorkflows:true,programWorkspace:activation.program_workspace==='1',memorisationCards:activation.memorisation_cards==='1'};
      return prepare("SELECT setting_value,(SELECT setting_value FROM academy_settings WHERE setting_key='ProgramWorkspace') AS program_workspace,(SELECT setting_value FROM academy_settings WHERE setting_key='PersonalMemorisationCards') AS memorisation_cards FROM academy_settings WHERE setting_key='PlatformTimezone'").first().then(r=>r?{...r,programWorkspace:r.program_workspace==='1',memorisationCards:r.memorisation_cards==='1'}:null);
    },
    async ready(){
      if(split){
        // Readiness uses only Core facts. Core's settings are already the same
        // values selected by its federation; no Admin/settings capture is needed.
        const result=await raw.prepare(`SELECT generation,source_digest,1 mapped_roles,
          (SELECT setting_value FROM academy_settings WHERE setting_key='ProgramWorkspace') program_workspace,
          (SELECT setting_value FROM academy_settings WHERE setting_key='PersonalMemorisationCards') memorisation_cards,
          (SELECT head_id FROM setup_head_state WHERE singleton=1) accepted_head
          FROM split_deployment_state WHERE singleton=1 AND generation='SPLIT_V1' AND state='READY' AND source_digest=?
          AND EXISTS(SELECT 1 FROM setup_head_state) AND EXISTS(SELECT 1 FROM accounts WHERE active=1)
          AND EXISTS(SELECT 1 FROM global_role_assignments WHERE active=1 AND role='GLOBAL_ADMIN' AND review_state='CONFIRMED')`).bind(env.ACADEMY_D1_RUN_ID).first();
        if(!result)throw rehearsalError('The fresh databases have not completed their verified preparation.',503,'SPLIT_PREPARATION_REQUIRED');
        activation={...result,timezone:(await publishedSettings(raw,configurationNamespace,result.accepted_head))?.setting_value??null};return;
      }
      if(env.ACADEMY_D1_MODE==='ACTIVE') {
        // WHERE 0 validates that required schema objects compile without scanning
        // sqlite_schema or subscription rows. All live ownership/evidence guards remain.
        const result=await prepare(`SELECT m.run_id,
          1 AS mapped_roles,(SELECT setting_value FROM academy_settings WHERE setting_key='ProgramWorkspace') AS program_workspace,(SELECT setting_value FROM academy_settings WHERE setting_key='PersonalMemorisationCards') AS memorisation_cards,
          ${env.ACADEMY_ACCEPTED_SETUP==='1'?`(SELECT head_id FROM setup_head_state WHERE singleton=1) AS accepted_head`:`(SELECT setting_value FROM academy_settings WHERE setting_key='PlatformTimezone') AS timezone`} FROM migration_runs m
          JOIN learning_imports l ON l.base_run_id=m.run_id AND l.singleton=1 AND l.source_sha256=m.source_snapshot_sha256
          JOIN course_workflow_imports c ON c.base_run_id=m.run_id AND c.singleton=1 AND c.source_sha256=m.source_snapshot_sha256
          WHERE m.run_id=? AND m.state='CUTOVER' AND m.environment IN ('LOCAL','DEVELOPMENT')
            AND EXISTS(SELECT 1 FROM academy_write_state WHERE singleton=1)
            AND (SELECT count(*) FROM role_mapping_decisions WHERE 0)=0
            AND (SELECT count(*) FROM effective_course_subscriptions WHERE 0)=0
            AND (SELECT count(*) FROM migration_checks WHERE run_id=m.run_id AND dataset_key='ACTIVATION' AND scope_key='ACADEMY'
              AND check_name IN (SELECT value FROM json_each(?)) AND status='PASS' AND findings_count=0 AND checked_at IS NOT NULL)=?
            AND NOT EXISTS(SELECT 1 FROM migration_checks WHERE run_id=m.run_id AND status='FAIL')
            AND EXISTS(SELECT 1 FROM activities)
            AND NOT EXISTS(SELECT 1 FROM activities a LEFT JOIN data_ownership o ON o.dataset_key='ACADEMY' AND o.scope_key=a.activity_key
              WHERE o.scope_key IS NULL OR o.authoritative_store<>'D1' OR o.phase<>'ACTIVE' OR o.verified_run_id<>m.run_id OR o.switched_at IS NULL)
            AND NOT EXISTS(SELECT 1 FROM data_ownership o WHERE o.dataset_key='ACADEMY' AND
              (o.authoritative_store<>'D1' OR o.phase<>'ACTIVE' OR o.verified_run_id<>m.run_id OR o.switched_at IS NULL))`,
          env.ACADEMY_D1_RUN_ID,JSON.stringify(CORE_ACTIVATION_CHECKS),CORE_ACTIVATION_CHECKS.length).first();
        if(!result)throw rehearsalError('Academy activation has not been verified.',503,'ACTIVATION_REQUIRED');
        // Reuse only facts verified in THIS request. Never retain readiness,
        // account permissions or subscriptions across requests.
        activation={...result,...(env.ACADEMY_ACCEPTED_SETUP==='1'?{timezone:(await publishedSettings(raw,configurationNamespace,result.accepted_head))?.setting_value??null}:{})};
        schemas=Promise.resolve({results:[...(result.mapped_roles?[{name:'role_mapping_decisions'}]:[]),{name:'effective_course_subscriptions'}]});
        return;
      }
      const result=await prepare(`SELECT run_id FROM migration_runs WHERE state='IMPORTED' AND environment IN ('LOCAL','DEVELOPMENT')
        AND NOT EXISTS (SELECT 1 FROM activities a LEFT JOIN data_ownership o
          ON o.dataset_key='ACADEMY' AND o.scope_key=a.activity_key
          WHERE a.active=1 AND (o.scope_key IS NULL OR o.authoritative_store<>'SHEETS' OR o.phase<>'STAGING'))`).first();
      if(!result)throw rehearsalError('A development import is required.');
    },
    async accountByLogin(login){const account=await prepare(`${accountSQL} WHERE a.login_link_id=? COLLATE NOCASE`,login).first();return account?{account}:null;},
    async byLogin(login){return stateFor('a.login_link_id=? COLLATE NOCASE',[login]);},
    async byId(accountId){return stateFor('a.account_id=? COLLATE NOCASE',[accountId]);},
    async createSession(state,context,now=new Date()) {
      const sid=crypto.randomUUID(),created=now.toISOString(),expires=new Date(now.getTime()+7*86400000).toISOString();
      const result=await db.batch([
        prepare(`UPDATE accounts SET last_login_at=? WHERE account_id=? AND active=1 AND EXISTS(SELECT 1 FROM account_credentials WHERE account_id=? AND credential_epoch=?)`,created,state.account.account_id,state.account.account_id,state.account.credential_epoch),
        prepare(`INSERT INTO account_sessions(session_id,account_id,credential_epoch,created_at,expires_at)
          SELECT ?,a.account_id,c.credential_epoch,?,? FROM accounts a JOIN account_credentials c USING(account_id)
          WHERE a.account_id=? AND a.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND c.credential_epoch=? RETURNING session_id`,sid,created,expires,state.account.account_id,state.account.credential_epoch)
      ]);
      if(result[1].results?.length!==1||result[1].results[0].session_id!==sid)throw rehearsalError('Account changed. Please sign in again.',401,'SESSION_ENDED');
      return {sid,expires,context};
    },
    async session(sid,accountId,epoch,now=new Date()) {
      const where=`a.account_id=? AND a.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND c.credential_epoch=?
        AND EXISTS(SELECT 1 FROM account_sessions s WHERE s.session_id=? AND s.account_id=a.account_id AND s.credential_epoch=c.credential_epoch
          AND s.revoked_at IS NULL AND s.expires_at>?)`,values=[accountId,epoch,sid,now.toISOString()],load=()=>stateFor(where,values);
      if(!split||!env.LESSON_MEDIA_BUCKET)return load();
      const started=Date.now(),gate=async()=>{
        const current=(await raw.prepare(`WITH current_actor AS (${accountSQL} WHERE ${where}) SELECT a.*,
          (SELECT head_id FROM setup_head_state WHERE singleton=1) cache_head,
          (SELECT version FROM split_read_state WHERE singleton=1) cache_core,
          (SELECT setting_value FROM academy_settings WHERE setting_key='${snapshotSchemaKey}') cache_schema,
          (SELECT json_group_array(json_object('key',setting_key,'value',setting_value)) FROM (SELECT setting_key,setting_value FROM academy_settings WHERE setting_key IN(SELECT value FROM json_each(?)) ORDER BY setting_key)) cache_revisions
          FROM current_actor a`).bind(accountId,epoch,sid,new Date(now.getTime()+Date.now()-started).toISOString(),JSON.stringify(snapshotKeys('permissions',accountId))).all()).results[0];
        if(!current)return null;
        const {cache_head,cache_core,cache_schema,cache_revisions,...account}=current;
        return {enabled:cache_schema==='1',core:cache_core,account,revision:JSON.stringify([cache_head,cache_revisions,account.global_admin,account.credential_epoch,account.substitute_grants||'[]',env.ACADEMY_MEDIA_SEPARATION])};
      };
      return permissionState({bucket:env.LESSON_MEDIA_BUCKET,namespace:[env.ENVIRONMENT,env.ACADEMY_D1_RUN_ID,env.ACADEMY_MONTHLY_SUBSCRIPTIONS==='1'?'MONTHLY_V1':'DEFAULT'],accountId,gate,load,now:now.getTime()});
    },
    async revoke(sid,accountId){await prepare('UPDATE account_sessions SET revoked_at=? WHERE session_id=? AND account_id=?',new Date().toISOString(),sid,accountId).run();},
    async setCredential(state,newHash,action,actor=state.account.account_id) {
      const row=state.account;
      const result=await db.batch([
        prepare(`UPDATE account_credentials SET pin_hash=?,pin_setup=?,credential_epoch=credential_epoch+1,updated_at=?
          WHERE account_id=? AND credential_epoch=? AND pin_hash IS ? AND pin_setup=?
          AND EXISTS(SELECT 1 FROM accounts WHERE account_id=? AND active=1) RETURNING account_id`,newHash,Number(Boolean(newHash)),new Date().toISOString(),row.account_id,row.credential_epoch,row.pin_hash,row.pin_setup,row.account_id),
        audit(actor,row.account_id,action,['AuthenticationCredential'],true)
      ]);
      // D1 counts trigger writes in meta.changes. RETURNING identifies the
      // credential row actually updated, independent of durable sync triggers.
      if(result[0].results?.length!==1||result[0].results[0].account_id!==row.account_id)throw rehearsalError('Account changed. Please refresh and try again.',409,'ACCOUNT_CHANGED');
      return this.byId(row.account_id);
    },
    async homeData(state,start,end,courseWorkflows=false,programWorkspace=false,includeCalendar=true) {
      const readDb=this.db,readPrepare=(sql,...values)=>readDb.prepare(sql).bind(...values);
      // Private curriculum is needed only for learning areas this account can
      // access. Anonymous previews need class destinations only for free joining.
      const privateKeys=state?[...new Set([
        ...(state.account.global_admin?state.activities.map(a=>a.activity_key):state.roles.map(r=>r.activity_key)),
        ...state.activities.filter(a=>a.kind==='COURSE'&&(a.legacy_access_model==='FREE'||state.subscriptions.some(s=>key(s.activity_key)===key(a.activity_key)))).map(a=>a.activity_key)
      ])]:[];
      const privateScope=JSON.stringify(privateKeys);
      const staffScope=JSON.stringify(state?.roles.filter(r=>['PROGRAM_ADMIN','ADMIN','SENIOR','TEACHER'].includes(r.role)).map(r=>r.activity_key)||[]);
      const classScope=state?`c.activity_key IN (SELECT value FROM json_each(?))`:
        `c.activity_key IN (SELECT a.activity_key FROM activities a ${programAccessJoin} WHERE a.kind='PROGRAM' AND a.active=1 AND a.lifecycle='ACTIVE' AND a.website_visible=1 AND ${programAccessSQL}='FREE')`;
      const queries=[
        `SELECT a.*,p.timezone,p.duration_years,(SELECT setting_value FROM academy_settings WHERE setting_key='CourseWebsitePublished:'||upper(a.activity_key)) AS course_website_available,(SELECT setting_value FROM academy_settings WHERE setting_key='AcademyCoursePublicCard:'||upper(a.activity_key)) AS course_public_card_json${programWorkspace?`,p.public_card_json,CASE WHEN a.kind<>'COURSE' THEN 1
          WHEN EXISTS(SELECT 1 FROM course_management_drafts d WHERE d.activity_key=a.activity_key AND d.stage NOT IN ('CANCELLED','ARCHIVED')) THEN 1
          WHEN EXISTS(SELECT 1 FROM course_runs r LEFT JOIN course_management_drafts d USING(activity_key,run_id) LEFT JOIN course_run_state s USING(activity_key,run_id) WHERE r.activity_key=a.activity_key AND r.active=1 AND d.run_id IS NULL AND coalesce(s.stage,'DRAFT') NOT IN ('CANCELLED','ARCHIVED')) THEN 1
          WHEN NOT EXISTS(SELECT 1 FROM course_management_drafts d WHERE d.activity_key=a.activity_key) AND NOT EXISTS(SELECT 1 FROM course_runs r WHERE r.activity_key=a.activity_key) THEN 1 ELSE 0 END AS course_menu_available`:''},cs.legacy_access_model,${programAccessSQL} AS program_access_model,pz.setting_value AS program_zoom_override FROM activities a LEFT JOIN program_settings p USING(activity_key) LEFT JOIN course_settings cs USING(activity_key) ${programAccessJoin} ${programZoomJoin} WHERE a.active=1 AND a.lifecycle='ACTIVE' AND (a.website_visible=1 OR ?=1 OR a.activity_key IN (SELECT value FROM json_each(?)))`,
        `SELECT p.*${state?`,${publicationTeacherAccountsSQL} AS teacher_accounts_json`:''} FROM timetable_publications p JOIN activities a USING(activity_key) WHERE a.active=1 AND a.lifecycle='ACTIVE' AND (p.pattern='COURSE' OR ((p.effective_from IS NULL OR p.effective_from<=?) AND (p.effective_until IS NULL OR p.effective_until>=?)))`,
        `SELECT p.*,s.subject_id,s.name AS subject_name FROM program_subjects p JOIN subject_catalog s USING(subject_key) WHERE p.active=1 AND s.active=1 AND p.activity_key IN (SELECT value FROM json_each(?))`,
        `SELECT * FROM modules WHERE active=1 AND activity_key IN (SELECT value FROM json_each(?))`,
        `SELECT c.* FROM classes c WHERE c.active=1 AND ${classScope}`,
        `SELECT * FROM class_memberships WHERE account_id=?`,
        `SELECT r.*${courseWorkflows?',ca.access_model AS run_access_model':''} FROM course_runs r JOIN activities a USING(activity_key) ${courseWorkflows?'JOIN course_run_access ca USING(activity_key,run_id)':''} WHERE r.active=1 AND a.active=1 AND a.lifecycle='ACTIVE'`,
        `SELECT s.* FROM course_run_state s JOIN course_runs r USING(activity_key,run_id) WHERE r.active=1`,
        `SELECT * FROM lesson_lifecycle`,
      ];
      const results=await readDb.batch(queries.map((sql,i)=>i===0?readPrepare(sql,Number(Boolean(state?.account.global_admin)),staffScope):i===1?readPrepare(sql,end,start):[2,3].includes(i)||i===4&&state?readPrepare(sql,privateScope):i===5?readPrepare(sql,state?.account.account_id || ''):readPrepare(sql)));
      const rows=results.map(r=>r.results);
      if(courseWorkflows&&includeCalendar){const facts=await calendarFacts(this);rows.push(facts.calendar,facts.suppressions,holidaySettings(facts));}
      return rows;
    }
  };
}
