import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import worker from '../src/academy-runtime.js';
import {classNotesFixture} from './fixtures/academy-class-notes-fixture.mjs';
import {monthlyFixture,scope} from './fixtures/academy-monthly-subscriptions-fixture.mjs';
import {videoBucket} from './fixtures/academy-session-video-fixture.mjs';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const op=()=>crypto.randomUUID(),ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const row=(id='yaseen')=>({id,title:id==='foundations'?'Foundations of Tafseer':'Surah Yaseen',arabic:'',summary:'A useful summary.',contactMessage:'Contact Admin for access to these lessons.',tone:'plum',visible:true,image:null});
const fields=p=>Object.fromEntries(['id','name','durationYears','timezone','status','revision'].map(k=>[k,p[k]]));
const settle=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));};

test('one guarded table save publishes card text only after acceptance, preserves timetable text, and rejects stale/out-of-scope writes',async()=>{
 const f=await classNotesFixture();try{
  const send=async(path,input={},who='global',workspace='ADMIN')=>{const response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{Authorization:'Bearer '+await f.actor(who),'Content-Type':'application/json','X-Academy-Workspace':workspace},body:JSON.stringify(input)}),f.env);return {status:response.status,body:await response.json()};};
  const all=ok(await send('/api/admin/platform/programs/list')),program=all.programs.find(p=>'PROGRAM:'+p.id===f.scopes.programA);
  const save=(p,extra={},who='global')=>send('/api/admin/platform/programs/save',{...fields(p),operationId:op(),...extra},who);
  const saved=ok(await save(program,{publicCard:{time:'8am',title:'Timetable title',description:'Timetable summary.'}}));
  ok(await send('/api/academy/changes/accept',saved.acceptedChange));
  const changed=ok(await save(saved.program,{websiteCards:[row(),row('foundations')]}));
  const get=async()=>{const r=await worker.fetch(new Request('http://localhost/api/academy/website-cards'),f.env);assert.equal(r.status,200);return r.json();};
  assert.equal((await get()).groups.length,0,'The private change is not yet public');
  ok(await send('/api/academy/changes/accept',changed.acceptedChange));
  const cards=(await get()).groups.find(g=>g.activityKey===f.scopes.programA).cards;
  assert.equal(cards[0].id,'foundations');assert.equal(cards[0].access,'public');assert.equal(cards[1].summary,row().summary);
  assert.equal(changed.program.publicCard.title,'Timetable title');
  assert.equal((await save(saved.program,{websiteCards:[row('luqman')]})).status,409);
  assert.equal((await save(changed.program,{websiteCards:[row()]},'adminB')).status,403);
  const updated=ok(await save(changed.program,{publicCard:{time:'9am',title:'Changed timetable',description:'New timetable summary.'}}));
  assert.equal(updated.program.publicCard.websiteCards.length,2,'A timetable save retains the website table');
  assert.equal((await save(updated.program,{websiteCards:[row(),row()]})).status,400);
  assert.equal((await send('/api/admin/platform/programs/save',{...fields(updated.program),websiteCards:[row()],operationId:op()},'global','ADMIN_LEARN')).status,403);
 }finally{f.close();}
});

