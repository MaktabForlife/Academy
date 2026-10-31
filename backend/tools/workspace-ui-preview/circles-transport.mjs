// Loopback review only. Reuse the released Circles UI over disposable native
// fixtures; this is not a Studio session, exchange endpoint or deployment asset.
import {academyD1Repository} from '../../src/academy/d1/repository.js';
import {authenticatedD1Account} from '../../src/academy/d1/session.js';
import {dashboardSummary,dashboardChoice} from '../../src/academy/d1/web-platform/dashboard.mjs';
import {navigationMappings,programmeChoice} from '../../src/academy/d1/web-platform/navigation.mjs';

const fail=(message,status=403)=>Object.assign(Error(message),{status});
const route=(id,audience)=>'/academy/'+(audience.startsWith('admin-')?'admin/':'')+'#activity/PROGRAM/'+encodeURIComponent(id)+'/'+audience.replace('admin-','');
export function createCirclesTransport({env,worker,origin}){
 const native=async(request,path,body={},mode)=>{
  const response=await worker.fetch(new Request(origin()+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:request.headers.get('Authorization')||'',...(mode?{'X-Academy-Workspace':mode.toUpperCase()}:{})},body:JSON.stringify(body)}),env);
  const value=await response.json();if(!response.ok||!value.success)throw fail(value.error||'The sample workspace is unavailable.',response.status);return value;
 };
 return async function transport(path,request){
  try{
   if(path==='/api/config'&&request.method==='GET')return Response.json({academyOrigin:origin()});
   if(!['/api/me','/api/circles/navigation','/api/circles/dashboard','/__preview/continue','/auth/logout'].includes(path))throw fail('This connection is unavailable in the offline review.',404);
   const repository=academyD1Repository(env);await repository.ready();
   const auth=await authenticatedD1Account(request,env,repository),state=auth.authority||auth.state;
   if(!state?.account?.active)throw fail('Choose a sample account.',401);
   const global=Boolean(state.account.global_admin),mappings=navigationMappings(env);
   const permitted=key=>{
    const id=mappings[key],activity=state.activities.find(a=>a.kind==='PROGRAM'&&a.active&&a.lifecycle==='ACTIVE'&&a.activity_id.toLowerCase()===id?.toLowerCase());
    return activity&&(global||state.contexts.some(c=>c.scope==='COURSE'&&c.courseId.toLowerCase()===id.toLowerCase()&&['STUDENT','TEACHER','SENIOR','PROGRAM_ADMIN','ADMIN'].includes(c.role)))?activity:null;
   };
   if(path==='/api/me'&&request.method==='GET')return Response.json({accountId:state.account.account_id,displayName:state.account.display_name,globalAdmin:global});
   if(path==='/api/circles/navigation'&&request.method==='GET')return Response.json({academia:['alimiyah','reboot','arabic-intensive'].filter(permitted).map(key=>({key,label:{alimiyah:'Aalimiyah',reboot:'Reboot Your Maktab','arabic-intensive':'Arabic Intensive'}[key]})),mothers:Boolean(permitted('mothers')),hifz:permitted('hifz')?'https://hifz.maktab4life.org/':null,tafseer:'/studio/?view=collections&collection=tafseer',shortCourses:[],purchasedCourses:[]});
   if(path==='/api/circles/dashboard'&&request.method==='POST'){
    const input=await request.json();if(Object.keys(input).some(k=>!['mode','refresh'].includes(k)))throw fail('Choose a sample workspace.');
    return Response.json(await dashboardSummary(state,env,input,(path,body,mode)=>native(request,path,body,mode)));
   }
   if(path==='/auth/logout'&&request.method==='POST'){await native(request,'/api/account/logout');return Response.json({success:true});}
   if(path==='/__preview/continue'&&request.method==='POST'){
    const input=await request.json();if(Object.keys(input).some(k=>!['navigation','dashboard'].includes(k))||Boolean(input.navigation)===Boolean(input.dashboard))throw fail('Choose one workspace.');
    if(input.dashboard){const choice=dashboardChoice(state,input.dashboard);if(choice.destination.startsWith('https:')||choice.destination.startsWith('/recorder/'))throw fail('This tool is unavailable in the offline review.',409);return Response.json({title:'Open Academy',choices:[{label:'Open workspace',href:choice.destination}]});}
    programmeChoice(state,input.navigation,env); // Existing native programme gate.
    if(input.navigation==='hifz')throw fail('HifzHelper is unavailable in the offline review.',409);
    const id=mappings[input.navigation],roles=state.contexts.filter(c=>c.scope==='COURSE'&&c.courseId.toLowerCase()===id.toLowerCase()).map(c=>c.role),admin=global||roles.some(r=>['PROGRAM_ADMIN','ADMIN'].includes(r)),choices=[];
    if(roles.includes('STUDENT'))choices.push({label:'Learn',href:route(id,'learn')});
    if(roles.some(r=>['TEACHER','SENIOR','SUBSTITUTE'].includes(r)))choices.push({label:'Teach',href:route(id,'teach')});
    if(admin)choices.push({label:'Admin-Learn',href:route(id,'admin-learn')},{label:'Admin-Teach',href:route(id,'admin-teach')},{label:'Admin',href:'/programs/manage.html?program='+encodeURIComponent(id)});
    if(!choices.length)throw fail('No sample workspace is assigned.');
    return Response.json({title:permitted(input.navigation).name,choices});
   }
   throw fail('This preview action is unavailable.',405);
  }catch(error){return Response.json({error:error.message||'The sample workspace is unavailable.',code:error.status===401?'SESSION_ENDED':'OFFLINE_REVIEW'},{status:error.status||500});}
 };
}

// Keep the real client's account-generation/history guards. Only its fetch
// transport is replaced; no real cookie, PIN or Studio authority is used.
export function previewApi(source){
 if(!source.includes('await fetch(path,{method,credentials:'))throw Error('Review the changed Circles API client before adapting it.');
 return `async function previewFetch(path,init){const token=localStorage.getItem('m4l_account_token')||'';const response=await fetch('/__preview/transport'+path,{...init,headers:{...init.headers,...(token?{Authorization:'Bearer '+token}:{})}});if(path==='/api/me'&&response.status===401){localStorage.removeItem('m4l_account_token');if(document.documentElement.dataset.workspacePreviewDashboard==='true')location.replace('/?public=1');}if(path==='/auth/logout'&&response.ok){localStorage.removeItem('m4l_account_token');sessionStorage.clear();location.replace('/');}return response;}\n`+source.replace('await fetch(path,{method,credentials:','await previewFetch(path,{method,credentials:')+`\nwindow.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null){changed(null);window.dispatchEvent(new CustomEvent('website-session-ended',{detail:{externalAccountChange:true}}));}});`;
}
