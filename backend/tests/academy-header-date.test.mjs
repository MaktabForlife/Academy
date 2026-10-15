import {test} from 'node:test';
import assert from 'node:assert/strict';
import {headerDate,jamiatDate} from '../src/academy/header-date.js';
import runtime from '../src/academy-runtime.js';
const html='<div class="dual-date-widget" data-site-y="2026" data-site-m="10" data-site-d="15"><div class="value islamic hd-out">4 Jumada al-ula 1448</div></div>';
const request=()=>new Request('https://academy.invalid/api/academy/header-date');
const now=new Date('2026-10-15T10:00:00Z');
test('header date extracts only a current, plain Hijri date and caches the source independently of D1',async()=>{
 const entries=new Map(),cache={match:async r=>entries.get(r.url)?.clone(),put:async(r,response)=>entries.set(r.url,response.clone())};let calls=0;
 const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://jamiat.org.za/');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);return new Response(html);};
 const first=await headerDate(request(),{now,cache,fetcher});assert.equal(first.headers.get('Cache-Control'),'public, max-age=900');assert.equal((await first.json()).hijri,'4 Jumada al-ula 1448');
 assert.equal((await (await headerDate(request(),{now,cache,fetcher})).json()).gregorian,'2026-10-15');assert.equal(calls,1);
 assert.equal(jamiatDate(html,'2026-10-16'),null);assert.equal(jamiatDate(html.replace('4 Jumada al-ula 1448','<script>bad</script>'),'2026-10-15'),null);
});
test('unavailable, stale or oversized Jamiat output keeps the source link without making up a Hijri date',async()=>{
 for(const fetcher of [async()=>{throw Error('offline');},async()=>new Response(html.replace('data-site-d="15"','data-site-d="14"')),async()=>new Response('x'.repeat(512*1024+1))]){
  const response=await headerDate(request(),{now,cache:null,fetcher}),data=await response.json();assert.equal(data.hijri,null);assert.equal(data.source,'https://jamiat.org.za/');assert.equal(data.gregorian,'2026-10-15');assert.equal(response.headers.get('Cache-Control'),'public, max-age=60');
 }
});
test('the deployed date route bypasses D1 and never needs Academy credentials',async()=>{
 const original=globalThis.fetch;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const [year,month,day]=today.split('-');
 globalThis.fetch=async()=>new Response(html.replace('data-site-y="2026"','data-site-y="'+year+'"').replace('data-site-m="10"','data-site-m="'+Number(month)+'"').replace('data-site-d="15"','data-site-d="'+Number(day)+'"'));
 const env={ACADEMY_D1_MODE:'ACTIVE',ACADEMY_LIBRARY_MODE:'PUBLIC_ONLY'};
 Object.defineProperty(env,'ACADEMY_DB',{get(){throw Error('Unexpected D1 access');}});
 try{
  const response=await runtime.fetch(request(),env);assert.equal(response.status,200);assert.equal((await response.json()).hijri,'4 Jumada al-ula 1448');
  assert.equal((await runtime.fetch(new Request(request(),{method:'POST'}),env)).status,405);
 }finally{globalThis.fetch=original;}
});
