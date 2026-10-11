import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const script=await readFile(new URL('../../js/m4l-academy-navigation.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<3;i++) await new Promise(resolve=>setImmediate(resolve));};
function storage(values={}) {
  const data=new Map(Object.entries(values));
  return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),key:index=>[...data.keys()][index],get length(){return data.size;}};
}
function fixture(path='/academy/open-library/',search='') {
  const nodes=new Map(), handlers=new Map(), requests=[], children=[];
  function element() {
    let markup='';
    return {hidden:false,attrs:{},handlers:new Map(),classList:{add(){}},
      setAttribute(key,value){this.attrs[key]=value;},
      addEventListener(type,fn){this.handlers.set(type,fn);},replaceChildren(){markup='';},
      get innerHTML(){return markup;},set innerHTML(value){markup=value;for(const match of value.matchAll(/id="([^"]+)"/g)) if(!nodes.has(match[1])) nodes.set(match[1],element());}
    };
  }
  const forYou=element();forYou.hidden=true;nodes.set('library-for-you',forYou);
  const localStorage=storage(),sessionStorage=storage(),location={pathname:path,search};
  const document={createElement:element,getElementById:id=>nodes.get(id),body:{classList:{add(){}},prepend:(...items)=>children.unshift(...items)}};
  const window={M4L_CONFIG:{API_BASE:'https://api.test'},addEventListener:(type,fn)=>handlers.set(type,fn),dispatchEvent:event=>handlers.get(event.type)?.(event)};
  let result={success:true,signedIn:true,student:true,personalActivities:[
    {id:'Pilot-actual-id',name:'Reboot',kind:'PROGRAM',roles:['STUDENT']},
    {id:'Course-actual-id',name:'Barakah <course>',kind:'COURSE',roles:['TEACHER']}
  ]}, hold=false,release,ok=true,logoutFailure=false;
  const fetch=async(url,options)=>{requests.push({url,options});if(url.endsWith('/api/account/logout')){if(logoutFailure)throw Error('Synthetic connection failure');return {ok:true,json:async()=>({success:true})};}const snapshot=structuredClone(result);if(hold){hold=false;await new Promise(resolve=>{release=resolve;});}return{ok,json:async()=>snapshot};};
  runInNewContext(script,{document,window,location,localStorage,sessionStorage,fetch,URLSearchParams,encodeURIComponent,Event});
  return {nodes,handlers,requests,children,localStorage,sessionStorage,location,forYou,
    setResult:value=>{result=value;},setOk:value=>{ok=value;},setLogoutFailure:value=>{logoutFailure=value;},defer:()=>{hold=true;},release:()=>release(),
    refresh:()=>handlers.get('m4l-academy-session')()};
}
const app=fixture();
assert.equal(app.requests.length,0,'Public Library needs no account request for a visitor');
assert.equal(app.forYou.hidden,true);
assert.equal(app.nodes.get('ac-library').href,'/academy/open-library/');
assert.equal(app.children[1].hidden,true);
app.localStorage.setItem('m4l_account_token','first-account');app.refresh();await flush();
assert.equal(app.requests[0].url,'https://api.test/api/academy/entrance');
assert.equal(app.requests[0].options.headers.Authorization,'Bearer first-account');
assert.equal(app.requests[0].options.body,'{}');
assert.equal(app.forYou.hidden,false);
assert.equal(app.nodes.get('ac-library').href,'/academy/library/');
assert.equal(app.nodes.get('ac-progress').hidden,false);
assert.match(app.children[1].innerHTML,/\/academy\/#activity\/PROGRAM\/Pilot-actual-id/);
assert.match(app.children[1].innerHTML,/href="\/academy\/#workshops"/);
assert.equal((app.children[1].innerHTML.match(/<span>Courses<\/span>/g)||[]).length,1);
assert.doesNotMatch(app.children[1].innerHTML,/Course-actual-id|Barakah/);
assert.match(app.children[1].innerHTML,/<small>Teacher<\/small>/);
assert.doesNotMatch(app.children[0].innerHTML,/>Programs and Courses<|>Timetable</);
// Every account role can move between For You and Explore; student-only tools stay scoped.
app.setResult({success:true,signedIn:true,student:false,personalActivities:[]});app.refresh();await flush();
assert.equal(app.forYou.hidden,false);
assert.equal(app.nodes.get('ac-progress').hidden,true);
assert.equal(app.nodes.get('ac-recorder').hidden,true);
assert.equal(app.children[1].hidden,false);
assert.doesNotMatch(app.children[1].innerHTML,/<span>Courses<\/span>/);
app.setOk(false);app.refresh();await flush();
assert.equal(app.forYou.hidden,true);
assert.equal(app.nodes.get('ac-library').href,'/academy/open-library/');
assert.equal(app.children[1].hidden,true,'Failed validation cannot restore private activity names');
app.setOk(true);app.defer();app.refresh();await flush();
app.localStorage.removeItem('m4l_account_token');app.handlers.get('storage')({key:'m4l_account_token'});app.release();await flush();
assert.equal(app.forYou.hidden,true,'A delayed account response must not survive sign-out');
assert.equal(app.children[1].innerHTML,'');
app.localStorage.setItem('m4l_account_token','next-account');app.setResult({success:true,signedIn:true,student:false,personalActivities:[{id:'Pilot-actual-id',name:'Reboot',kind:'PROGRAM',roles:['ADMIN']}]});app.refresh();await flush();
app.localStorage.setItem('m4l_account_context','private');app.localStorage.setItem('m4l_app_cache_test','private');
app.sessionStorage.setItem('m4l_academy_signed_in','1');app.sessionStorage.setItem('m4l_admin_progress_dashboard_test','private');
app.nodes.get('ac-signout').handlers.get('click')();
assert.equal(app.location.href,'/academy/#overview');
assert.equal(app.localStorage.getItem('m4l_account_token'),null);
assert.equal(app.localStorage.getItem('m4l_app_cache_test'),null);
assert.equal(app.sessionStorage.length,0);
assert.equal(app.children[1].hidden,true);
assert.equal(app.requests.filter(r=>r.url.endsWith('/api/account/logout')).length,0,'Sheets sign-out must keep its existing behavior');
for(const fail of [false,true]) {
  const d1=fixture();d1.localStorage.setItem('m4l_account_token','current-d1-account');
  d1.setResult({success:true,signedIn:true,sessionStore:'D1',personalActivities:[]});d1.refresh();await flush();
  d1.setLogoutFailure(fail);d1.nodes.get('ac-signout').handlers.get('click')();await flush();
  const request=d1.requests.find(r=>r.url.endsWith('/api/account/logout'));
  assert.equal(request.options.headers.Authorization,'Bearer current-d1-account');assert.equal(request.options.keepalive,true);assert.equal(request.options.body,'{}');
  assert.equal(d1.localStorage.getItem('m4l_account_token'),null);assert.equal(d1.location.href,'/academy/#overview');
}
const replaced=fixture();replaced.localStorage.setItem('m4l_account_token','old-d1-account');replaced.setResult({success:true,signedIn:true,sessionStore:'D1'});replaced.refresh();await flush();
replaced.localStorage.setItem('m4l_account_token','replacement-account');replaced.nodes.get('ac-signout').handlers.get('click')();await flush();
assert.equal(replaced.requests.filter(r=>r.url.endsWith('/api/account/logout')).length,0,'A prior account cannot select the replacement account’s sign-out store');
const standalone=fixture('/recorder/');assert.equal(standalone.children.length,0,'Recorder use outside Academy keeps its existing interface');
const recorder=fixture('/recorder/','?academy=1');assert.equal(recorder.children.length,2);
const program=fixture('/programs/attendance.html','?program=Pilot-actual-id');program.localStorage.setItem('m4l_account_token','staff');program.refresh();await flush();
assert.match(program.children[1].innerHTML,/Pilot-actual-id" aria-current="page"/);
for(const file of ['academy/library/index.html','academy/open-library/index.html','academy/library/manage/index.html','programs/index.html','programs/manage.html','programs/timetable.html','programs/attendance.html','programs/library.html','programs/library-view.html','users/index.html','recorder/index.html']) {
  const html=await readFile(new URL(`../../${file}`,import.meta.url),'utf8');
  assert.match(html,/m4l-academy-navigation\.js/);assert.match(html,/m4l-academy-navigation\.css/);
}
console.log('Academy shared navigation: public/private links, actual subscribed IDs, all-role Library tabs, stale-response sign-out, tool coverage and standalone recorder isolation passed.');

// Cloudflare Pages serves canonical extensionless addresses; all page tabs must match them.
const programNav=await readFile(new URL('../../js/m4l-program-management-navigation.js',import.meta.url),'utf8');
const programId='PRG-11111111-1111-4111-8111-111111111111';
async function programHeader(path,globalAdmin=true,options={}) {
  const headers=[],classes=new Set(),handlers=new Map(),tokens=storage({m4l_account_token:'staff'});
  const document={querySelector:()=>({prepend:header=>headers.push(header)}),createElement:()=>({remove(){headers.splice(headers.indexOf(this),1);}}),body:{classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}}};
  const window={addEventListener:(type,fn)=>handlers.set(type,fn)};
  runInNewContext(programNav,{document,window,location:{pathname:path,search:'?program='+programId},localStorage:tokens,URLSearchParams,
    fetch:async()=>({ok:true,json:async()=>({success:true,store:'D1',globalAdmin,programs:[{id:programId,name:'Synthetic <Program>',status:'ACTIVE'}],...options})})});
  await flush();return {headers,classes,handlers,tokens};
}
for(const [page,label] of [['timetable','Timetable'],['manage','People &amp; classes'],['media','Library'],['library','Library'],['library-view','Library'],['attendance','Attendance']]) {
  for(const ending of ['', '.html', '/']) {
    const view=await programHeader('/programs/'+page+ending);
    assert.equal(view.headers.length,1);const html=view.headers[0].innerHTML;
    const selected=[...html.matchAll(/<a [^>]*aria-current="page"[^>]*>([^<]+)<\/a>/g)].map(m=>m[1]);
    assert.deepEqual(selected,[label],`Correct current tab at ${page+ending}`);
    assert.equal((html.match(/<nav class="pgm-tabs"[\s\S]*?<\/nav>/)?.[0].match(/<a /g)||[]).length,4);
    assert.doesNotMatch(html,/>User profiles</);assert.match(html,/Synthetic &lt;Program&gt;/);
    assert.match(html,new RegExp('href="/programs/\\?program='+programId+'">Back to Program management'));
  }
}
const profilesHeader=await programHeader('/users/');
assert.doesNotMatch(profilesHeader.headers[0].innerHTML,/aria-current="page"/,'User profiles does not falsely highlight Timetable');
const scopedHeader=await programHeader('/programs/manage',false);
assert.match(scopedHeader.headers[0].innerHTML,/aria-current="page">People &amp; classes/);
const inaccessible=await programHeader('/programs/manage',false,{programs:[]});
assert.equal(inaccessible.headers.length,0,'No Program identity or management header is inferred without access');
console.log('Program navigation: canonical and .html current tabs, four management tabs, labelled return and scoped identity passed.');
for(const page of ['media','attendance']) {
 const html=await readFile(new URL('../../programs/'+page+'.html',import.meta.url),'utf8');
 assert.match(html,/<section class="pgm-media-card"[^>]*><p>Coming soon<\/p><\/section>/);
 assert.doesNotMatch(html,/m4l-program-attendance\.js|Submit attendance|Open public Library|My Library|Private media attachments/);
}
const timetablePage=await readFile(new URL('../../programs/timetable.html',import.meta.url),'utf8');
assert.doesNotMatch(timetablePage,/pw-name|pw-save-name|pw-program-zoom|pw-save-zoom|pw-card-editor|pw-access-model/,'Program settings live on the Program list, outside the timetable editor');
console.log('Program Library and Attendance tabs show only Coming soon; timetable omits duplicated Program settings.');
