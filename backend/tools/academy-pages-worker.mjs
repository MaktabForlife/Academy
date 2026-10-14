// Pages resolves directory indexes itself; preserve account links without redirect loops.
import {serveAcademySite} from './academy-site.mjs';
export default {fetch:(request,env)=>serveAcademySite(request,env,{pages:true})};
