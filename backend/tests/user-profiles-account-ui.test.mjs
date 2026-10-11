import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fixtureDatabase} from './fixtures/academy-d1-fixture.mjs';
import worker from '../src/worker.js';
const source=readFileSync(new URL('../../js/m4l-user-profiles.js',import.meta.url),'utf8'),markup=readFileSync(new URL('../../users/index.html',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setTimeout(r,2));};
test('profile sheet orders compact editable account columns, filters active learning areas and explicitly confirms PIN resets',async()=>{
  const f=await fixtureDatabase();
  for(const name of ['0004_management_transactions.sql','0011_account_contact_details.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));
  const response=await worker.fetch(new Request('http://localhost/api/account/login',{method:'POST',body:JSON.stringify({uniqueid:'login-0001',pin:'1234'})}),f.env),{token}=await response.json();
  const elements=new Map(),storage=new Map(),requests=[];let lost=false;
  const el=id=>{if(!elements.has(id))elements.set(id,{dataset:{},hidden:false,disabled:false,value:'',innerHTML:'',textContent:'',classList:{toggle(){}},setAttribute(){},showModal(){this.open=true;},close(){this.open=false;},focus(){}});return elements.get(id);};
  const context={console,crypto,structuredClone,URLSearchParams,location:{search:'',host:'localhost',origin:'http://localhost'},document:{getElementById:el},window:{M4L_CONFIG:{API_BASE:''},addEventListener(){}},navigator:{},localStorage:{getItem:()=>token},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout,fetch:async(url,options)=>{
    const input=JSON.parse(options.body);requests.push({url,input});const result=await worker.fetch(new Request('http://localhost'+url,options),f.env);
    if(lost&&input.mode==='reset-pin'){lost=false;throw Error('Connection interrupted after saving');}return result;
  }};
  const row=async dataset=>{el('up-users').onclick({target:{closest:()=>({dataset})}});await settle();};
  const input=(field,value)=>el('up-users').oninput({target:{dataset:{[field]:'',account:'account-0002'},value}});
  try{
    vm.runInNewContext(source,context);await settle();
    const headers=el('up-head').innerHTML;
    for(const [a,b] of [['User name','Login ID'],['Login ID','WhatsApp number'],['WhatsApp number','Status'],['Status','Actions'],['Actions','Synthetic Program']])assert.ok(headers.indexOf(a)<headers.indexOf(b));
    assert.match(el('up-users').innerHTML,/data-unique-id/);assert.match(el('up-users').innerHTML,/data-whatsapp-number/);assert.match(el('up-users').innerHTML,/>Admin ▾/);assert(!el('up-users').innerHTML.includes('>Program Admin ▾'));
    assert.doesNotMatch(markup,/<header[^>]*>.*Subjects &amp; Modules|id="up-back"/);
    f.db.exec("UPDATE activities SET active=0 WHERE kind='COURSE'");el('up-refresh').onclick();await settle();
    assert.match(el('up-head').innerHTML,/Synthetic subject/);el('up-active-areas').onclick();assert.doesNotMatch(el('up-head').innerHTML,/Synthetic subject/);assert.equal(el('up-active-areas').textContent,'Active only ✓');el('up-active-areas').onclick();
    input('uniqueId','bad id');el('up-save-all').onclick();await settle();assert.match(el('up-message').textContent,/only letters and numbers/);
    input('uniqueId','login-0001');el('up-save-all').onclick();await settle();assert.match(el('up-message').textContent,/only letters and numbers/);
    input('uniqueId','Learner42');input('whatsappNumber','+27 82 123 4567');el('up-save-all').onclick();await settle();
    assert.equal(f.db.prepare("SELECT login_link_id FROM accounts WHERE account_id='account-0002'").get().login_link_id,'Learner42');assert.equal(f.db.prepare("SELECT whatsapp_number FROM account_contact_details WHERE account_id='account-0002'").get().whatsapp_number,'+27 82 123 4567');
    const before=requests.length;await row({resetPin:'account-0001'});assert.equal(requests.length,before);assert(!el('up-reset-dialog').open);
    await row({resetPin:'account-0002'});assert.equal(el('up-reset-dialog').open,true);assert.equal(requests.length,before,'opening confirmation must not reset');
    el('up-reset-cancel').onclick();assert.equal(f.db.prepare("SELECT pin_setup FROM account_credentials WHERE account_id='account-0002'").get().pin_setup,1);
    await row({resetPin:'account-0002'});lost=true;await el('up-reset-confirm').onclick();await settle();assert.match(el('up-reset-message').textContent,/interrupted/);assert.equal(el('up-reset-confirm').textContent,'Retry same reset');
    const original=requests.at(-1).input;assert(!JSON.stringify([...storage.values()]).includes(token),'reset draft must not persist an authentication token');
    vm.runInNewContext(source,context);await settle();await row({resetPin:'account-0003'});assert.match(el('up-reset-name').textContent,/Synthetic learner 2/,'an uncertain reset keeps the original target');
    await el('up-reset-confirm').onclick();await settle();const resets=requests.filter(r=>r.input.mode==='reset-pin');assert.deepEqual(resets.map(r=>r.input),[original,original]);
    assert.equal(el('up-reset-dialog').open,false);assert.match(el('up-message').textContent,/PIN reset/);assert.match(el('up-link').innerHTML,/Learner42/);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='reset-pin'").get().n,1);
  }finally{f.db.close();}
});
