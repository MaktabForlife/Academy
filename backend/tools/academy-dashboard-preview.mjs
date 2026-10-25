// Serve feature-branch assets locally against the existing Development API.
// No deployment, credentials, database migration or record mutation at startup.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const port=Number(process.env.ACADEMY_DASHBOARD_PORT||4179);
const upstream='https://devrebootworker.maktab4life.workers.dev';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.pdf':'application/pdf','.mp3':'audio/mpeg','.mp4':'video/mp4'};
const directories=new Set(['academy','account','programs','users','recorder','activities','js','css','images','assets','icons','fonts','pdf-viewer']);
const publicFiles=new Set(['version.json','ummabbadacademy.png','academy.png','favicon.ico','manifest.webmanifest','sw.js']);
const forwarded=['authorization','content-type','x-academy-workspace','x-academy-class','x-academy-setup','x-academy-read-cache','x-academy-read-revision','range'];
const server=createServer(async(request,response)=>{
 try{
  const url=new URL(request.url,'http://127.0.0.1:'+port);
  response.setHeader('Cache-Control','no-store');response.setHeader('X-Robots-Tag','noindex, nofollow');response.setHeader('X-Content-Type-Options','nosniff');
  if(url.pathname==='/'){response.writeHead(302,{Location:'/academy/#timetable/learn'});response.end();return;}
  if(url.pathname.startsWith('/api/')){
   const origin=request.headers.origin;
   if(origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(origin)){response.writeHead(403);response.end('Local preview origin required');return;}
   if(!['GET','HEAD','POST','OPTIONS'].includes(request.method)){response.writeHead(405);response.end();return;}
   const headers={};for(const name of forwarded)if(request.headers[name])headers[name]=request.headers[name];
   const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>32*1024*1024){response.writeHead(413);response.end('Preview upload limit exceeded');return;}chunks.push(chunk);}
   const result=await fetch(upstream+url.pathname+url.search,{method:request.method,headers,...(['GET','HEAD'].includes(request.method)?{}:{body:Buffer.concat(chunks)}),redirect:'manual',signal:AbortSignal.timeout(90000)});
   for(const name of ['content-type','content-disposition','content-range','accept-ranges','etag','retry-after'])if(result.headers.has(name))response.setHeader(name,result.headers.get(name));
   response.statusCode=result.status;response.end(request.method==='HEAD'?undefined:Buffer.from(await result.arrayBuffer()));return;
  }
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
  let pathname=decodeURIComponent(url.pathname);
  if(pathname.split('/').some(part=>part.startsWith('.'))){response.writeHead(404);response.end();return;}
  const first=pathname.split('/')[1];
  if(!directories.has(first)&&!publicFiles.has(pathname.slice(1))){response.writeHead(404);response.end();return;}
  let path=resolve(root,'.'+pathname);
  if(!path.startsWith(root+'/')){response.writeHead(404);response.end();return;}
  if((await stat(path)).isDirectory())path+='/index.html';
  if(!mime[extname(path)]){response.writeHead(404);response.end();return;}
  response.setHeader('Content-Type',mime[extname(path)]);response.end(request.method==='HEAD'?undefined:await readFile(path));
 }catch(error){response.statusCode=error.code==='ENOENT'?404:502;response.setHeader('Content-Type','application/json');response.end(JSON.stringify({success:false,error:response.statusCode===404?'Not found':'The Academy service could not be reached. Try again.'}));}
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
console.log('Connected dashboard preview: http://127.0.0.1:'+port+'/academy/#timetable/learn');
console.log('Feature-branch files only; API: existing Academy Development. Sign in normally.');
await new Promise(done=>{process.once('SIGINT',done);process.once('SIGTERM',done);});
await new Promise(done=>server.close(done));
