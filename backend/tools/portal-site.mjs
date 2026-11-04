import {hosting} from '../src/academy/hosting.mjs';
import files from '../../portal/assets.json' with {type:'json'};
const paths=new Set(files.map(p=>'/'+p));
const jsonHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function servePortal(request,env,{fetcher=fetch}={}){
 const url=new URL(request.url),h=hosting(),p=url.pathname;
 const asset=async(path)=>{const next=new URL(request.url);next.pathname=path;next.search='';const response=await env.ASSETS.fetch(new Request(next,{method:request.method,headers:request.headers}));const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');if(path.endsWith('.html'))headers.set('Cache-Control','no-store');return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});};
 if(['/','/index.html'].includes(p))return asset('/index.html');
 if(p==='/hosting-config.js')return new Response(request.method==='HEAD'?null:'globalThis.AcademyHosting=Object.freeze('+JSON.stringify(h)+');',{headers:{...jsonHeaders,'Content-Type':'text/javascript; charset=utf-8'}});
 if(p==='/academy/studio-authorize/'||p==='/academy/studio-authorize')return asset('/studio-authorize.html');
 if(p==='/studio'||p.startsWith('/studio/')||p==='/circles/free-learning.html'||['/circles/academy/mothers/surah-al-baqarah/','/circles/academy/mothers/surah-al-baqarah/index.html'].includes(p))return asset('/studio-enter.html');
 if(p.startsWith('/portal/')&&['studio-authorize.mjs','studio-enter.mjs'].includes(p.slice(8)))return asset(p);
 if(/^\/circles\/(?:prospectus[^/]*|memorisation[^/]*)\.html$/.test(p))return new Response(null,{status:302,headers:{Location:h.studioOrigin+p+url.search,'Cache-Control':'no-store'}});
 if(paths.has(p)&&!p.endsWith('.html')&&!p.endsWith('provenance.json')&&!p.endsWith('assets.json'))return asset(p);
 let upstream;
 if(p==='/api/public/header-date')upstream=new URL('/api/academy/header-date',h.academyApiOrigin);
 else if(p==='/api/public/academy-announcements')upstream=new URL('/api/academy/announcements/published',h.academyApiOrigin);
 else if(/^\/api\/public\/academy-announcements\/(?:image|pdf)$/.test(p))upstream=new URL('/api/academy/announcements/'+p.split('/').at(-1),h.academyApiOrigin);
 else if(['/api/public/home','/api/public/circles'].includes(p)||/^\/api\/public\/circles\/covers\/[a-f0-9]{64}$/.test(p))upstream=new URL(p,h.studioBackendOrigin);
 if(!upstream)return null;
 upstream.search=url.search;const headers=new Headers();for(const name of ['Accept','Range','If-None-Match','If-Modified-Since'])if(request.headers.has(name))headers.set(name,request.headers.get(name));
 headers.set('X-Maktab-Front-Door',new URL(h.studioOrigin).host);
 // This relay only serves explicitly public snapshots/artwork. No credentials,
 // database binding, dynamic upstream, method replay or private cache is used.
 try{const response=await fetcher(new Request(upstream,{method:request.method,headers,redirect:'manual',signal:AbortSignal.timeout(p==='/api/public/header-date'?20000:8000)}));return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers:response.headers});}
 catch{return new Response('This information is temporarily unavailable.',{status:503,headers:jsonHeaders});}
}
