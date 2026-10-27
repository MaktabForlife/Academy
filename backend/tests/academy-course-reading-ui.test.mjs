import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../js/m4l-course-reading.js',import.meta.url),'utf8');
function fixture({loading=false,hidden=false}={}){
 const documentEvents=new Map(),windowEvents=new Map(),scrolls=[],created=[];let observer,modal=false,current;
 function node(){const classes=new Set(),attrs=new Map();return {children:[],isConnected:true,dataset:{},innerHTML:'',classList:{add:c=>classes.add(c),contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}},setAttribute:(k,v)=>attrs.set(k,String(v)),getAttribute:k=>attrs.get(k)??null,append(child){this.children.push(child);},focus(){this.focused=true;},querySelector:()=>null};}
 const root=node(),body=node();if(loading)body.classList.add('course-loading');
 const anchor={isConnected:true,getBoundingClientRect:()=>({top:root.classList.contains('academy-reading-focus')?100:240,bottom:500})};
 const page={querySelectorAll:()=>[anchor]};
 function makeToolbar(){const item=node();item.hidden=hidden;item.closest=s=>s==='[hidden]'?item.hidden?{}:null:page;item.querySelector=()=>item.children.find(b=>b.getAttribute('data-course-reading-focus')!==null)||null;item.getBoundingClientRect=()=>({bottom:root.classList.contains('academy-reading-focus')?56:220});return item;}
 current=makeToolbar();
 const document={body,documentElement:root,querySelectorAll:s=>s.includes('#view-lesson')?[current]:current.children,querySelector:s=>s==='.academy-banners'?{getBoundingClientRect:()=>({bottom:170})}:s==='dialog[open]'&&modal?{}:null,createElement:()=>{const item=node();created.push(item);return item;},addEventListener:(type,fn)=>documentEvents.set(type,fn)};
 const window={addEventListener:(type,fn)=>windowEvents.set(type,fn),scrollBy:options=>scrolls.push(options)};
 class Observer{constructor(fn){observer=fn;}observe(){}}
 const context=vm.createContext({document,window,MutationObserver:Observer,requestAnimationFrame:fn=>fn()});vm.runInContext(source,context);
 const click=()=>documentEvents.get('click')({target:{closest:()=>current.children[0]},preventDefault(){}});
 return {root,body,window,scrolls,created,context,click,button:()=>current.children[0],sync:()=>observer(),escape(){documentEvents.get('keydown')({key:'Escape',preventDefault(){}});},modal:value=>{modal=value;},replace(){current=makeToolbar();observer();},hide(){current.hidden=true;observer();},event:(name,event)=>windowEvents.get(name)(event)};
}
test('reading mode starts with the app header visible and installs once only on an open lesson',()=>{
 const f=fixture();assert.equal(f.button().getAttribute('aria-label'),'Full screen reading');assert.equal(f.button().getAttribute('aria-pressed'),'false');assert.equal(f.root.classList.contains('academy-reading-focus'),false);vm.runInContext(source,f.context);assert.equal(f.created.length,1);
 assert.equal(fixture({loading:true}).created.length,0);assert.equal(fixture({hidden:true}).created.length,0);
});
test('full-screen reading preserves the reading position and can exit with its button or Escape',()=>{
 const f=fixture();f.click();assert.equal(f.root.classList.contains('academy-reading-focus'),true);assert.equal(f.button().getAttribute('aria-label'),'Exit full screen reading');assert.equal(f.button().getAttribute('aria-pressed'),'true');assert.equal(f.scrolls[0].top,24);assert.equal(f.button().focused,true);
 f.modal(true);f.escape();assert.equal(f.root.classList.contains('academy-reading-focus'),true,'Escape belongs to an open dialog first');f.modal(false);f.escape();assert.equal(f.root.classList.contains('academy-reading-focus'),false);f.click();f.click();assert.equal(f.root.classList.contains('academy-reading-focus'),false);
});
test('the exit control survives lesson rendering and headers return when leaving the reading page',()=>{
 const f=fixture();f.click();f.replace();assert.equal(f.button().getAttribute('aria-label'),'Exit full screen reading');assert.equal(f.root.classList.contains('academy-reading-focus'),true);f.hide();assert.equal(f.root.classList.contains('academy-reading-focus'),false);
});
test('sign-out and account changes always restore the app headers without stealing focus',()=>{
 for(const name of ['m4l-academy-session-ended','m4l-academy-session','storage']){const f=fixture();f.click();f.button().focused=false;f.event(name,{key:'m4l_account_token'});assert.equal(f.root.classList.contains('academy-reading-focus'),false);assert.equal(f.button().focused,false);}
});
