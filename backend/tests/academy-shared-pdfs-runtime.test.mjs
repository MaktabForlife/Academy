import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('Workers streaming hashes verify reused PDFs against actual R2 storage',async()=>{
 const source=new URL('../src/academy/d1/lesson-pdf-storage.js',import.meta.url).pathname;
 const bundle=await build({stdin:{contents:`import {storeLessonPdf} from ${JSON.stringify(source)};export default{async fetch(r,e){try{return Response.json({key:await storeLessonPdf(r,e.PDFS,'local/',JSON.parse(new URL(r.url).searchParams.get('metadata')))});}catch(error){return Response.json({error:error.message},{status:error.status||500});}}};`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false});
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-28',r2Buckets:{PDFS:'shared-pdf-local'}}));
 try{
  const bytes=Buffer.from('%PDF-1.4\n% runtime shared file\n%%EOF'),input={size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},url='https://local.test/?metadata='+encodeURIComponent(JSON.stringify(input));
  const first=await runtime.dispatchFetch(url,{method:'POST',body:bytes});assert.equal(first.status,200);const {key}=await first.json();
  const second=await runtime.dispatchFetch(url,{method:'POST',body:bytes});assert.equal(second.status,200);assert.equal((await second.json()).key,key);
  const bucket=await runtime.getR2Bucket('PDFS');assert.equal((await bucket.list()).objects.length,1);const version=(await bucket.head(key)).version;
  const forged=Buffer.from(bytes);forged[15]^=1;const denied=await runtime.dispatchFetch(url,{method:'POST',body:forged});assert.equal(denied.status,400);assert.equal((await bucket.head(key)).version,version);assert.deepEqual(Buffer.from(await (await bucket.get(key)).arrayBuffer()),bytes);
 }finally{await runtime.dispose();}
});
