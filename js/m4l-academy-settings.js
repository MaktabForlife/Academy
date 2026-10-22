(() => {
 'use strict';
 let host=null,revision='',dirty=false,busy=false,pending=null,epoch=0;
 const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function api(action,input={}){const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/admin/platform/settings/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.getItem('m4l_account_token')},body:JSON.stringify(input)}),result=await response.json();if(!response.ok||!result.success)throw Object.assign(Error(result.error||'Settings are unavailable.'),{status:response.status});return result;}
 async function open(id){const run=++epoch;host=document.getElementById(id);if(!host)return;host.textContent='Loading app settings…';
  try{const data=await api('get');if(run!==epoch)return;revision=data.revision;dirty=false;pending=null;
   host.innerHTML=`<form class="as-form"><label>App time zone<input name="timezone" value="${esc(data.timezone)}" required maxlength="100"></label><p class="muted">This setting applies across the app. Existing published schedules keep their recorded times.</p><button class="button" type="submit">Save time zone</button><p role="status"></p></form>`;
   host.oninput=()=>{dirty=true;};host.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;const form=event.target,button=form.querySelector('button'),status=form.querySelector('[role=status]');button.disabled=true;
    pending??={timezone:form.elements.timezone.value,revision,operationId:crypto.randomUUID()};
    try{const saved=await api('save',pending);if(run!==epoch)return;revision=saved.revision;dirty=false;pending=null;status.textContent='App time zone saved.';}
    catch(error){if(error.status&&error.status<500)pending=null;if(run===epoch)status.textContent=error.message;}
    finally{busy=false;if(run===epoch){button.disabled=false;form.elements.timezone.disabled=Boolean(pending);button.textContent=pending?'Retry save':'Save time zone';}}
   };
  }catch(error){if(run===epoch)host.textContent=error.message;}
 }
 const canLeave=()=>!busy&&!pending&&(!dirty||confirm('Leave app settings and discard unsaved changes?'));
 const reset=()=>{epoch++;host=null;dirty=false;pending=null;};
 window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
 window.M4L_ACADEMY_SETTINGS={open,canLeave,reset};
})();
