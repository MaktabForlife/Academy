import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../../js/m4l-academy-header-date.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const date=(gregorian='2026-10-26',hijri='15 Jumada al-ula 1448')=>({gregorian,hijri});
function fixture({at='2026-10-26T08:00:00Z',cached,fetcher=async()=>{throw Error('Offline');},hidden=false,storageBlocked=false}={}){
 let now=Date.parse(at),id=0,lookup=fetcher;const timers=new Map(),events=new Map(),calls=[],values=new Map(cached?[['m4l_header_date',JSON.stringify(cached)]]:[]);
 const hijri={textContent:''},gregorian={textContent:'',dateTime:''};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const document={hidden,getElementById:id=>id==='academy-hijri-date'?hijri:gregorian,addEventListener:(name,fn)=>events.set(name,fn)};
 const window={M4L_CONFIG:{API_BASE:'https://api.test/'},addEventListener:(name,fn)=>events.set(name,fn)};
 const sessionStorage={getItem:key=>{if(storageBlocked)throw Error('Blocked');return values.get(key)||null;},setItem:(key,value)=>{if(storageBlocked)throw Error('Blocked');values.set(key,value);}};
 runInNewContext(source,{window,document,sessionStorage,Date:Clock,Intl,AbortController,
  setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),
  fetch:async(url,options)=>{calls.push({url,options});return lookup(options.signal);}});
 return {hijri,gregorian,document,calls,values,events,now:()=>now,respond:fn=>{lookup=fn;},async advance(ms){
  const target=now+ms;
  for(;;){const next=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}
  now=target;await flush();
 }};
}
const reply=(data=date(),ok=true)=>async()=>({ok,json:async()=>data});

for(const failure of ['network','unavailable','invalid-json','http','empty','stale'])test('the visible header automatically recovers from '+failure+' without a focus event',async()=>{
 const fetcher=failure==='network'?async()=>{throw Error('Offline');}:failure==='invalid-json'?async()=>({ok:true,json:async()=>{throw SyntaxError('Bad response');}}):reply(failure==='unavailable'?date('2026-10-26',null):failure==='empty'?date('2026-10-26',''):failure==='stale'?date('2026-10-25'):date(),failure!=='http');
 const f=fixture({fetcher});await flush();assert.equal(f.hijri.textContent,'Hijri date unavailable');assert.equal(f.calls.length,1);
 f.respond(reply());await f.advance(59999);assert.equal(f.calls.length,1);await f.advance(1);
 assert.equal(f.hijri.textContent,date().hijri);assert.equal(f.calls.length,2);assert.equal(f.calls[1].url,'https://api.test/api/academy/header-date');assert.equal(f.calls[1].options.headers,undefined);
 await f.advance(3600000);f.events.get('focus')();await flush();assert.equal(f.calls.length,2,'A recovered date adds no further requests today');
});

test('a valid date already obtained today survives expired-cache refresh failures',async()=>{
 const f=fixture({cached:{...date(),savedAt:Date.parse('2026-10-26T06:00:00Z')}});await flush();assert.equal(f.hijri.textContent,date().hijri);
 await f.advance(60000);assert.equal(f.hijri.textContent,date().hijri);assert.equal(f.calls.length,2);
 assert.equal(JSON.parse(f.values.get('m4l_header_date')).savedAt,Date.parse('2026-10-26T06:00:00Z'),'Failures do not rewrite the valid cache');
 f.respond(reply());f.events.get('online')();await flush();assert.equal(f.calls.length,3);assert.equal(f.hijri.textContent,date().hijri);
});

test('fresh same-day cache is reused, while old-day data is never displayed as today',async()=>{
 const fresh=fixture({cached:{...date(),savedAt:Date.parse('2026-10-26T07:59:00Z')}});await flush();assert.equal(fresh.calls.length,0);assert.equal(fresh.hijri.textContent,date().hijri);
 const stale=fixture({cached:{...date('2026-10-25'),savedAt:Date.parse('2026-10-26T07:59:00Z')}});await flush();assert.equal(stale.calls.length,1);assert.equal(stale.hijri.textContent,'Hijri date unavailable');
});

test('hidden pages suspend retry traffic and resume automatically when visible',async()=>{
 const f=fixture();await flush();f.document.hidden=true;await f.advance(300000);assert.equal(f.calls.length,1);
 f.respond(reply());f.document.hidden=false;f.events.get('visibilitychange')();await flush();assert.equal(f.calls.length,2);assert.equal(f.hijri.textContent,date().hijri);
});

test('focus events share one lookup, a stalled lookup times out and retries, and blocked storage is harmless',async()=>{
 const f=fixture({storageBlocked:true,fetcher:signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('Aborted'))))});
 for(let i=0;i<10;i++)f.events.get('focus')();await flush();assert.equal(f.calls.length,1);
 await f.advance(20000);f.respond(reply());await f.advance(59999);assert.equal(f.calls.length,1);await f.advance(1);assert.equal(f.calls.length,2);assert.equal(f.hijri.textContent,date().hijri);
});

test('midnight rolls the header over and rejects an old in-flight response',async()=>{
 let release;const f=fixture({at:'2026-10-26T21:59:59Z',fetcher:()=>new Promise(resolve=>{release=resolve;})});
 await f.advance(2000);assert.equal(f.gregorian.dateTime,'2026-10-27');
 release({ok:true,json:async()=>date()});await flush();assert.equal(f.hijri.textContent,'Hijri date unavailable');assert.equal(f.values.size,0);
 f.respond(reply(date('2026-10-27','16 Jumada al-ula 1448')));await f.advance(1000);assert.equal(f.hijri.textContent,'16 Jumada al-ula 1448');assert.equal(JSON.parse(f.values.get('m4l_header_date')).gregorian,'2026-10-27');
});
