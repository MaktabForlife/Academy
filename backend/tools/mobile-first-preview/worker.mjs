// Dedicated synthetic preview only. Never bind this entrypoint to live Academy storage.
import academy from '../../src/academy-runtime.js';
import {assetPath,publicPdfTarget} from '../browser-site/worker.mjs';
import {onRequestGet as catalogue} from '../../../functions/academy/open-library/catalogue.js';
import {onRequestGet as publicPdf} from '../../../functions/pdf-file/[encoded].js';

function protect(response,method='GET') {
  const headers=new Headers(response.headers);
  headers.set('Cache-Control','private, no-store');
  headers.set('X-Robots-Tag','noindex, nofollow');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','no-referrer');
  headers.set('Content-Security-Policy',"connect-src 'self' https://archive.org https://*.archive.org https://cdnjs.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net; form-action 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'");
  return new Response(method==='HEAD'?null:response.body,{status:response.status,headers});
}
const html=body=>new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Learn and Teach · Mobile preview</title><style>body{margin:0;background:#f4edf5;color:#302136;font:18px/1.6 system-ui,sans-serif}main{max-width:34rem;margin:8vh auto;padding:1.5rem}h1{font-size:2rem;line-height:1.2}a{display:block;background:#754582;color:white;text-decoration:none;border-radius:1rem;padding:1rem 1.3rem;margin:1rem 0;text-align:center;font-weight:700;min-height:28px}small{display:block}p{max-width:32rem}</style></head><body><main>'+body+'</main></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}});

export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url),finish=response=>protect(response,request.method);
    if(env.ACADEMY_DEPLOYMENT_KIND!=='ISOLATED_PREVIEW'||env.PREVIEW_SYNTHETIC_ONLY!=='1'||url.origin!==env.PREVIEW_ORIGIN)return finish(new Response('Preview configuration required',{status:503}));
    const origin=request.headers.get('Origin');
    if(origin&&origin!==url.origin)return finish(new Response('Preview origin required',{status:403}));
    if(url.pathname==='/__preview/health')return finish(Response.json({success:true,version:env.PREVIEW_VERSION,branch:'feature/academy-mobile-first',base:'107.84',syntheticOnly:true}));
    if(url.pathname.startsWith('/__signin/')) {
      if(request.method!=='GET')return finish(new Response('Use GET',{status:405}));
      const role={'/__signin/teacherA':'teacherA','/__signin/studentA':'studentA','/__signin/global':'global'}[url.pathname];
      if(!role)return finish(new Response('Sample account not found',{status:404}));
      const response=await academy.fetch(new Request(new URL('/api/account/login',url),{method:'POST',headers:{'Content-Type':'application/json','Origin':url.origin},body:JSON.stringify({uniqueid:'separation-'+role,pin:env.PREVIEW_PIN})}),env,ctx);
      const result=await response.json();
      if(!result.success||typeof result.token!=='string')return finish(html('<h1>Preview sign-in is busy</h1><p>Please try again in a minute.</p><a href="/">Return to preview</a>'));
      const target=role==='global'?'/academy/admin/#activity/PROGRAM/PRG-11111111-1111-4111-8111-111111111111/teach/planning':role==='teacherA'?'/academy/#activity/PROGRAM/PRG-11111111-1111-4111-8111-111111111111/teach/planning':'/academy/#timetable/learn';
      // Tokens are minted by the real login flow, with preview-only credentials.
      return finish(html('<p>Opening your sample '+(role==='global'?'Admin':role==='teacherA'?'Teach':'Learn')+' workspace…</p><script>localStorage.clear();sessionStorage.clear();localStorage.setItem("m4l_account_token",'+JSON.stringify(result.token)+');location.replace('+JSON.stringify(target)+');</script>'));
    }
    // Public titles come from Archive.org; this preview has no private Library coordinator.
    if(url.pathname==='/api/academy/open-library/metadata/public'&&request.method==='GET')return finish(Response.json({success:true,records:[]}));
    if(url.pathname.startsWith('/api/'))return finish(await academy.fetch(request,env,ctx));
    if(!['GET','HEAD'].includes(request.method))return finish(new Response('Method not allowed',{status:405}));
    if(url.pathname==='/')return finish(html('<small>Umm Abbad Academy · V'+env.PREVIEW_VERSION+' preview</small><h1>Try Learn, Teach and Admin on your phone</h1><p>Choose a sample account. You can explore the Contents menu, swipe the timetable and try lesson plans and the Admin badge.</p><a href="/__signin/studentA">Open Learn</a><a href="/__signin/teacherA">Open Teach</a><a href="/__signin/global">Open Admin</a><p><strong>Sample data only.</strong> Changes here are saved in this preview. Use this page to switch between the sample accounts.</p>'));
    if(url.pathname==='/js/m4l-config.js')return finish(new Response('window.M4L_CONFIG=Object.freeze({API_BASE:location.origin,ENV_NAME:"mobile-first-preview",IS_DEVELOPMENT:true,IS_PRODUCTION:false,ACCEPTED_SETUP:true,NATIVE_ATTENDANCE:true,MEDIA_SEPARATION:true,LEARNING_OPERATIONS:3});',{headers:{'Content-Type':'text/javascript'}}));
    if(url.pathname==='/academy/open-library/catalogue')return finish(await catalogue());
    if(url.pathname.startsWith('/pdf-file/')){
      const encoded=url.pathname.slice('/pdf-file/'.length);
      if(!publicPdfTarget(encoded))return finish(new Response('Public Archive.org PDF required',{status:403}));
      return finish(await publicPdf({request,params:{encoded}}));
    }
    const path=assetPath(url.pathname);
    if(!path)return finish(new Response('Not found',{status:404}));
    const assetUrl=new URL(url);assetUrl.pathname=path;
    return finish(await env.ASSETS.fetch(new Request(assetUrl,{method:request.method,headers:request.headers})));
  }
};
