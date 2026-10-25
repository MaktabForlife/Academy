import {academyDate} from './academy-clock.js';
import {payloadHash} from '../../programs/timetable-model.js';
// Validators are opt-in and run after authentication/workspace projection. They
// never cache authority, join links, file access, mutations or editable drafts.
export async function conditionalRead(request,repository,auth,input,produce,now=Date.now()){
 const url=new URL(request.url),enabled=request.headers.get('X-Academy-Read-Cache')==='1'||url.searchParams.get('readCache')==='1';
 if(!enabled)return produce();
 const state=await repository.db.prepare('SELECT version FROM academy_write_state WHERE singleton=1').first();
 const timezone=(await repository.homeConfiguration())?.setting_value||'Africa/Johannesburg';
 const authority=auth?.authority||auth?.state;
 const readRevision=await payloadHash(['ACADEMY_READ_V1',url.pathname,state.version,repository.setup?.head||'',url.pathname==='/api/academy/timetable'?Math.floor(now/60000):academyDate(new Date(now),timezone),auth?.user.accountid||'PUBLIC',auth?.workspaceContext||auth?.workspace||'PUBLIC',auth?.classView||null,authority?.account.credential_epoch,authority?.account.global_admin,authority?.account.substitute_grants,authority?.roles,authority?.subscriptions,input]);
 const previous=request.headers.get('X-Academy-Read-Revision')||url.searchParams.get('readRevision');
 if(previous===readRevision)return {success:true,notModified:true,readRevision};
 return {...await produce(),readRevision};
}
