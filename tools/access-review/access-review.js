// Local review host for the existing native access editor. Its catalogue must
// come from checked native metadata at integration, never inferred from titles.
(()=>{'use strict';
 const areas={tafseer:{title:'Tafseer and Tadabbur',kind:'MONTHLY LEARNING',help:'Review paid months, original class and additional Surah websites.'},mothers:{title:'Mothers of the Ummah',kind:'MONTHLY LEARNING',help:'Review programme months and subject websites separately from live participation.'},courses:{title:'Courses',kind:'COURSE LEARNING',help:'Review course participation and purchases. Existing purchases remain when participation ends.'}};
 window.M4L_ACCESS_REVIEW={mount(offerings){
  if(!Array.isArray(offerings)||offerings.length>100||offerings.some(o=>!o||!areas[o.area]||typeof o.activityKey!=='string'||!/^((PROGRAM|COURSE):)[-A-Za-z0-9_:]{1,160}$/.test(o.activityKey)||!o.activityKey.startsWith(o.area==='courses'?'COURSE:':'PROGRAM:')||typeof o.title!=='string'||!o.title.trim()||o.title.length>200)||new Set(offerings.map(o=>o.activityKey)).size!==offerings.length)throw Error('Access choices could not be checked.');
  const $=id=>document.getElementById(id),host=$('access-panel'),picker=$('access-offering'),remember=new Map(),requested=new URLSearchParams(location.search).get('area');let area=areas[requested]?requested:'tafseer',selected='',generation=0,closed=false;
  const tell=text=>{$('access-page-status').textContent=text;};
  const canLeave=()=>{if(window.M4L_STUDIO_ACCESS.canLeave())return true;tell('Save or discard the current changes before choosing another learning area or course.');return false;};
  async function choose(nextArea,nextKey){
   if(closed||!areas[nextArea]||!canLeave())return false;
   const choices=offerings.filter(o=>o.area===nextArea),option=choices.find(o=>o.activityKey===nextKey)||choices.find(o=>o.activityKey===remember.get(nextArea))||choices[0];
   area=nextArea;selected=option?.activityKey||'';if(selected)remember.set(area,selected);const ticket=++generation;
   for(const button of document.querySelectorAll('button[data-area]'))button.setAttribute('aria-pressed',String(button.dataset.area===area));
   $('access-area-title').textContent=areas[area].title;$('access-area-kind').textContent=areas[area].kind;$('access-area-help').textContent=areas[area].help;
   picker.replaceChildren();for(const choice of choices){const node=document.createElement('option');node.value=choice.activityKey;node.textContent=choice.title;node.selected=choice===option;picker.append(node);}
   $('access-offering-label').firstChild.textContent=area==='courses'?'Choose a course':'Programme';$('access-offering-label').hidden=area!=='courses'&&choices.length<2;
   tell('');host.replaceChildren();host.dataset.area=area;
   if(!option){tell('No learning areas are available here with your current access.');return true;}
   const panel=window.M4L_STUDIO_ACCESS.attach(host,selected);await panel?.loading;
   if(ticket!==generation||closed)return true;
   host.dataset.kind=panel?.data?.kind||'';
   if(panel?.data?.legacyOnly)tell('Open this programme’s existing Participants page to manage its access.');
   return true;
  }
  const buttons=[...document.querySelectorAll('button[data-area]')];for(const button of buttons)button.onclick=()=>choose(button.dataset.area);
  picker.onchange=async()=>{const next=picker.value;if(!await choose(area,next))picker.value=selected;};
  const owner=localStorage.getItem('m4l_account_token')||'';
  const accountChanged=()=>{closed=true;generation++;host.replaceChildren();picker.replaceChildren();offerings=[];remember.clear();for(const button of buttons)button.disabled=true;tell('Your account changed. Reopen Access management to check the current account.');};
  const storageChanged=event=>{if(event.key==='m4l_account_token'||event.key===null)accountChanged();};
  const checkOwner=()=>{if(owner!==(localStorage.getItem('m4l_account_token')||''))accountChanged();};
  window.addEventListener('storage',storageChanged);window.addEventListener('pageshow',checkOwner);window.addEventListener('focus',checkOwner);document.addEventListener('visibilitychange',checkOwner);
  return {ready:choose(area),choose,destroy(){accountChanged();window.removeEventListener('storage',storageChanged);window.removeEventListener('pageshow',checkOwner);window.removeEventListener('focus',checkOwner);document.removeEventListener('visibilitychange',checkOwner);}};
 }};
})();
