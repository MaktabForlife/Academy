import {world,signIn,seedStudioAuthoringFixture} from './academy-v111-native-fixture.mjs';
import {Bucket} from '../../../security/v2/test/helpers.mjs';
import {opaque,canonical} from '../../../security/v2/codec.mjs';
const operations=['stage-manifest','stage-page','summary','join','admin-read','admin','admin-cover','source-return'];
export async function createStudioAccessNativeFixture({kind='COURSE',actor='global',creator=false,owner='STUDIO'}={}){
 const key=opaque(),f=await world({studioAuthority:'WEBSITE',prepareEnvironment:({env,app,now})=>{
  if(['academy','studio'].includes(app))env.UAA_V2_PORTAL_RPC_KEYS_JSON=canonical({schema:1,currentKid:'studio-access-fixture',keys:[{kid:'studio-access-fixture',key,notBefore:0,notAfter:now+604800,disabled:false,operations}]});
  if(app==='academy'){env.ACADEMY_WEB_PLATFORM='1';env.ACADEMY_MONTHLY_SUBSCRIPTIONS='1';}
  if(app==='studio'){const bucket=new Bucket();env.CONTENT={put:bucket.put.bind(bucket),get:async key=>{const value=await bucket.get(key);return value?{...value,body:new Response(await value.arrayBuffer()).body}:null;}};}
 }}),source=f.databases.academy,target=f.databases.studio;
 let a=seedStudioAuthoringFixture(f);source.exec('UPDATE website_platform_control SET enabled=1 WHERE singleton=1');
 if(kind==='TAFSEER'){
  const activityKey=source.prepare("SELECT activity_key FROM activities WHERE kind='PROGRAM' AND active=1 ORDER BY activity_key LIMIT 1").get().activity_key,offeringId='native-access-tafseer',websiteId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  source.prepare("INSERT INTO website_platform_timetable_scopes(activity_key,offering_id,kind) VALUES(?,?,'TAFSEER')").run(activityKey,offeringId);source.prepare('INSERT INTO website_platform_access_scopes(activity_key,enabled) VALUES(?,1)').run(activityKey);
  source.prepare('INSERT INTO program_monthly_media_policies(activity_key,enabled,revision,updated_at,updated_by_account_id) VALUES(?,1,1,?,?) ON CONFLICT(activity_key) DO UPDATE SET enabled=1').run(activityKey,new Date(f.now()*1000).toISOString(),a.sub);
  target.prepare("INSERT INTO offerings VALUES(?,'TAFSEER','Synthetic native access programme',1,1)").run(offeringId);target.prepare('INSERT INTO websites(website_id,offering_id,title,revision) VALUES(?,?,?,1)').run(websiteId,offeringId,'Synthetic current access website');
  target.prepare("INSERT INTO source_access_scopes VALUES(?,'WEBSITE',1,1,1,1,'UTC','[]')").run(offeringId);target.prepare("INSERT INTO access_handovers(offering_id,transfer_id,phase,generation,source_version,revision,created_at) VALUES(?,'studio-access-native-handover','COMMITTED',1,1,1,?)").run(offeringId,f.now()*1000);target.prepare('INSERT INTO participation VALUES(?,?,1,1,0,?)').run(f.sub,offeringId,'existing-native-class');
  a={...a,activityKey,offeringId,websiteId};
 }
 source.prepare("INSERT INTO website_platform_access_ownership(activity_key,state,updated_at) VALUES(?,?,?) ON CONFLICT(activity_key) DO UPDATE SET state=excluded.state").run(a.activityKey,owner,new Date(f.now()*1000).toISOString());
 if(actor!=='global'){
  const row=source.prepare("SELECT a.account_id,a.login_link_id,a.display_name,c.credential_epoch FROM accounts a JOIN account_credentials c USING(account_id) JOIN effective_activity_roles role ON role.account_id=a.account_id WHERE role.role='PROGRAM_ADMIN' AND role.activity_key=? AND a.account_id='sep-admin-a'").get(a.activityKey);if(!row)throw Error('Actual native scoped Admin fixture missing');
  target.prepare('INSERT INTO accounts VALUES(?,?,1,1,?,0,0) ON CONFLICT DO NOTHING').run(row.account_id,row.display_name,row.credential_epoch);target.prepare("INSERT INTO staff VALUES(?,?,'ADMIN',?)").run(row.account_id,a.offeringId,Number(creator));f.loginId=row.login_link_id;a={...a,sub:row.account_id,ce:row.credential_epoch,loginId:row.login_link_id};
 }
 const login=await signIn(f);return {...f,a,login,async renew(){const b=await f.post('academy','/auth/v2/bootstrap',{purpose:'refresh',expectedContext:this.login.context}),r=await f.post('academy','/auth/v2/refresh',{operationId:b.data.intent.id,expectedContext:b.data.context,qualifyingActivity:false},b.data);if(r.response.status!==200)throw Error('Synthetic native Source refresh failed: '+r.data.code);this.login=r.data;return r.data;},async access(command){return f.nativeRequest('/api/admin/platform/studio-access',{activityKey:a.activityKey,command},this.login,{headers:{'X-Academy-Workspace':'ADMIN'}});},async cleanup(){await f.drainNativeBackground();f.close();}};
}
