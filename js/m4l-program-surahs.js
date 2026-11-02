/* Manual completion dates are the authority for Tafseer surah websites. */
(() => {
 'use strict';
 let readOnly=false;
 const token=()=>localStorage.getItem('m4l_account_token')||'',esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let external=null,host=null,program='',owner='',generation=0,busy=false,data=null,pending=null;
 const cards=[['yaseen','Surah Yaseen'],['saffat','Surah As-Saffat'],['ankabut','Surah Al-Ankabut'],['luqman','Surah Luqman'],['muzammil','Surah Al-Muzzammil'],['foundations','Foundations of Tafseer'],['qasas','Surah Al-Qasas'],['sajdah','Surah As-Sajdah']];
 const cardOptions=key=>{const choices=data?.websiteCards?.map(c=>[c.id,c.title])||cards;return [['','Not linked yet'],...choices,...(key&&!choices.some(c=>c[0]===key)?[[key,key]]:[])].map(([id,label])=>'<option value="'+esc(id)+'"'+(id===(key||'')?' selected':'')+'>'+esc(label+(id==='foundations'?' · Open to all':''))+'</option>').join('');};
 const drafts=new Map();
 const message=(text,error=false)=>{const node=host?.querySelector('[data-surah-message]');if(node){node.textContent=text;node.setAttribute('role',error?'alert':'status');}};
 const dirty=()=>drafts.size>0||Boolean(pending)||busy;
 function canLeave(){if(dirty()){message('Save or discard the surah table changes before leaving.',true);return false;}return true;}
 async function api(action,input={}){
  const stamp=generation,current=owner;
  if(external){const result=await external.transport(action,input);if(stamp!==generation||current!==token())throw Error('Your account or programme changed. Reopen the Surah table.');return result;}
  const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/admin/platform/program-monthly-subscriptions/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+current,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify({activityKey:'PROGRAM:'+program,...input})}),result=await response.json();
  if(stamp!==generation||current!==token())throw Error('Your account or Program changed. Reopen Lesson media.');
  if(!response.ok||!result.success)throw Object.assign(Error(result.error||'Could not save the surah table. Your edits are kept.'),{status:response.status});
  return result;
 }
 function shell(){
  host=external?.host||document.getElementById('program-surahs');if(!host||host.dataset.ready)return;
  host.dataset.ready='true';host.classList.add('pms');if(external)host.classList.add('pms-access-surahs');
  host.addEventListener('input',edit);host.addEventListener('change',edit);
  host.addEventListener('click',async event=>{
   const link=event.target.closest('[data-surah-editor]');if(link&&(readOnly||!canLeave()||window.M4L_LESSON_MEDIA?.canLeave?.()===false)){event.preventDefault();return;}
   const button=event.target.closest('[data-surah-action]');if(!button||busy)return;
   const action=button.dataset.surahAction;
   if(action==='retry'){if(pending)await save();return;}if(pending)return;
   if(action==='add'){
    if(window.M4L_LESSON_MEDIA?.canLeave?.()===false)return;
    const id=crypto.randomUUID();drafts.set(id,{id,name:'',cardKey:'',completionDate:'',active:true,revision:0});renderRows();host.querySelector('[data-surah-row="'+id+'"] [data-surah-field="name"]')?.focus();return;
   }
   if(action==='remove'){drafts.delete(button.dataset.id);renderRows();return;}
   if(action==='discard'){drafts.clear();renderRows();message('Surah edits discarded.');return;}
   if(action==='refresh'){if(canLeave()&&window.M4L_LESSON_MEDIA?.canLeave?.()!==false)await load();return;}
   if(action==='save'){if(window.M4L_LESSON_MEDIA?.canLeave?.()===false)return;await save();}
  });
 }
 function controls(){for(const node of host?.querySelectorAll('button,input,select')||[])node.disabled=readOnly||busy||Boolean(pending&&node.dataset.surahAction!=='retry');}
 function render(){
  host.hidden=!data?.available;if(host.hidden){host.replaceChildren();return;}
  host.innerHTML='<h2>Surah websites</h2><p>Enter the surah name and completion date manually. This table determines website access. Changing a completion date changes which subscription month qualifies. Students with that month checked in Monthly subscriptions keep access to the published website.</p><p data-surah-message role="status" aria-live="polite"></p>'+
   (!data.prepared?'<p>Prepare Tafseer’s register in Participants → Monthly subscriptions before adding surahs.</p>':'<div class="pms-toolbar"><button type="button" data-surah-action="add">Add surah</button><button type="button" data-surah-action="save">Save table changes</button><button type="button" data-surah-action="discard">Discard edits</button><button type="button" data-surah-action="refresh">Refresh table</button></div><div class="pms-surah-scroll"><table class="pms-surah-table"><thead><tr><th scope="col">Surah</th><th scope="col">Website card</th><th scope="col">Completion date</th><th scope="col">Students eligible</th><th scope="col">Website</th></tr></thead><tbody data-surah-rows></tbody></table></div><p data-surah-delta aria-live="polite"></p><div data-surah-retry></div>');
  renderRows();controls();if(readOnly){host.querySelector('h2').textContent='Historical Academy Surah websites';host.querySelector('.pms-toolbar')?.remove();for(const link of host.querySelectorAll('[data-surah-editor]')){link.removeAttribute('href');link.setAttribute('aria-disabled','true');link.textContent='Historical website';}}if(external?.accessOnly){host.querySelector('[data-surah-action=add]')?.remove();for(const node of host.querySelectorAll('[data-surah-field=name]'))node.readOnly=true;}if(external){for(const row of host.querySelectorAll('tr')){for(const index of [1,3,4])if(row.children[index])row.children[index].hidden=true;}}
 }
 function renderRows(){
  const body=host?.querySelector('[data-surah-rows]');if(!body)return;
  const rows=new Map((data?.surahs||[]).map(row=>[row.id,row]));for(const [id,draft]of drafts)rows.set(id,{...rows.get(id),...draft});
  body.innerHTML=[...rows.values()].map(row=>'<tr data-surah-row="'+esc(row.id)+'"'+(drafts.has(row.id)?' class="pms-surah-edited"':'')+'><td><input data-surah-field="name" aria-label="Surah name" maxlength="160" value="'+esc(row.name)+'" placeholder="Enter surah name" required></td><td><select data-surah-field="cardKey" aria-label="Website card for '+esc(row.name||'new surah')+'">'+cardOptions(row.cardKey)+'</select></td><td><input data-surah-field="completionDate" type="date" aria-label="Completion date for '+esc(row.name||'new surah')+'" value="'+esc(row.completionDate)+'" required></td><td>'+(drafts.has(row.id)?'After saving':row.eligibleStudents)+'</td><td>'+(row.revision?'<a class="pb-secondary" data-surah-editor href="'+esc(row.editorUrl)+'">'+(row.hasDraft?'Edit website':'Build website')+'</a>':'<span>Save the row first</span> <button type="button" data-surah-action="remove" data-id="'+esc(row.id)+'">Remove</button>')+'</td></tr>').join('')||'<tr><td colspan="5">No surahs entered yet. Add a surah and its completion date.</td></tr>';
  if(external)for(const row of body.querySelectorAll('tr')){for(const index of [1,3,4])if(row.children[index])row.children[index].hidden=true;}
  if(external)for(const [id,draft]of drafts)if(!data.surahs.some(row=>row.id===id)){const button=body.querySelector('[data-surah-action=remove][data-id="'+id+'"]');if(button)body.querySelector('[data-surah-row="'+id+'"] td').append(button);}
  host.querySelector('[data-surah-delta]').textContent=drafts.size?drafts.size+' unsaved surah change(s)':'No unsaved table changes';controls();
 }
 function edit(event){
  const control=event.target;if(!control.matches('[data-surah-field]')||busy||pending)return;
  const id=control.closest('[data-surah-row]').dataset.surahRow,old=data.surahs.find(row=>row.id===id),entry={...(drafts.get(id)||old)};
  entry[control.dataset.surahField]=control.value;
  if(old&&entry.name===old.name&&(entry.cardKey||'')===(old.cardKey||'')&&entry.completionDate===old.completionDate)drafts.delete(id);else drafts.set(id,entry);
  control.closest('tr').classList.toggle('pms-surah-edited',drafts.has(id));control.closest('tr').children[3].textContent=drafts.has(id)?'After saving':old.eligibleStudents;
  host.querySelector('[data-surah-delta]').textContent=drafts.size?drafts.size+' unsaved surah change(s)':'No unsaved table changes';
 }
 async function load(){
  const stamp=generation;busy=true;controls();
  try{data=await api('surahs');if(stamp!==generation)return;render();}
  catch(error){if(stamp===generation){host.hidden=false;if(!host.querySelector('[data-surah-message]'))host.innerHTML='<h2>Surah websites</h2><p data-surah-message role="alert"></p><button type="button" data-surah-action="refresh">Try again</button>';message(error.message,true);}}
  finally{if(stamp===generation){busy=false;controls();}}
 }
 async function save(){
  if(!pending&&!drafts.size){message('No table changes to save.');return;}
  if(!pending){
   const entries=[...drafts.values()].map(row=>({id:row.id,name:row.name.trim(),cardKey:row.cardKey||'',completionDate:row.completionDate,active:row.active,revision:row.revision}));
   if(entries.some(row=>!row.name||!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(row.completionDate))){message('Enter a surah name and completion date for every changed row.',true);return;}
   pending={entries,policyRevision:data.policyRevision,operationId:crypto.randomUUID()};
  }
  const stamp=generation;busy=true;controls();message('Saving surah table…');
  try{await api('surah-save',pending);if(stamp!==generation)return;pending=null;drafts.clear();await load();message('Surah table saved. Access uses these completion dates.');}
  catch(error){if(stamp!==generation)return;if(error.status&&error.status<500)pending=null;message(error.message,true);if(pending)host.querySelector('[data-surah-retry]').innerHTML='<button type="button" data-surah-action="retry">Retry this table save</button>';}
  finally{if(stamp===generation){busy=false;controls();}}
 }
 async function select(id,{readOnly:historical=false}={}){shell();if(!host)return;if(program===id&&owner===token()&&data&&readOnly===historical)return;reset();readOnly=historical;program=id;owner=token();await load();}
 function reset(){readOnly=false;generation++;program='';owner='';data=null;drafts.clear();pending=null;busy=false;if(host){host.hidden=true;host.replaceChildren();}}
 async function mount(container,id,options){if(!canLeave())return false;unmount();const section=document.createElement('section');container.append(section);external={...options,host:section};await select(id);return true;}
 function unmount(){reset();if(external)host?.remove();external=null;host=null;}
 window.M4L_PROGRAM_SURAHS={mount,unmount,select,canLeave,dirty,reset};
 window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
 window.addEventListener('m4l-academy-session',reset);window.addEventListener('m4l-academy-session-ended',reset);window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)reset();});
})();
