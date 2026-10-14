// Isolated feature preview: public assets and this branch's API share one origin.
// It has no binding to the live Development database or Worker.
import academy from '../src/worker.js';
import {assetPath,publicPdfTarget} from './browser-site/worker.mjs';
import {onRequestGet as catalogue} from '../../functions/academy/open-library/catalogue.js';
import {onRequestGet as publicPdf} from '../../functions/pdf-file/[encoded].js';
export {ProgramTimetableCoordinator} from '../src/programs/timetable-durable-object.js';

export default {
  scheduled:academy.scheduled,
  async fetch(request,env,ctx) {
    const url=new URL(request.url);
    if(url.pathname==='/api/feature-preview/health')return Response.json({success:true,version:'106.60',branch:'feature/academy-review-fixes-10660',syntheticOnly:true},{headers:{'Cache-Control':'no-store'}});
    if(url.pathname.startsWith('/api/'))return academy.fetch(request,env,ctx);
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
    if(url.pathname==='/')return Response.redirect(url.origin+'/academy/',302);
    if(url.pathname==='/academy/open-library/catalogue')return catalogue();
    if(url.pathname.startsWith('/pdf-file/')){
      const encoded=url.pathname.slice('/pdf-file/'.length);
      if(!publicPdfTarget(encoded))return new Response('Public Archive.org media only',{status:403});
      return publicPdf({request,params:{encoded}});
    }
    const path=assetPath(url.pathname);
    if(!path)return new Response('Not found',{status:404});
    url.pathname=path;
    const response=await env.ASSETS.fetch(new Request(url,request));
    const headers=new Headers(response.headers);headers.set('X-Robots-Tag','noindex, nofollow');headers.set('X-Content-Type-Options','nosniff');
    return new Response(response.body,{status:response.status,headers});
  }
};
