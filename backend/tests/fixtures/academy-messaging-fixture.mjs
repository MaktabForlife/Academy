import {readFileSync} from 'node:fs';
import {classNotesFixture,seedClassNotes} from './academy-class-notes-fixture.mjs';
import {splitFixture} from './academy-split-fixture.mjs';
import worker from '../../src/academy-runtime.js';

export function seedMessaging(f){
 seedClassNotes(f);
 const scope=f.scopes.programA;
 f.db.prepare("INSERT INTO classes(activity_key,class_id,name,active) VALUES(?,'messaging-200','Messaging class · 200 recipients',1)").run(scope);
 f.db.prepare("INSERT INTO class_teacher_assignments(activity_key,class_id,account_id,responsibility) VALUES(?,'messaging-200','account-0003','DEFAULT')").run(scope);
 f.db.prepare("INSERT INTO class_memberships(activity_key,enrollment_id,class_id,account_id,active) VALUES(?,'message-original','messaging-200','account-0002',1)").run(scope);
 for(let i=0;i<198;i++){
  const id='message-learner-'+String(i).padStart(3,'0');
  f.db.prepare('INSERT INTO accounts(account_id,display_name,login_link_id,active) VALUES(?,?,?,1)').run(id,'Test learner '+i,id);
  f.db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,?,?,'STUDENT',1,'CONFIRMED')").run(id,id,scope);
  f.db.prepare("INSERT INTO class_memberships(activity_key,enrollment_id,class_id,account_id,active) VALUES(?,?,'messaging-200',?,1)").run(scope,id,id);
 }
}
export async function messagingFixture({split=false}={}){
 let f;
 if(split){
  f=await splitFixture(seedMessaging);
  f.databases.core.exec(readFileSync(new URL('../../migrations/academy-core/0003_messaging.sql',import.meta.url),'utf8'));
  f.databases.core.exec("UPDATE split_deployment_state SET state='READY'");
  Object.assign(f.source.env,{ACADEMY_DB:f.core,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:f.prepared.report.sourceDigest,ACADEMY_SPLIT_COORDINATOR:f.namespace,ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3'});
  f.env=f.source.env;f.db=f.databases.core;f.actor=f.source.actor;f.login=f.source.login;f.today=f.source.today;
 }else{f=await classNotesFixture(seedMessaging);f.db.exec(readFileSync(new URL('../../migrations/academy/0038_messaging.sql',import.meta.url),'utf8'));}
 f.env.ACADEMY_MESSAGING='1';
 f.request=async(action,input={},token,workspace='LEARN')=>{
  const response=await worker.fetch(new Request('http://localhost/api/academy/messaging/'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Academy-Workspace':workspace},body:JSON.stringify(input)}),f.env);
  return {status:response.status,body:await response.json()};
 };
 f.send=async(targets,token,workspace='LEARN',extra={})=>{
  const saved=await f.request('save',{subject:'Class preparation',body:'Prepare paragraphs 1–3. حفظ الدرس',targets,operationId:crypto.randomUUID(),...extra},token,workspace);
  if(saved.status!==200)return saved;
  const review=await f.request('review',{draftId:saved.body.draftId,revision:saved.body.revision,operationId:crypto.randomUUID()},token,workspace);
  if(review.status!==200)return review;
  return f.request('confirm',{reviewId:review.body.reviewId,operationId:crypto.randomUUID()},token,workspace);
 };
 return f;
}
