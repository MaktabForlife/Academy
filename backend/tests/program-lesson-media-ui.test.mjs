import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {mediaFixture} from './fixtures/academy-lesson-media-fixture.mjs';
import {MOU_MEDIA_PROGRAM} from '../src/academy/d1/lesson-media.js';
const script=readFileSync(new URL('../../js/m4l-program-lesson-media.js',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));};
test('Lesson media opens only for an authorised Program and clears delayed content after account changes',async()=>{
 const f=await mediaFixture();f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};
 try{
  for(const [who,allowed] of [['0001',true],['0004',true],['0002',false],['0003',false],['0005',false]]){
   let token=await f.login(who);const calls=[],elements=new Map(),handlers=new Map();
   const el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,addEventListener(type,fn){this[type]=fn;}});return elements.get(id);};
   vm.runInNewContext(script,{document:{getElementById:el},localStorage:{getItem:()=>token},location:{search:'?program='+MOU_MEDIA_PROGRAM.slice(8)},URLSearchParams,window:{M4L_LESSON_MEDIA:{programId:MOU_MEDIA_PROGRAM.slice(8),reset(){calls.push('reset');},open(options){calls.push(options);},canLeave:()=>false},addEventListener:(type,fn)=>handlers.set(type,fn)},fetch:(url,options)=>f.call(url,JSON.parse(options.body),token).then(r=>({ok:r.status===200,json:async()=>r.body}))});
   await settle();assert.equal(calls.some(c=>c?.hostId==='program-lesson-media'),allowed,who+' Program authority');
   const before=calls.length;el('program-media-refresh').click();await settle();assert.equal(calls.length,before,'Unfinished media entry blocks refresh');
   handlers.get('m4l-academy-session-ended')();assert.match(el('program-media-message').textContent,/account changed/);assert.equal(calls.at(-1),'reset');
  }
  const calls=[],handlers=new Map(),elements=new Map();let resolve,token='original';
  const el=id=>{if(!elements.has(id))elements.set(id,{addEventListener(){}});return elements.get(id);};
  vm.runInNewContext(script,{document:{getElementById:el},localStorage:{getItem:()=>token},location:{search:'?program='+MOU_MEDIA_PROGRAM.slice(8)},URLSearchParams,window:{M4L_LESSON_MEDIA:{programId:MOU_MEDIA_PROGRAM.slice(8),reset(){},open(){calls.push('open');}},addEventListener:(type,fn)=>handlers.set(type,fn)},fetch:()=>new Promise(r=>{resolve=r;})});
  token='replacement';handlers.get('m4l-academy-session-ended')();resolve({ok:true,json:async()=>({success:true,store:'D1',programs:[{id:MOU_MEDIA_PROGRAM.slice(8)}]})});await settle();assert.deepEqual(calls,[]);
 }finally{f.db.close();}
});
