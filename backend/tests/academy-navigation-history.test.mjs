import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
const {parseHTML}=createRequire(import.meta.url)('linkedom'),code=readFileSync(new URL('../../js/m4l-academy-history.js',import.meta.url),'utf8');
function historyModel(){const entries=[{url:'https://academy.test/academy/#dashboard',state:null}];let index=0;return {entries,get index(){return index;},get length(){return entries.length;},get state(){return entries[index].state;},replaceState(state,_title,url){entries[index]={state,url:url?new URL(url,entries[index].url).href:entries[index].url};},pushState(state,_title,url){entries.splice(index+1);entries.push({state,url:new URL(url,entries[index].url).href});index++;},back(){if(index)index--;},forward(){if(index<entries.length-1)index++;},visit(url){this.pushState(null,'',url);}};}
function page(model,storage=new Map(),{referrer=''}={}){
 const history={get length(){return model.length;},get state(){return model.state;},replaceState:model.replaceState.bind(model),pushState:model.pushState.bind(model),back:model.back.bind(model),forward:model.forward.bind(model)};
 const {window,document}=parseHTML('<html><head></head><body><div class="academy-page-actions"></div><a id="reader" href="/academy/library/?file=private-id">Library</a><a id="external" href="https://outside.test/">External</a></body></html>');
 delete window.M4L_ACADEMY_HISTORY;window.self=window;window.top=window;Object.defineProperty(document,'referrer',{value:referrer});let token='account-one';
 const url=()=>new URL(model.entries[model.index].url),location={get href(){return url().href;},get origin(){return url().origin;},get pathname(){return url().pathname;},get search(){return url().search;}};
 const context={window,document,location,history,localStorage:{getItem:()=>token},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},crypto,Date,URL,matchMedia:()=>({matches:false,addEventListener(){}}),MutationObserver:class{observe(){}}};
 vm.runInNewContext(code,context);return {window,document,storage,push:url=>history.pushState(null,'',url),back:()=>document.querySelector('[data-app-back]'),forward:()=>document.querySelector('[data-app-forward]'),click(id){document.getElementById(id).dispatchEvent(new window.Event('click',{bubbles:true}));},event(name){window.dispatchEvent(new window.Event(name));},setToken(value){token=value;}};
}
test('Back and Forward retain the app trace through same-tab reader navigation without a referrer',()=>{
 const h=historyModel(),first=page(h);assert.equal(first.back().disabled,true);first.click('reader');const saved=JSON.parse([...first.storage.values()][0]);assert.equal(saved.pending.path,'/academy/library/');assert(!JSON.stringify(saved).includes('private-id'));
 h.visit('/academy/library/?file=private-id');const reader=page(h,first.storage);assert.equal(reader.back().disabled,false);reader.back().click();assert.equal(h.index,0);first.event('pageshow');assert.equal(first.forward().disabled,false);first.forward().click();assert.equal(h.index,1);reader.event('pageshow');assert.equal(reader.forward().disabled,true);
});
test('hash entries and replaced router URLs keep correct positions without double counting',()=>{
 const h=historyModel(),f=page(h);h.visit('#activity/PROGRAM/one/learn');f.event('popstate');f.event('hashchange');assert.equal(f.back().disabled,false);h.replaceState(null,'','#activity/PROGRAM/two/learn');f.event('hashchange');f.back().click();assert.equal(h.index,0);f.event('popstate');assert.equal(f.back().disabled,true);assert.equal(f.forward().disabled,false);
});
test('external links do not create a native handoff and account changes reset navigation controls',()=>{
 const h=historyModel(),f=page(h);f.click('external');assert.equal(JSON.parse([...f.storage.values()][0]).pending,undefined);f.push('#activity/PROGRAM/one/teach');assert.equal(f.back().disabled,false);f.setToken('account-two');f.event('m4l-academy-session');assert.equal(f.back().disabled,true);assert.equal(f.forward().disabled,true);
});
