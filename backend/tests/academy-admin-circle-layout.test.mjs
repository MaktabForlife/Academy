import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const {parseHTML}=createRequire(import.meta.url)('linkedom'),code=readFileSync(new URL('../../js/m4l-academy-dashboard.js',import.meta.url),'utf8');
const flush=()=>new Promise(r=>setImmediate(r));
async function fixture(mode='admin'){
 const {window,document}=parseHTML('<html><body><section id="dashboard"></section></body></html>');
 window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;};
 window.M4L_ACADEMY_WORKSPACE={current:()=> mode.toUpperCase(),adminRealm:()=>mode==='admin',head:()=> 'synthetic-head',classView:()=>null,adminAccess:()=>true,readerUrl:v=>v};window.M4L_CLASS_NOTES={snapshot:()=>({sessions:[],status:'ready'})};window.M4L_MESSAGING={renderCard:()=>{}};window.M4L_ANNOUNCEMENTS={snapshot:()=>({announcements:[]})};
 const values=new Map([['m4l_account_token','synthetic-admin']]),location={origin:'https://academy.test',href:'https://academy.test/academy/admin/#dashboard'};
 vm.runInNewContext(code,{window,document,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},location,history:{replaceState(){}},matchMedia:()=>({matches:true,addEventListener(){}}),requestAnimationFrame:()=>1,setTimeout:()=>1,clearTimeout(){},URL,Intl,Date,fetch:async()=>({ok:true,status:200,json:async()=>({success:true,assessments:[],requests:[]})})});
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),row={kind:'PROGRAM',id:'one',name:'Aalimiyah',active:true,roles:['GLOBAL_ADMIN']};
 const lesson=(title,start,end)=>({kind:'PROGRAM',activityId:'one',activityName:'Aalimiyah',date:day,title,startTime:start,endTime:end,startsAt:Date.parse(day+'T'+start+':00+02:00'),endsAt:Date.parse(day+'T'+end+':00+02:00'),status:'SCHEDULED',classNames:['Class A']});
 const home={signedIn:true,globalAdmin:true,timezone:'Africa/Johannesburg',personalActivities:[row],activities:[row],personalTimetable:[lesson('Mishkaat','09:00','10:00'),lesson('Usulul Hadith','10:00','11:00')],startDate:day,endDate:day,warnings:[]};
 const settings={mode,activityHref:()=> '#activity/PROGRAM/one',adminLinks:[{label:'Users',href:'/users/'},{label:'Access',href:'#administration/access'},{label:'Curriculum',href:'#administration/curriculum'},{label:'Assessments',href:'#assessment-admin'},{label:'App settings',href:'#administration/settings'}]};
 window.M4L_ACADEMY_DASHBOARD.open(home,settings);await flush();return {window,document,home,settings};
}
test('Admin uses menu/circle/attention and the five management links above the circle',async()=>{
 const f=await fixture(),top=f.document.querySelector('.ad-admin-top');assert.equal(top.children.length,3);assert(top.children[0].classList.contains('ad-sidebar'));assert(top.children[1].classList.contains('ad-admin-centre'));assert(top.children[2].classList.contains('circles-attention'));
 assert.deepEqual([...f.document.querySelectorAll('#ad-areas a')].map(a=>a.textContent),['Users','Access','Curriculum','Intehaan','Media']);assert.equal(f.document.querySelector('.ad-admin-centre').firstElementChild.id,'ad-areas');assert.equal(f.document.querySelectorAll('[data-ad-programme-choice]').length,0);assert(!f.document.body.textContent.includes('Admin-Learn'));
});
test('Admin circle rolls each programme into one entry and its info shows every session',async()=>{
 const f=await fixture(),buttons=f.document.querySelectorAll('[data-ad-circle-info]');assert.equal(buttons.length,1);assert.match(buttons[0].textContent,/2 sessions/);
 buttons[0].dispatchEvent(new f.window.Event('click',{bubbles:true}));assert.equal(f.document.querySelectorAll('.ad-session-detail').length,2);assert.match(f.document.querySelector('.ad-dialog').textContent,/Mishkaat/);assert.match(f.document.querySelector('.ad-dialog').textContent,/Usulul Hadith/);
});

test('all native dashboards have the same daily circle layout and mode-specific action row',async()=>{
 for(const mode of ['learn','teach']){const f=await fixture(mode);assert.equal(f.document.querySelector('.ad-admin-top').children.length,3);assert(f.document.querySelector('[data-ad-step="-1"]'));assert(f.document.querySelector('[data-ad-step="1"]'));assert(f.document.querySelector('[data-ad-today]'));assert.equal(f.document.querySelectorAll('[data-ad-programme-choice]').length,0);assert.match(f.document.querySelector('#ad-areas').textContent,/Aalimiyah/);assert(!f.document.querySelector('#ad-areas').textContent.includes('Users'));assert(f.document.querySelector('[data-ad-calendar]'));}
});
test('native dashboard day browsing requests the exact date outside the loaded week',async()=>{
 const f=await fixture(),requested=[];f.settings.requestDay=day=>requested.push(day);f.window.M4L_ACADEMY_DASHBOARD.open(f.home,f.settings);f.document.querySelector('[data-ad-step="-1"]').click();assert.equal(requested[0],new Date(Date.parse(f.home.startDate+'T12:00Z')-86400000).toISOString().slice(0,10));
});
