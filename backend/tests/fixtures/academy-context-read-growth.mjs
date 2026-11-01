import {seedRecordedOptions} from './academy-recorded-context-fixture.mjs';
export const seedContextReadGrowth=(f,growth=0)=>{
 seedRecordedOptions(f);f.db.exec("DELETE FROM modules WHERE module_id LIKE 'inactive%';DELETE FROM program_subjects WHERE program_subject_id='inactive-subject';DELETE FROM subject_catalog WHERE subject_id='inactive-subject';");
 const other=f.scopes.programB;
 for(let n=0;n<growth;n++){
  const id='unrelated-'+n;
  const extra='PROGRAM:read-growth-'+n;f.db.prepare("INSERT INTO activities(activity_key,activity_id,kind,name,active,lifecycle,website_visible) VALUES(?,?,'PROGRAM',?,1,'ACTIVE',1)").run(extra,extra.slice(8),extra);f.db.prepare("INSERT INTO program_settings(activity_key,timezone) VALUES(?,'Africa/Johannesburg')").run(extra);f.db.prepare("INSERT INTO classes(activity_key,class_id,name,active) VALUES(?,?,?,1)").run(extra,id,id);f.db.prepare("INSERT INTO data_ownership(dataset_key,scope_key,authoritative_store,phase,revision) VALUES('ACADEMY',?,'SHEETS','STAGING',1)").run(extra);
  f.db.prepare("INSERT INTO operation_receipts(dataset_key,scope_key,operation_id,payload_sha256,result_json,actor_account_id,completed_at) VALUES('LESSON_MEDIA',?,?,?,'{}',?,'2026-11-01')").run(f.scopes.programA,crypto.randomUUID(),'0'.repeat(64),f.actors.adminA);f.db.prepare("INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES(?,'unrelated','2026-11-01',NULL)").run('ReadGrowth:'+id);
f.db.prepare('INSERT INTO accounts(account_id,display_name,login_link_id,active) VALUES(?,?,?,1)').run(id,id,id);
  f.db.prepare("INSERT INTO account_credentials(account_id,pin_hash,pin_setup,credential_epoch) SELECT ?,pin_hash,1,1 FROM account_credentials WHERE account_id='account-0002'").run(id);
  f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,?,?,'STUDENT',1,'CONFIRMED')").run(id,id,other);
  f.db.prepare("INSERT INTO subject_catalog VALUES(?,'ACADEMY',?,?,1)").run(id,id,id);f.db.prepare('INSERT INTO program_subjects VALUES(?,?,?,1)').run(other,id,id);f.db.prepare('INSERT INTO modules VALUES(?,?,?,NULL,?,1,1)').run(other,id,id,id);
  f.db.prepare("INSERT INTO lesson_media_lessons(lesson_id,activity_key,lesson_date,title,start_time,end_time,teacher_name,state,updated_at) VALUES(?,?,'2026-10-01',?,'','','','PUBLISHED','2026-10-01')").run(id,other,id);
 }
};
const sum=rows=>rows.reduce((n,r)=>n+Object.values(r.capturedRows).reduce((s,x)=>s+x,0),0);
export const summarizeContextReadCosts=costs=>{
 const recipe=costs.filter(c=>c.capturedRows.modules&&c.capturedRows.program_subjects),inherited=costs.filter(c=>!recipe.includes(c));
 return {readCaptureRows:sum(costs.filter(c=>c.method==='read')),writePlanCaptureRows:sum(costs.filter(c=>c.method==='write')),readCoordinatorStatements:costs.filter(c=>c.method==='read').reduce((n,c)=>n+c.queries,0),writeCoordinatorStatements:costs.filter(c=>c.method==='write').reduce((n,c)=>n+c.queries,0),scopedReadRecipes:costs.filter(c=>c.readRecipe&&c.readRecipe!=='options').map(c=>({kind:c.readRecipe,rows:c.capturedRows})),coordinatorCalls:costs.length,coordinatorStatements:costs.reduce((s,c)=>s+c.queries,0),coordinatorRequests:costs.reduce((s,c)=>s+c.requests,0),recipeStatements:recipe.reduce((s,c)=>s+c.queries,0),recipeCaptureRows:sum(recipe),recipeCaptureTables:recipe.map(c=>c.capturedRows),inheritedCaptureRows:sum(inherited),inheritedCaptureTables:inherited.map(c=>c.capturedRows)};
};
