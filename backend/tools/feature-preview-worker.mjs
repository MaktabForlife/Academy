// Isolated feature preview. No binding to the live Academy database or Worker.
import academy from '../src/academy-runtime.js';
import {serveAcademySite} from './academy-site.mjs';
export {ProgramTimetableCoordinator} from '../src/academy/d1/library-storage.js';
export default {
  scheduled:academy.scheduled,
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    if(path==='/api/feature-preview/health')return serveAcademySite(request,env);
    if(path.startsWith('/api/'))return academy.fetch(request,env,ctx);
    return serveAcademySite(request,env);
  }
};
