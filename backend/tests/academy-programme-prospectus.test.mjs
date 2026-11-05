import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {homepageProspectus,publishedProspectus,programmeProspectus} from '../../portal/shared/programme-prospectus.mjs';
import {publicHome} from '../../portal/shared/public-home.mjs';
import {normaliseAnnouncementFeed} from '../../portal/shared/announcement-feed.mjs';
import {servePortal} from '../tools/portal-site.mjs';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const source=await readFile(new URL('../../portal/circles/prospectus-2027.js',import.meta.url),'utf8');
const sandbox={};vm.runInNewContext(source,sandbox);
const programmes=sandbox.AcademyProspectus2027,tick=()=>new Promise(resolve=>setImmediate(resolve));
const record=(origin='https://academy.test')=>({id:homepageProspectus.announcementId,title:'2027 enrolments · Current students',summary:'A new year of learning.',message:'Speak to the Academy.',imageUrl:'',imageAlt:'',pdfName:'',pdfUrl:'',enrolmentUrl:''});
function fixture(){const {document,window}=parseHTML('<html><head></head><body><div id="host"></div></body></html>');return {document,window,host:document.getElementById('host')};}
test('brochure facts cover the six approved programmes without becoming native timetable authority',()=>{
 assert.equal(programmes.length,6);assert.equal(programmes.every(row=>row.marketing.year===2027),true);
 assert.equal(programmes.find(row=>row.id==='reboot').marketing.start,'05:00');
 assert.equal(programmes.find(row=>row.id==='aalimiyah').marketing.start,'08:30');
 assert.equal(programmes.find(row=>row.id==='arabic-intensive').marketing.end,'09:30');
 assert.equal(programmes.find(row=>row.id==='arabic-adventures').marketing.fee,'R300 per month · Mum and all siblings');
 assert.equal(programmes.some(row=>row.joinUrl||row.activityKey||row.sessionId||row.access),false);
});
test('optional message requires the exact public record, while PDF fields are never exposed or mutated',()=>{
 const row=record();
 assert.equal(publishedProspectus([row]).id,row.id);
 for(const pdfUrl of ['file:///2027.pdf','javascript:alert(1)','https://elsewhere.test/file.pdf','https://academy.test/api/public/academy-announcements/pdf?id='+row.id+'&asset='+'a'.repeat(64)]){
  const input={...row,pdfUrl,pdfName:'Deferred attachment.pdf'},selected=publishedProspectus([input]);
  assert.equal(selected.pdfUrl,'');assert.equal(selected.pdfName,'');assert.equal(input.pdfUrl,pdfUrl);
 }
 assert.equal(publishedProspectus([{...row,id:'00000000-0000-4000-8000-000000000001'}]),null);
 assert.equal(publishedProspectus([]),null);
});
test('the approved panel appears for its exact published notice without requiring a PDF',()=>{
 const f=fixture(),view=programmeProspectus(f.host,{programmes});
 assert.equal(f.host.hidden,true);assert.equal(f.host.textContent,'');view.update([record()]);
 assert.equal(f.host.hidden,false);assert.equal(f.host.querySelectorAll('[data-prospectus-course]').length,6);
 assert.match(f.host.textContent,/2027/);assert.match(f.host.textContent,/09:30–10:30/);
 assert.equal(f.host.querySelector('[data-prospectus-details]').hidden,false);
 assert.equal(f.host.querySelector('[data-full-prospectus]'),null);
 assert.equal(f.host.querySelector('a[href^="https://wa.me/"]').href,'https://wa.me/27828478639');view.destroy();
});
test('withdrawal clears the entire panel and its previous public message',()=>{
 const f=fixture(),view=programmeProspectus(f.host,{programmes});
 view.update([record()]);assert.equal(f.host.hidden,false);
 view.update([]);assert.equal(f.host.hidden,true);assert.equal(f.host.textContent,'');
 assert.equal(f.host.querySelector('[data-full-prospectus]'),null);view.destroy();
});
test('course selection preserves the public announcement and supports stable keyboard tabs without a PDF link',()=>{
 const f=fixture();let opened=null;
 const view=programmeProspectus(f.host,{programmes,onOpen:row=>opened=row});
 view.update([{...record(),pdfUrl:'https://academy.test/deferred.pdf',pdfName:'Deferred.pdf'}]);
 const tab=f.host.querySelector('[data-prospectus-course=mothers]'),right=f.host.querySelector('.enrolments-banner').outerHTML;
 view.choose('tafseer');assert.equal(f.host.querySelector('[role=tabpanel] h3').textContent,'Tafseer and Tadabbur');
 assert.equal(f.host.querySelector('.enrolments-banner').outerHTML,right);assert.equal(f.host.querySelector('[data-prospectus-course=mothers]'),tab);
 const event=new f.window.Event('keydown',{bubbles:true,cancelable:true});event.key='Home';f.host.querySelector('[data-prospectus-course=tafseer]').dispatchEvent(event);
 assert.equal(view.selected,'aalimiyah');
 f.host.querySelector('[data-prospectus-details]').click();assert.equal(opened.id,homepageProspectus.announcementId);
 assert.equal(opened.pdfUrl,'');assert.equal(opened.pdfName,'');view.destroy();
});
test('published headings and brochure text are escaped',()=>{
 const f=fixture(),copy=programmes.map(row=>({...row,marketing:{...row.marketing,description:'<img src=x onerror=alert(1)>'}}));
 const view=programmeProspectus(f.host,{programmes:copy});
 view.update([{...record(),title:'<script>bad()</script>'}]);
 assert.equal(f.host.querySelector('script'),null);assert.equal(f.host.querySelector('img'),null);
 assert.match(f.host.textContent,/<script>/);assert.match(f.host.textContent,/<img/);view.destroy();
});
let fixtureNumber=0;
function homeFixture(rows,{legacy=false,relay=false}={}){
 const origin='https://home-'+(++fixtureNumber)+'.test',f=fixture();
 Object.defineProperty(f.document,'baseURI',{value:origin+'/'});
 f.document.body.innerHTML='<section id="academy-news"><div id="academy-news-reel"><article class="academy-news-card"><h3>Old flyer</h3></article></div></section>';
 const store=new Map();f.window.sessionStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
 f.window.AcademyProspectus2027=programmes;let requests=0;
 f.window.fetch=async()=>{requests++;return {ok:!legacy,status:legacy?503:200,json:async()=>legacy?{success:false,error:'Not activated.',code:'ANNOUNCEMENTS_NOT_ACTIVATED'}:{schema:'ACADEMY_ANNOUNCEMENTS_PUBLIC_V2',success:true,generation:1,announcements:rows(origin)}};};
 if(relay){const raw=f.window.fetch;f.window.fetch=async(url,init)=>{assert.equal(new URL(url).pathname,'/api/public/academy-announcements');assert.equal(init.credentials,'omit');return servePortal(new Request(url),{}, {fetcher:async upstream=>{assert.equal(new URL(upstream.url).pathname,'/api/academy/announcements/published');assert.equal(upstream.headers.has('Cookie'),false);const value=await raw(url,init);return Response.json(await value.json());}});};}
 const refresh=publicHome(f.document);refresh();return {...f,refresh,requests:()=>requests};
}
test('native homepage consumes one cached collection and keeps Bootcamp with a PDF-free 2027 notice',async()=>{
 const f=homeFixture(origin=>[record(origin),{id:'00000000-0000-4000-8000-000000000002',title:'Bootcamp',summary:'The current course.',message:'Details.',imageUrl:'',imageAlt:'',pdfUrl:'',pdfName:'',enrolmentUrl:''}]);
 await tick();await tick();
 assert.equal(f.document.querySelector('.academy-prospectus-announcement').hidden,false);
 assert.equal(f.document.querySelector('.announcement-public-panel .announcement-feature h3').textContent,'Bootcamp');
 for(const control of f.document.querySelectorAll('[data-prospectus-course]'))control.click();
 f.refresh();assert.equal(f.requests(),1);assert.equal(f.document.querySelector('[data-full-prospectus]'),null);
});
test('an authoritative empty publication stays empty despite source brochure data',async()=>{
 const f=homeFixture(()=>[]);await tick();await tick();
 assert.equal(f.document.getElementById('academy-news').hidden,true);
 assert.equal(f.document.querySelector('.academy-prospectus-announcement').hidden,true);
 assert.equal(f.document.querySelector('.announcement-public-panel').hidden,true);
 assert.equal(f.document.querySelector('[data-prospectus-details]'),null);
 assert.equal(f.document.querySelector('[data-full-prospectus]'),null);assert.equal(f.requests(),1);
});
test('unactivated publication preserves existing legacy notices until explicit publication',async()=>{
 const f=homeFixture(()=>[],{legacy:true});await tick();await tick();
 assert.equal(f.document.querySelector('.academy-prospectus-announcement').hidden,true);
 assert.equal(f.document.querySelector('.announcement-summary-list strong').textContent,'Old');
 assert.equal(f.document.querySelector('.announcement-detail h3').textContent,'Old flyer');
 assert.equal(f.document.querySelector('[data-prospectus-details]'),null);
 assert.equal(f.document.querySelector('[data-full-prospectus]'),null);assert.equal(f.requests(),1);
});

