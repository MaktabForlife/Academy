(() => {'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],order=[1,2,3,4,5,6,0];
 const params=new URLSearchParams(location.search),teacherId=params.get('teacher')||'',programId=params.get('program')||'';
 let openEditor=params.get('edit')==='1';
 if(/^PRG-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(programId)){$('ta-return').href='/programs/timetable.html?program='+encodeURIComponent(programId);$('ta-return').textContent='Return to Program';}
 let data,ranges=[],editing=false,busy=false,pending=null;
 const message=(s,error=false)=>{$('ta-message').textContent=s;$('ta-message').classList.toggle('is-error',error);};
 async function api(action,body={}){const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/academy/teacher-availability/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(localStorage.getItem('m4l_account_token')||'')},body:JSON.stringify({...body,...(teacherId?{accountId:teacherId}:{})})});const r=await response.json();if(!response.ok||!r.success)throw Object.assign(Error(r.error||'Could not save. Your entries are kept.'),{status:response.status});return r;}
 function render(){
  $('ta-edit').disabled=busy||!data?.available||editing;$('ta-refresh').disabled=busy;
  $('ta-title').textContent=data?.teacherName?'Teaching availability · '+data.teacherName:'Teaching calendar';
  $('ta-form').hidden=!editing||!data?.available;$('ta-summary').hidden=editing||!data;
  $('ta-days').innerHTML=order.map(day=>`<details open><summary>${days[day]}</summary><div>${ranges.filter(r=>r.weekday===day).map(r=>`<div class="pw-line" data-range="${esc(r.id)}"><label>From<input value="${esc(r.startTime)}" data-field="startTime" inputmode="numeric" maxlength="8" aria-label="${days[day]} from"></label><label>To<input value="${esc(r.endTime)}" data-field="endTime" inputmode="numeric" maxlength="8" aria-label="${days[day]} to"></label><button type="button" class="pb-secondary" data-remove="${esc(r.id)}">Remove</button></div>`).join('')}<button type="button" class="pb-secondary" data-add="${day}">＋ Teaching hours</button></div></details>`).join('');
  $('ta-summary').innerHTML=order.map(day=>`<p><strong>${days[day]}</strong> · ${ranges.length?(ranges.filter(r=>r.weekday===day).map(r=>`${esc(r.startTime)}–${esc(r.endTime)}`).join(', ')||'Outside entered teaching hours'):'Available'}</p>`).join('');
  $('ta-notices').innerHTML=(data?.notices||[]).map(n=>`<p>${esc(n.teacher)} · ${esc(new Date(n.changedAt).toLocaleString())}</p>`).join('')||'<p>No availability changes.</p>';
  for(const input of $('ta-form').querySelectorAll('input,button'))input.disabled=busy;
 }
 async function load(){if(busy)return;busy=true;render();try{data=await api('get');ranges=structuredClone(data.ranges);editing=openEditor&&data.available;openEditor=false;pending=null;message(data.available?'Teaching hours apply across the Academy.':'Availability notices. An active teaching assignment is needed to edit teaching hours.');}catch(e){data=null;ranges=[];editing=false;message(e.message,true);}finally{busy=false;render();}}
 $('ta-edit').onclick=()=>{if(busy||!data?.available)return;editing=true;render();};$('ta-cancel').onclick=()=>{if(busy)return;ranges=structuredClone(data.ranges);editing=false;pending=null;render();};
 $('ta-refresh').onclick=()=>{if(editing&&!window.confirm('Discard unsaved availability and refresh?'))return;void load();};
 $('ta-days').onclick=e=>{if(busy)return;const add=e.target.closest('[data-add]'),remove=e.target.closest('[data-remove]');if(add){ranges.push({id:'AVAIL-'+crypto.randomUUID(),weekday:Number(add.dataset.add),startTime:'',endTime:''});pending=null;render();}if(remove){ranges=ranges.filter(r=>r.id!==remove.dataset.remove);pending=null;render();}};
 $('ta-days').oninput=e=>{const row=ranges.find(r=>r.id===e.target.closest('[data-range]')?.dataset.range);if(row&&e.target.dataset.field){row[e.target.dataset.field]=e.target.value;pending=null;}};
 $('ta-days').onchange=e=>{const row=ranges.find(r=>r.id===e.target.closest('[data-range]')?.dataset.range);if(row&&e.target.dataset.field){const value=window.M4L_TIME.parse(e.target.value);if(value){row[e.target.dataset.field]=value;e.target.value=value;}}};
 $('ta-form').onsubmit=async e=>{e.preventDefault();if(busy)return;const clean=ranges.map(r=>({...r,startTime:window.M4L_TIME.parse(r.startTime)||r.startTime,endTime:window.M4L_TIME.parse(r.endTime)||r.endTime}));if(clean.some(r=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.endTime)||r.startTime>=r.endTime)){message('Enter a valid start and later finish time for each range.',true);return;}pending||={revision:data.revision,ranges:clean,operationId:crypto.randomUUID()};busy=true;render();try{const result=await api('save',pending);data={...data,...result};ranges=structuredClone(result.ranges);editing=false;pending=null;message(`Availability saved. ${result.notified} administrator notices recorded.`);}catch(e){message(e.message,true);}finally{busy=false;render();}};
 window.addEventListener('beforeunload',e=>{if(editing&&JSON.stringify(ranges)!==JSON.stringify(data.ranges)){e.preventDefault();e.returnValue='';}});
 void load();
})();
