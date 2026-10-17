import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../../js/m4l-hifz-handoff.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../academy/hifz/index.html',import.meta.url),'utf8');
function fixture({token='synthetic-academy-session',state='s'.repeat(43),response={success:true,code:'c'.repeat(43)},ok=true}={}){
 const events={calls:0},status={textContent:''};
 const location={search:'?'+new URLSearchParams({state,challenge:'p'.repeat(43),login:'CURRENTID'}),replace:value=>{events.redirect=value;}};
 const context=vm.createContext({URL,URLSearchParams,Error,location,history:{replaceState(a,b,path){events.clean=path;}},document:{getElementById:()=>status},localStorage:{getItem:()=>token},window:{M4L_CONFIG:{API_BASE:'https://api.test',HIFZHELPER_URL:'https://hifz.test/'}},fetch:async(url,options)=>{events.calls++;events.request={url,...options};return {ok,json:async()=>response};}});
 return {run:()=>vm.runInContext(script,context),events,status};
}
test('Academy bridge uses its own session and a fixed return address',async()=>{const f=fixture();await f.run();assert.equal(f.events.clean,'/academy/hifz/');assert.equal(f.events.calls,1);assert.equal(f.events.request.url,'https://api.test/api/academy/hifz/sign-in');assert.equal(f.events.request.headers.Authorization,'Bearer synthetic-academy-session');assert.deepEqual(JSON.parse(f.events.request.body),{codeChallenge:'p'.repeat(43),expectedLoginId:'CURRENTID'});const result=new URL(f.events.redirect);assert.equal(result.origin,'https://hifz.test');assert.equal(result.pathname,'/academy');assert.equal(result.search,'');assert.equal(new URLSearchParams(result.hash.slice(1)).get('state'),'s'.repeat(43));assert(!result.href.includes('synthetic-academy-session'));assert.match(html,/Return to Academy/);assert.match(html,/name="referrer" content="no-referrer"/);});
test('missing session and invalid browser state cannot issue passes',async()=>{for(const changes of [{token:''},{state:'bad'}]){const f=fixture(changes);await f.run();assert.equal(f.events.calls,0);assert.equal(f.events.redirect,undefined);assert(f.status.textContent);}});
test('revoked session or malformed issuer response shows recovery without redirecting',async()=>{for(const changes of [{ok:false,response:{success:false,error:'Your Academy session has ended.'}},{response:{success:true,code:'bad'}}]){const f=fixture(changes);await f.run();assert.equal(f.events.redirect,undefined);assert(f.status.textContent);}});
