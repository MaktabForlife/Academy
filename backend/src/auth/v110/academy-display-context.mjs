import {readDisplayContext} from './server-context.mjs';
import {academyDisplayCSRF} from './academy-display-csrf.mjs';
export async function readAcademyDisplayContext(request,env){
 const response=await readDisplayContext(request,env,{app:'academy'});
 if(!response.ok||env.JWT_V110_NATIVE_COOKIE!=='1')return response;
 try{const value=await response.json();return Response.json({...value,csrf:await academyDisplayCSRF(env,value.session)},{status:200,headers:response.headers});}
 catch{return Response.json({code:'CONTEXT_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
}
