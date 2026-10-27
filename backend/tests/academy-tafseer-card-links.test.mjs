import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {mayReadSurah,surahWebsiteLinks} from '../src/academy/d1/surah-websites-access.js';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const href='/academy/course-websites/view/?program=PRG-one&surah=11111111-1111-4111-8111-111111111111';
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
test('completion-month access follows the real paid account across personal dashboards and keeps Admin previews scoped',async()=>{
 const state={account:{},roles:[],monthlyMedia:[]},authority={...state,monthlyMedia:[{activity_key:'PROGRAM:one',lesson_month:'2024-01'}]},row={activity_key:'PROGRAM:one',completion_date:'2024-01-18',monthly_enabled:1};
 assert.equal(mayReadSurah({state,authority,workspace:'TEACH'},row),true);
 assert.equal(mayReadSurah({state,authority,workspace:'LEARN'},row),true);
 assert.equal(mayReadSurah({state,authority,workspace:'LEARN',adminView:true},row),false);
 assert.equal(mayReadSurah({state,authority,workspace:'TEACH'},{...row,completion_date:'2025-01-18'}),false);
 assert.equal(mayReadSurah({state,authority,workspace:'TEACH'},{...row,monthly_enabled:0}),false);
 assert.deepEqual(await surahWebsiteLinks({},null),{links:{},websites:[]});
});
test('card destinations preserve summaries, load once and clear on account changes including late replies',async()=>{
 const {window,document}=parseHTML('<html><body><article data-tafseer-card="yaseen"><p>Website summary</p><button disabled class="tf-card-action tf-card-pending" data-tafseer-link="yaseen"><span>Coming soon</span><svg></svg></button></article></body></html>');
 let token='first',release,calls=0;
 vm.runInNewContext(readFileSync(new URL('../../js/m4l-tafseer-access.js',import.meta.url),'utf8'),{window,document,MutationObserver:window.MutationObserver,localStorage:{getItem:()=>token},fetch:async()=>{calls++;return new Promise(resolve=>{release=()=>resolve(Response.json({success:true,links:{yaseen:{href}}}));});}});
 await settle();assert.equal(calls,1);
 window.M4L_TAFSEER_ACCESS.setLinks({yaseen:{href}});await settle();
 assert.equal(document.querySelector('[data-tafseer-link]').tagName,'A');assert.equal(document.querySelector('p').textContent,'Website summary');assert(document.querySelector('svg'));
 token='';window.dispatchEvent(new window.Event('m4l-academy-session-ended'));release();await settle();
 assert.equal(document.querySelector('[data-tafseer-link]').tagName,'BUTTON');assert.equal(document.querySelector('[data-tafseer-link]').getAttribute('href'),null);assert.equal(calls,1);
 window.M4L_TAFSEER_ACCESS.setLinks({yaseen:{href:'https://external.invalid/unsafe'}});await settle();assert.equal(document.querySelector('[data-tafseer-link]').tagName,'BUTTON');
});
