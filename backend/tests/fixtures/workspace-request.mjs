// Existing workflow tests choose their actor's working surface explicitly.
// Boundary tests use the native Request and set every audience themselves.
const NativeRequest=globalThis.Request;
export class WorkspaceRequest extends NativeRequest {
 constructor(url,options={}){
  const headers=new Headers(options.headers||(url instanceof NativeRequest?url.headers:undefined)),token=headers.get('Authorization')?.slice(7)||'';
  if(!headers.has('X-Academy-Workspace')){
   let role='',input={};
   try{role=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).role;}catch{}
   try{input=JSON.parse(typeof options.body==='string'?options.body:'{}');}catch{}
   const path=new URL(url instanceof NativeRequest?url.url:url).pathname;
   // Legacy workflow fixtures request the explicit Admin reader when an Admin actor asks for a reader view. Native Request boundary tests exercise personal contexts separately.
   const adminReader=['GLOBAL_ADMIN','PROGRAM_ADMIN'].includes(role);
   headers.set('X-Academy-Workspace',path.startsWith('/api/admin/')||input.view==='admin'?'ADMIN':input.view==='learner'||input.view==='learn'||input.view==='self'?(adminReader?'ADMIN_LEARN':'LEARN'):input.view==='teach'||input.view==='teacher'?(adminReader?'ADMIN_TEACH':'TEACH'):['GLOBAL_ADMIN','PROGRAM_ADMIN'].includes(role)?'ADMIN':role==='TEACHER'?'TEACH':'LEARN');
  }
  super(url,{...options,headers});
 }
}
