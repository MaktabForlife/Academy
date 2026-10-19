import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../../js/m4l-academy-page-actions.js',import.meta.url),'utf8');
function control({active=true,hidden=false,parentHidden=false,disabled=false,standalone=false,cssHidden=false,parentCssHidden=false}={}){
  return {hidden,disabled,clicks:0,getClientRects:()=>hidden||cssHidden||parentHidden||parentCssHidden?[]:[{}],parentElement:{getClientRects:()=>parentHidden||parentCssHidden?[]:[{}],closest:()=>parentHidden?{}:null},closest:()=>standalone?null:{classList:{contains:()=>active}},click(){if(!this.disabled)this.clicks++;}};
}
function fixture(controls=[],assessmentRefresh){
  let handler,reloads=0;const removed=[];
  const refresh={addEventListener:(_event,fn)=>{handler=fn;}},signOut={};
  const actions={setAttribute(){},append(){},querySelector:()=>refresh};
  const document={getElementById:id=>id==='ac-signout'?signOut:null,querySelector:selector=>selector==='main'?{append(){}}:null,querySelectorAll:()=>controls,createElement:()=>actions};
  const window={M4L_ACADEMY_ASSESSMENTS:assessmentRefresh?{refreshPage:assessmentRefresh}:undefined};
  runInNewContext(source,{document,window,URLSearchParams,MutationObserver:class{observe(){}},location:{reload(){reloads++;}},sessionStorage:{removeItem:key=>removed.push(key)}});
  return {refresh:()=>handler(),get reloads(){return reloads;},removed};
}

const inactive=control({active:false}),concealed=control({parentHidden:true}),unavailable=control({hidden:true}),current=control();
let page=fixture([inactive,concealed,unavailable,current]);await page.refresh();
assert.equal(current.clicks,1);assert.equal(inactive.clicks+concealed.clicks+unavailable.clicks,0);assert.equal(page.reloads,0,'Refresh reuses only the active page action and its draft guards');
const cssConcealed=control({parentCssHidden:true}),library=control({standalone:true,cssHidden:true});page=fixture([cssConcealed,library]);await page.refresh();assert.equal(cssConcealed.clicks,0);assert.equal(library.clicks,1);assert.equal(page.reloads,0,'A CSS-hidden Library button must refresh its visible page rather than reload the warm cache');
const busy=control({disabled:true});page=fixture([busy]);await page.refresh();
assert.equal(busy.clicks,0);assert.equal(page.reloads,0,'A busy page cannot be forced to reload around its disabled action');
const connected=control({standalone:true});page=fixture([connected]);await page.refresh();assert.equal(connected.clicks,1);assert.equal(page.reloads,0);
const unused=control();page=fixture([unused],async()=>true);await page.refresh();assert.equal(unused.clicks,0);assert.equal(page.reloads,0,'Assessments retains its own refresh and unsaved-change guard');
page=fixture([],async()=>false);await page.refresh();assert.equal(page.reloads,1);assert.deepEqual(page.removed,['m4l_academy_daily_timetable_10656'],'Pages without a content action reload with a fresh Academy snapshot');
console.log('Banner refresh: active page actions, disabled guards, connected pages, assessment refresh and reload fallback passed.');
