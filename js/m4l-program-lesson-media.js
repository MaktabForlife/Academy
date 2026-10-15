/* Reuse existing lesson media within an authorised Program management workspace. */
(() => {
 'use strict';
 if(window.M4L_PROGRAM_ADMIN_REDIRECT)return;
 const $=id=>document.getElementById(id),token=()=>localStorage.getItem('m4l_account_token')||'';
 const program=new URLSearchParams(location.search).get('program');
 let generation=0,loading=false;
 const valid=/^PRG-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 function clear(){generation++;loading=false;window.M4L_LESSON_MEDIA.reset();$('program-media-retry').hidden=true;}
 async function open(){
  clear();const current=token(),pending=generation;loading=true;
  if(!current||!valid.test(program||'')){$('program-media-message').textContent=!current?'Sign in with an authorised Academy admin account.':'Select a Program from Program List.';loading=false;return;}
  $('program-media-message').textContent='Loading lesson media…';
  try{
   const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/admin/platform/programs/list`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+current},body:'{}'}),result=await response.json();
   if(pending!==generation||current!==token())return;
   if(!response.ok||!result.success||result.store!=='D1')throw Error(result.error||'Program management is unavailable.');
   if(!result.programs?.some(row=>row.id===program))throw Error('This Program is outside your management access.');
   if(program!==window.M4L_LESSON_MEDIA.programId){$('program-media-message').textContent='Lesson media for this Program is coming soon.';return;}
   $('program-media-message').textContent='';window.M4L_LESSON_MEDIA.open({hostId:'program-lesson-media',programId:program});
  }catch(error){if(pending===generation&&current===token()){$('program-media-message').textContent=error.message;$('program-media-retry').hidden=false;}}
  finally{if(pending===generation)loading=false;}
 }
 const refresh=()=>{if(!loading&&window.M4L_LESSON_MEDIA.canLeave())void open();};
 $('program-media-refresh').addEventListener('click',refresh);$('program-media-retry').addEventListener('click',refresh);
 const sessionChanged=()=>{clear();$('program-media-message').textContent='Your Academy account changed. Open Lesson media again.';};
 window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)sessionChanged();});window.addEventListener('m4l-academy-session',sessionChanged);window.addEventListener('m4l-academy-session-ended',sessionChanged);
 window.addEventListener('pageshow',event=>{if(event.persisted)void open();});
 void open();
})();
