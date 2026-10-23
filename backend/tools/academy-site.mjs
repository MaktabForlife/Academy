import {assetPath} from './browser-site/worker.mjs';
import {publicPdfTarget} from './academy-public-media.mjs';
import {onRequestGet as catalogue} from '../../functions/academy/open-library/catalogue.js';
import {onRequestGet as publicPdf} from '../../functions/pdf-file/[encoded].js';
export const siteVersion='107.36';
export const siteBranch='development';
export async function serveAcademySite(request,env,{pages=false,branch=siteBranch,syntheticOnly=false}={}){
  const url=new URL(request.url);
  if(['/api/feature-preview/health','/api/site/health'].includes(url.pathname))return Response.json({success:true,version:siteVersion,branch,syntheticOnly},{headers:{'Cache-Control':'no-store'}});
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  if(/^\/(?:admin|student)(?:\/|$)/.test(url.pathname)||url.pathname==='/')return Response.redirect(url.origin+'/academy/',302);
  if(url.pathname==='/academy/open-library/catalogue')return catalogue();
  if(url.pathname.startsWith('/pdf-file/')){
    const encoded=url.pathname.slice('/pdf-file/'.length);
    if(!publicPdfTarget(encoded))return new Response('Public PDF source required',{status:403});
    return publicPdf({request,params:{encoded}});
  }
  const path=assetPath(url.pathname);if(!path)return new Response('Not found',{status:404});url.pathname=pages&&path.endsWith('/index.html')?path.slice(0,-10):path;
  const response=await env.ASSETS.fetch(new Request(url,request));
  const headers=new Headers(response.headers);headers.set('X-Robots-Tag','noindex, nofollow');headers.set('X-Content-Type-Options','nosniff');
  return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
}
