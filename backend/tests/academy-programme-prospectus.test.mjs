import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {homepageProspectus,publishedProspectus,programmeProspectus} from '../../portal/shared/programme-prospectus.mjs';
import {publicHome} from '../../portal/shared/public-home.mjs';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const source=await readFile(new URL('../../portal/circles/prospectus-2027.js',import.meta.url),'utf8');
const sandbox={};vm.runInNewContext(source,sandbox);
const programmes=sandbox.AcademyProspectus2027,hash='a'.repeat(64),tick=()=>new Promise(resolve=>setImmediate(resolve));
const record=(origin='https://academy.test',asset=hash)=>({id:homepageProspectus.announcementId,title:'2027 enrolments · Current students',summary:'A new year of learning.',message:'Speak to the Academy.',imageUrl:'',imageAlt:'',pdfName:'2027 Prospectus.pdf',pdfUrl:origin+'/api/public/academy-announcements/pdf?id='+homepageProspectus.announcementId+'&asset='+asset,enrolmentUrl:''});
function fixture(){const {document,window}=parseHTML('<html><head></head><body><div id="host"></div></body></html>');return {document,window,host:document.getElementById('host')};}
test('brochure facts cover the six approved programmes without becoming native timetable authority',()=>{
 assert.equal(programmes.length,6);assert.equal(programmes.every(row=>row.marketing.year===2027),true);
 assert.equal(programmes.find(row=>row.id==='reboot').marketing.start,'05:00');
 assert.equal(programmes.find(row=>row.id==='aalimiyah').marketing.start,'08:30');
 assert.equal(programmes.find(row=>row.id==='arabic-intensive').marketing.end,'09:30');
 assert.equal(programmes.find(row=>row.id==='arabic-adventures').marketing.fee,'R300 per month · Mum and all siblings');
 assert.equal(programmes.some(row=>row.joinUrl||row.activityKey||row.sessionId||row.access),false);
});
test('prospectus selection requires the exact published record and a checked public asset URL',()=>{
 const row=record(),options={assetBase:'https://academy.test/circles/'};
 assert.equal(publishedProspectus([row],options).id,row.id);
 for(const pdfUrl of ['file:///2027.pdf','javascript:alert(1)','https://elsewhere.test/file.pdf','https://academy.test/api/academy/announcements/pdf?id='+row.id,'https://academy.test/api/public/academy-announcements/pdf?id=wrong&asset='+hash]){
  assert.equal(publishedProspectus([{...row,pdfUrl}],options),null);
 }
 assert.equal(publishedProspectus([{...row,id:'00000000-0000-4000-8000-000000000001'}],options),null);
 assert.equal(publishedProspectus([],options),null);
 assert.equal(publishedProspectus([{...row,pdfUrl:''}],options),null);
});
test('Admin-published replacements update the link, while withdrawal clears the banner completely',()=>{
 const f=fixture(),view=programmeProspectus(f.host,{programmes,assetBase:'https://academy.test/'}),row=record();
 assert.equal(f.host.hidden,true);assert.equal(f.host.textContent,'');
 view.update([row]);assert.equal(f.host.hidden,false);assert.equal(f.host.querySelector('[data-full-prospectus]').href,row.pdfUrl);
 const next=record('https://academy.test','b'.repeat(64));view.update([next]);
 assert.equal(f.host.querySelector('[data-full-prospectus]').href,next.pdfUrl);
 view.update([]);assert.equal(f.host.hidden,true);assert.equal(f.host.textContent,'');assert.equal(f.host.querySelector('a'),null);
 view.destroy();
});
test('course selection preserves the general announcement and PDF and supports stable keyboard tabs',()=>{
 const f=fixture();let opened=null;
 const view=programmeProspectus(f.host,{programmes,assetBase:'https://academy.test/',onOpen:row=>opened=row});
 view.update([record()]);
 const tab=f.host.querySelector('[data-prospectus-course=mothers]'),right=f.host.querySelector('.enrolments-banner').outerHTML;
 view.choose('tafseer');assert.equal(f.host.querySelector('[role=tabpanel] h3').textContent,'Tafseer and Tadabbur');
 assert.equal(f.host.querySelector('.enrolments-banner').outerHTML,right);assert.equal(f.host.querySelector('[data-prospectus-course=mothers]'),tab);
 const event=new f.window.Event('keydown',{bubbles:true,cancelable:true});event.key='Home';f.host.querySelector('[data-prospectus-course=tafseer]').dispatchEvent(event);
 assert.equal(view.selected,'aalimiyah');
 f.host.querySelector('[data-prospectus-details]').click();assert.equal(opened.id,homepageProspectus.announcementId);
 view.destroy();
});
test('published headings and brochure text are escaped',()=>{
 const f=fixture(),copy=programmes.map(row=>({...row,marketing:{...row.marketing,description:'<img src=x onerror=alert(1)>'}}));
 const view=programmeProspectus(f.host,{programmes:copy,assetBase:'https://academy.test/'});
 view.update([{...record(),title:'<script>bad()</script>'}]);
 assert.equal(f.host.querySelector('script'),null);assert.equal(f.host.querySelector('img'),null);
 assert.match(f.host.textContent,/<script>/);assert.match(f.host.textContent,/<img/);view.destroy();
});
let fixtureNumber=0;
function homeFixture(rows){
 const origin='https://home-'+(++fixtureNumber)+'.test',f=fixture();
 Object.defineProperty(f.document,'baseURI',{value:origin+'/'});
 f.document.body.innerHTML='<section id="academy-news"><div id="academy-news-reel"><article class="academy-news-card"><h3>Old flyer</h3></article></div></section>';
 const store=new Map();f.window.sessionStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
 f.window.AcademyProspectus2027=programmes;let requests=0;
 f.window.fetch=async()=>{requests++;return {ok:true,json:async()=>({schema:'ACADEMY_ANNOUNCEMENTS_PUBLIC_V2',success:true,generation:1,announcements:rows(origin)})};};
 const refresh=publicHome(f.document);refresh();return {...f,refresh,requests:()=>requests};
}
test('native homepage consumes one cached collection and keeps other public notices',async()=>{
 const f=homeFixture(origin=>[record(origin),{id:'00000000-0000-4000-8000-000000000002',title:'Bootcamp',summary:'The current course.',message:'Details.',imageUrl:'',imageAlt:'',pdfUrl:'',pdfName:'',enrolmentUrl:''}]);
 await tick();await tick();
 assert.equal(f.document.querySelector('.academy-prospectus-announcement').hidden,false);
 assert.equal(f.document.querySelector('.announcement-public-panel .announcement-feature h3').textContent,'Bootcamp');
 for(const control of f.document.querySelectorAll('[data-prospectus-course]'))control.click();
 f.refresh();assert.equal(f.requests(),1);
 assert.equal(f.document.querySelectorAll('a[href^="file:"]').length,0);
});
test('an authoritative empty publication stays empty despite old flyers and source brochure data',async()=>{
 const f=homeFixture(()=>[]);await tick();await tick();
 assert.equal(f.document.getElementById('academy-news').hidden,true);
 assert.equal(f.document.querySelector('.academy-prospectus-announcement').hidden,true);
 assert.equal(f.document.querySelector('[data-full-prospectus]'),null);
 assert.equal(f.requests(),1);
});
