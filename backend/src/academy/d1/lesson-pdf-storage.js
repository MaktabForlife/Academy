import {managementError as fail} from './management-store.js';

// Existing schemas require a unique object_key per attachment/version. Keep
// that identity as a reference and resolve its shared bytes only after access.
export const lessonPdfReference=(namespace,id,sha256)=>(namespace||'')+'lesson-pdf-refs/'+id+'/'+sha256+'.pdf';
export function lessonPdfObjectKey(reference){
 const shared=String(reference).match(/^(.*)lesson-pdf-refs\/(?:NOTE-)?[a-f0-9-]{36}\/([a-f0-9]{64})\.pdf$/);
 return shared?shared[1]+'lesson-pdfs/sha256/'+shared[2]+'.pdf':reference;
}

// File bytes are shared; lesson links, note versions and access remain separate.
// Never delete a shared object on a failed/replayed attachment operation.
export async function storeLessonPdf(request,storage,namespace,input){
 if(!storage?.head||!storage?.put)throw fail('Private PDF storage is unavailable.',503);
 if(!Number.isSafeInteger(input.size)||input.size<5||input.size>16*1024*1024||!/^[a-f0-9]{64}$/.test(input.sha256||''))throw fail('Choose a PDF up to 16 MB with its checksum.');
 const key=(namespace||'')+'lesson-pdfs/sha256/'+input.sha256+'.pdf',existing=await storage.head(key);
 await streamPdf(request,storage,key,input,Boolean(existing));
 if(existing&&existing.size!==input.size)throw fail('This PDF is temporarily unavailable.',503);
 return key;
}

async function streamPdf(request,storage,key,input,reuse){
 const reader=request.body?.getReader();if(!reader)throw fail('Choose a PDF.');
 const chunks=[];let bytes=0;
 while(bytes<5){const next=await reader.read();if(next.done)break;chunks.push(next.value);bytes+=next.value.length;if(bytes>input.size){await reader.cancel();throw fail('The file size changed.');}}
 const prefix=new Uint8Array(5);let offset=0;for(const chunk of chunks){const take=Math.min(5-offset,chunk.length);if(take>0)prefix.set(chunk.subarray(0,take),offset);offset+=take;}
 if(new TextDecoder().decode(prefix)!=='%PDF-'){await reader.cancel();throw fail('Choose a valid PDF file.');}
 const digest=new crypto.DigestStream('SHA-256'),hasher=digest.getWriter(),checksum=digest.digest.then(value=>[...new Uint8Array(value)].map(b=>b.toString(16).padStart(2,'0')).join(''),()=>null);
 const stream=typeof FixedLengthStream==='function'?new FixedLengthStream(input.size):new TransformStream(),writer=stream.writable.getWriter();
 // Hash the actual request even on a cache hit: knowing a checksum alone never
 // allows a caller to attach someone else's private file.
 const pump=(async()=>{let size=0;try{for(const chunk of chunks){size+=chunk.length;await hasher.write(chunk);await writer.write(chunk);}while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>input.size)throw fail('The file size changed.');await hasher.write(next.value);await writer.write(next.value);}if(size!==input.size)throw fail('The upload was interrupted.');await hasher.close();if(await checksum!==input.sha256)throw fail('The PDF checksum changed. Choose the file again.');await writer.close();}catch(e){await hasher.abort(e).catch(()=>{});await reader.cancel().catch(()=>{});await writer.abort(e).catch(()=>{});throw e;}})();
 const consume=(reuse?stream.readable.pipeTo(new WritableStream()):storage.put(key,stream.readable,{sha256:input.sha256,httpMetadata:{contentType:'application/pdf'}})).catch(async e=>{await writer.abort(e).catch(()=>{});await reader.cancel().catch(()=>{});throw e;});
 const results=await Promise.allSettled([pump,consume]),failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
}
