const allowedScopes=new Set(['COURSE:COURSE-d32a823f-37b0-46b6-a91a-48daf0b9ec38','PROGRAM:PRG-d44af7d0-fd9e-4c08-977d-7d4d9c23c9de']);
const allowedActions=new Set(['handover-start','handover-reconcile','handover-page','handover-commit','handover-status','handover-abort']);
export function mountHandover({document,window,storage=window.localStorage,fetcher=window.fetch.bind(window),random=()=>window.crypto.randomUUID(),apiBase=window.M4L_CONFIG?.API_BASE||''}){
 const offering=document.getElementById('offering'),transfer=document.getElementById('transfer'),result=document.getElementById('result'),buttons=[...document.querySelectorAll('button')];
 const token=()=>storage.getItem('m4l_account_token')||'';let owner=token(),busy=false,epoch=0;
 const changed=()=>{if(owner===token())return false;owner=token();epoch++;transfer.value='';result.textContent='Your account changed. Choose the offering and transfer reference again.';return true;};
 for(const event of ['storage','pageshow','focus'])window.addEventListener(event,changed);
 document.getElementById('new-reference').addEventListener('click',()=>{if(busy||changed())return;transfer.value=random();result.textContent='Reference prepared. No handover has started.';});
 offering.addEventListener('change',()=>{transfer.value='';result.textContent='Offering changed. Enter its existing reference or create a new one.';});
 const run=async action=>{
  if(busy||changed())return;const bearer=token(),activityKey=offering.value,transferId=transfer.value.trim();
  if(!bearer){result.textContent='Sign in to Academy as a Global Admin first.';return;}
  if(!allowedActions.has(action)||!allowedScopes.has(activityKey)||!transferId||transferId.length>180){result.textContent='Choose a mapped offering and a transfer reference.';return;}
  const current=epoch;busy=true;buttons.forEach(b=>b.disabled=true);offering.disabled=true;transfer.disabled=true;result.textContent='Confirming this step…';
  try{
   const response=await fetcher(apiBase+'/api/admin/platform/studio-access',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+bearer,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify({activityKey,command:{action,transferId}})});
   const data=await response.json();if(changed()||current!==epoch)return;
   if(!response.ok||!data.success){result.textContent=(data.error||'The step could not be confirmed.')+(data.code?' ['+data.code+']':'')+'\nKeep this reference. Check status or retry this same step when ready.';return;}
   const summary={offering:offering.selectedOptions?.[0]?.textContent||activityKey,step:action,transferId,state:data.state,phase:data.handover?.phase||data.phase,authority:data.authority,replayed:data.replayed,recovered:data.recovered,more:data.more,checked:data.checked??data.handover?.checked};
   if(data.reconciliation)summary.reconciliation={dataset:data.reconciliation.dataset,records:data.reconciliation.records,done:data.reconciliation.done};
   result.textContent=JSON.stringify(summary,null,2);
  }catch{if(!changed()&&current===epoch)result.textContent='The result is uncertain. Keep this reference and check status or retry the same step. Access remains locked if the handover has started.';}
  finally{busy=false;buttons.forEach(b=>b.disabled=false);offering.disabled=false;transfer.disabled=false;}
 };
 for(const button of document.querySelectorAll('[data-action]'))button.addEventListener('click',()=>run(button.dataset.action));
 return {run};
}
if(typeof document!=='undefined')mountHandover({document,window});
