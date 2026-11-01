import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const helper=readFileSync(new URL('../../js/m4l-course-companion.js',import.meta.url),'utf8'),source=readFileSync(new URL('../../js/m4l-academy-dashboard.js',import.meta.url),'utf8');
function fixture(workspace,{assessmentRows=[],now,storage=new Map(),account="student-one"}={}){
 const nodes=new Map();
 function element(){const node={insertAdjacentHTML(_position,html){this.innerHTML+=html;},innerHTML:'',textContent:'',dataset:{},children:[],firstElementChild:{},setAttribute(){},addEventListener(){},append(){},insertBefore(){},replaceChildren(){this.innerHTML='';},querySelectorAll:()=>[],closest:()=>element(),querySelector:()=>element()};node.classList={contains:()=>false,toggle(){},add(){}};return node;}
 const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},querySelectorAll:()=>[],querySelector:()=>element(),createElement:element};
 const window={M4L_ACADEMY_LOGIN:{currentId:()=>account},M4L_ACADEMY_WORKSPACE:{current:()=>workspace,head:()=>null,adminRealm:()=>workspace.startsWith('ADMIN'),classView:()=>null,readerUrl:url=>url},addEventListener(){}};
 const Clock=now?class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return Date.parse(now);}}:Date;
 const context={window,document,localStorage:{getItem:key=>key==='m4l_account_token'?'synthetic-session':storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},URL,location:{href:"http://academy.invalid/academy/",hash:""},URLSearchParams,Intl,Date:Clock,matchMedia:()=>({matches:false,addEventListener(){}}),setTimeout:()=>1,clearTimeout(){},fetch:async url=>Response.json({success:true,...(url.endsWith('/api/academy/assessments/list')?{assessments:assessmentRows}:{})})};
 runInNewContext(helper,context);runInNewContext(source,context);
 return {window,nodes,storage,open(mode,roles=['STUDENT']){window.M4L_ACADEMY_DASHBOARD.open({signedIn:true,globalAdmin:mode==='admin',personalActivities:[{kind:'COURSE',id:'kahf',name:'Surah Al Kahf',roles}],personalTimetable:[],workspaceAccess:{learn:true,teach:true,admin:true}},{mode,activityHref:()=>'/academy/#activity/COURSE/kahf/'+(mode==='admin'?'teach':mode),adminLinks:[]});}};
}

const note={id:'note-one',versionId:'version-one',date:'2050-01-04',title:'Read the lesson'},area='PROGRAM:test';
function openNotes(f,version=note.versionId){
 const now=Date.now(),sessionKey='session-one',date='2050-01-04';
 f.window.M4L_CLASS_NOTES={snapshot:()=>({status:'ready',sessions:[{ref:JSON.stringify([area,date,sessionKey]),sources:[{activityKey:area,activityName:'Class A',startTime:'10:00'}],dueNotes:[{...note,versionId:version}]}]})};
 f.window.M4L_ACADEMY_DASHBOARD.open({signedIn:true,personalActivities:[{kind:'PROGRAM',id:'test',name:'Class A',roles:['STUDENT']}],personalTimetable:[{activityKey:area,sourceDate:date,sessionKey,startsAt:now+3600000}],workspaceAccess:{learn:true}},{mode:'learn',activityHref:()=>'/academy/#activity/PROGRAM/test/learn',adminLinks:[]});
}
function toggle(f,version=note.versionId){const id=JSON.stringify([area,note.id,version]);f.nodes.get('dashboard').onclick({target:{closest:selector=>selector==='[data-ad-complete]'?{dataset:{adComplete:id}}:null}});}
test('completion is browser-local, reversible, persistent and isolated by account and note revision',()=>{
 const storage=new Map(),f=fixture('LEARN',{storage});openNotes(f);assert.match(f.nodes.get('ad-attention').innerHTML,/Mark complete/);toggle(f);assert.match(f.nodes.get('ad-attention').innerHTML,/Completed notes \(1\)/);assert.equal(storage.size,1);
 const returned=fixture('LEARN',{storage});openNotes(returned);assert.match(returned.nodes.get('ad-attention').innerHTML,/Mark incomplete/);toggle(returned);assert.doesNotMatch(returned.nodes.get('ad-attention').innerHTML,/Completed notes/);
 toggle(returned);const other=fixture('LEARN',{storage,account:'student-two'});openNotes(other);assert.doesNotMatch(other.nodes.get('ad-attention').innerHTML,/Completed notes/);
 const revised=fixture('LEARN',{storage});openNotes(revised,'version-two');assert.doesNotMatch(revised.nodes.get('ad-attention').innerHTML,/Completed notes/);
});
test('Admin-Learn cannot persist student completion',()=>{const f=fixture('ADMIN_LEARN');openNotes(f);assert.doesNotMatch(f.nodes.get('ad-attention').innerHTML,/Mark complete/);toggle(f);assert.equal(f.storage.size,0);});
