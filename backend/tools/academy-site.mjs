import {withoutCookies,withoutSetCookie} from '../../security/v2/http-cookie-boundary.mjs';
import {heldForV111Cutover, offlineSecurityRequest, cutoverUnavailable} from '../../security/v2/cutover-state.mjs';
import {academyV2HTML} from '../src/academy/v111/html.mjs';
import {servePortal} from './portal-site.mjs';
import {assetPath} from './browser-site/worker.mjs';
import {publicPdfTarget} from './academy-public-media.mjs';
import {onRequestGet as catalogue} from '../../functions/academy/open-library/catalogue.js';
import {onRequestGet as publicPdf} from '../../functions/pdf-file/[encoded].js';
import {academyCirclesAlias,academyCirclesPages,academyCirclesFragments,academyRetiredPages,circlesPageUnavailable} from './academy-circles-routes.mjs';
export const siteVersion='111.12';
export const siteBranch='development';
export async function serveAcademySite(request,env,{pages=false,branch=siteBranch,syntheticOnly=false}={}){
  if(heldForV111Cutover(env)&&!offlineSecurityRequest(request,env,'academy'))return cutoverUnavailable();
  const url=new URL(request.url);
  if(env.UAA_V2_ENABLED==='1'){
    if(url.origin!=='https://ummabbadacademy.app')return new Response('Open Academy at its configured address.',{status:421});
    const servicePath=url.pathname.startsWith('/internal/auth/v2/')||url.pathname.startsWith('/internal/website/');
    if(servicePath&&(request.headers.has('Cookie')||request.headers.has('Origin'))){
      return Response.json({success:false,code:'SERVICE_TRANSPORT_ONLY'},{status:401,headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname.startsWith('/auth/v2/')||servicePath||url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/api/public/')){
      if(!env.ACADEMY_V2_SERVICE?.fetch)return Response.json({success:false,code:'ACADEMY_V2_SERVICE_REQUIRED'},{status:503,headers:{'Cache-Control':'no-store'}});
      return env.ACADEMY_V2_SERVICE.fetch(request);
    }
  }
  if(env.UAA_V2_ENABLED==='1'&&['GET','HEAD'].includes(request.method)){request=withoutCookies(request);const headers=new Headers(request.headers);headers.delete('If-None-Match');headers.delete('If-Modified-Since');request=new Request(request,{headers});}
  if(['/api/feature-preview/health','/api/site/health'].includes(url.pathname))return Response.json({success:true,version:siteVersion,branch,syntheticOnly},{headers:{'Cache-Control':'no-store'}});
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  const portal=await servePortal(request,env);if(portal)return academyV2HTML(request,env,withoutSetCookie(portal));
  // The release builder copies only reviewed public scripts/styles/artwork to
  // this content-addressed namespace. Documents and private APIs never enter it.
  if(/^\/_assets\/[a-f0-9]{64}\//.test(url.pathname)){
    if(!/^\/_assets\/[a-f0-9]{64}\/[-A-Za-z0-9_./]+\.(?:js|mjs|css|png|jpe?g|svg|webp|gif|ico|woff2?|ttf|otf|bcmap|pfb|wasm|json|webmanifest|map|ftl|txt|md|pdf|properties|bin)$/.test(url.pathname)||url.pathname.split('/').some(p=>p.startsWith('.')))return new Response('Not found',{status:404});
    const result=withoutSetCookie(await env.ASSETS.fetch(request)),headers=new Headers(result.headers);if(result.ok&&headers.get('Content-Type')?.includes('text/html'))return new Response('Not found',{status:404});
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
  const response=withoutSetCookie(await env.ASSETS.fetch(new Request(url,request)));
  if(document&&response.status===404)return circlesPageUnavailable(request.method);
  const headers=new Headers(response.headers);headers.set('X-Robots-Tag','noindex, nofollow');headers.set('X-Content-Type-Options','nosniff');
  if(document)headers.set('Cache-Control','no-store');
  if(env.UAA_V2_ENABLED==='1'&&['/js/m4l-v111-session.js','/js/m4l-v111-session.mjs'].includes(url.pathname))headers.set('Cache-Control','no-store');
  if(academyCirclesFragments.has(file)){headers.set('Content-Type','text/plain; charset=utf-8');headers.set('Cache-Control','no-cache');}
  return academyV2HTML(request,env,new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers}));
}
