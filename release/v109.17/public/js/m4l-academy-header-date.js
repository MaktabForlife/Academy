(() => {
 'use strict';
 const hijri=document.getElementById('academy-hijri-date'),gregorian=document.getElementById('academy-gregorian-date');if(!hijri||!gregorian)return;
 const zone='Africa/Johannesburg',unavailable='Hijri date unavailable',retryMs=60000,freshMs=900000;
 let shownDay='',resolvedDay='',nextAttempt=0,pending=false,timer;
 const day=()=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return parts.year+'-'+parts.month+'-'+parts.day;};
 const valid=(data,current)=>data?.gregorian===current&&typeof data.hijri==='string'&&data.hijri.trim().length>0&&data.hijri.length<=100&&data.hijri!==unavailable;
 function schedule(){
  clearTimeout(timer);
  const current=day();let delay=Math.max(1000,Date.parse(current+'T22:00:00Z')-Date.now()+1000);
  if(resolvedDay!==current&&!pending&&!document.hidden)delay=Math.min(delay,Math.max(1000,nextAttempt-Date.now()));
  timer=setTimeout(()=>{void refresh();},delay);
 }
 async function refresh(){
  const current=day();
  if(shownDay!==current){
   shownDay=current;resolvedDay='';nextAttempt=0;
   gregorian.dateTime=current;gregorian.textContent=new Intl.DateTimeFormat('en-GB',{timeZone:zone,day:'numeric',month:'long',year:'numeric'}).format(new Date());hijri.textContent=unavailable;
   // Today's last valid value remains visible even when its refresh is due.
   try{const cached=JSON.parse(sessionStorage.getItem('m4l_header_date')||'null');if(valid(cached,current)){hijri.textContent=cached.hijri;const age=Date.now()-cached.savedAt;if(age>=0&&age<freshMs)resolvedDay=current;}}catch{}
  }
  if(resolvedDay===current||pending||document.hidden||Date.now()<nextAttempt){schedule();return;}
  pending=true;schedule();
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  try{
   const response=await fetch((window.M4L_CONFIG?.API_BASE||'').replace(/\/$/,'')+'/api/academy/header-date',{signal:controller.signal});const data=await response.json();
   // A response from yesterday must never replace the new day's display.
   if(shownDay===current&&day()===current&&response.ok&&valid(data,current)){
    hijri.textContent=data.hijri;resolvedDay=current;
    try{sessionStorage.setItem('m4l_header_date',JSON.stringify({...data,savedAt:Date.now()}));}catch{}
   }
  }catch{/* Retain today's valid date; an unavailable lookup retries below. */}
  finally{clearTimeout(timeout);pending=false;if(shownDay===current)nextAttempt=Date.now()+retryMs;schedule();}
 }
 void refresh();window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
 window.addEventListener('online',()=>{nextAttempt=0;void refresh();});
})();
