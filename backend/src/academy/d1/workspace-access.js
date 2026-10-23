import {rehearsalError as fail} from './repository.js';

export const workspaceHeader='X-Academy-Workspace';
const same=(a,b)=>String(a).toUpperCase()===String(b).toUpperCase();
export const isAdminWorkspace=auth=>!auth.workspace||auth.workspace==='ADMIN';
export const actualState=auth=>auth.authority||auth.state;
export const hasAdminAuthority=(auth,key)=>Boolean(actualState(auth).account.global_admin||actualState(auth).roles.some(r=>r.role==='PROGRAM_ADMIN'&&same(r.activity_key,key)));
export const administers=(auth,key)=>Boolean((isAdminWorkspace(auth)||auth.adminView)&&hasAdminAuthority(auth,key));
export const actualRole=(auth,key,role)=>auth.adminView?role==='TEACHER'&&auth.workspace==='TEACH'&&administers(auth,key):role==='TEACHER'&&administers(auth,key)||actualState(auth).roles.some(r=>r.role===role&&same(r.activity_key,key));
export const viewedClass=(auth,key)=>auth.workspace==='LEARN'&&auth.classView&&same(auth.classView.activityKey,key)?auth.classView.classId:null;
export const classVisible=(auth,key,ids=[])=>!viewedClass(auth,key)||ids.some(id=>same(id,viewedClass(auth,key)));
export const readerRoles=(auth,roles,key)=>isAdminWorkspace(auth)?roles:auth.adminView?(auth.workspace==='TEACH'&&administers(auth,key)?['TEACHER']:[]):roles.filter(r=>r===(auth.workspace==='TEACH'?'TEACHER':'STUDENT'));
export const readerPreview=(auth,key)=>auth.workspace==='LEARN'&&administers(auth,key);