test('card images remain unpublished until their table is accepted and arbitrary/private objects cannot be attached',async()=>{
 const f=await classNotesFixture();try{
  f.env.LESSON_MEDIA_BUCKET=videoBucket();const token=await f.actor('global');
  const send=async(path,input,bytes)=>{const r=await worker.fetch(new Request('http://localhost'+path+(bytes?'?metadata='+encodeURIComponent(JSON.stringify(input)):''),{method:'POST',headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':'ADMIN',...(bytes?{}:{'Content-Type':'application/json'})},body:bytes||JSON.stringify(input)}),f.env);return {status:r.status,body:await r.json()};};
  const bytes=Buffer.from([137,80,78,71,13,10,26,10]),sha256=createHash('sha256').update(bytes).digest('hex'),image={sha256,type:'image/png',size:bytes.length,alt:'Sample card artwork'};
  ok(await send('/api/admin/platform/programs/website-card-image',{...image,activityKey:f.scopes.programA},bytes));
  const url='http://localhost/api/academy/website-card-image?program='+encodeURIComponent(f.scopes.programA.slice(8))+'&card=yaseen';
  assert.equal((await worker.fetch(new Request(url),f.env)).status,404);
  const program=ok(await send('/api/admin/platform/programs/list',{})).programs.find(p=>'PROGRAM:'+p.id===f.scopes.programA);
  const invalid=await send('/api/admin/platform/programs/save',{...fields(program),websiteCards:[{...row(),image:{...image,sha256:'0'.repeat(64)}}],operationId:op()});assert.equal(invalid.status,400);
  const saved=ok(await send('/api/admin/platform/programs/save',{...fields(program),websiteCards:[{...row(),image}],operationId:op()}));
  assert.equal((await worker.fetch(new Request(url),f.env)).status,404);
  ok(await send('/api/academy/changes/accept',saved.acceptedChange));
  const response=await worker.fetch(new Request(url),f.env);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),new Uint8Array(bytes));
 }finally{f.close();}
});

test('the actual split stores keep card drafts in Admin and serve only their accepted table publicly',async()=>{
 const f=await splitFixture();try{
  f.databases.core.exec("UPDATE split_deployment_state SET state='READY'");Object.assign(f.source.env,{ACADEMY_DB:f.core,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:f.prepared.report.sourceDigest,ACADEMY_SPLIT_COORDINATOR:f.namespace,ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3'});
  const token=await f.source.actor('global'),send=async(path,input={})=>{const r=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Academy-Workspace':'ADMIN'},body:JSON.stringify(input)}),f.source.env);return {status:r.status,body:await r.json()};};
  const program=ok(await send('/api/admin/platform/programs/list')).programs.find(p=>'PROGRAM:'+p.id===f.scopes.programA),saved=ok(await send('/api/admin/platform/programs/save',{...fields(program),websiteCards:[{...row(),summary:'Private until accepted'}],operationId:op()}));
  assert(!String(f.databases.core.prepare('SELECT public_card_json FROM program_settings WHERE activity_key=?').get(f.scopes.programA).public_card_json).includes('Private until accepted'));
  assert.match(f.databases.admin.prepare('SELECT public_card_json FROM program_settings WHERE activity_key=?').get(f.scopes.programA).public_card_json,/Private until accepted/);
  const get=async()=>{const r=await worker.fetch(new Request('http://localhost/api/academy/website-cards'),f.source.env);assert.equal(r.status,200,await r.clone().text());return r.json();};
  assert.equal((await get()).groups.length,0);ok(await send('/api/academy/changes/accept',saved.acceptedChange));assert.equal((await get()).groups[0].cards[0].summary,'Private until accepted');
 }finally{f.close();}
});

test('Foundations is public only after publication, its files stay scoped, and paid surahs cannot use the public endpoint',async()=>{
 const f=await monthlyFixture();try{
  const admin=await f.login('0001');ok(await f.monthly('configure',{mode:'prepare',policyRevision:0,operationId:op()},admin));
  const id=op(),paid=op();ok(await f.monthly('surah-save',{policyRevision:1,operationId:op(),entries:[{id,name:'Foundations',cardKey:'foundations',completionDate:'2024-01-01',active:true,revision:0},{id:paid,name:'Paid surah',cardKey:'yaseen',completionDate:'2024-01-01',active:true,revision:0}]},admin));
  const read=(surahId,action='read',extra={})=>f.call('/api/academy/public-surah-websites/'+action,{activityKey:scope,surahId,...extra});
  assert.equal((await read(id)).status,404);assert.equal((await read(paid)).status,403);
  const site=(action,surahId,input={})=>f.call('/api/admin/platform/course-websites/'+action,{activityKey:scope,surahId,...input},admin);
  const bytes=new TextEncoder().encode('%PDF-1.4\n%%EOF'),assetId=op(),metadata={activityKey:scope,surahId:id,assetId,filename:'Foundations.pdf',type:'application/pdf',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),operationId:op()};
  const uploaded=await worker.fetch(new Request('http://localhost/api/admin/platform/course-websites/upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{method:'POST',headers:{Authorization:'Bearer '+admin,'X-Academy-Workspace':'ADMIN'},body:bytes}),f.env);assert.equal(uploaded.status,200,await uploaded.clone().text());
  const view=ok(await site('get',id));view.document.materials.files.push({id:op(),assetId,title:'Foundations notes',description:''});
  const saved=ok(await site('save',id,{document:view.document,revision:0,operationId:op()}));
  assert.equal((await read(id)).status,404);const published=ok(await site('publish',id,{revision:saved.revision,operationId:op()}));
  assert.equal((await read(id)).status,200);assert.equal((await read(paid)).status,403);
  assert.equal((await read(id,'asset',{assetId:op()})).status,404);
  const pdf=await worker.fetch(new Request('http://localhost/api/academy/public-surah-websites/asset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({activityKey:scope,surahId:id,assetId})}),f.env);assert.equal(pdf.status,200);assert.deepEqual(new Uint8Array(await pdf.arrayBuffer()),bytes);
  const catalogue=await worker.fetch(new Request('http://localhost/api/academy/website-cards'),f.env);const data=await catalogue.json();assert.equal(catalogue.status,200);assert(data.publicLinks.foundations.href.includes('/public/'));
  ok(await site('withdraw',id,{revision:published.revision,operationId:op()}));assert.equal((await read(id)).status,404);
 }finally{f.db.close();}
});

test('public cards show the custom contact popup while entitled dashboard cards open lessons, and account changes clear the links',async()=>{
 const {window,document}=parseHTML('<html><body><div id="cards"></div></body></html>');
 let token='one';
 document.createElement=(original=>name=>{const node=original.call(document,name);if(name==='dialog'){node.showModal=()=>{node.open=true;};node.close=()=>{node.open=false;};}return node;})(document.createElement);
 const context={window,document,URL,localStorage:{getItem:()=>token},MutationObserver:window.MutationObserver};
 vm.runInNewContext(readFileSync(new URL('../../js/m4l-tafseer-cards.js',import.meta.url),'utf8'),context);
 const cards=window.M4L_TAFSEER_CARDS,host=document.getElementById('cards'),href='/academy/course-websites/view/?program=one&surah=11111111-1111-4111-8111-111111111111';
 cards.setGroups([{cards:[row('foundations'),{...row(),contactMessage:'Please contact our Admin to join this study.'}]}]);
 cards.mount(host,{context:'public',links:{yaseen:{href}}});assert.equal(host.querySelector('a'),null);
 host.querySelector('[data-tafseer-request]').click();const dialog=document.querySelector('dialog');assert(dialog.open);assert.match(dialog.textContent,/Please contact our Admin/);assert.match(dialog.querySelector('a').href,/wa\.me/);dialog.querySelector('[data-tafseer-close]').click();assert.equal(dialog.open,false);
 cards.mount(host,{context:'learn',links:{yaseen:{href}}});assert.equal(host.querySelector('a').getAttribute('href'),href);
 vm.runInNewContext(readFileSync(new URL('../../js/m4l-tafseer-access.js',import.meta.url),'utf8'),{...context,fetch:async()=>Response.json({success:true,links:{yaseen:{href}}})});
 window.M4L_TAFSEER_ACCESS.setLinks({yaseen:{href}});await settle();token='';window.dispatchEvent(new window.Event('m4l-academy-session-ended'));await settle();assert.equal(host.querySelector('a'),null);assert(host.querySelector('[data-tafseer-request]'));
});

test('Admin stages multiple card edits and additions until one table save; discard restores the saved table',async()=>{
 const {window,document}=parseHTML('<html><body><div id="table"></div></body></html>');let saves=0,last;
 vm.runInNewContext(readFileSync(new URL('../../js/m4l-website-card-table.js',import.meta.url),'utf8'),{window,document,URL,crypto});
 const host=document.getElementById('table'),table=window.M4L_WEBSITE_CARD_TABLE.mount({host,onSave:async rows=>{saves++;last=rows;return rows;}});table.sync('admin|program',[row()]);
 const title=host.querySelector('[data-wct-field="title"]');title.value='Edited title';title.dispatchEvent(new window.Event('input',{bubbles:true}));
 host.querySelector('[data-wct-action="add"]').click();const message=host.querySelectorAll('[data-wct-field="contactMessage"]')[1];message.value='A new contact message';message.dispatchEvent(new window.Event('input',{bubbles:true}));
 assert.equal(saves,0);assert(table.dirty());host.querySelector('[data-wct-action="save"]').click();await settle();assert.equal(saves,1);assert.equal(last.length,2);assert.equal(last[0].title,'Edited title');assert.equal(last[1].contactMessage,'A new contact message');assert.equal(table.dirty(),false);
 host.querySelector('[data-wct-action="add"]').click();assert(table.dirty());host.querySelector('[data-wct-action="discard"]').click();assert.equal(table.values().length,2);assert.equal(saves,1);
});
