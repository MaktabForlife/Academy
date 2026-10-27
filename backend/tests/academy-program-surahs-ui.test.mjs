import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {monthlyFixture,scope} from './fixtures/academy-monthly-subscriptions-fixture.mjs';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const settle=async()=>{for(let i=0;i<18;i++)await new Promise(r=>setImmediate(r));};
async function setup(){
 const f=await monthlyFixture(),token=await f.login('0001');assert.equal((await f.monthly('configure',{mode:'prepare',policyRevision:0,operationId:crypto.randomUUID()},token)).status,200);
 const {window,document}=parseHTML('<html><body><section id="program-surahs" hidden></section></body></html>'),calls=[];let owner=token,lost=false,held=null;
 window.M4L_CONFIG={API_BASE:''};window.M4L_LESSON_MEDIA={canLeave:()=>true};
 vm.runInNewContext(readFileSync(new URL('../../js/m4l-program-surahs.js',import.meta.url),'utf8'),{window,document,crypto,localStorage:{getItem:()=>owner},fetch:async(url,options)=>{
  const input=JSON.parse(options.body);calls.push({url,input});
  if(held)return new Promise(resolve=>{held.resolve=()=>resolve(new Response(JSON.stringify({success:true,available:true,prepared:true,surahs:[]})));});
  const result=await f.call(url,input,owner);if(lost&&url.endsWith('/surah-save')){lost=false;throw Error('Lost table response');}return new Response(JSON.stringify(result.body),{status:result.status});
 }});
 await window.M4L_PROGRAM_SURAHS.select(scope.slice(8));
 const click=async(selector)=>{const control=document.querySelector(selector);assert(control,selector);control.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));await settle();};
 const type=async(selector,value)=>{const control=document.querySelector(selector);assert(control,selector);control.value=value;control.dispatchEvent(new window.Event('input',{bubbles:true}));await settle();};
 return {f,window,document,calls,click,type,lose(){lost=true;},hold(){held={};return held;},switch(){owner='different';window.dispatchEvent(new window.Event('m4l-academy-session-ended'));}};
}
test('Admin manually enters several surahs and dates and saves one retry-safe table change',async()=>{
 const t=await setup();try{
  assert.equal(t.document.getElementById('program-surahs').hidden,false);
  await t.click('[data-surah-action=add]');let rows=t.document.querySelectorAll('[data-surah-row]');const first=rows[0].dataset.surahRow;
  assert.equal(rows[0].querySelector('[data-surah-field=completionDate]').value,'');
  await t.type('[data-surah-row="'+first+'"] [data-surah-field=name]','Surah Maryam');
  await t.type('[data-surah-row="'+first+'"] [data-surah-field=completionDate]','2024-01-16');
  await t.click('[data-surah-action=add]');rows=t.document.querySelectorAll('[data-surah-row]');const second=rows[1].dataset.surahRow;
  await t.type('[data-surah-row="'+second+'"] [data-surah-field=name]','Surah Yusuf');
  await t.type('[data-surah-row="'+second+'"] [data-surah-field=completionDate]','2025-02-10');
  assert.equal(t.calls.filter(c=>c.url.endsWith('/surah-save')).length,0);assert.equal(t.window.M4L_PROGRAM_SURAHS.canLeave(),false);
  t.lose();await t.click('[data-surah-action=save]');assert(t.document.querySelector('[data-surah-action=retry]'));await t.click('[data-surah-action=retry]');
  const saved=t.calls.filter(c=>c.url.endsWith('/surah-save'));assert.equal(saved.length,2);assert.deepEqual(saved[0].input,saved[1].input);assert.equal(saved[0].input.entries.length,2);
  assert.equal(t.f.db.prepare('SELECT count(*) n FROM program_surahs').get().n,2);assert.equal(t.window.M4L_PROGRAM_SURAHS.dirty(),false);
  assert.equal(t.document.querySelectorAll('[data-surah-editor]').length,2);
  assert.equal(t.calls.some(c=>c.url.includes('/lesson-media/')),false,'Completion dates are never inferred from lessons');
 }finally{t.f.db.close();}
});
test('account switching clears an unfinished surah row and ignores the old register response',async()=>{
 const t=await setup();try{
  const held=t.hold();t.document.querySelector('[data-surah-action=refresh]').dispatchEvent(new t.window.Event('click',{bubbles:true}));await settle();t.switch();held.resolve();await settle();
  assert.equal(t.document.getElementById('program-surahs').textContent,'');assert.equal(t.window.M4L_PROGRAM_SURAHS.dirty(),false);
 }finally{t.f.db.close();}
});
