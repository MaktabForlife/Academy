import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {mayReadSurah,surahWebsiteLinks} from '../src/academy/d1/surah-websites-access.js';
import {selectWorkspace} from '../src/academy/d1/workspace-access.js';
import {monthlyFixture,scope} from './fixtures/academy-monthly-subscriptions-fixture.mjs';
import worker from '../src/academy-runtime.js';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const href='/academy/course-websites/view/?program=PRG-one&surah=11111111-1111-4111-8111-111111111111';
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
test('an Admin with an empty Tafseer register gets management actions instead of requesting access; students get no management links',async()=>{
 const f=await monthlyFixture();try{
  const admin=await f.login('0001'),scoped=await f.login('0004'),student=await f.login('0002');
  for(const token of [admin,scoped])for(const workspace of ['LEARN','TEACH','ADMIN','ADMIN_LEARN','ADMIN_TEACH']){
   const response=await worker.fetch(new Request('http://localhost/api/academy/tafseer-links',{method:'POST',headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':workspace,'Content-Type':'application/json'},body:'{}'}),f.env);
   assert.equal(response.status,200);const value=await response.json();assert.equal(value.websites.length,0);
   assert.equal(Object.keys(value.links).length,8);assert.equal(value.links.yaseen.label,'Manage websites');assert.equal(value.links.yaseen.href,'/programs/?program='+encodeURIComponent(scope.slice(8))+'&tab=media');
  }
  const noAccess=await f.call('/api/academy/tafseer-links',{},student);assert.deepEqual(noAccess.body.links,{});
  const id=crypto.randomUUID();assert.equal((await f.monthly('configure',{mode:'prepare',policyRevision:0,operationId:crypto.randomUUID()},admin)).status,200);
  assert.equal((await f.monthly('surah-save',{policyRevision:1,operationId:crypto.randomUUID(),entries:[{id,name:'Surah Yaseen',cardKey:'yaseen',completionDate:'2025-01-01',active:true,revision:0}]},admin)).status,200);
  const pending=await f.call('/api/academy/tafseer-links',{},admin);assert.equal(pending.body.links.yaseen.label,'Edit website');assert.equal(pending.body.websites.length,0);
 }finally{f.db.close();}
});
test('real Global and Program Admin authority opens every own-scope surah across personal and Admin dashboards without paid months',()=>{
 const own='PROGRAM:tafseer',row={activity_key:own,completion_date:'2024-01-18',monthly_enabled:0};
 for(const global_admin of [true,false])for(const workspace of ['LEARN','TEACH','ADMIN','ADMIN_LEARN','ADMIN_TEACH']){
  const state={account:{global_admin},roles:global_admin?[]:[{activity_key:own,role:'PROGRAM_ADMIN'}],activities:[{activity_key:own}],subscriptions:[],monthlyMedia:[]};
  const auth=selectWorkspace(new Request('http://localhost/api/academy/tafseer-links',{headers:{'X-Academy-Workspace':workspace}}),{state});
  for(const month of ['2024-01-18','2025-02-18','2026-10-18'])assert.equal(mayReadSurah(auth,{...row,completion_date:month}),true,`${global_admin?'Global':'Program'} Admin in ${workspace}`);
  assert.equal(mayReadSurah(auth,{...row,activity_key:'PROGRAM:other'}),global_admin,'Program authority cannot widen to another Program');
 }
 const state={account:{},roles:[],monthlyMedia:[]};
 assert.equal(mayReadSurah({state,authority:state,workspace:'LEARN'},row),false,'An account without current Admin authority or a paid month is still denied');
});
test('completion-month access follows the real paid account across personal dashboards and keeps Admin previews scoped',async()=>{
 const state={account:{},roles:[],monthlyMedia:[]},authority={...state,monthlyMedia:[{activity_key:'PROGRAM:one',lesson_month:'2024-01'}]},row={activity_key:'PROGRAM:one',completion_date:'2024-01-18',monthly_enabled:1};
 assert.equal(mayReadSurah({state,authority,workspace:'TEACH'},row),true);
 assert.equal(mayReadSurah({state,authority,workspace:'LEARN'},row),true);
 assert.equal(mayReadSurah({state,authority,workspace:'LEARN',adminView:true},row),false);
 assert.equal(mayReadSurah({state,authority,workspace:'TEACH'},{...row,completion_date:'2025-01-18'}),false);
 assert.equal(mayReadSurah({state,authority,workspace:'TEACH'},{...row,monthly_enabled:0}),false);
 assert.deepEqual(await surahWebsiteLinks({},null),{links:{},websites:[]});
});
test('card destinations preserve summaries, load once and clear on account changes including late replies',async()=>{
 const {window,document}=parseHTML('<html><body><article data-tafseer-card="yaseen"><p>Website summary</p><button disabled class="tf-card-action tf-card-pending" data-tafseer-link="yaseen"><span>Coming soon</span><svg></svg></button></article></body></html>');
 let token='first',release,calls=0;
 vm.runInNewContext(readFileSync(new URL('../../js/m4l-tafseer-access.js',import.meta.url),'utf8'),{window,document,MutationObserver:window.MutationObserver,localStorage:{getItem:()=>token},fetch:async()=>{calls++;return new Promise(resolve=>{release=()=>resolve(Response.json({success:true,links:{yaseen:{href}}}));});}});
 await settle();assert.equal(calls,1);
 window.M4L_TAFSEER_ACCESS.setLinks({yaseen:{href}});await settle();
 assert.equal(document.querySelector('[data-tafseer-link]').tagName,'A');assert.equal(document.querySelector('p').textContent,'Website summary');assert(document.querySelector('svg'));
 token='';window.dispatchEvent(new window.Event('m4l-academy-session-ended'));release();await settle();
 assert.equal(document.querySelector('[data-tafseer-link]').tagName,'BUTTON');assert.equal(document.querySelector('[data-tafseer-link]').getAttribute('href'),null);assert.equal(calls,1);
 window.M4L_TAFSEER_ACCESS.setLinks({yaseen:{href:'https://external.invalid/unsafe'}});await settle();assert.equal(document.querySelector('[data-tafseer-link]').tagName,'BUTTON');
});
