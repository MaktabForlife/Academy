import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('the delivery helper sends and acknowledges a request in the actual Workers runtime',async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'academy-hifz-runtime-'));
 const helper=new URL('../src/academy/d1/hifz-profile-sync.js',import.meta.url).pathname;
 const bundle=await build({stdin:{contents:`import {deliverHifzProfiles} from ${JSON.stringify(helper)};
 export default{async fetch(){let acknowledged=false;
 const db={prepare(sql){return {bind(){return {all:async()=>({results:[{account_id:'synthetic-account',revision:1,pin_reset_version:0,attempts:0,display_name:'Synthetic learner',login_link_id:'SyntheticLogin',whatsapp_number:'',role:'student',active:1}]}),run:async()=>{acknowledged=sql.includes('SET delivered_revision=');}};}};}};
 const result=await deliverHifzProfiles({ACADEMY_DB:db,HIFZ_PROFILE_SYNC_URL:'https://hifz.test/internal/academy/profile-sync',HIFZ_PROFILE_SYNC_TARGET:'test',HIFZ_PROFILE_SYNC_SECRET:'synthetic-runtime-signing-key-123456789'});
 return Response.json({result,acknowledged});}}`,resolveDir:temporary},bundle:true,format:'esm',platform:'browser',write:false});
 let calls=0;
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-07-17',outboundService:async request=>{
  calls++;assert.equal(request.url,'https://hifz.test/internal/academy/profile-sync');
  const packet=await request.json();assert.equal(packet.profiles[0].loginId,'SyntheticLogin');
  assert.match(request.headers.get('X-Academy-Sync-Signature'),/^[0-9a-f]{64}$/);
  return Response.json({accepted:1});
 }}));
 try{
  const response=await runtime.dispatchFetch('https://academy.test/');assert.equal(response.status,200);
  const body=await response.json();assert.equal(calls,1);assert.equal(body.result.delivered,1);assert.equal(body.acknowledged,true);
 }finally{await runtime.dispose();await rm(temporary,{recursive:true,force:true});}
});
