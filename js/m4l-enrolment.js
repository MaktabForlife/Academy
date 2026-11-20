(()=>{'use strict';
 const {token,esc,api,whatsapp,ownerKey,v2,auth,ready,prepare}=window.M4L_ENROLMENT,$=id=>document.getElementById(id);
 let client=null,privateRoot=null,initialising=v2();
 let data=null,profile=null,busy=false,received=false,pending=null,lastSent=null,storageKey='',epoch=0;
 const say=(message,error=false)=>{for(const id of ['enrolment-message','enrolment-submit-message']){$(id).textContent=message;$(id).style.color=error?'#8b2639':'';}};
 const selected=()=>Array.from($('enrolment-catalogue').querySelectorAll('input:checked')).map(n=>data.entries.find(e=>e.id===n.value)).filter(Boolean);
 function updateWhatsApp(){
  const rows=selected(),lines=['Assalaamu alaikum. I would like to request enrolment.','Learner: '+(profile?.name||''),'Login ID: '+(profile?.uniqueId||''),...rows.map(e=>e.name+' · '+e.year+' · '+e.cost),'Payment indicated: '+($('enrolment-paid').checked?'Yes':'No')];
  $('enrolment-whatsapp').href=whatsapp(data?.whatsappNumber,lines.join('\n'));
  $('enrolment-pop').href=whatsapp(data?.whatsappNumber,['Assalaamu alaikum. I would like to send payment advice.','Learner: '+(profile?.name||''),'Login ID: '+(profile?.uniqueId||''),...rows.map(e=>e.name+' · '+e.year)].join('\n'));
 }
 function controls(){for(const n of $('enrolment-form').querySelectorAll('input'))n.disabled=busy||received||Boolean(pending);$('enrolment-submit').disabled=busy||received||!data?.entries.length;$('enrolment-submit').textContent=busy?'Sending…':pending?(v2()?'Check original receipt':'Retry same request'):'Send request';$('enrolment-discard').hidden=!pending||busy;}
 function draw(ids=[]){
  $('enrolment-catalogue').innerHTML=['PROGRAM','COURSE'].map(kind=>{const rows=data.entries.filter(e=>e.kind===kind);return rows.length?`<h3>${kind==='PROGRAM'?'Programs':'Courses'}</h3><div class="enrolment-options">${rows.map(e=>`<label class="enrolment-option"><input type="checkbox" value="${esc(e.id)}"${ids.includes(e.id)?' checked':''}><span><strong>${esc(e.name)}</strong><small>Enrolment year: ${esc(e.year)}</small><small>${esc(e.cost)}</small></span></label>`).join('')}</div>`:'';}).join('')||'<p>No entries are open for enrolment at present. Please contact Admin.</p>';
  $('enrolment-form').hidden=false;updateWhatsApp();controls();
 }
 async function load(){
  if(v2()){client=await ready();privateRoot??=$('enrolment-form');if(!privateRoot.dataset.v111Registered){client.registerPrivateRoot(privateRoot);client.registerPrivateRoot($('enrolment-identity'));privateRoot.dataset.v111Registered='1';}}
  const generation=++epoch,session=token();busy=true;received=false;pending=null;lastSent=null;profile=null;$('enrolment-form').hidden=true;$('enrolment-guest').hidden=Boolean(session);$('enrolment-retry').hidden=true;say(session?'Loading the enrolment catalogue…':'');
  $('enrolment-title').textContent=session?'Enroll now':'Contact Admin to Join Academy';$('enrolment-introduction').textContent=session?'Choose the Programs and Courses you are interested in. Send your request here or contact Admin in WhatsApp. Your existing profile identifies you.':'Contact Admin to join the Academy. You can edit the prepared message in WhatsApp before sending it.';
  try{
   data=await api('/api/academy/enrolment/catalogue');if(generation!==epoch||session!==token())return;window.M4L_ACADEMY_JOIN.update(data.whatsappNumber);
   if(!session){busy=false;return;}
   profile=await api('/api/academy/enrolment/profile',{},true);if(generation!==epoch||session!==token())return;
   $('enrolment-identity').textContent=profile.name+' · Login ID: '+profile.uniqueId;
   storageKey=await ownerKey();let saved;try{saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
   if(v2()){
    if(saved?.schema===2&&typeof saved.operationId==='string')pending={operationId:saved.operationId,unknown:true};
   }else if(saved?.operationId&&Array.isArray(saved.entries)){pending=saved;$('enrolment-paid').checked=saved.paid;}
   busy=false;draw(pending?.entries?.map(e=>e.id)||[]);if(v2())client.revealResult(profile,{roots:[privateRoot,$('enrolment-identity')]});say(pending?(v2()?'Your original request needs receipt review. Checking will not send it again.':'Your previous request needs confirmation. Retry the same request or discard it.'):'');
  }catch(error){if(generation===epoch){busy=false;say(error.message,true);$('enrolment-retry').hidden=false;$('enrolment-form').hidden=true;}}
 }
 $('enrolment-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||received||!data||!profile||!token())return;
  if(v2()&&pending?.unknown){
   busy=true;controls();const generation=epoch;
   try{await prepare();const result=await api('/api/academy/enrolment/status',{operationId:pending.operationId},true);if(generation!==epoch)return;
    if(result.outcome==='RECEIVED'){pending=null;received=true;try{sessionStorage.removeItem(storageKey);}catch{}say('Your original request was received. Nothing was sent again.');}
    else say('No completed receipt is visible yet. Nothing was sent again. Check with Admin or explicitly discard this marker before making a new request.',true);
   }catch(error){if(generation===epoch)say(error.message,true);}finally{if(generation===epoch){busy=false;controls();}}return;
  }
  if(!pending){const rows=selected();if(!rows.length){say('Choose at least one Program or Course.',true);$('enrolment-submit-message').scrollIntoView({block:'center'});return;}const payload={paid:$('enrolment-paid').checked,entries:rows.map(e=>({id:e.id,revision:e.revision}))};pending={operationId:!v2()&&lastSent?.payload===JSON.stringify(payload)?lastSent.operationId:crypto.randomUUID(),...payload};try{sessionStorage.setItem(storageKey,JSON.stringify(v2()?{schema:2,operationId:pending.operationId,unknown:true}:pending));}catch{}}
  busy=true;say('Sending your request…');controls();const generation=epoch;
  try{if(v2())await prepare();if(generation!==epoch)return;await api('/api/academy/enrolment/submit',pending,true);if(generation!==epoch)return;const {operationId,...payload}=pending;lastSent={operationId,payload:JSON.stringify(payload)};received=true;pending=null;try{sessionStorage.removeItem(storageKey);}catch{}say('Your request has been sent. Admin will arrange enrolment manually.');$('enrolment-confirmation').returnValue='cancel';$('enrolment-confirmation').showModal();}
  catch(error){if(generation!==epoch)return;if(v2()){pending={operationId:pending.operationId,unknown:true};say('The result needs receipt review. Nothing will be sent again automatically.',true);}else if(error.status&&error.status<500&&error.status!==429){pending=null;try{sessionStorage.removeItem(storageKey);}catch{}}say(error.message+(v2()?' Check the original receipt before continuing.':''),true);if(error.code==='CATALOGUE_CHANGED')$('enrolment-retry').hidden=false;}
  finally{if(generation===epoch){busy=false;controls();}}
 });
 $('enrolment-confirmation').addEventListener('close',()=>{if(!received)return;if($('enrolment-confirmation').returnValue==='ok'){location.assign('/academy/#timetable/learn');return;}received=false;controls();say('Your request has been sent. You can edit your selections and resend if needed.');$('enrolment-submit').focus();});
 $('enrolment-discard').addEventListener('click',()=>{pending=null;try{sessionStorage.removeItem(storageKey);}catch{}controls();say(v2()?'Only the local uncertain marker was discarded. Nothing was resent. Review your selections before a deliberate new request.':'Pending request discarded. You can edit your selections.');});
 $('enrolment-whatsapp').addEventListener('click',event=>{if(!selected().length){event.preventDefault();say('Choose at least one Program or Course.',true);$('enrolment-submit-message').scrollIntoView({block:'center'});}});
 $('enrolment-form').addEventListener('change',updateWhatsApp);$('enrolment-retry').addEventListener('click',()=>void load());
 let session=token();const changed=()=>{if(initialising){session=token();return;}if(session===token())return;session=token();epoch++;pending=null;lastSent=null;received=false;profile=null;data=null;$('enrolment-confirmation').close();$('enrolment-form').hidden=true;$('enrolment-identity').textContent='';$('enrolment-catalogue').replaceChildren();$('enrolment-paid').checked=false;void load();};
 window.addEventListener('academy-v2-context',changed);window.addEventListener('academy-v2-revalidate',()=>{if(v2())void load();});
 window.addEventListener('m4l-academy-session',changed);window.addEventListener('focus',changed);window.addEventListener('storage',e=>{if(e.key==='m4l_account_token')changed();});if(v2())void ready().then(()=>{session=token();initialising=false;return load();}).catch(error=>say(error.message,true));else void load();
})();
