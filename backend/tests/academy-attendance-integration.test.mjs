import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../src/worker.js';
import {attendanceIntegrationFixture,attendanceProgramId as id,attendanceDate,previousAttendanceDate} from './fixtures/academy-attendance-fixture.mjs';
const markup=readFileSync(new URL('../../programs/attendance.html',import.meta.url),'utf8'),source=readFileSync(new URL('../../js/m4l-program-attendance.js',import.meta.url),'utf8');
const ids=new Set([...markup.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
const settle=async()=>{for(let i=0;i<25;i++)await new Promise(resolve=>setTimeout(resolve,2));};
const f=await attendanceIntegrationFixture(),externalFetch=globalThis.fetch;let external=0;
globalThis.fetch=async()=>{external++;throw Error('No external requests allowed');};
const post=async(path,body,token='')=>worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)}),f.env);
const login=async(suffix)=>{const result=await post('/api/account/login',{uniqueid:'login-'+suffix,pin:'1234'});assert.equal(result.status,200);return (await result.json()).token;};
function screen(token,storage=new Map()){
  const elements=new Map(),requests=[];let loseNext=false;
  const element=id=>{assert(ids.has(id));if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',listeners:{},classList:{toggle(){}},addEventListener(type,fn){this.listeners[type]=fn;}});return elements.get(id);};
  vm.runInNewContext(source,{crypto,TextEncoder,URLSearchParams,console,location:{search:'?program='+id,pathname:'/programs/attendance.html'},history:{replaceState(){}},
    localStorage:{getItem:()=>token},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:element},window:{M4L_CONFIG:{API_BASE:''},confirm:()=>true,addEventListener(){}},
    fetch:async(url,options)=>{const result=await worker.fetch(new Request('http://localhost'+url,options),f.env),body=await result.clone().json();requests.push({url,input:JSON.parse(options.body),body,status:result.status});if(loseNext&&url.endsWith('/submit')){loseNext=false;throw Error('Lost acknowledgement');}return result;}});
  return {element,requests,storage,loseAcknowledgement:()=>{loseNext=true;},
    change:(klass,account,value)=>element('pa-classes').listeners.change({target:{matches:s=>s==='[data-mark]',dataset:{class:klass,account},value}}),
    lesson:(klass,value)=>element('pa-classes').listeners.change({target:{matches:s=>s==='[data-lesson]',dataset:{class:klass},value}}),
    save:klass=>element('pa-classes').listeners.click({target:{closest:()=>({dataset:{submit:klass}})}}),
    view:()=>requests.filter(r=>r.url.endsWith('/get')).at(-1).body};
}
try{
  const teacher=await login('0003'),app=screen(teacher);await settle();
  assert.match(app.element('pa-classes').innerHTML,/Class A.*Class B/);
  assert.doesNotMatch(app.element('pa-classes').innerHTML,/Break|Synthetic learner 10/,'Breaks and unassigned students do not become attendance rows');
  assert.equal(app.view().scheduledLessons,3);assert.equal(app.view().complete,false);assert(app.view().learners.every(row=>row.status==='UNKNOWN'));
  const anchor=app.view().lessons.find(row=>row.lesson.classId==='class-1').lesson.anchor;
  app.lesson('class-1',anchor);app.change('class-1','account-0002','ABSENT');app.save('class-1');await settle();
  assert.equal(app.view().submittedLessons,1);assert(app.view().learners.every(row=>row.status==='UNKNOWN'));
  app.lesson('class-1','ALL');app.change('class-1','account-0002','EXCUSED');app.save('class-1');await settle();
  assert.equal(app.view().submittedLessons,2);assert.equal(app.view().lessons.find(row=>row.lesson.classId==='class-shared').submitted,false);
  const registersBefore=f.db.prepare('SELECT count(*) n FROM attendance_registers').get().n;
  app.loseAcknowledgement();app.save('class-shared');await settle();assert.equal(app.element('pa-pending').hidden,false);
  const submitted=app.requests.filter(r=>r.url.endsWith('/submit')).at(-1).input;
  const restored=screen(teacher,app.storage);await settle();restored.element('pa-retry').listeners.click();await settle();
  assert.deepEqual(restored.requests.find(r=>r.url.endsWith('/submit')).input,submitted);assert.equal(restored.requests.find(r=>r.url.endsWith('/submit')).body.replayed,true);
  assert.equal(f.db.prepare('SELECT count(*) n FROM attendance_registers').get().n,registersBefore+1);
  assert.equal(restored.view().complete,true);assert.equal(restored.view().learners.find(r=>r.accountId==='account-0002').status,'EXCUSED');assert.equal(restored.view().learners.find(r=>r.accountId==='account-0008').status,'PRESENT');
  const competing=screen(teacher);await settle();competing.change('class-1','account-0002','ABSENT');competing.save('class-1');await settle();
  restored.change('class-1','account-0002','PRESENT');restored.save('class-1');await settle();assert.equal(restored.requests.filter(r=>r.url.endsWith('/submit')).at(-1).status,409);
  const attempts=restored.requests.length;restored.save('class-1');assert.equal(restored.requests.length,attempts,'Conflicting form cannot submit again before refresh');
  f.db.prepare('UPDATE class_memberships SET active=0 WHERE account_id=?').run('account-0002');
  const history=screen(teacher);await settle();history.element('pa-date').listeners.change({target:{value:previousAttendanceDate()}});await settle();
  assert.match(history.element('pa-classes').innerHTML,/Original learner name/);history.change('class-1','account-0002','EXCUSED');history.save('class-1');await settle();
  const corrected=history.requests.filter(r=>r.url.endsWith('/submit')).at(-1);assert.equal(corrected.status,200,JSON.stringify(corrected.body));assert.equal(corrected.body.editedLessons,1);assert.equal(corrected.body.submittedLessons,0);
  assert.equal(corrected.input.date,previousAttendanceDate());assert.equal(Object.keys(corrected.input.baseRegisterIds).length,1);
  assert.equal(f.db.prepare("SELECT status FROM attendance_marks WHERE register_id='historical-register'").get().status,'ABSENT','Correction preserves the imported original submission');
  assert.equal(history.view().lessons.find(r=>r.submitted).marks[0].status,'EXCUSED');
  const student=screen(await login('0002'));await settle();assert.equal(student.element('pa-workspace').hidden,true);assert.equal(student.requests.filter(r=>r.url.endsWith('/get')).length,0);
  const scoped=screen(await login('0004'));await settle();assert.equal((scoped.element('pa-programs').innerHTML.match(/data-program=/g)||[]).length,1);
  const global=screen(await login('0001'));await settle();assert.equal((global.element('pa-programs').innerHTML.match(/data-program=/g)||[]).length,2);
  assert.equal((await post('/api/program-attendance/get',{id,date:attendanceDate()},await login('0002'))).status,403);
  assert.equal(external,0);assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);
  console.log('Public Attendance + D1: shared class registers, one/all lessons, active memberships, Unknown/completion, lost-ack replay, conflicting forms, original-roster historical corrections and teacher/student/admin scopes passed.');
}finally{globalThis.fetch=externalFetch;f.db.close();}
