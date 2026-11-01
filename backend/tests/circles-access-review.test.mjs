import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const html=readFileSync(new URL('../../tools/access-review/index.html',import.meta.url),'utf8');
const code=readFileSync(new URL('../../tools/access-review/access-review.js',import.meta.url),'utf8');
const catalogue=[{area:'tafseer',activityKey:'PROGRAM:ta',title:'Tafseer'},{area:'mothers',activityKey:'PROGRAM:mo',title:'MOU'},{area:'courses',activityKey:'COURSE:one',title:'Course one'},{area:'courses',activityKey:'COURSE:two',title:'Course two'}];
function screen(){
 const {window,document}=parseHTML(html);let token='owner-A',dirty=false;const opened=[];
 const localStorage={getItem:()=>token};window.M4L_STUDIO_ACCESS={canLeave:()=>!dirty,attach(host,key){opened.push(key);const child=document.createElement('div');child.textContent='Private record '+key;host.append(child);return {data:{kind:key.startsWith('COURSE:')?'COURSE':'TAFSEER'},loading:Promise.resolve()};}};
 vm.runInContext(code,vm.createContext({window,document,localStorage,location:{search:''},URLSearchParams}));
 return {window,document,opened,setDirty(value){dirty=value;},switch(){token='owner-B';window.dispatchEvent(new window.Event('focus'));}};
}
test('area and Course changes retain separate native scopes and respect unsaved-work guard',async()=>{
 const s=screen(),ui=s.window.M4L_ACCESS_REVIEW.mount(catalogue);await ui.ready;
 assert.deepEqual(s.opened,['PROGRAM:ta']);s.setDirty(true);assert.equal(await ui.choose('mothers'),false);assert.deepEqual(s.opened,['PROGRAM:ta']);assert.match(s.document.getElementById('access-page-status').textContent,/Save or discard/);
 s.setDirty(false);await ui.choose('mothers');await ui.choose('courses','COURSE:two');assert.deepEqual(s.opened,['PROGRAM:ta','PROGRAM:mo','COURSE:two']);
 assert.equal(s.document.getElementById('access-offering-label').hidden,false);assert.equal(s.document.getElementById('access-panel').dataset.kind,'COURSE');
});
test('same-tab account switch clears private content and stale catalogue without polling',async()=>{
 const s=screen(),ui=s.window.M4L_ACCESS_REVIEW.mount(catalogue);await ui.ready;s.switch();
 assert.equal(s.document.getElementById('access-panel').textContent,'');assert.equal(s.document.getElementById('access-offering').children.length,0);assert.match(s.document.getElementById('access-page-status').textContent,/account changed/);
 assert.equal(await ui.choose('courses'),false);assert.deepEqual(s.opened,['PROGRAM:ta']);assert([...s.document.querySelectorAll('button[data-area]')].every(button=>button.disabled));
});
test('catalogue rejects ambiguous native scopes; labels remain text rather than markup',async()=>{
 const s=screen();for(const choices of [[null],[{...catalogue[0],activityKey:'COURSE:wrong'}],[catalogue[0],catalogue[0]]])assert.throws(()=>s.window.M4L_ACCESS_REVIEW.mount(choices),/could not be checked/);
 const ui=s.window.M4L_ACCESS_REVIEW.mount([{...catalogue[2],title:'<img src=x onerror=bad>'}]);await ui.ready;await ui.choose('courses');assert.equal(s.document.querySelector('#access-offering img'),null);assert.equal(s.document.querySelector('#access-offering option').textContent,'<img src=x onerror=bad>');
});
