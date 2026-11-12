// Public feature bootstrap. Production builds without explicit feature config
// are unchanged. Never enable through a query string or a request Host header.
(()=>{
 const config=window.M4L_V110_CONFIG;if(config?.enabled!==true||window.M4L_V110)return;
 const publicAcademy=config.app==='academy'&&location.origin===config.origins?.academy;
 if(config.localProfile==='msi-local-triple-v1'&&config.app!=='academy'&&window.M4L_V110_LOCAL_CHILD_PREPAINT_READY!==true)throw Error('CHILD_PREPAINT_REQUIRED');
 const root=document.documentElement;root.classList.add('uaa-v110-masked');root.dataset.uaaV110State='masked';
 const style=document.createElement('style');
 style.textContent='html.uaa-v110-masked body>*{visibility:hidden!important}html.uaa-v110-masked [data-uaa-public-gate],html.uaa-v110-masked [data-uaa-public-gate] *{visibility:visible!important}[data-uaa-public-gate]{position:fixed;inset:15vh 8vw auto;z-index:2147483647;padding:28px;background:#faf7f2;color:#463640;border:1px solid #cdbdc5;border-radius:16px;font:16px/1.6 Arial,sans-serif;text-align:center}html:not(.uaa-v110-masked) [data-uaa-public-gate]{display:none}';
 if(publicAcademy)style.textContent+='html.uaa-v110-masked #academy-login-dialog[data-uaa-public-auth],html.uaa-v110-masked #academy-login-dialog[data-uaa-public-auth] *{visibility:visible!important}';
 document.head.append(style);
 if(config.localProfile==='msi-local-triple-v1'&&config.nativeChild===true)root.hidden=false;
 const mount=()=>{
  if(document.querySelector('[data-uaa-public-gate]'))return;
  const panel=document.createElement('section');panel.setAttribute('data-uaa-public-gate','');panel.setAttribute('role','status');
  const text=document.createElement('p');text.setAttribute('data-uaa-gate-message','');text.textContent='Checking the current Academy sign-in before showing private information.';
  const label=document.createElement('p');label.textContent=config.nativeChild===true?'Academy sign-in':'JWT V110 feature preview';
  const retry=document.createElement('button');retry.type='button';retry.textContent='Check again';retry.onclick=()=>location.reload();
  const academy=document.createElement('a');academy.textContent='Open Academy';academy.href=config.origins.academy+(publicAcademy?'/academy/?signin=1#login':'/academy/#login');
  panel.append(label,text,retry,document.createTextNode(' '),academy);
  if(config.localProfile==='msi-local-triple-v1'&&config.nativeChild===true&&window.M4L_V110_CHILD_ADMISSION){
   const connect=document.createElement('button');connect.type='button';connect.textContent='Connect with Academy';
   connect.onclick=event=>{connect.disabled=true;window.M4L_V110_CHILD_ADMISSION.begin(event).catch(error=>{
    text.textContent=error.message==='CHILD_ADMISSION_USE_OWN_PIN'?'This app already has a sign-in. Check again or confirm your Academy PIN for this app.':error.message==='CHILD_ADMISSION_OUTCOME_UNCONFIRMED'?'The result could not be confirmed. Check again before starting another connection.':'The connection was not completed. Check your Academy sign-in before starting again.';
   }).finally(()=>{connect.disabled=false;});};
   panel.append(document.createTextNode(' '),connect);
  }
  if(config.localProfile==='msi-local-triple-v1'&&config.nativeChild===true&&window.M4L_V110_CHILD_PIN){
   const unlock=document.createElement('button');unlock.type='button';unlock.textContent='Confirm Academy PIN for this app';
   unlock.onclick=event=>{unlock.disabled=true;window.M4L_V110_CHILD_PIN.begin(event).catch(()=>{text.textContent='PIN confirmation was not completed. Start again when you are ready.';}).finally(()=>{unlock.disabled=false;});};
   panel.append(document.createTextNode(' '),unlock);
  }
  if(publicAcademy){
   const signIn=document.createElement('button');signIn.type='button';signIn.textContent='Sign in at Academy';signIn.setAttribute('data-uaa-open-sign-in','');
   signIn.onclick=()=>{
    const dialog=document.getElementById('academy-login-dialog'),form=document.getElementById('login-preview');
    if(dialog?.tagName==='DIALOG'&&form&&dialog.contains(form)&&typeof window.M4L_ACADEMY_LOGIN?.openPublicSignIn==='function'){
     dialog.setAttribute('data-uaa-public-auth','');window.M4L_ACADEMY_LOGIN.openPublicSignIn();
    }else location.assign(config.origins.academy+'/academy/?signin=1#login');
   };
   panel.append(document.createTextNode(' '),signIn);
  }
  document.body.append(panel);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
 const nativeFetch=window.fetch.bind(window);let installed;
 const starting=import('/auth/v110/browser-entry.mjs').then(module=>{installed=module.installNativePrivacy({win:window,doc:document,config,nativeFetch});return installed;});
 window.fetch=(...args)=>starting.then(value=>value.fetch(...args));
 const call=(name,...args)=>starting.then(value=>value.runtime[name](...args));
 window.M4L_V110=Object.freeze({
  ready:()=>call('ready'),capture:()=>call('capture'),current:stamp=>call('current',stamp),
  reveal:accountId=>call('reveal',accountId),
  clear(reason){root.classList.add('uaa-v110-masked');return call('clear',reason);},
  clearAll(reason){root.classList.add('uaa-v110-masked');return call('clearAll',reason);},
  acceptOwnRefresh:(reply,started)=>call('acceptOwnRefresh',reply,started),
  beginMasterSignIn:()=>call('beginMasterSignIn'),completeMasterSignIn:(intent,reply)=>call('completeMasterSignIn',intent,reply)
 });
 starting.catch(()=>{root.dataset.uaaV110State='unverifiable';});
})();
