import test from 'node:test';
import assert from 'node:assert/strict';
import {activationGitHub} from '../tools/jwt-feature-activation-github.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');globalThis.fetch=()=>{throw Error('HOSTED_FORBIDDEN');};
function fixture({remaining=1000,status=200,headers=true}={}){
 let calls=0;const fetcher=async()=>{calls++;return Response.json({}, {status,headers:headers?{'x-ratelimit-limit':'1000','x-ratelimit-remaining':String(remaining-calls)}:{}});};
 return {client:activationGitHub({token:'UNINSTALLED_GH_CANARY',fetcher}),get calls(){return calls;}};
}
test('quota is conservatively admitted from current headers, not an enterprise assumption/reservation',async()=>{
 const f=fixture();await f.client.probe();f.client.arm();for(let i=0;i<20;i++)await f.client.api('/repos/MaktabForlife/Academy/git/ref/heads/feature-preview');
 assert.equal(f.client.stats.restRequests,21);assert.equal(f.client.stats.armed,true);
});
for(const mode of ['low','missing','limited'])test('quota '+mode+' fails closed without wait/retry/new credentials',async()=>{
 const f=fixture(mode==='low'?{remaining:100}:mode==='missing'?{headers:false}:{status:429});
 if(mode==='low'){await f.client.probe();assert.throws(()=>f.client.arm());}else await assert.rejects(f.client.probe());
 const n=f.calls;await assert.rejects(f.client.api('/repos/MaktabForlife/Academy/git/ref/heads/feature-preview'));assert.equal(f.calls,n);assert.equal(f.client.stats.failed,true);
});
test('new external quota loss is latched even after admission',async()=>{
 let remaining=1000,calls=0;const c=activationGitHub({token:'SYNTHETIC',fetcher:async()=>{calls++;return Response.json({},{headers:{'x-ratelimit-limit':'1000','x-ratelimit-remaining':String(remaining--)}});}});
 await c.probe();c.arm();remaining=1;await assert.rejects(c.api('/repos/MaktabForlife/Academy/git/ref/heads/feature-preview'));const before=calls;await assert.rejects(c.api('/repos/MaktabForlife/Academy/git/ref/heads/feature-preview'));assert.equal(calls,before);
});
