import {assetPath} from './browser-site/worker.mjs';
import {publicPdfTarget} from './academy-public-media.mjs';
import {onRequestGet as catalogue} from '../../functions/academy/open-library/catalogue.js';
import {onRequestGet as publicPdf} from '../../functions/pdf-file/[encoded].js';
import {academyCirclesAlias,academyCirclesPages,academyCirclesFragments,academyRetiredPages,circlesPageUnavailable} from './academy-circles-routes.mjs';
export const siteVersion='109.11';
export const siteBranch='development';
export async function serveAcademySite(request,env,{pages=false,branch=siteBranch,syntheticOnly=false}={}){
  const url=new URL(request.url);
  if(['/api/feature-preview/health','/api/site/health'].includes(url.pathname))return Response.json({success:true,version:siteVersion,branch,syntheticOnly},{headers:{'Cache-Control':'no-store'}});
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  let path=assetPath(url.pathname),shortDirectory=false;
  if(path&&!path.split('/').at(-1).includes('.')&&(academyCirclesPages.has(path.slice(1)+'/index.html')||academyRetiredPages.has(path.slice(1)+'/index.html'))){path+='/index.html';shortDirectory=true;}
  if(path?.endsWith('/index.html')&&url.pathname===path.slice(0,-11))shortDirectory=true;
  const alias=academyCirclesAlias(url,path);
  if(alias)return new Response(null,{status:302,headers:{Location:alias,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  if(shortDirectory){const next=new URL(url);next.pathname+='/';return new Response(null,{status:302,headers:{Location:next.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}
  if(url.pathname==='/academy/open-library/catalogue')return catalogue();
  if(url.pathname.startsWith('/pdf-file/')){
    const encoded=url.pathname.slice('/pdf-file/'.length);
    if(!publicPdfTarget(encoded))return new Response('Public PDF source required',{status:403});
    return publicPdf({request,params:{encoded}});
  }
  if(!path)return url.pathname.split('/').at(-1).includes('.')?new Response('Not found',{status:404}):circlesPageUnavailable(request.method);
  const file=path.slice(1),document=path.endsWith('.html')||!path.split('/').at(-1).includes('.');
  if(document&&!academyCirclesPages.has(file))return circlesPageUnavailable(request.method);
  if(path.endsWith('.fragment')&&!academyCirclesFragments.has(file))return circlesPageUnavailable(request.method);
  url.pathname=pages&&path.endsWith('/index.html')?path.slice(0,-10):path;
  const response=await env.ASSETS.fetch(new Request(url,request));
  if(document&&response.status===404)return circlesPageUnavailable(request.method);
  const headers=new Headers(response.headers);headers.set('X-Robots-Tag','noindex, nofollow');headers.set('X-Content-Type-Options','nosniff');
  if(document)headers.set('Cache-Control','no-store');
  if(academyCirclesFragments.has(file)){headers.set('Content-Type','text/plain; charset=utf-8');headers.set('Cache-Control','no-cache');}
  return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
}