const nativeAttachment=(kind,id,hash='a'.repeat(64))=>'/api/academy/announcements/'+kind+'?id='+id+'&asset='+hash;
test('native published attachment routes survive the public relay and render both homepage notices',async()=>{
 const bootId='00000000-0000-4000-8000-000000000003';let original;
 const f=homeFixture(()=>original=[{...record(),imageUrl:nativeAttachment('image',homepageProspectus.announcementId),pdfUrl:nativeAttachment('pdf',homepageProspectus.announcementId),pdfName:'Deferred.pdf'},{id:bootId,title:'Retained Bootcamp',summary:'Existing notice.',message:'Details.',imageUrl:nativeAttachment('image',bootId),imageAlt:'Bootcamp flyer',pdfUrl:'',pdfName:'',enrolmentUrl:''}],{relay:true});
 await tick();await tick();
 assert.equal(f.document.querySelector('.academy-prospectus-announcement').hidden,false);
 assert.equal(f.document.querySelector('.announcement-public-panel .announcement-feature h3').textContent,'Retained Bootcamp');
 const image=f.document.querySelector('.announcement-public-panel img');
 assert.equal(new URL(image.src).pathname,'/api/public/academy-announcements/image');
 assert.equal(new URL(image.src).searchParams.get('id'),bootId);
 assert.equal(f.document.querySelector('[data-full-prospectus]'),null);
 assert.equal(original[0].pdfUrl,nativeAttachment('pdf',homepageProspectus.announcementId));
 assert.equal(f.requests(),1);
});
test('public attachment mapping is idempotent for saved feeds and rejects unreviewed routes and origins',()=>{
 const origin='https://mapped-feed.test',row={...record(),imageUrl:nativeAttachment('image',homepageProspectus.announcementId),pdfUrl:nativeAttachment('pdf',homepageProspectus.announcementId)},value={schema:'ACADEMY_ANNOUNCEMENTS_PUBLIC_V2',success:true,generation:1,announcements:[row]};
 const normalise=v=>normaliseAnnouncementFeed(v,origin,'/api/public/academy-announcements/','/api/academy/announcements/');
 const checked=normalise(value);assert.deepEqual(normalise(checked),checked);
 assert.equal(new URL(checked.announcements[0].imageUrl).pathname,'/api/public/academy-announcements/image');
 assert.equal(new URL(checked.announcements[0].pdfUrl).pathname,'/api/public/academy-announcements/pdf');
 assert.equal(row.imageUrl,nativeAttachment('image',row.id));
 for(const imageUrl of ['https://evil.test'+row.imageUrl,'/api/private/image?id='+row.id+'&asset='+'a'.repeat(64),'/api/academy/announcements/image/extra?id='+row.id+'&asset='+'a'.repeat(64),row.imageUrl.replace('a'.repeat(64),'invalid'),origin+row.imageUrl+'#fragment'])
  assert.throws(()=>normalise({...value,announcements:[{...row,imageUrl}]}),/attachment needs review/);
 assert.throws(()=>normaliseAnnouncementFeed(value,origin,'/api/public/academy-announcements/'),/attachment needs review/);
});
