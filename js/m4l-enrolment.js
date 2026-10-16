(()=>{'use strict';
 const {token,esc,api,whatsapp,ownerKey}=window.M4L_ENROLMENT,$=id=>document.getElementById(id);
 let data=null,profile=null,busy=false,received=false,pending=null,storageKey='',epoch=0;
 const say=(message,error=false)=>{$('enrolment-message').textContent=message;$('enrolment-message').style.color=error?'#8b2639':'';};
 const selected=()=>Array.from($('enrolment-catalogue').querySelectorAll('input:checked')).map(n=>data.entries.find(e=>e.id===n.value)).filter(Boolean);
 function updateWhatsApp(){
  const rows=selected(),lines=['Assalamu alaikum. I would like to send payment advice to the Academy.','Learner: '+$('enrolment-name').value.trim(),...(profile?.uniqueId?['Login ID: '+profile.uniqueId]:[]),...($('enrolment-whatsapp').value?['WhatsApp: '+$('enrolment-whatsapp').value]:[]),...rows.map(e=>e.name+' · '+e.year)];
  $('enrolment-pop').href=whatsapp(data?.whatsappNumber,lines.join('\n').slice(0,1800));
 }
 function controls(){for(const n of $('enrolment-form').querySelectorAll('input'))n.disabled=busy||received||Boolean(pending);$('enrolment-submit').disabled=busy||received||!data?.entries.length;$('enrolment-submit').textContent=busy?'Sending…':pending?'Retry same request':'Send request';$('enrolment-discard').hidden=!pending||busy;}
 function draw(ids=[]){
  $('enrolment-catalogue').innerHTML=['PROGRAM','COURSE'].map(kind=>{const rows=data.entries.filter(e=>e.kind===kind);return rows.length?`<h3>${kind==='PROGRAM'?'Programs':'Courses'}</h3><div class="enrolment-options">${rows.map(e=>`<label class="enrolment-option"><input type="checkbox" value="${esc(e.id)}"${ids.includes(e.id)?' checked':''}><span><strong>${esc(e.name)}</strong><small>Enrolment year: ${esc(e.year)}</small><small>${esc(e.cost)}</small></span></label>`).join('')}</div>`:'';}).join('')||'<p>No entries are open for enrolment at present. Please contact the Academy on WhatsApp.</p>';
  $('enrolment-form').hidden=false;updateWhatsApp();controls();
 }
 async function load(){
  const generation=++epoch,session=token();busy=true;received=false;pending=null;profile=null;say('Loading the enrolment catalogue…');$('enrolment-retry').hidden=true;
  try{
   data=await api('/api/academy/enrolment/catalogue');if(generation!==epoch||session!==token())return;
   storageKey=await ownerKey();let saved;try{saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
   if(session){profile=await api('/api/academy/enrolment/profile',{},true);if(generation!==epoch||session!==token())return;$('enrolment-title').textContent='Open for Enrolment';$('enrolment-name').value=profile.name;$('enrolment-whatsapp').value=profile.whatsapp;$('enrolment-identity').textContent='Login ID: '+profile.uniqueId;$('enrolment-identity').hidden=false;}
   else{$('enrolment-title').textContent='Join the Academy';$('enrolment-identity').hidden=true;}
   if(saved?.operationId&&Array.isArray(saved.entries)){pending=saved;$('enrolment-name').value=saved.name;$('enrolment-whatsapp').value=saved.whatsapp;$('enrolment-paid').checked=saved.paid;}
   busy=false;draw(pending?.entries.map(e=>e.id)||[]);say(pending?'Your previous request needs confirmation. Retry the same request or discard it.':'');
  }catch(error){if(generation===epoch){busy=false;say(error.message,true);$('enrolment-retry').hidden=false;$('enrolment-form').hidden=true;}}
 }
 $('enrolment-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||received||!data)return;
  if(!pending){const rows=selected();if(!rows.length){say('Choose at least one Program or Course.',true);return;}pending={operationId:crypto.randomUUID(),name:$('enrolment-name').value.trim(),whatsapp:$('enrolment-whatsapp').value.trim(),paid:$('enrolment-paid').checked,entries:rows.map(e=>({id:e.id,revision:e.revision})),website:$('enrolment-website').value};try{sessionStorage.setItem(storageKey,JSON.stringify(pending));}catch{}}
  busy=true;controls();const generation=epoch;
  try{await api('/api/academy/enrolment/submit',pending,Boolean(token()));if(generation!==epoch)return;received=true;pending=null;try{sessionStorage.removeItem(storageKey);}catch{}say('Your request has been sent. Admin will contact you to arrange registration and enrolment. You can send payment advice separately in WhatsApp.');}
  catch(error){if(generation!==epoch)return;if(error.status&&error.status<500&&error.status!==429){pending=null;try{sessionStorage.removeItem(storageKey);}catch{}}say(error.message,true);if(error.code==='CATALOGUE_CHANGED')$('enrolment-retry').hidden=false;}
  finally{if(generation===epoch){busy=false;controls();}}
 });
 $('enrolment-discard').addEventListener('click',()=>{pending=null;try{sessionStorage.removeItem(storageKey);}catch{}controls();say('Pending request discarded. You can edit the form.');});
 $('enrolment-form').addEventListener('input',updateWhatsApp);$('enrolment-form').addEventListener('change',updateWhatsApp);$('enrolment-retry').addEventListener('click',()=>void load());
 let session=token();const changed=()=>{if(session===token())return;session=token();epoch++;pending=null;received=false;profile=null;data=null;$('enrolment-form').hidden=true;$('enrolment-name').value='';$('enrolment-whatsapp').value='';$('enrolment-paid').checked=false;void load();};
 window.addEventListener('m4l-academy-session',changed);window.addEventListener('focus',changed);window.addEventListener('storage',e=>{if(e.key==='m4l_account_token')changed();});void load();
})();
