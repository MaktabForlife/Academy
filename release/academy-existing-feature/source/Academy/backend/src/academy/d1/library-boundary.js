import {managementStore,managementError,same,liveRoles} from './management-store.js';
import {requireLearning} from './learning-state.js';
export const d1LibraryAreaRefs=state=>state.activities.filter(a=>state.account.global_admin||
  (a.kind==='PROGRAM'?state.roles.some(r=>same(r.activity_key,a.activity_key)):
    a.legacy_access_model==='FREE'||state.subscriptions.some(s=>same(s.activity_key,a.activity_key))||state.roles.some(r=>same(r.activity_key,a.activity_key)&&['STUDENT','TEACHER','PROGRAM_ADMIN'].includes(r.role))))
  .map(a=>`${a.kind==='PROGRAM'?'PROGRAM':'GLOBAL'}:${a.activity_id}`);

export function d1Library(repository,auth){
  const accountPath=`/account/${encodeURIComponent(auth.user.uniqueid)}`;
  return {async run(action,input,request,{admin=false}={}){
    if(action!=='available')throw managementError('Private Academy media is not available yet.',403,'PRIVATE_MEDIA_NOT_ENABLED');
    await requireLearning(repository.db);
    const data=await managementStore(repository,auth).load();
    return {programs:data.activities.filter(a=>a.kind==='PROGRAM'&&a.active&&a.lifecycle==='ACTIVE').flatMap(a=>{
      const roles=liveRoles(data,auth.user.accountid,a.activity_key);
      const role=auth.state.account.global_admin?'GLOBAL_ADMIN':['PROGRAM_ADMIN','TEACHER','STUDENT'].find(r=>roles.includes(r));
      return role&&(!admin||role!=='STUDENT')?[{id:a.activity_id,name:a.name,role}]:[];
    }),accountPath,store:'D1'};
  }};
}
export function d1LibraryStream(){throw managementError('Private Academy media is not available yet.',403,'PRIVATE_MEDIA_NOT_ENABLED');}