// Derive Teacher eligibility from current Admin authority without persisting
// assignments. Learn is a class audience preview, never a learner identity.
export function selectWorkspace(request,auth){
 const path=new URL(request.url).pathname,header=request.headers.get(workspaceHeader);
 const workspaceContext=(header||(/^\/api\/admin\/|^\/api\/academy\/d1\/accounts\//.test(path)?'ADMIN':'LEARN')).toUpperCase();
 if(!['LEARN','TEACH','ADMIN','ADMIN_LEARN','ADMIN_TEACH'].includes(workspaceContext))throw fail('Choose a valid personal or Admin workspace.',400,'INVALID_WORKSPACE');
 const authority=auth.state,adminView=workspaceContext==='ADMIN_LEARN'||workspaceContext==='ADMIN_TEACH',workspace=adminView?workspaceContext.slice(6):workspaceContext;
 if(adminView&&!authority.account.global_admin&&!authority.roles.some(r=>r.role==='PROGRAM_ADMIN'))throw fail('Admin views require current Admin authority.',403,'ADMIN_VIEW_FORBIDDEN');
 const inherited=authority.activities.filter(a=>authority.account.global_admin||authority.roles.some(r=>r.role==='PROGRAM_ADMIN'&&same(r.activity_key,a.activity_key))).map(a=>({activity_key:a.activity_key,role:'TEACHER'}));
 let classView=null;const selectedClass=request.headers.get('X-Academy-Class');
 if(selectedClass&&workspaceContext!=='ADMIN_LEARN')throw fail('Class viewing belongs to Admin-Learn.',403,'ADMIN_CLASS_VIEW_REQUIRED');
 if(workspaceContext==='ADMIN_LEARN'&&selectedClass){
  try{classView=JSON.parse(decodeURIComponent(selectedClass));}catch{throw fail('Choose a valid student class view.',400,'INVALID_CLASS_VIEW');}
  if(!classView||typeof classView.activityKey!=='string'||classView.activityKey.length>200||typeof classView.classId!=='string'||!classView.classId||classView.classId.length>160)throw fail('Choose a valid student class view.',400,'INVALID_CLASS_VIEW');
  if(!administers({state:authority},classView.activityKey))throw fail('This student class view is outside your Admin scope.',403,'FORBIDDEN');
 }
 const state=workspace==='ADMIN'?authority:{...authority,account:{...authority.account,global_admin:false,...(adminView?{substitute_grants:'[]'}:{})},roles:adminView?(workspace==='TEACH'?inherited:[]):authority.roles.filter(r=>r.role===(workspace==='TEACH'?'TEACHER':'STUDENT')),
  subscriptions:!adminView&&workspace==='LEARN'?authority.subscriptions:[]};
 return {...auth,authority,state,workspace,workspaceContext,adminView,classView};
}

const adminActions={
 assessments:new Set(['register-create','register-save','register-validate','register-release','session-delete','phase-create','create','save','publish','roster','review-paper','authorise-resubmission','review-mark','release','release-papers','templates','template-save','report-data','report-save','collection-save','finalise','withdraw-release']),
 progress:new Set(['import','module-save','set-save','cards','card-active','activity-active']),
 planning:new Set(['policy','deadline','comment']),
 'lesson-media':new Set(['course-files-create']),
 calendar:new Set(['save'])
};
const teacherActions={assessments:new Set(['paper-details','confirm-submission','ready-assessment','mark']),planning:new Set(['save','submit']),progress:new Set(['confirm'])};
const readerActions={
 LEARN:{assessments:['list','get','download','upload','report-list'],progress:['get','mark'],'lesson-media':['list','calendar','timetable','watch','download','comments','comment-save','comment-moderate'],calendar:['get'],planning:[]},
 TEACH:{assessments:['list','get','download','upload','report-list','paper-details','confirm-submission','ready-assessment','mark'],progress:['get','grid','confirm'],'lesson-media':['list','calendar','timetable','sessions','create','get','save','upload','watch','download','comments','comment-save','comment-moderate','attachment-remove','attachment-name','note-upload','note-options','note-withdraw'],calendar:['get'],planning:['list','get','save','submit']}
};
export function guardWorkspace(request,auth,input={}){
 const path=new URL(request.url).pathname,admin=isAdminWorkspace(auth);
 const forbidden=()=>{throw fail('Open Admin for this action.',403,'ADMIN_WORKSPACE_REQUIRED');};
 if(/^\/api\/admin\/|^\/api\/academy\/d1\/accounts\//.test(path)&&!admin)forbidden();
 if(path==='/api/academy/cache/refresh'&&!admin)forbidden();
 const match=path.match(/^\/api\/academy\/(assessments|planning|progress|lesson-media|calendar)\/([^/]+)$/);
 if(match){const [,family,action]=match;
  if(auth.workspace==='LEARN'&&family==='planning')throw fail('Planning is available in Teach.',403,'TEACH_WORKSPACE_REQUIRED');
  if(auth.workspace==='LEARN'&&family==='progress'&&action==='grid')throw fail('Class progress is available in Teach.',403,'TEACH_WORKSPACE_REQUIRED');
  if(!admin&&adminActions[family]?.has(action))forbidden();
  if(!admin&&!readerActions[auth.workspace]?.[family]?.includes(action))throw fail('This action is outside the selected workspace.',403,'WORKSPACE_FORBIDDEN');
  if(auth.workspace==='LEARN'&&teacherActions[family]?.has(action))throw fail('Open Teach for this action.',403,'TEACH_WORKSPACE_REQUIRED');
  if(!admin&&input.view==='admin')forbidden();
  // Legacy caller hints cannot widen a selected audience.
  if(!admin&&family==='assessments')input.view=auth.workspace==='LEARN'?'learner':'teacher';
  if(!admin&&family==='calendar')input.view=auth.workspace.toLowerCase();
  if(!admin&&family==='planning')input.view='teacher';
  if(!admin&&family==='progress')input.view=auth.workspace==='LEARN'?'self':'teach';
  if(auth.workspace==='LEARN'&&family==='lesson-media')input.view='learner';
  if(action==='upload'&&family==='assessments'){
   if(['TEMPLATE','REPORT'].includes(input.kind)&&!admin)forbidden();
   if(input.kind==='ANSWER'&&auth.workspace==='TEACH'||['PAPER','SCRIPT'].includes(input.kind)&&auth.workspace==='LEARN')throw fail('This upload is outside the selected workspace.',403,'WORKSPACE_FORBIDDEN');
  }
 }
 if(auth.workspace==='LEARN'&&path==='/api/academy/progress/mark'&&(auth.adminView||auth.classView||input.activityKey&&administers(auth,input.activityKey)))throw fail('Student class viewing is read only.',403,'PREVIEW_READ_ONLY');
 if(path==='/api/academy/teacher-availability/save'&&!admin)forbidden();
 if(auth.workspace==='LEARN'&&/^\/api\/program-attendance\//.test(path))throw fail('Attendance recording is available in Teach.',403,'TEACH_WORKSPACE_REQUIRED');
 return input;
}
