import {readFileSync} from 'node:fs';
import worker from '../../src/academy-runtime.js';
import {signedHeaders} from '../../src/academy/d1/web-platform/protocol.mjs';
import {contentMediaFixture} from './academy-content-media-fixture.mjs';
export async function nativeMediaBridgeFixture({growth=0}={}){
 const f=await contentMediaFixture({growth});
 try{
  const db=f.databases.core;
  for(const name of ['0006_program_monthly_subscriptions.sql','0008_program_surah_grants.sql','0011_website_platform.sql','0012_website_schedule_library.sql','0013_website_parallel_access.sql','0015_studio_access_admin.sql','0019_course_policy_mirror.sql'])db.exec(readFileSync(new URL('../../migrations/academy-core/'+name,import.meta.url),'utf8'));
  db.exec('UPDATE website_platform_control SET enabled=1');
  db.prepare("INSERT INTO website_platform_timetable_scopes(activity_key,offering_id,kind) VALUES(?,?,'ACADEMY')").run(f.scope,'synthetic-offering');
  db.prepare('INSERT INTO website_platform_access_scopes(activity_key,enabled) VALUES(?,1)').run(f.scope);
  db.prepare("INSERT INTO website_platform_access_ownership(activity_key,state,updated_at) VALUES(?,'STUDIO',0)").run(f.scope);
  for(let n=0;n<growth;n++)db.prepare("INSERT INTO website_platform_access_ownership(activity_key,state,updated_at) VALUES(?,'ACADEMY',0)").run('PROGRAM:read-growth-'+n);
  Object.assign(f.source.env,{ACADEMY_WEB_PLATFORM:'1',WEBSITE_TO_ACADEMY_SECRET:'synthetic-local-teacher-bridge-secret-only'});
  f.sourceRef=async(token=f.admin)=>{const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()),ref=crypto.randomUUID();db.prepare('INSERT INTO website_platform_sessions VALUES(?,?,?,?,?,?,?,?)').run(ref,claims.accountid,claims.sid,claims.epoch,JSON.stringify({scope:claims.scope,role:claims.role}),Date.now()+3600000,'synthetic-challenge','synthetic-state');return ref;};
  f.signedMediaTeachers=async(input={},secret=f.source.env.WEBSITE_TO_ACADEMY_SECRET)=>{const value={issuedAt:Date.now(),sourceRef:await f.sourceRef(),offeringId:'synthetic-offering',purpose:'ADMIN_MEDIA',...input},signed=await signedHeaders(secret,'/internal/website/media-teachers',value),response=await worker.fetch(new Request('http://localhost/internal/website/media-teachers',{method:'POST',headers:signed.headers,body:signed.payload}),f.source.env);return {status:response.status,body:await response.json(),input:value};};
  return f;
 }catch(e){f.close();throw e;}
}
