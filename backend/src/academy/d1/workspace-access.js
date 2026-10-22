import {rehearsalError as fail} from './repository.js';

export const workspaceHeader='X-Academy-Workspace';
const same=(a,b)=>String(a).toUpperCase()===String(b).toUpperCase();
export const isAdminWorkspace=auth=>!auth.workspace||auth.workspace==='ADMIN';
export const actualState=auth=>auth.authority||auth.state;
export const administers=(auth,key)=>Boolean(actualState(auth).account.global_admin||actualState(auth).roles.some(r=>r.role==='PROGRAM_ADMIN'&&same(r.activity_key,key)));
export const actualRole=(auth,key,role)=>actualState(auth).roles.some(r=>r.role===role&&same(r.activity_key,key));
export const readerRoles=(auth,roles)=>isAdminWorkspace(auth)?roles:roles.filter(r=>r===(auth.workspace==='TEACH'?'TEACHER':'STUDENT'));
export const readerPreview=(auth,key)=>!isAdminWorkspace(auth)&&administers(auth,key)&&!actualRole(auth,key,auth.workspace==='TEACH'?'TEACHER':'STUDENT')&&!(auth.workspace==='LEARN'&&actualState(auth).subscriptions.some(s=>same(s.activity_key,key)));

// Workspace is an audience choice, never a role grant. Keep the verified actor
// and authority for audits; services receive only the selected reader roles.
export function selectWorkspace(request,auth){
 const path=new URL(request.url).pathname,header=request.headers.get(workspaceHeader);
 const workspace=(header||(/^\/api\/admin\/|^\/api\/academy\/d1\/accounts\//.test(path)?'ADMIN':'LEARN')).toUpperCase();
 if(!['LEARN','TEACH','ADMIN'].includes(workspace))throw fail('Choose Learn, Teach or Admin.',400,'INVALID_WORKSPACE');
 const authority=auth.state;
 const state=workspace==='ADMIN'?authority:{...authority,account:{...authority.account,global_admin:false},roles:authority.roles.filter(r=>r.role===(workspace==='TEACH'?'TEACHER':'STUDENT')),
  subscriptions:workspace==='LEARN'?authority.subscriptions:[]};
 return {...auth,authority,state,workspace};
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
 TEACH:{assessments:['list','get','download','upload','report-list','paper-details','confirm-submission','ready-assessment','mark'],progress:['get','grid','confirm'],'lesson-media':['list','calendar','timetable','sessions','create','get','save','upload','watch','download','comments','comment-save','comment-moderate','attachment-remove','attachment-name'],calendar:['get'],planning:['list','get','save','submit']}
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
 if(path==='/api/academy/teacher-availability/save'&&!admin)forbidden();
 if(auth.workspace==='LEARN'&&/^\/api\/program-attendance\//.test(path))throw fail('Attendance recording is available in Teach.',403,'TEACH_WORKSPACE_REQUIRED');
 return input;
}
