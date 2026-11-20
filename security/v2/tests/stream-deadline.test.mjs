import test from 'node:test';import assert from 'node:assert/strict';
import {privateStreamDeadline} from '../stream-deadline.mjs';
function clockFixture(){let now=100,scheduled,cleared=0;return {clock:()=>now,schedule:(fn,ms)=>{scheduled={fn,ms};return 1;},unschedule:()=>{cleared++;},advance:n=>{now+=n;},get scheduled(){return scheduled;},get cleared(){return cleared;}};}
test('a private pending Range read is cancelled at its original fixed lease deadline',async()=>{
 const f=clockFixture();let cancelled=0,source;
 const response=new Response(new ReadableStream({start(c){source=c;},cancel(){cancelled++;}}),{status:206,headers:{'Content-Type':'video/mp4','Content-Length':'10','Content-Range':'bytes 0-9/20'}});
 const bounded=privateStreamDeadline(response,{deadline:115,...f}),reader=bounded.body.getReader(),pending=reader.read();
 assert.equal(f.scheduled.ms,15000);assert.equal(bounded.headers.get('Content-Range'),'bytes 0-9/20');assert.equal(bounded.headers.get('X-UAA-Stream-Deadline'),'115000');
 f.advance(15);f.scheduled.fn();await assert.rejects(pending,{code:'LEASE_EXPIRED'});assert.equal(cancelled,1);assert.equal(f.cleared,1);
 assert.throws(()=>source.enqueue(new Uint8Array([1])));
});
test('slow bytes arriving after virtual expiry cannot be delivered even before timer callback',async()=>{
 const f=clockFixture();let source,cancelled=0;
 const bounded=privateStreamDeadline(new Response(new ReadableStream({start(c){source=c;},cancel(){cancelled++;}}),{headers:{'Content-Type':'application/pdf'}}),{deadline:101,...f}),reader=bounded.body.getReader();
 const pending=reader.read();f.advance(1);source.enqueue(new Uint8Array([1,2]));await assert.rejects(pending,{code:'LEASE_EXPIRED'});assert.equal(cancelled,1);
});
test('completed or consumer-cancelled streams release the deadline timer and preserve native Range bytes',async()=>{
 for(const mode of ['complete','cancel']){
  const f=clockFixture();let cancelled=0;const value=new Uint8Array([3,4,5]);
  const response=privateStreamDeadline(new Response(new ReadableStream({start(c){c.enqueue(value);if(mode==='complete')c.close();},cancel(){cancelled++;}}),{headers:{'Content-Type':'audio/mpeg'}}),{deadline:110,...f});
  const reader=response.body.getReader();assert.deepEqual((await reader.read()).value,value);
  if(mode==='complete')assert.equal((await reader.read()).done,true);else await reader.cancel();
  assert.equal(f.cleared,1);assert.equal(cancelled,mode==='cancel'?1:0);
 }
});
test('bodyless HEAD responses gain no stream timer; expired private bodies cannot open a new stream',()=>{
 const f=clockFixture(),head=new Response(null,{headers:{'Content-Type':'video/mp4'}});
 assert.equal(privateStreamDeadline(head,{deadline:110,...f}),head);assert.equal(f.scheduled,undefined);
 assert.throws(()=>privateStreamDeadline(new Response('private',{headers:{'Content-Type':'application/octet-stream'}}),{deadline:100,...f}),{code:'LEASE_EXPIRED'});
});

test('private image/download and stalled JSON bodies have the same fixed deadline',async()=>{
 for(const type of ['image/png','image/jpeg','image/webp','application/json','text/plain','application/x-custom-private']){
  const f=clockFixture();let cancelled=0;
  const response=privateStreamDeadline(new Response(new ReadableStream({cancel(){cancelled++;}}),{headers:{'Content-Type':type,'Content-Disposition':'attachment'}}),{deadline:105,...f}),pending=response.body.getReader().read();
  f.advance(5);f.scheduled.fn();await assert.rejects(pending,{code:'LEASE_EXPIRED'});assert.equal(cancelled,1,type);
 }
});
