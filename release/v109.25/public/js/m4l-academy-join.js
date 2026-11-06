(()=>{'use strict';
 const message='Assalaamu alaikum.\n\nI would like to enroll in the Academy.\n\nPlease contact me.';
 function update(number='27828478639'){
  const digits=String(number).replace(/\D/g,'');if(!/^[1-9][0-9]{6,14}$/.test(digits))return;
  for(const link of document.querySelectorAll('[data-academy-join]'))link.href='https://wa.me/'+digits+'?text='+encodeURIComponent(message);
  for(const link of document.querySelectorAll('[data-admin-phone]')){link.href='tel:+'+digits;link.textContent=digits==='27828478639'?'+27 82 847 8639':'+'+digits;}
 }
 async function refresh(){try{const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/academy/enrolment/catalogue',{cache:'no-store'}),body=await response.json();if(response.ok&&body.success)update(body.whatsappNumber);}catch{}}
 window.M4L_ACADEMY_JOIN={message,update};
 function init(){update();if(!document.getElementById('enrolment-form'))void refresh();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
