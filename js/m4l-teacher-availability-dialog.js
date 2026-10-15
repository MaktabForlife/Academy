(() => {'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],order=[0,1,2,3,4,5,6];
 window.M4L_TEACHER_AVAILABILITY={mount({getData}){
  let editing=null,ranges=[],busy=false,pending=null,notices=[],generation=0;
  const dialog=$('pm-availability-dialog'),session=()=>localStorage.getItem('m4l_account_token')||'',accountSession=session();
  const dirty=()=>editing&&JSON.stringify(ranges)!==JSON.stringify(editing.ranges);
  const message=(text,error=false)=>{$('pa-message').textContent=text;$('pa-message').classList.toggle('is-error',error);};
  async function api(action,body={}){
   const token=session(),response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/academy/teacher-availability/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)}),result=await response.json();
   if(token!==session())throw Error('Your account changed. Reopen People to continue.');
   if(!response.ok||!result.success)throw Error(result.error||'The change could not be confirmed. Your entries are kept.');return result;
  }
  function controls(){for(const el of dialog.querySelectorAll('input,select,button'))el.disabled=busy;}
  function update(){
   const data=session()===accountSession?getData():null;if(!data){$('pa-rows').replaceChildren();return;}if(editing)return;
   const search=$('pa-search').value.trim().toLowerCase();
   $('pa-rows').innerHTML=data.teachers.filter(t=>t.name.toLowerCase().includes(search)).map(t=>{
    const entry=data.availability.find(a=>a.teacherId===t.id),hours=entry?.ranges||[];
    const exceptions=hours.some(r=>r.status==='AVAILABLE'||r.status==='UNAVAILABLE');
    const summary=exceptions?'Availability exceptions · open calendar':hours.length?order.map(day=>{const rows=hours.filter(r=>r.weekday===day);return rows.length?`<div><strong>${days[day].slice(0,3)}</strong> ${rows.map(r=>`${esc(r.startTime)}–${esc(r.endTime)}`).join(', ')}</div>`:'';}).join(''):'Available · no restrictions';
    return `<tr><th scope="row">${esc(t.name)}</th><td>${summary}</td><td><button type="button" class="pb-secondary" data-pa-edit="${esc(t.id)}" aria-label="Open availability calendar for ${esc(t.name)}">Open calendar</button></td></tr>`;
   }).join('')||'<tr><td colspan="3">No matching teachers.</td></tr>';
   $('pa-notices').innerHTML=notices.map(n=>`<p>${esc(n.teacher)} changed teaching availability · ${esc(new Date(n.changedAt).toLocaleString())}</p>`).join('');controls();
  }
  function renderEditor(){
   $('pa-list').hidden=Boolean(editing);$('pa-editor').hidden=!editing;if(!editing){update();return;}
   $('pa-teacher').textContent=editing.teacherName;
   $('pa-days').innerHTML=order.map(day=>`<section class="pa-day"><h4>${days[day]}</h4><div>${ranges.filter(r=>r.weekday===day).map(r=>`<div class="pa-range" data-pa-range="${esc(r.id)}"><label>From<input value="${esc(r.startTime)}" data-field="startTime" inputmode="numeric" maxlength="8" aria-label="${days[day]} from"></label><label>To<input value="${esc(r.endTime)}" data-field="endTime" inputmode="numeric" maxlength="8" aria-label="${days[day]} to"></label><button type="button" class="pb-secondary" data-pa-remove="${esc(r.id)}">Remove</button></div>`).join('')}<button type="button" class="pb-secondary" data-pa-add="${day}">＋ Teaching hours</button></div></section>`).join('');controls();
  }
  $('pm-availability-open').onclick=async()=>{
   if(busy)return;if(!session()||session()!==accountSession){clear();return;}dialog.showModal();if(editing){renderEditor();return;}message('');update();
   const current=++generation;try{const result=await api('get');if(current===generation){notices=result.notices||[];update();}}catch(error){if(current===generation)message(error.message,true);}
  };
  $('pa-close').onclick=()=>{generation++;dialog.close();};
  dialog.addEventListener('cancel',()=>{generation++;});
  $('pa-search').oninput=update;
  $('pa-rows').onclick=e=>{
   const accountId=e.target.closest('[data-pa-edit]')?.dataset.paEdit;if(!accountId||busy)return;
   const query=new URLSearchParams({teacher:accountId,edit:'1'}),program=new URLSearchParams(location.search).get('program');if(program)query.set('program',program);
   location.href='/academy/calendar/?'+query;
  };
  $('pa-days').onclick=e=>{if(busy)return;const add=e.target.closest('[data-pa-add]'),remove=e.target.closest('[data-pa-remove]');
   if(add){ranges.push({id:'AVAIL-'+crypto.randomUUID(),weekday:Number(add.dataset.paAdd),startTime:'',endTime:''});pending=null;renderEditor();}
   if(remove){ranges=ranges.filter(r=>r.id!==remove.dataset.paRemove);pending=null;renderEditor();}
  };
  $('pa-days').oninput=e=>{const row=ranges.find(r=>r.id===e.target.closest('[data-pa-range]')?.dataset.paRange);if(row&&e.target.dataset.field){row[e.target.dataset.field]=e.target.value;pending=null;}};
  $('pa-days').onchange=e=>{const row=ranges.find(r=>r.id===e.target.closest('[data-pa-range]')?.dataset.paRange),value=window.M4L_TIME.parse(e.target.value);if(row&&value){row[e.target.dataset.field]=value;e.target.value=value;}};
  $('pa-cancel').onclick=()=>{if(busy)return;if(dirty()&&!window.confirm('Discard unsaved teaching hours and return to teachers?'))return;editing=null;ranges=[];pending=null;message('');renderEditor();};
  $('pa-editor').onsubmit=async e=>{
   e.preventDefault();if(busy||!editing)return;
   const clean=ranges.map(r=>({...r,startTime:window.M4L_TIME.parse(r.startTime)||r.startTime,endTime:window.M4L_TIME.parse(r.endTime)||r.endTime}));
   if(clean.some(r=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.endTime)||r.startTime>=r.endTime)){message('Enter a valid start and later finish time for each range.',true);return;}
   pending||={accountId:editing.accountId,revision:editing.revision,ranges:clean,operationId:crypto.randomUUID()};busy=true;controls();
   try{const result=await api('save',pending),data=getData();if(data){data.availability=data.availability.filter(a=>a.teacherId!==result.accountId).concat({teacherId:result.accountId,ranges:result.ranges,revision:result.revision});}editing=null;pending=null;ranges=[];renderEditor();message(`Availability saved. ${result.notified} administrator notices recorded.`);}
   catch(error){message(error.message,true);}finally{busy=false;controls();}
  };
  function clear(){generation++;dialog.close();editing=null;pending=null;ranges=[];notices=[];$('pa-rows').replaceChildren();$('pa-days').replaceChildren();$('pa-notices').replaceChildren();message('');}
  window.addEventListener('storage',e=>{if(e.key==='m4l_account_token'||e.key===null)clear();});
  window.addEventListener('m4l-academy-session',clear);
  window.addEventListener('beforeunload',e=>{if(dirty()||pending||busy){e.preventDefault();e.returnValue='';}});
  return {update};
 }};
})();
