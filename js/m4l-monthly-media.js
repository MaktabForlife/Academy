(() => {
 'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),token=()=>localStorage.getItem('m4l_account_token')||'';
 let owner=token(),generation=0,programs=[],lessons=[],before=null,busy=false;
 const label=value=>new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T12:00:00Z'));
 async function api(action,input={}){
  const stamp=generation,response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/academy/monthly-media/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+owner,'X-Academy-Workspace':'LEARN'},cache:'no-store',body:JSON.stringify(input)}),result=await response.json();
  if(stamp!==generation||owner!==token())throw Error('Your account changed. Reopen Paid months.');
  if(!response.ok||!result.success)throw Object.assign(Error(result.error||'Could not load your paid months.'),{status:response.status});return result;
 }
 function clear(){lessons=[];before=null;$('monthly-lessons').replaceChildren();$('monthly-more').hidden=true;window.M4L_LESSON_MEDIA.reset();}
 function controls(){for(const id of ['monthly-program','monthly-month','monthly-refresh','monthly-more'])$(id).disabled=busy;}
 function render(){
  $('monthly-lessons').innerHTML=lessons.map(row=>`<article><h2>${esc(row.title)}</h2><time datetime="${esc(row.date)}">${esc(row.date)}</time><p>${esc(row.className)}</p><p>${esc(row.summary)}</p>${row.assets.map(a=>`<button type="button" data-monthly-lesson="${esc(row.id)}" data-monthly-asset="${esc(a.id)}"${a.expired?' disabled':''}>${a.kind==='PDF'?'PDF':'Recording'} · ${esc(a.name||a.filename)}${a.expired?' · Unavailable':''}</button>`).join('')||'<p>Media has not been added yet.</p>'}</article>`).join('');
  $('monthly-more').hidden=!before;
 }
 async function load(more=false){
  if(busy)return;if(!window.M4L_LESSON_MEDIA.canLeave())return;
  const stamp=++generation;if(!more)clear();busy=true;controls();$('monthly-message').textContent='Checking your month access…';
  try{const result=await api('list',{activityKey:$('monthly-program').value,month:$('monthly-month').value,...(more?{before}:{})});if(stamp!==generation)return;lessons=more?[...lessons,...result.lessons]:result.lessons;before=result.before;render();$('monthly-message').textContent=lessons.length?'Your paid months remain available when you stop renewing.':'No published media has been added for this month yet.';}
  catch(error){if(stamp===generation){clear();$('monthly-message').textContent=error.message;}}
  finally{if(stamp===generation){busy=false;controls();}}
 }
 function months(){const p=programs.find(p=>p.activityKey===$('monthly-program').value);$('monthly-month').innerHTML=(p?.months||[]).slice().sort().reverse().map(m=>`<option value="${esc(m)}">${esc(label(m))}</option>`).join('');}
 async function start(){
  clear();if(!owner){$('monthly-message').textContent='Sign in to your Academy account to open the months you paid for.';return;}
  const stamp=++generation;
  try{const result=await api('months');if(stamp!==generation)return;programs=result.programs;$('monthly-program').innerHTML=programs.map(p=>`<option value="${esc(p.activityKey)}">${esc(p.name)}</option>`).join('');const requested=new URLSearchParams(location.search).get('program');if(programs.some(p=>p.activityKey===requested))$('monthly-program').value=requested;months();if(programs.length)await load();else $('monthly-message').textContent='No paid months are recorded on this account yet.';}
  catch(error){if(stamp===generation)$('monthly-message').textContent=error.message;}
 }
 $('monthly-program').onchange=()=>{months();void load();};$('monthly-month').onchange=()=>void load();$('monthly-refresh').onclick=()=>void start();$('monthly-more').onclick=()=>void load(true);
 $('monthly-lessons').onclick=event=>{const button=event.target.closest('[data-monthly-lesson]');if(!button)return;const lesson=lessons.find(r=>r.id===button.dataset.monthlyLesson),asset=lesson?.assets.find(a=>a.id===button.dataset.monthlyAsset);if(asset)window.M4L_LESSON_MEDIA.openAttachment({hostId:'monthly-attachment',lesson:{...lesson,assets:[asset]},kind:asset.kind});};
 const changed=()=>{generation++;owner=token();busy=false;programs=[];$('monthly-program').replaceChildren();$('monthly-month').replaceChildren();clear();controls();void start();};window.addEventListener('m4l-academy-session',changed);window.addEventListener('m4l-academy-session-ended',changed);window.addEventListener('storage',e=>{if(e.key==='m4l_account_token'||e.key===null)changed();});window.addEventListener('pagehide',clear);void start();
})();
