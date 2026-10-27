import test from 'node:test';
import assert from 'node:assert/strict';
import preview from '../tools/mobile-first-preview/worker.mjs';
import {mobileFirstFixture} from '../tools/mobile-first-preview/fixture.mjs';
const origin='https://academy-mobile-first-preview.maktab4life.workers.dev';
const configure=f=>Object.assign(f.env,{ACADEMY_DEPLOYMENT_KIND:'ISOLATED_PREVIEW',PREVIEW_SYNTHETIC_ONLY:'1',PREVIEW_ORIGIN:origin,PREVIEW_VERSION:'107.95',ALLOWED_ORIGINS:origin,PREVIEW_PIN:'1234'});
const request=(path,options)=>new Request(origin+path,options);

test('preview offers three real sample sessions and opens Admin directly in Admin-Teach',async()=>{
 const f=await mobileFirstFixture();try{
  const env=configure(f),landing=await preview.fetch(request('/'),env),html=await landing.text();
  for(const label of ['Open Learn','Open Teach','Open Admin'])assert(html.includes(label));
  assert.match(landing.headers.get('Cache-Control'),/no-store/);assert.match(landing.headers.get('X-Robots-Tag'),/noindex/);
  for(const [who,target] of [['studentA','/academy/#timetable/learn'],['teacherA','/academy/#activity/PROGRAM/'],['global','/academy/admin/#activity/PROGRAM/']]){
   const response=await preview.fetch(request('/__signin/'+who),env),body=await response.text();assert.equal(response.status,200);assert(body.includes(target));
   const match=body.match(/localStorage\.setItem\("m4l_account_token",("[^"<>]+")\)/);assert(match,'Real login must issue a sample token');const token=JSON.parse(match[1]);
   const entrance=await preview.fetch(request('/api/academy/entrance',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Academy-Workspace':who==='global'?'ADMIN_TEACH':who==='teacherA'?'TEACH':'LEARN'},body:'{}'}),env),account=await entrance.json();
   assert.equal(account.success,true);assert.equal(account.signedIn,true);assert.equal(account.profile.name,'Synthetic '+who);assert.equal(account.workspaceAccess.globalAdmin,who==='global');
   if(who==='global'){assert(body.includes('/teach/planning'));assert.equal(account.workspace,'ADMIN_TEACH');}
  }
 }finally{f.close();}
});

test('sample Admin sign-in stays inside the isolated preview and the fixed sample allowlist',async()=>{
 const f=await mobileFirstFixture();try{
  const env=configure(f),sessions=f.db.prepare('SELECT count(*) n FROM account_sessions').get().n;
  for(const [req,configuration,status] of [
   [request('/__signin/global'),{...env,PREVIEW_SYNTHETIC_ONLY:'0'},503],
   [new Request('https://live.invalid/__signin/global'),env,503],
   [request('/__signin/global',{headers:{Origin:'https://live.invalid'}}),env,403],
   [request('/__signin/global',{method:'POST'}),env,405],
   [request('/__signin/adminA'),env,404],
   [request('/__signin/not-a-sample'),env,404]
  ])assert.equal((await preview.fetch(req,configuration)).status,status);
  assert.equal(f.db.prepare('SELECT count(*) n FROM account_sessions').get().n,sessions);
 }finally{f.close();}
});
