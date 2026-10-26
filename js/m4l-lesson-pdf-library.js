/* Select a public PDF, then use the existing guarded lesson upload. */
(() => {
 'use strict';
 const limit=16*1024*1024,states=new WeakMap(),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const current=(form,state)=>form.isConnected&&states.get(form)===state;
 function controls(label='PDF file'){
  return `<label>PDF source<select name="pdfSource" data-lesson-pdf-source><option value="UPLOAD">Upload a PDF</option><option value="LIBRARY">Public Library</option></select></label><div data-lesson-pdf-upload><label>${esc(label)} <span class="lm-inline-help">Up to 16 MB</span><input type="file" name="file" accept="application/pdf,.pdf" required></label></div><section data-lesson-pdf-library hidden><label>Search Public Library<input type="search" name="librarySearch" placeholder="Find a PDF or volume…" data-lesson-library-search></label><label>Library PDF<select name="libraryPdf" data-lesson-library-choice><option value="">Choose a PDF…</option></select></label><p data-lesson-library-status class="lm-inline-help" role="status" aria-live="polite"></p><button type="button" class="button secondary small" data-lesson-library-reload>Reload Public Library</button></section>`;
 }
 function listedUrl(value){
  if(typeof value!=='string'||value.length>4096)return false;
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return false;return u.hostname==='archive.org'&&u.pathname.startsWith('/download/')&&!u.search&&!u.hash;}catch{return false;}
 }
 function choices(snapshot){
  const records=new Map((snapshot.data?.records||[]).map(r=>[r.id,r])),rows=[];
  for(const book of snapshot.data?.books||[]){
   const record=records.get(book.id),type=book.resourceType||'EBOOK';if(!['EBOOK','PRINTABLE'].includes(type))continue;
   const title=record?.title||book.title||'Public Library PDF',subject=record?.subject||book.subject||'';
   for(const [index,volume]of (book.volumes?.length?book.volumes:[book]).entries())if(listedUrl(volume.pdfUrl))rows.push({id:String(rows.length),url:volume.pdfUrl,label:title+(book.volumes?.length?' · '+(volume.label||'Volume '+(volume.number||index+1)):''),search:[title,subject,volume.label].filter(Boolean).join(' ').toLocaleLowerCase()});
  }
  return rows.sort((a,b)=>a.label.localeCompare(b.label));
 }
 function render(form,state){
  if(!current(form,state))return;const query=form.querySelector('[name=librarySearch]').value.trim().toLocaleLowerCase(),matches=state.rows.filter(row=>row.search.includes(query)),select=form.querySelector('[name=libraryPdf]'),selected=select.value;
  select.innerHTML='<option value="">Choose a PDF…</option>'+matches.slice(0,100).map(row=>`<option value="${row.id}">${esc(row.label)}</option>`).join('');if(matches.slice(0,100).some(r=>r.id===selected))select.value=selected;else if(selected){state.download?.controller.abort();state.download=null;}
  form.querySelector('[data-lesson-library-status]').textContent=state.loading?'Loading Public Library…':matches.length?(matches.length>100?'Showing 100 PDFs. Search to narrow the list.':matches.length+' PDF'+(matches.length===1?'':'s')+' available.')+' Up to 16 MB per attachment.':state.message||'No matching public PDFs.';
  select.disabled=state.loading;form.querySelector('[data-lesson-library-reload]').disabled=state.loading;
 }
 async function load(form,force=false){
  let state=states.get(form);if(!state){state={rows:[],loading:false,download:null};states.set(form,state);}if(state.loading)return;
  if(state.loaded&&!force){render(form,state);return;}state.loading=true;render(form,state);
  try{const snapshot=await window.M4L_LIBRARY_CACHE.publicList(force);if(!current(form,state))return;state.download?.controller.abort();state.download=null;form.querySelector('[name=libraryPdf]').value='';state.rows=choices(snapshot);state.message=snapshot.message||'';state.loaded=true;}
  catch{if(current(form,state))state.message='Public Library could not load. Select Reload Public Library to try again.';}
  finally{if(current(form,state)){state.loading=false;render(form,state);}}
 }
 function source(form){
  const library=form.querySelector('[name=pdfSource]').value==='LIBRARY',file=form.querySelector('[name=file]');form.querySelector('[data-lesson-pdf-upload]').hidden=library;form.querySelector('[data-lesson-pdf-library]').hidden=!library;file.required=!library;
  if(library)void load(form);else{const state=states.get(form);state?.download?.controller.abort();if(state)state.download=null;}
 }
 async function file(form,valid=()=>true){
  if(form.querySelector('[name=pdfSource]')?.value!=='LIBRARY')return form.querySelector('[name=file]')?.files[0];
  const state=states.get(form),row=state?.rows.find(r=>r.id===form.querySelector('[name=libraryPdf]').value);if(!row)throw Error('Choose a PDF from Public Library.');
  if(state.download?.url===row.url)return state.download.promise;
  state.download?.controller.abort();const controller=new AbortController(),download={url:row.url,controller};
  download.promise=(async()=>{
   const timer=setTimeout(()=>controller.abort(),45000),button=form.querySelector('button[type=submit]');if(button)button.disabled=true;
   try{
    const bytes=new TextEncoder().encode(row.url),encoded=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
    const response=await fetch('/pdf-file/'+encoded,{credentials:'omit',redirect:'error',signal:controller.signal});if(!response.ok)throw Error('This Library PDF could not be loaded. Try again.');
    if(Number(response.headers.get('Content-Length'))>limit){await response.body?.cancel();throw Error('This Library PDF exceeds the 16 MB attachment limit.');}
    if(!response.body)throw Error('The selected Library item did not return a PDF.');
    const reader=response.body.getReader(),chunks=[];let size=0;const selected=()=>current(form,state)&&valid()&&form.querySelector('[name=libraryPdf]').value===row.id&&form.querySelector('[name=pdfSource]').value==='LIBRARY';
    try{while(true){if(!selected())throw new DOMException('The lesson changed.','AbortError');const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('This Library PDF exceeds the 16 MB attachment limit.');chunks.push(value);}}
    catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
    const blob=new Blob(chunks,{type:'application/pdf'});if(new TextDecoder().decode(await blob.slice(0,5).arrayBuffer())!=='%PDF-')throw Error('The selected Library item did not return a PDF.');
    if(!selected())throw new DOMException('The lesson changed.','AbortError');
    const name=form.querySelector('[name=name]');if(name&&!name.value.trim())name.value=row.label.slice(0,180);
    return new File([blob],row.label.replace(/[\x00-\x1f\\/:*?"<>|]/g,'_').slice(0,150)+'.pdf',{type:'application/pdf'});
   }finally{clearTimeout(timer);if(form.isConnected&&button)button.disabled=false;}
  })().catch(error=>{if(state.download===download)state.download=null;throw error;});state.download=download;return download.promise;
 }
 function cancel(root){for(const node of root?.querySelectorAll('[data-lesson-pdf-source]')||[])states.get(node.closest('form'))?.download?.controller.abort();}
 document.addEventListener('reset',event=>{const form=event.target;if(!form.matches?.('form')||!form.querySelector('[data-lesson-pdf-source]'))return;const state=states.get(form);state?.download?.controller.abort();if(state)state.download=null;queueMicrotask(()=>{if(form.isConnected)source(form);});});
 document.addEventListener('change',event=>{const form=event.target.closest?.('form');if(!form)return;if(event.target.matches('[data-lesson-pdf-source]'))source(form);if(event.target.matches('[data-lesson-library-choice]')){states.get(form)?.download?.controller.abort();if(states.get(form))states.get(form).download=null;}});
 document.addEventListener('input',event=>{if(event.target.matches?.('[data-lesson-library-search]')){const form=event.target.closest('form'),state=states.get(form);if(state)render(form,state);}});
 document.addEventListener('click',event=>{if(event.target.closest?.('[data-lesson-library-reload]')){event.preventDefault();void load(event.target.closest('form'),true);}});
 window.M4L_LESSON_PDF_LIBRARY={controls,file,cancel};
})();
