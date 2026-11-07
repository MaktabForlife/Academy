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

import {createHash} from 'node:crypto';
test('artifact redirect is credential-free and bounded, archive bytes match independently pinned hash',async()=>{
 const body=Buffer.from('SYNTHETIC_PUBLIC_ARCHIVE'),sha=createHash('sha256').update(body).digest('hex'),calls=[];
 const client=activationGitHub({token:'NEVER_FORWARD_CANARY',fetcher:async(url,options)=>{
  calls.push({url,options});
  if(url.includes('/actions/artifacts/1/zip'))return new Response(null,{status:302,headers:{location:'https://artifacts.example.blob.core.windows.net/object?synthetic=1','x-ratelimit-limit':'1000','x-ratelimit-remaining':'998'}});
  if(url.startsWith('https://api.github.com'))return Response.json({expired:false,digest:'sha256:'+sha},{headers:{'x-ratelimit-limit':'1000','x-ratelimit-remaining':'999'}});
  assert.equal(options.headers,undefined);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');return new Response(body);
 }});
 const r=await client.archive({id:1,zipSHA256:sha,maximumBytes:100});assert.deepEqual(r.bytes,body);assert.deepEqual([client.stats.restRequests,client.stats.signedArtifactGETs],[2,1]);assert.equal(calls.length,3);
});
for(const mode of ['destination','body','digest'])test('artifact '+mode+' failure cannot admit substituted or unbounded private bytes',async()=>{
 const sha=createHash('sha256').update('expected').digest('hex');let external=0;
 const c=activationGitHub({token:'SYNTHETIC',fetcher:async url=>{
  if(url.includes('/zip'))return new Response(null,{status:302,headers:{location:mode==='destination'?'https://attacker.invalid/object':'https://x.blob.core.windows.net/object','x-ratelimit-limit':'1000','x-ratelimit-remaining':'998'}});
  if(url.startsWith('https://api.github.com'))return Response.json({expired:false,digest:'sha256:'+sha},{headers:{'x-ratelimit-limit':'1000','x-ratelimit-remaining':'999'}});
  external++;return new Response('wrongbytes');
 }});
 await assert.rejects(c.archive({id:1,zipSHA256:sha,maximumBytes:mode==='body'?2:100}));assert.equal(external,mode==='destination'?0:1);
});
