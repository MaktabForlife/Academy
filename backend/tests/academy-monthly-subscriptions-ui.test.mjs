import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {grantsFixture} from './fixtures/academy-surah-grants-fixture.mjs';
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
async function setup({grants=false}={}){
 const f=await (grants?grantsFixture():monthlyFixture()),token=grants?f.admin:await f.login('0001');if(!grants)ok(await f.monthly('configure',{mode:'prepare',policyRevision:0,operationId:crypto.randomUUID()},token));
 const d=dom('<html><body><section id="pg-people-tool"><section id="pm-main">Participants</section></section></body></html>'),calls=[],managed=[];let owner=token,loseResponse=false,hold=null;
 const fetch=async(url,options)=>{const input=JSON.parse(options.body);calls.push({url,input});if(hold)return new Promise(resolve=>{hold.resolve=()=>resolve(new Response(JSON.stringify({success:true,available:true,prepared:false,canConfigure:true,classes:[]})));});const result=await f.call(url,input,owner);if(loseResponse&&(url.endsWith('/grid-save')||url.endsWith('/surah-grants-save'))){loseResponse=false;throw Error('Lost save response');}return new Response(JSON.stringify(result.body),{status:result.status});};
 Object.assign(d.window,{M4L_PROGRAM_PEOPLE:{canLeave:()=>true},M4L_CONFIG:{API_BASE:''},M4L_LESSON_MEDIA:{canLeave:()=>true,async manage(input){managed.push(input);}}});
 vm.runInNewContext(source,{...d,location:{search:'?participants=monthly'},localStorage:{getItem:()=>owner},fetch,crypto,URLSearchParams,Intl,Date,console});
 await d.window.M4L_PROGRAM_MONTHLY.select(scope.slice(8));await settle();
 const click=async(selector)=>{const target=d.document.querySelector(selector);assert(target,selector);target.dispatchEvent(new d.window.Event('click',{bubbles:true}));await settle();};
 const change=async(selector,value)=>{const target=d.document.querySelector(selector);assert(target,selector);if(target.type==='checkbox')target.checked=value;else target.value=value;target.dispatchEvent(new d.window.Event('change',{bubbles:true}));await settle();};
 const search=async(value)=>{d.document.querySelector('[data-pms-search]').value=value;d.document.querySelector('[data-pms-search-form]').dispatchEvent(new d.window.Event('submit',{bubbles:true,cancelable:true}));await settle();};
 return {...d,f,calls,managed,click,change,search,lose(){loseResponse=true;},hold(){hold={};return hold;},switchAccount(){owner='replacement';d.window.dispatchEvent(new d.window.Event('m4l-academy-session-ended'));}};
}
test('grid expands years, preserves hidden edits through search and retries the exact cross-year save',async()=>{
 const t=await setup();try{
  assert.equal(t.document.querySelector('[data-pms-panel]').hidden,false);assert.equal(t.document.getElementById('pm-main').hidden,true);
  assert.equal(t.document.querySelectorAll('[data-pms-cell]').length,0);
  for(const year of ['2024','2025','2026'])assert.equal(t.document.querySelector('[data-pms-year="'+year+'"]').getAttribute('aria-expanded'),'false');
  await t.click('[data-pms-year="2024"]');assert.equal(t.document.querySelectorAll('[data-pms-cell][data-account="account-0002"]').length,12);
  await t.change('[data-pms-cell][data-account="account-0002"][data-month="2024-01"]',true);
  await t.click('[data-pms-year="2024"]');assert.equal(t.document.querySelectorAll('[data-pms-cell]').length,0);assert.match(t.document.querySelector('tbody').textContent,/1 \/ 12/);
  await t.search('0008');assert.equal(t.document.querySelectorAll('tbody tr').length,1);assert.match(t.document.querySelector('[data-pms-delta]').textContent,/outside this search/);
  await t.click('[data-pms-year="2025"]');await t.change('[data-pms-cell][data-account="account-0008"][data-month="2025-02"]',true);
  await t.search('0002');await t.click('[data-pms-year="2024"]');
  assert.equal(t.document.querySelector('[data-pms-cell][data-account="account-0002"][data-month="2024-01"]').checked,true);assert.match(t.document.querySelector('[data-pms-delta]').textContent,/2 unsaved/);
  assert.equal(t.window.M4L_PROGRAM_MONTHLY.canLeave(),false);
  t.lose();await t.click('[data-pms-action="save"]');assert(t.document.querySelector('[data-pms-action="retry"]'));assert.equal(t.window.M4L_PROGRAM_MONTHLY.canLeave(),false);
  await t.click('[data-pms-action="retry"]');assert.equal(t.window.M4L_PROGRAM_MONTHLY.canLeave(),true);
  const saved=t.calls.filter(c=>c.url.endsWith('/grid-save'));assert.equal(saved.length,2);assert.deepEqual(saved[0].input,saved[1].input);assert.equal(saved[0].input.entries.length,2);
  const rows=t.f.db.prepare('SELECT account_id,lesson_month FROM program_monthly_subscriptions ORDER BY account_id').all();
  assert.deepEqual(rows.map(r=>[r.account_id,r.lesson_month]),[['account-0002','2024-01'],['account-0008','2025-02']]);
 }finally{t.f.db.close();}
});
test('whole-year checkbox selects 12 months, allows exceptions and saves several students together',async()=>{
 const t=await setup();try{
  const year=(account,y)=>'[data-pms-year-cell][data-account="'+account+'"][data-year="'+y+'"]';
  const month=(account,m)=>'[data-pms-cell][data-account="'+account+'"][data-month="'+m+'"]';
  await t.change(year('account-0002',2024),true);
  assert.equal(t.document.querySelector(year('account-0002',2024)).checked,true);assert.equal(t.document.querySelector(year('account-0002',2024)).indeterminate,false);
  assert.match(t.document.querySelector('[data-pms-delta]').textContent,/12 unsaved/);
  await t.click('[data-pms-year="2024"]');
  assert.equal([...t.document.querySelectorAll('[data-pms-cell][data-account="account-0002"]')].filter(c=>c.checked).length,12);
  await t.change(month('account-0002','2024-03'),false);
  assert.equal(t.document.querySelector(year('account-0002',2024)).checked,false);assert.equal(t.document.querySelector(year('account-0002',2024)).indeterminate,true);
  assert.equal(t.document.querySelector(year('account-0002',2024)).getAttribute('aria-checked'),'mixed');
  await t.click('[data-pms-year="2024"]');await t.search('0008');
  await t.change(year('account-0008',2025),true);await t.search('0002');await t.click('[data-pms-year="2024"]');
  assert.equal(t.document.querySelector(month('account-0002','2024-03')).checked,false);
  assert.equal(t.document.querySelector(month('account-0002','2024-04')).checked,true);
  await t.click('[data-pms-action="save"]');
  const calls=t.calls.filter(c=>c.url.endsWith('/grid-save'));assert.equal(calls.length,1);assert.equal(calls[0].input.entries.length,23);
  const rows=t.f.db.prepare('SELECT account_id,lesson_month FROM program_monthly_subscriptions WHERE active=1').all();
  assert.equal(rows.filter(r=>r.account_id==='account-0002').length,11);assert.equal(rows.filter(r=>r.account_id==='account-0008').length,12);
  assert.equal(rows.some(r=>r.lesson_month==='2024-03'),false);assert.equal(rows.some(r=>r.lesson_month.startsWith('2026')),false);
  assert.equal(t.document.querySelector(year('account-0002',2024)).indeterminate,true);
 }finally{t.f.db.close();}
});
test('whole-year clearing only revokes saved months and keeps removal safeguards',async()=>{
 const t=await setup();try{
  const selector='[data-pms-year-cell][data-account="account-0002"][data-year="2025"]';
  await t.change(selector,true);await t.change(selector,false);assert.equal(t.window.M4L_PROGRAM_MONTHLY.dirty(),false);
  await t.change(selector,true);await t.click('[data-pms-action="save"]');
  assert.equal(t.document.querySelector(selector).checked,true);
  await t.change(selector,false);await t.click('[data-pms-action="save"]');
  assert.equal(t.calls.filter(c=>c.url.endsWith('/grid-save')).length,1);
  assert.match(t.document.querySelector('[data-pms-review]').textContent,/12 paid month/);
  t.document.querySelector('[data-pms-removal-reason]').value='Wrong year entered';await t.click('[data-pms-action="confirm-save"]');
  const calls=t.calls.filter(c=>c.url.endsWith('/grid-save'));assert.equal(calls.length,2);assert.equal(calls[1].input.entries.length,12);
  assert.equal(t.f.db.prepare('SELECT count(*) n FROM program_monthly_subscriptions WHERE active=1').get().n,0);
  assert.equal(t.document.querySelector(selector).indeterminate,false);assert.equal(t.document.querySelector(selector).checked,false);
 }finally{t.f.db.close();}
});
test('grid revocation requires a reason and cancelling a tick creates no save',async()=>{
 const t=await setup();try{
  await t.click('[data-pms-year="2024"]');const selector='[data-pms-cell][data-account="account-0002"][data-month="2024-01"]';
  await t.change(selector,true);await t.change(selector,false);assert.equal(t.window.M4L_PROGRAM_MONTHLY.dirty(),false);
  await t.change(selector,true);await t.click('[data-pms-action="save"]');
  await t.change(selector,false);await t.click('[data-pms-action="save"]');assert(t.document.querySelector('[data-pms-removal-reason]'));
  const before=t.calls.length;await t.click('[data-pms-action="confirm-save"]');assert.equal(t.calls.length,before);assert.match(t.document.querySelector('[data-pms-message]').textContent,/reason/);
  t.document.querySelector('[data-pms-removal-reason]').value='Wrong account';await t.click('[data-pms-action="confirm-save"]');
  const row=t.f.db.prepare("SELECT active,note FROM program_monthly_subscriptions WHERE account_id='account-0002'").get();assert.equal(row.active,0);assert.equal(row.note,'Wrong account');
 }finally{t.f.db.close();}
});
test('historical media form creates an original 2025 date and opens the existing attachment editor',async()=>{
 const t=await setup();try{
  const form=t.document.querySelector('[data-pms-history-form]');form.querySelector('[name=date]').value='2025-03-18';form.querySelector('[name=title]').value='Earlier Tafseer recording';
  form.querySelector('[name=title]').dispatchEvent(new t.window.Event('input',{bubbles:true}));assert.equal(t.window.M4L_PROGRAM_MONTHLY.canLeave(),false);
  await t.click('[data-pms-year="2024"]');assert.equal(form.querySelector('[name=title]').value,'Earlier Tafseer recording');
  const previous=t.document.querySelector('[data-pms-history-month]').value;await t.change('[data-pms-history-month]','2024-01');assert.equal(t.document.querySelector('[data-pms-history-month]').value,previous);
  form.dispatchEvent(new t.window.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(t.managed.length,1);const row=t.f.db.prepare('SELECT * FROM lesson_media_lessons WHERE lesson_id=?').get(t.managed[0].lessonId);assert.equal(row.lesson_date,'2025-03-18');assert.equal(row.state,'DRAFT');assert.equal(t.document.querySelector('[data-pms-history-month]').value,'2025-03');assert.equal(JSON.parse(row.session_key)[0],'HISTORICAL');
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

test('participant additional access is manual, labels paid/public access, and retries the identical save without editing paid months',async()=>{
 const t=await setup({grants:true});try{
  const button='[data-pms-grants="account-0002"]';assert(t.document.querySelector(button));
  await t.click('[data-pms-tab="participants"]');await t.window.M4L_PROGRAM_MONTHLY.manageGrants('account-0002');await settle();
  const id=t.f.ids[0],selector='[data-pms-grant="'+id+'"]';
  assert.match(t.document.querySelector('[data-pms-grant-editor]').textContent,/Paid months remain the normal/);
  assert.equal(t.document.querySelector('[data-pms-grant="'+t.f.ids[2]+'"]').disabled,true,'Public Foundations needs no individual grant');
  await t.change(selector,true);assert.equal(t.f.db.prepare('SELECT count(*) n FROM program_surah_grants').get().n,0,'Changing a checkbox never saves automatically');
  assert.equal(t.window.M4L_PROGRAM_MONTHLY.canLeave(),false);
  const note=t.document.querySelector('[data-pms-grant-note]');note.value='Additional study';note.dispatchEvent(new t.window.Event('input',{bubbles:true}));
  t.lose();await t.click('[data-pms-grant-action="save"]');assert(t.document.querySelector('[data-pms-grant-action="retry"]'));assert.equal(t.document.querySelector(selector).disabled,true);
  await t.click('[data-pms-grant-action="close"]');assert(t.document.querySelector('[data-pms-grant-editor]'),'An uncertain save must be retried before discarding');
  await t.click('[data-pms-grant-action="retry"]');assert.equal(t.document.querySelector('[data-pms-grant-editor]'),null);
  const saved=t.calls.filter(c=>c.url.endsWith('/surah-grants-save'));assert.equal(saved.length,2);assert.deepEqual(saved[0].input,saved[1].input);
  assert.equal(t.f.db.prepare('SELECT note,active,revision FROM program_surah_grants').get().note,'Additional study');assert.equal(t.f.db.prepare('SELECT count(*) n FROM program_monthly_subscriptions').get().n,0);
  assert.equal(t.window.M4L_PROGRAM_MONTHLY.dirty(),false);
 }finally{t.f.db.close();}
});
test('additional access discard and account switch clear the private student editor and reject delayed responses',async()=>{
 const t=await setup({grants:true});try{
  const button='[data-pms-grants="account-0002"]',selector='[data-pms-grant="'+t.f.ids[0]+'"]';
  await t.click(button);await t.change(selector,true);await t.click('[data-pms-grant-action="close"]');assert.equal(t.f.db.prepare('SELECT count(*) n FROM program_surah_grants').get().n,0);
  await t.click(button);t.switchAccount();assert.equal(t.document.querySelector('[data-pms-content]').textContent,'');assert.equal(t.window.M4L_PROGRAM_MONTHLY.dirty(),false);
 }finally{t.f.db.close();}
});
