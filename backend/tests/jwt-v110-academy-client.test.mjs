import test from 'node:test';
import assert from 'node:assert/strict';
import {createDisplayMemory} from '../../auth/v110/browser-display-state.mjs';
import {installAcademyCookieTransport} from '../../auth/v110/academy-cookie-transport.mjs';
const origin='https://feature_worker.maktab4life.workers.dev';
const session=()=>({app:'academy',accountId:'synthetic-a',sessionId:'session-a',parentId:'session-a',browserId:'browser-a',browserGeneration:1,credentialEpoch:1,securityVersion:1,unlockGeneration:0,originalSignedAtMs:1000000,originalExpiresAtMs:605800000,lastForegroundRefreshMs:1000000,serverNowMs:1000000});
async function display(s=session()){
 let time=1000;const timers=[],clears=[];
 const cache=createDisplayMemory({app:'academy',clock:()=>time,setTimer:(fn,ms)=>{const item={fn,ms,cancelled:false};timers.push(item);return item;},cancelTimer:item=>item.cancelled=true,onClear:reason=>clears.push(reason),verifySession:async()=>({session:s,initialViews:[]})});
 assert(await cache.recheck());return {cache,timers,clears,advance:n=>time+=n,time:()=>time,s};
}
test('Same-session own foreground renewal updates the local clock without invalidating current data',async()=>{
 const f=await display(),epoch=f.cache.state().epoch;f.advance(60000);
 assert(f.cache.acceptOwnRefresh({...f.s,serverNowMs:f.s.serverNowMs+60000,lastForegroundRefreshMs:f.s.lastForegroundRefreshMs+60000},f.time()));
 assert.equal(f.cache.state().epoch,epoch);assert.equal(f.cache.state().remainingMs,5400000);f.cache.close();
});
test('Background renewal cannot extend the local privacy deadline',async()=>{
 const f=await display();f.advance(60000);const before=f.cache.state().remainingMs;
 assert(f.cache.acceptOwnRefresh({...f.s,serverNowMs:f.s.serverNowMs+60000},f.time()));
 assert.equal(f.cache.state().remainingMs,before);f.cache.close();
});
test('A dequeued old timer cannot replace the timer armed by own renewal',async()=>{
 const f=await display(),old=f.timers[0];f.advance(60000);
 assert(f.cache.acceptOwnRefresh({...f.s,serverNowMs:f.s.serverNowMs+60000,lastForegroundRefreshMs:f.s.lastForegroundRefreshMs+60000},f.time()));
 assert(old.cancelled);old.fn();assert.equal(f.timers.length,2);assert.equal(f.cache.state().phase,'ready');f.cache.close();
});
test('Own renewal cannot extend the original seven-day local deadline',async()=>{
 const s=session();s.serverNowMs=s.originalExpiresAtMs-60000;s.lastForegroundRefreshMs=s.serverNowMs-1000;
 const f=await display(s);f.advance(30000);assert(f.cache.acceptOwnRefresh({...s,serverNowMs:s.serverNowMs+30000,lastForegroundRefreshMs:s.serverNowMs+30000},f.time()));assert.equal(f.cache.state().remainingMs,30000);f.cache.close();
});
test('Changed JWT policy, unlock or browser generation clears the display instead of updating clocks',async t=>{
 for(const field of ['securityVersion','unlockGeneration','browserGeneration'])await t.test(field,async()=>{
  const f=await display();assert.equal(f.cache.acceptOwnRefresh({...f.s,[field]:2},f.time()),false);assert.equal(f.cache.state().phase,'masked');f.cache.close();
 });
});
test('Late own-renewal metadata cannot revive an elapsed local privacy deadline',async()=>{
 const f=await display();f.advance(5400001);assert.equal(f.cache.acceptOwnRefresh({...f.s,lastForegroundRefreshMs:f.s.serverNowMs+1000,serverNowMs:f.s.serverNowMs+1000},1000),false);assert.equal(f.cache.state().phase,'masked');f.cache.close();
});
function transport({hint='',ready=false,foreground=false,respond}={}){
 const calls=[],accepted=[],values=new Map([['m4l_account_token',hint]]);
 const win={location:{origin,href:origin+'/academy/'},localStorage:{getItem:k=>values.get(k)||null},navigator:{userActivation:{isActive:foreground}},M4L_V110:{acceptOwnRefresh:async(...args)=>{accepted.push(args);return true;}}};
 const doc={visibilityState:'visible',documentElement:{dataset:{uaaV110State:ready?'ready':'masked'}}};
 const nativeFetch=async(input,options={})=>{const r=new Request(input,options);calls.push({path:new URL(r.url).pathname,method:r.method,credentials:r.credentials,csrf:r.headers.get('X-UAA-CSRF')});return respond?respond(r):Response.json({});};
 const adapter=installAcademyCookieTransport({win,doc,config:{enabled:true,nativeCookie:true,app:'academy',origins:{academy:origin},apiOrigins:[origin]},nativeFetch,clock:()=>1000});
 return {adapter,calls,accepted};
}
test('Anonymous context does not add a speculative CSRF or refresh request',async()=>{
 const f=transport({respond:()=>Response.json({code:'V110_SESSION_REQUIRED'},{status:401})});
 assert.equal((await f.adapter.fetch(origin+'/auth/v110/context')).status,401);assert.equal(f.calls.length,1);
});
test('Native PIN rewrite retains HttpOnly transport and returns only a nonsecret UI selector',async()=>{
 const f=transport({respond:r=>{assert.equal(new URL(r.url).pathname,'/auth/v110/login');return Response.json({success:true,cookieSession:true,sessionKey:'uaa-session:session-a:0',csrf:'A'.repeat(43),accessExpiresAtMs:Date.now()+900000,browserContext:session()});}});
 const r=await f.adapter.fetch(origin+'/api/account/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uniqueid:'synthetic-a',pin:'2468'})}),body=await r.json();
 assert.equal(body.token,'uaa-session:session-a:0');assert.equal(body.browserContext.session.accountId,'synthetic-a');assert.equal(f.calls[0].credentials,'same-origin');
});
test('Concurrent required own queries share one renewal and use own CSRF without a Master hop',async()=>{
 const s=session();let renewals=0;
 const f=transport({hint:'uaa-session:session-a:0',ready:true,foreground:true,respond:async r=>{
  const path=new URL(r.url).pathname;
  if(path==='/auth/v110/login')return Response.json({cookieSession:true,sessionKey:'uaa-session:session-a:0',csrf:'A'.repeat(43),accessExpiresAtMs:Date.now()-1,browserContext:s});
  if(path==='/auth/v110/refresh'){renewals++;assert.equal((await r.json()).foreground,true);await new Promise(resolve=>setTimeout(resolve,5));return Response.json({refreshed:true,accessExpiresAtMs:Date.now()+900000,browserContext:{...s,serverNowMs:s.serverNowMs+1000,lastForegroundRefreshMs:s.lastForegroundRefreshMs+1000}});}
  assert.equal(r.headers.get('X-UAA-CSRF'),'A'.repeat(43));return Response.json({success:true});
 }});
 await f.adapter.fetch(origin+'/api/account/login',{method:'POST',body:'{}'});
 await Promise.all(['/api/account/session','/api/academy/lesson-media/list'].map(path=>f.adapter.fetch(origin+path,{method:'POST',body:'{}'})));
 assert.equal(renewals,1);assert.equal(f.accepted.length,1);assert.equal(f.calls.length,4);
});
