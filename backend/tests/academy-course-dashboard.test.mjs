import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const helper=readFileSync(new URL('../../js/m4l-course-companion.js',import.meta.url),'utf8'),source=readFileSync(new URL('../../js/m4l-academy-dashboard.js',import.meta.url),'utf8');
function fixture(workspace,{assessmentRows=[],now}={}){
 const nodes=new Map();
 function element(){const node={innerHTML:'',textContent:'',dataset:{},children:[],firstElementChild:{},setAttribute(){},addEventListener(){},append(){},insertBefore(){},replaceChildren(){this.innerHTML='';},querySelectorAll:()=>[],closest:()=>element(),querySelector:()=>element()};node.classList={contains:()=>false,toggle(){},add(){}};return node;}
 const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},querySelectorAll:()=>[],querySelector:()=>element(),createElement:element};
 const window={M4L_ACADEMY_WORKSPACE:{current:()=>workspace,head:()=>null,adminRealm:()=>workspace.startsWith('ADMIN'),classView:()=>null,readerUrl:url=>url},addEventListener(){}};
 const Clock=now?class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return Date.parse(now);}}:Date;
 const context={window,document,localStorage:{getItem:key=>key==='m4l_account_token'?'synthetic-session':null},URL,location:{href:"http://academy.invalid/academy/",hash:""},URLSearchParams,Intl,Date:Clock,matchMedia:()=>({matches:false,addEventListener(){}}),setTimeout:()=>1,clearTimeout(){},fetch:async url=>Response.json({success:true,...(url.endsWith('/api/academy/assessments/list')?{assessments:assessmentRows}:{})})};
 runInNewContext(helper,context);runInNewContext(source,context);
 return {window,nodes,open(mode,roles=['STUDENT']){window.M4L_ACADEMY_DASHBOARD.open({signedIn:true,globalAdmin:mode==='admin',personalActivities:[{kind:'COURSE',id:'kahf',name:'Surah Al Kahf',roles}],personalTimetable:[],workspaceAccess:{learn:true,teach:true,admin:true}},{mode,activityHref:()=>'/academy/#activity/COURSE/kahf/'+(mode==='admin'?'teach':mode),adminLinks:[]});}};
}
for(const [workspace,mode,roles] of [['LEARN','learn',['STUDENT']],['TEACH','teach',['TEACHER']],['ADMIN','admin',['PROGRAM_ADMIN']],['ADMIN_LEARN','learn',['PROGRAM_ADMIN']],['ADMIN_TEACH','teach',['PROGRAM_ADMIN']]]){
 test('standalone courses stay in website delivery; Admin retains management in '+workspace,async()=>{
  const f=fixture(workspace);f.open(mode,roles);await new Promise(resolve=>setImmediate(resolve));const markup=f.nodes.get('ad-areas').innerHTML;
  assert.doesNotMatch(markup,/ad-kahf-course|course-companion|#activity\/COURSE/);
  if(mode==='admin')assert.match(f.nodes.get('ad-hub-gateways').innerHTML,/Management/);
  else assert.match(markup,/Your assigned programmes/);
 });
}
test('course cards do not appear for accounts with no assigned course role',async()=>{
 const f=fixture('LEARN');f.open('learn',[]);await new Promise(resolve=>setImmediate(resolve));assert.doesNotMatch(f.nodes.get('ad-areas').innerHTML,/ad-kahf-course/);
});
test('Circles Admin Coming up next includes authorised programmes and courses in start-time order',async()=>{
 const f=fixture('ADMIN'),now=Date.now(),courses=Array.from({length:6},(_,i)=>({kind:'COURSE',id:'next-'+i,name:'Synthetic Course '+i,roles:['PROGRAM_ADMIN']})),program={kind:'PROGRAM',id:'next-program',name:'Synthetic Program',roles:['PROGRAM_ADMIN']};
 const session=(area,i)=>({kind:area.kind,activityId:area.id,activityName:area.name,subjectName:'Module '+i,startsAt:now+(i+1)*3600000,endsAt:now+(i+2)*3600000,startTime:'10:00',endTime:'11:00',status:'SCHEDULED'}),rows=courses.map(session);
 f.window.M4L_ACADEMY_DASHBOARD.open({signedIn:true,globalAdmin:true,personalActivities:[...courses,program],personalTimetable:[...rows].reverse().concat(session(program,-.5),{...rows[0],startsAt:now+8000000},{...rows[1],status:'CANCELLED',startsAt:now+1},{...rows[0],activityId:'unassigned',activityName:'Private Course',startsAt:now+2},{...rows[2],endsAt:now-1,startsAt:now-3600000}),workspaceAccess:{admin:true}},{mode:'admin',activityHref:row=>'/academy/admin/#activity/'+row.kind+'/'+row.id+'/teach',adminLinks:[]});
 await new Promise(resolve=>setImmediate(resolve));const markup=f.nodes.get('ad-next').innerHTML;
 assert.equal((markup.match(/class="ad-next-row"/g)||[]).length,3);
 assert.match(markup,/Synthetic Program/);
 for(let i=0;i<2;i++)assert.match(markup,new RegExp('Synthetic Course '+i));
 assert(markup.indexOf('Synthetic Program')<markup.indexOf('Synthetic Course 0')&&markup.indexOf('Synthetic Course 0')<markup.indexOf('Synthetic Course 1'));
 assert.doesNotMatch(markup,/Synthetic Course [2345]|Private Course/);
});
for(const mode of ['admin','teach','learn'])test('Imtehaan cards include dated exams and assignment windows, excluding draft/finished states in '+mode,async()=>{
 const area={kind:'PROGRAM',id:'reboot',name:'Reboot Your Maktab',roles:[mode==='learn'?'STUDENT':mode==='teach'?'TEACHER':'PROGRAM_ADMIN']},base={activityKey:'PROGRAM:reboot',title:'Paper',phaseName:'Reboot 2026',registerId:'reboot-2026',registerStatus:'SCHEDULED',assessmentKind:'ASSIGNMENT',examDate:null,availableFrom:'2026-10-25T05:50:00Z',dueAt:'2026-12-04T22:00:00Z',timezone:'Africa/Johannesburg',published:true,canAdmin:true,canTeach:true};
 const hidden=['DRAFT','REGISTERED','COMPLETE','CANCELLED','ARCHIVED'].map(status=>({...base,registerId:'hidden-'+status,phaseName:'Hidden '+status,registerStatus:status}));
 const assessmentRows=[base,{...base,title:'Second paper'},...hidden,{...base,registerId:'unpublished',phaseName:'Unpublished schedule',published:false},{...base,activityKey:'PROGRAM:private',phaseName:'Private Imtehaan'},{...base,registerId:'previous',phaseName:'Previous Imtehaan',assessmentKind:'EXAM',examDate:'2026-10-01'},{...base,registerId:'future',phaseName:'Upcoming Imtehaan',assessmentKind:'EXAM',examDate:'2026-11-01'},{...base,registerId:'ongoing',phaseName:'Ongoing assignment',availableFrom:'2026-09-01T00:00:00Z',dueAt:null}];
 const f=fixture(mode==='admin'?'ADMIN':mode.toUpperCase(),{assessmentRows,now:'2026-10-27T10:00:00Z'});
 f.window.M4L_ACADEMY_DASHBOARD.open({signedIn:true,globalAdmin:mode==='admin',personalActivities:[area],personalTimetable:[],workspaceAccess:{admin:mode==='admin'}},{mode,activityHref:(row,tool,target)=>'/academy/#activity/'+row.kind+'/'+row.id+'/'+target+'/'+tool,adminLinks:[]});
 await new Promise(resolve=>setImmediate(resolve));const markup=f.nodes.get('ad-assessments').innerHTML;
 assert.equal(f.nodes.get('ad-assessment-title').textContent,'Upcoming exams (Imtehaan)');assert.equal((markup.match(/class="ad-assessment-row"/g)||[]).length,3);
 for(const title of ['Reboot 2026','Upcoming Imtehaan','Ongoing assignment'])assert(markup.includes(title),title);
 assert.match(markup,/25 Oct – 4 Dec 2026/);assert.match(markup,/From 1 Sept 2026/);assert.match(markup,/class="ad-assessment-program">Reboot Your Maktab/);assert.match(markup,/assessment\/reboot-2026/);
 assert.doesNotMatch(markup,/Hidden|Unpublished schedule|Private Imtehaan|Previous Imtehaan/);
});


test('the hub shows all actual programme roles together, independently of its summary audience',()=>{
 const f=fixture('TEACH');
 f.window.M4L_ACADEMY_LOGIN={contexts:()=>[
  {scope:'COURSE',courseId:'student-program',courseName:'Student programme',role:'STUDENT'},
  {scope:'COURSE',courseId:'teacher-program',courseName:'Teaching programme',role:'TEACHER'},
  {scope:'COURSE',courseId:'both-program',courseName:'Both roles',role:'STUDENT'},
  {scope:'COURSE',courseId:'both-program',courseName:'Both roles',role:'TEACHER'},
  {scope:'GLOBAL',courseId:'website-course',courseName:'Website course',role:'STUDENT'}
 ]};
 f.window.M4L_ACADEMY_DASHBOARD.open({signedIn:true,personalActivities:[{kind:'PROGRAM',id:'teacher-program',name:'Teaching programme',roles:['TEACHER']},{kind:'PROGRAM',id:'unassigned',name:'Not assigned',roles:[]}],personalTimetable:[]},{mode:'teach',activityHref:()=>''});
 const markup=f.nodes.get('ad-areas').innerHTML;
 assert.match(markup,/\/academy\/#activity\/PROGRAM\/student-program\/learn/);
 assert.match(markup,/\/academy\/#activity\/PROGRAM\/teacher-program\/teach/);
 assert.match(markup,/\/academy\/#activity\/PROGRAM\/both-program\/learn/);
 assert.match(markup,/\/academy\/#activity\/PROGRAM\/both-program\/teach/);
 assert.doesNotMatch(markup,/teacher-program\/learn|student-program\/teach|Not assigned|Website course|Management/);
 assert.equal(f.nodes.get('ad-title').textContent,'Your Academy dashboard');
});
test('programme administration keeps learner, teacher and management destinations distinct',()=>{
 const f=fixture('ADMIN');f.window.M4L_ACADEMY_LOGIN={contexts:()=>[{scope:'COURSE',courseId:'managed',courseName:'Managed programme',role:'PROGRAM_ADMIN'}]};
 f.window.M4L_ACADEMY_DASHBOARD.open({signedIn:true,globalAdmin:false,personalActivities:[{kind:'PROGRAM',id:'managed',name:'Managed programme',roles:['PROGRAM_ADMIN']}],personalTimetable:[]},{mode:'admin',activityHref:()=>''});
 const markup=f.nodes.get('ad-areas').innerHTML;
 assert.match(markup,/\/academy\/admin\/#activity\/PROGRAM\/managed\/learn/);
 assert.match(markup,/\/academy\/admin\/#activity\/PROGRAM\/managed\/teach/);
 assert.match(markup,/\/programs\/manage.html\?program=managed/);
 assert.equal(f.nodes.get('ad-hub-gateways').hidden,true,'Only Global Admin gets Academy-wide gateways');
});


test('the hub retains the personal HifzHelper handoff and never invents a teaching role',()=>{
 const f=fixture('LEARN');f.window.M4L_ACADEMY_LOGIN={contexts:()=>[{scope:'COURSE',courseId:'hifz',courseName:'Hifz',role:'STUDENT'}]};
 f.window.M4L_ACADEMY_DASHBOARD.open({signedIn:true,personalActivities:[{kind:'PROGRAM',id:'hifz',name:'Hifz',roles:['STUDENT']}],personalTimetable:[]},{mode:'learn',activityHref:()=>'',hifzHref:()=> 'https://hifz.example/synthetic?academy=1'});
 const markup=f.nodes.get('ad-areas').innerHTML;
 assert.match(markup,/href="https:\/\/hifz.example\/synthetic\?academy=1" target="_blank" rel="noopener noreferrer"/);
 assert.doesNotMatch(markup,/#activity\/PROGRAM\/hifz\/learn|>Teach<|Admin-Teach|Admin-Learn/);
});
