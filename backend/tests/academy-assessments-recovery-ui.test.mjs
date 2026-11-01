import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const script=readFileSync(new URL('../../js/m4l-academy-assessments.js',import.meta.url),'utf8');
const list=rows=>({success:true,assessments:rows,classes:[],registers:[],phases:[],timezone:'Africa/Johannesburg',canAdmin:false});
const row={id:'assignment-one',activityKey:'PROGRAM:reboot',activityName:'Reboot',classId:'class-one',className:'Class one',title:'Open Reboot assignment',subject:'Quran',assessmentKind:'ASSIGNMENT',timingMode:'UNTIMED',availableFrom:'2026-01-01T00:00:00Z',paperState:'AVAILABLE',paperAvailable:true,published:true,collectionClosed:false,canTeach:false};
function fixture(fetcher,{view='teacher'}={}){
 const {window,document}=parseHTML('<html><body><section class="view active"><div id="host"></div></section></body></html>');
 let token='synthetic-teacher',workspace=view==='learner'?'LEARN':'TEACH';const saved=new Map(),calls=[];
 window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;};
 window.M4L_CONFIG={NATIVE_ATTENDANCE:true};window.M4L_ACADEMY_WORKSPACE={current:()=>workspace,audience:()=>workspace,classView:()=>null};
 const store={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
 const context=vm.createContext({window,document,localStorage:{getItem:()=>token},sessionStorage:store,fetch:async(url,options)=>{const input=JSON.parse(options.body);calls.push({url,input});return fetcher(calls.length,input,url);},crypto,TextEncoder,Date,Intl,URL,Map,Set,console});
 vm.runInContext(script,context);
 const open=()=>window.M4L_ACADEMY_ASSESSMENTS.open({hostId:'host',view,activityKey:row.activityKey});
 return {window,document,calls,open,setToken(value){token=value;},setWorkspace(value){workspace=value;},async click(selector){await document.querySelector('#host').onclick({target:document.querySelector(selector)});}};
}
test('Teach assessments recover once from a superseded read and keep the teacher assessment table',async()=>{
 const f=fixture(n=>{if(n===1)throw new DOMException('The Academy account changed.','AbortError');return Response.json(list([{...row,canTeach:true,paperState:'APPROVED',canOpenPaper:true,canEnterMarks:true,readOnly:false}]));});
 await f.open();assert.equal(f.calls.length,2);assert.match(f.document.body.textContent,/Open Reboot assignment/);assert.doesNotMatch(f.document.body.textContent,/Opening assessments|account changed/);assert(f.document.querySelector('[data-as=enter-marks]'));assert.equal(f.document.querySelector('[data-as=submit-answer]'),null);
});
test('a repeatedly interrupted read stops after one retry and offers a usable refresh control',async()=>{
 let ready=false;const f=fixture(()=>{if(!ready)throw new DOMException('superseded','AbortError');return Response.json(list([]));});
 await f.open();assert.equal(f.calls.length,2);assert.doesNotMatch(f.document.body.textContent,/Opening assessments/);assert(f.document.querySelector('[data-as=refresh-assessments]'));
 ready=true;await f.click('[data-as=refresh-assessments]');assert.equal(f.calls.length,3);assert.match(f.document.body.textContent,/No assessment dates/);
});
test('an authoritative assessment denial clears the table and is not automatically retried',async()=>{
 const f=fixture(()=>Response.json({success:false,error:'No longer permitted'},{status:403}));await f.open();assert.equal(f.calls.length,1);assert.match(f.document.body.textContent,/check your assessment access/);assert.equal(f.document.querySelector('table'),null);
});
test('late assessment reads cannot populate a changed account or a different workspace',async()=>{
 for(const change of ['account','workspace']){
  let release;const f=fixture(()=>new Promise(resolve=>{release=()=>resolve(Response.json(list([row])));}));const pending=f.open();if(change==='account')f.setToken('other-account');else f.setWorkspace('LEARN');release();await pending;assert.doesNotMatch(f.document.body.textContent,/Open Reboot assignment/);assert.equal(f.calls.length,1);
 }
});
test('an eligible learner can open Submit your answers and the checked answer upload form',async()=>{
 const f=fixture((_n,_body,url)=>Response.json(url.endsWith('/list')?list([row]):{assessment:{...row,canUpload:true},learners:[{}]}),{view:'learner'});
 await f.open();const button=f.document.querySelector('[data-as=submit-answer]');assert.equal(button.textContent,'Submit your answers');assert.equal(button.disabled,false);await f.click('[data-as=submit-answer]');assert.equal(f.document.querySelector('#as-submit-dialog')?.open,true);assert(f.document.querySelector('input[name=answer]'));assert.equal(f.calls[1].input.view,'learner');
});
test('closed submissions and Admin learner previews remain disabled',async()=>{
 for(const denied of [{collectionClosed:true},{learnerPreview:true}]){
  const f=fixture(()=>Response.json(list([{...row,...denied}])),{view:'learner'});await f.open();assert.equal(f.document.querySelector('[data-as=submit-answer]').disabled,true);assert.equal(f.document.querySelector('input[name=answer]'),null);
 }
});
