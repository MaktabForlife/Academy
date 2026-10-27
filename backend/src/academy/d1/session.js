import {verifySessionToken} from '../../lib/auth-primitives.js';
import {rehearsalError} from './repository.js';
import {selectWorkspace} from './workspace-access.js';

export const d1Audience='academy-d1-rehearsal';
export const d1ContextEqual=(a,b)=>a.scope===b.scope&&a.courseId.toUpperCase()===b.courseId.toUpperCase()&&a.role===b.role;

// A retained-media context can replace a former Student context without granting a Student role.
export const findD1Context=(state,target)=>state?.contexts.find(c=>d1ContextEqual(c,target))||
 (target.role==='STUDENT'&&target.scope==='COURSE'?state?.contexts.find(c=>c.mediaOnly&&c.role==='MEDIA_READER'&&c.scope===target.scope&&c.courseId.toUpperCase()===target.courseId.toUpperCase()):undefined);

// Shared by the HTTP entrypoint and the Open Library coordinator. Every call
// checks current D1 state; a signed token alone never confers current authority.
export async function authenticatedD1Account(request,env,repository) {
  const header=request.headers.get('Authorization')||'';
  if(!header.startsWith('Bearer ')||header.length>4096)throw rehearsalError('Your Academy session has ended.',401,'SESSION_ENDED');
  const token=await verifySessionToken(header.slice(7),env);
  if(!token||token.aud!==d1Audience||token.sv!==3||typeof token.sid!=='string'||typeof token.accountid!=='string'||!Number.isInteger(token.epoch))throw rehearsalError('Your Academy session has ended.',401,'SESSION_ENDED');
  const state=await repository.session(token.sid,token.accountid,token.epoch);
  const context=findD1Context(state,{scope:String(token.scope||''),courseId:String(token.courseid||''),role:String(token.role||'')});
  if(!state||!context)throw rehearsalError('Your Academy session has ended.',401,'SESSION_ENDED');
  return selectWorkspace(request,{state,sid:token.sid,context,user:{type:'account',accountid:state.account.account_id,uniqueid:state.account.login_link_id,username:state.account.display_name,role:state.account.global_admin?'GLOBAL_ADMIN':context.role,scope:context.scope,courseid:context.courseId}});
}
