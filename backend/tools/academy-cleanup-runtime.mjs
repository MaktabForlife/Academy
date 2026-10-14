// Bounded acceptance against an already seeded LOCAL Wrangler feature runtime.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const [origin,seedArg,outputArg]=process.argv.slice(2),url=new URL(origin),seed=resolve(seedArg),output=resolve(outputArg);
if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.origin!==origin)throw Error('LOCAL_RUNTIME_REQUIRED');
const access=JSON.parse(readFileSync(join(seed,'preview-access.json'),'utf8')),checks=[];
async function post(path,input={},token=''){const r=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input),signal:AbortSignal.timeout(15000)});return {status:r.status,body:await r.json()};}
let r=await post('/api/account/login',{uniqueid:access.login,pin:access.pin});assert.equal(r.status,200,r.body.error);const token=r.body.token;checks.push('Existing synthetic credentials sign in');
for(const path of ['/api/account/session','/api/admin/platform/user-profiles/get','/api/admin/platform/programs/list','/api/admin/platform/global/get','/api/academy/timetable']){r=await post(path,{},token);assert.equal(r.status,200,r.body.error);checks.push(path);}
const id='EXTERNAL:INTERNET_ARCHIVE:local-cleanup-'+crypto.randomUUID();r=await post('/api/academy/open-library/metadata/save',{id,title:'Local runtime book',resourceType:'EBOOK',baseRevision:0,learningAreaRefs:[]},token);assert.equal(r.status,200,r.body.error);assert.equal(r.body.record.revision,1);checks.push('Real Durable Object metadata RPC save');
const pub=await fetch(origin+'/api/academy/open-library/metadata/public');assert.equal(pub.status,200);assert((await pub.json()).records.some(x=>x.id===id));checks.push('Real Durable Object metadata RPC read');
r=await post('/api/admin/platform/program-library/upload-start',{},token);assert.equal(r.status,403);checks.push('Private upload remains unavailable');
const result={success:true,runtime:'LOCAL_WRANGLER_D1_DURABLE_OBJECT',checks,liveDatabaseAccessed:false};writeFileSync(join(output,'local-runtime-acceptance.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
