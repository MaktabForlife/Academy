import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {monthlyFixture,scope} from './fixtures/academy-monthly-subscriptions-fixture.mjs';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const source=readFileSync(new URL('../../js/m4l-program-monthly-subscriptions.js',import.meta.url),'utf8');
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const settle=async()=>{for(let i=0;i<18;i++)await new Promise(r=>setImmediate(r));};
function dom(html){
 const {window,document}=parseHTML(html);
 Object.defineProperty(window.HTMLInputElement.prototype,'checked',{configurable:true,get(){return this.hasAttribute('checked');},set(v){this.toggleAttribute('checked',Boolean(v));}});
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value')||this.querySelector('option')?.getAttribute('value')||'';},set(v){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.getAttribute('value')===String(v));}});
 class TestFormData{constructor(form){this.values=new Map([...form.querySelectorAll('[name]')].map(i=>[i.name,i.value]));}get(key){return this.values.get(key)||null;}}
 return {window,document,FormData:TestFormData};
}
async function setup(){
 const f=await monthlyFixture(),token=await f.login('0001');ok(await f.monthly('configure',{mode:'prepare',policyRevision:0,operationId:crypto.randomUUID()},token));
 const d=dom('<html><body><section id="pg-people-tool"><section id="pm-main">Participants</section></section></body></html>'),calls=[],managed=[];let owner=token,loseResponse=false,hold=null;
 const fetch=async(url,options)=>{const input=JSON.parse(options.body);calls.push({url,input});if(hold)return new Promise(resolve=>{hold.resolve=()=>resolve(new Response(JSON.stringify({success:true,available:true,prepared:false,canConfigure:true,classes:[]})));});const result=await f.call(url,input,owner);if(loseResponse&&url.endsWith('/save')){loseResponse=false;throw Error('Lost save response');}return new Response(JSON.stringify(result.body),{status:result.status});};
 Object.assign(d.window,{M4L_CONFIG:{API_BASE:''},M4L_LESSON_MEDIA:{canLeave:()=>true,async manage(input){managed.push(input);}}});
 vm.runInNewContext(source,{...d,location:{search:'?participants=monthly'},localStorage:{getItem:()=>owner},fetch,crypto,URLSearchParams,Intl,Date,console});
 await d.window.M4L_PROGRAM_MONTHLY.select(scope.slice(8));await settle();
 const click=async(selector)=>{const target=d.document.querySelector(selector);assert(target,selector);target.dispatchEvent(new d.window.Event('click',{bubbles:true}));await settle();};
 const change=async(selector,value)=>{const target=d.document.querySelector(selector);assert(target,selector);if(target.type==='checkbox')target.checked=value;else target.value=value;target.dispatchEvent(new d.window.Event('change',{bubbles:true}));await settle();};
 return {...d,f,calls,managed,click,change,lose(){loseResponse=true;},hold(){hold={};return hold;},switchAccount(){owner='replacement';d.window.dispatchEvent(new d.window.Event('m4l-academy-session-ended'));}};
}
test('monthly UI guards month changes, saves only edited students and retries the exact lost-response operation',async()=>{
 const t=await setup();try{
  assert.equal(t.document.querySelector('[data-pms-panel]').hidden,false);assert.equal(t.document.getElementById('pm-main').hidden,true);
  await t.change('[data-pms-month]','2024-01');
  await t.change('[data-pms-account="account-0002"] [data-pms-field="subscribed"]',true);
  await t.change('[data-pms-account="account-0002"] [data-pms-field="paymentReference"]','JAN-2024');
  const calls=t.calls.length;await t.change('[data-pms-month]','2025-01');assert.equal(t.document.querySelector('[data-pms-month]').value,'2024-01');assert.equal(t.calls.length,calls);assert.equal(t.window.M4L_PROGRAM_MONTHLY.canLeave(),false);
  await t.click('[data-pms-action="review"]');t.lose();await t.click('[data-pms-action="save"]');assert(t.document.querySelector('[data-pms-action="retry"]'));assert.equal(t.window.M4L_PROGRAM_MONTHLY.canLeave(),false);
  await t.click('[data-pms-action="retry"]');assert.equal(t.window.M4L_PROGRAM_MONTHLY.canLeave(),true);
  const saved=t.calls.filter(c=>c.url.endsWith('/save'));assert.equal(saved.length,2);assert.equal(saved[0].input.operationId,saved[1].input.operationId);assert.equal(saved[0].input.entries.length,1);assert.equal(saved[0].input.entries[0].accountId,'account-0002');
  const rows=t.f.db.prepare('SELECT * FROM program_monthly_subscriptions').all();assert.equal(rows.length,1);assert.equal(rows[0].lesson_month,'2024-01');assert.equal(rows[0].payment_reference,'JAN-2024');
 }finally{t.f.db.close();}
});
test('historical media form creates an original 2025 date and opens the existing attachment editor',async()=>{
 const t=await setup();try{
  const form=t.document.querySelector('[data-pms-history-form]');form.querySelector('[name=date]').value='2025-03-18';form.querySelector('[name=title]').value='Earlier Tafseer recording';
  form.querySelector('[name=title]').dispatchEvent(new t.window.Event('input',{bubbles:true}));assert.equal(t.window.M4L_PROGRAM_MONTHLY.canLeave(),false);
  const previous=t.document.querySelector('[data-pms-month]').value;await t.change('[data-pms-month]','2024-01');assert.equal(t.document.querySelector('[data-pms-month]').value,previous);
  form.dispatchEvent(new t.window.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(t.managed.length,1);const row=t.f.db.prepare('SELECT * FROM lesson_media_lessons WHERE lesson_id=?').get(t.managed[0].lessonId);assert.equal(row.lesson_date,'2025-03-18');assert.equal(row.state,'DRAFT');assert.equal(t.document.querySelector('[data-pms-month]').value,'2025-03');assert.equal(JSON.parse(row.session_key)[0],'HISTORICAL');
 }finally{t.f.db.close();}
});
test('opening Monthly subscriptions preserves an unfinished existing participant edit',async()=>{
 const t=await setup();try{
  await t.click('[data-pms-tab="participants"]');t.window.M4L_PROGRAM_PEOPLE={canLeave:()=>false};
  await t.click('[data-pms-tab="monthly"]');assert.equal(t.document.querySelector('[data-pms-panel]').hidden,true);assert.equal(t.document.getElementById('pm-main').hidden,false);
 }finally{t.f.db.close();}
});
test('account switching clears the private register and ignores a delayed previous-account response',async()=>{
 const t=await setup();try{
  const held=t.hold();t.document.querySelector('[data-pms-action="refresh"]').dispatchEvent(new t.window.Event('click',{bubbles:true}));await settle();t.switchAccount();held.resolve();await settle();
  assert.equal(t.document.querySelector('[data-pms-content]').textContent,'');assert.equal(t.document.querySelector('[data-pms-tab="monthly"]').hidden,true);assert.equal(t.window.M4L_PROGRAM_MONTHLY.dirty(),false);
 }finally{t.f.db.close();}
});
test('learner paid-month screen distinguishes years and clears all visible media on account changes',async()=>{
 const f=await monthlyFixture();try{
  const admin=await f.login('0001'),student=await f.login('0002');ok(await f.monthly('configure',{mode:'prepare',policyRevision:0,operationId:crypto.randomUUID()},admin));
  for(const [month,revision] of [['2024-01',1],['2025-01',2]])ok(await f.monthly('save',{month,policyRevision:revision,operationId:crypto.randomUUID(),entries:[{accountId:'account-0002',subscribed:true,revision:0,classIds:['mou-class']}]},admin));
  ok(await f.monthly('configure',{mode:'activate',policyRevision:3,reviewed:true,operationId:crypto.randomUUID()},admin));
  const page=readFileSync(new URL('../../academy/monthly-media/index.html',import.meta.url),'utf8'),d=dom(page);let owner=student;
  d.window.M4L_LESSON_MEDIA={reset(){},canLeave:()=>true};d.window.M4L_CONFIG={API_BASE:''};
  vm.runInNewContext(readFileSync(new URL('../../js/m4l-monthly-media.js',import.meta.url),'utf8'),{...d,localStorage:{getItem:()=>owner},location:{search:''},URLSearchParams,Intl,console,fetch:async(url,options)=>{const result=await f.call(url,JSON.parse(options.body),owner);return new Response(JSON.stringify(result.body),{status:result.status});}});await settle();
  const labels=[...d.document.querySelectorAll('#monthly-month option')].map(o=>o.textContent);assert.deepEqual(labels,['January 2025','January 2024']);
  owner='';d.window.dispatchEvent(new d.window.Event('m4l-academy-session-ended'));await settle();assert.equal(d.document.getElementById('monthly-lessons').textContent,'');assert.match(d.document.getElementById('monthly-message').textContent,/Sign in/);
 }finally{f.db.close();}
});
