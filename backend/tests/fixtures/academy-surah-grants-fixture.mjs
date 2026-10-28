import {readFileSync} from 'node:fs';
import {monthlyFixture,scope} from './academy-monthly-subscriptions-fixture.mjs';
export {scope};
export const op=()=>crypto.randomUUID();
export const ok=r=>{if(r.status!==200)throw Error(JSON.stringify(r));return r.body;};
export async function grantsFixture(){
 const f=await monthlyFixture();
 f.db.exec(readFileSync(new URL('../../migrations/academy/0043_program_surah_grants.sql',import.meta.url),'utf8'));
 f.env.ACADEMY_SURAH_GRANTS='1';
 f.admin=await f.login('0001');
 ok(await f.monthly('configure',{mode:'prepare',policyRevision:0,operationId:op()},f.admin));
 f.ids=[op(),op(),op()];
 ok(await f.monthly('surah-save',{policyRevision:1,operationId:op(),entries:f.ids.map((id,i)=>({id,name:['Surah Maryam','Surah Yusuf','Foundations'][i],cardKey:['yaseen','saffat','foundations'][i],completionDate:'2024-01-16',active:true,revision:0}))},f.admin));
 f.site=(action,id,input={})=>f.call('/api/admin/platform/course-websites/'+action,{activityKey:scope,surahId:id,...input},f.admin);
 f.publish=async(id=f.ids[0])=>{const view=ok(await f.site('get',id)),saved=ok(await f.site('save',id,{document:view.document,revision:0,operationId:op()}));return ok(await f.site('publish',id,{revision:saved.revision,operationId:op()}));};
 f.read=(id,token)=>f.call('/api/academy/course-websites/read',{activityKey:scope,surahId:id},token);
 f.grants=(accountId='account-0002',token=f.admin)=>f.monthly('surah-grants',{accountId},token);
 f.saveGrant=async(id,active,accountId='account-0002',token=f.admin,extra={})=>{
  const view=ok(await f.grants(accountId,token));
  return f.monthly('surah-grants-save',{accountId,entries:[{id,active,revision:view.surahs.find(r=>r.id===id).revision}],policyRevision:view.policyRevision,operationId:op(),...extra},token);
 };
 return f;
}
