import test from 'node:test';
import assert from 'node:assert/strict';
import {serveAcademySite} from '../tools/academy-site.mjs';
import {academyCirclesPages,academyCirclesFragments,academyRetiredPages} from '../tools/academy-circles-routes.mjs';
import {academyPublishableAsset,validateCirclesPresentation} from '../tools/academy-assets.mjs';
const origin='https://academy.invalid';
const noDB=new Proxy({},{get:(_target,name)=>{throw Error('Unexpected binding access: '+String(name));}});
test('public and old workspace entry aliases use fixed destinations with zero binding reads',async()=>{
 for(const [path,target]of [['/?return=https://evil.invalid&token=private','https://maktab4life.org/'],['/index.html','https://maktab4life.org/'],['/admin/','https://academy.invalid/academy/admin/'],['/student/','https://academy.invalid/academy/']]){
  const r=await serveAcademySite(new Request(origin+path),noDB);assert.equal(r.status,302);assert.equal(r.headers.get('Location'),target);assert.equal(r.headers.get('Cache-Control'),'no-store');
 }
 assert.equal((await serveAcademySite(new Request(origin+'/programs/timetable.html',{method:'POST'}),noDB)).status,405);
});
test('retired Program direct links retain exact identity and legitimate subtab at the current workspace',async()=>{
 for(const [name,tab]of [['timetable','timetable'],['manage','participants'],['lesson-media','media']]){
  const r=await serveAcademySite(new Request(origin+'/programs/'+name+'.html?program=exact%3Aid&classes=one%2Ctwo&return=https%3A%2F%2Fevil.invalid'),noDB),next=new URL(r.headers.get('Location'));
  assert.equal(next.origin,origin);assert.equal(next.pathname,'/programs/');assert.equal(next.searchParams.get('program'),'exact:id');assert.equal(next.searchParams.get('classes'),'one,two');assert.equal(next.searchParams.get('tab'),tab);
 }
 for(const tab of ['curriculum','classes','public-card','review']){const r=await serveAcademySite(new Request(origin+'/programs/timetable.html?program=one&tab='+tab),noDB);assert.equal(new URL(r.headers.get('Location')).searchParams.get('tab'),tab);}
});
test('Library and availability aliases retain context without selecting a legacy placeholder',async()=>{
 for(const [path,next]of [['/programs/library.html','/academy/library/'],['/programs/library-view.html','/academy/library/'],['/programs/media.html','/academy/media/'],['/academy/teaching/','/academy/calendar/']]){
  const r=await serveAcademySite(new Request(origin+path+'?program=one&mode=teach'),noDB),url=new URL(r.headers.get('Location'));assert.equal(url.pathname,next);assert.equal(url.searchParams.get('program'),'one');assert.equal(url.searchParams.get('mode'),'teach');
 }
});
test('retired operator/demo and unknown document routes recover in Circles without fetching any assets or data',async()=>{
 for(const path of ['/academy/pdf-icon-samples/','/academy/website-platform/handover/','/academy/unregistered/','/academy/unregistered.html','/missing']){
  const r=await serveAcademySite(new Request(origin+path),noDB);assert.equal(r.status,404);const html=await r.text();assert.match(html,/https:\/\/maktab4life.org\//);assert.doesNotMatch(html,/#overview|concept=circle|<script|Loading Academy information/);
 }
 const head=await serveAcademySite(new Request(origin+'/missing',{method:'HEAD'}),noDB);assert.equal(head.status,404);assert.equal(await head.text(),'');
});
test('only exact declared component fragments are served as text and never as independent HTML pages',async()=>{
 let calls=0;const env={ASSETS:{fetch:async request=>{calls++;assert.match(new URL(request.url).pathname,/\.fragment$/);return new Response('<main id="native-tool">Existing tool</main>',{headers:{'Content-Type':'text/html'}});}}};
 for(const file of academyCirclesFragments){const r=await serveAcademySite(new Request(origin+'/'+file),env,{pages:true});assert.equal(r.status,200);assert.match(r.headers.get('Content-Type'),/^text\/plain/);assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');}
 assert.equal(calls,3);assert.equal((await serveAcademySite(new Request(origin+'/programs/fragments/unregistered.fragment'),noDB)).status,404);
});
test('the production allowlist retains functional tools and Hifz handoff while rejecting accidental new full pages',()=>{
 assert.equal(academyCirclesPages.size,31);assert.equal(academyRetiredPages.size,9);
 for(const file of academyCirclesPages)assert(academyPublishableAsset(file));
 for(const file of academyRetiredPages)assert.equal(academyPublishableAsset(file),false);
 for(const file of academyCirclesFragments)assert(academyPublishableAsset(file));
 assert(academyPublishableAsset('academy/hifz/index.html'));assert(academyPublishableAsset('pdf-viewer/web/viewer.html'));
 assert.throws(()=>academyPublishableAsset('academy/preview/index.html'),/UNAPPROVED_ACADEMY_HTML/);assert.throws(()=>academyPublishableAsset('programs/fragments/unregistered.fragment'),/UNAPPROVED_ACADEMY_FRAGMENT/);
});
test('production gates require the shared native shell and prevent old hidden pages from remaining in the bundle',()=>{
 const shell='<html data-circles-native="true"><head><script src="/js/m4l-circles-native.js"></script></head><body><main id="activity"></main></body></html>';
 validateCirclesPresentation('academy/index.html',shell);validateCirclesPresentation('academy/hifz/index.html','<html>Existing external handoff</html>');
 assert.throws(()=>validateCirclesPresentation('academy/index.html','<html><body>Old shell</body></html>'),/CIRCLES_SHELL_REQUIRED/);
 assert.throws(()=>validateCirclesPresentation('academy/admin/index.html',shell.replace('id="activity"','id="overview" hidden')),/LEGACY_VIEW_IN_BUNDLE/);
 validateCirclesPresentation('programs/fragments/timetable.fragment','<link rel="stylesheet" href="/css/native-tool.css"><main id="timetable"></main><dialog id="edit"></dialog>');
 for(const value of ['<!doctype html>','<html>','<head>','<body>','<script src="/js/legacy.js"></script>'])assert.throws(()=>validateCirclesPresentation('programs/fragments/timetable.fragment',value),/FRAGMENT_IS_A_PAGE/);
});
