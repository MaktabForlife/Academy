import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const helper=readFileSync(new URL('../../js/m4l-course-companion.js',import.meta.url),'utf8'),source=readFileSync(new URL('../../js/m4l-academy-dashboard.js',import.meta.url),'utf8');
function fixture(workspace){
 const nodes=new Map();
 function element(){const node={innerHTML:'',textContent:'',dataset:{},firstElementChild:{},setAttribute(){},addEventListener(){},append(){},replaceChildren(){this.innerHTML='';},querySelectorAll:()=>[],closest:()=>element(),querySelector:()=>element()};node.classList={contains:()=>false,toggle(){}};return node;}
 const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},querySelectorAll:()=>[],createElement:element};
 const window={M4L_ACADEMY_WORKSPACE:{current:()=>workspace,head:()=>null,adminRealm:()=>workspace.startsWith('ADMIN'),classView:()=>null,readerUrl:url=>url},addEventListener(){}};
 const context={window,document,localStorage:{getItem:key=>key==='m4l_account_token'?'synthetic-session':null},URLSearchParams,Intl,Date,setTimeout:()=>1,clearTimeout(){},fetch:async()=>Response.json({success:true})};
 runInNewContext(helper,context);runInNewContext(source,context);
 return {window,nodes,open(mode,roles=['STUDENT']){window.M4L_ACADEMY_DASHBOARD.open({signedIn:true,globalAdmin:mode==='admin',personalActivities:[{kind:'COURSE',id:'kahf',name:'Surah Al Kahf',roles}],personalTimetable:[],workspaceAccess:{learn:true,teach:true,admin:true}},{mode,activityHref:()=>'/academy/#activity/COURSE/kahf/'+(mode==='admin'?'teach':mode),adminLinks:[]});}};
}
for(const [workspace,mode,roles] of [['LEARN','learn',['STUDENT']],['TEACH','teach',['TEACHER']],['ADMIN','admin',['PROGRAM_ADMIN']],['ADMIN_LEARN','learn',['PROGRAM_ADMIN']],['ADMIN_TEACH','teach',['PROGRAM_ADMIN']]]){
 test('Surah Kahf has a website entry in '+workspace+' while retaining its workspace tools',async()=>{
  const f=fixture(workspace);f.open(mode,roles);await new Promise(resolve=>setImmediate(resolve));const markup=f.nodes.get('ad-areas').innerHTML;
  assert.match(markup,/ad-kahf-course/);assert.match(markup,/course-companion\/surah-kahf\/\?course=kahf/);assert.match(markup,/Open course website/);assert.match(markup,new RegExp('workspace='+(workspace==='ADMIN'?'ADMIN_LEARN':workspace)));
  if(mode!=='learn'){assert.match(markup,/ad-kahf-workspace-link/);assert.match(markup,/Teaching tools|Manage course/);assert.match(markup,/#activity\/COURSE\/kahf\/teach/);}
 });
}
test('course cards do not appear for accounts with no assigned course role',async()=>{
 const f=fixture('LEARN');f.open('learn',[]);await new Promise(resolve=>setImmediate(resolve));assert.doesNotMatch(f.nodes.get('ad-areas').innerHTML,/ad-kahf-course/);
});
