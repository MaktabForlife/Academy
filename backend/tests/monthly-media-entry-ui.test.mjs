import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const moduleSource=readFileSync(new URL('../../js/m4l-monthly-media-entry.mjs',import.meta.url),'utf8').replace('export async function','async function')+'\nwindow.M4L_MONTHLY_MEDIA_ENTRY={studioMonthlyMedia};';
const wrapper=readFileSync(new URL('../../js/m4l-program-lesson-media.js',import.meta.url),'utf8');
const program='PRG-11111111-1111-4111-8111-111111111111',activity='PROGRAM:'+program;
const saved=programmeKey=>({success:true,managed:true,monthly:true,kind:'TAFSEER',programmeKey,offeringId:'native-'+programmeKey,destination:'https://studio.test/studio/?manage=1&offering=native-'+programmeKey+'&section=media'});
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
function fixture(response){
 const {document}=parseHTML(readFileSync(new URL('../../programs/fragments/lesson-media.fragment',import.meta.url),'utf8')),window=new EventTarget();
 let token='synthetic-owner',active=true;const calls=[],opened=[],historical=[];
 window.M4L_CONFIG={API_BASE:'https://academy.test'};window.M4L_LESSON_MEDIA={reset(){},open:options=>opened.push(options),canLeave:()=>true};window.M4L_PROGRAM_SURAHS={reset(){},select:()=>historical.push('surahs')};
 const localStorage={getItem:()=>token},fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});if(url.endsWith('/programs/list'))return {ok:true,json:async()=>({success:true,store:'D1',programs:[{id:program}]})};return response();};
 const context=vm.createContext({window,document,localStorage,fetch,URL,URLSearchParams,location:{search:'?program='+program}});vm.runInContext(moduleSource,context);
 return {window,document,context,calls,opened,historical,host:document.getElementById('program-lesson-media'),changeAccount(){token='synthetic-replacement';active=false;},current:()=>active};
}
test('the real initially-hidden Tafseer and MOU media panels reveal their checked Studio entry',async()=>{
 for(const programmeKey of ['tafseer','mothers']){
  const p=fixture(()=>({ok:true,status:200,json:async()=>saved(programmeKey)}));assert.equal(p.host.hidden,true);
  vm.runInContext(wrapper,p.context);await settle();assert.equal(p.host.hidden,false,'A successful Studio-owned entry must unhide its original panel');
  assert.match(p.host.textContent,programmeKey==='mothers'?/MOU media/:/Tafseer media/);assert.equal(new URL(p.host.querySelector('a').href).searchParams.get('offering'),'native-'+programmeKey);
  assert.equal(p.calls.length,2,'One existing programme-list check and one ownership lookup');assert.equal(p.opened.length,0);assert.equal(p.historical.length,0,'Historical Academy content is lazy and must not be read on entry');
 }
});
test('denied ownership lookups keep the panel hidden and display an explicit retry in the caller',async()=>{
 for(const status of [401,403,503]){
  const p=fixture(()=>({ok:false,status,json:async()=>({success:false,error:'Synthetic current access unavailable'})}));vm.runInContext(wrapper,p.context);await settle();assert.equal(p.host.hidden,true);assert.equal(p.host.querySelector('a'),null);assert.equal(p.document.getElementById('program-media-retry').hidden,false);assert.match(p.document.getElementById('program-media-message').textContent,/unavailable/);assert.equal(p.calls.length,2);
 }
});
test('account changes while JSON is being decoded cannot reveal a previous account media destination',async()=>{
 let finish;const p=fixture(()=>({ok:true,status:200,json:()=>new Promise(resolve=>finish=resolve)}));
 const loading=p.window.M4L_MONTHLY_MEDIA_ENTRY.studioMonthlyMedia(p.host,activity,{current:p.current});await settle();p.changeAccount();finish(saved('mothers'));await loading;assert.equal(p.host.hidden,true);assert.equal(p.host.querySelector('a'),null);
});
test('superseded views do not issue an unnecessary ownership lookup',async()=>{
 const p=fixture(()=>{throw Error('No request expected');});p.changeAccount();await p.window.M4L_MONTHLY_MEDIA_ENTRY.studioMonthlyMedia(p.host,activity,{current:p.current});assert.equal(p.calls.length,0);assert.equal(p.host.hidden,true);
});
