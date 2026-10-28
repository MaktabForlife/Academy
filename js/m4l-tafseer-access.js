/* Attach authorised destinations to the website chat's Tafseer cards. */
(() => {
 'use strict';
 const token=()=>localStorage.getItem('m4l_account_token')||'';
 const workspace=()=>window.M4L_ACADEMY_WORKSPACE?.current?.()||'LEARN';
 const identity=()=>token()+'|'+workspace();
 let owner=identity(),generation=0,links={},loaded=false,pending=false;
 const safeHref=value=>typeof value==='string'&&(/^(?:\/academy\/course-websites\/(?:view\/)?\?program=[^&]+&surah=[0-9a-f-]{36}|\/programs\/\?program=[^&]+&tab=media)$/.test(value))?value:'';
 function apply(){
  if(identity()!==owner){reset();return;}
  if(window.M4L_TAFSEER_CARDS?.updateLinks){window.M4L_TAFSEER_CARDS.updateLinks(token()?links:{});return;}
  for(const action of document.querySelectorAll('[data-tafseer-card] [data-tafseer-link]')){
   const key=action.dataset.tafseerLink,value=links[key],href=token()?safeHref(typeof value==='string'?value:value?.href):'';
   if(action.tagName===(href?'A':'BUTTON')&&(href?action.getAttribute('href')===href:action.disabled))continue;
   const replacement=document.createElement(href?'a':'button');
   replacement.className=action.className;replacement.classList.toggle('tf-card-pending',!href);
   replacement.dataset.tafseerLink=key;
   replacement.innerHTML=action.innerHTML;
   const label=replacement.querySelector('span');if(label)label.textContent=href?value?.label||'Open lessons':'Coming soon';
   if(href)replacement.setAttribute('href',href);
   else{replacement.type='button';replacement.disabled=true;replacement.setAttribute('aria-disabled','true');}
   action.replaceWith(replacement);
  }
 }
 function setLinks(value){
  if(identity()!==owner)reset();
  generation++;pending=false;links=value&&typeof value==='object'?value:{};loaded=true;apply();
 }
 async function refresh(){
  if(identity()!==owner)reset();
  if(!token()||loaded||pending||!document.querySelector('[data-tafseer-card]'))return;
  const stamp=generation,current=owner;pending=true;
  try{
   const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/academy/tafseer-links',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token(),'X-Academy-Workspace':workspace()},body:'{}'}),data=await response.json();
   if(stamp!==generation||current!==identity())return;
   loaded=true;links=response.ok&&data.success?data.links||{}:{};apply();
  }catch{if(stamp===generation){loaded=true;links={};apply();}}
  finally{if(stamp===generation)pending=false;}
 }
 function reset(){generation++;owner=identity();links={};loaded=false;pending=false;window.M4L_TAFSEER_CARDS?.closeAccessPrompt?.();apply();}
 window.M4L_TAFSEER_ACCESS={setLinks,refresh,reset,links:()=>token()&&identity()===owner?links:{}};
 const update=()=>{apply();void refresh();};
 new MutationObserver(update).observe(document.body,{childList:true,subtree:true});
 for(const event of ['m4l-academy-session','m4l-academy-session-ended','hashchange'])window.addEventListener(event,()=>{reset();void refresh();});
 window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null){reset();void refresh();}});
 update();
})();
