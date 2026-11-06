import {jwtV110PublicAssets} from './jwt-v110-public-assets.mjs';
import {servePortal} from './portal-site.mjs';
import {assetPath} from './browser-site/worker.mjs';
import {publicPdfTarget} from './academy-public-media.mjs';
import {onRequestGet as catalogue} from '../../functions/academy/open-library/catalogue.js';
import {onRequestGet as publicPdf} from '../../functions/pdf-file/[encoded].js';
import {academyCirclesAlias,academyCirclesPages,academyCirclesFragments,academyRetiredPages,circlesPageUnavailable} from './academy-circles-routes.mjs';
export const siteVersion='110.4';
export const siteBranch='development';
export async function serveAcademySite(request,env,{pages=false,branch=siteBranch,syntheticOnly=false}={}){
  const url=new URL(request.url);
  if(['/api/feature-preview/health','/api/site/health'].includes(url.pathname))return Response.json({success:true,version:siteVersion,branch,syntheticOnly},{headers:{'Cache-Control':'no-store'}});
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  // Exact public build receipt for the isolated preview only. Neighbouring
  // root JSON and non-Feature builds retain the existing asset allowlist.
  if(pages&&branch==='feature-preview'&&url.pathname==='/feature-build.json'){
    const assetURL=new URL(url);assetURL.search='';
    const response=await env.ASSETS.fetch(new Request(assetURL,{method:'GET'}));
    const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');
    return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
  }
  // Public coordination files are static, never auth endpoints. Keep the list
  // exact and do not pass root cookies or caller credentials to the asset origin.
  if(jwtV110PublicAssets.includes(url.pathname.slice(1))){
    const response=await env.ASSETS.fetch(new Request(url,{method:request.method,redirect:'manual'}));
    const headers=new Headers(response.headers);
    headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');
    headers.set('X-Robots-Tag','noindex, nofollow');headers.set('Referrer-Policy','no-referrer');
    return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
  }
  const portal=await servePortal(request,env);if(portal)return portal;
  // The release builder copies only reviewed public scripts/styles/artwork to
  // this content-addressed namespace. Documents and private APIs never enter it.
  if(/^\/_assets\/[a-f0-9]{64}\//.test(url.pathname)){
    if(!/^\/_assets\/[a-f0-9]{64}\/[-A-Za-z0-9_./]+\.(?:js|mjs|css|png|jpe?g|svg|webp|gif|ico|woff2?|ttf|otf|bcmap|pfb|wasm|json|webmanifest|map|ftl|txt|md|pdf|properties|bin)$/.test(url.pathname)||url.pathname.split('/').some(p=>p.startsWith('.')))return new Response('Not found',{status:404});
    const result=await env.ASSETS.fetch(request),headers=new Headers(result.headers);if(result.ok&&headers.get('Content-Type')?.includes('text/html'))return new Response('Not found',{status:404});
    if(result.ok&&!headers.get('Content-Type')?.includes('text/html'))headers.set('Cache-Control','public, max-age=31536000, immutable');
    headers.set('X-Content-Type-Options','nosniff');headers.set('X-Robots-Tag','noindex, nofollow');
    return new Response(request.method==='HEAD'?null:result.body,{status:result.status,headers});
  }
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
