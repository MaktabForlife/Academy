import test from 'node:test';
import assert from 'node:assert/strict';
import {openAcademyFromCircles} from '../../portal/shared/circles-sign-in.mjs';
import {approvedCirclesReturn,returnToOpenDashboard} from '../../academy/website-platform/circles-return.mjs';
const origin='https://ummabbadacademy.app';
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(resolve=>setImmediate(resolve));};
function fixture(){
 let finish;const done=new Promise(resolve=>finish=resolve),settled=async()=>{let timer;try{await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Handoff did not settle')),2000);})]);}finally{clearTimeout(timer);}};
 const values=new Map([['m4l_account_token','synthetic-original']]),session=new Map(),childSession=new Map(),navigations=[],childNavigations=[],calls=[],errors=[];
 const storage=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)});
 const child={closed:false,sessionStorage:storage(childSession),location:{replace:url=>{childNavigations.push(url);finish();}},close(){this.closed=true;}};
 const window=new EventTarget();Object.assign(window,{closed:false,location:{origin,replace:url=>{navigations.push(url);finish();}},sessionStorage:storage(session),localStorage:storage(values),open(...args){calls.push(args);return child;},close(){window.closed=true;}});
 const value={token:'synthetic-new',destination:'/academy/admin/#administration/curriculum',circles:{mode:'admin',returnUrl:origin+'/?workspace=admin'}};
 const request=async(path,options)=>{assert.equal(path,'/auth/native-open');assert.deepEqual(options.body.dashboard,{mode:'admin',tool:'curriculum'});return value;};
 return {window,child,values,session,childSession,navigations,childNavigations,calls,errors,value,request,settled,onError:m=>{errors.push(m);finish();}};
}
test('Admin Curriculum uses the current tab after checked native issuance, with a same-tab Home context',async()=>{
 const f=fixture();openAcademyFromCircles({window:f.window,dashboard:{mode:'admin',tool:'curriculum'},request:f.request,onError:f.onError});await f.settled();
 assert.deepEqual(f.calls,[]);assert.deepEqual(f.childNavigations,[]);assert.deepEqual(f.navigations,[origin+'/academy/admin/#administration/curriculum']);assert.equal(f.values.get('m4l_account_token'),'synthetic-new');assert.equal(f.window.closed,false);
 const context=approvedCirclesReturn(f.session.get('m4l_circles_return'));assert(context);assert.equal(context.mode,'admin');assert.equal(context.sameTab,true);assert.equal(context.returnUrl,origin+'/?workspace=admin');assert.deepEqual(f.errors,[]);
});
test('a rejected Curriculum handoff leaves the current page open and retains its credential',async()=>{
 const f=fixture();openAcademyFromCircles({window:f.window,dashboard:{mode:'admin',tool:'curriculum'},request:async()=>{throw Error('Synthetic denied');},onError:f.onError});await f.settled();
 assert.equal(f.window.closed,false);assert.deepEqual(f.calls,[]);assert.deepEqual(f.navigations,[]);assert.equal(f.values.get('m4l_account_token'),'synthetic-original');assert.deepEqual(f.errors,['Synthetic denied']);
});
test('a late Curriculum result cannot navigate after the native account changes',async()=>{
 const f=fixture();let release;openAcademyFromCircles({window:f.window,dashboard:{mode:'admin',tool:'curriculum'},request:()=>new Promise(resolve=>release=resolve),onError:f.onError});
 f.values.set('m4l_account_token','another-synthetic-account');release(f.value);await f.settled();assert.equal(f.window.closed,false);assert.deepEqual(f.navigations,[]);assert.equal(f.values.get('m4l_account_token'),'another-synthetic-account');assert.equal(f.session.size,0);
});
test('a superseded Curriculum opening rejects its delayed result without closing or navigating the tab',async()=>{
 const f=fixture();let release;const opening=openAcademyFromCircles({window:f.window,dashboard:{mode:'admin',tool:'curriculum'},request:()=>new Promise(resolve=>release=resolve),onError:f.onError});opening.close();release(f.value);await settle();
 assert.deepEqual(f.navigations,[]);assert.equal(f.window.closed,false);assert.equal(f.values.get('m4l_account_token'),'synthetic-original');
});
test('foreign destinations and incorrect Admin return contexts fail before credential installation',async t=>{
 for(const kind of ['destination','return','mode','missing-token','missing-destination'])await t.test(kind,async()=>{
  const f=fixture();if(kind==='destination')f.value.destination='https://untrusted.invalid/academy/';if(kind==='return')f.value.circles.returnUrl=origin+'/?workspace=teach';if(kind==='mode')f.value.circles.mode='learn';if(kind==='missing-token')delete f.value.token;if(kind==='missing-destination')delete f.value.destination;
  openAcademyFromCircles({window:f.window,dashboard:{mode:'admin',tool:'curriculum'},request:f.request,onError:f.onError});await f.settled();assert.equal(f.window.closed,false);assert.deepEqual(f.navigations,[]);assert.equal(f.values.get('m4l_account_token'),'synthetic-original');assert.equal(f.session.size,0);assert.equal(f.errors.length,1);
 });
});
test('unrelated Admin tools keep their existing new-tab transport and opener return context',async()=>{
 const f=fixture();f.value.destination='/academy/admin/#administration/users';
 openAcademyFromCircles({window:f.window,dashboard:{mode:'admin',tool:'users'},request:async()=>f.value,onError:f.onError});await f.settled();
 assert.deepEqual(f.calls,[['about:blank','_blank']]);assert.deepEqual(f.navigations,[]);assert.deepEqual(f.childNavigations,[origin+'/academy/admin/#administration/users']);assert.equal(JSON.parse(f.childSession.get('m4l_circles_return')).sameTab,undefined);assert.equal(f.child.closed,false);
});
test('same-tab Home declines opener messaging and close, using the checked ordinary anchor navigation',()=>{
 const f=fixture();const sent=[];f.window.opener={closed:false,postMessage:(...v)=>sent.push(v)};
 const context={mode:'admin',returnUrl:origin+'/?workspace=admin',websiteOrigin:origin,owner:'a'.repeat(64),expiresAt:Date.now()+60000,sameTab:true};
 assert(approvedCirclesReturn(JSON.stringify(context)));assert.equal(returnToOpenDashboard({window:f.window,context}),false);assert.deepEqual(sent,[]);assert.equal(f.window.closed,false);
 assert.equal(approvedCirclesReturn(JSON.stringify({...context,sameTab:'yes'})),null);
});

test('expired, malformed, wrong-owner-format and non-Admin same-tab return hints cannot use an opener',()=>{
 const f=fixture(),sent=[];f.window.opener={closed:false,postMessage:(...v)=>sent.push(v)};
 const valid={mode:'admin',returnUrl:origin+'/?workspace=admin',websiteOrigin:origin,owner:'a'.repeat(64),expiresAt:Date.now()+60000,sameTab:true};
 for(const change of [{expiresAt:Date.now()-1},{sameTab:'yes'},{owner:'bad'},{mode:'learn',returnUrl:origin+'/?workspace=learn'},{returnUrl:'https://untrusted.invalid/?workspace=admin'}]){
  const context={...valid,...change};assert.equal(approvedCirclesReturn(JSON.stringify(context)),null);assert.equal(returnToOpenDashboard({window:f.window,context}),false);
 }
 assert.deepEqual(sent,[]);assert.equal(f.window.closed,false);assert.deepEqual(f.navigations,[]);
});
