import test from 'node:test';
import assert from 'node:assert/strict';
import {returnToOpenDashboard} from '../../academy/website-platform/circles-return.mjs';

function fixture(){
 const sent=[],assigned=[],window=new EventTarget(),opener={closed:false,postMessage:(...value)=>sent.push(value)};
 Object.assign(window,{opener,crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789abc'},setTimeout:fn=>(window.expire=fn,1),clearTimeout(){},location:{assign:url=>assigned.push(url)},close(){window.closed=true;}});
 const context={mode:'learn',returnUrl:'https://website.test/?workspace=learn',websiteOrigin:'https://website.test',owner:'a'.repeat(64),expiresAt:Date.now()+60_000};
 const message=change=>{const e=new Event('message');Object.assign(e,{source:opener,origin:context.websiteOrigin,data:{type:'CIRCLES_DASHBOARD_RETURNED',requestId:sent[0]?.[0].requestId,mode:'learn'},...change});window.dispatchEvent(e);};
 return {window,opener,context,sent,assigned,message};
}
test('live opener return waits for its exact origin, window, request and mode acknowledgement; no network bootstrap',()=>{
 const f=fixture();assert.equal(returnToOpenDashboard(f),true);assert.equal(f.sent.length,1);assert.equal(f.sent[0][1],'https://website.test');
 f.message({origin:'https://outside.test'});f.message({source:{}});f.message({data:{type:'CIRCLES_DASHBOARD_RETURNED',requestId:'wrong',mode:'learn'}});f.message({data:{...f.sent[0][0],type:'CIRCLES_DASHBOARD_RETURNED',mode:'admin'}});assert(!f.window.closed);
 f.message();assert(f.window.closed);assert.deepEqual(f.assigned,[]);f.window.expire();assert.deepEqual(f.assigned,[]);
});
test('missing opener falls back to normal navigation, and unacknowledged or refused return retains the checked URL',()=>{
 const missing=fixture();missing.window.opener=null;assert.equal(returnToOpenDashboard(missing),false);assert.equal(missing.sent.length,0);
 const stale=fixture();stale.context.expiresAt=0;assert.equal(returnToOpenDashboard(stale),false);
 const f=fixture();returnToOpenDashboard(f);f.window.expire();assert.deepEqual(f.assigned,[f.context.returnUrl]);assert(!f.window.closed);
});
test('changed native account or return context cannot close the Library or restore the old destination',()=>{
 const f=fixture();let current=true;returnToOpenDashboard({...f,isCurrent:()=>current});current=false;f.message();f.window.expire();assert(!f.window.closed);assert.deepEqual(f.assigned,[]);
});
